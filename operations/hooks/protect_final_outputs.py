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

def get_sample_dir_label(rel_path: str) -> str:
    parts = [p for p in rel_path.replace('\\', '/').split('/') if p and p != '.']
    if len(parts) >= 2 and parts[1].lower() == layout.SAMPLE_GROUND_TRUTH_DIR.lower():
        return f"{layout.PROJECTS_DIR}/{layout.SAMPLE_GROUND_TRUTH_DIR}"
    return f"{layout.OPC_PROJECTS_DIR}/{layout.OPC_SAMPLE_GROUND_TRUTH_DIR}"


def project_has_outputs_or_final(rel_path: str, project_dir: str) -> bool:
    """Kiểm tra xem đường dẫn có phải là thư mục dự án (CAC-DU-AN/X hoặc projects/X) hoặc gốc dự án chứa DAU-RA/outputs/_final không."""
    parts = [p for p in rel_path.replace('\\', '/').split('/') if p and p != '.']
    if not parts or not layout.is_projects_root(parts[0]):
        return False
    if len(parts) == 1:
        return True
    if len(parts) == 2:
        proj_abs = os.path.join(project_dir, parts[0], parts[1])
        for out_name in (layout.OUTPUTS_DIR, layout.OPC_OUTPUTS_DIR):
            out_dir = os.path.join(proj_abs, out_name)
            if os.path.isdir(out_dir):
                return True
        if os.path.isdir(proj_abs):
            for root_d, _, files in os.walk(proj_abs):
                for fn in files:
                    if layout.FINAL_SUFFIX.lower() in fn.lower():
                        return True
    return False


def check_protection(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Kiểm tra công cụ sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if not file_path:
            return ""

        rel = bash_parser.canonical_path(file_path, cwd, project_dir)
        rel_logic = bash_parser.logical_rel_path(file_path, cwd, project_dir)

        # Rào 1: Bảo vệ toàn bộ dự án mẫu DU-AN-MAU-SU-THAT / _sample-ground-truth (read-only)
        for cand in (rel, rel_logic):
            if bash_parser.is_in_du_an_mau(cand):
                label = get_sample_dir_label(cand)
                return f"Thư mục {label} là dữ liệu mẫu quy chuẩn, cấm ghi sửa hay xoá."

        # Rào 2: Bảo vệ DAU-RA và tệp _final
        if bash_parser.is_dau_ra_or_final(rel) or bash_parser.is_dau_ra_or_final(rel_logic):
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
            layout.is_channel_file(os.path.basename(rel_logic)) or
            layout.is_channel_file(os.path.basename(real_path)) or
            "journal-link" in file_path
        )

        if is_journal:
            if tool_name == "NotebookEdit":
                return "Công cụ NotebookEdit không được phép sửa tệp nhật ký (nhat-ky.md / CHANNEL.md)."
            target_read_path = real_path if os.path.exists(real_path) else abs_path
            if not os.path.exists(target_read_path) and "journal-link" in file_path:
                cand = os.path.normpath(os.path.join(project_dir, "CAC-DU-AN", "THU-SU-THAT", "nhat-ky.md"))
                if os.path.exists(cand):
                    target_read_path = cand
                else:
                    cand_en = os.path.normpath(os.path.join(project_dir, layout.PROJECTS_DIR, "THU-SU-THAT", layout.CHANNEL_FILE))
                    if os.path.exists(cand_en):
                        target_read_path = cand_en

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
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            old_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp nhat-ky.md ({e}), chặn để bảo đảm an toàn."
                    if old_content and not old_content.endswith(old_string) and not old_content.rstrip("\r\n").endswith(old_string.rstrip("\r\n")):
                        return "Sửa tệp nhật ký chỉ được nối thêm vào đúng cuối tệp (append-only), cấm chèn vào giữa tệp."
            elif tool_name == "MultiEdit":
                edits = tool_input.get("edits", [])
                old_content = ""
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            old_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp nhat-ky.md ({e}), chặn để bảo đảm an toàn."
                for ed in edits:
                    old_string = ed.get("old_string", "")
                    new_string = ed.get("new_string", "")
                    if not new_string.startswith(old_string):
                        return "Sửa tệp nhat-ky.md phải bảo toàn đoạn cũ và chỉ thêm vào sau (append-only)."
                    if old_content and not old_content.endswith(old_string) and not old_content.rstrip("\r\n").endswith(old_string.rstrip("\r\n")):
                        return "Sửa tệp nhật ký chỉ được nối thêm vào đúng cuối tệp (append-only), cấm chèn vào giữa tệp."

    # 2. Kiểm tra lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, symlinks = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            exe = sc.executable
            words = sc.words

            # A. Kiểm tra xoá hoặc can thiệp vào DU-AN-MAU-SU-THAT / DAU-RA / _final / nhật ký
            if exe == 'rm':
                for w in words[1:]:
                    if w.startswith('-'):
                        continue
                    rel_c = bash_parser.canonical_path(w, sc.cwd, project_dir, symlinks)
                    rel_l = bash_parser.logical_rel_path(w, sc.cwd, project_dir)
                    for rel in (rel_c, rel_l):
                        if bash_parser.is_in_du_an_mau(rel):
                            return "Hành vi xoá hoặc di chuyển thư mục mẫu DU-AN-MAU-SU-THAT bị chặn."
                        if bash_parser.is_dau_ra_or_final(rel):
                            return f"Hành vi xoá tệp hoặc thư mục đầu ra đã chốt ({w}) bị chặn."
                        if layout.is_channel_file(os.path.basename(rel)):
                            return f"Hành vi xoá tệp nhật ký ({w}) bị chặn."
            elif exe == 'find':
                has_delete = '-delete' in words or any(w in ('-exec', '-execdir') for w in words)
                if has_delete:
                    for w in words[1:]:
                        if w.startswith('-'):
                            break
                        rel_c = bash_parser.canonical_path(w, sc.cwd, project_dir, symlinks)
                        rel_l = bash_parser.logical_rel_path(w, sc.cwd, project_dir)
                        for rel in (rel_c, rel_l):
                            if bash_parser.is_in_du_an_mau(rel):
                                return "Hành vi xoá hoặc di chuyển thư mục mẫu DU-AN-MAU-SU-THAT bị chặn."
                            if bash_parser.is_dau_ra_or_final(rel):
                                return f"Hành vi xoá trong thư mục đầu ra đã chốt ({w}) bị chặn."

            # B. Kiểm tra tất cả write targets
            targets = bash_parser.extract_write_targets(sc, symlinks)
            for target_path, reason in targets:
                if bash_parser.is_dynamic_write_target(target_path) and bash_parser.is_cwd_inside_office(sc.cwd, project_dir):
                    return f"Lệnh ghi ({reason}) có đích là biến hoặc biểu thức động ({target_path}) nên đích không đọc được tĩnh; chặn fail-closed trong kho văn phòng."
                rel_canon = bash_parser.canonical_path(target_path, sc.cwd, project_dir, symlinks)
                rel_logic = bash_parser.logical_rel_path(target_path, sc.cwd, project_dir)

                # Rào 1: Ghi vào DU-AN-MAU-SU-THAT / _sample-ground-truth
                for cand in (rel_canon, rel_logic):
                    if bash_parser.is_in_du_an_mau(cand):
                        label = get_sample_dir_label(cand)
                        return f"Lệnh ghi/sửa vào {label} bị chặn. Thư mục mẫu chỉ được đọc."

                # Rào 1b: Di chuyển/đổi tên cả thư mục dự án có chứa DAU-RA / outputs / _final
                if "mv" in reason:
                    for cand in (rel_canon, rel_logic):
                        if project_has_outputs_or_final(cand, project_dir):
                            return f"Lệnh di chuyển/đổi tên thư mục dự án có chứa đầu ra đã chốt ({target_path}) bị chặn."

                # Rào 2: Ghi đè / xoá / đổi tên trong DAU-RA hoặc _final
                for rel in (rel_canon, rel_logic):
                    if bash_parser.is_dau_ra_or_final(rel):
                        abs_t = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(target_path)))
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
                        is_destructive_op = any(
                            k in reason for k in ("delete", "unlink", "rmdir", "rmtree", "rename source", "move/rename source", "Path.rename source", "Path.replace source", "ln hardlink")
                        )
                        if os.path.exists(real_t) or os.path.islink(abs_t) or is_destructive_op:
                            return f"Lệnh can thiệp lên tệp/thư mục đã chốt ({os.path.basename(target_path)}) trong DAU-RA bị chặn. Đầu ra đã chốt là bất biến."

                # Rào 3: Can thiệp sửa/ghi đè/xoá tệp nhật ký qua Bash (chỉ cho phép >> hoặc tee -a)
                is_bash_journal = (
                    layout.is_channel_file(os.path.basename(target_path)) or
                    layout.is_channel_file(os.path.basename(rel_canon)) or
                    layout.is_channel_file(os.path.basename(rel_logic))
                )
                if is_bash_journal:
                    if reason in ("redirection >>", "redirection 1>>", "redirection 2>>"):
                        continue
                    if reason == "tee target" and any(w == '-a' or w == '--append' or (w.startswith('-') and not w.startswith('--') and 'a' in w) for w in words[1:]):
                        continue
                    return f"Lệnh ({reason}) can thiệp không phải nối thêm vào tệp nhật ký ({target_path}) bị chặn. Nhật ký chỉ cho phép nối thêm (>> hoặc tee -a)."


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
        project_dir = office_root.find_root(cwd)

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

