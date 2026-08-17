import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CAU_HINH } from './cau-hinh';
import { maHoaDuongDan, thuMucAgent } from './doc-phien';

const GOC_KHO = path.join(CAU_HINH.thuMucLamViec, '.claude', 'projects');

/**
 * 🧬 GỐC TÍCH — sổ gốc gác của một phiên fork.
 *
 * 🔴 VÌ SAO PHẢI CÓ (đo tại nguồn 15/08, ⛔ không suy):
 *   bản ghi `.jsonl` **⛔ KHÔNG tự khai phiên cha** — `parentSessionId` · `sourceSessionId`
 *   · `resumedFrom` đều **0 dòng** trên tệp 9.616 dòng.
 *   ⇒ ⛔ Không có sổ do APP giữ thì máy **⛔ KHÔNG BAO GIỜ** chứng minh được nó đã tra đủ chuỗi.
 *   ⇒ Mọi câu «anh chưa nói» sẽ là **⛔ không có cơ sở**.
 *
 * 🔴 Và fork **⛔ KHÔNG bê toàn bộ**: đo được **805/9.616 dòng = 8,4%** — mất 91,6%.
 *   Bản ở kho NHÀ là **đối chứng duy nhất** giữ phần còn lại.
 */
export interface MatXich {
  /** Mã phiên cha. */
  ma_cha: string;
  /** Đường dẫn tệp bản ghi cha LÚC FORK. */
  duong_dan_cha: string;
  /** Số dòng của tệp cha tại thời điểm fork — RANH GIỚI đời của nhánh này. */
  moc_cat: number;
  /**
   * Hash 12 ký tự của ĐÚNG `moc_cat` DÒNG ĐẦU tệp cha.
   *
   * ⭐ Hash PHẦN ĐẦU, ⛔ KHÔNG hash cả tệp — vì cha có thể CÒN SỐNG và dài thêm.
   *    Hash cả tệp thì đổi theo, mất dấu. Hash `moc_cat` dòng đầu là **BẤT BIẾN mãi mãi**.
   */
  hash_dau: string;
  /** Mốc giờ tạo mắt xích (ISO). */
  luc: string;
}

export interface GocTich {
  ma_phien: string;
  ghe: string;
  /** Chuỗi tổ tiên, GẦN → XA (cha trực tiếp trước, gốc sâu nhất cuối). */
  chuoi: MatXich[];
}

function tepGocTich(maNhanSu: string): string {
  return path.join(thuMucAgent(maNhanSu), '.goc-tich.json');
}

export function docGocTich(maNhanSu: string): Record<string, GocTich> {
  try {
    return JSON.parse(fs.readFileSync(tepGocTich(maNhanSu), 'utf8')) as Record<string, GocTich>;
  } catch {
    return {};
  }
}

function ghiGocTich(maNhanSu: string, s: Record<string, GocTich>): void {
  fs.mkdirSync(thuMucAgent(maNhanSu), { recursive: true });
  fs.writeFileSync(tepGocTich(maNhanSu), JSON.stringify(s, null, 2), 'utf8');
}

/** Đếm dòng + hash `n` dòng đầu — đọc theo luồng, ⛔ KHÔNG nạp cả tệp 21 MB vào bộ nhớ. */
export function doTep(duongDan: string, n?: number): { soDong: number; hashDau: string } {
  const bam = crypto.createHash('sha256');
  let soDong = 0;
  const fd = fs.openSync(duongDan, 'r');
  try {
    const dem = Buffer.alloc(1 << 20);
    let du = '';
    let doc = 0;
    while ((doc = fs.readSync(fd, dem, 0, dem.length, null)) > 0) {
      du += dem.subarray(0, doc).toString('utf8');
      let k: number;
      while ((k = du.indexOf('\n')) >= 0) {
        const dong = du.slice(0, k + 1);
        du = du.slice(k + 1);
        soDong += 1;
        if (n === undefined || soDong <= n) bam.update(dong);
        if (n !== undefined && soDong >= n) return { soDong, hashDau: bam.digest('hex').slice(0, 12) };
      }
    }
    if (du.length) { soDong += 1; if (n === undefined || soDong <= n) bam.update(du); }
  } finally {
    fs.closeSync(fd);
  }
  return { soDong, hashDau: bam.digest('hex').slice(0, 12) };
}

/**
 * Ghi một mắt xích mới. Nếu phiên CHA đã có gốc tích thì NỐI chuỗi của nó vào sau
 * ⇒ fork chồng fork vẫn truy được tới gốc sâu nhất (⛔ không chỉ một con trỏ).
 */
export function themMatXich(
  maNhanSu: string,
  maPhienMoi: string,
  maCha: string,
  duongDanCha: string,
): GocTich {
  const { soDong, hashDau } = doTep(duongDanCha);
  const { hashDau: hashTaiMoc } = doTep(duongDanCha, soDong);
  const so = docGocTich(maNhanSu);
  const chuoiCha = so[maCha]?.chuoi ?? [];
  const gt: GocTich = {
    ma_phien: maPhienMoi,
    ghe: maNhanSu,
    chuoi: [
      { ma_cha: maCha, duong_dan_cha: duongDanCha, moc_cat: soDong, hash_dau: hashTaiMoc || hashDau, luc: new Date().toISOString() },
      ...chuoiCha,
    ],
  };
  so[maPhienMoi] = gt;
  ghiGocTich(maNhanSu, so);
  return gt;
}

export type TrangThaiMatXich = 'OK' | 'MAT_TEP' | 'THIEU_DONG' | 'HASH_LECH';

/**
 * Kiểm ĐỘ PHỦ của chuỗi — **3 phép mỗi mắt xích**, ⛔ không phải niềm tin:
 *   ① tệp còn đọc được?  ② còn đủ `moc_cat` dòng?  ③ hash phần đầu còn khớp?
 *
 * ⚠️ Đây là thứ quyết định máy được phép nói «⛔ không có» hay chỉ được nói «chưa chắc».
 */
export function kiemChuoi(gt: GocTich | null): {
  du: boolean;
  mat_xich: { ma: string; trang_thai: TrangThaiMatXich; duong_dan: string }[];
} {
  if (!gt) return { du: false, mat_xich: [] };
  const ds = gt.chuoi.map((m) => {
    let tt: TrangThaiMatXich = 'OK';
    try {
      const d = doTep(m.duong_dan_cha, m.moc_cat);
      if (d.soDong < m.moc_cat) tt = 'THIEU_DONG';
      else if (d.hashDau !== m.hash_dau) tt = 'HASH_LECH';
    } catch {
      tt = 'MAT_TEP';
    }
    return { ma: m.ma_cha, trang_thai: tt, duong_dan: m.duong_dan_cha };
  });
  return { du: ds.length > 0 && ds.every((x) => x.trang_thai === 'OK'), mat_xich: ds };
}

/** Kho phiên của một ghế. */
export function khoCua(maNhanSu: string): string {
  return path.join(GOC_KHO, maHoaDuongDan(thuMucAgent(maNhanSu)));
}
