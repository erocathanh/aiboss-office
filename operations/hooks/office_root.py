"""office_root.py — Hàm tìm thư mục gốc kho AIBOSS Office cho các hook an toàn.

Thuật toán:
1. Xuất phát từ start_dir (mặc định os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).
2. Đi ngược lên tối đa 8 tầng cha tìm thư mục có config/office.json.
3. Nếu không thấy, kiểm tra biến môi trường AIBOSS_OFFICE_ROOT (nếu có config/office.json).
4. Nếu vẫn không thấy, in thông báo rõ ra stderr và sys.exit(2).
"""

import os
import sys
from typing import Optional


def find_office_root(start_dir: Optional[str] = None) -> str:
    """Tìm thư mục gốc AIBOSS Office theo đúng thứ tự ưu tiên."""
    start = start_dir or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    current = os.path.abspath(start)

    # 1. Đi ngược lên tối đa 8 tầng tìm config/office.json
    for _ in range(9):  # current + 8 tầng cha = 9 lượt kiểm tra
        config_file = os.path.join(current, "config", "office.json")
        if os.path.isfile(config_file):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    # 2. Kiểm tra AIBOSS_OFFICE_ROOT
    env_root = os.environ.get("AIBOSS_OFFICE_ROOT")
    if env_root:
        env_config = os.path.join(env_root, "config", "office.json")
        if os.path.isfile(env_config):
            return os.path.abspath(env_root)

    # 3. Không tìm thấy: dừng an toàn mã 2 kèm thông báo
    sys.stderr.write(
        f"[opc-harness] không tìm thấy gốc office (thiếu config/office.json trong 8 tầng cha từ '{start}' hoặc qua AIBOSS_OFFICE_ROOT)\n"
    )
    sys.exit(2)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    root = find_office_root(arg)
    print(root)
