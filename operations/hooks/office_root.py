"""office_root.py — Hàm tìm thư mục gốc kho AIBOSS Office cho các hook an toàn.

Thuật toán (H1 + §6 + §6b):
1. Điểm bắt đầu dò gốc phiên ưu tiên theo CLAUDE_PROJECT_DIR; chỉ khi biến này trống mới dùng start_dir / cwd.
2. Đi ngược lên tối đa 8 tầng cha tìm thư mục có config/office.json.
3. Nếu không thấy, kiểm tra biến môi trường AIBOSS_OFFICE_ROOT (nếu có config/office.json).
4. Tuỳ chọn có chủ ý (mặc định tắt): nếu đặt AIBOSS_ALLOW_OPC_ROOT_FALLBACK=1 thì cho phép nhận diện CLAUDE-MASTER/CLAUDE.md.
5. Nếu vẫn không thấy: in thông báo rõ ra stderr («không tìm thấy gốc office») và sys.exit(2) (fail-closed, KHÔNG fallback về cwd/CLAUDE_PROJECT_DIR).
6. Hỗ trợ luật hợp nhất §6b: find_nearest_office_root tìm dấu config/office.json gần nhất phía trên tệp đích (tối đa 8 tầng cha) để bảo vệ cả bản sao office lồng trong wip/.
"""

import os
import sys
from typing import Dict, List, Optional, Tuple


def _walk_up_for_office_json(start_abs: str) -> Optional[str]:
    """Đi ngược lên tối đa 8 tầng cha từ start_abs tìm config/office.json."""
    current = start_abs
    for _ in range(9):  # current + 8 tầng cha = 9 lượt kiểm tra
        config_file = os.path.join(current, "config", "office.json")
        if os.path.isfile(config_file):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return None


def find_office_root(start_dir: Optional[str] = None) -> str:
    """Tìm thư mục gốc phiên AIBOSS Office theo thứ tự ưu tiên:
    - Điểm xuất phát: CLAUDE_PROJECT_DIR (nếu có) -> start_dir -> os.getcwd().
    - Fail-closed (exit 2) nếu không tìm thấy config/office.json.
    """
    env_claude = os.environ.get("CLAUDE_PROJECT_DIR", "").strip()
    start = env_claude or (start_dir.strip() if isinstance(start_dir, str) else "") or os.getcwd()
    current = os.path.abspath(os.path.expanduser(start))

    # 1. Đi ngược lên tối đa 8 tầng tìm config/office.json từ điểm xuất phát
    found = _walk_up_for_office_json(current)
    if found:
        return found

    # 2. Kiểm tra AIBOSS_OFFICE_ROOT
    env_root = os.environ.get("AIBOSS_OFFICE_ROOT", "").strip()
    if env_root:
        env_abs = os.path.abspath(os.path.expanduser(env_root))
        env_config = os.path.join(env_abs, "config", "office.json")
        if os.path.isfile(env_config):
            return env_abs

    # 3. Chế độ có chủ ý (mặc định tắt) cho môi trường OPC thuần không có config/office.json
    if os.environ.get("AIBOSS_ALLOW_OPC_ROOT_FALLBACK", "").strip() == "1":
        p = current
        for _ in range(9):
            if os.path.isfile(os.path.join(p, "CLAUDE-MASTER", "CLAUDE.md")):
                sys.stderr.write(
                    f"[opc-harness:office_root] AIBOSS_ALLOW_OPC_ROOT_FALLBACK=1 active, using OPC root '{p}'\n"
                )
                return p
            parent = os.path.dirname(p)
            if parent == p:
                break
            p = parent

    # 4. Không tìm thấy: dừng an toàn mã 2 kèm thông báo chuẩn
    sys.stderr.write(
        f"[opc-harness] không tìm thấy gốc office (thiếu config/office.json trong 8 tầng cha từ '{start}' hoặc qua AIBOSS_OFFICE_ROOT)\n"
    )
    sys.exit(2)


def resolve_project_root(cwd: str = "") -> str:
    """Lấy thư mục gốc dự án ưu tiên theo CLAUDE_PROJECT_DIR; chỉ khi biến này trống mới đi lên từ cwd."""
    return find_office_root(os.environ.get("CLAUDE_PROJECT_DIR") or cwd)


# Alias tương thích: trong kho Office, find_root luôn giữ chính sách fail-closed như find_office_root
find_root = find_office_root
find_repo_root = find_office_root
resolve_project_dir = resolve_project_root


def find_nearest_office_root(
    target_path: str,
    base_cwd: str = "",
    symlinks_map: Optional[Dict[str, str]] = None,
) -> Optional[str]:
    """Tìm dấu config/office.json gần nhất phía trên tệp đích (đi ngược từ thư mục chứa đích lên tối đa 8 tầng).
    Phục vụ luật hợp nhất §6b cho lock_raw_inputs và protect_final_outputs. Không thoát mã 2 nếu không thấy.
    """
    if not target_path:
        return None
    p = target_path.strip().strip("'\"")
    if not p or "$" in p or "`" in p:
        return None

    cwd_eff = base_cwd or os.getcwd()
    expanded = os.path.expanduser(p)
    abs_p = (
        os.path.normpath(os.path.join(cwd_eff, expanded))
        if not os.path.isabs(expanded)
        else os.path.normpath(expanded)
    )

    if symlinks_map:
        for link_k, target_v in symlinks_map.items():
            exp_k = os.path.expanduser(link_k)
            exp_v = os.path.expanduser(target_v)
            abs_k = os.path.normpath(os.path.join(cwd_eff, exp_k)) if not os.path.isabs(exp_k) else os.path.normpath(exp_k)
            abs_v = os.path.normpath(os.path.join(cwd_eff, exp_v)) if not os.path.isabs(exp_v) else os.path.normpath(exp_v)
            if abs_p == abs_k:
                abs_p = abs_v
                break
            elif abs_p.startswith(abs_k + os.sep):
                abs_p = abs_v + abs_p[len(abs_k):]
                break

    starts: List[str] = []
    start_dir = abs_p if os.path.isdir(abs_p) else os.path.dirname(abs_p)
    if start_dir:
        starts.append(start_dir)
    try:
        real_p = os.path.realpath(abs_p)
        real_start = real_p if os.path.isdir(real_p) else os.path.dirname(real_p)
        if real_start and real_start not in starts:
            starts.append(real_start)
    except Exception:
        pass

    for st in starts:
        found = _walk_up_for_office_json(st)
        if found:
            return found
    return None


def candidate_rel_paths_with_roots(
    target_path: str,
    base_cwd: str,
    session_root: str,
    symlinks_map: Optional[Dict[str, str]] = None,
) -> List[Tuple[str, str]]:
    """Trả về danh sách (rel_path, root_dir) của target_path xét theo:
    1) Gốc phiên (session_root), VÀ
    2) Dấu config/office.json gần nhất phía trên tệp đích (nếu khác session_root) theo luật hợp nhất §6b.
    """
    import bash_parser

    out: List[Tuple[str, str]] = []
    seen = set()

    roots = [session_root]
    nearest = find_nearest_office_root(target_path, base_cwd, symlinks_map)
    if nearest:
        try:
            if os.path.realpath(nearest) != os.path.realpath(session_root):
                roots.append(nearest)
        except Exception:
            if nearest != session_root:
                roots.append(nearest)

    for r_dir in roots:
        rel_logic = bash_parser.logical_rel_path(target_path, base_cwd, r_dir)
        rel_canon = bash_parser.canonical_path(target_path, base_cwd, r_dir, symlinks_map)
        for cand in (rel_logic, rel_canon):
            key = (cand, r_dir)
            if cand and key not in seen:
                seen.add(key)
                out.append(key)
    return out


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    root = find_office_root(arg)
    print(root)


