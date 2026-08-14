import path from 'node:path';
import os from 'node:os';

/**
 * Cấu hình CHỈ chạy phía máy chủ.
 *
 * ⛔ TUYỆT ĐỐI không import tệp này từ component có "use client".
 * ⛔ Không có biến nào ở đây mang tiền tố NEXT_PUBLIC_ → Next.js sẽ KHÔNG
 *    nhúng bất cứ giá trị nào vào gói tải về trình duyệt.
 */

function soNguyen(ten: string, macDinh: number): number {
  const v = process.env[ten];
  if (!v) return macDinh;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : macDinh;
}

function soThuc(ten: string, macDinh: number): number {
  const v = process.env[ten];
  if (!v) return macDinh;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : macDinh;
}

export const CAU_HINH = {
  /** Đường dẫn lệnh claude. Đổi qua biến môi trường nếu máy khác. */
  lenhClaude: process.env.DUONG_DAN_CLAUDE ?? 'claude',

  /**
   * Thư mục làm việc của tiến trình claude con.
   *
   * 🔑 Owner chốt 14/08/2026: *«tôi không cần cách ly toàn quyền vì đây là app tôi
   *    THAY CHO TERMINAL thôi, nên terminal như nào app này như thế, full quyền cài sẵn»*
   * ⇒ Đứng ở **thư mục nhà**, đúng chỗ Owner mở terminal. Mọi thứ terminal thấy, app thấy.
   *
   * 🕳️ Bản trước đứng ở `/Users/Shared/phong-ban-ai-ws` để chặn tiến trình con dò ngược
   *    nuốt `~/CLAUDE.md`. Nay **CỐ Ý BỎ** rào đó — vì chính cái "nuốt" ấy là thứ làm
   *    terminal của Owner biết luật nhà. Cách ly khiến app trở thành bản terminal bị cắt xén.
   * 💸 Hệ quả biết trước, ⛔ không phải bất ngờ: nạp CLAUDE.md + hook + MCP làm mỗi lượt
   *    ĐẮT HƠN (đo thật: 0,067 → 0,249 USD; có lượt chạm 1,08 USD khi kéo 13 máy chủ MCP).
   *    Đó là **giá của việc giống terminal**, ⛔ không phải lỗi. Phanh giữ lại là
   *    `tranTienMoiLuot` — chặn ví, ⛔ không chặn quyền.
   */
  thuMucLamViec: process.env.THU_MUC_AGENT ?? os.homedir(),

  /** Mô hình. Mặc định sonnet cho rẻ — opus đắt gấp bội cho việc trò chuyện. */
  moHinh: process.env.MO_HINH_CLAUDE ?? 'sonnet',

  /** Trần tiền cho MỖI lượt. Chốt chặn cứng ở tầng tiến trình. */
  tranTienMoiLuot: soThuc('TRAN_TIEN_MOI_LUOT_USD', 0.5),

  /** Chặn mức dùng: số lượt tối đa mỗi phút cho mỗi khách. */
  soLuotMoiPhut: soNguyen('SO_LUOT_MOI_PHUT', 6),

  /** Trần lượt đang chạy đồng thời cho cả máy chủ. */
  tranDongThoi: soNguyen('TRAN_DONG_THOI', 3),

  /** Cắt tiến trình nếu quá lâu (mili-giây). */
  hanGio: soNguyen('HAN_GIO_MS', 120_000),

  /** Độ dài câu hỏi tối đa. */
  toiDaKyTu: soNguyen('TOI_DA_KY_TU', 4000),
} as const;

/**
 * Lời dặn hệ thống — ghim vai "nhân sự phòng ban" cho agent.
 * Vòng này agent KHÔNG có công cụ nào, nên nó thuần trò chuyện.
 */
export function loiDanHeThong(tenNhanSu: string, vai: string, phong: string): string {
  return [
    `Bạn đang đóng vai "${tenNhanSu}" — ${vai} thuộc phòng "${phong}" trong bộ máy AI của Eroca Thanh.`,
    'Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc.',
    'Không bịa số liệu. Không biết thì nói thẳng là chưa biết.',
    'Đây là khung chat trên trình duyệt: trả lời bằng văn xuôi, không dùng bảng.',
    // Chốt chặn: ⛔ không để lọt nếp "FROM/TO" của quy ước nội bộ vào khung chat.
    'Trả lời thẳng nội dung, KHÔNG thêm dòng tiêu đề kiểu "FROM: … / TO: …".',
  ].join(' ');
}
