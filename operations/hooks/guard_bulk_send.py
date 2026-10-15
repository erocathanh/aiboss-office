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
    'ruby', 'perl', 'php',
    'bash', 'sh', 'zsh', 'ksh', 'dash',
    'eval', 'exec', 'osascript', 'xargs', 'source', '.',
}
INLINE_CODE_RUNNERS = {
    'python', 'python2', 'python3', 'py',
    'node', 'nodejs', 'deno', 'bun',
    'ruby', 'perl', 'php', 'osascript',
    'bash', 'sh', 'zsh', 'ksh', 'dash',
}
SMTP_CLIENT_BINARIES = {'sendmail', 'msmtp', 'swaks', 'curl', 'wget', 'nc', 'ncat', 'netcat', 'openssl', 'telnet', 'mail', 'mailx', 'mutt'}
COMMAND_WRAPPERS = {'env', 'sudo', 'command', 'nohup', 'nice', 'time', 'caffeinate', 'timeout'}
SCRIPT_EXTENSIONS = ('.py', '.sh', '.js', '.mjs')
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


def extract_inline_code_args(sc: bash_parser.SimpleCommand) -> list[str]:
    """H16a (v04): Với runner (`python*`, `node`, `deno`, `bun`, `perl`, `ruby`, `php`, `osascript`, `bash`/`sh`/`zsh`),
    lấy toàn bộ chuỗi mã của `-c` / `-e` / `-E` / `--eval` / `-p` / `--print` / `-r` từ `sc.words` đã tách nháy
    (một đối số nguyên vẹn, không tách bên trong bằng regex).
    """
    exe = sc.executable
    if not (exe in INLINE_CODE_RUNNERS or exe.startswith(('python2.', 'python3.'))):
        return []
    codes: list[str] = []
    words = sc.words
    i = 1
    while i < len(words):
        w = words[i]
        if w in ('-c', '-e', '-E', '--eval', '-p', '--print', '-r') and i + 1 < len(words):
            codes.append(words[i + 1])
            i += 2
            continue
        if exe.startswith(('python', 'py')) and w.startswith('-') and not w.startswith('--') and w.endswith('c') and len(w) > 2 and i + 1 < len(words):
            codes.append(words[i + 1])
            i += 2
            continue
        if exe in ('sh', 'bash', 'zsh', 'ksh', 'dash') and w.startswith('-') and not w.startswith('--') and 'c' in w and i + 1 < len(words):
            codes.append(words[i + 1])
            i += 2
            continue
        if w.startswith(('-c', '-e', '-r')) and not w.startswith('--') and len(w) > 2:
            codes.append(w[2:])
            i += 1
            continue
        if w.startswith(('--eval=', '--print=')):
            codes.append(w.split('=', 1)[1])
            i += 1
            continue
        i += 1
    return codes


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


def has_curl_variable_url(sub_cmd: str) -> bool:
    """Kiểm tra lệnh curl có địa chỉ đích mở đầu bằng biến ($X, ${X}/...) không."""
    sc = parse_simple_command_safe(sub_cmd)
    tokens = sc.words if (sc and sc.words) else split_tokens(sub_cmd)
    if not tokens:
        return False

    idx = 0
    while idx < len(tokens) and '=' in tokens[idx] and not tokens[idx].startswith('-'):
        idx += 1
    if idx >= len(tokens):
        return False

    first = tokens[idx].strip('\'"')
    if not (first == "curl" or first.endswith("/curl")):
        return False

    i = idx + 1
    while i < len(tokens):
        tok = tokens[i]
        clean = tok.strip('\'"')
        if clean == '--url' and i + 1 < len(tokens):
            url_val = tokens[i + 1].strip('\'"')
            if SHELL_VAR_START_PATTERN.match(url_val):
                return True
            i += 2
            continue
        if clean.startswith('--url='):
            url_val = clean.split('=', 1)[1].strip('\'"')
            if SHELL_VAR_START_PATTERN.match(url_val):
                return True
            i += 1
            continue
        if clean in CURL_VALUE_FLAGS:
            i += 2
            continue
        if clean.startswith('-'):
            i += 1
            continue
        if SHELL_VAR_START_PATTERN.match(clean):
            return True
        i += 1
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


def scan_script_content(content: str, label: str) -> str:
    """Quét nội dung kịch bản tìm các mẫu địa chỉ gửi hoặc SMTP."""
    for endpoint in BULK_SEND_ENDPOINTS:
        if endpoint.search(content):
            return f"Phát hiện tệp kịch bản ({label}) chứa địa chỉ gửi dữ liệu ra ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."
    if SMTP_PATTERN.search(content):
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
            reason = scan_script_content(hd_body, base_arg or clean_arg)
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

    return scan_script_content(content, os.path.basename(script_path))


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

    if SMTP_PATTERN.search(text):
        return "smtp"

    return "local"


def should_block_bulk_send(tool_name: str, tool_input: dict, cwd: str = "") -> str:
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

        # Tách thân các heredoc chỉ ghi vào tệp hoặc heredoc tài liệu (H15)
        cmd_active, heredoc_written_files = split_heredocs(raw_cmd)

        # Gộp các dòng nối bằng '\' ở cuối dòng trước khi xét
        cmd_joined = re.sub(r'\\\s*\n', ' ', cmd_active)

        # 2a. Kiểm tra curl có dùng -K hoặc --config không
        if re.search(r'\bcurl\b.*?(?:-K\b|--config\b)', cmd_joined):
            return "Phát hiện lệnh curl sử dụng tệp cấu hình (-K/--config) có thể gửi yêu cầu ra ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2b. Kiểm tra fetch_page_messages.py của inbox-reader
        if "fetch_page_messages" in cmd_joined:
            return "Phát hiện lệnh truy xuất tin nhắn hộp thư (fetch_page_messages.py). Lệnh bị chặn và được ghi nhận vào sổ duyệt."

        # 2c. Kiểm tra lệnh có cả graph.facebook.com và endpoint gửi/đăng hoặc xoá
        tokens = cmd_joined.strip().split()
        first_tok = tokens[0].strip('\'"') if tokens else ""
        is_top_curl = (first_tok == "curl" or first_tok.endswith("/curl"))

        if "graph.facebook.com" in cmd_joined:
            if not is_top_curl:
                if any(ep in cmd_joined for ep in ('/messages', 'me/messages', '/feed', '/comments', '/photos')):
                    return "Phát hiện mã/lệnh kết nối tới graph.facebook.com gửi tin nhắn hoặc đăng bài/bình luận/ảnh. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                if re.search(r'\bdelete\b', cmd_joined, re.IGNORECASE):
                    return "Phát hiện mã/lệnh xoá dữ liệu tới graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt."

            # 2d. Kiểm tra batch gửi tới graph.facebook.com
            if ("batch=" in cmd_joined or "relative_url" in cmd_joined) and any(ep in cmd_joined for ep in ('messages', 'feed', 'comments', 'photos')):
                return "Phát hiện batch request gửi dữ liệu qua graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2e. Kiểm tra thân heredoc thực thi (chảy vào python/node/sh hoặc ghi-rồi-chạy — H15)
        for hd_body in bash_parser.extract_executed_heredocs(raw_cmd):
            if SMTP_PATTERN.search(hd_body):
                return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."
            for endpoint in BULK_SEND_ENDPOINTS:
                if endpoint.search(hd_body):
                    return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2f. Tách câu lệnh thành các pipeline bằng bộ phân tích tôn trọng nháy của bash_parser (H16a)
        pipelines = split_clauses_and_pipelines_safe(cmd_joined)
        cur_cwd = base_cwd

        for pipe_subs in pipelines:
            pipeline_has_runner = any(is_code_or_smtp_runner(ps) for ps in pipe_subs)

            for sub in pipe_subs:
                # Kiểm tra command substitution $(...) hoặc `...` ngoài nháy đơn
                for subst_cmd in bash_parser.extract_substitutions_safe(sub):
                    subst_reason = should_block_bulk_send("Bash", {"command": subst_cmd}, cur_cwd)
                    if subst_reason:
                        return subst_reason

                # Kiểm tra subshell ( ... )
                if sub.startswith('(') and sub.endswith(')'):
                    inner_reason = should_block_bulk_send("Bash", {"command": sub[1:-1].strip()}, cur_cwd)
                    if inner_reason:
                        return inner_reason
                    continue

                # Cập nhật cur_cwd nếu là lệnh cd
                new_cwd = extract_cd_target(sub, cur_cwd)
                if new_cwd != cur_cwd:
                    cur_cwd = new_cwd
                    continue

                sc = parse_simple_command_safe(sub, cur_cwd)

                # Bóc wrapper shell (bash -c, sh -c, zsh -c, eval) tới lệnh bên trong (H16a)
                if sc and sc.executable in ('sh', 'bash', 'zsh', 'ksh', 'dash') and len(sc.words) > 1:
                    handled_shell_c = False
                    for c_idx, w in enumerate(sc.words[1:], start=1):
                        if w.startswith('-') and not w.startswith('--') and 'c' in w and c_idx + 1 < len(sc.words):
                            nested_script = sc.words[c_idx + 1]
                            try:
                                inner_reason = should_block_bulk_send("Bash", {"command": nested_script}, cur_cwd)
                                if inner_reason:
                                    return inner_reason
                                handled_shell_c = True
                            except Exception:
                                pass
                            break
                    if handled_shell_c:
                        continue
                elif sc and sc.executable == 'eval' and len(sc.words) > 1:
                    nested_script = " ".join(sc.words[1:])
                    try:
                        inner_reason = should_block_bulk_send("Bash", {"command": nested_script}, cur_cwd)
                        if inner_reason:
                            return inner_reason
                        continue
                    except Exception:
                        pass

                # (a) Cờ --dong-y khi chạy script
                if check_script_dong_y(sub):
                    return "Phát hiện lệnh chạy script với cờ gửi/đăng thật (--dong-y). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                # (b1) Với runner có cờ mã nội tuyến (-c/-e/--eval/-p/--print/-r), quét mẫu SMTP/nodemailer và endpoint trên TOÀN BỘ chuỗi đối số mã (H16a)
                if sc is not None:
                    for code_arg in extract_inline_code_args(sc):
                        if SMTP_PATTERN.search(code_arg):
                            return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."
                        for endpoint in BULK_SEND_ENDPOINTS:
                            if endpoint.search(code_arg):
                                return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                # (b2) Kiểm tra SMTP trên argv / subcommand (H13 & H16a: chỉ chặn khi thực thi mã/script/heredoc chạy hoặc gọi client thật; miễn lệnh chỉ in/đọc/tìm tài liệu)
                sc_joined_words = " ".join(sc.words) if (sc and sc.words) else sub
                if SMTP_PATTERN.search(sc_joined_words) or SMTP_PATTERN.search(sub):
                    _, sub_base = extract_subcommand_executable(sub)
                    if sub_base in EXEMPT_PRINT_COMMANDS and not pipeline_has_runner:
                        pass
                    elif is_code_or_smtp_runner(sub) or pipeline_has_runner:
                        return "Phát hiện lệnh kết nối/gửi email qua giao thức SMTP (smtplib/smtp/sendmail). Lệnh bị chặn và cần chủ trực tiếp duyệt."

                sub_is_curl = is_curl_command(sub)

                if sub_is_curl:
                    # Kiểm tra curl DELETE tới graph.facebook.com
                    if "graph.facebook.com" in sub and has_curl_delete_flags(sub):
                        return "Phát hiện lệnh curl DELETE tới graph.facebook.com xoá dữ liệu. Lệnh bị chặn và cần chủ trực tiếp duyệt."

                    # Kiểm tra curl có cờ gửi dữ liệu mà địa chỉ đích mở đầu bằng biến ($X, ${X}/...)
                    if has_curl_post_flags(sub) and has_curl_variable_url(sub):
                        return "Phát hiện lệnh curl gửi dữ liệu tới địa chỉ mở đầu bằng biến môi trường/shell. Lệnh bị chặn và cần chủ trực tiếp duyệt."

                    # Miễn trừ /conversations: CHỈ áp khi lệnh con là curl, không có cờ POST hay data, và không có endpoint gửi/đăng
                    if "graph.facebook.com" in sub and "conversations" in sub:
                        if not has_curl_post_flags(sub) and not any(ep in sub for ep in ('/messages', 'me/messages', '/feed', '/comments', '/photos')):
                            continue

                # Kiểm tra xem lệnh con có nhắm vào các endpoint gửi tin không
                for endpoint in BULK_SEND_ENDPOINTS:
                    if endpoint.search(sc_joined_words) or endpoint.search(sub):
                        if sub_is_curl:
                            # Với curl, chỉ chặn khi có cờ POST / data / upload
                            if has_curl_post_flags(sub):
                                return "Phát hiện lệnh POST gửi tin nhắn/email ra dịch vụ bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                        else:
                            # Với công cụ khác (wget, http, python, node, v.v.), có endpoint gửi là chặn
                            return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."

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
