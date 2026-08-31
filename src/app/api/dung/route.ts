import { NextRequest } from 'next/server';
import { gietViec, layViec, dsViec } from '@/lib/kho-tien-trinh';

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
  const ds = dsViec();
  return Response.json({
    dang_chay: ds.map((v) => ({
      ma_o: v.ma_o,
      ma_nhan_su: v.ma_nhan_su,
      pid: v.pid,
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
  let than: { ma_o?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' ? than.ma_o.trim() : '';
  if (!/^o-\d+$/.test(maO)) return Response.json({ loi: 'Mã ô không hợp lệ.' }, { status: 400 });

  const truoc = layViec(maO);
  const ket = gietViec(maO);

  // ⛔ Không có việc để dừng ⇛ ⛔ KHÔNG phải lỗi: người bấm chỉ chậm hơn máy một nhịp.
  return Response.json({
    xong: true,
    da_giet: ket.da_giet,
    pid: ket.pid ?? null,
    ma_nhan_su: truoc?.ma_nhan_su ?? null,
  });
}
