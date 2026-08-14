import { NextRequest } from 'next/server';
import { layTatCa, datO } from '@/lib/kho-phien';
import { coPhien } from '@/lib/doc-phien';
import { timNhanSu } from '@/lib/nhan-su';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/o  → ô nào đang mở phiên nào (khôi phục sau khi tắt trình duyệt/máy chủ)
 * POST /api/o  → ghi lại lựa chọn của Owner
 */
export async function GET() {
  return Response.json({ o: layTatCa() });
}

export async function POST(req: NextRequest) {
  let than: { ma_o?: unknown; ma_nhan_su?: unknown; ma_phien?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' ? than.ma_o.trim() : '';
  if (!/^o-\d+$/.test(maO)) return Response.json({ loi: 'Mã ô không hợp lệ.' }, { status: 400 });

  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : null;
  const maPhien = typeof than.ma_phien === 'string' ? than.ma_phien.trim() : null;

  if (maNhanSu && !timNhanSu(maNhanSu)) {
    return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });
  }
  // ⛔ Chốt chặn: chỉ nhận phiên CÓ THẬT trong kho của ĐÚNG nhân sự đó.
  //    Nếu không, trình duyệt có thể trỏ ô sang phiên của dự án khác trên máy.
  if (maPhien && (!maNhanSu || !coPhien(maNhanSu, maPhien))) {
    return Response.json({ loi: 'Phiên không thuộc nhân sự này.' }, { status: 400 });
  }

  datO(maO, maNhanSu, maPhien);
  return Response.json({ xong: true });
}
