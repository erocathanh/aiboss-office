#!/usr/bin/env python3
"""Kiểm tra giao nhau giữa hai danh sách file ownership.

Mỗi tệp đầu vào chứa một đường dẫn repo-relative trên mỗi dòng.
Dòng rỗng và dòng bắt đầu bằng # được bỏ qua.
"""

from __future__ import annotations

import sys
import unicodedata
from pathlib import Path, PurePosixPath


def dung() -> int:
    print(
        f"Cách dùng: {Path(sys.argv[0]).name} <danh-sach-a> <danh-sach-b>",
        file=sys.stderr,
    )
    return 2


def doc_danh_sach(duong_dan: str) -> list[str]:
    ket_qua: set[str] = set()
    for so_dong, dong in enumerate(Path(duong_dan).read_text(encoding="utf-8").splitlines(), 1):
        gia_tri = unicodedata.normalize("NFC", dong.strip())
        if not gia_tri or gia_tri.startswith("#"):
            continue

        gia_tri = gia_tri.replace("\\", "/")
        tep = PurePosixPath(gia_tri)
        if tep.is_absolute() or gia_tri.endswith("/") or any(phan in {"", ".", ".."} for phan in tep.parts):
            raise ValueError(f"{duong_dan}:{so_dong}: đường dẫn không hợp lệ: {dong!r}")

        ket_qua.add(tep.as_posix())

    return sorted(ket_qua)


def main() -> int:
    if len(sys.argv) != 3:
        return dung()

    try:
        danh_sach_a = doc_danh_sach(sys.argv[1])
        danh_sach_b = doc_danh_sach(sys.argv[2])
    except (OSError, UnicodeError, ValueError) as loi:
        print(f"LỖI: {loi}", file=sys.stderr)
        return 2

    giao = sorted(set(danh_sach_a) & set(danh_sach_b))
    if not giao:
        return 0

    print("DANH_SACH_A")
    print(*danh_sach_a, sep="\n")
    print("DANH_SACH_B")
    print(*danh_sach_b, sep="\n")
    print("PHAN_GIAO")
    print(*giao, sep="\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
