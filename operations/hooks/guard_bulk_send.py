#!/usr/bin/env python3
"""Hook 6: guard_bulk_send.py
Kiểm soát các lệnh gửi tin nhắn/email ra ngoài (Meta, Zalo, Resend, SendGrid hoặc MCP send/broadcast/reply...).
Ghi sổ duyệt che PII vào operations/data/approvals/<YYYY-MM-DD>.jsonl và chặn thực thi (exit mã 2).
Cập nhật theo BỔ SUNG-01 và PHA H1 v02:
- Gộp dòng nối bằng dấu backslash.
- Tách và kiểm tra từng lệnh con độc lập (&&, ||, ;, |, newline).
- Nhận diện cờ curl POST/data phân biệt hoa/thường, nhận cờ ngắn gộp (-sd).
- Nhận diện cổng :443, -X 'POST', --request=POST, -T/--upload-file.
- Nhận diện batch/relative_url chứa messages tới graph.facebook.com.
- Nhận diện lệnh có cả graph.facebook.com và /messages (kể cả heredoc).
- Nhận diện curl -K / --config.
- Nhận diện fetch_page_messages.py của inbox-reader.
- Miễn trừ /conversations chỉ khi lệnh con là curl, không có POST/data và không có /messages.
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

import office_root

HOOK_NAME = "guard_bulk_send"

# Các endpoint gửi tin/email ra ngoài cần duyệt
BULK_SEND_ENDPOINTS = [
    re.compile(r'graph\.facebook\.com(?::\d+)?/.*?/messages', re.IGNORECASE),
    re.compile(r'openapi\.zalo\.me', re.IGNORECASE),
    re.compile(r'api\.resend\.com(?::\d+)?/+(?:emails|broadcasts)', re.IGNORECASE),
    re.compile(r'api\.sendgrid\.com', re.IGNORECASE),
]

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

# Kiểm tra MCP gửi tin/nội dung
MCP_SEND_PATTERN = re.compile(r'mcp__.*(?:send|broadcast|reply|forward|post_message|publish)', re.IGNORECASE)


def has_curl_post_flags(cmd: str) -> bool:
    """Kiểm tra xem lệnh curl có cờ POST hay gửi kèm dữ liệu không."""
    for pattern in CURL_POST_FLAG_PATTERNS:
        if pattern.search(cmd):
            return True
    return False


def is_curl_command(sub_cmd: str) -> bool:
    """Kiểm tra lệnh con có bắt đầu bằng curl không."""
    tokens = sub_cmd.strip().split()
    if not tokens:
        return False
    first = tokens[0]
    return first == "curl" or first.endswith("/curl")


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

    return "local"


def should_block_bulk_send(tool_name: str, tool_input: dict) -> str:
    # 1. Kiểm tra công cụ MCP
    if tool_name.startswith("mcp__") or tool_name.startswith("mcp_"):
        if MCP_SEND_PATTERN.search(tool_name):
            return f"Công cụ MCP ({tool_name}) thực hiện gửi dữ liệu ra bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."

    # 2. Kiểm tra lệnh Bash
    if tool_name == "Bash":
        raw_cmd = tool_input.get("command", "")
        if not raw_cmd:
            return ""

        # Gộp các dòng nối bằng '\' ở cuối dòng trước khi xét
        cmd_joined = re.sub(r'\\\s*\n', ' ', raw_cmd)

        # 2a. Kiểm tra curl có dùng -K hoặc --config không
        if re.search(r'\bcurl\b.*?(?:-K\b|--config\b)', cmd_joined):
            return "Phát hiện lệnh curl sử dụng tệp cấu hình (-K/--config) có thể gửi yêu cầu ra ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2b. Kiểm tra fetch_page_messages.py của inbox-reader
        if "fetch_page_messages" in cmd_joined:
            return "Phát hiện lệnh truy xuất tin nhắn hộp thư (fetch_page_messages.py). Lệnh bị chặn và được ghi nhận vào sổ duyệt."

        # 2c. Kiểm tra lệnh có cả graph.facebook.com và /messages ở bất kỳ đâu (kể cả heredoc Python/Shell)
        # Ngoại lệ duy nhất: Toàn bộ lệnh là một lệnh curl đơn thuần không có cờ POST/data và không có batch/relative_url
        if "graph.facebook.com" in cmd_joined and ("/messages" in cmd_joined or "me/messages" in cmd_joined):
            tokens = cmd_joined.strip().split()
            first_tok = tokens[0] if tokens else ""
            if first_tok != "curl" and not first_tok.endswith("/curl"):
                return "Phát hiện mã/lệnh kết nối tới graph.facebook.com gửi tin nhắn (/messages). Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # 2d. Kiểm tra batch gửi tới graph.facebook.com
        if "graph.facebook.com" in cmd_joined and ("batch=" in cmd_joined or "relative_url" in cmd_joined) and "messages" in cmd_joined:
            return "Phát hiện batch request gửi tin nhắn qua graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt."

        # Tách lệnh con ở && || ; | và ở chỗ xuống dòng; xét TỪNG lệnh con
        sub_cmds = re.split(r'&&|\|\||;|\||\n', cmd_joined)

        for raw_sub in sub_cmds:
            sub = raw_sub.strip()
            if not sub:
                continue

            sub_is_curl = is_curl_command(sub)

            # Miễn trừ /conversations: CHỈ áp khi lệnh con là curl, không có cờ POST hay data, và không có /messages
            if sub_is_curl and "graph.facebook.com" in sub and "conversations" in sub:
                if not has_curl_post_flags(sub) and "/messages" not in sub and "me/messages" not in sub:
                    continue

            # Kiểm tra xem lệnh con có nhắm vào các endpoint gửi tin không
            for endpoint in BULK_SEND_ENDPOINTS:
                if endpoint.search(sub):
                    if sub_is_curl:
                        # Với curl, chỉ chặn khi có cờ POST / data / upload
                        if has_curl_post_flags(sub):
                            return "Phát hiện lệnh POST gửi tin nhắn/email ra dịch vụ bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt."
                    else:
                        # Với công cụ khác (wget, http, python, node, v.v.), có endpoint gửi là chặn
                        return f"Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài ({endpoint.pattern}). Lệnh bị chặn và cần chủ trực tiếp duyệt."

    return ""


def log_approval_request(tool_name: str, tool_input: dict, reason: str, cwd: str):
    """Ghi yêu cầu phê duyệt (đã chặn) vào operations/data/approvals/<YYYY-MM-DD>.jsonl (che PII)."""
    try:
        try:
            root = office_root.find_office_root(cwd)
        except SystemExit:
            root = os.environ.get("CLAUDE_PROJECT_DIR", cwd)

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
    except Exception:
        pass


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

        block_reason = should_block_bulk_send(tool_name, tool_input)
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
