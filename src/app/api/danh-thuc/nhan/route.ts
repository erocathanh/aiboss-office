import { NextRequest } from 'next/server';
import { nhanYeuCau, giuChoOBan } from '@/lib/kho-danh-thuc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 🖐 TRÌNH DUYỆT NHẬN VIỆC — `POST /api/danh-thuc/nhan`
 *    `{ ds_o: ["o-1"], ds_ban: ["o-2"] }`
 *
 * ⏳ `ds_ban` (P0-2a, 30/08/2026): ô CÓ ghế nhưng ĐANG BẬN.
 *    Máy chủ ⛔ TỰ BIẾT điều đó — `dangChay` là trạng thái của trình duyệt.
 *    Khai ra thì mẩu được GIỮ chờ ô rảnh, thay vì hết hạn âm thầm sau 3 phút.
 * ⚠️ Ô ⛔ CÓ GHẾ thì ⛔ thuộc danh sách nào cả — nó KHÁC «bận». Ô trống mà tính là bận
 *    thì mẩu nhắm vào nó sẽ được giữ tới tận trần 30 phút cho một chỗ ⛔ ai ngồi.
 *
 * Trả về yêu cầu đánh thức còn hạn của từng ô VÀ đánh dấu ĐÃ XỬ ngay trong cùng lượt
 * (xem `nhanYeuCau` — lấy-và-đánh-dấu phải đi liền, nếu không hai tab cùng nhặt một
 * yêu cầu là chạy đúp, trả tiền hai lần).
 *
 * ⚠️ Vì sao gộp cả 4 ô vào MỘT yêu cầu thay vì mỗi ô một yêu cầu: 4 ô × 1 lần/5 giây
 *    = 48 lượt gọi mỗi phút cho một việc thường xuyên rỗng. Gộp còn 12.
 */
export async function POST(req: NextRequest) {
  let than: { ds_o?: unknown; ds_ban?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const locMaO = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && /^o-\d+$/.test(x)).slice(0, 8)
      : [];

  const dsO = locMaO(than.ds_o);
  const dsBan = locMaO(than.ds_ban);

  // ⏳ GIỮ TRƯỚC, NHẶT SAU — ⛔ đảo thứ tự.
  //    Đảo lại thì trong cùng một nhịp, mẩu của ô bận có thể vừa kịp hết hạn ở bước nhặt
  //    rồi mới được giữ ⇒ giữ một cái đã chết, và ⛔ ai biết vì cả hai bước đều «xong».
  const daGiu = giuChoOBan(dsBan);

  const nhan: Record<
    string,
    { ma: string; ma_nhan_su: string; tu_ai: string; cau_hoi: string; luc: number }
  > = {};
  for (const maO of dsO) {
    const y = nhanYeuCau(maO);
    // ⭐ Trả kèm `ma_nhan_su`: mẩu nhắm vào GHẾ, ⛔ vào ô. Ô có thể đã đổi ghế kể từ
    //   lúc xếp hàng ⇒ ⛔ có trường này thì bên nhận ⛔ cách nào biết mình có đúng người.
    if (y) nhan[maO] = { ma: y.ma, ma_nhan_su: y.ma_nhan_su, tu_ai: y.tu_ai, cau_hoi: y.cau_hoi, luc: y.luc };
  }

  // `da_giu` để bên nghiệm thu ĐẾM được, ⛔ phải suy từ việc «⛔ thấy lỗi».
  return Response.json({ nhan, da_giu: daGiu });
}
