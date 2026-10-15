#!/usr/bin/env python3
"""Hook 5: guard_customer_pii.py
Chặn rò rỉ PII (SĐT, Email khách, STK ngân hàng) vào các bản nháp, tài liệu hoặc lệnh ngoài DAU-VAO.
Sử dụng chung quy tắc regex với references/pii_patterns.py.

Cập nhật theo BỔ SUNG-01:
- Xoá hoàn toàn FallbackPII; thiếu pii_patterns.py thì in stderr và exit 2 ngay.
- Bỏ miễn trừ chuỗi con 'mask_pii.py/test_hooks' và 'DAU-VAO not in cmd'.
- Dùng chung hàm tìm đích ghi extract_bash_write_targets (§5.1) với hook 7.
- Chỉ quét Bash khi có ít nhất một đích ghi nằm ngoài CAC-DU-AN/*/DAU-VAO/. Lệnh chỉ đọc cho qua.
- Quét đệ quy MỌI chuỗi trong tool_input (kể cả file_path, notebook_path).
"""

import sys
import os
import json
import re
from typing import List

HOOK_NAME = "guard_customer_pii"

# Tìm và import module pii_patterns, layout, office_root
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    import bash_parser
    import layout
    import office_root
    import pii_patterns
except ImportError as e:
    sys.stderr.write(f"[opc-harness:{HOOK_NAME}] thiếu module phụ trợ ({e}), chặn cho chắc\n")
    sys.exit(2)


def is_dau_vao_path(path: str, cwd: str, project_dir: str, symlinks: dict = None) -> bool:
    """Kiểm tra đường dẫn có nằm thật sự dưới thư mục DAU-VAO/inputs của dự án không (cả đường dẫn giải liên kết lẫn đường dẫn logic)."""
    if not path:
        return False
    rel_canon = bash_parser.canonical_path(path, cwd, project_dir, symlinks)
    rel_logic = bash_parser.logical_rel_path(path, cwd, project_dir)
    for rel in (rel_canon, rel_logic):
        parts = [p for p in rel.split('/') if p and p != '.']
        if '..' in parts:
            return False
        if (
            len(parts) >= 3
            and layout.is_projects_root(parts[0])
            and parts[2].lower() in (layout.INPUTS_DIR.lower(), layout.OPC_INPUTS_DIR.lower())
        ):
            return True
    return False


DELETE_OR_EMPTY_REASONS = {
    "rm target",
    "git rm target",
    "unlink target",
    "rmdir target",
    "truncate target",
    "touch target",
    "python os.unlink",
    "python os.remove",
    "python os.rmdir",
    "python Path.unlink",
    "python Path.rmdir",
    "python Path.unlink delete",
    "python Path.rmdir delete",
    "python Path.unlink dynamic delete",
    "python Path.rmdir dynamic delete",
    "python Path.touch",
    "python Path.mkdir",
    "python delete target",
    "python delete dynamic target",
    "node fs delete",
    "node fs dynamic delete",
}


def is_delete_or_empty_reason(reason: str) -> bool:
    """Kiểm tra nhãn lý do có phải chỉ xoá, làm rỗng hay chạm tệp (không ghi nội dung khách) không (§6e)."""
    return reason in DELETE_OR_EMPTY_REASONS


def extract_bash_write_targets(command: str, cwd: str, project_dir: str):
    """Trích xuất các file đích mà lệnh Bash sẽ ghi nội dung vào (bỏ qua đích chỉ xoá hay làm rỗng — §6e & §6f)."""
    targets = []
    commands, symlinks = bash_parser.parse_bash_script(command, cwd)
    raw_targets = []
    for sc in commands:
        for target_path, reason in bash_parser.extract_write_targets(sc, symlinks):
            raw_targets.append((target_path, reason, sc.cwd, symlinks))
    if raw_targets:
        for target_path, reason, t_cwd, t_sym in raw_targets:
            if is_delete_or_empty_reason(reason):
                continue
            targets.append((target_path, t_cwd, t_sym))
        return targets

    # Fallback khi bash_parser không nhận diện được đích nào (§6f / v15)
    sub_cmds = re.split(r'&&|\|\||;|(?<!>)\||\n', command)
    current_cwd = cwd

    for raw_cmd in sub_cmds:
        cmd = raw_cmd.strip()
        if not cmd:
            continue

        cd_match = re.match(r'cd\s+([^\s;&|]+)', cmd)
        if cd_match:
            new_dir = cd_match.group(1).strip('"\'')
            current_cwd = os.path.normpath(os.path.join(current_cwd, os.path.expanduser(new_dir)))
            continue

        redir_matches = re.finditer(r'(?:>>|>\||>)\s*([^\s;&|]+)', cmd)
        for rm in redir_matches:
            dest = rm.group(1).strip('"\'')
            if dest in ('/dev/null', '&1', '&2') or dest.startswith('&'):
                continue
            targets.append((dest, current_cwd, symlinks))

        tokens = cmd.split()
        if not tokens:
            continue
        base_cmd = os.path.basename(tokens[0])

        if base_cmd in ("tee", "sponge"):
            for arg in tokens[1:]:
                if not arg.startswith('-'):
                    targets.append((arg.strip('"\''), current_cwd, symlinks))
        elif base_cmd in ("cp", "ln", "rsync", "ditto", "install"):
            non_flag_args = [a for a in tokens[1:] if not a.startswith('-')]
            if len(non_flag_args) >= 2:
                targets.append((non_flag_args[-1].strip('"\''), current_cwd, symlinks))
        elif base_cmd == "mv":
            non_flag_args = [a for a in tokens[1:] if not a.startswith('-')]
            for arg in non_flag_args:
                targets.append((arg.strip('"\''), current_cwd, symlinks))
        elif base_cmd in ("sed", "perl"):
            if "-i" in tokens:
                for arg in tokens[1:]:
                    if not arg.startswith('-') and not arg.startswith('s/') and not arg.startswith('e'):
                        targets.append((arg.strip('"\''), current_cwd, symlinks))

    return targets


MAX_SOURCE_SCAN_BYTES = 2 * 1024 * 1024  # 2 MB


def extract_copy_operations(command: str, cwd: str):
    """Trích xuất các cặp (sources, dest, cmd_cwd, symlinks) từ lệnh sao chép/di chuyển/đọc-ghi tệp."""
    ops = []
    commands, symlinks = bash_parser.parse_bash_script(command, cwd)
    for sc in commands:
        base = sc.executable
        words = sc.words

        # 1. cp, install, rsync, ditto, mv, ln
        if base in ('cp', 'install', 'rsync', 'ditto', 'mv', 'ln'):
            non_flags = []
            skip_next = False
            for w in words[1:]:
                if skip_next:
                    skip_next = False
                    continue
                if base == 'install' and w in ('-m', '-o', '-g', '-S'):
                    skip_next = True
                    continue
                if not w.startswith('-'):
                    non_flags.append(w.strip("'\""))
            if len(non_flags) >= 2:
                ops.append((non_flags[:-1], non_flags[-1], sc.cwd, symlinks))

        # 2. dd if=src of=dst
        elif base == 'dd':
            src_dd = None
            dst_dd = None
            for w in words[1:]:
                if w.startswith('if='):
                    src_dd = w[3:].strip("'\"")
                elif w.startswith('of='):
                    dst_dd = w[3:].strip("'\"")
            if src_dd and dst_dd:
                ops.append(([src_dd], dst_dd, sc.cwd, symlinks))

        # 3. Lệnh đọc tệp (cat, head, tail, sed, awk, grep, sort, uniq, cut, tr) kèm chuyển hướng > / >> / >|
        elif base in ('cat', 'head', 'tail', 'sed', 'awk', 'grep', 'sort', 'uniq', 'cut', 'tr'):
            out_redirs = [
                t.strip("'\"") for op, t in sc.redirections
                if re.match(r'^\d*(?:>>|>\||>)$', op) and t.strip("'\"") not in ('/dev/null', '&1', '&2') and not t.strip("'\"").startswith('&')
            ]
            in_redirs = [t.strip("'\"") for op, t in sc.redirections if re.match(r'^\d*<$', op)]
            non_flags = [w.strip("'\"") for w in words[1:] if not w.startswith('-')]
            if base in ('sed', 'awk', 'grep', 'cut', 'tr') and non_flags:
                non_flags = non_flags[1:]
            src_files = non_flags + in_redirs
            for dst in out_redirs:
                if src_files:
                    ops.append((src_files, dst, sc.cwd, symlinks))

        # 4. python / python3 -c "... shutil.copy/copy2/copyfile/move/copytree(src, dst) ..."
        elif base in ('python', 'python3') or base.startswith('python3.'):
            shutil_re = re.compile(
                r'\bshutil\s*\.\s*(?:copy2?|copyfile|copytree|move)\s*\(\s*([\'"])(.*?)\1\s*,\s*([\'"])(.*?)\3'
            )
            for idx, w in enumerate(words[1:], start=1):
                if w.startswith('-') and 'c' in w and idx + 1 < len(words):
                    py_code = words[idx + 1]
                    for m in shutil_re.finditer(py_code):
                        src = m.group(2)
                        dst = m.group(4)
                        if src and dst:
                            ops.append(([src], dst, sc.cwd, symlinks))
                    break

    return ops


def check_copied_sources_pii(command: str, cwd: str, project_dir: str) -> str:
    """Quét nội dung tệp nguồn (tối đa 2 MB) khi sao chép/di chuyển/ghi sang đích ngoài DAU-VAO."""
    ops = extract_copy_operations(command, cwd)
    for sources, dest, cmd_cwd, symlinks in ops:
        if is_dau_vao_path(dest, cmd_cwd, project_dir, symlinks):
            continue
        for src in sources:
            src_abs = os.path.normpath(os.path.join(cmd_cwd, os.path.expanduser(src))) if not os.path.isabs(src) else os.path.normpath(os.path.expanduser(src))
            try:
                real_src = os.path.realpath(src_abs)
                if os.path.isfile(real_src) and os.path.getsize(real_src) <= MAX_SOURCE_SCAN_BYTES:
                    with open(real_src, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                    has_pii, reasons = pii_patterns.scan_pii(content)
                    if has_pii:
                        reason_str = ", ".join(reasons)
                        return f"Tệp nguồn ({os.path.basename(src)}) chứa thông tin định danh cá nhân ({reason_str}) không được phép sao chép/di chuyển thẳng ra ngoài DAU-VAO ({dest}). Hãy chạy mask_pii.py trước."
            except Exception:
                pass
    return ""


def extract_all_strings(val) -> List[str]:
    """Trích xuất đệ quy mọi chuỗi trong cấu trúc dữ liệu tool_input."""
    strings = []
    if isinstance(val, str):
        strings.append(val)
    elif isinstance(val, dict):
        for v in val.values():
            strings.extend(extract_all_strings(v))
    elif isinstance(val, list):
        for v in val:
            strings.extend(extract_all_strings(v))
    return strings


def check_pii(tool_name: str, tool_input: dict, cwd: str, project_dir: str) -> str:
    # 1. Sửa tệp (Write, Edit, MultiEdit, NotebookEdit)
    if tool_name in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        file_path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""

        # Nếu đích ghi nằm hoàn toàn trong DAU-VAO của gốc phiên (session root) thì không chặn PII thô ở đầu vào (§6b)
        if file_path and is_dau_vao_path(file_path, cwd, project_dir):
            return ""

        # Quét MỌI chuỗi trong tool_input, bao gồm cả file_path và notebook_path
        all_strings = extract_all_strings(tool_input)
        for s in all_strings:
            has_pii, reasons = pii_patterns.scan_pii(s)
            if has_pii:
                reason_str = ", ".join(reasons)
                return f"Phát hiện thông tin định danh cá nhân ({reason_str}) trong thao tác tệp ngoài DAU-VAO ({os.path.basename(file_path) if file_path else 'tệp'}). Hãy chạy mask_pii.py trước khi lưu nháp."

    # 2. Lệnh Bash
    elif tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd:
            return ""

        # Tìm các đích ghi của lệnh Bash
        targets = extract_bash_write_targets(cmd, cwd, project_dir)

        # Nếu lệnh không có đích ghi nội dung (chỉ đọc hoặc chỉ xoá tệp) thì cho qua
        if not targets:
            return ""

        # Chỉ quét khi có ít nhất MỘT đích ghi nằm ngoài CAC-DU-AN/*/DAU-VAO/ của gốc phiên
        has_target_outside_dau_vao = any(not is_dau_vao_path(t, t_cwd, project_dir, t_sym) for t, t_cwd, t_sym in targets)
        if not has_target_outside_dau_vao:
            return ""

        # Quét PII trong chuỗi lệnh
        has_pii, reasons = pii_patterns.scan_pii(cmd)
        if has_pii:
            reason_str = ", ".join(reasons)
            return f"Lệnh chứa thông tin định danh cá nhân ({reason_str}) nhắm vào đích ngoài DAU-VAO. Hãy ẩn danh hoá dữ liệu khách hàng trước."

        # Quét PII trong nội dung tệp nguồn nếu lệnh sao chép/di chuyển tệp ra ngoài DAU-VAO
        copied_violation = check_copied_sources_pii(cmd, cwd, project_dir)
        if copied_violation:
            return copied_violation

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

        violation = check_pii(tool_name, tool_input, cwd, project_dir)
        if violation:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] {violation}\n")
            sys.exit(2)

        sys.exit(0)
    except SystemExit:
        raise
    except bash_parser.BashParseError as e:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi cú pháp hoặc nháy chưa khép: {e}, chặn cho chắc.\n")
        sys.exit(2)
    except Exception:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi nội bộ hook, chặn cho chắc\n")
        sys.exit(2)


if __name__ == "__main__":
    main()


