#!/usr/bin/env python3
"""Hook 8: remind_cross_check.py
Nhắc nhở kiểm tra chéo và đối soát chi tiết lược bỏ sau khi ghi/sửa tệp sự thật vận hành.

Cập nhật theo BỔ SUNG-01:
- Tiêu đề nhận bằng re.search(r'(?m)^##\s+Ba chi tiết đã lược bỏ\s*$', ...).
- Nội dung mục kéo dài tới dòng '^##\s' kế tiếp.
- So tên tệp không phân biệt hoa thường (.lower()).
- Chuẩn hoá Unicode NFC trước khi so sánh tiêu đề và đếm từ 'vì'.
"""

import sys
import json
import os
import re
import unicodedata

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import layout

HOOK_NAME = "remind_cross_check"


def analyze_content(content: str) -> bool:
    """Kiểm tra xem nội dung có mục '## Ba chi tiết đã lược bỏ' và ít nhất 3 dòng có chữ 'vì' không."""
    if not content:
        return False

    # Chuẩn hoá Unicode NFC trước khi so sánh
    norm_content = unicodedata.normalize('NFC', content)

    # Tiêu đề nhận diện bằng regex đa dòng ở đầu dòng
    header_match = re.search(r'(?m)^##\s+Ba chi tiết đã lược bỏ\s*$', norm_content)
    if not header_match:
        return False

    # Mục kéo dài tới dòng '^##\s' kế tiếp (tiêu đề cấp 2 tiếp theo)
    sub_section = norm_content[header_match.end():]
    next_header = re.search(r'(?m)^##\s', sub_section)
    if next_header:
        sub_section = sub_section[:next_header.start()]

    lines = sub_section.strip().splitlines()
    vi_lines = [l for l in lines if re.search(r'\bvì\b', l, re.IGNORECASE)]

    return len(vi_lines) >= 3


def check_remind(tool_name: str, tool_input: dict, cwd: str) -> str:
    file_path = tool_input.get("file_path") or ""
    if not file_path:
        return ""

    full_path = os.path.normpath(os.path.join(cwd, file_path))
    filename = os.path.basename(full_path)
    filename_lower = filename.lower()
    norm_path = full_path.replace('\\', '/')

    # Đọc nội dung tệp: ưu tiên từ tool_input, nếu rỗng mới đọc tệp trên đĩa
    content = tool_input.get("content", "")
    if not content and os.path.exists(full_path):
        try:
            with open(full_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
        except Exception:
            pass

    # Trường hợp 1: Tệp trong DANG-LAM/wip bắt đầu bằng su-that-van-hanh (so bằng .lower())
    is_wip = f"/{layout.WIP_DIR}/" in norm_path or f"/{layout.OPC_WIP_DIR}/" in norm_path
    if is_wip and filename_lower.startswith("su-that-van-hanh"):
        if not analyze_content(content):
            return "Nhắc nhở: Tệp nháp sự thật vận hành đang thiếu mục '## Ba chi tiết đã lược bỏ' hoặc mục này chưa đủ 3 chi tiết có kèm lý do ('vì'). Hãy bổ sung đầy đủ trước khi xin chốt."

    # Trường hợp 2: Tệp xuất vào DAU-RA/outputs
    is_outputs = f"/{layout.OUTPUTS_DIR}/" in norm_path or f"/{layout.OPC_OUTPUTS_DIR}/" in norm_path
    if is_outputs:
        norm_content = unicodedata.normalize('NFC', content) if content else ""
        if not re.search(r'(?m)^##\s+Ba chi tiết đã lược bỏ\s*$', norm_content):
            return "Bản chốt thiếu mục ## Ba chi tiết đã lược bỏ. KHÔNG sửa DAU-RA; tạo nháp vN+1 trong DANG-LAM/ có mục này rồi hỏi chủ chốt lại."

    return ""


def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input or not raw_input.strip():
            sys.exit(0)

        data = json.loads(raw_input)
        tool_name = data.get("tool_name", "")
        tool_input = data.get("tool_input", {})
        cwd = data.get("cwd", os.getcwd())

        remind_msg = check_remind(tool_name, tool_input, cwd)
        if remind_msg:
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": remind_msg
                }
            }
            print(json.dumps(output, ensure_ascii=False))

        sys.exit(0)
    except Exception:
        # Hook 8 PostToolUse không chặn luồng làm việc nếu có sự cố nhỏ
        sys.exit(0)


if __name__ == "__main__":
    main()
