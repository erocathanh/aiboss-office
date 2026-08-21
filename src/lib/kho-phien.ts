import fs from 'node:fs';
import path from 'node:path';
import { SO_O, oTrongTam } from './so-o';

/**
 * SỔ GHI "Ô NÀO ĐANG MỞ PHIÊN NÀO" — ghi XUỐNG ĐĨA.
 *
 * Vì sao phải xuống đĩa: Owner đóng tab / tắt trình duyệt / hôm sau mở lại
 * thì ô phải trở về ĐÚNG phiên cũ. Giữ trong bộ nhớ là khởi động lại mất sạch.
 * Một tệp JSON là đủ — ⛔ chưa cần cơ sở dữ liệu.
 *
 * ⭐ Mã phiên NẰM LẠI máy chủ. Trình duyệt chỉ nói "ô số mấy", ⛔ không tự bịa mã phiên được.
 */

const THU_MUC = path.join(process.cwd(), '.trang-thai');
const TEP = path.join(THU_MUC, 'o-phien.json');

export interface TrangThaiO {
  ma_nhan_su: string | null;
  ma_phien: string | null;
  cap_nhat: number;
  /**
   * Mốc sửa của tệp phiên NGAY SAU khi lượt của TA chạy xong.
   *
   * Dùng để phân biệt "tệp mới đổi vì CHÍNH TA vừa chạy" với "tệp mới đổi vì
   * NGƯỜI KHÁC đang chạy". Không có mốc này thì chỉ nhìn mtime sẽ thành ra
   * TỰ CHẶN CHÍNH MÌNH: gửi xong câu 1 là câu 2 bị coi là "đang chạy nơi khác".
   * Ghi xuống đĩa (⛔ không giữ trong RAM) để khởi động lại máy chủ vẫn còn.
   */
  moc_ket_thuc: number | null;
}

type So = Record<string, TrangThaiO>;

function doc(): So {
  try {
    return JSON.parse(fs.readFileSync(TEP, 'utf8')) as So;
  } catch {
    return {};
  }
}

function ghi(s: So): void {
  fs.mkdirSync(THU_MUC, { recursive: true });
  // Ghi tệp tạm rồi đổi tên → ⛔ không để lại tệp JSON dở dang nếu tắt máy giữa chừng.
  const tam = `${TEP}.tam`;
  fs.writeFileSync(tam, JSON.stringify(s, null, 2), 'utf8');
  fs.renameSync(tam, TEP);
}

export function layO(maO: string): TrangThaiO | null {
  return doc()[maO] ?? null;
}

export function layTatCa(): So {
  return doc();
}

export function datO(maO: string, maNhanSu: string | null, maPhien: string | null): void {
  /**
   * 🚧 CHẶN Ô NGOÀI TẦM — sổ ⛔ BAO GIỜ được đẻ lại mục mà app ⛔ vẽ nổi.
   *
   * 🐛 Ca thật 21/08: sổ giữ `o-9` suốt 6,4 ngày. Cổng đánh thức đọc SỔ nên trả **200**,
   *    còn trình duyệt chỉ dựng 6 ô nên ⛔ BAO GIỜ nhặt ⇒ mẩu chết sau 180 giây ⇒
   *    **tin mất im lặng**, mà mắt canh lại tưởng đã giao (nhận 200 ⇒ ghi «đã đọc»).
   * ⇒ Chặn TẠI ĐÂY, ⛔ ở 4 nơi gọi: chặn ở nguồn thì thêm nơi gọi mới cũng tự an toàn.
   * ⛔ ⛔ ném lỗi và ⛔ trả 409 — ô ngoài tầm là chuyện SỔ BẨN, ⛔ phải người dùng làm sai.
   *    Ném lỗi ở đây là làm chết một lượt chat thật vì một mục rác. Bỏ qua + ghi log là đủ.
   */
  if (!oTrongTam(maO)) {
    console.warn(`[kho-phien] ⛔ BỎ QUA ghi sổ cho ô NGOÀI TẦM «${maO}» (app chỉ có ${SO_O} ô).`);
    return;
  }
  const s = doc();
  const cu = s[maO];
  // Đổi sang phiên KHÁC thì mốc kết thúc cũ hết giá trị.
  const giuMoc = cu?.ma_phien === maPhien ? (cu?.moc_ket_thuc ?? null) : null;
  s[maO] = { ma_nhan_su: maNhanSu, ma_phien: maPhien, cap_nhat: Date.now(), moc_ket_thuc: giuMoc };
  ghi(s);
}

/** Ghi mốc "lượt của TA vừa chạy xong" — gọi NGAY SAU khi tiến trình con thoát. */
export function ghiMocKetThuc(maO: string, mocTep: number): void {
  const s = doc();
  const cu = s[maO];
  if (!cu) return;
  s[maO] = { ...cu, moc_ket_thuc: mocTep };
  ghi(s);
}
