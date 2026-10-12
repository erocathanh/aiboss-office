#!/usr/bin/env python3
"""Hook 7: lock_raw_inputs.py
Khoá cứng thư mục dữ liệu thô CAC-DU-AN/*/DAU-VAO/.
Cấm mọi công cụ sửa tệp hoặc lệnh Bash can thiệp ghi vào DAU-VAO.
Cho phép đọc từ DAU-VAO và chạy bộ đọc fetch_page_messages.py hợp lệ.
Tuân thủ đầy đủ kết quả rà soát an toàn chuyên sâu (review 30/09/2026).
"""

import sys
import json
import os
import re

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import bash_parser
import layout
import office_root

HOOK_NAME = "lock_raw_inputs"

def check_lock(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if file_path:
            rel = bash_parser.canonical_path(file_path, cwd, project_dir)
            if bash_parser.is_in_project_dau_vao(rel):
                return f"Thư mục DAU-VAO ({file_path}) là dữ liệu thô gốc, cấm máy can thiệp ghi/sửa. Người chủ tự chép dữ liệu vào bằng Finder."

    # 2. Lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, symlinks = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            targets = bash_parser.extract_write_targets(sc, symlinks)
            for target_path, reason in targets:
                rel = bash_parser.canonical_path(target_path, sc.cwd, project_dir, symlinks)
                if bash_parser.is_in_project_dau_vao(rel):
                    return f"Lệnh có đích ghi nhắm vào thư mục DAU-VAO ({target_path}) bị chặn. Dữ liệu thô chỉ được đọc, không được ghi đè hay sửa đổi bằng lệnh shell."

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
        project_dir = office_root.find_office_root(cwd)

        violation = check_lock(tool_name, tool_input, cwd, project_dir)
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
