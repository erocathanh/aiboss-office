#!/usr/bin/env python3
"""
bash_parser.py — Bộ phân tích cú pháp Bash dùng chung cho các hook của opc-business-harness.
Tuân thủ tiêu chuẩn POSIX / Bash cơ bản, hỗ trợ:
- Tách pipeline, compound commands (;, &&, ||, |, newline) an toàn, tôn trọng nháy và escape.
- Bóc tách command substitution $(...), `...` (chỉ ngoài nháy đơn).
- Bóc tách heredoc (<<EOF ... EOF, <<'EOF' ... EOF).
- Phân biệt toán tử chuyển hướng (>, >>, <) với chuỗi có nháy ('>', "<").
- Bóc tách wrappers: command (-p), env, sudo, \cmd, đường dẫn tuyệt đối /bin/cmd.
- Bóc tách control flow (then, do, else, elif) và subshell (cmd).
- Đệ quy phân tích sh/bash/zsh cờ gộp (-lc, -c, -ec), eval.
- Theo dõi cd (-P, -L, --) cập nhật working directory.
- Theo dõi ln -s (giải target tương đối từ dirname của link).
- Chuẩn hoá đường dẫn (expanduser, normpath, realpath).
- Trích xuất write targets cho các lệnh sửa/ghi file phổ biến.
- Báo lỗi cú pháp khi nháy chưa khép (fail-closed).
"""

import os
import sys
import re
import shlex
from typing import List, Tuple, Dict, Any, Optional

try:
    import layout
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import layout

class BashParseError(Exception):
    """Lỗi cú pháp hoặc unclosed quote cần fail-closed."""
    pass

class SimpleCommand:
    def __init__(self, raw_str: str, cwd: str):
        self.raw_str = raw_str.strip()
        self.cwd = cwd
        self.words: List[str] = []
        self.executable: str = ""
        self.raw_executable: str = ""
        self.redirections: List[Tuple[str, str]] = [] # list of (op, target) e.g. ('>', 'file.txt')
        self.env_vars: Dict[str, str] = {}
        self.parse()

    def parse(self):
        tokens, redirs = tokenize_command(self.raw_str)
        self.redirections = redirs

        # Bỏ qua các từ khoá điều khiển shell nếu đứng đầu (then, do, else, elif, if, fi)
        while tokens and tokens[0].lower() in ('then', 'do', 'else', 'elif', 'fi', 'done', 'time'):
            tokens = tokens[1:]

        # Lọc biến môi trường đầu lệnh: FOO=BAR cmd ...
        idx = 0
        while idx < len(tokens):
            tok = tokens[idx]
            if re.match(r'^[A-Za-z_][A-Za-z0-9_]*=.*$', tok) and not self.executable:
                if '=' in tok:
                    k, v = tok.split('=', 1)
                    self.env_vars[k] = v
                idx += 1
            else:
                break

        remaining_tokens = tokens[idx:]
        if not remaining_tokens:
            return

        # Bóc tách wrapper (command, env, sudo, exec, builtin, \)
        w_idx = 0
        while w_idx < len(remaining_tokens):
            w = remaining_tokens[w_idx]
            clean_w = w.lstrip('\\')
            base_w = os.path.basename(clean_w).lower()

            if base_w in ('builtin', 'exec'):
                w_idx += 1
                continue
            elif base_w == 'command':
                w_idx += 1
                # command hỗ trợ cờ -p, -v, -V
                while w_idx < len(remaining_tokens) and remaining_tokens[w_idx].startswith('-'):
                    w_idx += 1
                continue
            elif base_w == 'sudo':
                w_idx += 1
                while w_idx < len(remaining_tokens) and remaining_tokens[w_idx].startswith('-'):
                    w_idx += 1
                continue
            elif base_w == 'env':
                w_idx += 1
                while w_idx < len(remaining_tokens):
                    cur = remaining_tokens[w_idx]
                    if cur.startswith('-') or ('=' in cur and not cur.startswith('=')):
                        w_idx += 1
                    else:
                        break
                continue
            else:
                break

        self.words = remaining_tokens[w_idx:]
        if self.words:
            first = self.words[0].lstrip('\\')
            # Nếu bắt đầu bằng subshell ( ví dụ (rm -rf ...)
            if first.startswith('('):
                first = first.lstrip('(')
            self.raw_executable = first
            self.executable = os.path.basename(first).lower()

def tokenize_command(cmd_str: str) -> Tuple[List[str], List[Tuple[str, str]]]:
    """
    Tách các word tokens và toán tử chuyển hướng ngoài nháy.
    Đảm bảo:
    - '>' trong nháy đơn/kép là word token, không phải redirection.
    - > hoặc >> hoặc 1> ngoài nháy là redirection.
    - Nháy không khép sẽ raise BashParseError.
    """
    tokens: List[str] = []
    redirections: List[Tuple[str, str]] = []

    chars = list(cmd_str)
    length = len(chars)
    i = 0

    current_word = []
    in_single = False
    in_double = False
    escaped = False

    def flush_word():
        nonlocal current_word
        if current_word:
            tokens.append(''.join(current_word))
            current_word = []

    while i < length:
        ch = chars[i]

        if escaped:
            current_word.append(ch)
            escaped = False
            i += 1
            continue

        if ch == '\\' and not in_single:
            escaped = True
            i += 1
            continue

        if ch == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue

        if not in_single and not in_double:
            if ch.isspace():
                flush_word()
                i += 1
                continue

            # Kiểm tra redirection ngoài nháy: >, >>, <, 1>, 1>>, 2>, 2>>, 0<
            # Xét xem ký tự này có phải là bắt đầu toán tử redirection không
            is_redir = False
            op = ""
            step = 0

            if ch in ('>', '<'):
                if i + 1 < length and chars[i:i+2] == ['>', '>']:
                    op = '>>'
                    step = 2
                else:
                    op = ch
                    step = 1
                is_redir = True

            elif ch.isdigit() and i + 1 < length and chars[i+1] in ('>', '<'):
                # Ví dụ 1>, 2>, 0<, 1>>
                if i + 2 < length and chars[i+1:i+3] == ['>', '>']:
                    op = ch + '>>'
                    step = 3
                else:
                    op = ch + chars[i+1]
                    step = 2
                # Chỉ coi là file descriptor redirection nếu trước nó là khoảng trắng hoặc đầu dòng
                if not current_word:
                    is_redir = True

            if is_redir:
                flush_word()
                i += step
                # Đọc target của redirection (bỏ qua khoảng trắng)
                while i < length and chars[i].isspace():
                    i += 1

                target_chars = []
                t_in_single = False
                t_in_double = False
                t_escaped = False

                while i < length:
                    tch = chars[i]
                    if t_escaped:
                        target_chars.append(tch)
                        t_escaped = False
                        i += 1
                        continue
                    if tch == '\\' and not t_in_single:
                        t_escaped = True
                        i += 1
                        continue
                    if tch == "'" and not t_in_double:
                        t_in_single = not t_in_single
                        i += 1
                        continue
                    if tch == '"' and not t_in_single:
                        t_in_double = not t_in_double
                        i += 1
                        continue
                    if not t_in_single and not t_in_double:
                        if tch.isspace() or tch in (';', '&', '|', '>', '<'):
                            break
                    target_chars.append(tch)
                    i += 1

                target_str = ''.join(target_chars)
                if target_str:
                    redirections.append((op, target_str))
                continue

        current_word.append(ch)
        i += 1

    if in_single or in_double or escaped:
        raise BashParseError("Unclosed quote or trailing escape in command")

    flush_word()
    return tokens, redirections

def split_compound_commands(full_cmd: str) -> List[Tuple[str, Optional[str]]]:
    """
    Tách chuỗi lệnh bash thành các đơn vị lệnh đơn + toán tử liên kết.
    Hỗ trợ:
    - Quoting ', ", escape.
    - Heredoc <<EOF / <<'EOF'.
    - Bỏ qua command substitution trong nháy đơn.
    - Báo lỗi nếu nháy chưa đóng.
    """
    results: List[Tuple[str, Optional[str]]] = []

    lines = full_cmd.splitlines(keepends=True)
    current_cmd = []

    in_single = False
    in_double = False
    escaped = False
    subshell_depth = 0
    backtick = False

    heredoc_delim = None

    for line in lines:
        # Nếu đang trong heredoc body
        if heredoc_delim is not None:
            stripped = line.strip()
            if stripped == heredoc_delim:
                # Kết thúc heredoc
                heredoc_delim = None
            continue

        chars = list(line)
        length = len(chars)
        i = 0

        while i < length:
            ch = chars[i]

            if escaped:
                current_cmd.append(ch)
                escaped = False
                i += 1
                continue

            if ch == '\\' and not in_single:
                escaped = True
                current_cmd.append(ch)
                i += 1
                continue

            if ch == "'" and not in_double:
                in_single = not in_single
                current_cmd.append(ch)
                i += 1
                continue

            if ch == '"' and not in_single:
                in_double = not in_double
                current_cmd.append(ch)
                i += 1
                continue

            if not in_single and not in_double:
                # Comment
                if ch == '#' and (i == 0 or chars[i-1].isspace()):
                    break

                # Heredoc detection: <<EOF, <<'EOF', <<"EOF", <<-EOF
                if ch == '<' and i + 1 < length and chars[i+1] == '<':
                    # Đọc delimiter
                    hd_idx = i + 2
                    if hd_idx < length and chars[hd_idx] == '-':
                        hd_idx += 1
                    while hd_idx < length and chars[hd_idx].isspace():
                        hd_idx += 1
                    delim_chars = []
                    while hd_idx < length and not chars[hd_idx].isspace() and chars[hd_idx] not in (';', '&', '|'):
                        delim_chars.append(chars[hd_idx])
                        hd_idx += 1
                    raw_delim = ''.join(delim_chars).strip("'\"")
                    if raw_delim:
                        heredoc_delim = raw_delim
                    current_cmd.extend(chars[i:hd_idx])
                    i = hd_idx
                    continue

                # Command substitution $(...) ngoài nháy đơn
                if ch == '$' and i + 1 < length and chars[i+1] == '(':
                    subshell_depth += 1
                    current_cmd.append(ch)
                    current_cmd.append(chars[i+1])
                    i += 2
                    continue

                if ch == ')' and subshell_depth > 0:
                    subshell_depth -= 1
                    current_cmd.append(ch)
                    i += 1
                    continue

                # Backtick ngoài nháy đơn
                if ch == '`':
                    backtick = not backtick
                    current_cmd.append(ch)
                    i += 1
                    continue

                if subshell_depth > 0 or backtick:
                    current_cmd.append(ch)
                    i += 1
                    continue

                # Toán tử phân tách: &&, ||, ;, |, \n, &
                op = None
                if i + 1 < length and chars[i:i+2] in (['&', '&'], ['|', '|'], ['|', '&']):
                    op = ''.join(chars[i:i+2])
                    step = 2
                elif ch in (';', '|', '\n', '&'):
                    op = ch
                    step = 1

                if op is not None:
                    seg = ''.join(current_cmd).strip()
                    if seg:
                        results.append((seg, op))
                    current_cmd = []
                    i += step
                    continue

            current_cmd.append(ch)
            i += 1

    if in_single or in_double or escaped or backtick or subshell_depth > 0:
        raise BashParseError("Unclosed quote or syntax structure in command")

    remaining = ''.join(current_cmd).strip()
    if remaining:
        results.append((remaining, None))

    return results

def extract_substitutions_safe(cmd_str: str) -> List[str]:
    """
    Trích xuất command substitutions $(...) hoặc `...`
    CHỈ KHI CHÚNG NẰM NGOÀI NHÁY ĐƠN!
    """
    subs: List[str] = []
    chars = list(cmd_str)
    length = len(chars)
    i = 0

    in_single = False
    in_double = False
    escaped = False

    while i < length:
        ch = chars[i]
        if escaped:
            escaped = False
            i += 1
            continue
        if ch == '\\' and not in_single:
            escaped = True
            i += 1
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue

        if not in_single:
            # $(...)
            if ch == '$' and i + 1 < length and chars[i+1] == '(':
                depth = 1
                sub_chars = []
                j = i + 2
                s_single = False
                s_double = False
                s_esc = False
                while j < length:
                    c = chars[j]
                    if s_esc:
                        sub_chars.append(c)
                        s_esc = False
                        j += 1
                        continue
                    if c == '\\' and not s_single:
                        s_esc = True
                        sub_chars.append(c)
                        j += 1
                        continue
                    if c == "'" and not s_double:
                        s_single = not s_single
                        sub_chars.append(c)
                        j += 1
                        continue
                    if c == '"' and not s_single:
                        s_double = not s_double
                        sub_chars.append(c)
                        j += 1
                        continue
                    if not s_single and not s_double:
                        if c == '$' and j + 1 < length and chars[j+1] == '(':
                            depth += 1
                        elif c == ')':
                            depth -= 1
                            if depth == 0:
                                j += 1
                                break
                    sub_chars.append(c)
                    j += 1
                subs.append(''.join(sub_chars))
                i = j
                continue

            # `...`
            if ch == '`':
                sub_chars = []
                j = i + 1
                b_esc = False
                while j < length:
                    c = chars[j]
                    if b_esc:
                        sub_chars.append(c)
                        b_esc = False
                        j += 1
                        continue
                    if c == '\\':
                        b_esc = True
                        sub_chars.append(c)
                        j += 1
                        continue
                    if c == '`':
                        j += 1
                        break
                    sub_chars.append(c)
                    j += 1
                subs.append(''.join(sub_chars))
                i = j
                continue

        i += 1

    return subs

def parse_bash_script(full_cmd: str, initial_cwd: str) -> Tuple[List[SimpleCommand], Dict[str, str]]:
    """
    Phân tích toàn diện một lệnh bash.
    Theo dõi cd và ln -s.
    Phân tích substitution theo đúng cwd thời điểm thực thi.
    """
    commands: List[SimpleCommand] = []
    symlinks: Dict[str, str] = {}
    current_cwd = initial_cwd

    # Tách các segments
    segments = split_compound_commands(full_cmd)

    for seg_text, op in segments:
        clean_seg = seg_text.strip()
        if not clean_seg:
            continue

        # 1. Nếu segment chứa substitution $(...) ngoài nháy đơn:
        # Phân tích substitutions với current_cwd hiện tại!
        subs = extract_substitutions_safe(clean_seg)
        for sub in subs:
            sub_list, sub_links = parse_bash_script(sub, current_cwd)
            commands.extend(sub_list)
            symlinks.update(sub_links)

        # 2. Xử lý subshell: ( ... )
        if clean_seg.startswith('(') and clean_seg.endswith(')'):
            inner = clean_seg[1:-1].strip()
            sub_list, sub_links = parse_bash_script(inner, current_cwd)
            commands.extend(sub_list)
            symlinks.update(sub_links)
            continue

        cmd = SimpleCommand(clean_seg, current_cwd)
        commands.append(cmd)

        # Xử lý `cd`: bỏ qua các cờ -P, -L, --
        if cmd.executable == 'cd' and cmd.words:
            dest = ""
            for w in cmd.words[1:]:
                if w in ('-P', '-L', '--'):
                    continue
                if not w.startswith('-'):
                    dest = w
                    break
            if dest and dest not in ('-',):
                new_dir = os.path.normpath(os.path.join(current_cwd, os.path.expanduser(dest)))
                current_cwd = new_dir

        # Xử lý `ln -s`: giải target tương đối từ dirname của link
        if cmd.executable == 'ln' and cmd.words:
            flags = []
            non_flags = []
            for w in cmd.words[1:]:
                if w.startswith('-'):
                    flags.append(w)
                else:
                    non_flags.append(w)

            is_symbolic = any('s' in f for f in flags)
            if is_symbolic and len(non_flags) >= 2:
                src_target = non_flags[0]
                link_name = non_flags[1]

                abs_link = os.path.normpath(os.path.join(current_cwd, os.path.expanduser(link_name)))
                link_dir = os.path.dirname(abs_link)

                # Nếu target là tương đối: giải từ link_dir!
                if not os.path.isabs(src_target):
                    abs_src = os.path.normpath(os.path.join(link_dir, os.path.expanduser(src_target)))
                else:
                    abs_src = os.path.normpath(os.path.expanduser(src_target))

                symlinks[abs_link] = abs_src
                symlinks[link_name] = abs_src

        # Xử lý đệ quy cho sh -c, bash -c, zsh -c, eval (kể cả cờ gộp như -lc, -ec)
        if cmd.executable in ('sh', 'bash', 'zsh', 'ksh') and len(cmd.words) > 1:
            for c_idx, w in enumerate(cmd.words[1:], start=1):
                # Nhận cờ có chứa 'c' (ví dụ -c, -lc, -ec, -xc)
                if w.startswith('-') and 'c' in w and c_idx + 1 < len(cmd.words):
                    nested_cmd = cmd.words[c_idx + 1]
                    nested_list, nested_links = parse_bash_script(nested_cmd, current_cwd)
                    commands.extend(nested_list)
                    symlinks.update(nested_links)
                    break
        elif cmd.executable == 'eval' and len(cmd.words) > 1:
            nested_cmd = " ".join(cmd.words[1:])
            nested_list, nested_links = parse_bash_script(nested_cmd, current_cwd)
            commands.extend(nested_list)
            symlinks.update(nested_links)

    return commands, symlinks

def canonical_path(raw_path: str, cwd: str, project_dir: str, symlinks_map: Optional[Dict[str, str]] = None) -> str:
    """
    Chuẩn hoá một đường dẫn thành đường dẫn tương đối so với project_dir.
    Giải quyết symlink cả trên đĩa và symlink tạo trong chuỗi lệnh.
    """
    p = raw_path.strip().strip("'\"")
    if not p:
        return ""

    if symlinks_map:
        abs_p = os.path.normpath(os.path.join(cwd, os.path.expanduser(p))) if not os.path.isabs(p) else os.path.normpath(os.path.expanduser(p))
        for link_k, target_v in symlinks_map.items():
            abs_link_k = os.path.normpath(os.path.join(cwd, os.path.expanduser(link_k))) if not os.path.isabs(link_k) else os.path.normpath(os.path.expanduser(link_k))
            abs_target_v = os.path.normpath(os.path.join(cwd, os.path.expanduser(target_v))) if not os.path.isabs(target_v) else os.path.normpath(os.path.expanduser(target_v))

            if abs_p == abs_link_k:
                p = abs_target_v
                break
            elif abs_p.startswith(abs_link_k + '/'):
                p = abs_target_v + abs_p[len(abs_link_k):]
                break

    if not os.path.isabs(p):
        full_p = os.path.join(cwd, os.path.expanduser(p))
    else:
        full_p = os.path.expanduser(p)

    full_p = os.path.normpath(full_p)

    try:
        real_p = os.path.realpath(full_p)
    except Exception:
        real_p = full_p

    real_project_dir = os.path.realpath(os.path.expanduser(project_dir))

    try:
        rel = os.path.relpath(real_p, real_project_dir)
    except ValueError:
        rel = real_p

    return rel.replace('\\', '/')

def is_in_project_dau_vao(rel_path: str) -> bool:
    """Kiểm tra rel_path có nằm trong projects/<project>/inputs/... hoặc CAC-DU-AN/<project>/DAU-VAO/... không."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if len(parts) >= 3 and layout.is_projects_root(parts[0]) and layout.is_inputs_dir(parts[2]):
        return True
    return False

def is_in_operations_data(rel_path: str) -> bool:
    """Kiểm tra rel_path có nằm trong operations/data/... không (S17-10)."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if len(parts) >= 2 and parts[0] == 'operations' and parts[1] == 'data':
        return True
    for i in range(len(parts) - 1):
        if parts[i] == 'operations' and parts[i + 1] == 'data':
            return True
    return False

def is_in_du_an_mau(rel_path: str) -> bool:
    """Kiểm tra rel_path có thuộc projects/_sample-ground-truth/... hoặc CAC-DU-AN/DU-AN-MAU-SU-THAT/... không (không match ...-2)."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if len(parts) >= 2 and layout.is_projects_root(parts[0]) and layout.is_sample_ground_truth(parts[1]):
        return True
    return False

def is_dau_ra_or_final(rel_path: str) -> bool:
    """Kiểm tra rel_path có thuộc outputs / DAU-RA hoặc có _final trong tên file."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    filename = os.path.basename(norm)
    if len(parts) >= 3 and layout.is_projects_root(parts[0]) and layout.is_outputs_dir(parts[2]):
        return True
    if layout.FINAL_SUFFIX in filename:
        return True
    return False

def extract_write_targets(cmd: SimpleCommand, symlinks_map: Optional[Dict[str, str]] = None) -> List[Tuple[str, str]]:
    """
    Trích xuất tất cả đích ghi từ một SimpleCommand.
    Trả về danh sách (raw_path, reason_type).
    """
    targets: List[Tuple[str, str]] = []

    # 1. Redirections: >, >>, 1>, 1>>, 2>, 2>>
    for op, target in cmd.redirections:
        clean_target = target.strip("'\"")
        if clean_target in ('/dev/null', '&1', '&2'):
            continue
        if op in ('>', '>>', '1>', '1>>', '2>', '2>>'):
            targets.append((clean_target, f"redirection {op}"))

    # 2. Lệnh ghi file: cp, mv, ln, install, rsync, touch, truncate, tee, sed, perl, dd
    base = cmd.executable
    words = cmd.words

    if base in ('cp', 'install', 'rsync', 'ln'):
        non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
        if len(non_flags) >= 2:
            dest = non_flags[-1]
            sources = non_flags[:-1]
            dest_abs = os.path.normpath(os.path.join(cmd.cwd, os.path.expanduser(dest)))
            if dest.endswith('/') or os.path.isdir(dest_abs) or layout.is_outputs_dir(os.path.basename(dest_abs)):
                for s in sources:
                    targets.append((os.path.join(dest, os.path.basename(s)), f"{base} to directory"))
            else:
                targets.append((dest, f"{base} destination"))

    elif base == 'mv':
        non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
        for a in non_flags:
            targets.append((a, "mv source or destination"))

    elif base in ('touch', 'truncate'):
        for w in words[1:]:
            if not w.startswith('-'):
                targets.append((w.strip("'\""), f"{base} target"))

    elif base == 'tee':
        for w in words[1:]:
            if not w.startswith('-'):
                targets.append((w.strip("'\""), "tee target"))

    elif base == 'sed':
        has_inplace = any(w.startswith('-i') or w == '-i' for w in words[1:])
        if has_inplace:
            passed_script = False
            for w in words[1:]:
                if w.startswith('-'):
                    continue
                if not passed_script and (w.startswith('s/') or w.startswith('y/') or w.startswith('d') or ';' in w):
                    passed_script = True
                    continue
                if not passed_script and ('s/' in w or 'g' in w):
                    passed_script = True
                    continue
                targets.append((w.strip("'\""), "sed inplace"))

    elif base == 'perl':
        has_inplace = any('i' in w and w.startswith('-') for w in words[1:])
        if has_inplace:
            skip_next = False
            for w in words[1:]:
                if skip_next:
                    skip_next = False
                    continue
                if w == '-e':
                    skip_next = True
                    continue
                if w.startswith('-'):
                    continue
                targets.append((w.strip("'\""), "perl inplace"))

    elif base == 'dd':
        for w in words[1:]:
            if w.startswith('of='):
                dest = w[3:].strip("'\"")
                targets.append((dest, "dd output file"))

    # 3. Inline script writes (python/python3 -c open(...,'w'/'a'), Path(...).write_text, node fs.writeFileSync/appendFileSync)
    if base in ('python', 'python3', 'py', 'node') or 'open(' in cmd.raw_str or 'write_' in cmd.raw_str or 'FileSync' in cmd.raw_str:
        raw = cmd.raw_str
        for m in re.finditer(r"""\bopen\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:mode\s*=\s*)?['"](?:[wax]|[rwax]\+)[^'"]*['"]""", raw):
            targets.append((m.group(1), "python open write"))
        for m in re.finditer(r"""\bPath\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.\s*write_(?:text|bytes)\b""", raw):
            targets.append((m.group(1), "python Path.write"))
        for m in re.finditer(r"""\b(?:writeFileSync|appendFileSync|writeFile|appendFile|copyFileSync|cpSync)\s*\(\s*['"]([^'"]+)['"]""", raw):
            targets.append((m.group(1), "node fs write"))

    return targets

