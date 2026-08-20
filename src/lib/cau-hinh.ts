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

  /**
   * Mô hình. Owner chốt 14/08/2026: ghế phải chạy **OPUS**, ⛔ không phải sonnet —
   * *«như em»* (đúng thứ Owner đang dùng ở terminal).
   *
   * ⭐ Dùng BÍ DANH `opus`, ⛔ đừng ghim tên đầy đủ: bí danh luôn trỏ bản opus MỚI NHẤT.
   *    Ghim tên đầy đủ = đóng băng ở một bản; bản mới ra thì ghế vẫn chạy bản cũ mà
   *    ⛔ KHÔNG ai biết — hỏng âm thầm, đúng kiểu khó phát hiện nhất.
   * 💸 Đắt hơn sonnet nhiều. Owner biết trước và chọn vậy — ⛔ đừng tự hạ xuống cho rẻ.
   */
  moHinh: process.env.MO_HINH_CLAUDE ?? 'opus',

  /**
   * Mức nỗ lực suy nghĩ — Owner chốt: CAO NHẤT.
   * Mức hợp lệ (đo tại `claude --help`, bản 2.1.232): low · medium · high · xhigh · max.
   */
  mucNoLuc: process.env.MUC_NO_LUC ?? 'max',

  /**
   * Trần tiền cho MỖI lượt. **0 = KHÔNG GIỚI HẠN** (Owner chốt 14/08/2026).
   *
   * 🔴 Vì sao bỏ: trần 0,5 USD CẮT NGANG ghế TỔNG GIÁM ĐỐC giữa lúc nó đang rà tình hình —
   *    đo thật: một lượt «nắm tình hình» ăn 1.176.716 token, lượt sau 210.342 token
   *    rồi báo «Reached maximum budget ($0.5)». Việc chưa xong mà đã bị chặt.
   *
   * ⚠️ ĐỔI LẠI: gỡ trần là gỡ **phanh cuối cùng ở tầng tiến trình**. Một lượt chạy hoang
   *    (agent lặp vòng, nuốt tệp khổng lồ) sẽ chạy tới khi nào xong mới thôi.
   *    Thứ còn giữ ta: `soLuotMoiPhut` (chặn dồn lượt) + số token hiện ngay dưới ô chat
   *    + nút dừng. ⇒ **Người canh thay máy canh** — nhìn số, thấy lạ thì dừng tay.
   */
  tranTienMoiLuot: soThuc('TRAN_TIEN_MOI_LUOT_USD', 0),

  /** Chặn mức dùng: số lượt tối đa mỗi phút cho mỗi khách. */
  soLuotMoiPhut: soNguyen('SO_LUOT_MOI_PHUT', 6),

  /** Trần lượt đang chạy đồng thời cho cả máy chủ. */
  tranDongThoi: soNguyen('TRAN_DONG_THOI', 3),

  /**
   * Ngưỡng **IM LẶNG** (mili-giây) — chém ghế khi nó ⛔ không nhả chữ nào suốt bấy lâu.
   *
   * ⚠️ ĐỌC KỸ: đây ⛔ KHÔNG phải trần tổng thời gian. Chừng nào ghế còn tuôn chữ thì
   *    đồng hồ còn được đặt lại (`chay-agent.ts` → `datLaiDongHo`), chạy bao lâu cũng được.
   *
   * 🔴 Vì sao đổi (14/08): bản cũ hẹn CỨNG 120 giây kể từ lúc sinh tiến trình. Đo tại
   *    bản ghi ghế TỔNG GIÁM ĐỐC — hai lượt khác hẳn đề tài cùng chết ở **117 giây**, trong đó
   *    có đúng câu MỞ MÀN của kịch bản quay. Ghế nặng (opus + nỗ lực cao nhất + nạp trọn
   *    luật nhà) đọc vài phút là bình thường; chính kịch bản ghi *«mỗi ô 30 giây–3 phút»*.
   *    ⇒ Trần cứng biến việc-chạy-đúng thành lỗi, mà lời báo lỗi lại đổ cho câu hỏi của
   *    người dùng ⇒ Owner đi sửa nhầm chỗ. Đây là kiểu hỏng đắt nhất: **máy nói sai thủ phạm**.
   * 📌 10 phút im lặng = treo thật (kể cả khi đang chạy một lệnh dài không in gì).
   */
  hanGio: soNguyen('HAN_GIO_MS', 600_000),

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
