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

def get_sample_labels(rel_path: str):
    parts = [p for p in rel_path.replace('\\', '/').split('/') if p and p != '.']
    if len(parts) >= 2:
        return f"{parts[0]}/{parts[1]}", parts[1]
    return f"{layout.OPC_PROJECTS_DIR}/{layout.OPC_SAMPLE_GROUND_TRUTH_DIR}", layout.OPC_SAMPLE_GROUND_TRUTH_DIR


def get_outputs_labels(rel_path: str):
    parts = [p for p in rel_path.replace('\\', '/').split('/') if p and p != '.']
    is_en = len(parts) >= 1 and parts[0].lower() == layout.PROJECTS_DIR.lower()
    if len(parts) >= 3 and layout.is_outputs_dir(parts[2]):
        out_label = parts[2]
    else:
        out_label = layout.OUTPUTS_DIR if is_en else layout.OPC_OUTPUTS_DIR
    wip_label = f"{layout.WIP_DIR}/" if is_en else f"{layout.OPC_WIP_DIR}/"
    return out_label, wip_label


def get_journal_label(file_path: str, rel_path: str) -> str:
    base = os.path.basename(file_path)
    if layout.is_channel_file(base):
        return base
    rel_base = os.path.basename(rel_path)
    if layout.is_channel_file(rel_base):
        return rel_base
    return layout.OPC_CHANNEL_FILE


def project_has_outputs_or_final(proj_abs: str) -> bool:
    """Kiểm tra thư mục dự án có chứa ngăn kết quả (DAU-RA/outputs ở mọi tầng) hoặc tệp _final không (H5)."""
    if not os.path.isdir(proj_abs):
        return False
    try:
        for _root_dir, dirs, files in os.walk(proj_abs):
            for d in dirs:
                if layout.is_outputs_dir(d):
                    return True
            for f in files:
                if layout.has_final_suffix(f):
                    return True
    except Exception:
        return True
    return False


def check_protection(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Kiểm tra công cụ sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        if not file_path:
            return ""

        cands_with_roots = office_root.candidate_rel_paths_with_roots(file_path, cwd, project_dir)

        # Rào 1: Bảo vệ toàn bộ dự án mẫu DU-AN-MAU-SU-THAT / _sample-ground-truth (read-only)
        for cand, _r_dir in cands_with_roots:
            if bash_parser.is_in_du_an_mau(cand):
                sample_full, _ = get_sample_labels(cand)
                return f"Thư mục {sample_full} là dữ liệu mẫu quy chuẩn, không được ghi sửa hay xoá."

        # Rào 2: Bảo vệ DAU-RA / outputs và tệp _final (H4b: chặn cả symlink đứt đích bằng lexists)
        for cand, _r_dir in cands_with_roots:
            if bash_parser.is_dau_ra_or_final(cand):
                out_label, wip_label = get_outputs_labels(cand)
                if tool_name in ("Edit", "MultiEdit", "NotebookEdit"):
                    return f"Tệp đã chốt ({os.path.basename(file_path)}) trong {out_label} không được phép sửa. Hãy tạo bản nháp mới trong {wip_label}."
                if tool_name == "Write":
                    abs_path = os.path.normpath(os.path.join(cwd, os.path.expanduser(file_path)))
                    real_path = os.path.realpath(abs_path)
                    if os.path.exists(real_path) or os.path.lexists(abs_path):
                        return f"Tệp ({os.path.basename(file_path)}) đã tồn tại trong {out_label} hoặc là bản chốt, không được ghi đè. Hãy thêm hậu tố _2 hoặc tạo bản nháp mới."

        # Rào 3: Bảo vệ tệp nhật ký (chỉ cho phép nối thêm vào đúng cuối tệp / append-only — H3)
        abs_path = os.path.normpath(os.path.join(cwd, os.path.expanduser(file_path)))
        real_path = os.path.realpath(abs_path)
        is_journal = (
            layout.is_channel_file(os.path.basename(file_path))
            or layout.is_channel_file(os.path.basename(real_path))
            or any(layout.is_channel_file(os.path.basename(c)) for c, _ in cands_with_roots)
            or "journal-link" in file_path
        )

        if is_journal:
            first_rel = cands_with_roots[0][0] if cands_with_roots else file_path
            journal_label = get_journal_label(file_path, first_rel)
            if tool_name == "NotebookEdit":
                return f"Công cụ NotebookEdit không được phép sửa tệp nhật ký ({journal_label})."
            target_read_path = real_path if os.path.exists(real_path) else abs_path
            if not os.path.exists(target_read_path) and "journal-link" in file_path:
                cand_en = os.path.normpath(os.path.join(project_dir, layout.PROJECTS_DIR, "THU-SU-THAT", layout.CHANNEL_FILE))
                if os.path.exists(cand_en):
                    target_read_path = cand_en
                else:
                    cand_opc = os.path.normpath(os.path.join(project_dir, layout.OPC_PROJECTS_DIR, "THU-SU-THAT", layout.OPC_CHANNEL_FILE))
                    if os.path.exists(cand_opc):
                        target_read_path = cand_opc

            if tool_name == "Write":
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            old_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp {journal_label} ({e}), chặn để bảo đảm an toàn."

                    new_content = tool_input.get("content", "")
                    if not new_content.startswith(old_content):
                        return f"Ghi tệp {journal_label} phải bảo toàn nội dung cũ và chỉ nối thêm vào cuối (append-only)."
            elif tool_name == "Edit":
                old_string = tool_input.get("old_string", "")
                new_string = tool_input.get("new_string", "")
                if not old_string or not new_string.startswith(old_string):
                    return f"Sửa tệp {journal_label} phải bảo toàn đoạn cũ và chỉ thêm vào sau (append-only)."
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            old_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp {journal_label} ({e}), chặn để bảo đảm an toàn."
                    if not old_content.endswith(old_string):
                        return f"Sửa tệp {journal_label} chỉ được phép nối vào cuối tệp hiện có, không được chèn vào giữa (append-only)."
            elif tool_name == "MultiEdit":
                edits = tool_input.get("edits", [])
                cur_content = None
                if os.path.exists(target_read_path):
                    try:
                        with open(target_read_path, "r", encoding="utf-8", errors="replace") as f:
                            cur_content = f.read()
                    except Exception as e:
                        return f"Không thể đọc tệp {journal_label} ({e}), chặn để bảo đảm an toàn."
                for ed in edits:
                    old_string = ed.get("old_string", "")
                    new_string = ed.get("new_string", "")
                    if not old_string or not new_string.startswith(old_string):
                        return f"Sửa tệp {journal_label} phải bảo toàn đoạn cũ và chỉ thêm vào sau (append-only)."
                    if cur_content is not None:
                        if not cur_content.endswith(old_string):
                            return f"Sửa tệp {journal_label} chỉ được phép nối vào cuối tệp hiện có, không được chèn vào giữa (append-only)."
                        cur_content = cur_content[:-len(old_string)] + new_string

    # 2. Kiểm tra lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, symlinks = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            exe = sc.executable
            words = sc.words
            sc_symlinks = getattr(sc, "symlinks", symlinks)

            # A. Kiểm tra xoá hoặc can thiệp vào DU-AN-MAU-SU-THAT / _sample-ground-truth / DAU-RA / nhật ký
            if exe in ('rm', 'unlink', 'rmdir'):
                for w in words[1:]:
                    if w.startswith('-'):
                        continue
                    cands_w = office_root.candidate_rel_paths_with_roots(w, sc.cwd, project_dir, sc_symlinks)
                    for cand, r_dir in cands_w:
                        if bash_parser.is_in_du_an_mau(cand):
                            _, sample_short = get_sample_labels(cand)
                            return f"Hành vi xoá hoặc di chuyển thư mục mẫu {sample_short} bị chặn."
                        if bash_parser.is_dau_ra_or_final(cand):
                            return f"Hành vi xoá tệp hoặc thư mục đầu ra đã chốt ({w}) bị chặn."
                        if layout.is_channel_file(os.path.basename(cand)):
                            return f"Hành vi xoá tệp nhật ký ({w}) bị chặn."
                        parts = [p for p in cand.replace('\\', '/').split('/') if p and p != '.']
                        if len(parts) == 1 and layout.is_projects_root(parts[0]):
                            return f"Hành vi xoá toàn bộ thư mục gốc dự án ({parts[0]}) bị chặn để bảo vệ các đầu ra đã chốt."
                        if len(parts) == 2 and layout.is_projects_root(parts[0]):
                            real_r_dir = os.path.realpath(os.path.expanduser(r_dir))
                            proj_abs = os.path.join(real_r_dir, parts[0], parts[1])
                            if project_has_outputs_or_final(proj_abs):
                                return f"Hành vi xoá thư mục dự án ({parts[0]}/{parts[1]}) đang có ngăn kết quả hoặc bản chốt bị chặn."
            elif exe == 'find':
                has_delete = '-delete' in words or any(w in ('-exec', '-execdir') for w in words)
                if has_delete:
                    for w in words[1:]:
                        if w.startswith('-'):
                            break
                        cands_w = office_root.candidate_rel_paths_with_roots(w, sc.cwd, project_dir, sc_symlinks)
                        for cand, _r_dir in cands_w:
                            if bash_parser.is_in_du_an_mau(cand):
                                _, sample_short = get_sample_labels(cand)
                                return f"Hành vi xoá hoặc di chuyển thư mục mẫu {sample_short} bị chặn."
                            if bash_parser.is_dau_ra_or_final(cand):
                                return f"Hành vi xoá trong thư mục đầu ra đã chốt ({w}) bị chặn."

            # B. Kiểm tra tất cả write targets
            targets = bash_parser.extract_write_targets(sc, sc_symlinks)
            is_move_or_rm_cmd = (
                exe in ('mv', 'rm', 'rmdir')
                or (exe == 'git' and ('mv' in words or 'rm' in words))
            )

            for target_path, reason in targets:
                if bash_parser.is_dynamic_write_target(target_path) and bash_parser.is_cwd_inside_office(sc.cwd, project_dir):
                    return f"Lệnh ghi ({reason}) có đích là biến hoặc biểu thức động ({target_path}) nên đích không đọc được tĩnh; chặn fail-closed trong kho văn phòng."

                cands_with_roots = office_root.candidate_rel_paths_with_roots(target_path, sc.cwd, project_dir, sc_symlinks)

                for cand, r_dir in cands_with_roots:
                    # Rào 0 (H5): Dời hoặc xoá cả thư mục gốc dự án hoặc thư mục dự án có ngăn kết quả / bản chốt
                    if is_move_or_rm_cmd or reason.startswith(('mv ', 'git mv ', 'rm ', 'git rm ', 'rmdir ')):
                        parts = [p for p in cand.replace('\\', '/').split('/') if p and p != '.']
                        if len(parts) == 1 and layout.is_projects_root(parts[0]):
                            return f"Hành vi dời hoặc xoá toàn bộ thư mục gốc dự án ({parts[0]}) bị chặn để bảo vệ các đầu ra đã chốt."
                        if len(parts) == 2 and layout.is_projects_root(parts[0]):
                            real_r_dir = os.path.realpath(os.path.expanduser(r_dir))
                            proj_abs = os.path.join(real_r_dir, parts[0], parts[1])
                            if project_has_outputs_or_final(proj_abs):
                                return f"Hành vi dời hoặc xoá thư mục dự án ({parts[0]}/{parts[1]}) đang có ngăn kết quả hoặc bản chốt bị chặn."

                    # Rào 1: Ghi hoặc tạo liên kết vào DU-AN-MAU-SU-THAT / _sample-ground-truth
                    if bash_parser.is_in_du_an_mau(cand):
                        sample_full, _ = get_sample_labels(cand)
                        return f"Lệnh ghi/sửa vào {sample_full} bị chặn. Thư mục mẫu chỉ được đọc."

                    # Rào 2 (H4a, H4b): Ghi đè, xoá hoặc tạo liên kết vào DAU-RA / outputs hoặc _final
                    if bash_parser.is_dau_ra_or_final(cand):
                        out_label, _ = get_outputs_labels(cand)
                        abs_t = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(target_path)))
                        rel_canon_r = bash_parser.canonical_path(target_path, sc.cwd, r_dir, sc_symlinks)
                        if sc_symlinks and cand == rel_canon_r:
                            for l_k, t_v in sc_symlinks.items():
                                abs_lk = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(l_k)))
                                abs_tv = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(t_v)))
                                if abs_t == abs_lk:
                                    abs_t = abs_tv
                                    break
                                elif abs_t.startswith(abs_lk + '/'):
                                    abs_t = abs_tv + abs_t[len(abs_lk):]
                                    break

                        real_t = os.path.realpath(abs_t)
                        is_delete_or_link_op = (
                            exe in ('unlink', 'rmdir', 'rm', 'ln')
                            or reason.startswith(('rm ', 'git rm', 'git mv', 'git checkout', 'git restore', 'unlink', 'rmdir', 'ln '))
                            or reason == 'cp hardlink source'
                            or any(
                                k in reason
                                for k in (
                                    'delete',
                                    'unlink',
                                    'rmdir',
                                    'shutil.',
                                    'os.unlink',
                                    'os.remove',
                                    'os.rmdir',
                                    'Path.unlink',
                                    'Path.rmdir',
                                    'rename source',
                                    'move/rename source',
                                    'Path.rename source',
                                    'Path.replace source',
                                    'ln hardlink',
                                    'cp hardlink',
                                )
                            )
                        )
                        if is_delete_or_link_op or os.path.exists(real_t) or os.path.lexists(abs_t):
                            return f"Lệnh ghi đè hoặc tạo liên kết lên tệp ({os.path.basename(target_path)}) trong {out_label} bị chặn. Đầu ra đã chốt là bất biến."

                    # Rào 3: Bảo vệ tệp nhật ký (nhat-ky.md / CHANNEL.md) qua Bash — chỉ cho phép nối thêm (>>, exec N>>, tee -a, sponge -a)
                    abs_j = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(target_path)))
                    rel_canon_r = bash_parser.canonical_path(target_path, sc.cwd, r_dir, sc_symlinks)
                    if sc_symlinks and cand == rel_canon_r:
                        for l_k, t_v in sc_symlinks.items():
                            abs_lk = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(l_k)))
                            abs_tv = os.path.normpath(os.path.join(sc.cwd, os.path.expanduser(t_v)))
                            if abs_j == abs_lk:
                                abs_j = abs_tv
                                break
                            elif abs_j.startswith(abs_lk + '/'):
                                abs_j = abs_tv + abs_j[len(abs_lk):]
                                break
                    real_j = os.path.realpath(abs_j)
                    is_journal_target = (
                        layout.is_channel_file(os.path.basename(target_path))
                        or layout.is_channel_file(os.path.basename(cand))
                        or layout.is_channel_file(os.path.basename(real_j))
                        or "journal-link" in target_path
                    )
                    if is_journal_target:
                        is_append_only = (
                            bool(re.match(r'^redirection \d*>>$', reason))
                            or reason in ("tee append target", "sponge append target")
                        )
                        if not is_append_only:
                            journal_label = get_journal_label(target_path, cand)
                            return f"Tệp nhật ký ({journal_label}) chỉ được phép nối thêm vào cuối (>>, exec N>>, tee -a hoặc sponge -a), không được xoá, dời hay ghi đè qua Bash."

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


