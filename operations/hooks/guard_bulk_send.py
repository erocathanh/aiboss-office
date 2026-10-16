#!/usr/bin/env python3
"""Hook 6: guard_bulk_send.py
Kiểm soát các lệnh gửi tin nhắn/email ra ngoài (Meta, Zalo, Resend, SendGrid, SMTP hoặc MCP send/broadcast/reply...).
Ghi sổ duyệt che PII vào operations/data/approvals/<YYYY-MM-DD>.jsonl và chặn thực thi (exit mã 2).
Cập nhật theo BỔ SUNG-01, PHA H1 v02, OPC v07, v09 và v10:
- Gộp dòng nối bằng dấu backslash.
- Tách và kiểm tra từng lệnh con độc lập (&&, ||, ;, |, newline).
- Nhận diện cờ curl POST/data phân biệt hoa/thường, nhận cờ ngắn gộp (-sd).
- Nhận diện cổng :443, -X 'POST', --request=POST, -T/--upload-file.
- Nhận diện batch/relative_url chứa messages tới graph.facebook.com.
- Nhận diện lệnh có cả graph.facebook.com và /messages, /feed, /comments, /photos hoặc lệnh xoá (delete).
- Nhận diện lệnh xoá tới graph.facebook.com (curl -X DELETE/--request DELETE hoặc mã có delete).
- Nhận diện cờ --dong-y khi chạy script (python, node, bash, sh, zsh, hoặc tệp .py/.sh/.js/.mjs).
- Nhận diện curl -K / --config.
- Nhận diện curl gửi dữ liệu tới địa chỉ đích mở đầu bằng biến ($X, ${X}/...).
- Nhận diện chạy tệp kịch bản trong dự án (< 1 MB, giải đường theo cd đứng trước) chứa mẫu địa chỉ gửi, miễn trừ bộ kịch bản bảo trì/test của kho.
- Thân heredoc ghi vào tệp là dữ liệu (chỉ xét khi chảy vào shell/trình thông dịch hoặc tệp vừa ghi được chạy ở lệnh con sau).
- Nhận diện SMTP (import smtplib, from smtplib, smtplib.SMTP, smtp://, smtps://, --mail-rcpt, sendmail).
- Nhận diện fetch_page_messages.py của inbox-reader.
- Miễn trừ /conversations chỉ khi lệnh con là curl, không có POST/data và không có endpoint gửi/đăng.
- Mở rộng mẫu MCP: reply, forward, post_message, publish.
- Chặn thật: ghi sổ duyệt với PII đã che -> stderr lý do -> sys.exit(2).
"""

from __future__ import annotations

import ast
import sys
import os
import json
import re
import datetime
import hashlib

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import bash_parser
import office_root

HOOK_NAME = "guard_bulk_send"
MAX_SCRIPT_SIZE = 1024 * 1024  # 1 MB

# Các kịch bản test/bảo trì của chính kho không quét ruột tìm mẫu gửi
EXEMPT_REPO_SCRIPTS = {
    "tests/test_hooks.sh",
    "operations/scripts/sync-harness.sh",
    "operations/scripts/check_machine.sh",
    "operations/scripts/convert-harness-tests.mjs",
    "scripts/test_hooks.sh",
    "scripts/check_manifest.sh",
    "scripts/setup.sh",
    "scripts/check_machine.sh",
}

# Các endpoint gửi tin/đăng bài ra ngoài cần duyệt
BULK_SEND_ENDPOINTS = [
    re.compile(r'graph\.facebook\.com(?::\d+)?/.*?/(?:messages|feed|comments|photos)\b', re.IGNORECASE),
    re.compile(r'openapi\.zalo\.me', re.IGNORECASE),
    re.compile(r'api\.resend\.com(?::\d+)?/+(?:emails|broadcasts)', re.IGNORECASE),
    re.compile(r'api\.sendgrid\.com', re.IGNORECASE),
]

# Mẫu SMTP cần chặn duyệt (trong Python/Node chỉ chặn khi thật sự import/dùng smtplib/nodemailer, hoặc gọi client thật)
SMTP_PATTERN = re.compile(
    r'(?:\bimport\s+smtplib\b|\bfrom\s+smtplib\b|\bsmtplib\.SMTP\b|\bnodemailer\b|\bcreateTransport\b|smtps?://|--mail-rcpt\b|\bsendmail\b|\bmsmtp\b|\bswaks\b)',
    re.IGNORECASE,
)

# H37 (v10): Mẫu SMTP thành ngữ Ruby chỉ áp cho runner Ruby (ruby -e, irb), tệp .rb, hoặc shebang ruby, và chỉ ở dạng DÙNG
RUBY_SMTP_PATTERN = re.compile(
    r'(?:\brequire\s*(?:\(\s*)?[\'"]net/smtp[\'"]|\bNet::SMTP\s*(?:\.|::)\s*(?:start|new)\b)',
    re.IGNORECASE,
)

# Mẫu địa chỉ đích mở đầu bằng biến shell ($VAR hoặc ${VAR})
SHELL_VAR_START_PATTERN = re.compile(r'^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})')

# Các cờ curl nhận 1 tham số kế tiếp (không phải URL đích, trừ --url)
CURL_VALUE_FLAGS = {
    '-X', '--request',
    '-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--data-ascii',
    '-F', '--form', '--form-string', '--json',
    '-H', '--header', '-u', '--user', '-A', '--user-agent', '-e', '--referer',
    '-o', '--output', '-D', '--dump-header', '-b', '--cookie', '-c', '--cookie-jar',
    '-T', '--upload-file', '-K', '--config', '-w', '--write-out',
    '-m', '--max-time', '--connect-timeout', '-x', '--proxy',
}

# Kiểm tra cờ gửi dữ liệu trong curl (PHÂN BIỆT HOA/THƯỜNG cho các cờ ngắn)
# -d khác -D, -F khác -f
CURL_POST_FLAG_PATTERNS = [
    re.compile(r'-X\s*[\'"]?POST\b'),
    re.compile(r'--request[\s=]+[\'"]?POST\b'),
    re.compile(r'(?:^|\s)-[A-Za-z]*[dF](?:\b|@|\'|")'),
    re.compile(r'--data\b'),
    re.compile(r'--data-[\w-]+\b'),
    re.compile(r'--form\b'),
    re.compile(r'--form-[\w-]+\b'),
    re.compile(r'--json\b'),
    re.compile(r'-T\b'),
    re.compile(r'--upload-file\b'),
]

# Kiểm tra cờ DELETE trong curl
CURL_DELETE_FLAG_PATTERNS = [
    re.compile(r'-X\s*[\'"]?DELETE\b', re.IGNORECASE),
    re.compile(r'--request[\s=]+[\'"]?DELETE\b', re.IGNORECASE),
]

# Kiểm tra MCP gửi tin/nội dung
MCP_SEND_PATTERN = re.compile(r'mcp__.*(?:send|broadcast|reply|forward|post_message|publish)', re.IGNORECASE)

# Các trình chạy script, client gửi thật và lệnh chỉ in/đọc/tìm tài liệu
SCRIPT_RUNNERS = {
    'python', 'python2', 'python3', 'py',
    'node', 'nodejs', 'deno', 'bun',
    'ruby', 'irb', 'perl', 'php',
    'bash', 'sh', 'zsh', 'ksh', 'dash',
    'eval', 'exec', 'osascript', 'xargs', 'source', '.',
}
INLINE_CODE_RUNNERS = {
    'python', 'python2', 'python3', 'py',
    'node', 'nodejs', 'deno', 'bun',
    'ruby', 'irb', 'perl', 'php', 'osascript',
    'bash', 'sh', 'zsh', 'ksh', 'dash',
}
SMTP_CLIENT_BINARIES = {'sendmail', 'msmtp', 'swaks', 'curl', 'wget', 'nc', 'ncat', 'netcat', 'openssl', 'telnet', 'mail', 'mailx', 'mutt'}
COMMAND_WRAPPERS = {'env', 'sudo', 'command', 'nohup', 'nice', 'time', 'caffeinate', 'timeout'}
SCRIPT_EXTENSIONS = ('.py', '.sh', '.js', '.mjs', '.rb')
EXEMPT_PRINT_COMMANDS = {
    'echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
    'cat', 'sed', 'gsed', 'awk', 'gawk', 'mawk', 'nawk',
    'head', 'tail', 'less', 'more', 'wc', 'sort', 'uniq',
    'tr', 'cut', 'tee', 'jq', 'diff', 'true', 'false', ':',
}


def split_tokens(sub_cmd: str) -> list[str]:
    return bash_parser.split_shell_tokens(sub_cmd)


def parse_simple_command_safe(sub_cmd: str, cwd: str = ""):
    try:
        return bash_parser.SimpleCommand(sub_cmd, cwd)
    except Exception:
        return None


def extract_subcommand_executable(sub_cmd: str) -> tuple[str, str]:
    """Trích xuất (first_token, base_cmd) của subcommand sau khi bỏ qua phép gán VAR=val và wrapper (qua SimpleCommand)."""
    sc = parse_simple_command_safe(sub_cmd)
    if sc and sc.executable:
        return sc.raw_executable.strip('\'"'), sc.executable
    tokens = split_tokens(sub_cmd)
    if not tokens:
        return "", ""
    idx = 0
    while idx < len(tokens):
        tok = tokens[idx].strip('\'"')
        if '=' in tok and not tok.startswith('-'):
            idx += 1
            continue
        base = os.path.basename(tok).lower()
        if base in COMMAND_WRAPPERS:
            idx += 1
            while idx < len(tokens) and tokens[idx].strip('\'"').startswith('-'):
                idx += 1
            continue
        return tok, base
    return "", ""


def extract_inline_code_raw_args(sc: bash_parser.SimpleCommand) -> list[tuple[str, str]]:
    """H16a (v04) & H24 (v06): Với runner (`python*`, `node`, `deno`, `bun`, `perl`, `ruby`, `php`, `osascript`, `bash`/`sh`/`zsh`),
    lấy các cặp `(unquoted_code, raw_code)` của `-c` / `-e` / `-E` / `--eval` / `-p` / `--print` / `-r` từ `sc.words` và `sc.raw_words`.
    """
    exe = sc.executable
    if not (exe in INLINE_CODE_RUNNERS or exe.startswith(('python2.', 'python3.'))):
        return []
    pairs: list[tuple[str, str]] = []
    words = sc.words
    raw_words = getattr(sc, "raw_words", None) or words
    i = 1
    while i < len(words):
        w = words[i]
        raw_w = raw_words[i] if i < len(raw_words) else w
        if w in ('-c', '-e', '-E', '--eval', '-p', '--print', '-r') and i + 1 < len(words):
            nxt_raw = raw_words[i + 1] if (i + 1) < len(raw_words) else words[i + 1]
            pairs.append((words[i + 1], nxt_raw))
            i += 2
            continue
        if exe == 'deno' and w == 'eval' and i + 1 < len(words):
            j = i + 1
            while j < len(words) and words[j].startswith('-') and j + 1 < len(words):
                j += 1
            nxt_raw = raw_words[j] if j < len(raw_words) else words[j]
            pairs.append((words[j], nxt_raw))
            i = j + 1
            continue
        if exe.startswith(('python', 'py')) and w.startswith('-') and not w.startswith('--') and w.endswith('c') and len(w) > 2 and i + 1 < len(words):
            nxt_raw = raw_words[i + 1] if (i + 1) < len(raw_words) else words[i + 1]
            pairs.append((words[i + 1], nxt_raw))
            i += 2
            continue
        if exe in ('perl', 'ruby', 'node', 'bun') and w.startswith('-') and not w.startswith('--') and w.endswith(('e', 'E', 'p')) and len(w) > 2 and i + 1 < len(words):
            nxt_raw = raw_words[i + 1] if (i + 1) < len(raw_words) else words[i + 1]
            pairs.append((words[i + 1], nxt_raw))
            i += 2
            continue
        if exe in ('sh', 'bash', 'zsh', 'ksh', 'dash') and w.startswith('-') and not w.startswith('--') and 'c' in w and i + 1 < len(words):
            nxt_raw = raw_words[i + 1] if (i + 1) < len(raw_words) else words[i + 1]
            pairs.append((words[i + 1], nxt_raw))
            i += 2
            continue
        if w.startswith(('-c', '-e', '-r')) and not w.startswith('--') and len(w) > 2:
            raw_attached = raw_w[2:] if raw_w.startswith(('-c', '-e', '-r')) else w[2:]
            pairs.append((w[2:], raw_attached))
            i += 1
            continue
        if w.startswith(('--eval=', '--print=')):
            raw_attached = raw_w.split('=', 1)[1] if '=' in raw_w else w.split('=', 1)[1]
            pairs.append((w.split('=', 1)[1], raw_attached))
            i += 1
            continue
        i += 1
    return pairs


def extract_inline_code_args(sc: bash_parser.SimpleCommand) -> list[str]:
    return [code for code, _ in extract_inline_code_raw_args(sc)]


def is_code_or_smtp_runner(sub_cmd: str) -> bool:
    """Kiểm tra subcommand có phải là trình thông dịch mã, chạy script, hoặc gọi client mạng/SMTP thật không."""
    sc = parse_simple_command_safe(sub_cmd)
    if sc and sc.via_xargs and not sc.executable:
        return True
    first_tok, base_cmd = extract_subcommand_executable(sub_cmd)
    if not base_cmd:
        return False
    if base_cmd in EXEMPT_PRINT_COMMANDS:
        return False
    if (
        base_cmd in SCRIPT_RUNNERS
        or base_cmd.startswith(('python2.', 'python3.'))
        or base_cmd in SMTP_CLIENT_BINARIES
        or first_tok.startswith(('./', '../'))
        or any(first_tok.endswith(ext) or base_cmd.endswith(ext) for ext in SCRIPT_EXTENSIONS)
        or (sc is not None and sc.via_xargs)
    ):
        return True
    if base_cmd == 'git' and re.search(r'\bsend-email\b', sub_cmd):
        return True
    return False


def split_clauses_and_pipelines_safe(cmd_str: str) -> list[list[str]]:
    """H16a (v04): Tách chuỗi lệnh thành các pipeline (mỗi pipeline là danh sách các lệnh con nối qua |)
    bằng `bash_parser.split_compound_commands` tôn trọng dấu nháy đơn/kép và escape.
    """
    segments = bash_parser.split_compound_commands(cmd_str)
    pipelines: list[list[str]] = []
    cur_pipe: list[str] = []
    for seg_text, op, _hd in segments:
        s = seg_text.strip()
        if s:
            cur_pipe.append(s)
        if op not in ('|', '|&'):
            if cur_pipe:
                pipelines.append(cur_pipe)
                cur_pipe = []
    if cur_pipe:
        pipelines.append(cur_pipe)
    return pipelines


def has_curl_post_flags(cmd: str) -> bool:
    """Kiểm tra xem lệnh curl có cờ POST hay gửi kèm dữ liệu không."""
    for pattern in CURL_POST_FLAG_PATTERNS:
        if pattern.search(cmd):
            return True
    return False


def has_curl_delete_flags(cmd: str) -> bool:
    """Kiểm tra xem lệnh curl có cờ DELETE không."""
    for pattern in CURL_DELETE_FLAG_PATTERNS:
        if pattern.search(cmd):
            return True
    return False


def has_curl_write_flags(cmd: str) -> bool:
    """PCN ĐK 1 (v06): Kiểm tra lệnh curl có thực hiện GHI mạng (POST/PUT/PATCH/DELETE hoặc gửi dữ liệu/tệp) không."""
    if has_curl_post_flags(cmd) or has_curl_delete_flags(cmd):
        return True
    if re.search(r'(?:-X\s*[\'"]?|--request[\s=]+[\'"]?)(?:POST|PUT|PATCH|DELETE)\b', cmd, re.IGNORECASE):
        return True
    return False


def has_wget_write_flags(cmd: str) -> bool:
    """PCN ĐK 1 (v06): Kiểm tra lệnh wget có thực hiện GHI mạng (--post-data, --post-file, --body-*, --method=POST|PUT|PATCH|DELETE) không."""
    return bool(
        re.search(
            r'(?:--post-data\b|--post-file\b|--body-data\b|--body-file\b|--method[\s=]+[\'"]?(?:POST|PUT|PATCH|DELETE)\b)',
            cmd,
            re.IGNORECASE,
        )
    )


def is_curl_command(sub_cmd: str) -> bool:
    """Kiểm tra lệnh con có bắt đầu bằng curl không."""
    sc = parse_simple_command_safe(sub_cmd)
    if sc and sc.executable == "curl":
        return True
    tokens = sub_cmd.strip().split()
    if not tokens:
        return False
    first = tokens[0].strip('\'"')
    return first == "curl" or first.endswith("/curl")


def extract_curl_url_candidates(sub_cmd: str, sc: bash_parser.SimpleCommand | None = None) -> list[tuple[str, str]]:
    """Trích xuất danh sách các cặp `(unquoted_url_token, raw_url_token)` đóng vai trò địa chỉ đích trong lệnh curl."""
    if sc is None:
        sc = parse_simple_command_safe(sub_cmd)
    if sc and sc.words:
        tokens = sc.words
        raw_tokens = getattr(sc, "raw_words", None) or tokens
    else:
        tokens = split_tokens(sub_cmd)
        raw_tokens = list(tokens)
    if not tokens:
        return []

    idx = 0
    while idx < len(tokens) and '=' in tokens[idx] and not tokens[idx].startswith('-'):
        idx += 1
    if idx >= len(tokens):
        return []

    first = tokens[idx].strip('\'"')
    if not (first == "curl" or first.endswith("/curl")):
        return []

    candidates: list[tuple[str, str]] = []
    i = idx + 1
    while i < len(tokens):
        tok = tokens[i]
        raw_tok = raw_tokens[i] if i < len(raw_tokens) else tok
        clean = tok.strip('\'"')
        if clean == '--url' and i + 1 < len(tokens):
            nxt_raw = raw_tokens[i + 1] if (i + 1) < len(raw_tokens) else tokens[i + 1]
            candidates.append((tokens[i + 1].strip('\'"'), nxt_raw))
            i += 2
            continue
        if clean.startswith('--url='):
            u_val = clean.split('=', 1)[1].strip('\'"')
            u_raw = raw_tok.split('=', 1)[1] if '=' in raw_tok else u_val
            candidates.append((u_val, u_raw))
            i += 1
            continue
        if clean in CURL_VALUE_FLAGS:
            i += 2
            continue
        if clean.startswith('-'):
            i += 1
            continue
        candidates.append((clean, raw_tok))
        i += 1
    return candidates


def has_curl_variable_url(sub_cmd: str) -> bool:
    """Kiểm tra lệnh curl có địa chỉ đích mở đầu bằng biến ($X, ${X}/...) không."""
    for clean_url, _ in extract_curl_url_candidates(sub_cmd):
        if SHELL_VAR_START_PATTERN.match(clean_url):
            return True
    return False


def split_heredocs(raw_cmd: str):
    return bash_parser.split_heredocs(raw_cmd)


def extract_cd_target(sub_cmd: str, current_cwd: str) -> str:
    """Nếu sub_cmd là lệnh cd <dir>, trả về thư mục mới; ngược lại trả về current_cwd."""
    sc = parse_simple_command_safe(sub_cmd, current_cwd)
    tokens = sc.words if (sc and sc.words) else split_tokens(sub_cmd)
    if not tokens:
        return current_cwd
    if tokens[0].strip('\'"') == 'cd' and len(tokens) >= 2:
        for w in tokens[1:]:
            clean_w = w.strip('\'"')
            if clean_w in ('-P', '-L', '--'):
                continue
            if not clean_w.startswith('-') and clean_w != '-':
                expanded = os.path.expanduser(clean_w)
                if os.path.isabs(expanded):
                    return os.path.normpath(expanded)
                return os.path.normpath(os.path.join(current_cwd, expanded))
    return current_cwd


def is_exempt_repo_script(script_path: str, current_cwd: str) -> bool:
    """Kiểm tra tệp kịch bản có thuộc danh sách bộ test/bảo trì của chính kho không."""
    try:
        root_dir = office_root.resolve_project_root(current_cwd)
        if not root_dir:
            return False
        for sp, rd in (
            (os.path.realpath(script_path), os.path.realpath(root_dir)),
            (os.path.normpath(script_path), os.path.normpath(root_dir)),
        ):
            rel = os.path.relpath(sp, rd).replace("\\", "/")
            if rel in EXEMPT_REPO_SCRIPTS:
                return True
    except (Exception, SystemExit):
        return False
    return False


def is_ruby_runner_or_script(
    sub_cmd: str = "",
    sc: bash_parser.SimpleCommand | None = None,
    label: str = "",
    content: str = "",
) -> bool:
    """H37 (v10): Kiểm tra lệnh hoặc tệp kịch bản có thuộc môi trường Ruby (`ruby`, `irb`, `.rb`, shebang `ruby`) không."""
    if sc is not None and sc.executable in ('ruby', 'irb'):
        return True
    if sub_cmd:
        _, base_cmd = extract_subcommand_executable(sub_cmd)
        if base_cmd in ('ruby', 'irb'):
            return True
    if label and label.lower().endswith('.rb'):
        return True
    if content:
        stripped = content.lstrip()
        if stripped.startswith('#!'):
            first_line = stripped.splitlines()[0].lower()
            if 'ruby' in first_line:
                return True
    return False


def scan_script_content(content: str, label: str, sub_cmd: str = "") -> str:
    """Quét nội dung kịch bản tìm các mẫu địa chỉ gửi hoặc SMTP."""
    for endpoint in BULK_SEND_ENDPOINTS:
        if endpoint.search(content):
            return f"Phát hiện tệp kịch bản ({label}) chứa địa chỉ gửi dữ liệu ra ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."
    if SMTP_PATTERN.search(content):
        return f"Phát hiện tệp kịch bản ({label}) chứa kết nối gửi email qua SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
    if is_ruby_runner_or_script(sub_cmd=sub_cmd, label=label, content=content) and RUBY_SMTP_PATTERN.search(content):
        return f"Phát hiện tệp kịch bản ({label}) chứa kết nối gửi email qua SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
    return ""


def check_script_file_bulk_send(sub_cmd: str, current_cwd: str, heredoc_written_files=None) -> str:
    """Nếu lệnh chạy một tệp kịch bản (< 1MB hoặc vừa được ghi bởi heredoc trong cùng lệnh),
    đọc ruột tệp và xét các mẫu địa chỉ gửi.
    """
    script_arg = bash_parser.get_executed_script_arg(sub_cmd)
    if not script_arg:
        return ""

    if heredoc_written_files:
        hd_body = bash_parser.find_heredoc_body_for_script(script_arg, heredoc_written_files)
        if hd_body:
            clean_arg = script_arg.strip('\'"')
            base_arg = os.path.basename(clean_arg)
            reason = scan_script_content(hd_body, base_arg or clean_arg, sub_cmd=sub_cmd)
            if reason:
                return reason

    expanded = os.path.expanduser(script_arg)
    if os.path.isabs(expanded):
        script_path = os.path.normpath(expanded)
    else:
        script_path = os.path.normpath(os.path.join(current_cwd, expanded))

    if is_exempt_repo_script(script_path, current_cwd):
        return ""

    try:
        if not os.path.isfile(script_path):
            return ""
        if os.path.getsize(script_path) >= MAX_SCRIPT_SIZE:
            return ""
        with open(script_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(MAX_SCRIPT_SIZE)
    except OSError:
        return ""

    return scan_script_content(content, os.path.basename(script_path), sub_cmd=sub_cmd)


def check_script_dong_y(sub_cmd: str) -> bool:
    """Kiểm tra lệnh con chạy script có cờ gửi thật --dong-y không."""
    if not re.search(r'(?:^|[\s\'"])--dong-y(?:$|[\s\'"])', sub_cmd):
        return False
    sc = parse_simple_command_safe(sub_cmd)
    tokens = sc.words if (sc and sc.words) else split_tokens(sub_cmd)
    if not tokens:
        return False

    idx = 0
    while idx < len(tokens) and '=' in tokens[idx] and not tokens[idx].startswith('-'):
        idx += 1
    if idx >= len(tokens):
        return False

    first_token = tokens[idx].strip('\'"')
    base_cmd = os.path.basename(first_token).lower()

    if base_cmd in EXEMPT_PRINT_COMMANDS:
        return False

    is_script = (
        base_cmd in SCRIPT_RUNNERS
        or base_cmd.startswith(('python2.', 'python3.'))
        or any(first_token.endswith(ext) for ext in SCRIPT_EXTENSIONS)
        or any(base_cmd.endswith(ext) for ext in SCRIPT_EXTENSIONS)
    )
    if not is_script:
        return False

    for i, arg in enumerate(tokens[idx + 1:], start=idx + 1):
        clean_arg = arg.strip('\'"')
        if clean_arg == '--dong-y':
            return True
        if tokens[i - 1] in ('-c', '-lc', '-ec') and check_script_dong_y(arg):
            return True
    return False


def extract_target_host(tool_name: str, tool_input: dict) -> str:
    """Trích xuất host đích nếu có trong lệnh hoặc URL."""
    text = ""
    if isinstance(tool_input, dict):
        text = str(tool_input.get("command", "")) or json.dumps(tool_input, ensure_ascii=False)
    else:
        text = str(tool_input)

    # Tìm URL đầy đủ
    m = re.search(r'https?://([^/\s"\':]+)', text)
    if m:
        return m.group(1)

    # Tìm domain trong BULK_SEND_ENDPOINTS
    for ep in BULK_SEND_ENDPOINTS:
        m2 = ep.search(text)
        if m2:
            return m2.group(0).split('/')[0]

    if "fetch_page_messages" in text:
        return "inbox-reader"

    if SMTP_PATTERN.search(text) or RUBY_SMTP_PATTERN.search(text):
        return "smtp"

    return "local"


SHELL_VAR_REF_RE = re.compile(r'\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)\})')
HEX_OR_OCTAL_ESCAPE_RE = re.compile(r'\\(?:x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|0[0-7]{2})')
PLAIN_LITERAL_HTTP_URL_RE = re.compile(r'^([\'"])https?://[A-Za-z0-9._-]+(?::\d+)?(?:/[^\'"\\]*)?\1$')
RESOLVED_STATIC_HOST_RE = re.compile(r'^https?://([A-Za-z0-9._-]+)(?::\d+)?(?:/|$)', re.IGNORECASE)
WATCHED_BULK_HOSTS = ('graph.facebook.com', 'openapi.zalo.me', 'api.resend.com', 'api.sendgrid.com')


def has_bulk_send_signal(text: str) -> bool:
    """Kiểm tra nhanh chuỗi có chứa mẫu SMTP (hoặc RUBY_SMTP_PATTERN ở dạng dùng) hay BULK_SEND_ENDPOINTS không."""
    if not text:
        return False
    if SMTP_PATTERN.search(text) or RUBY_SMTP_PATTERN.search(text):
        return True
    for endpoint in BULK_SEND_ENDPOINTS:
        if endpoint.search(text):
            return True
    return False


def expand_shell_vars_in_text(
    text: str,
    static_vars: dict[str, str],
    unresolved_vars: set[str],
) -> tuple[str, bool]:
    """H19 (v05): Mở rộng `$NAME` và `${NAME}` bằng bảng biến tĩnh `static_vars`.
    Trả về `(expanded_text, has_unresolved_var)`.
    """
    if not text or '$' not in text:
        return text, False

    has_unresolved = False

    def _repl(m: re.Match) -> str:
        nonlocal has_unresolved
        var_name = m.group(1) or m.group(2) or ""
        modifier = m.group(3) or ""
        if not var_name:
            return m.group(0)
        if var_name in unresolved_vars or var_name not in static_vars:
            has_unresolved = True
            return m.group(0)
        val = static_vars[var_name]
        if modifier:
            has_unresolved = True
            return f"{val} {modifier}"
        return val

    expanded = SHELL_VAR_REF_RE.sub(_repl, text)
    if '$(' in expanded or '`' in expanded:
        has_unresolved = True
    return expanded, has_unresolved


def expand_shell_vars_in_raw_token(
    raw_token: str,
    static_vars: dict[str, str],
    unresolved_vars: set[str],
) -> tuple[str, bool]:
    """H24 (v06): Mở rộng `$NAME` và `${NAME}` có tôn trọng ngữ cảnh vùng nháy của token:
    - Trong vùng nháy đơn `'...'`: `$NAME` là nguyên văn — KHÔNG mở rộng biến.
    - Trong vùng nháy kép `"..."` hoặc không nháy: mở rộng `$NAME` / `${NAME}` (trừ khi có `\\$` thoát trước).
    Đồng thời thực hiện bóc nháy bao ngoài (quote removal) giống shell.
    """
    if not raw_token:
        return "", False

    out: list[str] = []
    has_unresolved = False
    i = 0
    n = len(raw_token)
    in_single = False
    in_double = False

    while i < n:
        ch = raw_token[i]
        if in_single:
            if ch == "'":
                in_single = False
            else:
                out.append(ch)
            i += 1
            continue

        if ch == '\\':
            if i + 1 < n:
                nxt = raw_token[i + 1]
                if in_double and nxt not in ('$', '`', '"', '\\', '\n'):
                    out.append('\\')
                out.append(nxt)
                i += 2
            else:
                out.append('\\')
                i += 1
            continue

        if ch == "'" and not in_double:
            in_single = True
            i += 1
            continue

        if ch == '"':
            in_double = not in_double
            i += 1
            continue

        if ch == '`':
            has_unresolved = True
            out.append(ch)
            i += 1
            continue

        if ch == '$':
            if i + 1 < n and raw_token[i + 1] == '(':
                has_unresolved = True
                out.append('$(')
                i += 2
                continue
            m = SHELL_VAR_REF_RE.match(raw_token, i)
            if m:
                var_name = m.group(1) or m.group(2) or ""
                modifier = m.group(3) or ""
                if not var_name:
                    out.append(m.group(0))
                elif var_name in unresolved_vars or var_name not in static_vars:
                    has_unresolved = True
                    out.append(m.group(0))
                else:
                    val = static_vars[var_name]
                    if modifier:
                        has_unresolved = True
                        out.append(f"{val} {modifier}")
                    else:
                        out.append(val)
                i = m.end()
                continue

        out.append(ch)
        i += 1

    return "".join(out), has_unresolved


def extract_expanded_var_names_in_raw_token(raw_token: str) -> set[str]:
    """H36 (v10): Trích tập tên biến shell được mở rộng (`$VAR`, `${VAR}`) ngoài vùng nháy đơn trong `raw_token`."""
    names: set[str] = set()
    if not raw_token or '$' not in raw_token:
        return names

    i = 0
    n = len(raw_token)
    in_single = False
    in_double = False

    while i < n:
        ch = raw_token[i]
        if in_single:
            if ch == "'":
                in_single = False
            i += 1
            continue

        if ch == '\\':
            i += 2 if (i + 1 < n) else 1
            continue

        if ch == "'" and not in_double:
            in_single = True
            i += 1
            continue

        if ch == '"':
            in_double = not in_double
            i += 1
            continue

        if ch == '$':
            m = SHELL_VAR_REF_RE.match(raw_token, i)
            if m:
                var_name = m.group(1) or m.group(2) or ""
                if var_name:
                    names.add(var_name)
                i = m.end()
                continue

        i += 1

    return names


def update_shell_var_bindings(
    sub_cmd: str,
    sc: bash_parser.SimpleCommand | None,
    static_vars: dict[str, str],
    unresolved_vars: set[str],
    exported_vars: set[str] | None = None,
) -> tuple[bool, dict[str, str], set[str], set[str]]:
    """H19 (v05), H23 (v06), H27 (v07) & H36 (v10): Cập nhật bảng gán biến shell của CHA (`static_vars` / `unresolved_vars`),
    tập biến đã `export` của CHA (`exported_vars`), đồng thời dựng bảng môi trường của TIẾN TRÌNH CON
    (`child_static_vars` / `child_unresolved_vars` / `child_exported_vars`) và kiểm tra tín hiệu gửi trong vế phải phép gán.
    - H36 (v10): Gán thuần không export (`is_pure_assignment`) chỉ lưu vào `static_vars`, KHÔNG tự thêm vào `exported_vars`
      hay `child_exported_vars` (trừ khi biến đã được `export` trước đó). Biến chỉ vào `child_exported_vars` khi:
      (a) là gán đầu lệnh của chính lệnh con (`not persist_bindings`), hoặc
      (c) đã được `export` (`export X=...`, `X=...; export X`, `declare -x X=...`).
    """
    if exported_vars is None:
        exported_vars = set()

    found_signal = False
    sub_has_cmd_subst = bool(bash_parser.extract_substitutions_safe(sub_cmd))

    is_declaration_builtin = (
        sc is not None and sc.executable in ('export', 'local', 'declare', 'typeset', 'readonly')
    )
    is_pure_assignment = (sc is None or not sc.executable)
    persist_bindings = is_pure_assignment or is_declaration_builtin

    is_export_builtin = False
    if sc is not None:
        if sc.executable == 'set':
            words_rest = sc.words[1:]
            for w_i, w in enumerate(words_rest):
                if w.startswith('-') and not w.startswith('--') and 'a' in w and w != '-o':
                    exported_vars.add("__ALLEXPORT__")
                elif w.startswith('+') and 'a' in w and w != '+o':
                    exported_vars.discard("__ALLEXPORT__")
                elif w == '-o' and w_i + 1 < len(words_rest) and words_rest[w_i + 1] == 'allexport':
                    exported_vars.add("__ALLEXPORT__")
                elif w == '+o' and w_i + 1 < len(words_rest) and words_rest[w_i + 1] == 'allexport':
                    exported_vars.discard("__ALLEXPORT__")
        if sc.executable == 'export':
            has_unexport = any(
                w.startswith('-') and not w.startswith('--') and 'n' in w
                for w in sc.words[1:]
            )
            if not has_unexport:
                is_export_builtin = True
        elif sc.executable in ('declare', 'typeset'):
            if any(
                w.startswith('-') and not w.startswith('--') and 'x' in w
                for w in sc.words[1:]
            ):
                is_export_builtin = True

    raw_assignments: list[tuple[str, bool, str]] = []
    if sc is not None and getattr(sc, "raw_env_assignments", None):
        raw_assignments.extend(sc.raw_env_assignments)
    else:
        try:
            tokens, raw_tokens, _ = bash_parser.tokenize_command_with_raw(sub_cmd)
        except Exception:
            tokens, raw_tokens = [], []

        while tokens and tokens[0].lower() in ('then', 'do', 'else', 'elif', 'fi', 'done', 'time'):
            tokens = tokens[1:]
            raw_tokens = raw_tokens[1:]

        idx = 0
        while idx < len(tokens):
            tok = tokens[idx]
            raw_tok = raw_tokens[idx] if idx < len(raw_tokens) else tok
            m_assign = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)(\+?=)(.*)$', tok, re.DOTALL)
            if m_assign:
                raw_rhs = raw_tok.split('=', 1)[1] if '=' in raw_tok else m_assign.group(3)
                raw_assignments.append((m_assign.group(1), m_assign.group(2) == '+=', raw_rhs))
                idx += 1
            else:
                break

    if is_declaration_builtin and sc is not None:
        raw_words = getattr(sc, "raw_words", None) or sc.words
        for w_idx, w in enumerate(sc.words[1:], start=1):
            if w.startswith(('-', '+')):
                continue
            raw_w = raw_words[w_idx] if w_idx < len(raw_words) else w
            m_assign = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)(\+?=)(.*)$', w, re.DOTALL)
            if m_assign:
                raw_rhs = raw_w.split('=', 1)[1] if '=' in raw_w else m_assign.group(3)
                raw_assignments.append((m_assign.group(1), m_assign.group(2) == '+=', raw_rhs))
            elif is_export_builtin:
                clean_w = w.strip('\'"')
                if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', clean_w):
                    exported_vars.add(clean_w)
    elif sc is not None and sc.executable == 'read':
        for w in sc.words[1:]:
            if w.startswith('-'):
                continue
            clean_w = w.strip('\'"')
            if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', clean_w):
                unresolved_vars.add(clean_w)
                static_vars.pop(clean_w, None)
                if "__ALLEXPORT__" in exported_vars:
                    exported_vars.add(clean_w)

    child_static_vars: dict[str, str] = dict(static_vars)
    child_unresolved_vars: set[str] = set(unresolved_vars)
    child_exported_vars: set[str] = set(exported_vars)

    allexport_active = "__ALLEXPORT__" in exported_vars
    for var_name, is_append, raw_rhs in raw_assignments:
        if has_bulk_send_signal(raw_rhs):
            found_signal = True
        expanded_rhs, rhs_unresolved = expand_shell_vars_in_raw_token(raw_rhs, static_vars, unresolved_vars)
        if has_bulk_send_signal(expanded_rhs):
            found_signal = True
        is_dynamic = rhs_unresolved or (sub_has_cmd_subst and ('$ (' in raw_rhs or '$(' in raw_rhs or '`' in raw_rhs))

        if (not persist_bindings) or is_export_builtin or allexport_active or (var_name in exported_vars):
            child_exported_vars.add(var_name)
        if is_export_builtin or (persist_bindings and allexport_active):
            exported_vars.add(var_name)

        # H27: Luôn áp phép gán đầu lệnh lên bảng môi trường của tiến trình con (child_static_vars / child_unresolved_vars)
        if is_dynamic:
            child_unresolved_vars.add(var_name)
            child_static_vars.pop(var_name, None)
        else:
            if is_append:
                if var_name in child_unresolved_vars:
                    child_static_vars.pop(var_name, None)
                else:
                    child_static_vars[var_name] = child_static_vars.get(var_name, "") + expanded_rhs
            else:
                child_unresolved_vars.discard(var_name)
                child_static_vars[var_name] = expanded_rhs

        if not persist_bindings:
            # H23 & H27(c): Gán đầu lệnh (env tạm của tiến trình con) KHÔNG ghi ngược vào static_vars của cha.
            continue
        if is_dynamic:
            unresolved_vars.add(var_name)
            static_vars.pop(var_name, None)
        else:
            if is_append:
                if var_name in unresolved_vars:
                    static_vars.pop(var_name, None)
                else:
                    static_vars[var_name] = static_vars.get(var_name, "") + expanded_rhs
            else:
                unresolved_vars.discard(var_name)
                static_vars[var_name] = expanded_rhs

    return found_signal, child_static_vars, child_unresolved_vars, child_exported_vars


def check_inline_code_uncertain_network_write(code_text: str) -> str:
    """PCN ĐK 1 (§7 & §8 v06): Phát hiện mã nội tuyến Python/Node thực hiện GHI mạng
    (`requests.post/put/patch/delete/request`, `urllib.request`, `httpx`, `axios`, `fetch` POST/PUT/PATCH/DELETE)
    nhưng địa chỉ đích không phải hằng chuỗi URL tĩnh tường minh (ví dụ ghép chuỗi `'https://'+h+...`,
    f-string, biến động, hoặc chứa mã hoá hex `\\x2f`).
    """
    if not code_text:
        return ""

    write_call_patterns = [
        (
            "chuỗi ghép Python / biến động trong requests/httpx/axios",
            re.compile(r'\b(?:requests|httpx|axios)\s*\.\s*(?:post|put|patch|delete)\s*\(\s*([^,)]+)', re.DOTALL),
        ),
        (
            "chuỗi ghép Python / biến động trong requests/httpx/axios.request",
            re.compile(
                r'\b(?:requests|httpx|axios)\s*\.\s*request\s*\(\s*[\'"](?:POST|PUT|PATCH|DELETE)[\'"]\s*,\s*([^,)]+)',
                re.IGNORECASE | re.DOTALL,
            ),
        ),
    ]
    for label, pat in write_call_patterns:
        for m in pat.finditer(code_text):
            url_expr = m.group(1).strip()
            if url_expr.startswith("url="):
                url_expr = url_expr[4:].strip()
            if not PLAIN_LITERAL_HTTP_URL_RE.match(url_expr) or HEX_OR_OCTAL_ESCAPE_RE.search(url_expr):
                return f"Không chắc đích ghi mạng: phát hiện lệnh ghi HTTP ({label}: {url_expr[:40]}) không giải tĩnh được đích. Lệnh bị chặn và ghi sổ duyệt."

    # urllib.request.Request / urlopen có data= hoặc method=POST/PUT/PATCH/DELETE
    if re.search(r'\burllib\.request\.(?:Request|urlopen)\b', code_text):
        has_urllib_write = bool(
            re.search(r'\bdata\s*=', code_text)
            or re.search(r'\bmethod\s*=\s*[\'"](?:POST|PUT|PATCH|DELETE)[\'"]', code_text, re.IGNORECASE)
        )
        if has_urllib_write:
            for m in re.finditer(r'\burllib\.request\.(?:Request|urlopen)\s*\(\s*([^,)]+)', code_text, re.DOTALL):
                url_expr = m.group(1).strip()
                if not PLAIN_LITERAL_HTTP_URL_RE.match(url_expr) or HEX_OR_OCTAL_ESCAPE_RE.search(url_expr):
                    return f"Không chắc đích ghi mạng: phát hiện urllib.request ghi dữ liệu tới đích động/chuỗi ghép ({url_expr[:40]}). Lệnh bị chặn và ghi sổ duyệt."

    # fetch(...) có method POST/PUT/PATCH/DELETE
    if re.search(r'\bfetch\s*\(', code_text) and re.search(
        r'\bmethod\s*:\s*[\'"](?:POST|PUT|PATCH|DELETE)[\'"]', code_text, re.IGNORECASE
    ):
        for m in re.finditer(r'\bfetch\s*\(\s*([^,)]+)', code_text, re.DOTALL):
            url_expr = m.group(1).strip()
            if not PLAIN_LITERAL_HTTP_URL_RE.match(url_expr) or HEX_OR_OCTAL_ESCAPE_RE.search(url_expr):
                return f"Không chắc đích ghi mạng: phát hiện fetch ghi mạng tới đích động/chuỗi ghép ({url_expr[:40]}). Lệnh bị chặn và ghi sổ duyệt."

    return ""


SAFE_PY_IMPORT_MODULES = {"sys", "math", "json", "re", "datetime"}
SAFE_PY_BUILTINS = {
    "print", "len", "sum", "range", "str", "int", "float", "repr",
    "sorted", "min", "max", "abs", "round", "enumerate", "zip",
}
FORBIDDEN_MODULE_ATTRS = {
    "modules", "stdin", "audithook", "breakpointhook",
    "displayhook", "excepthook", "setprofile", "settrace", "addaudithook", "exit",
    "monitoring", "codecs", "copyreg", "functools", "enum", "sre_compile", "sre_parse", "scanner",
}
ALLOWED_PY_BINOPS = (
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.LShift, ast.RShift, ast.BitOr, ast.BitXor, ast.BitAnd,
)
ALLOWED_PY_UNARYOPS = (ast.UAdd, ast.USub, ast.Not, ast.Invert)
ALLOWED_PY_CMPOPS = (
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
    ast.Is, ast.IsNot, ast.In, ast.NotIn,
)


def has_unsafe_inline_runner_flags(sc: bash_parser.SimpleCommand | None) -> bool:
    """H34 (v09): Detect module preload flags (`-M...` in Perl, `-r...` in Ruby/Node/Bun, `--require`/`--import`)
    that execute or load external code before running an inline snippet.
    """
    if sc is None or not sc.words:
        return False
    exe = sc.executable
    for w in sc.words[1:]:
        if exe == 'perl' and (w.startswith('-M') or w.startswith('-m')):
            return True
        if exe in ('ruby', 'node', 'bun') and (
            w in ('-r', '--require', '--import')
            or (w.startswith('-r') and not w.startswith('--'))
            or w.startswith(('--require=', '--import='))
        ):
            return True
    return False


def _get_py_attr_chain_root(node: ast.Attribute) -> tuple[ast.Name | None, list[str]]:
    """H35 (v10): Walk an `ast.Attribute` chain (`a.b.c`) and return `(root_name_node, [attr1, attr2, ...])`
    only when every link is a Load Attribute with no leading `_` and the base is a Load Name with no leading `_`.
    """
    attrs: list[str] = []
    cur: ast.AST = node
    while isinstance(cur, ast.Attribute):
        if not isinstance(cur.ctx, ast.Load) or not cur.attr or cur.attr.startswith("_") or cur.attr == "modules":
            return None, []
        attrs.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name) and isinstance(cur.ctx, ast.Load) and cur.id and not cur.id.startswith("_"):
        attrs.reverse()
        return cur, attrs
    return None, []


def _is_recognized_harmless_python_code(code_text: str) -> bool:
    """H35 (v10): Closed-allowlist AST recognizer for Python (`python`/`python3 -c`) inline code when a send signal
    is present in reachable environment bindings.
    Only returns True if `ast.parse` succeeds and every statement/expression node belongs to the closed allowlist.
    Any unrecognized node, attribute, call target, or syntax error returns False.
    """
    if not code_text or not code_text.strip():
        return True
    try:
        tree = ast.parse(code_text, mode="exec")
    except (SyntaxError, ValueError, TypeError, MemoryError):
        return False

    if not isinstance(tree, ast.Module):
        return False

    imported_modules: dict[str, str] = {}
    imported_callables: set[str] = set()
    assigned_names: set[str] = set()

    def is_valid_expr(expr: ast.AST) -> bool:
        if isinstance(expr, ast.Constant):
            return isinstance(expr.value, (int, float, complex, str, bytes, bool, type(None)))

        if isinstance(expr, ast.Name):
            if not isinstance(expr.ctx, ast.Load) or not expr.id or expr.id.startswith("_"):
                return False
            return (
                expr.id in SAFE_PY_BUILTINS
                or expr.id in imported_modules
                or expr.id in imported_callables
                or expr.id in assigned_names
            )

        if isinstance(expr, ast.Attribute):
            root_name, attr_chain = _get_py_attr_chain_root(expr)
            if root_name is None or not attr_chain:
                return False
            rid = root_name.id
            if rid in imported_modules:
                if any(a in FORBIDDEN_MODULE_ATTRS for a in attr_chain):
                    return False
                return True
            if rid in assigned_names or rid in imported_callables:
                if any(a in FORBIDDEN_MODULE_ATTRS for a in attr_chain):
                    return False
                return True
            return False

        if isinstance(expr, ast.Call):
            for arg in expr.args:
                if isinstance(arg, ast.Starred) or not is_valid_expr(arg):
                    return False
            for kw in expr.keywords:
                if not isinstance(kw, ast.keyword) or kw.arg is None or kw.arg.startswith("_"):
                    return False
                if not is_valid_expr(kw.value):
                    return False

            func = expr.func
            if isinstance(func, ast.Name):
                if not isinstance(func.ctx, ast.Load) or not func.id or func.id.startswith("_"):
                    return False
                return func.id in SAFE_PY_BUILTINS or func.id in imported_callables
            if isinstance(func, ast.Attribute):
                root_name, attr_chain = _get_py_attr_chain_root(func)
                if root_name is None or not attr_chain:
                    return False
                rid = root_name.id
                if rid in imported_modules:
                    if any(a in FORBIDDEN_MODULE_ATTRS for a in attr_chain):
                        return False
                    return True
                if rid in imported_callables:
                    if any(a in FORBIDDEN_MODULE_ATTRS for a in attr_chain):
                        return False
                    return True
                return False
            return False

        if isinstance(expr, ast.Subscript):
            if not isinstance(expr.ctx, ast.Load) or not is_valid_expr(expr.value):
                return False
            sl = expr.slice
            if isinstance(sl, ast.Slice):
                return (
                    (sl.lower is None or is_valid_expr(sl.lower))
                    and (sl.upper is None or is_valid_expr(sl.upper))
                    and (sl.step is None or is_valid_expr(sl.step))
                )
            return is_valid_expr(sl)

        if isinstance(expr, ast.BinOp):
            return isinstance(expr.op, ALLOWED_PY_BINOPS) and is_valid_expr(expr.left) and is_valid_expr(expr.right)

        if isinstance(expr, ast.UnaryOp):
            return isinstance(expr.op, ALLOWED_PY_UNARYOPS) and is_valid_expr(expr.operand)

        if isinstance(expr, ast.Compare):
            if not is_valid_expr(expr.left) or not expr.ops or len(expr.ops) != len(expr.comparators):
                return False
            return all(isinstance(op, ALLOWED_PY_CMPOPS) for op in expr.ops) and all(
                is_valid_expr(comp) for comp in expr.comparators
            )

        if isinstance(expr, ast.JoinedStr):
            return all(is_valid_expr(v) for v in expr.values)

        if isinstance(expr, ast.FormattedValue):
            if not is_valid_expr(expr.value):
                return False
            return expr.format_spec is None or is_valid_expr(expr.format_spec)

        if isinstance(expr, (ast.List, ast.Tuple)):
            if not isinstance(expr.ctx, ast.Load):
                return False
            return all(not isinstance(elt, ast.Starred) and is_valid_expr(elt) for elt in expr.elts)

        if isinstance(expr, ast.Dict):
            if len(expr.keys) != len(expr.values):
                return False
            return all(k is not None and is_valid_expr(k) for k in expr.keys) and all(
                is_valid_expr(v) for v in expr.values
            )

        return False

    for stmt in tree.body:
        if isinstance(stmt, ast.Import):
            if not stmt.names:
                return False
            for alias in stmt.names:
                if not isinstance(alias, ast.alias) or alias.name not in SAFE_PY_IMPORT_MODULES:
                    return False
                bound = alias.asname if alias.asname else alias.name
                if not bound or bound.startswith("_") or "." in bound:
                    return False
                imported_modules[bound] = alias.name
        elif isinstance(stmt, ast.ImportFrom):
            if stmt.level != 0 or not stmt.module or stmt.module not in SAFE_PY_IMPORT_MODULES or not stmt.names:
                return False
            for alias in stmt.names:
                if not isinstance(alias, ast.alias) or not alias.name or alias.name == "*" or alias.name.startswith("_"):
                    return False
                if alias.name in FORBIDDEN_MODULE_ATTRS:
                    return False
                bound = alias.asname if alias.asname else alias.name
                if not bound or bound.startswith("_"):
                    return False
                if stmt.module == "sys":
                    assigned_names.add(bound)
                else:
                    imported_callables.add(bound)
                    assigned_names.add(bound)
        elif isinstance(stmt, ast.Assign):
            if len(stmt.targets) != 1 or not isinstance(stmt.targets[0], ast.Name):
                return False
            target_name = stmt.targets[0].id
            if not target_name or target_name.startswith("_") or not isinstance(stmt.targets[0].ctx, ast.Store):
                return False
            if not is_valid_expr(stmt.value):
                return False
            if isinstance(stmt.value, ast.Name) and stmt.value.id in imported_modules:
                imported_modules[target_name] = imported_modules[stmt.value.id]
            assigned_names.add(target_name)
        elif isinstance(stmt, ast.Expr):
            if not is_valid_expr(stmt.value):
                return False
        else:
            return False

    return True


def _split_const_print_statements(code_text: str) -> list[str] | None:
    """H35 (v10): Split inline code into statements separated by `;` or newline outside quotes.
    Returns None if quotes are unclosed or backticks appear.
    """
    stmts: list[str] = []
    cur: list[str] = []
    in_single = False
    in_double = False
    i = 0
    n = len(code_text)

    while i < n:
        ch = code_text[i]
        if ch == '`':
            return None
        if in_single:
            cur.append(ch)
            if ch == '\\' and i + 1 < n:
                cur.append(code_text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            cur.append(ch)
            if ch == '\\' and i + 1 < n:
                cur.append(code_text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "'":
            in_single = True
            cur.append(ch)
            i += 1
            continue
        if ch == '"':
            in_double = True
            cur.append(ch)
            i += 1
            continue
        if ch in (';', '\n', '\r'):
            s = "".join(cur).strip()
            if s:
                stmts.append(s)
            cur = []
            i += 1
            continue

        cur.append(ch)
        i += 1

    if in_single or in_double:
        return None
    tail = "".join(cur).strip()
    if tail:
        stmts.append(tail)
    return stmts


def _tokenize_const_print_args(arg_str: str, lang: str) -> list[tuple[str, str]] | None:
    """H35 (v10): Tokenize `<arg_list>` of a constant print statement for Node/Ruby/Perl/PHP.
    Only accepts string literals, numeric literals, arithmetic/concat operators, grouping parens, and commas.
    Any identifier, bracket, brace, template literal, or interpolation returns None.
    """
    tokens: list[tuple[str, str]] = []
    i = 0
    n = len(arg_str)

    while i < n:
        ch = arg_str[i]
        if ch in (' ', '\t', '\r', '\n'):
            i += 1
            continue

        if ch == "'":
            j = i + 1
            while j < n:
                c = arg_str[j]
                if c == '\\':
                    j += 2
                    continue
                if c == "'":
                    break
                j += 1
            if j >= n or arg_str[j] != "'":
                return None
            tokens.append(("VAL", arg_str[i : j + 1]))
            i = j + 1
            continue

        if ch == '"':
            j = i + 1
            while j < n:
                c = arg_str[j]
                if c in ('$', '@') and lang in ("ruby", "perl", "php"):
                    return None
                if c == '#' and lang == "ruby" and j + 1 < n and arg_str[j + 1] in ('{', '$', '@'):
                    return None
                if c == '\\':
                    if j + 1 < n and arg_str[j + 1] in ('$', '@') and lang in ("ruby", "perl", "php"):
                        return None
                    j += 2
                    continue
                if c == '"':
                    break
                j += 1
            if j >= n or arg_str[j] != '"':
                return None
            tokens.append(("VAL", arg_str[i : j + 1]))
            i = j + 1
            continue

        if ch.isdigit():
            j = i
            while j < n and arg_str[j].isdigit():
                j += 1
            if j < n and arg_str[j] == '.' and j + 1 < n and arg_str[j + 1].isdigit():
                j += 1
                while j < n and arg_str[j].isdigit():
                    j += 1
            if j < n and (arg_str[j].isalpha() or arg_str[j] in ('_', '$', '.')):
                return None
            tokens.append(("VAL", arg_str[i:j]))
            i = j
            continue

        if ch in ('+', '-'):
            tokens.append(("ADD_OP", ch))
            i += 1
            continue

        if ch in ('*', '/', '%'):
            tokens.append(("MUL_OP", ch))
            i += 1
            continue

        if ch == '.' and lang in ("perl", "php"):
            tokens.append(("MUL_OP", ch))
            i += 1
            continue

        if ch == '(':
            tokens.append(("LPAREN", ch))
            i += 1
            continue

        if ch == ')':
            tokens.append(("RPAREN", ch))
            i += 1
            continue

        if ch == ',':
            tokens.append(("COMMA", ch))
            i += 1
            continue

        return None

    return tokens


def _is_valid_const_arg_list(arg_str: str, lang: str) -> bool:
    tokens = _tokenize_const_print_args(arg_str, lang)
    if tokens is None or not tokens:
        return False

    expect_operand = True
    paren_depth = 0
    for tok_type, _tok_val in tokens:
        if expect_operand:
            if tok_type == "VAL":
                expect_operand = False
            elif tok_type == "LPAREN":
                paren_depth += 1
            elif tok_type == "ADD_OP":
                pass
            else:
                return False
        else:
            if tok_type in ("ADD_OP", "MUL_OP"):
                expect_operand = True
            elif tok_type == "RPAREN":
                if paren_depth <= 0:
                    return False
                paren_depth -= 1
            elif tok_type == "COMMA":
                if paren_depth != 0:
                    return False
                expect_operand = True
            else:
                return False

    return (not expect_operand) and (paren_depth == 0)


def _strip_outer_call_parens_if_enclosing(text: str) -> tuple[bool, str]:
    """If `text` starts with `(` and the matching closing `)` is the very last character of `text`,
    return `(True, inner_text)`; otherwise return `(False, text)`.
    """
    s = text.strip()
    if not s.startswith("(") or not s.endswith(")"):
        return False, s
    depth = 0
    in_single = False
    in_double = False
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if in_single:
            if ch == '\\':
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            if ch == '\\':
                i += 2
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue
        if ch == "'":
            in_single = True
        elif ch == '"':
            in_double = True
        elif ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0:
                if i == n - 1:
                    return True, s[1:-1].strip()
                return False, s
        i += 1
    return False, s


def _is_recognized_harmless_const_print_code(code_text: str, lang: str) -> bool:
    """H35 (v10): Closed-allowlist recognizer for Node/deno/bun (`js`), Ruby (`ruby`), Perl (`perl`), and PHP (`php`).
    Only returns True when the entire code consists of one or more constant print statements
    (`console.log(...)` / `puts` / `print` / `echo`) whose arguments contain only string literals, numbers,
    arithmetic/string concatenation, and commas.
    """
    if not code_text or not code_text.strip():
        return True
    stmts = _split_const_print_statements(code_text)
    if stmts is None:
        return False
    if not stmts:
        return True

    for stmt in stmts:
        if lang == "js":
            m = re.match(r"^console\.log\s*(\(.*)$", stmt, re.DOTALL)
            if not m:
                return False
            is_enclosed, inner = _strip_outer_call_parens_if_enclosing(m.group(1))
            if not is_enclosed:
                return False
            if inner and not _is_valid_const_arg_list(inner, "js"):
                return False
        elif lang in ("ruby", "perl", "php"):
            if lang == "ruby":
                m = re.match(r"^(?:puts|print)(?:(\s*\(.*)|(\s+.+))$", stmt, re.DOTALL)
            elif lang == "perl":
                m = re.match(r"^(?:print|say)(?:(\s*\(.*)|(\s+.+))$", stmt, re.DOTALL)
            else:
                m = re.match(r"^(?:echo|print)(?:(\s*\(.*)|(\s+.+))$", stmt, re.DOTALL)
            if not m:
                return False
            rest_raw = m.group(1) if m.group(1) is not None else m.group(2)
            has_leading_space = bool(rest_raw and rest_raw[0].isspace())
            rest = rest_raw.strip()
            is_enclosed, inner = _strip_outer_call_parens_if_enclosing(rest)
            if is_enclosed:
                if not inner or not _is_valid_const_arg_list(inner, lang):
                    return False
            else:
                if not has_leading_space or not _is_valid_const_arg_list(rest, lang):
                    return False
        else:
            return False

    return True


def is_provably_harmless_inline_runner_code(code_text: str, runner_exe: str = "") -> bool:
    """H34 (v09) & H35 (v10): Closed-allowlist structural recognizer for direct inline code runners (`python3 -c`,
    `node -e`, `ruby -e`, `perl -e`, `php -r`, `deno eval`, `bun -e`) when reachable environment bindings contain
    a bulk-send signal.
    Never defaults to True: returns True ONLY when the code matches the closed AST allowlist (Python) or the
    constant-print statement grammar (Node/Ruby/Perl/PHP); returns False for all unrecognized structures.
    """
    if not code_text or not code_text.strip():
        return True
    exe = (runner_exe or "").lower()
    if exe in ('python', 'python2', 'python3', 'py') or exe.startswith(('python2.', 'python3.')):
        return _is_recognized_harmless_python_code(code_text)
    if exe in ('node', 'nodejs', 'deno', 'bun'):
        return _is_recognized_harmless_const_print_code(code_text, "js")
    if exe in ('ruby', 'irb'):
        return _is_recognized_harmless_const_print_code(code_text, "ruby")
    if exe == 'perl':
        return _is_recognized_harmless_const_print_code(code_text, "perl")
    if exe == 'php':
        return _is_recognized_harmless_const_print_code(code_text, "php")
    if not exe:
        return (
            _is_recognized_harmless_python_code(code_text)
            or _is_recognized_harmless_const_print_code(code_text, "js")
            or _is_recognized_harmless_const_print_code(code_text, "ruby")
            or _is_recognized_harmless_const_print_code(code_text, "perl")
            or _is_recognized_harmless_const_print_code(code_text, "php")
        )
    return False


def check_curl_or_wget_uncertain_write(
    sub_cmd: str,
    sc: bash_parser.SimpleCommand | None,
    static_vars: dict[str, str],
    unresolved_vars: set[str],
) -> str:
    """PCN ĐK 1 (§7 & §8 v06): Với lệnh mạng CÓ GHI (`curl` POST/PUT/PATCH/DELETE/data/form/upload,
    `wget --post*`/`--method=POST|...`, `nc`/`ncat`/`netcat`) mà bộ phân tích không chắc đích
    (`xargs`, mã hoá hex `\\x2f`, command substitution `$(...)`, biến không giải được `$URL`),
    trả về lý do mở đầu bằng «Không chắc đích ghi mạng: ...».
    Không bao giờ chặn lệnh ĐỌC (`curl` GET, `wget` GET).
    """
    exe = sc.executable if sc else ""
    via_xargs = bool(sc and sc.via_xargs)
    unwrapped_cmd = " ".join(sc.words) if (sc and sc.words) else sub_cmd

    if exe in ('nc', 'ncat', 'netcat'):
        return f"Không chắc đích ghi mạng: lệnh kết nối socket ({exe}) có thể gửi dữ liệu tới đích không xác định. Lệnh bị chặn và ghi sổ duyệt."

    if exe == "wget" or (not exe and sub_cmd.strip().startswith("wget ")):
        if not has_wget_write_flags(unwrapped_cmd):
            return ""
        if via_xargs:
            return "Không chắc đích ghi mạng: lệnh wget ghi mạng chạy qua xargs nhận đích động từ stdin. Lệnh bị chặn và ghi sổ duyệt."
        if HEX_OR_OCTAL_ESCAPE_RE.search(sub_cmd) or '$(' in sub_cmd or '`' in sub_cmd:
            return "Không chắc đích ghi mạng: lệnh wget ghi mạng chứa mã hoá hex (\\x2f) hoặc command substitution trong URL. Lệnh bị chặn và ghi sổ duyệt."
        if SHELL_VAR_REF_RE.search(sub_cmd):
            return "Không chắc đích ghi mạng: lệnh wget ghi mạng chứa biến không giải được trong đích. Lệnh bị chặn và ghi sổ duyệt."
        return ""

    if not is_curl_command(sub_cmd):
        return ""

    # Chỉ xét lệnh curl CÓ GHI (trên lệnh curl đã bóc wrapper); lệnh curl GET/đọc cho qua ngay
    if not has_curl_write_flags(unwrapped_cmd):
        return ""

    if via_xargs:
        return "Không chắc đích ghi mạng: lệnh curl ghi mạng (POST/PUT/PATCH/DELETE) chạy qua xargs nhận đích từ stdin. Lệnh bị chặn và ghi sổ duyệt."

    url_candidates = extract_curl_url_candidates(sub_cmd, sc)
    if not url_candidates:
        return "Không chắc đích ghi mạng: lệnh curl ghi mạng nhưng không giải tĩnh được URL đích. Lệnh bị chặn và ghi sổ duyệt."

    for clean_url, raw_url in url_candidates:
        if clean_url in ('{}', '__'):
            return "Không chắc đích ghi mạng: lệnh curl ghi mạng tới placeholder động (xargs {}). Lệnh bị chặn và ghi sổ duyệt."
        if HEX_OR_OCTAL_ESCAPE_RE.search(raw_url) or HEX_OR_OCTAL_ESCAPE_RE.search(clean_url):
            return "Không chắc đích ghi mạng: lệnh curl ghi mạng tới URL chứa mã hoá hex (\\x2f). Lệnh bị chặn và ghi sổ duyệt."
        if '$(' in raw_url or '`' in raw_url or '$(' in clean_url or '`' in clean_url:
            return "Không chắc đích ghi mạng: lệnh curl ghi mạng tới URL ghép bằng command substitution (ví dụ printf \\x2f). Lệnh bị chặn và ghi sổ duyệt."

        expanded_url, url_unresolved = expand_shell_vars_in_raw_token(raw_url, static_vars, unresolved_vars)
        clean_expanded = expanded_url.strip('\'"')
        if SHELL_VAR_START_PATTERN.match(clean_expanded) or SHELL_VAR_START_PATTERN.match(clean_url):
            return "Không chắc đích ghi mạng: lệnh curl ghi mạng tới địa chỉ mở đầu bằng biến không giải được ($URL). Lệnh bị chặn và ghi sổ duyệt."

        m_host = RESOLVED_STATIC_HOST_RE.match(clean_expanded)
        if not m_host:
            if url_unresolved or '$' in clean_expanded:
                return "Không chắc đích ghi mạng: lệnh curl ghi mạng tới host chứa biến không giải được. Lệnh bị chặn và ghi sổ duyệt."
        else:
            host_low = m_host.group(1).lower()
            if any(host_low == wh or host_low.endswith("." + wh) for wh in WATCHED_BULK_HOSTS) and url_unresolved:
                return f"Không chắc đích ghi mạng: lệnh curl ghi mạng tới {host_low} nhưng đường dẫn chứa biến không giải được. Lệnh bị chặn và ghi sổ duyệt."

    return ""


def should_block_bulk_send(
    tool_name: str,
    tool_input: dict,
    cwd: str = "",
    _inherited_static_vars: dict[str, str] | None = None,
    _inherited_unresolved_vars: set[str] | None = None,
    _inherited_bulk_signal: bool = False,
    _inherited_exported_vars: set[str] | None = None,
) -> str:
    # 1. Kiểm tra công cụ MCP
    if tool_name.startswith("mcp__") or tool_name.startswith("mcp_"):
        if MCP_SEND_PATTERN.search(tool_name):
            return f"Công cụ MCP ({tool_name}) thực hiện gửi dữ liệu ra bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."

    # 2. Kiểm tra lệnh Bash
    if tool_name == "Bash":
        raw_cmd = tool_input.get("command", "")
        if not raw_cmd:
            return ""

        base_cwd = cwd or os.getcwd()

        # Tách thân các heredoc chỉ ghi vào tệp hoặc heredoc tài liệu (H15 & H20)
        cmd_active, heredoc_written_files = split_heredocs(raw_cmd)

        # Gộp các dòng nối bằng \'\' ở cuối dòng trước khi xét
        cmd_joined = re.sub(r'\\\s*\n', ' ', cmd_active)

        # 2a. Kiểm tra curl có dùng -K hoặc --config không
        if re.search(r'\bcurl\b.*?(?:-K\b|--config\b)', cmd_joined):
            return "Phát hiện lệnh curl sử dụng tệp cấu hình (-K/--config) có thể gửi yêu cầu ra ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2b. Kiểm tra fetch_page_messages.py của inbox-reader
        if "fetch_page_messages" in cmd_joined:
            return "Phát hiện lệnh truy xuất tin nhắn hộp thư (fetch_page_messages.py). Lệnh bị chặn và được ghi nhận vào sổ duyệt."

        # 2c. Kiểm tra lệnh có cả graph.facebook.com và endpoint gửi/đăng hoặc xoá (trừ khi đi qua ống xargs để nhánh PCN xử lý đúng reason)
        tokens = cmd_joined.strip().split()
        first_tok = tokens[0].strip('\'"') if tokens else ""
        is_top_curl = (first_tok == "curl" or first_tok.endswith("/curl"))

        if "graph.facebook.com" in cmd_joined and not re.search(r'\bxargs\b', cmd_joined):
            if not is_top_curl:
                if any(ep in cmd_joined for ep in ('/messages', 'me/messages', '/feed', '/comments', '/photos')):
                    return "Phát hiện mã/lệnh kết nối tới graph.facebook.com gửi tin nhắn hoặc đăng bài/bình luận/ảnh. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                if re.search(r'\bdelete\b', cmd_joined, re.IGNORECASE):
                    return "Phát hiện mã/lệnh xoá dữ liệu tới graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt."

            # 2d. Kiểm tra batch gửi tới graph.facebook.com
            if ("batch=" in cmd_joined or "relative_url" in cmd_joined) and any(ep in cmd_joined for ep in ('messages', 'feed', 'comments', 'photos')):
                return "Phát hiện batch request gửi dữ liệu qua graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2e. Kiểm tra thân heredoc thực thi (chảy vào python/node/sh hoặc ghi-rồi-chạy — H15, H37 & PCN ĐK 1)
        raw_has_ruby_runner = bool(re.search(r'\b(?:ruby|irb)\b', raw_cmd))
        for hd_body in bash_parser.extract_executed_heredocs(raw_cmd):
            if SMTP_PATTERN.search(hd_body):
                return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."
            if (raw_has_ruby_runner or is_ruby_runner_or_script(content=hd_body)) and RUBY_SMTP_PATTERN.search(hd_body):
                return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."
            for endpoint in BULK_SEND_ENDPOINTS:
                if endpoint.search(hd_body):
                    return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."
            uncertain_hd_reason = check_inline_code_uncertain_network_write(hd_body)
            if uncertain_hd_reason:
                return uncertain_hd_reason

        # 2f. Tách câu lệnh thành các pipeline bằng bộ phân tích tôn trọng nháy của bash_parser (H16a, H19, H23, H24, H27, H28 & H36)
        pipelines = split_clauses_and_pipelines_safe(cmd_joined)
        cur_cwd = base_cwd
        static_vars: dict[str, str] = dict(_inherited_static_vars) if _inherited_static_vars else {}
        unresolved_vars: set[str] = set(_inherited_unresolved_vars) if _inherited_unresolved_vars else set()
        exported_vars: set[str] = set(_inherited_exported_vars) if _inherited_exported_vars else set()
        chain_has_bulk_send_signal: bool = bool(_inherited_bulk_signal) or has_bulk_send_signal(cmd_joined)

        for pipe_subs in pipelines:
            for ps in pipe_subs:
                ps_sc = parse_simple_command_safe(ps, cur_cwd)
                # H28 (v07): Chỉ vào nhánh xét trước xargs khi executable mạng thật sau bóc wrapper là curl/wget/nc,
                # và KHÔNG kết thúc hàm nếu helper trả chuỗi rỗng (để tiếp tục xét các lệnh sau ;, &&, ||, |).
                if ps_sc and ps_sc.via_xargs and ps_sc.executable in ("curl", "wget", "nc", "ncat", "netcat"):
                    xargs_reason = check_curl_or_wget_uncertain_write(ps, ps_sc, static_vars, unresolved_vars)
                    if xargs_reason:
                        return xargs_reason

            pipeline_has_runner = any(is_code_or_smtp_runner(ps) for ps in pipe_subs)

            for sub in pipe_subs:
                # Kiểm tra command substitution $(...) hoặc `...` ngoài nháy đơn
                for subst_cmd in bash_parser.extract_substitutions_safe(sub):
                    subst_reason = should_block_bulk_send(
                        "Bash",
                        {"command": subst_cmd},
                        cur_cwd,
                        static_vars,
                        unresolved_vars,
                        chain_has_bulk_send_signal,
                        exported_vars,
                    )
                    if subst_reason:
                        return subst_reason

                # Kiểm tra subshell ( ... )
                if sub.startswith('(') and sub.endswith(')'):
                    inner_reason = should_block_bulk_send(
                        "Bash",
                        {"command": sub[1:-1].strip()},
                        cur_cwd,
                        static_vars,
                        unresolved_vars,
                        chain_has_bulk_send_signal,
                        exported_vars,
                    )
                    if inner_reason:
                        return inner_reason
                    continue

                # Cập nhật cur_cwd nếu là lệnh cd
                new_cwd = extract_cd_target(sub, cur_cwd)
                if new_cwd != cur_cwd:
                    cur_cwd = new_cwd
                    continue

                sc = parse_simple_command_safe(sub, cur_cwd)

                # H19 (v05), H23 (v06), H27 (v07) & H36 (v10): Cập nhật bảng gán biến shell của CHA (static_vars / exported_vars)
                # và dựng bảng môi trường của TIẾN TRÌNH CON (child_static_vars / child_exported_vars).
                prefix_has_signal, child_static_vars, child_unresolved_vars, child_exported_vars = update_shell_var_bindings(
                    sub, sc, static_vars, unresolved_vars, exported_vars
                )
                if prefix_has_signal:
                    chain_has_bulk_send_signal = True

                # Handle find ... -exec / -execdir / -ok / -okdir (H27 & H32f)
                if sc and sc.executable == 'find' and len(sc.words) > 1:
                    raw_words = getattr(sc, "raw_words", None) or sc.words
                    handled_find_exec = False
                    f_idx = 1
                    while f_idx < len(sc.words):
                        fw = sc.words[f_idx]
                        if fw in ('-exec', '-execdir', '-ok', '-okdir') and f_idx + 1 < len(sc.words):
                            end_idx = f_idx + 1
                            while end_idx < len(sc.words) and sc.words[end_idx] not in (';', '+'):
                                end_idx += 1
                            if end_idx > f_idx + 1:
                                handled_find_exec = True
                                exec_raw_cmd = " ".join(raw_words[f_idx + 1 : end_idx])
                                exec_sc = parse_simple_command_safe(exec_raw_cmd, cur_cwd)
                                exec_child_static = dict(child_static_vars)
                                exec_child_unres = set(child_unresolved_vars)
                                exec_child_exp = set(child_exported_vars)
                                exec_prefix_sig, exec_child_static, exec_child_unres, exec_child_exp = update_shell_var_bindings(
                                    exec_raw_cmd, exec_sc, exec_child_static, exec_child_unres, exec_child_exp
                                )
                                if exec_prefix_sig:
                                    chain_has_bulk_send_signal = True
                                if exec_sc and exec_sc.executable in ('sh', 'bash', 'zsh', 'ksh', 'dash') and len(exec_sc.words) > 1:
                                    exec_raw_words = getattr(exec_sc, "raw_words", None) or exec_sc.words
                                    for c_idx, w in enumerate(exec_sc.words[1:], start=1):
                                        if w.startswith('-') and not w.startswith('--') and 'c' in w and c_idx + 1 < len(exec_sc.words):
                                            raw_nested = (
                                                exec_raw_words[c_idx + 1]
                                                if (c_idx + 1) < len(exec_raw_words)
                                                else exec_sc.words[c_idx + 1]
                                            )
                                            expanded_nested, nested_unresolved = expand_shell_vars_in_raw_token(
                                                raw_nested, static_vars, unresolved_vars
                                            )
                                            if nested_unresolved and chain_has_bulk_send_signal:
                                                return "Phát hiện lệnh thực thi mã qua biến shell chưa giải tĩnh trong chuỗi lệnh có mẫu gửi tin/SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                                            inner_reason = should_block_bulk_send(
                                                "Bash",
                                                {"command": expanded_nested},
                                                cur_cwd,
                                                exec_child_static,
                                                exec_child_unres,
                                                chain_has_bulk_send_signal,
                                                exec_child_exp,
                                            )
                                            if inner_reason:
                                                return inner_reason
                                            break
                                else:
                                    inner_reason = should_block_bulk_send(
                                        "Bash",
                                        {"command": exec_raw_cmd},
                                        cur_cwd,
                                        exec_child_static,
                                        exec_child_unres,
                                        chain_has_bulk_send_signal,
                                        exec_child_exp,
                                    )
                                    if inner_reason:
                                        return inner_reason
                            f_idx = end_idx + 1
                        else:
                            f_idx += 1
                    if handled_find_exec and not pipeline_has_runner:
                        continue

                # Unwrap shell wrappers (bash -c, sh -c, zsh -c, dash -c, ksh -c, eval) into inner command (H16a, H19, H24, H27 & H32)
                if sc and sc.executable in ('sh', 'bash', 'zsh', 'ksh', 'dash') and len(sc.words) > 1:
                    handled_shell_c = False
                    raw_words = getattr(sc, "raw_words", None) or sc.words
                    for c_idx, w in enumerate(sc.words[1:], start=1):
                        if w.startswith('-') and not w.startswith('--') and 'c' in w and c_idx + 1 < len(sc.words):
                            raw_nested = raw_words[c_idx + 1] if (c_idx + 1) < len(raw_words) else sc.words[c_idx + 1]
                            # H23 & H27(a): Expand -c argument in parent shell using parent table (static_vars, unresolved_vars)
                            expanded_nested, nested_unresolved = expand_shell_vars_in_raw_token(
                                raw_nested, static_vars, unresolved_vars
                            )
                            if nested_unresolved and chain_has_bulk_send_signal:
                                return "Phát hiện lệnh thực thi mã qua biến shell chưa giải tĩnh trong chuỗi lệnh có mẫu gửi tin/SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                            try:
                                # H27(b,c) & H32 (v08): Analyze inner command in child shell using child environment (child_static_vars, child_unresolved_vars).
                                # When inner command is resolved and harmless, do not block solely on prefix_has_signal.
                                inner_reason = should_block_bulk_send(
                                    "Bash",
                                    {"command": expanded_nested},
                                    cur_cwd,
                                    child_static_vars,
                                    child_unresolved_vars,
                                    chain_has_bulk_send_signal,
                                    child_exported_vars,
                                )
                                if inner_reason:
                                    return inner_reason
                                handled_shell_c = True
                            except Exception:
                                pass
                            break
                    if handled_shell_c:
                        continue
                elif sc and sc.executable == 'eval' and len(sc.words) > 1:
                    raw_words = getattr(sc, "raw_words", None) or sc.words
                    eval_parts: list[str] = []
                    eval_unresolved = False
                    for rw in raw_words[1:]:
                        exp_part, part_unres = expand_shell_vars_in_raw_token(rw, static_vars, unresolved_vars)
                        eval_parts.append(exp_part)
                        if part_unres:
                            eval_unresolved = True
                    expanded_nested = " ".join(eval_parts)
                    if eval_unresolved and chain_has_bulk_send_signal:
                        return "Phát hiện lệnh thực thi mã qua biến shell chưa giải tĩnh trong chuỗi lệnh có mẫu gửi tin/SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                    try:
                        inner_reason = should_block_bulk_send(
                            "Bash",
                            {"command": expanded_nested},
                            cur_cwd,
                            child_static_vars,
                            child_unresolved_vars,
                            chain_has_bulk_send_signal,
                            child_exported_vars,
                        )
                        if inner_reason:
                            return inner_reason
                        continue
                    except Exception:
                        pass

                # (a) Cờ --dong-y khi chạy script
                if check_script_dong_y(sub):
                    return "Phát hiện lệnh chạy script với cờ gửi/đăng thật (--dong-y). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                # (b1) For inline code runners (-c/-e/--eval/-p/--print/-r), expand variables respecting quotes (H24)
                # and scan for SMTP/nodemailer patterns, bulk endpoints, uncertain network writes (PCN-1), and H34/H35/H36/H37 (v10) rules
                expanded_cmd_vars: set[str] = set()
                if sc and getattr(sc, "raw_words", None):
                    for rw in sc.raw_words:
                        expanded_cmd_vars.update(extract_expanded_var_names_in_raw_token(rw))
                else:
                    expanded_cmd_vars.update(extract_expanded_var_names_in_raw_token(sub))

                reachable_vars = child_exported_vars | expanded_cmd_vars
                env_has_signal = prefix_has_signal or any(
                    (k in child_static_vars and has_bulk_send_signal(child_static_vars[k]))
                    or (k in child_unresolved_vars and chain_has_bulk_send_signal)
                    for k in reachable_vars
                )
                sub_is_ruby = is_ruby_runner_or_script(sub_cmd=sub, sc=sc)
                runner_exe_name = sc.executable if sc is not None else ""
                inline_code_pairs = extract_inline_code_raw_args(sc) if sc is not None else []
                if inline_code_pairs:
                    if env_has_signal and has_unsafe_inline_runner_flags(sc):
                        return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (gán đầu lệnh có mẫu gửi, mã inline không chắc vô hại). Lệnh bị chặn và cần chủ trực tiếp duyệt."
                    for code_arg, raw_code_arg in inline_code_pairs:
                        expanded_code, code_unresolved = expand_shell_vars_in_raw_token(
                            raw_code_arg, static_vars, unresolved_vars
                        )
                        for candidate_code in (code_arg, expanded_code):
                            if SMTP_PATTERN.search(candidate_code) or (sub_is_ruby and RUBY_SMTP_PATTERN.search(candidate_code)):
                                return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."
                            for endpoint in BULK_SEND_ENDPOINTS:
                                if endpoint.search(candidate_code):
                                    return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."
                            uncertain_code_reason = check_inline_code_uncertain_network_write(candidate_code)
                            if uncertain_code_reason:
                                return uncertain_code_reason
                            if env_has_signal and not is_provably_harmless_inline_runner_code(candidate_code, runner_exe_name):
                                return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (gán đầu lệnh có mẫu gửi, mã inline không chắc vô hại). Lệnh bị chặn và cần chủ trực tiếp duyệt."
                        if code_unresolved and (chain_has_bulk_send_signal or env_has_signal):
                            return "Phát hiện lệnh thực thi mã qua biến shell chưa giải tĩnh trong chuỗi lệnh có mẫu gửi tin/SMTP. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                elif prefix_has_signal and is_code_or_smtp_runner(sub):
                    return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (gán đầu lệnh có mẫu gửi, mã inline không chắc vô hại). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                # (b2) Check SMTP on command argv / subcommand words after stripping prefix env assignments (H13, H16a, H19, H24, H32d & H37)
                sc_joined_words = " ".join(sc.words) if (sc and sc.words) else sub
                if sc and getattr(sc, "raw_words", None):
                    expanded_word_list = [
                        expand_shell_vars_in_raw_token(rw, static_vars, unresolved_vars)[0]
                        for rw in sc.raw_words
                    ]
                    expanded_words = " ".join(expanded_word_list)
                else:
                    expanded_words = sc_joined_words

                has_argv_smtp = (
                    (
                        SMTP_PATTERN.search(sc_joined_words)
                        or SMTP_PATTERN.search(expanded_words)
                        or (sub_is_ruby and (RUBY_SMTP_PATTERN.search(sc_joined_words) or RUBY_SMTP_PATTERN.search(expanded_words)))
                    )
                    if (sc and sc.words)
                    else (SMTP_PATTERN.search(sub) or (sub_is_ruby and RUBY_SMTP_PATTERN.search(sub)))
                )
                if has_argv_smtp:
                    _, sub_base = extract_subcommand_executable(sub)
                    if sub_base in EXEMPT_PRINT_COMMANDS and not pipeline_has_runner:
                        pass
                    elif is_code_or_smtp_runner(sub) or pipeline_has_runner:
                        return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                sub_is_curl = is_curl_command(sub)

                if sub_is_curl:
                    # Nếu curl chạy qua xargs và có cờ ghi mạng -> hỏi duyệt không chắc đích (PCN A1 & H28)
                    if sc and sc.via_xargs and has_curl_write_flags(sc_joined_words):
                        xargs_curl_reason = check_curl_or_wget_uncertain_write(sub, sc, static_vars, unresolved_vars)
                        if xargs_curl_reason:
                            return xargs_curl_reason

                    # Kiểm tra curl DELETE tới graph.facebook.com
                    if "graph.facebook.com" in sub and has_curl_delete_flags(sub):
                        return "Phát hiện lệnh curl DELETE tới graph.facebook.com xoá dữ liệu. Lệnh bị chặn và cần chủ trực tiếp duyệt."

                    # Miễn trừ /conversations: CHỈ áp khi lệnh con là curl, không có cờ POST/write hay data, và không có endpoint gửi/đăng
                    if "graph.facebook.com" in sub and "conversations" in sub:
                        if not has_curl_write_flags(sub) and not any(ep in sub for ep in ('/messages', 'me/messages', '/feed', '/comments', '/photos')):
                            continue

                # Kiểm tra xem lệnh con có nhắm vào các endpoint gửi tin đã biết không (B1 giữ nguyên reason chắc chắn)
                for endpoint in BULK_SEND_ENDPOINTS:
                    has_argv_endpoint = (
                        (endpoint.search(sc_joined_words) or endpoint.search(expanded_words))
                        if (sc and sc.words)
                        else endpoint.search(sub)
                    )
                    if has_argv_endpoint:
                        if sub_is_curl:
                            # Với curl, chỉ chặn khi có cờ POST / data / upload
                            if has_curl_post_flags(sub):
                                return "Phát hiện lệnh POST gửi tin nhắn/email ra dịch vụ bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                        elif not (sc and sc.executable in EXEMPT_PRINT_COMMANDS and not pipeline_has_runner):
                            # Với công cụ khác (wget, http, python, node, v.v.), có endpoint gửi là chặn
                            return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                # PCN ĐK 1 (§7 & §8 v06): Kiểm tra lệnh mạng CÓ GHI nhưng không chắc đích (A1, A2, A4, wget POST, nc)
                uncertain_net_reason = check_curl_or_wget_uncertain_write(sub, sc, static_vars, unresolved_vars)
                if uncertain_net_reason:
                    return uncertain_net_reason

                # (c) Kiểm tra chạy tệp kịch bản trong dự án (< 1 MB hoặc vừa ghi từ heredoc)
                script_reason = check_script_file_bulk_send(sub, cur_cwd, heredoc_written_files)
                if script_reason:
                    return script_reason

    return ""


def log_approval_request(tool_name: str, tool_input: dict, reason: str, cwd: str):
    """Ghi yêu cầu phê duyệt (đã chặn) vào operations/data/approvals/<YYYY-MM-DD>.jsonl (che PII)."""
    try:
        root = office_root.resolve_project_root(cwd)

        approvals_dir = os.path.join(root, "operations", "data", "approvals")
        os.makedirs(approvals_dir, exist_ok=True)
        today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        filepath = os.path.join(approvals_dir, f"{today}.jsonl")

        # Xác định ghế từ cwd hoặc CLAUDE_PROJECT_DIR
        seat = "unknown"
        norm_cwd = cwd.replace('\\', '/')
        if "seats/" in norm_cwd:
            seat = norm_cwd.split("seats/")[1].split("/")[0]
        else:
            proj_dir = os.environ.get("CLAUDE_PROJECT_DIR", "").replace('\\', '/')
            if "seats/" in proj_dir:
                seat = proj_dir.split("seats/")[1].split("/")[0]

        # Che PII: {ts, seat, tool, host, len, sha256, head60, reason}
        input_str = json.dumps(tool_input, ensure_ascii=False) if isinstance(tool_input, dict) else str(tool_input)
        input_len = len(input_str)
        input_sha256 = hashlib.sha256(input_str.encode('utf-8')).hexdigest()
        raw_head60 = input_str[:60]
        masked_head60 = re.sub(r'\d', '*', raw_head60)
        target_host = extract_target_host(tool_name, tool_input)

        record = {
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "seat": seat,
            "tool": tool_name,
            "host": target_host,
            "len": input_len,
            "sha256": input_sha256,
            "head60": masked_head60,
            "reason": reason
        }
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        short_reason = f"{type(e).__name__}: {e}".strip()
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] approval request NOT recorded: {short_reason}\n")


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] stdin rỗng, chặn cho chắc.\n")
            sys.exit(2)

        data = json.loads(raw_input)
        if "tool_input" not in data:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] thiếu tool_input trong dữ liệu đầu vào, chặn cho chắc.\n")
            sys.exit(2)

        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {})
        cwd = data.get("cwd", os.getcwd())
        office_root.resolve_project_root(cwd)

        block_reason = should_block_bulk_send(tool_name, tool_input, cwd)
        if block_reason:
            log_approval_request(tool_name, tool_input, block_reason, cwd)
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] Lệnh gửi hàng loạt bị chặn: {block_reason}\n")
            sys.exit(2)

        # Cho qua, stdout rỗng
        sys.exit(0)
    except SystemExit:
        raise
    except Exception:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi nội bộ hook, chặn cho chắc\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
