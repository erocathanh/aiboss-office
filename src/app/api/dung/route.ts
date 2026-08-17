import { NextRequest } from 'next/server';
import { gietViec, layViec } from '@/lib/kho-tien-trinh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
