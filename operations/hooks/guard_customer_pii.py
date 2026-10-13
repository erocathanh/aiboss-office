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
    import layout
    import office_root
    import pii_patterns
except ImportError as e:
    sys.stderr.write(f"[opc-harness:{HOOK_NAME}] thiếu module phụ trợ ({e}), chặn cho chắc\n")
    sys.exit(2)


def is_dau_vao_path(path: str, cwd: str, project_dir: str) -> bool:
    """Kiểm tra đường dẫn có nằm dưới thư mục DAU-VAO/inputs của dự án không (dùng chung §5.1 với hook 7)."""
    if not path:
        return False
    if not os.path.isabs(path):
        full_path = os.path.normpath(os.path.join(cwd, os.path.expanduser(path)))
    else:
        full_path = os.path.normpath(path)

    try:
        rel = os.path.relpath(full_path, project_dir)
    except ValueError:
        rel = full_path

    rel_norm = rel.replace('\\', '/')
    parts = rel_norm.split('/')

    # projects/<project>/inputs/... hoặc CAC-DU-AN/<tên-dự-án>/DAU-VAO/...
    if len(parts) >= 3 and layout.is_projects_root(parts[0]) and layout.is_inputs_dir(parts[2]):
        return True

    if f"/{layout.INPUTS_DIR}/" in rel_norm or rel_norm.endswith(f"/{layout.INPUTS_DIR}"):
        return True
    if '/DAU-VAO/' in rel_norm or rel_norm.endswith('/DAU-VAO'):
        return True

    return False


def extract_bash_write_targets(command: str, cwd: str, project_dir: str):
    """Trích xuất các file đích mà lệnh Bash sẽ ghi vào (dùng chung §5.1 với hook 7)."""
    targets = []
    sub_cmds = re.split(r'&&|\|\||;|\||\n', command)
    current_cwd = cwd

    for raw_cmd in sub_cmds:
        cmd = raw_cmd.strip()
        if not cmd:
            continue

        # Cập nhật cwd nếu có cd
        cd_match = re.match(r'cd\s+([^\s;&|]+)', cmd)
        if cd_match:
            new_dir = cd_match.group(1).strip('"\'')
            current_cwd = os.path.normpath(os.path.join(current_cwd, os.path.expanduser(new_dir)))
            continue

        # 1. Bắt chuyển hướng >> hoặc >
        redir_matches = re.finditer(r'(?:>>|>)\s*([^\s;&|]+)', cmd)
        for rm in redir_matches:
            dest = rm.group(1).strip('"\'')
            if dest in ('/dev/null', '&1', '&2'):
                continue
            targets.append((dest, current_cwd))

        # 2. Bắt các lệnh ghi: tee, cp, ln, mv, touch, truncate, sed -i, perl -i
        tokens = cmd.split()
        if not tokens:
            continue
        base_cmd = os.path.basename(tokens[0])

        if base_cmd == "tee":
            for arg in tokens[1:]:
                if not arg.startswith('-'):
                    targets.append((arg.strip('"\''), current_cwd))
        elif base_cmd in ("cp", "ln"):
            non_flag_args = [a for a in tokens[1:] if not a.startswith('-')]
            if len(non_flag_args) >= 2:
                targets.append((non_flag_args[-1].strip('"\''), current_cwd))
        elif base_cmd == "mv":
            non_flag_args = [a for a in tokens[1:] if not a.startswith('-')]
            for arg in non_flag_args:
                targets.append((arg.strip('"\''), current_cwd))
        elif base_cmd in ("touch", "truncate"):
            for arg in tokens[1:]:
                if not arg.startswith('-'):
                    targets.append((arg.strip('"\''), current_cwd))
        elif base_cmd in ("sed", "perl"):
            if "-i" in tokens:
                for arg in tokens[1:]:
                    if not arg.startswith('-') and not arg.startswith('s/') and not arg.startswith('e'):
                        targets.append((arg.strip('"\''), current_cwd))

    return targets


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

        # Nếu đích ghi nằm hoàn toàn trong DAU-VAO thì không chặn PII thô ở đầu vào
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

        # Nếu lệnh không có đích ghi (chỉ đọc như grep -c, git clone, ls, v.v.) thì cho qua
        if not targets:
            return ""

        # Chỉ quét khi có ít nhất MỘT đích ghi nằm ngoài CAC-DU-AN/*/DAU-VAO/
        has_target_outside_dau_vao = any(not is_dau_vao_path(t, t_cwd, project_dir) for t, t_cwd in targets)
        if not has_target_outside_dau_vao:
            return ""

        # Quét PII trong lệnh
        has_pii, reasons = pii_patterns.scan_pii(cmd)
        if has_pii:
            reason_str = ", ".join(reasons)
            return f"Lệnh chứa thông tin định danh cá nhân ({reason_str}) nhắm vào đích ngoài DAU-VAO. Hãy ẩn danh hoá dữ liệu khách hàng trước."

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

        violation = check_pii(tool_name, tool_input, cwd, project_dir)
        if violation:
            sys.stderr.write(f"[opc-harness:{HOOK_NAME}] {violation}\n")
            sys.exit(2)

        sys.exit(0)
    except SystemExit:
        raise
    except Exception:
        sys.stderr.write(f"[opc-harness:{HOOK_NAME}] lỗi nội bộ hook, chặn cho chắc\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
