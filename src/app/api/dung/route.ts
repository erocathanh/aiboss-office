import { NextRequest } from 'next/server';
import { gietViec, dsViec, giayTuEp } from '@/lib/kho-tien-trinh';
import { batMotLan } from '@/lib/khoi-dong-nen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 👁 GET /api/dung → «ô nào ĐANG CHẠY» — **CHỈ ĐỌC, ⛔ giết gì cả**.
 *
 * 🐛 VÌ SAO CÓ (31/08/2026): cờ «đang chạy» sống trong bộ nhớ TRANG. Owner bấm F5 là mất,
 *    và mất theo nó là **NÚT DỪNG** — ⛔ còn cách nào chặn một ghế đang tiêu tiền.
 *    Đèn nháy chỉ khó chịu; mất phanh là mất quyền kiểm soát.
 * 📌 Đặt CHUNG cổng với POST là cố ý: POST là «giết», GET là «nhìn». Cùng một sự thật,
 *    hai động từ — tách ra hai cổng thì mai kia hai bên lệch nhau mà ⛔ ai biết.
 * ⚠️ Cổng này ⛔ BAO GIỜ được giết tiến trình. Muốn giết thì đi cửa POST, và phải KHAI ý định.
 */
export async function GET() {
  batMotLan(); // 🚀 bật bộ chạy nền MỘT LẦN — cửa này chạy runtime 'nodejs'
  const ds = dsViec();
  return Response.json({
    dang_chay: ds.map((v) => ({
      ma_o: v.ma_o,
      ma_nhan_su: v.ma_nhan_su,
      // 🔢 Số hiệu CHỈ ĐỂ HIỆN — đây là chỗ dùng hợp lệ duy nhất của nó: Owner cần một con số
      //    để tự gõ `kill` khi app bó tay. Mọi QUYẾT ĐỊNH ở máy chủ đi bằng tay cầm.
      pid: v.pid_de_hien_thi,
      bat_dau: v.bat_dau,
      chay_duoc_giay: Math.round((Date.now() - v.bat_dau) / 1000),
    })),
    // ⛔ để bên đọc phải suy từ «mảng rỗng» — rỗng vì ⛔ ai chạy, hay rỗng vì cửa hỏng ⛔
    so_o_dang_chay: ds.length,
  });
}

/**
 * 🛑 POST /api/dung  { ma_o }  → DỪNG THẬT việc đang chạy của một ô.
 *
 * Đây là chỗ DUY NHẤT được phép giết tiến trình `claude`.
 * Trước 17/08/2026, việc bị giết mỗi khi trình duyệt rời đi (đóng tab · khoá màn ·
 * rớt wifi) — Owner tắt trình duyệt là mất việc đang chạy dở. Nay tách bạch:
 *   · rời màn hình  ⇒ việc CHẠY TIẾP
 *   · bấm nút Dừng  ⇒ việc DỪNG
 * Ý định phải được KHAI, ⛔ không suy từ một tín hiệu mơ hồ.
 */
export async function POST(req: NextRequest) {
  batMotLan(); // 🚀 bật bộ chạy nền MỘT LẦN — cửa này chạy runtime 'nodejs'
  let than: { ma_o?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' ? than.ma_o.trim() : '';
  if (!/^o-\d+$/.test(maO)) return Response.json({ loi: 'Mã ô không hợp lệ.' }, { status: 400 });

  /**
   * 🔴 ĐÃ BỎ `layViec(maO)` (@app-pm chốt 02/09). Nó từng ở đây CHỈ để lấy `ma_nhan_su` cho phản hồi,
   *    và tình cờ kéo theo `quetRac` — chính «tác dụng phụ» @phong-ban-pm bắt lúc 10:12.
   *    Nay `gietViec` tự trả `ma_nhan_su`, nên lời gọi này hết lý do tồn tại.
   * 📌 Gỡ nốt sợi dây thay vì để nó lủng lẳng: một tác dụng phụ đã hết việc mà vẫn nằm đó thì
   *    người sau sẽ tưởng nó CÓ việc, và sẽ giữ nó lại vì sợ.
   */
  const ket = gietViec(maO);

  // ⛔ Không có việc để dừng ⇛ ⛔ KHÔNG phải lỗi: người bấm chỉ chậm hơn máy một nhịp.
  return Response.json({
    xong: true,
    da_giet: ket.da_giet,
    // 🏷 Chở LÝ DO ra tới máy khách. Trường này VÔ NGHĨA nếu KHÔNG ai đọc — nên chỗ đọc nó
    //    (`UngDung.tsx` · `dungViec`) đi CÙNG bản vá này, KHÔNG tách nhịp.
    vi_sao: ket.vi_sao,
    pid: ket.pid_de_hien_thi ?? null,   // 🔢 để HIỆN cho Owner gõ `kill`, KHÔNG để quyết định
    /**
     * ⏱ NGƯỠNG TỰ ÉP, lấy từ MÁY CHỦ — máy khách KHÔNG được gõ cứng con số này.
     * 🔑 Máy chủ là nơi con số ấy có hiệu lực, nên nó cũng phải là nơi DUY NHẤT khai ra nó.
     *    Chở nó theo phản hồi thì đổi hằng số ở một chỗ là câu chữ Owner đọc đổi theo.
     */
    giay_tu_ep: giayTuEp(),
    ma_nhan_su: ket.ma_nhan_su ?? null,
  });
}
