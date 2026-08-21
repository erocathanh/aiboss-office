/**
 * 🔢 SỐ Ô CHAT — **MỘT NGUỒN DUY NHẤT** cho cả trình duyệt lẫn máy chủ.
 *
 * 🐛 CA THẬT 21/08/2026 — «ô ngoài tầm ⇒ TIN MẤT IM LẶNG»:
 *   trình duyệt biết 6 ô · MÁY CHỦ ⛔ BIẾT GÌ · sổ ô giữ mục cũ mãi
 *   ⇒ chuông gửi ghế ở ô ngoài tầm: cổng trả **200**, trình duyệt ⛔ BAO GIỜ nhặt,
 *     mẩu chết sau 180 giây ⇒ **tin biến mất, ⛔ ai được báo**.
 *   Đo được: `o-9 = claude-501` nằm trong sổ, cập nhật lần cuối 15/08 — **6,4 ngày** trước.
 *   Mắt canh nhận 200 ⇒ ghi mốc «đã đọc» ⇒ tin mất VĨNH VIỄN.
 *
 * 🔴 VÌ SAO TỆP RIÊNG, ⛔ NHÉT VÀO `cau-hinh.ts` (đề bài ban đầu bảo thế):
 *   `cau-hinh.ts` mở đầu bằng `import path from 'node:path'` + `node:os`, và chính nó ghi
 *   luật cứng: *«⛔ TUYỆT ĐỐI ⛔ import tệp này từ component có "use client"»*.
 *   `UngDung.tsx` LÀ `'use client'` ⇒ nhập `cau-hinh` vào đó là **kéo mã Node vào bó trình duyệt**
 *   ⇒ vỡ bản dựng hoặc phình bó, và phá đúng luật viết trong tệp đó.
 *   ⇒ Tệp này **⛔ nhập gì cả** ⇒ hai bên dùng chung an toàn. Vẫn đạt mục tiêu «một nguồn».
 *
 * ⚠️ Đổi số ở đây thì PHẢI đổi CSS lưới (`mau09.css` `.luoi.bc-*`) — bố cục chỉ vẽ tới 6 khung.
 *    ⛔ ĐỪNG nâng lên 9 để «cho o-9 vào tầm»: thêm ô là thêm khung, ⛔ phải sửa một con số.
 */
export const SO_O = 6;

/** Mã ô có nằm TRONG TẦM app vẽ được ⛔ không. Nhận đúng dạng `o-<số>`, đếm từ 1. */
export function oTrongTam(maO: string): boolean {
  const m = /^o-(\d+)$/.exec(maO);
  if (!m) return false;
  const n = Number(m[1]);
  return n >= 1 && n <= SO_O;
}
