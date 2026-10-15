#!/usr/bin/env python3
r"""
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

            # Kiểm tra redirection ngoài nháy: >, >>, >|, <, <<, <<-, N>, N>>, N>|, N<
            # Xét xem ký tự này có phải là bắt đầu toán tử redirection không
            is_redir = False
            op = ""
            step = 0

            if ch in ('>', '<'):
                if i + 1 < length and chars[i:i+2] == ['>', '>']:
                    op = '>>'
                    step = 2
                elif i + 1 < length and chars[i:i+2] == ['>', '|']:
                    op = '>|'
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

            elif ch.isdigit() and not current_word:
                # Ví dụ 1>, 2>, 0<, 1>>, 2>|, 3>, 3>>
                d_end = i
                while d_end < length and chars[d_end].isdigit():
                    d_end += 1
                if d_end < length and chars[d_end] in ('>', '<'):
                    fd_str = ''.join(chars[i:d_end])
                    if d_end + 1 < length and chars[d_end:d_end+2] == ['>', '>']:
                        op = fd_str + '>>'
                        step = (d_end - i) + 2
                    elif d_end + 1 < length and chars[d_end:d_end+2] == ['>', '|']:
                        op = fd_str + '>|'
                        step = (d_end - i) + 2
                    else:
                        op = fd_str + chars[d_end]
                        step = (d_end - i) + 1
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

                # Toán tử chuyển hướng ghi đè >| (không phải ống |)
                if ch == '>' and i + 1 < length and chars[i+1] == '|':
                    current_cmd.append(ch)
                    current_cmd.append(chars[i+1])
                    i += 2
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
    if real_p.lower().startswith(real_project_dir.lower() + '/'):
        real_p = real_project_dir + real_p[len(real_project_dir):]

    try:
        rel = os.path.relpath(real_p, real_project_dir)
    except ValueError:
        rel = real_p

    return rel.replace('\\', '/')


def logical_rel_path(raw_path: str, cwd: str, project_dir: str) -> str:
    """
    Chuẩn hoá đường dẫn của CHÍNH mục đích (giải realpath thư mục cha nhưng giữ nguyên basename cuối),
    không áp symlinks_map lên chính mục đích để xét vị trí thật của liên kết mới tạo/ghi đè.
    """
    p = raw_path.strip().strip("'\"")
    if not p:
        return ""
    if not os.path.isabs(p):
        full_p = os.path.normpath(os.path.join(cwd, os.path.expanduser(p)))
    else:
        full_p = os.path.normpath(os.path.expanduser(p))

    parent_dir = os.path.dirname(full_p)
    leaf_name = os.path.basename(full_p)
    try:
        real_parent = os.path.realpath(parent_dir) if parent_dir else os.path.realpath(cwd)
    except Exception:
        real_parent = parent_dir

    combined = os.path.normpath(os.path.join(real_parent, leaf_name)) if leaf_name else real_parent
    real_project_dir = os.path.realpath(os.path.expanduser(project_dir))
    if combined.lower().startswith(real_project_dir.lower() + '/'):
        combined = real_project_dir + combined[len(real_project_dir):]
    elif combined.lower() == real_project_dir.lower():
        combined = real_project_dir

    try:
        rel = os.path.relpath(combined, real_project_dir)
    except ValueError:
        rel = combined

    return rel.replace('\\', '/')


def _seg_matches_protected(seg: str, protected_names: Tuple[str, ...]) -> bool:
    if not seg:
        return False
    seg_low = seg.lower()
    names_low = tuple(n.lower() for n in protected_names)
    if seg_low in names_low:
        return True
    if any(ch in seg_low for ch in ('*', '?', '[')):
        return any(fnmatch.fnmatchcase(name, seg_low) for name in names_low)
    return False


def is_in_project_dau_vao(rel_path: str) -> bool:
    """Kiểm tra rel_path có nằm trong projects/<project>/inputs/... hoặc CAC-DU-AN/<project>/DAU-VAO/... không."""
    norm = rel_path.replace('\\', '/')
    parts = [p for p in norm.split('/') if p and p != '.']
    if '..' in parts:
        return False
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
    if layout.FINAL_SUFFIX.lower() in filename.lower():
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

    # 1. Redirections: >, >>, >|, N>, N>>, N>|
    for op, target in cmd.redirections:
        clean_target = target.strip("'\"")
        if clean_target in ('/dev/null', '&1', '&2') or clean_target.startswith('&'):
            continue
        if re.match(r'^\d*(?:>>|>\||>)$', op):
            targets.append((clean_target, f"redirection {op}"))

    for tf in getattr(cmd, "script_transcript_files", []):
        if tf and tf != '/dev/null':
            targets.append((tf, "script transcript file"))

    # 2. Lệnh ghi file: cp, mv, git mv, git rm, ln, install, rsync, ditto, rm, touch, truncate, unlink, rmdir, tee, sponge, sed, perl, dd
    base = cmd.executable
    words = cmd.words

    if getattr(cmd, "via_xargs", False) and base in (
        'cp', 'install', 'rsync', 'ditto', 'ln', 'mv', 'rm', 'touch', 'truncate', 'unlink', 'rmdir', 'tee', 'sponge', 'sed', 'perl', 'dd'
    ):
        targets.append(("$DYNAMIC_WRITE:xargs", f"{base} via xargs"))

    if base in ('cp', 'install', 'rsync', 'ditto'):
        non_flags = []
        skip_next = False
        for w in words[1:]:
            if skip_next:
                skip_next = False
                continue
            if base == 'install' and w in ('-m', '-o', '-g', '-S'):
                skip_next = True
                continue
            if not w.startswith('-'):
                non_flags.append(w.strip("'\""))
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

    elif base == 'ln':
        flags = [w for w in words[1:] if w.startswith('-')]
        non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
        is_symbolic = any(f == '--symbolic' or (not f.startswith('--') and 's' in f) for f in flags)
        if len(non_flags) >= 2:
            dest = non_flags[-1]
            sources = non_flags[:-1]
            if not is_symbolic:
                for s in sources:
                    targets.append((s, "ln hardlink source"))
            if is_dynamic_write_target(dest):
                targets.append((dest, "ln dynamic destination"))
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
                        targets.append((os.path.join(dest, os.path.basename(s)), "ln to directory"))
                else:
                    targets.append((dest, "ln destination"))

    elif base == 'mv':
        non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
        for a in non_flags:
            targets.append((a, "mv source or destination"))

    elif base == 'git':
        w_idx = 1
        subcmd = None
        subcmd_args: List[str] = []
        while w_idx < len(words):
            w = words[w_idx]
            if w in ('-C', '-c', '--git-dir', '--work-tree'):
                w_idx += 2
                continue
            if w.startswith('-'):
                w_idx += 1
                continue
            subcmd = w
            subcmd_args = words[w_idx + 1:]
            break
        if subcmd == 'mv':
            for a in subcmd_args:
                if not a.startswith('-'):
                    targets.append((a.strip("'\""), "git mv source or destination"))
        elif subcmd == 'rm':
            has_cached = False
            after_dd = False
            rm_paths = []
            for a in subcmd_args:
                if not after_dd:
                    if a == '--':
                        after_dd = True
                        continue
                    if a == '--cached':
                        has_cached = True
                        continue
                    if a.startswith('-'):
                        continue
                clean_a = a.strip("'\"")
                if clean_a:
                    rm_paths.append(clean_a)
            if not has_cached:
                for p in rm_paths:
                    targets.append((p, "git rm target"))

    elif base in ('rm', 'touch', 'truncate', 'unlink', 'rmdir'):
        after_dd = False
        skip_next = False
        for w in words[1:]:
            if skip_next:
                skip_next = False
                continue
            if not after_dd:
                if w == '--':
                    after_dd = True
                    continue
                if base == 'truncate' and w in ('-s', '--size', '-r', '--reference'):
                    skip_next = True
                    continue
                if base == 'touch' and w in ('-t', '-d', '-r'):
                    skip_next = True
                    continue
                if w.startswith('-'):
                    continue
            clean_w = w.strip("'\"")
            if clean_w:
                targets.append((clean_w, f"{base} target"))

    elif base == 'tee':
        is_append = any(
            w == '--append' or (w.startswith('-') and not w.startswith('--') and 'a' in w[1:])
            for w in words[1:]
        )
        reason_label = "tee append target" if is_append else "tee overwrite target"
        after_dd = False
        for w in words[1:]:
            if not after_dd:
                if w == '--':
                    after_dd = True
                    continue
                if w.startswith('-'):
                    continue
            clean_w = w.strip("'\"")
            if clean_w:
                targets.append((clean_w, reason_label))

    elif base == 'sponge':
        is_append = any(
            w == '--append' or (w.startswith('-') and not w.startswith('--') and 'a' in w[1:])
            for w in words[1:]
        )
        reason_label = "sponge append target" if is_append else "sponge overwrite target"
        after_dd = False
        for w in words[1:]:
            if not after_dd:
                if w == '--':
                    after_dd = True
                    continue
                if w.startswith('-'):
                    continue
            clean_w = w.strip("'\"")
            if clean_w:
                targets.append((clean_w, reason_label))

    elif base == 'sed':
        has_inplace = any(w.startswith('-i') or w == '-i' for w in words[1:])
        if has_inplace:
            passed_script = False
            for w in words[1:]:
                if w.startswith('-'):
                    continue
                clean_w = w.strip("'\"")
                if not clean_w:
                    continue
                if not passed_script and (clean_w.startswith('s/') or clean_w.startswith('y/') or clean_w.startswith('d') or ';' in clean_w):
                    passed_script = True
                    continue
                if not passed_script and ('s/' in clean_w or 'g' in clean_w):
                    passed_script = True
                    continue
                targets.append((clean_w, "sed inplace"))

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

        # F45 (S17j) & F48 (S17k Option A): Resolve both open mode and path variables at each call site (call_pos),
        # evaluating the union of loop-body / iterator bindings when call_pos is inside a loop.
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(combined_raw, r'\bopen\s*\('):
            if not call_args:
                continue
            path_expr = call_args[0]
            mode_expr = _extract_open_mode_expr(call_args[1:])
            if mode_expr is not None:
                mode_cands = _resolve_script_path_expr_candidates(
                    mode_expr, combined_raw, call_pos=call_pos, default_join_style=default_join
                )
                if any(
                    rm.startswith('$DYNAMIC_WRITE:') or re.match(r'^(?:[wax]|[rwax]\+|[rwax]b?\+|[bt]?[wax])', rm)
                    for rm in mode_cands
                ):
                    for resolved_target in _resolve_script_path_expr_candidates(
                        path_expr, combined_raw, call_pos=call_pos, default_join_style=default_join
                    ):
                        label = "python open dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python open write"
                        targets.append((resolved_target, label))

        # F20a, F27, F28, F33, F34, F37, F38 (S17h) & F48 (S17k): Call-site-ordered receiver classification for pathlib methods
        # (.write_text, .write_bytes, .open, .unlink, .rmdir, .touch, .mkdir, .symlink_to, .hardlink_to, .rename, .replace).
        # Principle 1: Exempt ONLY when receiver at call_pos is provably non-file (module or string).
        # Principle 2: When receiver at call_pos is ambiguous, classify .rename/.replace by argument shape.
        # Principle 3: Use bindings active BEFORE call_pos in linear code, and union loop-body bindings inside loops.
        for recv_expr, method_name, method_args, call_pos in _extract_method_calls_with_receiver_and_pos(
            combined_raw,
            ('write_text', 'write_bytes', 'open', 'unlink', 'rmdir', 'touch', 'mkdir', 'symlink_to', 'hardlink_to', 'rename', 'replace'),
        ):
            call_var_env = _extract_simple_var_env(combined_raw, default_join_style=default_join, call_pos=call_pos)
            call_module_vars = _extract_module_vars(combined_raw, call_pos=call_pos)
            call_path_vars, call_str_vars, call_ambig_vars = _extract_receiver_type_vars_at_pos(combined_raw, call_pos=call_pos)
            if not recv_expr or _is_module_receiver_expr(recv_expr, call_module_vars):
                continue
            if method_name == 'open':
                mode_expr = _extract_open_mode_expr(method_args)
                if mode_expr is None:
                    continue
                mode_cands = _resolve_script_path_expr_candidates(
                    mode_expr, combined_raw, call_pos=call_pos, default_join_style=default_join
                )
                if not any(
                    rm.startswith('$DYNAMIC_WRITE:')
                    or re.match(r'^(?:[wax]|[rwax]\+|[rwax]b?\+|[bt]?[wax])', rm)
                    for rm in mode_cands
                ):
                    continue
                for resolved_target in _resolve_script_path_expr_candidates(
                    recv_expr, combined_raw, call_pos=call_pos, default_join_style=default_join
                ):
                    label = "python Path dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python Path.open"
                    targets.append((resolved_target, label))
            elif method_name in ('rename', 'replace'):
                recv_clean = _strip_outer_parens(recv_expr)
                is_certain_str = (
                    _is_provably_str_receiver_expr(recv_clean, call_str_vars)
                    and recv_clean not in call_ambig_vars
                )
                if is_certain_str:
                    continue
                is_certain_path = (
                    _is_path_receiver_expr(recv_clean, call_path_vars)
                    and recv_clean not in call_ambig_vars
                )
                if not is_certain_path and not _args_look_like_file_path_move(method_name, method_args, call_var_env):
                    continue
                for resolved_src in _resolve_script_path_expr_candidates(
                    recv_expr, combined_raw, call_pos=call_pos, default_join_style='python'
                ):
                    src_label = f"python Path.{method_name} dynamic source" if resolved_src.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} source"
                    targets.append((resolved_src, src_label))
                if method_args:
                    dst_cands = _resolve_script_path_expr_candidates(
                        method_args[0], combined_raw, call_pos=call_pos, default_join_style='python'
                    )
                else:
                    dst_cands = ["$DYNAMIC_WRITE:empty"]
                for resolved_dst in dst_cands:
                    dst_label = f"python Path.{method_name} dynamic destination" if resolved_dst.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} destination"
                    targets.append((resolved_dst, dst_label))
            else:
                for resolved_target in _resolve_script_path_expr_candidates(
                    recv_expr, combined_raw, call_pos=call_pos, default_join_style=default_join
                ):
                    if method_name in ('unlink', 'rmdir'):
                        label = f"python Path.{method_name} dynamic delete" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name} delete"
                    else:
                        label = "python Path dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python Path.{method_name}"
                    targets.append((resolved_target, label))

        # Node fs single-target writes (F27, F28, F45 & F48: resolve bindings at call_pos with loop union)
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream)\s*\(',
        ):
            if not call_args:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[0], combined_raw, call_pos=call_pos, default_join_style='node'
            ):
                label = "node fs dynamic write" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs write"
                targets.append((resolved_target, label))

        # Node fs single-target deletes, mkdir & truncate
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:unlinkSync|rmSync|rm|rmdirSync|mkdirSync|truncateSync)\s*\(',
        ):
            if not call_args:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[0], combined_raw, call_pos=call_pos, default_join_style='node'
            ):
                label = "node fs dynamic delete" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs delete"
                targets.append((resolved_target, label))

        # Node fs callback/promise unlink/rmdir/mkdir (distinguished from Python os.unlink/rmdir/mkdir by default_join)
        if base == 'node' or 'fs.' in combined_raw or "require('fs" in combined_raw or 'require("fs' in combined_raw or "require('node:fs" in combined_raw or 'require("node:fs' in combined_raw:
            for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
                combined_raw,
                r'\b(?:unlink|rmdir|mkdir|truncate)\s*\(',
            ):
                if not call_args:
                    continue
                for resolved_target in _resolve_script_path_expr_candidates(
                    call_args[0], combined_raw, call_pos=call_pos, default_join_style='node'
                ):
                    label = "node fs dynamic delete" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs delete"
                    targets.append((resolved_target, label))

        # Node fs copy & link/symlink (destination is arg[1])
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:copyFileSync|cpSync|copyFile|cp|linkSync|symlinkSync)\s*\(',
        ):
            if len(call_args) < 2:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[1], combined_raw, call_pos=call_pos, default_join_style='node'
            ):
                label = "node fs dynamic copy/link" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs copy/link"
                targets.append((resolved_target, label))

        if base == 'node' or 'fs.' in combined_raw or "require('fs" in combined_raw or 'require("fs' in combined_raw or "require('node:fs" in combined_raw or 'require("node:fs' in combined_raw:
            for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
                combined_raw,
                r'\b(?:link|symlink)\s*\(',
            ):
                if len(call_args) < 2:
                    continue
                for resolved_target in _resolve_script_path_expr_candidates(
                    call_args[1], combined_raw, call_pos=call_pos, default_join_style='node'
                ):
                    label = "node fs dynamic link" if resolved_target.startswith('$DYNAMIC_WRITE:') else "node fs link"
                    targets.append((resolved_target, label))

        # F20b, F45 & F48: Node fs rename / renameSync — check BOTH source (arg[0]) and destination (arg[1]) at call_pos
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:renameSync|rename)\s*\(',
        ):
            if len(call_args) < 2:
                continue
            for idx_arg, role in ((0, "source"), (1, "destination")):
                for resolved_target in _resolve_script_path_expr_candidates(
                    call_args[idx_arg], combined_raw, call_pos=call_pos, default_join_style='node'
                ):
                    label = f"node fs dynamic rename {role}" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"node fs rename {role}"
                    targets.append((resolved_target, label))

        # F27a, F45 & F48: Python shutil.copy / copy2 / copyfile / copytree (destination is arg[1]) at call_pos
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:shutil\.)?(?:copy|copy2|copyfile|copytree)\s*\(',
        ):
            if len(call_args) < 2:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[1], combined_raw, call_pos=call_pos, default_join_style='python'
            ):
                label = "python shutil dynamic copy" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python shutil copy"
                targets.append((resolved_target, label))

        # F27b, F45 & F48: Python os.link / os.symlink (destination is arg[1]) at call_pos
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:os\.)?(?:link|symlink)\s*\(',
        ):
            if len(call_args) < 2:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[1], combined_raw, call_pos=call_pos, default_join_style='python'
            ):
                label = "python os.link dynamic destination" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python os.link destination"
                targets.append((resolved_target, label))

        # F20b, F45 & F48: Python shutil.move, os.rename, os.replace — check BOTH source (arg[0]) and destination (arg[1]) at call_pos
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:shutil\.move|os\.(?:replace|rename)|replace)\s*\(',
        ):
            if len(call_args) < 2:
                continue
            for idx_arg, role in ((0, "source"), (1, "destination")):
                for resolved_target in _resolve_script_path_expr_candidates(
                    call_args[idx_arg], combined_raw, call_pos=call_pos, default_join_style='python'
                ):
                    label = f"python move/rename dynamic {role}" if resolved_target.startswith('$DYNAMIC_WRITE:') else f"python move/rename {role}"
                    targets.append((resolved_target, label))

        # F27, F28, F45 & F48: Python os.remove, os.unlink, os.rmdir, os.removedirs, os.mkdir, os.makedirs, shutil.rmtree (single target arg[0]) at call_pos
        for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
            combined_raw,
            r'\b(?:os\.(?:remove|unlink|rmdir|removedirs|mkdir|makedirs|truncate)|shutil\.rmtree|remove|removedirs|makedirs|rmtree)\s*\(',
        ):
            if not call_args:
                continue
            for resolved_target in _resolve_script_path_expr_candidates(
                call_args[0], combined_raw, call_pos=call_pos, default_join_style='python'
            ):
                label = "python delete dynamic target" if resolved_target.startswith('$DYNAMIC_WRITE:') else "python delete target"
                targets.append((resolved_target, label))

        if base != 'node':
            for call_args, call_pos in _extract_module_call_arg_lists_with_pos(
                combined_raw,
                r'\b(?:unlink|rmdir|mkdir)\s*\(',
            ):
                if not call_args:
                    continue
                for resolved_target in _resolve_script_path_expr_candidates(
                    call_args[0], combined_raw, call_pos=call_pos, default_join_style='python'
                ):
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

    # S17i (F42 & F43): Resolve str(inner) and 1-arg Path.replace(dst) / Path.rename(dst) chains
    m_str_call = re.match(r"^str\s*\(", s)
    if m_str_call:
        str_args, str_close = _scan_balanced_paren_args(s, m_str_call.end())
        if str_args is not None and len(str_args) == 1 and str_close == len(s) - 1:
            return resolve_script_path_expr(str_args[0], var_env=var_env, default_join_style=default_join_style)

    m_move_tail = re.search(r"\.\s*(?:replace|rename)\s*\(", s)
    if m_move_tail:
        mv_args, mv_close = _scan_balanced_paren_args(s, m_move_tail.end())
        if mv_args is not None and len(mv_args) == 1 and mv_close == len(s) - 1:
            recv_part = s[:m_move_tail.start()].strip()
            resolved_recv = resolve_script_path_expr(recv_part, var_env=var_env, default_join_style="python")
            if not resolved_recv.startswith("$DYNAMIC_WRITE:"):
                return resolve_script_path_expr(mv_args[0], var_env=var_env, default_join_style="python")

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


def _iter_top_level_assignments_with_pos(text: str) -> List[Tuple[str, str, int, int]]:
    """
    S17h (Principle 3), S17j (F45, F47) & S17l (F51): Yield (var_name, rhs, start_pos, end_pos) in appearance order for
    top-level assignments across `;` and newline-separated statements, including JS comma-separated declarations,
    flat object destructuring (`const {client,url}=...`, `const {delete: del, post}=axios`), and JS/Python branches/loops.
    """
    assign_re = re.compile(r'^(?:(?:const|let|var)\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(\+?=)(?![=~>])(.+)$', re.DOTALL)
    destruct_re = re.compile(r'^(?:(?:const|let|var)\s+)?\{([^{}]+)\}\s*=(?![=~>])(.+)$', re.DOTALL)
    ident_re = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')
    out: List[Tuple[str, str, int, int]] = []
    for m_stmt in re.finditer(r'[^;\n]+', text):
        raw_stmt = m_stmt.group(0)
        stmt_start = m_stmt.start()
        stmt_end = m_stmt.end()
        s = raw_stmt.strip()
        if not s:
            continue
        s_clean = re.sub(r'^(?:.*?\s)?(?:-[a-zA-Z]*[ce]|--eval|--print)\s+[\'"]?', '', s).strip()
        # Strip leading JS block/loop/conditional openers (both braced `{` and braceless `if(flag) p=...`, `case x: p=...`)
        s_clean = re.sub(
            r'^(?:(?:(?:for\s*(?:await\s*)?\([^()]*\)|while\s*\([^()]*\)|do\b|if\s*\([^()]*\)|else\s+if\s*\([^()]*\)|else\b(?!\s*:)|switch\s*\([^()]*\)|case\s+[^:]+:|default\s*:|try\b(?!\s*:)|catch\s*(?:\([^()]*\))?|finally\b(?!\s*:))\s*\{*\s*)|(?:[^={}]+?\)\s*\{+\s*)|\{+\s*)+',
            '',
            s_clean,
        ).strip()
        # Strip leading Python compound suite headers on single-line suites (`for _ in range(2): p='...'`)
        s_clean = re.sub(
            r'^(?:(?:async\s+)?(?:for|while|if|elif|else|try|except|finally|with)\b[^:\n]*:\s*)+',
            '',
            s_clean,
        ).strip()
        # Strip unmatched trailing closing braces `}` and outer CLI quote from the end of JS blocks
        while s_clean.endswith(('}', '}"', "}'")) and s_clean.count('}') > s_clean.count('{'):
            if s_clean.endswith(('}"', "}'")):
                s_clean = s_clean[:-2].rstrip()
            else:
                s_clean = s_clean[:-1].rstrip()
        if not s_clean:
            continue

        clauses = [c.strip() for c in _split_top_level_op(s_clean, ',') if c.strip()]
        if len(clauses) > 1 and all(assign_re.match(_strip_outer_parens(c)) or destruct_re.match(_strip_outer_parens(c)) for c in clauses):
            target_clauses = [_strip_outer_parens(c) for c in clauses]
        elif not assign_re.match(_strip_outer_parens(s_clean)) and not destruct_re.match(_strip_outer_parens(s_clean)):
            # F51: Extract embedded assignments inside short-circuit `cond && (p = ...)` / `cond || (p = ...)` or ternary `cond ? (p = a) : (p = b)`
            sub_exprs: List[str] = [s_clean]
            for op in ('&&', '||', '?', ':'):
                next_subs: List[str] = []
                for sub in sub_exprs:
                    unwrapped = _strip_outer_parens(sub.strip())
                    if assign_re.match(unwrapped) or destruct_re.match(unwrapped):
                        next_subs.append(unwrapped)
                    else:
                        next_subs.extend(_split_top_level_op(unwrapped, op))
                sub_exprs = next_subs
            target_clauses = []
            for sub in sub_exprs:
                unwrapped = _strip_outer_parens(sub.strip())
                for c in _split_top_level_op(unwrapped, ','):
                    cu = _strip_outer_parens(c.strip())
                    if assign_re.match(cu) or destruct_re.match(cu):
                        target_clauses.append(cu)
            if not target_clauses:
                target_clauses = [_strip_outer_parens(s_clean)]
        else:
            target_clauses = [_strip_outer_parens(s_clean)]

        offset_cursor = stmt_start
        for clause in target_clauses:
            rel_idx = raw_stmt.find(clause, max(0, offset_cursor - stmt_start))
            if rel_idx >= 0:
                c_start = stmt_start + rel_idx
                c_end = c_start + len(clause)
                offset_cursor = c_end
            else:
                c_start = stmt_start
                c_end = stmt_end

            m_dest = destruct_re.match(clause)
            if m_dest:
                lhs_inner = m_dest.group(1).strip()
                rhs_raw = _strip_outer_parens(m_dest.group(2).strip())
                rhs_map: Dict[str, str] = {}
                is_obj_rhs = rhs_raw.startswith('{') and rhs_raw.endswith('}')
                if is_obj_rhs:
                    for prop in _split_top_level_op(rhs_raw[1:-1], ','):
                        p_str = prop.strip()
                        if not p_str:
                            continue
                        colon_parts = _split_top_level_op(p_str, ':')
                        if len(colon_parts) >= 2:
                            pk = colon_parts[0].strip().strip("'\"")
                            pv = ":".join(colon_parts[1:]).strip()
                        else:
                            pk = p_str.strip("'\"")
                            pv = p_str
                        if pk:
                            rhs_map[pk] = pv
                for item in _split_top_level_op(lhs_inner, ','):
                    it_s = _split_top_level_op(item.strip(), '=')[0].strip()
                    if not it_s:
                        continue
                    if ':' in it_s:
                        prop_k, local_v = [x.strip() for x in it_s.split(':', 1)]
                    else:
                        prop_k = local_v = it_s
                    prop_k = prop_k.strip("'\"")
                    if not ident_re.match(local_v) or not ident_re.match(prop_k):
                        continue
                    if is_obj_rhs and prop_k in rhs_map:
                        out.append((local_v, rhs_map[prop_k], c_start, c_end))
                    else:
                        out.append((local_v, f"{rhs_raw}.{prop_k}", c_start, c_end))
                continue

            m = assign_re.match(clause)
            if not m:
                continue
            var_name = m.group(1)
            op_tok = m.group(2)
            rhs = m.group(3).strip()
            if var_name in ('import', 'from', 'return', 'if', 'elif', 'while', 'for', 'assert'):
                continue
            if op_tok == '+=':
                rhs = f"{var_name} + ({rhs})"
            out.append((var_name, rhs, c_start, c_end))
    return out


def _iter_top_level_assignments(text: str) -> List[Tuple[str, str]]:
    return [(v, r) for v, r, _, _ in _iter_top_level_assignments_with_pos(text)]


def _find_top_level_colon(line_str: str, start_idx: int) -> int:
    """Return index of the first top-level ':' (outside quotes and balanced brackets) at or after start_idx, or -1."""
    quote: Optional[str] = None
    escape = False
    depth = 0
    for i in range(start_idx, len(line_str)):
        ch = line_str[i]
        if escape:
            escape = False
            continue
        if ch == '\\' and quote is not None:
            escape = True
            continue
        if quote is not None:
            if ch == quote:
                quote = None
            continue
        if ch in ("'", '"', '`'):
            quote = ch
            continue
        if ch == '#':
            return -1
        if ch in ('(', '[', '{'):
            depth += 1
            continue
        if ch in (')', ']', '}'):
            depth = max(0, depth - 1)
            continue
        if ch == ':' and depth == 0:
            return i
    return -1


def _advance_js_single_stmt_end(text: str, start_idx: int) -> int:
    """
    S17l (F53): Given `start_idx` right after a braceless JS control header (`for (...)`, `while (...)`, `if (...)`, `else`),
    advance past any chained braceless JS control headers (`if (...)`, `else if (...)`, `else`, `for (...)`, `while (...)`,
    `with (...)`, `switch (...)`) across newlines until the leaf `{ ... }` block or terminating `;` / `\n`.
    """
    cur_k = start_idx
    n = len(text)
    while cur_k < n:
        while cur_k < n and text[cur_k] in (' ', '\t', '\r', '\n'):
            cur_k += 1
        if cur_k >= n:
            return n
        m_hdr = re.match(r'^(?:if|else\s+if|for\s*(?:await\s*)?|while|with|switch)\s*\(', text[cur_k:])
        if m_hdr:
            after_p = cur_k + m_hdr.end()
            _, close_p = _scan_balanced_paren_args(text, after_p)
            if close_p < n:
                after_close = close_p + 1
                while after_close < n and text[after_close] in (' ', '\t'):
                    after_close += 1
                if after_close < n and text[after_close] == ':':
                    break
                cur_k = close_p + 1
                continue
        m_else = re.match(r'^(?:else|do)\b(?!\s*:)', text[cur_k:])
        if m_else:
            cur_k += m_else.end()
            continue
        break
    while cur_k < n and text[cur_k] in (' ', '\t', '\r', '\n'):
        cur_k += 1
    if cur_k < n and text[cur_k] == '{':
        _, close_b = _scan_balanced_paren_args(text, cur_k + 1)
        return close_b
    nl_idx = text.find('\n', cur_k)
    semi_idx = text.find(';', cur_k)
    end_cands = [idx for idx in (nl_idx, semi_idx) if idx >= 0]
    return min(end_cands) if end_cands else n


def _is_assignment_conditional(text: str, c_start: int, c_end: int) -> bool:
    """
    S17l (F51): Return True if the assignment at `[c_start, c_end]` is inside or guarded by a
    conditional/exception branch in Python (`if`/`elif`/`else`/`try`/`except`/`finally`) or JS
    (`if`/`else if`/`else`/`switch`/`case`/`try`/`catch`/`finally`, braced or braceless, or
    short-circuit `&&`/`||` / ternary `? :`).
    """
    # 1. Same-statement / same-line prefix before `c_start`
    last_semi = text.rfind(';', 0, c_start)
    last_nl = text.rfind('\n', 0, c_start)
    stmt_bound = max(last_semi, last_nl) + 1
    stmt_prefix = text[stmt_bound:c_start]
    if re.search(
        r'\b(?:if|elif|else|switch|case|default|try|catch|except|finally)\b|&&|\|\||\?',
        stmt_prefix,
    ):
        return True
    if last_nl + 1 < stmt_bound:
        line_prefix = text[last_nl + 1 : c_start]
        if re.search(r'\b(?:if|elif|else|try|except|finally)\b[^#\n]*:', line_prefix):
            return True

    # 2. Enclosing JS braced or braceless `if (...)`, `else if (...)`, `switch (...)`, `catch (...)`
    for m_js in re.finditer(r'\b(if|else\s+if|switch|catch)\s*\(', text):
        h_start = m_js.start()
        if h_start > c_start:
            break
        _, close_p = _scan_balanced_paren_args(text, m_js.end())
        if close_p >= len(text):
            continue
        k = close_p + 1
        while k < len(text) and text[k] in (' ', '\t'):
            k += 1
        if k < len(text) and text[k] == ':':
            continue
        b_end = _advance_js_single_stmt_end(text, close_p + 1)
        if h_start <= c_start and c_end <= b_end:
            return True

    # 3. Enclosing JS `else`, `try`, `finally`, or bare `catch` (braced or braceless)
    for m_kw in re.finditer(r'\b(else|try|finally|catch)\b(?!\s*(?:if\b|\(|:))', text):
        h_start = m_kw.start()
        if h_start > c_start:
            break
        b_end = _advance_js_single_stmt_end(text, m_kw.end())
        if h_start <= c_start and c_end <= b_end:
            return True

    # 4. Enclosing Python `if`/`elif`/`else`/`try`/`except`/`finally` block (multi-line indented or single-line)
    if re.search(r'\b(?:if|elif|else|try|except|finally)\b[^;#\n]*:', text[:c_start]):
        return True

    return False


def _find_all_loops(
    text: str,
) -> List[Tuple[int, int, int, Optional[str], Optional[str], str]]:
    """
    S17k (F48 — Option A) & S17l (F53): Find all loop constructs (`for`, `while`, `do`) in `text`.
    Returns list of `(header_start, body_start, body_end, iter_var, iter_expr, loop_kind)`.
    """
    loops: List[Tuple[int, int, int, Optional[str], Optional[str], str]] = []

    # 1. JS / C-style `for (...)`, `while (...)`, and `do { ... }` loops
    for m in re.finditer(r'\b(for|while)\s*(?:await\s*)?\(', text):
        kw = m.group(1)
        h_start = m.start()
        open_paren_after = m.end()
        _, close_paren_idx = _scan_balanced_paren_args(text, open_paren_after)
        if close_paren_idx >= len(text):
            continue
        k = close_paren_idx + 1
        while k < len(text) and text[k] in (' ', '\t'):
            k += 1
        if k < len(text) and text[k] == ':':
            continue
        header_inner = text[open_paren_after:close_paren_idx].strip()
        iter_var: Optional[str] = None
        iter_expr: Optional[str] = None
        loop_kind = f'js_{kw}'
        if kw == 'for':
            m_of = re.match(
                r'^(?:(?:const|let|var)\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s+(of|in)\s+(.+)$',
                header_inner,
                re.DOTALL,
            )
            if m_of:
                iter_var = m_of.group(1)
                iter_expr = m_of.group(3).strip() if m_of.group(2) == 'of' else None
                loop_kind = 'js_for_of' if m_of.group(2) == 'of' else 'js_for_in'
        body_start = open_paren_after
        body_end = _advance_js_single_stmt_end(text, close_paren_idx + 1)
        loops.append((h_start, body_start, body_end, iter_var, iter_expr, loop_kind))

    for m_do in re.finditer(r'\bdo\s*\{', text):
        h_start = m_do.start()
        body_start = m_do.end() - 1
        _, close_brace_idx = _scan_balanced_paren_args(text, m_do.end())
        body_end = close_brace_idx
        loops.append((h_start, body_start, body_end, None, None, 'js_do'))

    # 2. Python `for <var> in <expr>:` and `while <cond>:` loops (multi-line indented or single-line suite)
    line_spans: List[Tuple[int, int, str]] = []
    pos = 0
    for l_str in text.splitlines(keepends=True):
        line_spans.append((pos, pos + len(l_str), l_str))
        pos += len(l_str)

    py_loop_prefix_re = re.compile(
        r'(?:^|[;]|-[a-zA-Z]*c\s+[\'"]?|--eval\s+[\'"]?)(\s*)(?:async\s+)?(for|while)\b\s*'
    )
    for idx, (l_start, l_end, l_str) in enumerate(line_spans):
        for m_py in py_loop_prefix_re.finditer(l_str):
            kw = m_py.group(2)
            colon_rel = _find_top_level_colon(l_str, m_py.end())
            if colon_rel < 0:
                continue
            header_expr = l_str[m_py.end() : colon_rel].strip()
            iter_var = None
            iter_expr = None
            loop_kind = f'py_{kw}'
            if kw == 'for':
                m_in = re.match(
                    r'^([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)\s+in\s+(.+)$',
                    header_expr,
                    re.DOTALL,
                )
                if not m_in:
                    continue
                iter_var = m_in.group(1).strip()
                iter_expr = m_in.group(2).strip()
            h_start = l_start + m_py.start()
            body_start = l_start + colon_rel + 1
            rest_of_line = l_str[colon_rel + 1 :].strip()
            if rest_of_line and not rest_of_line.startswith('#'):
                body_end = l_end
            else:
                stripped_l = l_str.lstrip(' \t')
                base_indent = len(l_str) - len(stripped_l)
                body_end = l_end
                for j in range(idx + 1, len(line_spans)):
                    _, j_end, j_str = line_spans[j]
                    j_stripped = j_str.strip()
                    if not j_stripped or j_stripped.startswith('#'):
                        continue
                    j_indent = len(j_str) - len(j_str.lstrip(' \t'))
                    if j_indent > base_indent:
                        body_end = j_end
                    else:
                        break
            loops.append((h_start, body_start, body_end, iter_var, iter_expr, loop_kind))

    return loops


def _find_enclosing_loops(
    text: str,
    call_pos: int,
) -> List[Tuple[int, int, int, Optional[str], Optional[str], str]]:
    """
    S17k (F48 — Option A) & S17l (F53): Find all loop constructs (`for`, `while`, `do`) in `text` whose body
    encloses `call_pos`.
    Note: Text order equals execution order ONLY when the code segment is linear; inside a loop body,
    assignments appearing textually after `call_pos` take effect BEFORE `call_pos` on the next iteration.
    """
    return [lp for lp in _find_all_loops(text) if lp[1] <= call_pos <= lp[2]]


def _extract_iterable_path_candidates(
    iter_expr: Optional[str],
    var_env: Dict[str, str],
    default_join_style: str,
    iter_var: str,
) -> List[str]:
    """
    S17k (F48 — Option A): Resolve static iterable literals (`['wip/a', 'wip/b']`, `('wip/a', ...)`,
    `new Set(['wip/a', ...])`) into their list of candidate path values; return `['$DYNAMIC_WRITE:<var>']`
    when the iterable is dynamic or unresolvable.
    """
    if not iter_expr:
        return [f"$DYNAMIC_WRITE:{iter_var}"]
    s = iter_expr.strip()
    while s.endswith(('"', "'")) and s.count(s[-1]) % 2 == 1:
        s = s[:-1].strip()
    m_wrap = re.match(r'^(?:new\s+Set|Array\.from|list|tuple|set)\s*\((.+)\)$', s, re.DOTALL)
    if m_wrap:
        s = m_wrap.group(1).strip()
    is_list_or_tuple = (s.startswith('[') and s.endswith(']')) or (s.startswith('(') and s.endswith(')'))
    is_set_lit = s.startswith('{') and s.endswith('}') and ':' not in s
    if is_list_or_tuple or is_set_lit:
        inner = s[1:-1].strip()
        if not inner:
            return []
        raw_items = [it.strip() for it in _split_top_level_op(inner, ',') if it.strip()]
        if not raw_items:
            return []
        resolved_items: List[str] = []
        for it in raw_items:
            rp = resolve_script_path_expr(it, var_env=var_env, default_join_style=default_join_style)
            if rp not in resolved_items:
                resolved_items.append(rp)
        return resolved_items
    return [f"$DYNAMIC_WRITE:{iter_var}"]


def _resolve_expr_with_multi_env(
    expr: str,
    multi_env: Dict[str, List[str]],
    default_join_style: str = "auto",
) -> List[str]:
    """
    Resolve `expr` against every combination of candidate bindings in `multi_env` for variables referenced in `expr`,
    including JS ternary `cond ? a : b` and Python conditional expression `a if cond else b` (S17l F51).
    """
    s = _strip_outer_parens(expr.strip())
    q_parts = _split_top_level_op(s, '?')
    if len(q_parts) == 2:
        c_parts = _split_top_level_op(q_parts[1], ':')
        if len(c_parts) >= 2:
            b1 = c_parts[0].strip()
            b2 = ':'.join(c_parts[1:]).strip()
            res: List[str] = []
            for branch_expr in (b1, b2):
                for r in _resolve_expr_with_multi_env(branch_expr, multi_env, default_join_style=default_join_style):
                    if r not in res:
                        res.append(r)
            return res

    m_py_tern = re.match(r'^(.+?)\s+\bif\b\s+.+?\s+\belse\b\s+(.+)$', s, re.DOTALL)
    if m_py_tern:
        res_py: List[str] = []
        for branch_expr in (m_py_tern.group(1).strip(), m_py_tern.group(2).strip()):
            for r in _resolve_expr_with_multi_env(branch_expr, multi_env, default_join_style=default_join_style):
                if r not in res_py:
                    res_py.append(r)
        return res_py

    referenced_vars = [
        v for v in multi_env
        if multi_env[v] and re.search(rf'\b{re.escape(v)}\b', expr)
    ]
    if not referenced_vars:
        base_env = {k: vals[-1] for k, vals in multi_env.items() if vals}
        return [resolve_script_path_expr(expr, var_env=base_env, default_join_style=default_join_style)]

    combos: List[Dict[str, str]] = [{k: vals[-1] for k, vals in multi_env.items() if vals}]
    for v in referenced_vars:
        next_combos: List[Dict[str, str]] = []
        for c_env in combos:
            for cand_val in multi_env[v]:
                new_env = dict(c_env)
                new_env[v] = cand_val
                next_combos.append(new_env)
                if len(next_combos) > 16:
                    break
            if len(next_combos) > 16:
                break
        combos = next_combos

    results: List[str] = []
    for c_env in combos:
        rp = resolve_script_path_expr(expr, var_env=c_env, default_join_style=default_join_style)
        if rp not in results:
            results.append(rp)
    if len(combos) > 16:
        dyn_marker = f"$DYNAMIC_WRITE:{_strip_outer_parens(expr)}"
        if dyn_marker not in results:
            results.append(dyn_marker)
    return results


def _extract_simple_var_env(
    text: str,
    default_join_style: str = "auto",
    call_pos: Optional[int] = None,
) -> Dict[str, str]:
    """
    F43 (S17i), F45 (S17j), F48 (S17k) & F51 (S17l): Extract simple variable assignments active BEFORE `call_pos`
    (Principle 3: reassignments AFTER `call_pos` do not affect `call_pos` in linear code).
    IMPORTANT: Text order equals execution order ONLY when the code segment is linear. Inside a loop body
    (`for`/`while`/`do`), assignments appearing textually after `call_pos` take effect before `call_pos`
    on the next iteration — use `_resolve_script_path_expr_candidates` to evaluate reaching bindings.
    """
    env: Dict[str, str] = {}
    counts: Dict[str, int] = {}
    for var_name, rhs, c_start, c_end in _iter_top_level_assignments_with_pos(text):
        if call_pos is not None and c_end > call_pos:
            continue
        counts[var_name] = counts.get(var_name, 0) + 1
        is_cond = _is_assignment_conditional(text, c_start, c_end)
        if (call_pos is None or is_cond) and counts[var_name] > 1:
            env[var_name] = f"$DYNAMIC_WRITE:{var_name}"
        elif is_cond and counts[var_name] == 1:
            env[var_name] = f"$DYNAMIC_WRITE:{var_name}"
        else:
            env[var_name] = resolve_script_path_expr(rhs, var_env=env, default_join_style=default_join_style)
    return env


def _extract_simple_var_multi_env(
    text: str,
    default_join_style: str = "auto",
    call_pos: Optional[int] = None,
) -> Dict[str, List[str]]:
    """
    S17k (F48 — Option A) & S17l (F51, F52, F52c, F53): Compute reaching candidate bindings for each variable at `call_pos`.
    - Conditional assignments (`if`/`elif`/`else`/`switch`/`try`/`catch`/`finally` in Python or JS, braced or braceless,
      ternary `? :`, or short-circuit `&&`/`||`) NEVER overwrite prior bindings: they union their candidate values with
      the pre-branch candidate values (closing F51 while allowing wip-only branches like F51e).
    - Unconditional assignments outside non-enclosing loops replace the variable's candidate list at that program point,
      so dead pre-loop or post-call bindings that are unconditionally overwritten before `call_pos` on every iteration
      are killed (closing F52 and F52c while keeping F48 8/8).
    """
    if call_pos is None:
        base_env = _extract_simple_var_env(text, default_join_style=default_join_style, call_pos=None)
        return {k: [v] for k, v in base_env.items()}

    all_loops = _find_all_loops(text)
    enclosing_loops = [lp for lp in all_loops if lp[1] <= call_pos <= lp[2]]
    all_assigns = _iter_top_level_assignments_with_pos(text)

    def _apply_assignment(
        m_env: Dict[str, List[str]],
        var_name: str,
        rhs: str,
        c_start: int,
        c_end: int,
        force_union: bool = False,
    ) -> None:
        is_cond = force_union or _is_assignment_conditional(text, c_start, c_end)
        for lp in all_loops:
            if lp[1] <= c_start and c_end <= lp[2] and not (lp[1] <= call_pos <= lp[2]):
                is_cond = True
                break
        is_self_ref = bool(re.search(rf'\b{re.escape(var_name)}\b', rhs))
        if is_self_ref and var_name not in m_env:
            m_env[var_name] = [f"$DYNAMIC_WRITE:{var_name}"]
        rhs_cands = _resolve_expr_with_multi_env(rhs, m_env, default_join_style=default_join_style)
        if is_self_ref:
            prev_vals = m_env.get(var_name, [])
            if any(rc not in prev_vals for rc in rhs_cands):
                dyn_m = f"$DYNAMIC_WRITE:{var_name}"
                if dyn_m not in rhs_cands:
                    rhs_cands = list(rhs_cands) + [dyn_m]
        if is_cond:
            if var_name not in m_env:
                m_env[var_name] = [f"$DYNAMIC_WRITE:{var_name}"]
            existing = m_env[var_name]
            for rc in rhs_cands:
                if rc not in existing:
                    existing.append(rc)
        else:
            m_env[var_name] = list(rhs_cands)

    if not enclosing_loops:
        multi_env: Dict[str, List[str]] = {}
        for var_name, rhs, c_start, c_end in all_assigns:
            if c_end > call_pos:
                continue
            _apply_assignment(multi_env, var_name, rhs, c_start, c_end)
        return multi_env

    outer_h_start = min(lp[0] for lp in enclosing_loops)
    outer_b_end = max(lp[2] for lp in enclosing_loops)

    multi_env = {}
    for var_name, rhs, c_start, c_end in all_assigns:
        if c_end > outer_h_start:
            continue
        _apply_assignment(multi_env, var_name, rhs, c_start, c_end)

    iter_vars_cands: Dict[str, List[str]] = {}
    cur_env_for_iter = {k: vals[-1] for k, vals in multi_env.items() if vals}
    for _h_start, _b_start, _b_end, iter_var, iter_expr, _l_kind in enclosing_loops:
        if iter_var:
            for raw_v in iter_var.split(','):
                v = raw_v.strip()
                if not v:
                    continue
                if ',' in iter_var or iter_expr is None:
                    cands = [f"$DYNAMIC_WRITE:{v}"]
                else:
                    cands = _extract_iterable_path_candidates(iter_expr, cur_env_for_iter, default_join_style, v)
                iter_vars_cands[v] = list(cands)
                if cands:
                    cur_env_for_iter[v] = cands[-1]

    pre_call_loop_assigns = [
        a for a in all_assigns if outer_h_start <= a[2] and a[3] <= call_pos
    ]
    post_call_loop_assigns = [
        a for a in all_assigns if a[2] > call_pos and a[3] <= outer_b_end
    ]

    reaching_at_call: Dict[str, List[str]] = {}
    for _iteration in range(3):
        # At the top of each iteration, loop iterator variables receive their iterable candidates
        for iv, icands in iter_vars_cands.items():
            existing_iv = multi_env.setdefault(iv, [])
            for c in icands:
                if c not in existing_iv:
                    existing_iv.append(c)

        # Execute statements in the loop body before `call_pos`
        for var_name, rhs, c_start, c_end in pre_call_loop_assigns:
            force_u = var_name in iter_vars_cands
            _apply_assignment(multi_env, var_name, rhs, c_start, c_end, force_union=force_u)

        # Record all candidate bindings that reach `call_pos` on this iteration
        for k, vals in multi_env.items():
            dest = reaching_at_call.setdefault(k, [])
            for val in vals:
                if val not in dest:
                    dest.append(val)

        if not post_call_loop_assigns:
            break

        # Execute statements in the loop body after `call_pos` before wrapping to the next iteration
        for var_name, rhs, c_start, c_end in post_call_loop_assigns:
            if _iteration == 0 and var_name not in multi_env:
                multi_env[var_name] = [f"$DYNAMIC_WRITE:{var_name}"]
            force_u = var_name in iter_vars_cands
            _apply_assignment(multi_env, var_name, rhs, c_start, c_end, force_union=force_u)

    return reaching_at_call


def _resolve_script_path_expr_candidates(
    expr: str,
    text: str,
    call_pos: Optional[int],
    default_join_style: str = "auto",
) -> List[str]:
    """
    S17k (F48 — Option A) & S17l (F51, F52, F53): Resolve `expr` at `call_pos` into all reaching candidate target strings.
    """
    multi_env = _extract_simple_var_multi_env(text, default_join_style=default_join_style, call_pos=call_pos)
    cands = _resolve_expr_with_multi_env(expr, multi_env, default_join_style=default_join_style)
    return cands if cands else [f"$DYNAMIC_WRITE:{_strip_outer_parens(expr)}"]


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


def _extract_method_calls_with_receiver_and_pos(
    text: str,
    method_names: Tuple[str, ...],
) -> List[Tuple[str, str, List[str], int]]:
    """
    F20a (S17e) & S17h: Find all `.method_name(...)` calls in `text` and return
    `(receiver_expr, method_name, method_args, dot_idx)` for each call.
    """
    results: List[Tuple[str, str, List[str], int]] = []
    alt = "|".join(re.escape(m) for m in method_names)
    pat = re.compile(rf'\.\s*({alt})\s*\(')
    for m in pat.finditer(text):
        dot_idx = m.start()
        method_name = m.group(1)
        receiver_expr = _extract_receiver_before_dot(text, dot_idx)
        method_args, _ = _scan_balanced_paren_args(text, m.end())
        if method_args is None:
            method_args = []
        results.append((receiver_expr, method_name, method_args, dot_idx))
    return results


def _extract_method_calls_with_receiver(
    text: str,
    method_names: Tuple[str, ...],
) -> List[Tuple[str, str, List[str]]]:
    return [(r, m, a) for r, m, a, _ in _extract_method_calls_with_receiver_and_pos(text, method_names)]


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
    'posixpath', 'ntpath', 'pathlib', 'io', 'sys',
    'Path', 'PurePath', 'PosixPath', 'WindowsPath',
    'PurePosixPath', 'PureWindowsPath',
}


def _extract_module_vars(text: str, call_pos: Optional[int] = None) -> set:
    """
    F28 (S17f), F33 (S17g) & S17h (Principle 3): Identify module/namespace/class identifiers from real
    import/require/alias bindings active BEFORE `call_pos`, while constructor instances (`path = Path(...)`,
    `p = pathlib.Path(...)`) are NEVER misclassified as modules.
    """
    mods = set(_KNOWN_MODULE_RECEIVERS)

    for m in re.finditer(
        r'\bimport\s+(?:os|posix|nt|shutil|pathlib|posixpath|ntpath|io|sys)(?:\.path)?(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?',
        text,
    ):
        if call_pos is not None and m.end() > call_pos:
            continue
        if m.group(1):
            mods.add(m.group(1))
    for m in re.finditer(
        r'\bfrom\s+(?:os|posix|nt|pathlib)\s+import\s+((?:path|Path|PurePath|PosixPath|WindowsPath|PurePosixPath|PureWindowsPath)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?)',
        text,
    ):
        if call_pos is not None and m.end() > call_pos:
            continue
        spec = m.group(1).strip()
        if ' as ' in spec:
            mods.add(spec.split(' as ', 1)[1].strip())
        else:
            mods.add(spec)

    for m in re.finditer(
        r'\bimport\s+(?:\*\s+as\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+[\'"](?:node:)?(?:fs(?:/promises)?|path(?:/posix)?|os|child_process)[\'"]',
        text,
    ):
        if call_pos is not None and m.end() > call_pos:
            continue
        mods.add(m.group(1))

    for var_name, raw_rhs, _c_start, c_end in _iter_top_level_assignments_with_pos(text):
        if call_pos is not None and c_end > call_pos:
            continue
        rhs = _strip_outer_parens(raw_rhs.strip()).rstrip("'\"").strip()
        if re.match(
            r'^require\s*\(\s*[\'"](?:node:)?(?:fs(?:/promises)?|path(?:/posix)?|os|child_process)[\'"]\s*\)(?:\s*\.\s*(?:promises|posix))?$',
            rhs,
        ):
            mods.add(var_name)
        elif re.match(r'^(?:fs|os|shutil|pathlib)\s*\.\s*[A-Za-z_][A-Za-z0-9_]*$', rhs):
            mods.add(var_name)
        else:
            mods.discard(var_name)

    return mods


def _is_module_receiver_expr(recv_expr: str, module_vars: Optional[set] = None) -> bool:
    """Return True if recv_expr is a module/namespace/class receiver (e.g. os, fs, fs.promises, require('fs')), NOT a Path instance."""
    s = _strip_outer_parens(recv_expr)
    if not s:
        return True
    if re.match(
        r"^require\s*\(\s*['\"](?:node:)?(?:fs(?:/promises)?|path(?:/posix)?|os|child_process|shutil)['\"]\s*\)(?:\s*\.\s*(?:promises|posix))?$",
        s,
    ):
        return True
    if '(' in s or '/' in s:
        return False
    mods = module_vars if module_vars is not None else _KNOWN_MODULE_RECEIVERS
    if s in mods:
        return True
    if any(s.startswith(m_name + '.') for m_name in mods):
        return True
    return False


_PATH_RETURNING_CHAIN_TAIL_RE = re.compile(
    r'^(?:\s*\.\s*(?:parent|with_name\s*\([^()]*\)|with_suffix\s*\([^()]*\)|with_stem\s*\([^()]*\)|resolve\s*\([^()]*\)|absolute\s*\([^()]*\)|expanduser\s*\([^()]*\)|joinpath\s*\([^()]*\)|replace\s*\([^()]*\)|rename\s*\([^()]*\)))*\s*$'
)

_STR_RETURNING_TAIL_RE = re.compile(
    r'(?:\.\s*(?:name|stem|suffix)\s*$|\.\s*(?:as_posix|as_uri|strip|lstrip|rstrip|lower|upper|title|capitalize|casefold|swapcase|format|join|decode|read_text)\s*\([^()]*\)\s*$)'
)


def _is_provably_str_receiver_expr(
    recv_expr: str,
    str_vars: Optional[set] = None,
) -> bool:
    """
    S17h (Principle 1 & F37) & S17i (F42, F43): Return True ONLY when `recv_expr` is provably a `str` at the call site:
    - String literal (`'a b'`, `"abc"`), optionally chained with string methods (`'a b'.strip()`),
    - `str(...)` call (`str(p)`),
    - String-returning attribute or method on Path/str (`.name`, `.stem`, `.suffix`, `.as_posix()`, `.as_uri()`, `.strip()`, `.read_text()`),
    - Variable in `str_vars` whose active binding before `call_pos` is provably `str`,
    - `.replace(...)` call ONLY when its receiver is itself provably `str` (since `Path.replace` returns `Path`).
    """
    s = _strip_outer_parens(recv_expr)
    if not s:
        return False
    if ' if ' in s and ' else ' in s:
        return False
    svars = str_vars if str_vars is not None else set()
    if s in svars:
        return True
    if any(s.startswith(sv + '.') for sv in svars):
        return True
    if re.match(r"^(?:[rRbBuUfF]{0,2})(['\"])(?:\\.|(?!\1).)*\1(?:\s*\.\s*(?:strip|lstrip|rstrip|lower|upper|title|replace|format)\s*\([^()]*\))*\s*$", s):
        return True
    if re.match(r'^str\s*\(', s):
        return True
    m_rep = re.search(r'\.\s*replace\s*\([^()]*\)\s*$', s)
    if m_rep:
        return _is_provably_str_receiver_expr(s[:m_rep.start()], svars)
    if _STR_RETURNING_TAIL_RE.search(s):
        return True
    return False


def _is_path_receiver_expr(
    recv_expr: str,
    path_vars: Optional[set] = None,
    path_classes: Optional[set] = None,
) -> bool:
    """
    F34 (S17g) & F37/F38 (S17h Principle 1): Return True ONLY when `recv_expr` has static evidence of being
    a `pathlib.Path` instance at the call site.
    Only propagates `Path` through constructors (`Path(...)`, `pathlib.Path(...)`, `Path.cwd()`, `Path.home()`),
    `/` division with a `Path`, and Path-returning properties/methods (`.parent`, `.with_name()`, `.with_suffix()`,
    `.with_stem()`, `.resolve()`, `.absolute()`, `.expanduser()`, `.joinpath()`).
    NEVER propagates `Path` through `.name`, `.stem`, `.suffix`, `.as_posix()`, or `str(...)`.
    """
    s = _strip_outer_parens(recv_expr)
    if not s:
        return False
    if _is_provably_str_receiver_expr(s):
        return False
    pvars = path_vars if path_vars is not None else set()
    pclasses = path_classes if path_classes is not None else {
        'Path', 'PurePath', 'PosixPath', 'WindowsPath', 'PurePosixPath', 'PureWindowsPath'
    }
    if s in pvars:
        return True
    for pv in pvars:
        if s.startswith(pv + '.') and _PATH_RETURNING_CHAIN_TAIL_RE.match(s[len(pv):]):
            return True

    for cls_pat in (
        r'^(?:pathlib\s*\.\s*)?(?:Path|PurePath|PosixPath|WindowsPath|PurePosixPath|PureWindowsPath)\s*\(',
        r'^(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?(?:Path|PosixPath|WindowsPath)\s*\.\s*(?:cwd|home)\s*\(',
    ):
        m_ctor = re.match(cls_pat, s)
        if m_ctor:
            _, close_idx = _scan_balanced_paren_args(s, m_ctor.end())
            if close_idx < len(s) and _PATH_RETURNING_CHAIN_TAIL_RE.match(s[close_idx + 1:]):
                return True

    for cls_name in pclasses:
        m_cls = re.match(rf'^{re.escape(cls_name)}\s*\(', s)
        if m_cls:
            _, close_idx = _scan_balanced_paren_args(s, m_cls.end())
            if close_idx < len(s) and _PATH_RETURNING_CHAIN_TAIL_RE.match(s[close_idx + 1:]):
                return True

    slash_parts = _split_top_level_op(s, '/')
    if len(slash_parts) > 1:
        if not _is_provably_str_receiver_expr(slash_parts[-1]) and any(
            _is_path_receiver_expr(part, pvars, pclasses) for part in slash_parts
        ):
            return True
    return False


def _extract_receiver_type_vars_at_pos(
    text: str,
    call_pos: Optional[int] = None,
) -> Tuple[set, set, set]:
    """
    S17h (Principle 3 — F37 & F38): Compute `(path_vars, str_vars, ambig_vars)` at `call_pos` using
    ONLY bindings that appear BEFORE `call_pos`.
    If a variable is assigned `>= 2` bindings of different types before `call_pos`, it is placed in
    `ambig_vars` so Principle 2 (argument-shape classification) applies.
    """
    path_vars: set = set()
    str_vars: set = set()
    ambig_vars: set = set()
    seen_kinds: Dict[str, set] = {}
    path_classes = {'Path', 'PurePath', 'PosixPath', 'WindowsPath', 'PurePosixPath', 'PureWindowsPath'}
    for m in re.finditer(
        r'\bfrom\s+pathlib\s+import\s+(?:Path|PurePath|PosixPath|WindowsPath|PurePosixPath|PureWindowsPath)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)',
        text,
    ):
        if call_pos is not None and m.end() > call_pos:
            continue
        path_classes.add(m.group(1))
    for m in re.finditer(
        r'\bimport\s+pathlib\s+as\s+([A-Za-z_][A-Za-z0-9_]*)',
        text,
    ):
        if call_pos is not None and m.end() > call_pos:
            continue
        path_classes.add(m.group(1) + '.Path')

    enclosing_loops = _find_enclosing_loops(text, call_pos) if call_pos is not None else []
    effective_end = max([call_pos] + [lp[2] for lp in enclosing_loops]) if call_pos is not None else None
    outer_loop_start = min(lp[0] for lp in enclosing_loops) if enclosing_loops else None

    for var_name, raw_rhs, c_start, c_end in _iter_top_level_assignments_with_pos(text):
        if effective_end is not None and c_end > effective_end:
            continue
        rhs = _strip_outer_parens(raw_rhs.strip())
        if _is_provably_str_receiver_expr(rhs, str_vars):
            kind = 'str'
        elif _is_path_receiver_expr(rhs, path_vars, path_classes):
            kind = 'path'
        else:
            kind = 'other'
        kinds = seen_kinds.setdefault(var_name, set())
        kinds.add(kind)
        has_branch_before = _is_assignment_conditional(text, c_start, c_end)
        in_enclosing_loop = outer_loop_start is not None and c_start >= outer_loop_start
        if (has_branch_before or in_enclosing_loop) and len(kinds) > 1:
            ambig_vars.add(var_name)
            path_vars.discard(var_name)
            str_vars.discard(var_name)
        elif kind == 'path':
            path_vars.add(var_name)
            str_vars.discard(var_name)
            ambig_vars.discard(var_name)
        elif kind == 'str':
            str_vars.add(var_name)
            path_vars.discard(var_name)
            ambig_vars.discard(var_name)
        else:
            ambig_vars.add(var_name)
            path_vars.discard(var_name)
            str_vars.discard(var_name)

    return path_vars, str_vars, ambig_vars


def _extract_path_vars(text: str, call_pos: Optional[int] = None) -> set:
    path_vars, _, _ = _extract_receiver_type_vars_at_pos(text, call_pos=call_pos)
    return path_vars


def _expr_looks_like_file_path_arg(arg_expr: str, var_env: Dict[str, str]) -> bool:
    """
    S17h (Principle 2): Check whether a method argument looks like a file path (contains `/`,
    has a file extension, matches protected directory segments, or is an unresolvable dynamic expression).
    Plain string tokens (`' '`, `'-'`, `'_'`, `'a'`, `'b'`, numbers) return False.
    """
    s = _strip_outer_parens(arg_expr.strip())
    if not s:
        return False
    if re.match(r'^[0-9]+$', s):
        return False
    resolved = resolve_script_path_expr(s, var_env=var_env, default_join_style='python')
    if resolved.startswith('$DYNAMIC_WRITE:'):
        # If it is a quoted literal, check the literal directly; otherwise unresolvable variable -> fail-closed
        if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
            val = s[1:-1]
        else:
            return True
    else:
        val = resolved
    if '/' in val or '\\' in val:
        return True
    low = val.lower()
    for prot in (
        'projects', 'cac-du-an', 'inputs', 'dau-vao', 'outputs', 'dau-ra',
        'operations', 'approvals', '_sample-ground-truth', 'du-an-mau-su-that', '_final', 'wip', 'dang-lam',
    ):
        if prot in low:
            return True
    if re.search(r'[A-Za-z0-9_-]\.[A-Za-z0-9]{1,6}$', val):
        return True
    return False


def _args_look_like_file_path_move(
    method_name: str,
    method_args: List[str],
    var_env: Dict[str, str],
) -> bool:
    """
    S17h (Principle 2): When the receiver of `.rename(...)` or `.replace(...)` is ambiguous at `call_pos`,
    classify by argument shape:
    - `.rename(dst)` is not a Python `str` method -> treat as file move when `len(method_args) >= 1`.
    - `.replace(dst)` with 1 argument is `Path.replace(dst)` (`str.replace` requires >= 2 args).
    - `.replace(a, b)` with >= 2 arguments is treated as file move if any of the first 2 arguments
      looks like a file path (or is unresolvable), and exempted as `str.replace` when both are plain tokens.
    """
    if method_name == 'rename':
        return len(method_args) >= 1
    if len(method_args) <= 1:
        return True
    return any(_expr_looks_like_file_path_arg(arg, var_env) for arg in method_args[:2])


def _extract_module_call_arg_lists_with_pos(
    text: str,
    prefix_pattern: str,
    module_vars: Optional[set] = None,
) -> List[Tuple[List[str], int]]:
    """
    F28 (S17f) & F45 (S17j): Extract `(args, call_pos)` for module/standalone function calls.
    If the matched call is preceded by `.` (a method call), only accept it if the receiver before `.`
    is a module/namespace receiver (`_is_module_receiver_expr`) evaluated at `call_pos`, skipping
    pathlib Path instance calls.
    """
    results: List[Tuple[List[str], int]] = []
    for m in re.finditer(prefix_pattern, text):
        call_pos = m.start()
        j = call_pos - 1
        while j >= 0 and text[j] in (' ', '\t'):
            j -= 1
        if j >= 0 and text[j] == '.':
            recv_expr = _extract_receiver_before_dot(text, j)
            active_mods = module_vars if module_vars is not None else _extract_module_vars(text, call_pos=call_pos)
            if not _is_module_receiver_expr(recv_expr, active_mods):
                continue
        args, _ = _scan_balanced_paren_args(text, m.end())
        if args is not None:
            results.append((args, call_pos))
    return results


def _extract_module_call_arg_lists(
    text: str,
    prefix_pattern: str,
    module_vars: Optional[set] = None,
) -> List[List[str]]:
    return [args for args, _ in _extract_module_call_arg_lists_with_pos(text, prefix_pattern, module_vars)]



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


# ==============================================================================
# HÀM DÙNG CHUNG NHẬN DIỆN HEREDOC GHI TỆP VÀ NGOẠI LỆ «GHI RỒI CHẠY» (v10/v11)
# ==============================================================================

HEREDOC_OPEN_REGEX = re.compile(r'(?<!<)<<(?!<)(-?)\s*([\'"]?)([A-Za-z0-9_]+)\2')

SCRIPT_RUNNERS = {'python', 'python3', 'node', 'bash', 'sh', 'zsh', 'ruby', 'perl', 'osascript', 'source', '.'}
SCRIPT_EXTENSIONS = ('.py', '.sh', '.js', '.mjs')
EXEMPT_PRINT_COMMANDS = {'echo', 'printf', 'grep', 'rg', 'cat', 'sed', 'awk', 'head', 'tail', 'less'}


def split_shell_tokens(sub_cmd: str) -> List[str]:
    try:
        return shlex.split(sub_cmd)
    except Exception:
        return sub_cmd.strip().split()


def extract_heredoc_file_write_target(header_line: str) -> str:
    """Nếu dòng mở heredoc là cat > f <<X, cat >> f <<X hay tee [-a] f <<X (không nối ống sang trình chạy),
    trả về tên tệp đích f; ngược lại trả về chuỗi rỗng.
    """
    segments = re.split(r'&&|\|\||;', header_line)
    hd_seg = ""
    for seg in segments:
        if HEREDOC_OPEN_REGEX.search(seg):
            hd_seg = seg.strip()
            break
    if not hd_seg:
        return ""

    without_hd = HEREDOC_OPEN_REGEX.sub("", hd_seg).strip()

    if "|" in without_hd or "|" in hd_seg:
        pipe_parts = [p.strip() for p in HEREDOC_OPEN_REGEX.sub("", hd_seg).split("|") if p.strip()]
        if len(pipe_parts) == 2:
            first_toks = split_shell_tokens(pipe_parts[0])
            second_toks = split_shell_tokens(pipe_parts[1])
            if first_toks and os.path.basename(first_toks[0].strip('\'"')) == "cat":
                if second_toks and os.path.basename(second_toks[0].strip('\'"')) == "tee":
                    for arg in second_toks[1:]:
                        clean_arg = arg.strip('\'"')
                        if clean_arg and not clean_arg.startswith("-"):
                            return clean_arg
        return ""

    redir_match = re.search(r'(?:^|\s)\d*>>?\s*([^\s><|;&]+)', without_hd)
    cmd_without_redir = re.sub(r'(?:^|\s)\d*>>?\s*[^\s><|;&]+', ' ', without_hd).strip()
    toks = split_shell_tokens(cmd_without_redir)
    idx = 0
    while idx < len(toks) and '=' in toks[idx] and not toks[idx].startswith('-'):
        idx += 1
    if idx >= len(toks):
        return ""

    exe_base = os.path.basename(toks[idx].strip('\'"'))
    if exe_base == "cat" and redir_match:
        return redir_match.group(1).strip('\'"')
    if exe_base == "tee":
        for arg in toks[idx + 1:]:
            clean_arg = arg.strip('\'"')
            if clean_arg and not clean_arg.startswith("-"):
                return clean_arg
        if redir_match:
            return redir_match.group(1).strip('\'"')
    return ""


def split_heredocs(raw_cmd: str) -> Tuple[str, Dict[str, str]]:
    """Tách thân các heredoc ghi vào tệp khỏi chuỗi lệnh chính.
    Trả về (cmd_without_file_heredoc_bodies, heredoc_written_files).
    Các heredoc chảy thẳng vào shell/trình thông dịch giữ nguyên trong chuỗi lệnh.
    """
    cmd_active, heredoc_written_files, _ = split_heredocs_detailed(raw_cmd)
    return cmd_active, heredoc_written_files


def split_heredocs_detailed(raw_cmd: str) -> Tuple[str, Dict[str, str], List[str]]:
    """Tách heredoc chi tiết:
    Trả về (cmd_without_file_heredoc_bodies, heredoc_written_files, active_heredoc_bodies).
    """
    lines = raw_cmd.splitlines()
    active_lines: List[str] = []
    heredoc_written_files: Dict[str, str] = {}
    active_heredoc_bodies: List[str] = []

    in_hd = False
    hd_delim = ""
    hd_strip_tabs = False
    hd_target_file = ""
    hd_body_lines: List[str] = []

    for line in lines:
        if in_hd:
            check_line = line.lstrip('\t') if hd_strip_tabs else line
            if check_line.strip() == hd_delim:
                body_text = "\n".join(hd_body_lines)
                if hd_target_file:
                    clean_key = hd_target_file.strip('\'"')
                    if clean_key.startswith("./"):
                        clean_key = clean_key[2:]
                    heredoc_written_files[clean_key] = body_text
                    base_key = os.path.basename(clean_key)
                    if base_key:
                        heredoc_written_files[base_key] = body_text
                else:
                    active_lines.extend(hd_body_lines)
                    active_lines.append(line)
                    active_heredoc_bodies.append(body_text)
                in_hd = False
                hd_delim = ""
                hd_target_file = ""
                hd_body_lines = []
            else:
                hd_body_lines.append(line)
        else:
            m = HEREDOC_OPEN_REGEX.search(line)
            if m:
                in_hd = True
                hd_strip_tabs = (m.group(1) == "-")
                hd_delim = m.group(3)
                hd_target_file = extract_heredoc_file_write_target(line)
                hd_body_lines = []
                active_lines.append(line)
            else:
                active_lines.append(line)

    if in_hd and hd_body_lines:
        active_lines.extend(hd_body_lines)
        active_heredoc_bodies.append("\n".join(hd_body_lines))

    return "\n".join(active_lines), heredoc_written_files, active_heredoc_bodies


def get_executed_script_arg(sub_cmd: str) -> str:
    """Nếu sub_cmd chạy một tệp kịch bản (qua bash/sh/zsh/python/python3/node/ruby/perl/osascript/source/. hoặc ./f),
    trả về đối số đường dẫn kịch bản; ngược lại trả về chuỗi rỗng.
    """
    tokens = split_shell_tokens(sub_cmd)
    if not tokens:
        return ""

    idx = 0
    while idx < len(tokens) and '=' in tokens[idx] and not tokens[idx].startswith('-'):
        idx += 1
    if idx >= len(tokens):
        return ""

    first_token = tokens[idx].strip('\'"')
    base_cmd = os.path.basename(first_token)

    if base_cmd in EXEMPT_PRINT_COMMANDS:
        return ""

    script_arg = ""
    if base_cmd in SCRIPT_RUNNERS:
        i = idx + 1
        while i < len(tokens):
            arg = tokens[i].strip('\'"')
            if arg in ('-c', '-lc', '-e'):
                return ""
            if arg.startswith('-'):
                i += 1
                continue
            script_arg = arg
            break
    elif first_token.startswith('./') or first_token.startswith('../') or any(first_token.endswith(ext) for ext in SCRIPT_EXTENSIONS):
        script_arg = first_token

    if not script_arg or script_arg == '-':
        return ""
    return script_arg


def find_heredoc_body_for_script(script_arg: str, heredoc_written_files: Optional[Dict[str, str]]) -> str:
    """Tìm nội dung heredoc vừa ghi cho tệp script_arg trong cùng chuỗi lệnh (ngoại lệ «ghi rồi chạy»)."""
    if not heredoc_written_files or not script_arg:
        return ""
    clean_arg = script_arg.strip('\'"')
    if clean_arg.startswith("./"):
        clean_arg = clean_arg[2:]
    base_arg = os.path.basename(clean_arg)
    return heredoc_written_files.get(clean_arg) or heredoc_written_files.get(base_arg) or ""


def extract_executed_heredocs(raw_cmd: str) -> List[str]:
    """Trả về danh sách các thân heredoc cần kiểm tra như mã/lệnh thực thi:
    1) Heredoc chảy thẳng vào shell hoặc trình thông dịch (không phải cat > f / cat >> f / tee f);
    2) Heredoc ghi vào tệp f mà tệp f được chạy ở lệnh con sau trong cùng chuỗi lệnh.
    """
    cmd_active, heredoc_written_files, active_heredoc_bodies = split_heredocs_detailed(raw_cmd)
    result = list(active_heredoc_bodies)
    if heredoc_written_files:
        cmd_joined = re.sub(r'\\\s*\n', ' ', cmd_active)
        for raw_sub in re.split(r'&&|\|\||;|\||\n', cmd_joined):
            sub = raw_sub.strip()
            if not sub:
                continue
            script_arg = get_executed_script_arg(sub)
            if script_arg:
                hd_body = find_heredoc_body_for_script(script_arg, heredoc_written_files)
                if hd_body:
                    result.append(hd_body)
    return result
