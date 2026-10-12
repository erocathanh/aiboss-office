#!/usr/bin/env python3
"""Hook 4: protect_final_outputs.py
Bảo vệ các đầu ra đã chốt trong DAU-RA/, tệp _final, dự án mẫu DU-AN-MAU-SU-THAT và tệp nhật ký.
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

HOOK_NAME = "protect_final_outputs"

def check_protection(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Kiểm tra công cụ sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if not file_path:
            return ""

        rel = bash_parser.canonical_path(file_path, cwd, project_dir)

        # Rào 1: Bảo vệ toàn bộ dự án mẫu DU-AN-MAU-SU-THAT (read-only)
        if bash_parser.is_in_du_an_mau(rel):
            return "Thư mục CAC-DU-AN/DU-AN-MAU-SU-THAT là dữ liệu mẫu quy chuẩn, cấm ghi sửa hay xoá."

        # Rào 2: Bảo vệ DAU-RA và tệp _final
        if bash_parser.is_dau_ra_or_final(rel):
            if tool_name in ("Edit", "MultiEdit", "NotebookEdit"):
                return f"Tệp đã chốt ({os.path.basename(file_path)}) trong DAU-RA không được phép sửa. Hãy tạo bản nháp mới trong DANG-LAM/."
            if tool_name == "Write":
                # Giải symlink tĩnh để kiểm tra tệp đích thực sự
                abs_path = os.path.normpath(os.path.join(cwd, os.path.expanduser(file_path)))
                real_path = os.path.realpath(abs_path)
                if os.path.exists(real_path):
                    return f"Tệp ({os.path.basename(file_path)}) đã tồn tại trong DAU-RA hoặc là bản chốt, cấm ghi đè. Hãy thêm hậu tố _2 hoặc tạo bản nháp mới."

        # Rào 3: Bảo vệ tệp nhật ký (chỉ cho phép nối thêm / append-only)
        abs_path = os.path.normpath(os.path.join(cwd, os.path.expanduser(file_path)))
        real_path = os.path.realpath(abs_path)
        is_journal = (
            layout.is_channel_file(os.path.basename(file_path)) or
            layout.is_channel_file(os.path.basename(rel)) or
            layout.is_channel_file(os.path.basename(real_path)) or
            "journal-link" in file_path
        )

        if is_journal:
            target_read_path = real_path if os.path.exists(real_path) else abs_path
            if not os.path.exists(target_read_path) and "journal-link" in file_path:
                cand = os.path.normpath(os.path.join(project_dir, layout.PROJECTS_DIR, "THU-SU-THAT", layout.CHANNEL_FILE))
                if os.path.exists(cand):
                    target_read_path = cand
                else:
                    cand_opc = os.path.normpath(os.path.join(project_dir, "CAC-DU-AN", "THU-SU-THAT", "nhat-ky.md"))
                    if os.path.exists(cand_opc):
                        target_read_path = cand_opc

            if tool_name == "Write":
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            old_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp nhat-ky.md ({e}), chặn để bảo đảm an toàn."

                    new_content = tool_input.get("content", "")
                    if not new_content.startswith(old_content):
                        return "Ghi tệp nhat-ky.md phải bảo toàn nội dung cũ và chỉ nối thêm vào cuối (append-only)."
            elif tool_name == "Edit":
                old_string = tool_input.get("old_string", "")
                new_string = tool_input.get("new_string", "")
                if not new_string.startswith(old_string):
                    return "Sửa tệp nhat-ky.md phải bảo toàn đoạn cũ và chỉ thêm vào sau (append-only)."
            elif tool_name == "MultiEdit":
                edits = tool_input.get("edits", [])
                for ed in edits:
                    old_string = ed.get("old_string", "")
                    new_string = ed.get("new_string", "")
                    if not new_string.startswith(old_string):
                        return "Sửa tệp nhat-ky.md phải bảo toàn đoạn cũ và chỉ thêm vào sau (append-only)."

    # 2. Kiểm tra lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, symlinks = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            exe = sc.executable
            words = sc.words

            # A. Kiểm tra xoá hoặc can thiệp vào DU-AN-MAU-SU-THAT
            if exe == 'rm':
                for w in words[1:]:
                    if w.startswith('-'):
                        continue
                    rel = bash_parser.canonical_path(w, sc.cwd, project_dir, symlinks)
                    if bash_parser.is_in_du_an_mau(rel):
                        return "Hành vi xoá hoặc di chuyển thư mục mẫu DU-AN-MAU-SU-THAT bị chặn."
            elif exe == 'find':
                has_delete = '-delete' in words or any(w in ('-exec', '-execdir') for w in words)
                if has_delete:
                    # Lấy path của find
                    for w in words[1:]:
                        if w.startswith('-'):
                            break
                        rel = bash_parser.canonical_path(w, sc.cwd, project_dir, symlinks)
                        if bash_parser.is_in_du_an_mau(rel):
                            return "Hành vi xoá hoặc di chuyển thư mục mẫu DU-AN-MAU-SU-THAT bị chặn."

            # B. Kiểm tra tất cả write targets
            targets = bash_parser.extract_write_targets(sc, symlinks)
            for target_path, reason in targets:
                rel = bash_parser.canonical_path(target_path, sc.cwd, project_dir, symlinks)

                # Rào 1: Ghi vào DU-AN-MAU-SU-THAT
                if bash_parser.is_in_du_an_mau(rel):
                    return "Lệnh ghi/sửa vào CAC-DU-AN/DU-AN-MAU-SU-THAT bị chặn. Thư mục mẫu chỉ được đọc."

                # Rào 2: Ghi đè vào DAU-RA hoặc _final
                if bash_parser.is_dau_ra_or_final(rel):
                    # Giải đường dẫn trên đĩa thực tế để kiểm tra exists
                    abs_t = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(target_path)))
                    # Kiểm tra nếu nằm trong symlinks ảo
                    if symlinks:
                        for l_k, t_v in symlinks.items():
                            abs_lk = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(l_k)))
                            abs_tv = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(t_v)))
                            if abs_t == abs_lk:
                                abs_t = abs_tv
                                break
                            elif abs_t.startswith(abs_lk + '/'):
                                abs_t = abs_tv + abs_t[len(abs_lk):]
                                break

                    real_t = os.path.realpath(abs_t)
                    if os.path.exists(real_t):
                        return f"Lệnh ghi đè lên tệp đã có ({os.path.basename(target_path)}) trong DAU-RA bị chặn. Đầu ra đã chốt là bất biến."

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

        violation = check_protection(tool_name, tool_input, cwd, project_dir)
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
