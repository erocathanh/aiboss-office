#!/usr/bin/env python3
"""Hook 2: block_secret_leak.py
Chặn rò rỉ secret / API token / khoá bí mật và các lệnh đọc tệp nhạy cảm (.env, .config/aiboss-office, meta-page-token, hash-salt).
Tuân thủ đầy đủ kết quả rà soát an toàn chuyên sâu (review 30/09/2026 và bản vá v03 ngày 13/10/2026).
"""

import sys
import json
import os
import re

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import bash_parser

HOOK_NAME = "block_secret_leak"

SECRET_PATTERNS = [
    (re.compile(r'sk-ant-[A-Za-z0-9_-]{20,}'), "Claude API key (sk-ant-...)"),
    # Bỏ \b trước sk- để bắt cả a<KEY:sk-...>
    (re.compile(r'sk-[A-Za-z0-9_-]{20,}'), "OpenAI/API secret key (sk-...)"),
    (re.compile(r'github_pat_[A-Za-z0-9_]{20,}'), "GitHub Personal Access Token (github_pat_...)"),
    # Bỏ \b trước gh[pousr]_ để bắt cả tiền tố dính liền như a<KEY:ghp_:36>
    (re.compile(r'gh[pousr]_[A-Za-z0-9]{36,}'), "GitHub Token (ghp_...)"),
    # AIza không bắt buộc biên từ \b đầu và cuối
    (re.compile(r'AIza[0-9A-Za-z_-]{35}'), "Google API Key (AIza...)"),
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----'), "Private Key Block"),
    (re.compile(r'xox[bp]-[A-Za-z0-9-]{10,}'), "Slack Token (xoxb/xoxp-...)"),
    (re.compile(r'EAA[A-Za-z0-9]{40,}'), "Meta Graph API Access Token (EAA...)"),
]

ENV_PATH_REGEX = re.compile(
    r'(?:^|[\s\'"`\(\)\[\]\{\}<>;|&=:,])'  # Boundary
    r'('
    r'[\w~$\./-]*'                          # Optional directory path prefix (allows /, ., ~, $, alphanumeric, -, _)
    r'\.env(?:\.[A-Za-z0-9_-]+)?'          # .env or .env.<suffix>
    r')'
    r'(?=$|[\s\'"`\(\)\[\]\{\}<>;|&=:,])'  # Boundary lookahead
)

def is_exempt_env_path(p: str) -> bool:
    clean = p.strip().strip("'\"`")
    base = os.path.basename(clean)
    if base in ('.env.example', '.env.sample'):
        return True
    if base.startswith('.env.example.') or base.startswith('.env.sample.'):
        return True
    return False

def extract_env_paths(text: str) -> list[str]:
    paths = []
    for m in ENV_PATH_REGEX.findall(text):
        clean = m.strip().strip("'\"`")
        if clean and not is_exempt_env_path(clean):
            paths.append(clean)
    return paths

def has_config_path(text: str) -> bool:
    return '.config/aiboss-office' in text

def extract_strings(obj):
    """Trích xuất tất cả chuỗi từ cấu trúc JSON đệ quy."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from extract_strings(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from extract_strings(item)

def check_secret_leak(tool_name: str, tool_input: dict, cwd: str) -> str:
    # 1. Kiểm tra sự xuất hiện của các secret patterns trong mọi chuỗi dữ liệu
    for s in extract_strings(tool_input):
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(s):
                return f"Phát hiện chuỗi secret nhạy cảm ({label}). Không được đưa token vào mã nguồn, lệnh hoặc tài liệu."

    # 2. Nếu là lệnh Bash, kiểm tra các lệnh đọc .env, .config/aiboss-office hoặc tệp chìa meta
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, _ = bash_parser.parse_bash_script(cmd, cwd)

        # Trích xuất heredoc contents nếu có
        heredocs = []
        lines = cmd.splitlines()
        in_hd = False
        delim = None
        hd_lines = []
        for line in lines:
            if in_hd:
                if line.strip() == delim:
                    in_hd = False
                    heredocs.append("\n".join(hd_lines))
                    hd_lines = []
                    delim = None
                else:
                    hd_lines.append(line)
            else:
                m = re.search(r'<<-?\s*[\'"]?([A-Za-z0-9_-]+)[\'"]?', line)
                if m:
                    in_hd = True
                    delim = m.group(1)

        # Kiểm tra heredocs
        for hd in heredocs:
            if has_config_path(hd):
                return "Lệnh truy cập thư mục cấu hình bí mật .config/aiboss-office bị chặn để bảo vệ bí mật vận hành."
            if extract_env_paths(hd):
                return "Lệnh đọc tệp .env bị chặn. Hãy cấu hình biến môi trường qua môi trường hệ thống an toàn."
            if 'meta-page-token' in hd or 'hash-salt' in hd:
                return "Lệnh đọc/in tệp chìa meta-page-token hoặc hash-salt bị chặn để bảo vệ bí mật vận hành."

        for sc in commands:
            exe = sc.executable
            words = sc.words

            # A. Kiểm tra redirection trên MỌI lệnh
            for op, target in sc.redirections:
                if has_config_path(target):
                    return "Lệnh truy cập thư mục cấu hình bí mật .config/aiboss-office bị chặn để bảo vệ bí mật vận hành."
                if extract_env_paths(target):
                    return "Lệnh đọc tệp .env qua chuyển hướng đầu vào bị chặn."
                if 'meta-page-token' in target or 'hash-salt' in target:
                    return "Lệnh đọc/in tệp chìa meta-page-token hoặc hash-salt bị chặn để bảo vệ bí mật vận hành."

            # B. Bỏ qua lệnh echo / printf thuần (không redirection) để cho phép in văn bản hướng dẫn
            if exe in ('echo', 'printf'):
                continue

            # C. Kiểm tra fetch_page_messages hợp lệ
            is_fetcher = False
            if sc.executable in ('python', 'python3') and len(words) > 1:
                arg1 = os.path.basename(words[1].strip("'\""))
                if arg1 == 'fetch_page_messages.py':
                    is_fetcher = True
            elif os.path.basename(sc.executable) == 'fetch_page_messages.py' or sc.raw_executable.endswith('fetch_page_messages.py'):
                is_fetcher = True

            # D. Kiểm tra tệp chìa meta-page-token hoặc hash-salt
            if not is_fetcher:
                for w in words[1:]:
                    clean_w = w.strip("'\"")
                    if 'meta-page-token' in clean_w or 'hash-salt' in clean_w:
                        return "Lệnh đọc/in tệp chìa meta-page-token hoặc hash-salt bị chặn để bảo vệ bí mật vận hành."

            # E. Kiểm tra đường dẫn .env và .config/aiboss-office trên các tham số
            for w in words[1:]:
                # Tham số dạng cờ có giá trị gán: --file=.env, -Dpath=.env
                if w.startswith('-') and '=' in w:
                    _, val = w.split('=', 1)
                    if has_config_path(val):
                        return "Lệnh truy cập thư mục cấu hình bí mật .config/aiboss-office bị chặn để bảo vệ bí mật vận hành."
                    if extract_env_paths(val):
                        return "Lệnh đọc tệp .env bị chặn. Hãy cấu hình biến môi trường qua môi trường hệ thống an toàn."
                    continue
                elif w.startswith('-'):
                    continue

                if has_config_path(w):
                    return "Lệnh truy cập thư mục cấu hình bí mật .config/aiboss-office bị chặn để bảo vệ bí mật vận hành."
                if extract_env_paths(w):
                    return "Lệnh đọc tệp .env bị chặn. Hãy cấu hình biến môi trường qua môi trường hệ thống an toàn."

            # F. Kiểm tra executable chính nó (ví dụ: .env làm script thực thi)
            if extract_env_paths(sc.raw_executable):
                return "Lệnh đọc tệp .env bị chặn. Hãy cấu hình biến môi trường qua môi trường hệ thống an toàn."
            if has_config_path(sc.raw_executable):
                return "Lệnh truy cập thư mục cấu hình bí mật .config/aiboss-office bị chặn để bảo vệ bí mật vận hành."

    return ""

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

        violation = check_secret_leak(tool_name, tool_input, cwd)
        if violation:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] {violation}\n")
            sys.exit(2)

        sys.exit(0)
    except SystemExit:
        raise
    except bash_parser.BashParseError as e:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi cú pháp hoặc nháy chưa khép: {e}, chặn cho chắc.\n")
        sys.exit(2)
    except Exception as e:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi nội bộ hook: {e}, chặn cho chắc\n")
        sys.exit(2)

if __name__ == "__main__":
    main()
