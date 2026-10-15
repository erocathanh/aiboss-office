import { NextRequest } from 'next/server';
import { xacNhanDaGiao } from '@/lib/kho-danh-thuc';
import { serverNoticeJson } from '@/lib/server-notices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ✅ TRÌNH DUYỆT XÁC NHẬN ĐÃ NHẬN — `POST /api/danh-thuc/xac-nhan`
 *    `{ ma: "<mã mẩu>", ma_trinh_duyet: "<mã tab>" }`
 *
 * 🐛 VÌ SAO CÓ CỔNG NÀY (P0-2b, 31/08/2026): trước đây máy chủ đánh dấu «đã xử» NGAY
 *    lúc trao mẩu cho trình duyệt. Tab chết giữa chừng — rớt mạng, đóng tab, lỗi phân
 *    tích — thì mẩu coi như ĐÃ GIAO mà **⛔ ai nhận**. Mẩu mất, và ⛔ ai biết.
 * ✅ Nay trao chỉ là GIỮ CHỖ có hạn. Chỉ lời xác nhận này mới chuyển sang 'da_giao'.
 *    ⛔ xác nhận trong hạn ⇒ mẩu tự quay lại hàng đợi và được giao lại.
 *
 * 📌 Trình duyệt phải gọi SAU KHI `gui()` đã bắt đầu, ⛔ phải trước — xác nhận trước
 *    là khai «đã giao» trong khi việc còn chưa chạy.
 */
export async function POST(req: NextRequest) {
  let than: { ma?: unknown; ma_trinh_duyet?: unknown };
  try {
    than = await req.json();
  } catch {
    return serverNoticeJson(req, 'chat.invalidJson', undefined, 400);
  }

  const ma = typeof than.ma === 'string' ? than.ma.trim() : '';
  const maTrinhDuyet = typeof than.ma_trinh_duyet === 'string' ? than.ma_trinh_duyet.trim() : '';
  if (!ma) return serverNoticeJson(req, 'wake.missingAckId', undefined, 400);

  const kq = xacNhanDaGiao(ma, maTrinhDuyet);
  // ⚠️ Thất bại vẫn trả 200 kèm LÝ DO, ⛔ trả lỗi trần: trình duyệt ⛔ có gì để sửa,
  //    và ta cần LÝ DO đọc được hơn là một mã lỗi.
  return Response.json(kq);
}
