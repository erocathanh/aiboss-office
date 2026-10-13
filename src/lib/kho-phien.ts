import fs from 'node:fs';
import path from 'node:path';
import { SO_O, oTrongTam } from './so-o';
import { AsyncLocalStorage } from 'node:async_hooks';
import { bindingOf, sameBinding, nextBinding, type WriteBinding } from '@/components/ung-dung/nap-bo-ghe';

/**
 * SỔ GHI "Ô NÀO ĐANG MỞ PHIÊN NÀO" — ghi XUỐNG ĐĨA.
 *
 * Vì sao phải xuống đĩa: Owner đóng tab / tắt trình duyệt / hôm sau mở lại
 * thì ô phải trở về ĐÚNG phiên cũ. Giữ trong bộ nhớ là khởi động lại mất sạch.
 * Một tệp JSON là đủ — ⛔ chưa cần cơ sở dữ liệu.
 *
 * ⭐ Mã phiên NẰM LẠI máy chủ. Trình duyệt chỉ nói "ô số mấy", ⛔ không tự bịa mã phiên được.
 */

function getThuMuc(): string {
  return process.env.AIBOSS_DATA_DIR || path.join(process.cwd(), '.trang-thai');
}

function getTep(): string {
  return path.join(getThuMuc(), 'o-phien.json');
}

export interface TrangThaiO {
  generation?: number;
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

// Carry origin through the existing runner, including its internal datO call.
// Only a successful owned write advances this token; never recapture on return.
const writeContext = new AsyncLocalStorage<{ slot: string; binding: WriteBinding }>();
export function withSlotBinding<T>(slot: string, binding: WriteBinding, run: (owned: () => WriteBinding) => T): T {
  const context = { slot, binding };
  return writeContext.run(context, () => run(() => context.binding));
}

function doc(): So {
  try {
    return JSON.parse(fs.readFileSync(getTep(), 'utf8')) as So;
  } catch {
    return {};
  }
}

function ghi(s: So): void {
  fs.mkdirSync(getThuMuc(), { recursive: true });
  // Ghi tệp tạm rồi đổi tên → ⛔ không để lại tệp JSON dở dang nếu tắt máy giữa chừng.
  // 🔴 Tên tệp tạm phải RIÊNG cho từng tiến trình + từng lần ghi.
  // Ca thật 29/08: hai máy chủ cùng sống (một cái mồ côi sau `bootout`) ⇒ cả hai dùng
  // chung đúng một tên `<tệp>.tam` ⇒ bên này đang ghi dở thì bên kia `rename` mất,
  // và sổ nhận nguyên một tệp JSON của người khác — hỏng IM LẶNG, ⛔ báo lỗi.
  const tep = getTep();
  const tam = `${tep}.${process.pid}.${Date.now()}.tam`;
  try {
    fs.writeFileSync(tam, JSON.stringify(s, null, 2), 'utf8');
    fs.renameSync(tam, tep);
  } catch (loi) {
    // ⛔ để lại tệp tạm nằm rác trong .trang-thai nếu ghi/đổi tên hỏng giữa chừng.
    try { fs.unlinkSync(tam); } catch { /* tệp chưa kịp sinh ra — bỏ qua */ }
    throw loi;
  }
}

export function layO(maO: string): TrangThaiO | null {
  return doc()[maO] ?? null;
}

export function layTatCa(): So {
  return doc();
}

export function datO(maO: string, maNhanSu: string | null, maPhien: string | null, expected?: WriteBinding): boolean {
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
    /**
     * 🔴 TRẢ VỀ `false` — hermes vòng 2, NGOÀI ĐỀ ②, 31/08.
     *    Bỏ qua thì vẫn đúng (ô ngoài tầm là sổ bẩn, KHÔNG phải người dùng sai).
     *    Nhưng bản trước trả `void` ⇒ người gọi KHÔNG có cách nào biết mắt xích
     *    «buộc lượt vào ô» vừa THẤT BẠI. Lượt vẫn chạy, chữ vẫn vào `.jsonl`,
     *    chỉ là app KHÔNG bao giờ gán nó vào đâu — đúng định nghĩa «lượt VÔ HÌNH».
     * 🔑 Từ chối là quyền của hàm. Từ chối mà KHÔNG nói ra thì mới là lỗi.
     */
    return false;
  }
  const s = doc();
  const cu = s[maO];
  const context = writeContext.getStore();
  const origin = expected ?? (context?.slot === maO ? context.binding : undefined);
  if (origin && !sameBinding(bindingOf(cu), origin)) return false;
  const next = nextBinding(bindingOf(cu), maNhanSu, maPhien);
  const giuMoc = cu?.ma_nhan_su === maNhanSu && cu?.ma_phien === maPhien ? (cu?.moc_ket_thuc ?? null) : null;
  s[maO] = { ma_nhan_su: maNhanSu, ma_phien: maPhien, generation: next.generation, cap_nhat: Date.now(), moc_ket_thuc: giuMoc };
  ghi(s);
  if (context?.slot === maO) context.binding = next;
  return true;
}

/** Ghi mốc "lượt của TA vừa chạy xong" — gọi NGAY SAU khi tiến trình con thoát. */
export function ghiMocKetThuc(maO: string, mocTep: number, expected?: WriteBinding): void {
  const s = doc();
  const cu = s[maO];
  if (!cu) return;
  if (expected && !sameBinding(bindingOf(cu), expected)) return;
  s[maO] = { ...cu, moc_ket_thuc: mocTep };
  ghi(s);
}
