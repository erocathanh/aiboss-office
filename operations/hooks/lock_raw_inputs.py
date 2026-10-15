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

def get_inputs_label(rel_path: str) -> str:
    parts = [p for p in rel_path.replace('\\', '/').split('/') if p and p != '.']
    if len(parts) >= 3 and parts[2].lower() == layout.INPUTS_DIR.lower():
        return layout.INPUTS_DIR
    return layout.OPC_INPUTS_DIR


def check_lock(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if file_path:
            for cand, _root in office_root.candidate_rel_paths_with_roots(file_path, cwd, project_dir):
                if bash_parser.is_in_project_dau_vao(cand):
                    label = get_inputs_label(cand)
                    return f"Thư mục {label} ({file_path}) là dữ liệu thô gốc, không được phép can thiệp ghi/sửa. Người chủ tự chép dữ liệu vào bằng Finder."
                if bash_parser.is_in_operations_data(cand):
                    return f"Thư mục sổ vận hành operations/data ({file_path}) chỉ do hệ thống và hook ghi, không cho phép ghế tự ý ghi/sửa."

    # 2. Lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, symlinks = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            targets = bash_parser.extract_write_targets(sc, symlinks)
            for target_path, reason in targets:
                if bash_parser.is_dynamic_write_target(target_path) and (
                    bash_parser.is_cwd_inside_office(sc.cwd, project_dir)
                    or office_root.find_nearest_office_root(sc.cwd, sc.cwd) is not None
                ):
                    return f"Lệnh ghi ({reason}) có đích là biến hoặc biểu thức động ({target_path}) nên đích không đọc được tĩnh; chặn fail-closed trong kho văn phòng."
                for cand, _root in office_root.candidate_rel_paths_with_roots(target_path, sc.cwd, project_dir, symlinks):
                    if bash_parser.is_in_project_dau_vao(cand):
                        label = get_inputs_label(cand)
                        return f"Lệnh có đích ghi hoặc xoá nhắm vào thư mục {label} ({target_path}) bị chặn. Dữ liệu thô chỉ được đọc, không được xoá, ghi đè hay sửa đổi bằng lệnh shell."
                    if bash_parser.is_in_operations_data(cand):
                        return f"Lệnh có đích ghi hoặc xoá nhắm vào thư mục sổ vận hành operations/data ({target_path}) bị chặn. Ghế không được tự ghi, sửa hoặc xoá sổ duyệt."

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
        project_dir = office_root.resolve_project_root(cwd)

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

