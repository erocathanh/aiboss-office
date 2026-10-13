#!/usr/bin/env python3
"""Hook 3: block_external_scan.py
Chặn các lệnh quét diện rộng toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes).
Không chặn đọc một tệp cụ thể.
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

HOOK_NAME = "block_external_scan"

def is_broad_scan_path(path_str: str, base_cwd: str = "") -> bool:
    """Kiểm tra đường dẫn có phải là root (/) hoặc /Volumes hoặc cây con của /Volumes không."""
    if not path_str:
        return False
    p = path_str.strip().strip("'\"")
    if not p:
        return False

    if not os.path.isabs(os.path.expanduser(p)) and base_cwd:
        norm = os.path.normpath(os.path.join(base_cwd, os.path.expanduser(p)))
    else:
        norm = os.path.normpath(os.path.expanduser(p))

    if norm == "/":
        return True
    if norm == "/Volumes" or norm.startswith("/Volumes/"):
        return True
    return False

def check_external_scan(tool_name: str, tool_input: dict, cwd: str) -> str:
    # 1. Kiểm tra lệnh Bash
    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        if not cmd or not cmd.strip():
            return ""

        commands, _ = bash_parser.parse_bash_script(cmd, cwd)

        for sc in commands:
            exe = sc.executable
            words = sc.words

            # A. Lệnh mdfind: phải có cờ -onlyin ngay trong lệnh mdfind này
            if exe == 'mdfind':
                has_onlyin = False
                for idx, w in enumerate(words):
                    if w == '-onlyin':
                        has_onlyin = True
                        if idx + 1 < len(words):
                            target = words[idx + 1]
                            if is_broad_scan_path(target, sc.cwd):
                                return "Lệnh mdfind với phạm vi -onlyin là ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn."
                        break
                if not has_onlyin:
                    return "Lệnh mdfind thiếu cờ giới hạn phạm vi -onlyin bị chặn để tránh làm treo máy hoặc rò rỉ dữ liệu ngoài dự án."

            # B. Lệnh find
            elif exe == 'find':
                find_opts = {'-H', '-L', '-P', '-E', '-X', '-s', '-d', '-x', '-f'}
                paths = []
                idx = 1
                while idx < len(words):
                    w = words[idx]
                    if w in find_opts:
                        idx += 1
                        continue
                    if w.startswith('-'):
                        # Bắt đầu expression (-name, -type, ...)
                        break
                    paths.append(w)
                    idx += 1

                if not paths:
                    paths = ['.']

                for p in paths:
                    if is_broad_scan_path(p, sc.cwd):
                        return "Lệnh find quét toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn để tránh làm treo máy hoặc rò rỉ dữ liệu ngoài dự án."

            # C. Lệnh ls có cờ -R (đệ quy)
            elif exe == 'ls':
                has_recursive = any(w.startswith('-') and not w.startswith('--') and 'R' in w for w in words[1:])
                if has_recursive:
                    for w in words[1:]:
                        if w.startswith('-'):
                            continue
                        if is_broad_scan_path(w, sc.cwd):
                            return "Lệnh ls đệ quy (-R) quét toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn."

            # D. Lệnh grep đệ quy (-r / -R)
            elif exe == 'grep':
                has_recursive = any(w.startswith('-') and not w.startswith('--') and ('r' in w or 'R' in w) for w in words[1:])
                if has_recursive:
                    non_flags = [w for w in words[1:] if not w.startswith('-')]
                    # non_flags[0] là pattern, non_flags[1:] là paths
                    if len(non_flags) > 1:
                        for p in non_flags[1:]:
                            if is_broad_scan_path(p, sc.cwd):
                                return "Lệnh grep đệ quy quét toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn."

            # E. Lệnh ripgrep (rg) — mặc định quét đệ quy
            elif exe == 'rg':
                has_files_flag = any(w == '--files' for w in words[1:])
                non_flags = [w for w in words[1:] if not w.startswith('-')]
                if has_files_flag:
                    scan_paths = non_flags
                else:
                    scan_paths = non_flags[1:] if len(non_flags) > 1 else []

                for p in scan_paths:
                    if is_broad_scan_path(p, sc.cwd):
                        return "Lệnh ripgrep (rg) quét toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn."

            # F. Lệnh du
            elif exe == 'du':
                for w in words[1:]:
                    if w.startswith('-'):
                        continue
                    if is_broad_scan_path(w, sc.cwd):
                        return "Lệnh du quét dung lượng toàn bộ ổ đĩa (/) hoặc ổ gắn ngoài (/Volumes) bị chặn."

    # 2. Kiểm tra Grep / Glob
    elif tool_name in ("Grep", "Glob"):
        path = tool_input.get("path", "")
        if path and is_broad_scan_path(path, cwd):
            return f"Công cụ {tool_name} nhắm vào phạm vi quét rộng ({path}) bị chặn. Hãy quét trong phạm vi thư mục dự án."

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

        violation = check_external_scan(tool_name, tool_input, cwd)
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
