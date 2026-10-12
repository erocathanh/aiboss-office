#!/usr/bin/env python3
"""Hook 1: block_mass_delete.py
Chặn các lệnh xoá hàng loạt, phá huỷ git, hoặc ghi đè tệp nhật ký.
Tuân thủ đầy đủ kết quả rà soát an toàn chuyên sâu (review 30/09/2026).
"""

import sys
import json
import os
import re

# Nạp module bash_parser dùng chung
HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
if HOOKS_DIR not in sys.path:
    sys.path.insert(0, HOOKS_DIR)

import bash_parser
import layout

HOOK_NAME = "block_mass_delete"

def check_command(cmd: str, cwd: str) -> str:
    """Kiểm tra một chuỗi lệnh bash. Trả về lý do chặn nếu vi phạm, rỗng nếu an toàn."""
    if not cmd or not cmd.strip():
        return ""

    commands, _ = bash_parser.parse_bash_script(cmd, cwd)

    for sc in commands:
        exe = sc.executable
        words = sc.words

        # 1. Kiểm tra lệnh rm với tuỳ chọn đệ quy (-r/-R/--recursive)
        if exe == 'rm':
            for w in words[1:]:
                if w == '--recursive':
                    return "Lệnh rm có tuỳ chọn đệ quy (-r/-R/--recursive) bị chặn. Hãy xoá từng tệp cụ thể không đệ quy."
                if w.startswith('-') and not w.startswith('--'):
                    if 'r' in w or 'R' in w:
                        return "Lệnh rm có tuỳ chọn đệ quy (-r/-R/--recursive) bị chặn. Hãy xoá từng tệp cụ thể không đệ quy."

        # Kiểm tra qua xargs rm -r
        elif exe == 'xargs':
            idx = 1
            x_flags_with_val = {'-n', '-I', '-s', '-P', '-L', '-E', '-d', '--max-args', '--max-procs', '--max-chars', '--delimiter'}
            sub_exe = None
            while idx < len(words):
                w = words[idx]
                if w in x_flags_with_val:
                    idx += 2
                    continue
                if any(w.startswith(f + '=') for f in ('--max-args', '--max-procs', '--max-chars', '--delimiter')) or (w.startswith('-') and len(w) > 2 and w[1] in 'nIsPLEd'):
                    idx += 1
                    continue
                if w.startswith('-'):
                    idx += 1
                    continue
                sub_exe = os.path.basename(w.lstrip('\\'))
                break
            if sub_exe == 'rm':
                for w in words[1:]:
                    if w == '--recursive' or (w.startswith('-') and not w.startswith('--') and ('r' in w or 'R' in w)):
                        return "Lệnh rm có tuỳ chọn đệ quy (-r/-R/--recursive) qua xargs bị chặn. Hãy xoá từng tệp cụ thể không đệ quy."

        # 2. Kiểm tra lệnh find -delete hoặc find -exec rm
        elif exe == 'find':
            if '-delete' in words:
                return "Lệnh find ... -delete bị chặn để tránh xoá hàng loạt. Hãy kiểm tra danh sách tệp trước."
            for idx, w in enumerate(words):
                if w in ('-exec', '-execdir') and idx + 1 < len(words):
                    exec_cmd = os.path.basename(words[idx + 1].lstrip('\\'))
                    if exec_cmd == 'rm':
                        return "Lệnh find -exec gọi rm bị chặn để tránh xoá hàng loạt."

        # 3. Kiểm tra git reset --hard, git clean -f/--force, git push --force/-f
        elif exe == 'git':
            # Tìm subcommand của git (bỏ qua cờ global như -C, -c, --git-dir)
            w_idx = 1
            subcmd = None
            while w_idx < len(words):
                w = words[w_idx]
                if w in ('-C', '-c', '--git-dir', '--work-tree'):
                    w_idx += 2
                    continue
                if w.startswith('-'):
                    w_idx += 1
                    continue
                subcmd = w
                subcmd_args = words[w_idx + 1:]
                break

            if subcmd == 'reset':
                if '--hard' in subcmd_args:
                    return "Lệnh git reset --hard bị chặn để bảo vệ lịch sử làm việc. Hãy dùng git checkout hoặc stash."
            elif subcmd == 'clean':
                for a in subcmd_args:
                    if a == '--force':
                        return "Lệnh git clean -f/--force bị chặn để tránh mất tệp chưa commit. Hãy xoá tệp cụ thể bằng tay."
                    if a.startswith('-') and not a.startswith('--') and 'f' in a:
                        return "Lệnh git clean -f/--force bị chặn để tránh mất tệp chưa commit. Hãy xoá tệp cụ thể bằng tay."
            elif subcmd == 'push':
                for a in subcmd_args:
                    if a in ('--force', '--force-with-lease') or a.startswith('--force-with-lease'):
                        return "Lệnh git push --force bị chặn để bảo vệ nhánh từ xa."
                    if a.startswith('-') and not a.startswith('--') and 'f' in a:
                        return "Lệnh git push --force bị chặn để bảo vệ nhánh từ xa."

        # 4. Kiểm tra ghi đè nhật ký bằng > hoặc 1> (cho phép nối thêm >> hoặc 1>>)
        for op, target in sc.redirections:
            if op in ('>', '1>'):
                clean_target = target.strip("'\"")
                target_base = os.path.basename(clean_target)
                if layout.is_channel_file(target_base):
                    return f"Ghi đè bằng dấu > vào {target_base} bị chặn. Tệp nhật ký chỉ được phép nối thêm bằng >>."

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

        tool_input = data.get("tool_input", {})
        cmd = tool_input.get("command", "")
        cwd = data.get("cwd", os.getcwd())

        if not cmd:
            sys.exit(0)

        violation = check_command(cmd, cwd)
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
