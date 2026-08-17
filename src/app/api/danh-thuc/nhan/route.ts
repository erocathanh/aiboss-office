import { NextRequest } from 'next/server';
import { nhanYeuCau } from '@/lib/kho-danh-thuc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 🖐 TRÌNH DUYỆT NHẬN VIỆC — `POST /api/danh-thuc/nhan`  `{ ds_o: ["o-1","o-2"] }`
 *
 * Trả về yêu cầu đánh thức còn hạn của từng ô VÀ đánh dấu ĐÃ XỬ ngay trong cùng lượt
 * (xem `nhanYeuCau` — lấy-và-đánh-dấu phải đi liền, nếu không hai tab cùng nhặt một
 * yêu cầu là chạy đúp, trả tiền hai lần).
 *
 * ⚠️ Vì sao gộp cả 4 ô vào MỘT yêu cầu thay vì mỗi ô một yêu cầu: 4 ô × 1 lần/5 giây
 *    = 48 lượt gọi mỗi phút cho một việc thường xuyên rỗng. Gộp còn 12.
 */
export async function POST(req: NextRequest) {
  let than: { ds_o?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const dsO = Array.isArray(than.ds_o)
    ? than.ds_o.filter((x): x is string => typeof x === 'string' && /^o-\d+$/.test(x)).slice(0, 8)
    : [];

  const nhan: Record<string, { ma: string; tu_ai: string; cau_hoi: string; luc: number }> = {};
  for (const maO of dsO) {
    const y = nhanYeuCau(maO);
    if (y) nhan[maO] = { ma: y.ma, tu_ai: y.tu_ai, cau_hoi: y.cau_hoi, luc: y.luc };
  }

  return Response.json({ nhan });
}
