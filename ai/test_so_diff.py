#!/usr/bin/env python3
"""Nghiệm thu công cụ so-diff dời-thuần."""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


CONG_CU = Path(__file__).with_name("so-diff.py")


class SoDiffTest(unittest.TestCase):
    def tao_kho(self) -> tuple[Path, str]:
        thu_muc_tam = tempfile.TemporaryDirectory()
        self.addCleanup(thu_muc_tam.cleanup)
        kho = Path(thu_muc_tam.name)
        subprocess.run(["git", "init", "-q", kho], check=True)
        subprocess.run(["git", "-C", kho, "config", "user.name", "Test"], check=True)
        subprocess.run(["git", "-C", kho, "config", "user.email", "test@example.invalid"], check=True)
        (kho / "ma.ts").write_text(
            "function mot() {\n  return 1;\n}\n\nfunction hai() {\n  return 2;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "add", "ma.ts"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "goc"], check=True)
        goc = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()
        return kho, goc

    def chay(
        self, kho: Path, goc: str, moi: str, *tham_so: str
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(CONG_CU), "--repo", str(kho), *tham_so, goc, moi],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_cay_di_chuyen_thuan_tra_0_va_im(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function hai() {\n  return 2;\n}\n\nfunction mot() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "doi vi tri"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 0, ket_qua.stderr)
        self.assertEqual(ket_qua.stdout, "")
        self.assertEqual(ket_qua.stderr, "")

    def test_sua_dung_mot_ky_tu_tra_khac_0_va_chi_ra_dung_dong(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function hai() {\n  return 2;\n}\n\nfunction mot() {\n  return 9;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "doi mot ky tu"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertEqual(
            ket_qua.stdout,
            "DỜI_THUẦN=0 DÒNG_XÓA=4 DÒNG_KHÔNG_QUAY_LẠI=1\n"
            "ma.ts:2: -  return 1;\n",
        )
        self.assertEqual(ket_qua.stderr, "")

    def test_hai_cay_giong_nhau_bi_tu_choi(self) -> None:
        kho, goc = self.tao_kho()

        ket_qua = self.chay(kho, goc, goc)

        self.assertEqual(ket_qua.returncode, 2)
        self.assertEqual(ket_qua.stdout, "")
        self.assertIn("không có dòng bị xoá để so", ket_qua.stderr)

    def test_chi_them_dong_cung_bi_tu_choi(self) -> None:
        kho, goc = self.tao_kho()
        with (kho / "ma.ts").open("a", encoding="utf-8") as tep:
            tep.write("export const moi = true;\n")
        subprocess.run(["git", "-C", kho, "commit", "-qam", "chi them"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 2)
        self.assertEqual(ket_qua.stdout, "")
        self.assertIn("không có dòng bị xoá để so", ket_qua.stderr)

    def test_dong_trung_nhau_duoc_dem_theo_so_ban_sao(self) -> None:
        kho, _ = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function mot() {\n  return 1;\n}\n\nfunction hai() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "tao dong trung"], check=True)
        nen = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()
        (kho / "ma.ts").write_text(
            "function hai() {\n  return 1;\n}\n\nfunction mot() {\n  return 9;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "bot mot ban sao"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, nen, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertIn("DÒNG_KHÔNG_QUAY_LẠI=1", ket_qua.stdout)
        self.assertIn("-  return 1;", ket_qua.stdout)

    def test_nguyen_van_khong_cho_doi_thut_le(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function hai() {\n\treturn 2;\n}\n\nfunction mot() {\n    return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "doi vi tri va thut le"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertIn("ma.ts:2: -  return 1;", ket_qua.stdout)

    def test_dong_trang_bi_bot_khong_duoc_bo_qua(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function hai() {\n  return 2;\n}\nfunction mot() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "bot dong trang"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertIn("ma.ts:4: -", ket_qua.stdout)

    def test_newline_cuoi_tep_la_mot_phan_cua_nguyen_van(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "function hai() {\n  return 2;\n}\n\nfunction mot() {\n  return 1;\n}",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "bo newline cuoi"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertIn("ma.ts:3: -}", ket_qua.stdout)

    def test_doi_vi_tri_kem_dong_moi_tuy_y_bi_tu_choi(self) -> None:
        kho, goc = self.tao_kho()
        (kho / "ma.ts").write_text(
            "const moi = 3;\nfunction hai() {\n  return 2;\n}\n\nfunction mot() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "doi vi tri va them"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        ket_qua = self.chay(kho, goc, moi)

        self.assertEqual(ket_qua.returncode, 1)
        self.assertIn("DÒNG_THÊM_KHÔNG_CHO_PHÉP=1", ket_qua.stdout)
        self.assertIn("ma.ts:1: +const moi = 3;", ket_qua.stdout)

    def test_import_moi_phai_duoc_cho_phep_dung_tep_va_nguyen_van(self) -> None:
        kho, goc = self.tao_kho()
        dong_import = 'import type { Kieu } from "./kieu";'
        (kho / "ma.ts").write_text(
            f"{dong_import}\nfunction hai() {{\n  return 2;\n}}\n\n"
            "function mot() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "them import bat buoc"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        khong_cho = self.chay(kho, goc, moi)
        cho_sai_tep = self.chay(kho, goc, moi, "--allow-added", f"sai.ts::{dong_import}")
        cho_dung = self.chay(kho, goc, moi, "--allow-added", f"ma.ts::{dong_import}")

        self.assertEqual(khong_cho.returncode, 1)
        self.assertEqual(cho_sai_tep.returncode, 1)
        self.assertEqual(cho_dung.returncode, 0, cho_dung.stdout + cho_dung.stderr)
        self.assertEqual(cho_dung.stdout + cho_dung.stderr, "")

    def test_provenance_mac_dinh_theo_tep_va_pham_vi_di_chuyen_phai_khai(self) -> None:
        kho, _ = self.tao_kho()
        (kho / "a.ts").write_text("const tuA = 1;\n", encoding="utf-8")
        (kho / "b.ts").write_text("const tuB = 2;\n", encoding="utf-8")
        subprocess.run(["git", "-C", kho, "add", "a.ts", "b.ts"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "them hai tep"], check=True)
        nen = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()
        (kho / "a.ts").write_text("const tuB = 2;\n", encoding="utf-8")
        (kho / "b.ts").write_text("const tuA = 1;\n", encoding="utf-8")
        subprocess.run(["git", "-C", kho, "commit", "-qam", "doi cho giua hai tep"], check=True)
        moi = subprocess.check_output(["git", "-C", kho, "rev-parse", "HEAD"], text=True).strip()

        mac_dinh = self.chay(kho, nen, moi)
        co_pham_vi = self.chay(
            kho,
            nen,
            moi,
            "--move",
            "a.ts:b.ts",
            "--move",
            "b.ts:a.ts",
        )

        self.assertEqual(mac_dinh.returncode, 1)
        self.assertIn("a.ts:1: -const tuA = 1;", mac_dinh.stdout)
        self.assertIn("b.ts:1: -const tuB = 2;", mac_dinh.stdout)
        self.assertEqual(co_pham_vi.returncode, 0, co_pham_vi.stdout + co_pham_vi.stderr)
        self.assertEqual(co_pham_vi.stdout + co_pham_vi.stderr, "")

    def test_dong_xoa_mo_dau_hai_gach_khong_duoc_nuot_cac_dong_sau(self) -> None:
        kho, _ = self.tao_kho()
        (kho / "x.txt").write_text("alpha\nbeta\n", encoding="utf-8")
        (kho / "y.txt").write_text(
            "giu-dong-nay\n"
            "-- gach ngang kieu SQL\n"
            "KIEM_TRA_QUYEN = True\n"
            "MAT_KHAU_MAC_DINH\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "add", "x.txt", "y.txt"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "them vat thu"], check=True)
        nen = subprocess.check_output(
            ["git", "-C", kho, "rev-parse", "HEAD"], text=True
        ).strip()
        (kho / "sub").mkdir()
        (kho / "sub" / "x.txt").write_text("alpha\nbeta\n", encoding="utf-8")
        (kho / "x.txt").unlink()
        (kho / "y.txt").write_text("giu-dong-nay\n", encoding="utf-8")
        subprocess.run(["git", "-C", kho, "add", "-A"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "lam mat ba dong"], check=True)
        moi = subprocess.check_output(
            ["git", "-C", kho, "rev-parse", "HEAD"], text=True
        ).strip()

        ket_qua = self.chay(kho, nen, moi, "--move", "x.txt:sub/x.txt")

        self.assertEqual(ket_qua.returncode, 1)
        self.assertEqual(
            ket_qua.stdout,
            "DỜI_THUẦN=0 DÒNG_XÓA=5 DÒNG_KHÔNG_QUAY_LẠI=3\n"
            "y.txt:2: --- gach ngang kieu SQL\n"
            "y.txt:3: -KIEM_TRA_QUYEN = True\n"
            "y.txt:4: -MAT_KHAU_MAC_DINH\n",
        )
        self.assertEqual(ket_qua.stderr, "")

    def test_doi_thuan_that_co_dong_hai_gach_tra_0_va_im(self) -> None:
        kho, _ = self.tao_kho()
        (kho / "a.sql").write_text(
            "-- ghi chu SQL\nSELECT 1;\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "add", "a.sql"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "them sql"], check=True)
        nen = subprocess.check_output(
            ["git", "-C", kho, "rev-parse", "HEAD"], text=True
        ).strip()
        (kho / "sub").mkdir()
        (kho / "sub" / "a.sql").write_text(
            "-- ghi chu SQL\nSELECT 1;\n",
            encoding="utf-8",
        )
        (kho / "a.sql").unlink()
        subprocess.run(["git", "-C", kho, "add", "-A"], check=True)
        subprocess.run(["git", "-C", kho, "commit", "-qm", "doi tep"], check=True)
        moi = subprocess.check_output(
            ["git", "-C", kho, "rev-parse", "HEAD"], text=True
        ).strip()

        ket_qua = self.chay(kho, nen, moi, "--move", "a.sql:sub/a.sql")

        self.assertEqual(ket_qua.returncode, 0, ket_qua.stdout + ket_qua.stderr)
        self.assertEqual(ket_qua.stdout + ket_qua.stderr, "")

    def test_pham_vi_sai_hinh_dang_va_thieu_dau_moi_bi_tu_choi(self) -> None:
        kho, goc = self.tao_kho()

        sai_hinh_dang = self.chay(kho, goc, goc, "--move", "ma.ts")
        thieu_nguon = self.chay(kho, goc, goc, "--move", ":ma.ts")
        thieu_dich = self.chay(kho, goc, goc, "--move", "ma.ts:")

        for ket_qua in (sai_hinh_dang, thieu_nguon, thieu_dich):
            self.assertEqual(ket_qua.returncode, 2)
            self.assertEqual(ket_qua.stdout, "")
            self.assertIn("LỖI: phạm vi", ket_qua.stderr)

    def test_allow_added_dem_da_tap_moi_khai_chi_cap_mot_ban_sao(self) -> None:
        kho, goc = self.tao_kho()
        dong_moi = "const moi = 3;"
        (kho / "ma.ts").write_text(
            f"{dong_moi}\n{dong_moi}\n"
            "function hai() {\n  return 2;\n}\n\n"
            "function mot() {\n  return 1;\n}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", kho, "commit", "-qam", "them hai ban sao"], check=True)
        moi = subprocess.check_output(
            ["git", "-C", kho, "rev-parse", "HEAD"], text=True
        ).strip()

        cho_mot = self.chay(
            kho, goc, moi, "--allow-added", f"ma.ts::{dong_moi}"
        )
        cho_hai = self.chay(
            kho,
            goc,
            moi,
            "--allow-added",
            f"ma.ts::{dong_moi}",
            "--allow-added",
            f"ma.ts::{dong_moi}",
        )

        self.assertEqual(cho_mot.returncode, 1)
        self.assertIn("DÒNG_THÊM_KHÔNG_CHO_PHÉP=1", cho_mot.stdout)
        self.assertEqual(cho_hai.returncode, 0, cho_hai.stdout + cho_hai.stderr)
        self.assertEqual(cho_hai.stdout + cho_hai.stderr, "")

    def test_allow_added_sai_hinh_dang_va_thieu_tep_bi_tu_choi(self) -> None:
        kho, goc = self.tao_kho()

        sai_hinh_dang = self.chay(kho, goc, goc, "--allow-added", "ma.ts")
        thieu_tep = self.chay(kho, goc, goc, "--allow-added", "::noi dung")

        for ket_qua in (sai_hinh_dang, thieu_tep):
            self.assertEqual(ket_qua.returncode, 2)
            self.assertEqual(ket_qua.stdout, "")
            self.assertIn("LỖI: dòng cho phép", ket_qua.stderr)


if __name__ == "__main__":
    unittest.main()
