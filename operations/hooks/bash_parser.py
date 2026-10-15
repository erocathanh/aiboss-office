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

import fnmatch
import os
import posixpath
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
    def __init__(self, raw_str: str, cwd: str, heredoc_bodies: Optional[List[str]] = None):
        self.raw_str = raw_str.strip()
        self.cwd = cwd
        self.heredoc_bodies: List[str] = list(heredoc_bodies) if heredoc_bodies else []
        self.words: List[str] = []
        self.executable: str = ""
        self.raw_executable: str = ""
        self.redirections: List[Tuple[str, str]] = [] # list of (op, target) e.g. ('>', 'file.txt')
        self.env_vars: Dict[str, str] = {}
        self.via_xargs: bool = False
        self.script_transcript_files: List[str] = []
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

        # Bóc tách wrapper (command, env, sudo, exec, builtin, nohup, nice, timeout, xargs, caffeinate, script, \)
        w_idx = 0
        while w_idx < len(remaining_tokens):
            w = remaining_tokens[w_idx]
            clean_w = w.lstrip('\\')
            base_w = os.path.basename(clean_w).lower()

            if base_w in ('builtin', 'exec', 'nohup', 'time'):
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
                sudo_flags_with_val = {'-u', '-g', '-h', '-p', '-U', '-C', '-D', '-R', '-T', '-r', '-t'}
                while w_idx < len(remaining_tokens):
                    sw = remaining_tokens[w_idx]
                    if sw == '--':
                        w_idx += 1
                        break
                    if sw in sudo_flags_with_val:
                        w_idx += 2
                        continue
                    if sw.startswith('-'):
                        w_idx += 1
                        continue
                    break
                continue
            elif base_w == 'env':
                w_idx += 1
                env_flags_with_val = {'-u', '-C', '-S', '--unset', '--chdir', '--split-string'}
                while w_idx < len(remaining_tokens):
                    cur = remaining_tokens[w_idx]
                    if cur == '--':
                        w_idx += 1
                        break
                    if cur in env_flags_with_val:
                        w_idx += 2
                        continue
                    if cur.startswith('-') or ('=' in cur and not cur.startswith('=')):
                        w_idx += 1
                    else:
                        break
                continue
            elif base_w == 'nice':
                n_idx = w_idx + 1
                while n_idx < len(remaining_tokens):
                    nw = remaining_tokens[n_idx]
                    if nw == '--':
                        n_idx += 1
                        break
                    if nw in ('-n', '--adjustment'):
                        n_idx += 2
                        continue
                    if nw.startswith('-'):
                        n_idx += 1
                        continue
                    break
                if n_idx < len(remaining_tokens):
                    w_idx = n_idx
                    continue
                break
            elif base_w == 'timeout':
                t_idx = w_idx + 1
                while t_idx < len(remaining_tokens):
                    tw = remaining_tokens[t_idx]
                    if tw == '--':
                        t_idx += 1
                        break
                    if tw in ('-k', '--kill-after', '-s', '--signal'):
                        t_idx += 2
                        continue
                    if tw.startswith('-'):
                        t_idx += 1
                        continue
                    break
                if t_idx + 1 < len(remaining_tokens):
                    w_idx = t_idx + 1
                    continue
                break
            elif base_w == 'caffeinate':
                c_idx = w_idx + 1
                while c_idx < len(remaining_tokens):
                    cw = remaining_tokens[c_idx]
                    if cw == '--':
                        c_idx += 1
                        break
                    if cw in ('-t', '-w'):
                        c_idx += 2
                        continue
                    if cw.startswith('-'):
                        c_idx += 1
                        continue
                    break
                if c_idx < len(remaining_tokens):
                    w_idx = c_idx
                    continue
                break
            elif base_w == 'script':
                s_idx = w_idx + 1
                while s_idx < len(remaining_tokens):
                    sw = remaining_tokens[s_idx]
                    if sw == '--':
                        s_idx += 1
                        break
                    if sw == '-t':
                        s_idx += 2
                        continue
                    if sw.startswith('-'):
                        s_idx += 1
                        continue
                    break
                if s_idx < len(remaining_tokens):
                    transcript_tok = remaining_tokens[s_idx].strip("'\"")
                    if transcript_tok and transcript_tok != '/dev/null':
                        self.script_transcript_files.append(transcript_tok)
                    if s_idx + 1 < len(remaining_tokens):
                        w_idx = s_idx + 1
                        continue
                break
            elif base_w == 'xargs':
                self.via_xargs = True
                x_idx = w_idx + 1
                x_flags_with_val = {
                    '-n', '-I', '-J', '-s', '-P', '-L', '-E', '-e', '-d', '-a',
                    '--max-args', '--max-procs', '--max-chars', '--max-lines',
                    '--delimiter', '--arg-file', '--replace', '--eof',
                }
                while x_idx < len(remaining_tokens):
                    xw = remaining_tokens[x_idx]
                    if xw == '--':
                        x_idx += 1
                        break
                    if xw in x_flags_with_val:
                        x_idx += 2
                        continue
                    if xw.startswith('-'):
                        x_idx += 1
                        continue
                    break
                if x_idx < len(remaining_tokens):
                    w_idx = x_idx
                    continue
                break
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

            # Kiểm tra redirection ngoài nháy: >, >>, <, <<, <<-, 1>, 1>>, 2>, 2>>, 0<
            # Xét xem ký tự này có phải là bắt đầu toán tử redirection không
            is_redir = False
            op = ""
            step = 0

            if ch in ('>', '<'):
                if i + 1 < length and chars[i:i+2] == ['>', '>']:
                    op = '>>'
                    step = 2
                elif i + 2 < length and chars[i:i+3] == ['<', '<', '-']:
                    op = '<<-'
                    step = 3
                elif i + 1 < length and chars[i:i+2] == ['<', '<']:
                    op = '<<'
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

def split_compound_commands(full_cmd: str) -> List[Tuple[str, Optional[str], List[str]]]:
    """
    Tách chuỗi lệnh bash thành các đơn vị lệnh đơn + toán tử liên kết + danh sách thân heredoc.
    Hỗ trợ:
    - Quoting ', ", escape.
    - Heredoc <<EOF / <<'EOF' (lưu giữ toàn bộ nội dung thân heredoc gắn với lệnh mở nó).
    - Bỏ qua command substitution trong nháy đơn.
    - Báo lỗi nếu nháy chưa đóng.
    """
    results: List[Tuple[str, Optional[str], List[str]]] = []

    lines = full_cmd.splitlines(keepends=True)
    current_cmd = []
    current_heredocs: List[str] = []

    in_single = False
    in_double = False
    escaped = False
    subshell_depth = 0
    backtick = False

    heredoc_delim = None
    heredoc_lines: List[str] = []
    heredoc_owner_indices: List[int] = []

    def attach_heredoc_body(body: str):
        nonlocal heredoc_owner_indices
        if heredoc_owner_indices:
            for idx in heredoc_owner_indices:
                if 0 <= idx < len(results):
                    results[idx][2].append(body)
            heredoc_owner_indices = []
        else:
            current_heredocs.append(body)

    for line in lines:
        # Nếu đang trong heredoc body
        if heredoc_delim is not None:
            stripped = line.strip()
            if stripped == heredoc_delim:
                # Kết thúc heredoc -> gắn thân heredoc vào lệnh đã mở nó
                attach_heredoc_body("".join(heredoc_lines))
                heredoc_lines = []
                heredoc_delim = None
            else:
                heredoc_lines.append(line)
            continue

        chars = list(line)
        length = len(chars)
        i = 0
        line_opened_heredoc = False

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
                        heredoc_lines = []
                        line_opened_heredoc = True
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
                        results.append((seg, op, list(current_heredocs)))
                        if line_opened_heredoc:
                            heredoc_owner_indices.append(len(results) - 1)
                    current_cmd = []
                    current_heredocs = []
                    i += step
                    continue

            current_cmd.append(ch)
            i += 1

    if in_single or in_double or escaped or backtick or subshell_depth > 0:
        raise BashParseError("Unclosed quote or syntax structure in command")

    remaining = ''.join(current_cmd).strip()
    if remaining:
        results.append((remaining, None, list(current_heredocs)))
        if heredoc_delim is not None and not heredoc_owner_indices:
            heredoc_owner_indices.append(len(results) - 1)

    if heredoc_delim is not None and heredoc_lines:
        attach_heredoc_body("".join(heredoc_lines))

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
    Phân tích substitution và heredoc theo đúng cwd thời điểm thực thi.
    """
    commands: List[SimpleCommand] = []
    symlinks: Dict[str, str] = {}
    current_cwd = initial_cwd

    # Tách các segments kèm thân heredoc
    segments = split_compound_commands(full_cmd)

    for seg_text, op, hd_bodies in segments:
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

        cmd = SimpleCommand(clean_seg, current_cwd, heredoc_bodies=hd_bodies)
        commands.append(cmd)

        # Nếu lệnh là shell (sh, bash, zsh, ksh, dash) nhận heredoc -> phân tích đệ quy thân heredoc như script shell
        if cmd.executable in ('sh', 'bash', 'zsh', 'ksh', 'dash') and cmd.heredoc_bodies:
            for hd_body in cmd.heredoc_bodies:
                nested_list, nested_links = parse_bash_script(hd_body, current_cwd)
                commands.extend(nested_list)
                symlinks.update(nested_links)

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
        if cmd.executable in ('sh', 'bash', 'zsh', 'ksh', 'dash') and len(cmd.words) > 1:
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

def _seg_matches_protected(seg: str, protected_names: Tuple[str, ...]) -> bool:
    if not seg:
        return False
    if seg in protected_names:
        return True
    if any(ch in seg for ch in ('*', '?', '[')):
        return any(fnmatch.fnmatchcase(name, seg) for name in protected_names)
    return False


def is_in_project_dau_vao(rel_path: str) -> bool:
    """Kiểm tra rel_path có nằm trong projects/<project>/inputs/... hoặc CAC-DU-AN/<project>/DAU-VAO/... không."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if (
        len(parts) >= 3
        and (layout.is_projects_root(parts[0]) or _seg_matches_protected(parts[0], layout.PROJECTS_ROOT_ALL))
        and (layout.is_inputs_dir(parts[2]) or _seg_matches_protected(parts[2], layout.INPUTS_DIR_ALL))
    ):
        return True
    return False

def is_in_operations_data(rel_path: str) -> bool:
    """Kiểm tra rel_path có nằm trong operations/data/... không (S17-10)."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    for i in range(len(parts) - 1):
        if _seg_matches_protected(parts[i], ('operations',)) and _seg_matches_protected(parts[i + 1], ('data',)):
            return True
    return False

def is_in_du_an_mau(rel_path: str) -> bool:
    """Kiểm tra rel_path có thuộc projects/_sample-ground-truth/... hoặc CAC-DU-AN/DU-AN-MAU-SU-THAT/... không (không match ...-2)."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if (
        len(parts) >= 2
        and (layout.is_projects_root(parts[0]) or _seg_matches_protected(parts[0], layout.PROJECTS_ROOT_ALL))
        and (layout.is_sample_ground_truth(parts[1]) or _seg_matches_protected(parts[1], layout.SAMPLE_GROUND_TRUTH_ALL))
    ):
        return True
    return False

def is_dau_ra_or_final(rel_path: str) -> bool:
    """Kiểm tra rel_path có thuộc outputs / DAU-RA hoặc có _final trong tên file."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    filename = os.path.basename(norm)
    if (
        len(parts) >= 3
        and (layout.is_projects_root(parts[0]) or _seg_matches_protected(parts[0], layout.PROJECTS_ROOT_ALL))
        and (layout.is_outputs_dir(parts[2]) or _seg_matches_protected(parts[2], layout.OUTPUTS_DIR_ALL))
    ):
        return True
    if layout.FINAL_SUFFIX in filename:
        return True
    return False

def is_dynamic_write_target(target_path: str) -> bool:
    """F5 (S17b): Kiểm tra đích ghi có phải là biến ($p, ${p}), command substitution hoặc biểu thức động không giải tĩnh được."""
    p = target_path.strip().strip("'\"")
    if not p:
        return True
    if p.startswith("$DYNAMIC_WRITE"):
        return True
    if "$" in p or "`" in p:
        return True
    return False

def is_cwd_inside_office(cwd: str, project_dir: str) -> bool:
    """Kiểm tra cwd có nằm trong kho văn phòng project_dir không."""
    if not project_dir:
        return False
    try:
        real_cwd = os.path.realpath(os.path.expanduser(cwd))
        real_proj = os.path.realpath(os.path.expanduser(project_dir))
        return real_cwd == real_proj or real_cwd.startswith(real_proj + os.sep)
    except Exception:
        return True

def extract_write_targets(cmd: SimpleCommand, symlinks_map: Optional[Dict[str, str]] = None) -> List[Tuple[str, str]]:
    """
    Trích xuất tất cả đích ghi từ một SimpleCommand (bao gồm cả thân heredoc đi kèm).
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

    for tf in getattr(cmd, "script_transcript_files", []):
        if tf and tf != '/dev/null':
            targets.append((tf, "script transcript file"))

    # 2. Lệnh ghi file: cp, mv, ln, install, rsync, touch, truncate, tee, sed, perl, dd
    base = cmd.executable
    words = cmd.words

    if getattr(cmd, "via_xargs", False) and base in (
        'cp', 'install', 'rsync', 'ln', 'mv', 'touch', 'truncate', 'tee', 'sed', 'perl', 'dd'
    ):
        targets.append(("$DYNAMIC_WRITE:xargs", f"{base} via xargs"))

    if base in ('cp', 'install', 'rsync', 'ln'):
        non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
        if len(non_flags) >= 2:
            dest = non_flags[-1]
            sources = non_flags[:-1]
            if is_dynamic_write_target(dest):
                targets.append((dest, f"{base} dynamic destination"))
            else:
                dest_abs = os.path.normpath(os.path.join(cmd.cwd, os.path.expanduser(dest)))
                dest_base = os.path.basename(dest_abs)
                if (
                    dest.endswith('/')
                    or os.path.isdir(dest_abs)
                    or layout.is_outputs_dir(dest_base)
                    or _seg_matches_protected(dest_base, layout.OUTPUTS_DIR_ALL + layout.INPUTS_DIR_ALL)
                ):
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

    # 3. Inline script & heredoc writes (F5, F10, F12, F16, F20, F27, F28)
    combined_raw = "\n".join([cmd.raw_str] + getattr(cmd, "heredoc_bodies", []))
    if (
        base in ('python', 'python3', 'py', 'node')
        or base.startswith('python3.')
        or 'open(' in combined_raw
        or 'write_' in combined_raw
        or 'Path(' in combined_raw
        or 'FileSync' in combined_raw
        or 'cpSync' in combined_raw
        or 'cp(' in combined_raw
        or 'writeFile' in combined_raw
        or 'appendFile' in combined_raw
        or 'copyFile' in combined_raw
        or 'copytree' in combined_raw
        or 'rmtree' in combined_raw
        or 'rename' in combined_raw
        or 'replace' in combined_raw
        or 'unlink' in combined_raw
        or 'rmdir' in combined_raw
        or 'mkdir' in combined_raw
        or 'makedirs' in combined_raw
        or 'touch' in combined_raw
        or 'link' in combined_raw
        or 'symlink' in combined_raw
        or 'rmSync' in combined_raw
        or 'rm(' in combined_raw
        or 'shutil.' in combined_raw
        or 'os.' in combined_raw
        or 'fs.' in combined_raw
    ):
        default_join = 'node' if base == 'node' else 'auto'
        var_env = _extract_simple_var_env(combined_raw, default_join_style=default_join)
        module_vars = _extract_module_vars(combined_raw)

        for call_args in _extract_module_call_arg_lists(combined_raw, r'\bopen\s*\(', module_vars):
            if not call_args:
                continue
            path_expr = call_args[0]
            mode_expr = _extract_open_mode_expr(call_args[1:])
            if mode_expr is not None:
                resolved_mode = resolve_script_path_expr(mode_expr, var_env=var_env, default_join_style=default_join)
                if resolved_mode.startswith('$DYNAMIC_WRITE:') or re.match(r'^(?:[wax]|[rwax]\+|[rwax]b?\+|[bt]?[wax])', resolved_mode):
                    resolved_target = resolve_script_path_expr(path_expr, var_env=var_env, default_join_style=default_join)
                    label = "python open dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python open write"
                    targets.append((resolved_target, label))

        # F20a, F27 & F28: Receiver-based detection for pathlib methods (.write_text, .write_bytes, .open,
        # .unlink, .rmdir, .touch, .mkdir, .symlink_to, .hardlink_to, .rename, .replace).
        # F28: Skip module receivers (os, fs, shutil, pathlib, io, require('fs'), etc.) so module APIs
        # like os.unlink('wip/tmp') or fs.unlink('wip/tmp', cb) are never misclassified as pathlib receivers.
        for recv_expr, method_name, method_args in _extract_method_calls_with_receiver(
            combined_raw,
            ('write_text', 'write_bytes', 'open', 'unlink', 'rmdir', 'touch', 'mkdir', 'symlink_to', 'hardlink_to', 'rename', 'replace'),
        ):
            if not recv_expr or _is_module_receiver_expr(recv_expr, module_vars):
                continue
            if method_name == 'open':
                mode_expr = _extract_open_mode_expr(method_args)
                if mode_expr is None:
                    continue
                resolved_mode = resolve_script_path_expr(mode_expr, var_env=var_env, default_join_style=default_join)
                if not (
                    resolved_mode.startswith('$DYNAMIC_WRITE:')
                    or re.match(r'^(?:[wax]|[rwax]\+|[rwax]b?\+|[bt]?[wax])', resolved_mode)
                ):
                    continue
                resolved_target = resolve_script_path_expr(recv_expr, var_env=var_env, default_join_style=default_join)
                label = "python Path dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python Path.open"
                targets.append((resolved_target, label))
            elif method_name in ('rename', 'replace'):
                # F27c: pathlib p.rename(dst) / p.replace(dst) modifies BOTH source (receiver p) and destination (arg[0])
                resolved_src = resolve_script_path_expr(recv_expr, var_env=var_env, default_join_style='python')
                src_label = f"python Path.{method_name} dynamic source" if resolved_src.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} source"
                targets.append((resolved_src, src_label))
                if method_args:
                    resolved_dst = resolve_script_path_expr(method_args[0], var_env=var_env, default_join_style='python')
                else:
                    resolved_dst = "$DYNAMIC_WRITE:empty"
                dst_label = f"python Path.{method_name} dynamic destination" if resolved_dst.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} destination"
                targets.append((resolved_dst, dst_label))
            else:
                resolved_target = resolve_script_path_expr(recv_expr, var_env=var_env, default_join_style=default_join)
                if method_name in ('unlink', 'rmdir'):
                    label = f"python Path.{method_name} dynamic delete" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} delete"
                else:
                    label = "python Path dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name}"
                targets.append((resolved_target, label))

        # Node fs single-target writes, deletes & mkdir (F27 & F28: only module/standalone calls)
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|unlinkSync|rmSync|rm|rmdirSync|mkdirSync|truncateSync)\s*\(',
            module_vars,
        ):
            if not call_args:
                continue
            resolved_target = resolve_script_path_expr(call_args[0], var_env=var_env, default_join_style='node')
            label = "node fs dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs write"
            targets.append((resolved_target, label))

        # Node fs callback/promise unlink/rmdir/mkdir (distinguished from Python os.unlink/rmdir/mkdir by default_join)
        if base == 'node' or 'fs.' in combined_raw or "require('fs" in combined_raw or 'require("fs' in combined_raw or "require('node:fs" in combined_raw or 'require("node:fs' in combined_raw:
            for call_args in _extract_module_call_arg_lists(
                combined_raw,
                r'\b(?:unlink|rmdir|mkdir|truncate)\s*\(',
                module_vars,
            ):
                if not call_args:
                    continue
                resolved_target = resolve_script_path_expr(call_args[0], var_env=var_env, default_join_style='node')
                label = "node fs dynamic delete" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs delete"
                targets.append((resolved_target, label))

        # Node fs copy & link/symlink (destination is arg[1])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:copyFileSync|cpSync|copyFile|cp|linkSync|symlinkSync)\s*\(',
            module_vars,
        ):
            if len(call_args) < 2:
                continue
            resolved_target = resolve_script_path_expr(call_args[1], var_env=var_env, default_join_style='node')
            label = "node fs dynamic copy/link" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs copy/link"
            targets.append((resolved_target, label))

        if base == 'node' or 'fs.' in combined_raw or "require('fs" in combined_raw or 'require("fs' in combined_raw or "require('node:fs" in combined_raw or 'require("node:fs' in combined_raw:
            for call_args in _extract_module_call_arg_lists(
                combined_raw,
                r'\b(?:link|symlink)\s*\(',
                module_vars,
            ):
                if len(call_args) < 2:
                    continue
                resolved_target = resolve_script_path_expr(call_args[1], var_env=var_env, default_join_style='node')
                label = "node fs dynamic link" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs link"
                targets.append((resolved_target, label))

        # F20b: Node fs rename / renameSync — check BOTH source (arg[0]) and destination (arg[1])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:renameSync|rename)\s*\(',
            module_vars,
        ):
            if len(call_args) < 2:
                continue
            for idx_arg, role in ((0, "source"), (1, "destination")):
                resolved_target = resolve_script_path_expr(call_args[idx_arg], var_env=var_env, default_join_style='node')
                label = f"node fs dynamic rename {role}" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"node fs rename {role}"
                targets.append((resolved_target, label))

        # F27a: Python shutil.copy / copy2 / copyfile / copytree (destination is arg[1])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:shutil\.)?(?:copy|copy2|copyfile|copytree)\s*\(',
            module_vars,
        ):
            if len(call_args) < 2:
                continue
            resolved_target = resolve_script_path_expr(call_args[1], var_env=var_env, default_join_style='python')
            label = "python shutil dynamic copy" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python shutil copy"
            targets.append((resolved_target, label))

        # F27b: Python os.link / os.symlink (destination is arg[1])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:os\.)?(?:link|symlink)\s*\(',
            module_vars,
        ):
            if len(call_args) < 2:
                continue
            resolved_target = resolve_script_path_expr(call_args[1], var_env=var_env, default_join_style='python')
            label = "python os.link dynamic destination" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python os.link destination"
            targets.append((resolved_target, label))

        # F20b: Python shutil.move, os.rename, os.replace — check BOTH source (arg[0]) and destination (arg[1])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:shutil\.move|os\.(?:replace|rename)|replace)\s*\(',
            module_vars,
        ):
            if len(call_args) < 2:
                continue
            for idx_arg, role in ((0, "source"), (1, "destination")):
                resolved_target = resolve_script_path_expr(call_args[idx_arg], var_env=var_env, default_join_style='python')
                label = f"python move/rename dynamic {role}" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python move/rename {role}"
                targets.append((resolved_target, label))

        # F27 & F28: Python os.remove, os.unlink, os.rmdir, os.removedirs, os.mkdir, os.makedirs, shutil.rmtree (single target arg[0])
        for call_args in _extract_module_call_arg_lists(
            combined_raw,
            r'\b(?:os\.(?:remove|unlink|rmdir|removedirs|mkdir|makedirs|truncate)|shutil\.rmtree|remove|removedirs|makedirs|rmtree)\s*\(',
            module_vars,
        ):
            if not call_args:
                continue
            resolved_target = resolve_script_path_expr(call_args[0], var_env=var_env, default_join_style='python')
            label = "python delete dynamic target" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python delete target"
            targets.append((resolved_target, label))

        if base != 'node':
            for call_args in _extract_module_call_arg_lists(
                combined_raw,
                r'\b(?:unlink|rmdir|mkdir)\s*\(',
                module_vars,
            ):
                if not call_args:
                    continue
                resolved_target = resolve_script_path_expr(call_args[0], var_env=var_env, default_join_style='python')
                label = "python delete dynamic target" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python delete target"
                targets.append((resolved_target, label))

    return targets



def _extract_open_mode_expr(extra_args: List[str]) -> Optional[str]:
    mode_expr: Optional[str] = None
    for extra in extra_args:
        s_extra = extra.strip()
        if s_extra.startswith('mode') and '=' in s_extra:
            mode_expr = s_extra.split('=', 1)[1].strip()
            break
    if mode_expr is None and len(extra_args) >= 1:
        first_extra = extra_args[0].strip()
        if not re.match(r'^[A-Za-z_][A-Za-z0-9_]*\s*=', first_extra):
            mode_expr = first_extra
    return mode_expr


_SINGLE_STRING_LITERAL_RE = re.compile(r"""^(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)")$""", re.DOTALL)
_PYTHON_JOIN_CALL_PREFIX_RE = re.compile(r'^(?:os\.path|posixpath)\.join\s*\(', re.DOTALL)
_NODE_JOIN_CALL_PREFIX_RE = re.compile(
    r'^(?:require\s*\(\s*[\'"](?:node:)?path(?:/posix)?[\'"]\s*\)|[A-Za-z_][A-Za-z0-9_]*)(?:\.posix)?\.join\s*\(',
    re.DOTALL,
)
_PATHLIB_CTOR_PREFIX_RE = re.compile(r'^(?:pathlib\.)?(?:Pure(?:Posix|Windows)?|Posix|Windows)?Path\s*\(', re.DOTALL)
_SIMPLE_IDENT_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _node_path_join(parts: List[str]) -> str:
    """
    F20c (S17e): POSIX implementation of Node.js path.join(...parts).
    Unlike Python os.path.join (which discards earlier segments when a segment begins with '/'),
    Node path.join concatenates all non-empty segments with '/' and normalizes the result.
    """
    non_empty = [p for p in parts if p]
    if not non_empty:
        return "."
    joined = "/".join(non_empty)
    return posixpath.normpath(joined)


def _strip_outer_parens(expr: str) -> str:
    s = (expr or "").strip()
    while len(s) >= 2 and s[0] == '(' and s[-1] == ')':
        _, close_idx = _scan_balanced_paren_args(s, 1)
        if close_idx == len(s) - 1:
            s = s[1:-1].strip()
        else:
            break
    return s


def _decode_single_pass_escapes(raw_val: str) -> Optional[str]:
    out: List[str] = []
    i = 0
    n = len(raw_val)
    while i < n:
        ch = raw_val[i]
        if ch != '\\':
            out.append(ch)
            i += 1
            continue
        if i + 1 >= n:
            return None
        nxt = raw_val[i + 1]
        if nxt in ('\\', '/', "'", '"'):
            out.append(nxt)
            i += 2
            continue
        if nxt == 'x':
            hex_part = raw_val[i + 2 : i + 4]
            if len(hex_part) != 2 or not all(c in '0123456789abcdefABCDEF' for c in hex_part):
                return None
            out.append(chr(int(hex_part, 16)))
            i += 4
            continue
        if nxt == 'u':
            if i + 2 < n and raw_val[i + 2] == '{':
                close_brace = raw_val.find('}', i + 3)
                if close_brace < 0:
                    return None
                hex_part = raw_val[i + 3 : close_brace]
                if not (1 <= len(hex_part) <= 6) or not all(c in '0123456789abcdefABCDEF' for c in hex_part):
                    return None
                code_pt = int(hex_part, 16)
                if code_pt > 0x10FFFF:
                    return None
                out.append(chr(code_pt))
                i = close_brace + 1
                continue
            hex_part = raw_val[i + 2 : i + 6]
            if len(hex_part) != 4 or not all(c in '0123456789abcdefABCDEF' for c in hex_part):
                return None
            out.append(chr(int(hex_part, 16)))
            i += 6
            continue
        if nxt == 'U':
            hex_part = raw_val[i + 2 : i + 10]
            if len(hex_part) != 8 or not all(c in '0123456789abcdefABCDEF' for c in hex_part):
                return None
            code_pt = int(hex_part, 16)
            if code_pt > 0x10FFFF:
                return None
            out.append(chr(code_pt))
            i += 10
            continue
        if nxt in '01234567':
            oct_digits = [nxt]
            j = i + 2
            while j < n and len(oct_digits) < 3 and raw_val[j] in '01234567':
                oct_digits.append(raw_val[j])
                j += 1
            out.append(chr(int("".join(oct_digits), 8)))
            i = j
            continue
        # Any other escape (\N{...}, \n, \r, \t, \0, or unknown) in a path literal is rejected fail-closed
        return None
    return "".join(out)


def _decode_string_literal_escapes(raw_val: str) -> Optional[str]:
    """
    F16b (S17d): Decode language escapes (\\x2f, \\u002f, octal, \\/, \\\\) in string literals
    before canonicalization. If any escape cannot be cleanly resolved or leaves a backslash
    or control character, return None so caller treats it as $DYNAMIC_WRITE (never a safe static path).
    """
    cur = raw_val
    for _ in range(2):
        if '\\' not in cur:
            break
        decoded = _decode_single_pass_escapes(cur)
        if decoded is None:
            return None
        cur = decoded
    if '\\' in cur or any(ord(c) < 32 for c in cur):
        return None
    return cur


def resolve_script_path_expr(
    expr: str,
    var_env: Optional[Dict[str, str]] = None,
    default_join_style: str = "auto",
) -> str:
    """
    F10 & F12 (S17c), F16 (S17d) & F20 (S17e): Resolve a Python/JS path argument expression into either:
    - a static string path (supporting surrounding whitespace, outer parens, '+' concatenation,
      pathlib.Path(...) and '/' operator chains, static os.path.join vs Node path.join calls,
      and decoded string literal escapes), OR
    - '$DYNAMIC_WRITE:<expr>' when the expression contains unresolvable variables, template substitutions,
      unresolvable escapes, or dynamic calls.
    """
    s = _strip_outer_parens(expr)
    if not s:
        return "$DYNAMIC_WRITE:empty"

    m_single = _SINGLE_STRING_LITERAL_RE.match(s)
    if m_single:
        val = m_single.group(1) if m_single.group(1) is not None else m_single.group(2)
        decoded = _decode_string_literal_escapes(val)
        if decoded is None:
            return f"$DYNAMIC_WRITE:{s}"
        return decoded

    if _SIMPLE_IDENT_RE.match(s):
        if var_env and s in var_env:
            return var_env[s]
        return f"$DYNAMIC_WRITE:{s}"

    # F20a: Check top-level '/' operator (pathlib Path('a') / 'b' / 'c')
    slash_parts = _split_top_level_op(s, '/')
    if len(slash_parts) > 1:
        resolved_slash = [
            resolve_script_path_expr(p, var_env=var_env, default_join_style=default_join_style)
            for p in slash_parts
        ]
        if any(rp.startswith('$DYNAMIC_WRITE:') for rp in resolved_slash):
            return f"$DYNAMIC_WRITE:{s}"
        return os.path.normpath(os.path.join(*resolved_slash)).replace('\\', '/')

    # F20a: Check pathlib.Path(...) constructor (with optional .joinpath(...) chain)
    m_path = _PATHLIB_CTOR_PREFIX_RE.match(s)
    if m_path:
        ctor_args, close_idx = _scan_balanced_paren_args(s, m_path.end())
        if ctor_args is not None:
            tail = s[close_idx + 1 :].strip()
            all_path_arg_exprs = list(ctor_args)
            valid_chain = True
            while tail:
                m_jp = re.match(r'^\.\s*joinpath\s*\(', tail)
                if not m_jp:
                    valid_chain = False
                    break
                jp_args, jp_close = _scan_balanced_paren_args(tail, m_jp.end())
                if jp_args is None:
                    valid_chain = False
                    break
                all_path_arg_exprs.extend(jp_args)
                tail = tail[jp_close + 1 :].strip()
            if valid_chain:
                if not all_path_arg_exprs:
                    return "."
                resolved_ctor = [
                    resolve_script_path_expr(a, var_env=var_env, default_join_style='python')
                    for a in all_path_arg_exprs
                ]
                if any(rp.startswith('$DYNAMIC_WRITE:') for rp in resolved_ctor):
                    return f"$DYNAMIC_WRITE:{s}"
                return os.path.normpath(os.path.join(*resolved_ctor)).replace('\\', '/')

    # F20c: Check Python os.path.join(...) / posixpath.join(...) vs Node path.join(...) / path.posix.join(...)
    m_py_join = _PYTHON_JOIN_CALL_PREFIX_RE.match(s)
    if m_py_join and s.endswith(')'):
        join_arg_lists = _extract_call_arg_lists(s, r'^(?:os\.path|posixpath)\.join\s*\(')
        if len(join_arg_lists) == 1 and join_arg_lists[0]:
            resolved_parts = [
                resolve_script_path_expr(p, var_env=var_env, default_join_style='python')
                for p in join_arg_lists[0]
            ]
            if all(not rp.startswith('$DYNAMIC_WRITE:') for rp in resolved_parts):
                return os.path.normpath(os.path.join(*resolved_parts)).replace('\\', '/')

    m_node_join = _NODE_JOIN_CALL_PREFIX_RE.match(s)
    if m_node_join and s.endswith(')'):
        join_arg_lists = _extract_call_arg_lists(
            s,
            r'^(?:require\s*\(\s*[\'"](?:node:)?path(?:/posix)?[\'"]\s*\)|[A-Za-z_][A-Za-z0-9_]*)(?:\.posix)?\.join\s*\(',
        )
        if len(join_arg_lists) == 1 and join_arg_lists[0]:
            is_explicit_path_recv = bool(re.match(r'^(?:path|require\b)', s))
            if is_explicit_path_recv or default_join_style == 'node' or len(join_arg_lists[0]) >= 2:
                resolved_parts = [
                    resolve_script_path_expr(p, var_env=var_env, default_join_style='node')
                    for p in join_arg_lists[0]
                ]
                if all(not rp.startswith('$DYNAMIC_WRITE:') for rp in resolved_parts):
                    return _node_path_join(resolved_parts)

    # Check if s is a '+' concatenation of string literals: 'operations/' + 'data/...'
    parts = _split_top_level_op(s, '+')
    if len(parts) > 1:
        concat_pieces: List[str] = []
        all_literals = True
        for part in parts:
            rp = resolve_script_path_expr(part, var_env=var_env, default_join_style=default_join_style)
            if rp.startswith('$DYNAMIC_WRITE:'):
                all_literals = False
                break
            concat_pieces.append(rp)
        if all_literals:
            return "".join(concat_pieces)

    return f"$DYNAMIC_WRITE:{s}"


def _split_top_level_op(expr: str, op_char: str) -> List[str]:
    parts: List[str] = []
    cur: List[str] = []
    quote: Optional[str] = None
    escape = False
    depth = 0
    for ch in expr:
        if escape:
            cur.append(ch)
            escape = False
            continue
        if ch == '\\' and quote is not None:
            cur.append(ch)
            escape = True
            continue
        if quote is not None:
            cur.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in ("'", '"', '`'):
            quote = ch
            cur.append(ch)
            continue
        if ch in ('(', '[', '{'):
            depth += 1
            cur.append(ch)
            continue
        if ch in (')', ']', '}'):
            depth = max(0, depth - 1)
            cur.append(ch)
            continue
        if ch == op_char and depth == 0:
            parts.append("".join(cur))
            cur = []
            continue
        cur.append(ch)
    parts.append("".join(cur))
    return parts


def _split_top_level_plus(expr: str) -> List[str]:
    return _split_top_level_op(expr, '+')


def _extract_simple_var_env(text: str, default_join_style: str = "auto") -> Dict[str, str]:
    """
    Extract simple variable assignments (e.g. `p = Path(root) / 'projects' / ...` or `p = Path('wip') / 'a.md'`)
    across `;` and newline-separated statements. Reassigned variables become $DYNAMIC_WRITE.
    """
    env: Dict[str, str] = {}
    counts: Dict[str, int] = {}
    for stmt in re.split(r'[;\n]+', text):
        s = stmt.strip()
        if not s:
            continue
        # Strip leading interpreter inline flag prefix (e.g. `python3 -c "` or `node -e "`)
        s = re.sub(r'^(?:.*?\s)?(?:-[a-zA-Z]*[ce]|--eval|--print)\s+[\'"]?', '', s).strip()
        m = re.match(r'^(?:(?:const|let|var)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(?![=~>])(.+)$', s)
        if not m:
            continue
        var_name = m.group(1)
        rhs = m.group(2).strip()
        if var_name in ('import', 'from', 'return', 'if', 'elif', 'while', 'for', 'assert'):
            continue
        counts[var_name] = counts.get(var_name, 0) + 1
        if counts[var_name] > 1:
            env[var_name] = f"$DYNAMIC_WRITE:{var_name}"
        else:
            env[var_name] = resolve_script_path_expr(rhs, var_env=env, default_join_style=default_join_style)
    return env


def _extract_receiver_before_dot(text: str, dot_idx: int) -> str:
    """
    Walk backwards from dot_idx (the index of '.' in '.write_text(' / '.write_bytes(' / '.open(')
    to extract the receiver expression (supporting balanced parens/brackets, string literals,
    identifiers/attributes, and top-level '/' pathlib expressions).
    """
    i = dot_idx - 1
    while i >= 0 and text[i] in (' ', '\t'):
        i -= 1
    end_pos = i + 1
    if end_pos <= 0:
        return ""

    while i >= 0:
        ch = text[i]
        if ch in (')', ']'):
            open_ch = '(' if ch == ')' else '['
            depth = 1
            i -= 1
            in_q: Optional[str] = None
            while i >= 0 and depth > 0:
                c = text[i]
                if in_q is not None:
                    if c == in_q and (i == 0 or text[i - 1] != '\\'):
                        in_q = None
                else:
                    if c in ("'", '"', '`') and (i == 0 or text[i - 1] != '\\'):
                        in_q = c
                    elif c == ch:
                        depth += 1
                    elif c == open_ch:
                        depth -= 1
                i -= 1
            continue
        if ch in ("'", '"') and (i == 0 or text[i - 1] != '\\'):
            # Only treat quote as a string literal if it is at the end of the receiver or immediately precedes '/'
            right_tail = text[i + 1 : end_pos].lstrip()
            if i < end_pos - 1 and not right_tail.startswith('/'):
                break
            q = ch
            i -= 1
            while i >= 0:
                if text[i] == q and (i == 0 or text[i - 1] != '\\'):
                    i -= 1
                    break
                i -= 1
            continue
        if ch.isalnum() or ch in ('_', '.'):
            i -= 1
            continue
        if ch == '/':
            i -= 1
            while i >= 0 and text[i] in (' ', '\t'):
                i -= 1
            continue
        if ch in (' ', '\t'):
            j = i - 1
            while j >= 0 and text[j] in (' ', '\t'):
                j -= 1
            if j >= 0 and text[j] == '/':
                i = j - 1
                while i >= 0 and text[i] in (' ', '\t'):
                    i -= 1
                continue
            break
        break

    start_pos = i + 1
    return text[start_pos:end_pos].strip()


def _extract_method_calls_with_receiver(
    text: str,
    method_names: Tuple[str, ...],
) -> List[Tuple[str, str, List[str]]]:
    """
    F20a (S17e): Find all `.method_name(...)` calls in `text` and return
    `(receiver_expr, method_name, method_args)` for each call.
    """
    results: List[Tuple[str, str, List[str]]] = []
    alt = "|".join(re.escape(m) for m in method_names)
    pat = re.compile(rf'\.\s*({alt})\s*\(')
    for m in pat.finditer(text):
        dot_idx = m.start()
        method_name = m.group(1)
        receiver_expr = _extract_receiver_before_dot(text, dot_idx)
        method_args, _ = _scan_balanced_paren_args(text, m.end())
        if method_args is None:
            method_args = []
        results.append((receiver_expr, method_name, method_args))
    return results


def _scan_balanced_paren_args(text: str, start_idx: int) -> Tuple[Optional[List[str]], int]:
    """Scan balanced parentheses starting right after '(' at start_idx. Returns (args, close_paren_idx)."""
    args: List[str] = []
    cur: List[str] = []
    quote: Optional[str] = None
    escape = False
    depth = 1
    i = start_idx
    n = len(text)
    while i < n and depth > 0:
        ch = text[i]
        if escape:
            cur.append(ch)
            escape = False
            i += 1
            continue
        if ch == '\\' and quote is not None:
            cur.append(ch)
            escape = True
            i += 1
            continue
        if quote is not None:
            cur.append(ch)
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in ("'", '"', '`'):
            quote = ch
            cur.append(ch)
            i += 1
            continue
        if ch in ('(', '[', '{'):
            depth += 1
            cur.append(ch)
            i += 1
            continue
        if ch in (')', ']', '}'):
            depth -= 1
            if depth == 0:
                arg_str = "".join(cur).strip()
                if arg_str or args:
                    args.append(arg_str)
                return (args, i)
            cur.append(ch)
            i += 1
            continue
        if ch == ',' and depth == 1:
            args.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    return (None, i)


def _extract_call_arg_lists(text: str, prefix_pattern: str) -> List[List[str]]:
    results: List[List[str]] = []
    for m in re.finditer(prefix_pattern, text):
        args, _ = _scan_balanced_paren_args(text, m.end())
        if args is not None:
            results.append(args)
    return results


_KNOWN_MODULE_RECEIVERS = {
    'os', 'posix', 'nt', 'shutil', 'fs', 'fsp', 'fsPromises',
    'path', 'posixpath', 'ntpath', 'pathlib', 'io', 'sys',
    'Path', 'PurePath', 'PosixPath', 'WindowsPath',
    'PurePosixPath', 'PureWindowsPath',
}


def _extract_module_vars(text: str) -> set:
    """F28 (S17f): Identify module/namespace identifiers so module calls are not confused with pathlib receivers."""
    mods = set(_KNOWN_MODULE_RECEIVERS)
    for m in re.finditer(r'\bimport\s+(?:os|posix|nt|shutil|pathlib|io)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)', text):
        mods.add(m.group(1))
    for m in re.finditer(
        r'([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:require\s*\(\s*[\'"](?:node:)?(?:fs(?:/promises)?|path|os|child_process)[\'"]\s*\)(?:\s*\.\s*promises)?|(?:fs|os|shutil|pathlib)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)',
        text,
    ):
        mods.add(m.group(1))
    return mods


def _is_module_receiver_expr(recv_expr: str, module_vars: Optional[set] = None) -> bool:
    """Return True if recv_expr is a module/namespace/class receiver (e.g. os, fs, fs.promises, require('fs')), NOT a Path instance."""
    s = _strip_outer_parens(recv_expr)
    if not s:
        return True
    mods = module_vars if module_vars is not None else _KNOWN_MODULE_RECEIVERS
    if s in mods:
        return True
    if '(' not in s and any(s.startswith(m_name + '.') for m_name in mods):
        return True
    if re.match(
        r"^require\s*\(\s*['\"](?:node:)?(?:fs(?:/promises)?|path|os|child_process|shutil)['\"]\s*\)(?:\s*\.\s*promises)?$",
        s,
    ):
        return True
    return False


def _extract_module_call_arg_lists(
    text: str,
    prefix_pattern: str,
    module_vars: Optional[set] = None,
) -> List[List[str]]:
    """
    F28 (S17f): Extract argument lists for module/standalone function calls.
    If the matched call is preceded by `.` (a method call), only accept it if the receiver before `.`
    is a module/namespace receiver (`_is_module_receiver_expr`), skipping pathlib Path instance calls.
    """
    results: List[List[str]] = []
    for m in re.finditer(prefix_pattern, text):
        j = m.start() - 1
        while j >= 0 and text[j] in (' ', '\t'):
            j -= 1
        if j >= 0 and text[j] == '.':
            recv_expr = _extract_receiver_before_dot(text, j)
            if not _is_module_receiver_expr(recv_expr, module_vars):
                continue
        args, _ = _scan_balanced_paren_args(text, m.end())
        if args is not None:
            results.append(args)
    return results



def _extract_chained_call_arg_lists(
    text: str,
    prefix_pattern: str,
    chained_method_pattern: str,
) -> List[Tuple[List[str], str, List[str]]]:
    """
    F16a (S17d): Extract balanced constructor args and chained method args,
    e.g. Path(os.path.join('operations','data','approvals','x.jsonl')).write_text('x').
    """
    results: List[Tuple[List[str], str, List[str]]] = []
    method_re = re.compile(chained_method_pattern)
    for m in re.finditer(prefix_pattern, text):
        ctor_args, close_idx = _scan_balanced_paren_args(text, m.end())
        if ctor_args is None:
            continue
        tail = text[close_idx + 1 :]
        mm = method_re.match(tail)
        if not mm:
            continue
        method_name = mm.group(1) if mm.lastindex else ""
        method_args, _ = _scan_balanced_paren_args(tail, mm.end())
        if method_args is None:
            method_args = []
        results.append((ctor_args, method_name, method_args))
    return results




