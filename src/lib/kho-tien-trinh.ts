/**
 * 📇 SỔ TIẾN TRÌNH ĐANG CHẠY — mỗi ô nhiều nhất một `claude`.
 *
 * VÌ SAO CÓ TỆP NÀY (17/08/2026 · claude-phong-ban-pm):
 * Trước đây "dừng việc" xảy ra khi TRÌNH DUYỆT rời đi — đóng tab, khoá màn, rớt
 * wifi đều bắn `SIGTERM` vào `claude`. Owner tắt trình duyệt là việc chết dở.
 * ⇒ Nay bỏ nét đó: việc chạy tiếp, ⛔ không phụ thuộc ai đang xem.
 *
 * Nhưng bỏ mà ⛔ không thay gì thì mất luôn nút DỪNG — chữa một lỗi lấy một lỗi.
 * ⇒ Sổ này giữ pid theo ô, để nút Dừng (và CHỈ nút Dừng) còn giết được.
 *
 * 📌 Cùng một họ nguyên tắc với `xoa_lien_ket` ở `/api/o`: **phân biệt Ý ĐỊNH,
 *    ⛔ đừng đoán ý từ một tín hiệu mơ hồ.** "Mất kết nối" ⛔ KHÔNG phải "tôi muốn dừng".
 *
 * ⚠️ Sổ nằm trong BỘ NHỚ: khởi động lại app là mất. Chấp nhận ở bước này —
 *    tiến trình con cũng chết theo máy chủ, nên hai thứ mất cùng nhau, ⛔ không lệch pha.
 *    (Mức sau: cho tiến trình sống tách hẳn ⇒ lúc đó sổ PHẢI xuống đĩa.)
 */
export interface ViecDangChay {
  pid: number;
  ma_nhan_su: string;
  bat_dau: number;
}

const SO = new Map<string, ViecDangChay>();

export function dangKyViec(maO: string, pid: number, maNhanSu: string): void {
  SO.set(maO, { pid, ma_nhan_su: maNhanSu, bat_dau: Date.now() });
}

export function xoaViec(maO: string, pid?: number): void {
  const v = SO.get(maO);
  if (!v) return;
  // ⛔ Chỉ xoá đúng tiến trình của mình — tránh xoá nhầm việc mới vừa thay chỗ.
  if (pid !== undefined && v.pid !== pid) return;
  SO.delete(maO);
}

export function layViec(maO: string): ViecDangChay | null {
  return SO.get(maO) ?? null;
}

/**
 * 📋 LIỆT KÊ MỌI Ô ĐANG CHẠY — CHỈ ĐỌC, ⛔ đụng vào tiến trình nào.
 *
 * 🐛 VÌ SAO CÓ (P0-7/P1-7, 31/08/2026): trình duyệt tải lại là MẤT SẠCH cờ «đang chạy»
 *    — nó nằm trong bộ nhớ của trang. Hậu quả nặng nhất ⛔ phải cái đèn, mà là **NÚT DỪNG**:
 *    sau mỗi lần F5, Owner ⛔ CÒN CÁCH NÀO dừng một ghế đang chạy và đang tiêu tiền.
 * 📌 Sổ này là NGUỒN SỰ THẬT vì nó nằm ở MÁY CHỦ — trang tải lại bao nhiêu lần cũng ⛔ đụng tới.
 * ⚠️ GIỚI HẠN PHẢI BIẾT: sổ nằm trong BỘ NHỚ tiến trình máy chủ. Máy chủ khởi lại thì sổ rỗng —
 *    nhưng lúc đó mấy tiến trình con cũng chết theo, nên sổ rỗng là ĐÚNG SỰ THẬT, ⛔ phải mất dữ liệu.
 */
export function dsViec(): Array<{ ma_o: string } & ViecDangChay> {
  return [...SO.entries()].map(([ma_o, v]) => ({ ma_o, ...v }));
}

/** Giết việc của một ô. Trả về `true` nếu THẬT SỰ có việc để giết. */
export function gietViec(maO: string): { da_giet: boolean; pid?: number } {
  const v = SO.get(maO);
  if (!v) return { da_giet: false };
  try {
    process.kill(v.pid, 'SIGTERM');
  } catch {
    /* đã chết sẵn — coi như xong, ⛔ không báo lỗi cho người bấm */
  }
  SO.delete(maO);
  return { da_giet: true, pid: v.pid };
}
