#!/usr/bin/env python3
"""Chặn sửa mã trong một lượt chỉ được phép dời dòng nguyên văn."""

from __future__ import annotations

import argparse
import ast
import collections
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


MOC_CUM = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


@dataclass(frozen=True)
class DongThayDoi:
    tep: str
    so_dong: int
    noi_dung: str
    co_xuong_dong: bool = True

    @property
    def khoa(self) -> tuple[str, bool]:
        return self.noi_dung, self.co_xuong_dong


def lay_diff(kho: Path, cu: str, moi: str) -> str:
    lenh = [
        "git",
        "-C",
        str(kho),
        "diff",
        "--no-ext-diff",
        "--no-color",
        "--no-renames",
        "--unified=0",
        cu,
        moi,
        "--",
    ]
    ket_qua = subprocess.run(lenh, text=True, capture_output=True, check=False)
    if ket_qua.returncode != 0:
        thong_bao = ket_qua.stderr.strip() or "git diff thất bại"
        raise ValueError(thong_bao)
    return ket_qua.stdout


def doc_ten_tep(dong_tieu_de: str, tien_to: str) -> str:
    ten = dong_tieu_de[4:]
    if ten.startswith('"'):
        ten = ast.literal_eval(ten)
    if ten == "/dev/null":
        return ""
    if ten.startswith(tien_to):
        return ten[len(tien_to) :]
    return ten


def tach_dong(diff: str) -> tuple[list[DongThayDoi], list[DongThayDoi]]:
    cac_dong_xoa: list[DongThayDoi] = []
    cac_dong_them: list[DongThayDoi] = []
    tep_cu = ""
    tep_moi = ""
    dong_cu = 0
    dong_moi = 0
    trong_cum = False
    thay_doi_truoc: tuple[str, int] | None = None

    for dong in diff.splitlines():
        # Tiêu đề tệp chỉ hợp lệ ngoài cụm. Trong cụm, "--- " có thể là
        # một dòng bị xoá có nội dung bắt đầu bằng "-- ".
        if dong.startswith("diff --git "):
            trong_cum = False
            continue
        if not trong_cum and dong.startswith("--- "):
            tep_cu = doc_ten_tep(dong, "a/")
            trong_cum = False
            continue
        if not trong_cum and dong.startswith("+++ "):
            tep_moi = doc_ten_tep(dong, "b/")
            continue

        moc = MOC_CUM.match(dong)
        if moc:
            dong_cu = int(moc.group(1))
            dong_moi = int(moc.group(3))
            trong_cum = True
            thay_doi_truoc = None
            continue
        if not trong_cum:
            continue

        if dong.startswith("-"):
            cac_dong_xoa.append(DongThayDoi(tep_cu, dong_cu, dong[1:]))
            thay_doi_truoc = ("xoa", len(cac_dong_xoa) - 1)
            dong_cu += 1
        elif dong.startswith("+"):
            cac_dong_them.append(DongThayDoi(tep_moi, dong_moi, dong[1:]))
            thay_doi_truoc = ("them", len(cac_dong_them) - 1)
            dong_moi += 1
        elif dong.startswith("\\ No newline at end of file"):
            if thay_doi_truoc is None:
                raise ValueError("dấu cuối tệp không gắn với dòng thay đổi nào")
            loai, vi_tri = thay_doi_truoc
            danh_sach = cac_dong_xoa if loai == "xoa" else cac_dong_them
            cu = danh_sach[vi_tri]
            danh_sach[vi_tri] = DongThayDoi(cu.tep, cu.so_dong, cu.noi_dung, False)
        else:
            dong_cu += 1
            dong_moi += 1
            thay_doi_truoc = None

    return cac_dong_xoa, cac_dong_them


def tim_dong_khong_quay_lai(
    cac_dong_xoa: list[DongThayDoi],
    cac_dong_them: list[DongThayDoi],
    pham_vi: dict[str, set[str]],
) -> tuple[list[DongThayDoi], set[int]]:
    da_dung: set[int] = set()
    khong_quay_lai: list[DongThayDoi] = []
    for dong in cac_dong_xoa:
        tep_dich = {dong.tep, *pham_vi.get(dong.tep, set())}
        vi_tri = next(
            (
                i
                for i, dong_them in enumerate(cac_dong_them)
                if i not in da_dung
                and dong_them.tep in tep_dich
                and dong_them.khoa == dong.khoa
            ),
            None,
        )
        if vi_tri is None:
            khong_quay_lai.append(dong)
        else:
            da_dung.add(vi_tri)
    return khong_quay_lai, da_dung


def doc_pham_vi(cac_gia_tri: list[str]) -> dict[str, set[str]]:
    ket_qua: dict[str, set[str]] = collections.defaultdict(set)
    for gia_tri in cac_gia_tri:
        if ":" not in gia_tri:
            raise ValueError(f"phạm vi phải có dạng TỆP_NGUỒN:TỆP_ĐÍCH: {gia_tri}")
        nguon, dich = gia_tri.split(":", 1)
        if not nguon or not dich:
            raise ValueError(f"phạm vi thiếu tệp nguồn hoặc đích: {gia_tri}")
        ket_qua[nguon].add(dich)
    return dict(ket_qua)


def doc_danh_sach_cho_phep(
    cac_gia_tri: list[str],
) -> collections.Counter[tuple[str, tuple[str, bool]]]:
    ket_qua: collections.Counter[tuple[str, tuple[str, bool]]] = collections.Counter()
    for gia_tri in cac_gia_tri:
        if "::" not in gia_tri:
            raise ValueError(f"dòng cho phép phải có dạng TỆP::NGUYÊN_VĂN: {gia_tri}")
        tep, noi_dung = gia_tri.split("::", 1)
        if not tep:
            raise ValueError(f"dòng cho phép thiếu tệp đích: {gia_tri}")
        ket_qua[(tep, (noi_dung, True))] += 1
    return ket_qua


def tim_dong_them_khong_cho_phep(
    cac_dong_them: list[DongThayDoi],
    da_dung: set[int],
    cho_phep: collections.Counter[tuple[str, tuple[str, bool]]],
) -> list[DongThayDoi]:
    con_lai = cho_phep.copy()
    khong_cho_phep: list[DongThayDoi] = []
    for i, dong in enumerate(cac_dong_them):
        if i in da_dung:
            continue
        khoa = (dong.tep, dong.khoa)
        if con_lai[khoa] > 0:
            con_lai[khoa] -= 1
        else:
            khong_cho_phep.append(dong)
    return khong_cho_phep


def doc_tham_so() -> argparse.Namespace:
    bo_doc = argparse.ArgumentParser(
        description=(
            "So hai Git tree-ish; trả 0 và im chỉ khi mọi dòng xoá quay lại nguyên văn "
            "đúng phạm vi và không có dòng thêm ngoài danh sách cho phép."
        )
    )
    bo_doc.add_argument("--repo", type=Path, default=Path.cwd(), help="thư mục kho Git")
    bo_doc.add_argument(
        "--move",
        action="append",
        default=[],
        metavar="NGUỒN:ĐÍCH",
        help="cho phép ghép dòng nguyên văn từ tệp nguồn sang đúng tệp đích; được lặp",
    )
    bo_doc.add_argument(
        "--allow-added",
        action="append",
        default=[],
        metavar="TỆP::NGUYÊN_VĂN",
        help="cho phép đúng một dòng thêm ở đúng tệp; được lặp để tăng số lượng",
    )
    bo_doc.add_argument("cu", help="commit/tree-ish cũ")
    bo_doc.add_argument("moi", help="commit/tree-ish mới")
    return bo_doc.parse_args()


def main() -> int:
    tham_so = doc_tham_so()
    try:
        diff = lay_diff(tham_so.repo, tham_so.cu, tham_so.moi)
        cac_dong_xoa, cac_dong_them = tach_dong(diff)
        pham_vi = doc_pham_vi(tham_so.move)
        cho_phep = doc_danh_sach_cho_phep(tham_so.allow_added)
    except (OSError, UnicodeError, ValueError) as loi:
        print(f"LỖI: {loi}", file=sys.stderr)
        return 2

    if not cac_dong_xoa:
        print("LỖI: không có dòng bị xoá để so; từ chối kết quả rỗng", file=sys.stderr)
        return 2

    khong_quay_lai, da_dung = tim_dong_khong_quay_lai(
        cac_dong_xoa, cac_dong_them, pham_vi
    )
    them_khong_cho_phep = tim_dong_them_khong_cho_phep(cac_dong_them, da_dung, cho_phep)
    if not khong_quay_lai and not them_khong_cho_phep:
        return 0

    if not khong_quay_lai:
        print(
            f"DỜI_THUẦN=0 DÒNG_XÓA={len(cac_dong_xoa)} "
            f"DÒNG_KHÔNG_QUAY_LẠI=0 "
            f"DÒNG_THÊM_KHÔNG_CHO_PHÉP={len(them_khong_cho_phep)}"
        )
        for dong in them_khong_cho_phep:
            print(f"{dong.tep}:{dong.so_dong}: +{dong.noi_dung}")
        return 1

    print(
        f"DỜI_THUẦN=0 DÒNG_XÓA={len(cac_dong_xoa)} "
        f"DÒNG_KHÔNG_QUAY_LẠI={len(khong_quay_lai)}"
    )
    for dong in khong_quay_lai:
        print(f"{dong.tep}:{dong.so_dong}: -{dong.noi_dung}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
