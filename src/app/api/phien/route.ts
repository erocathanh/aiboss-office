import { NextRequest } from 'next/server';
import { dsPhien, lichSuPhien, phienCoTienTrinhSong } from '@/lib/doc-phien';
import { layO } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { readOwnership } from '@/lib/so-so-huu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/phien?ma_nhan_su=X            → danh sách phiên THẬT của nhân sự đó
 * GET /api/phien?ma_nhan_su=X&ma_phien=Y → lịch sử THẬT của một phiên
 *
 * Read transcript files directly rather than scraping terminal output.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const maNhanSu = (q.get('ma_nhan_su') ?? '').trim();
  const maPhien = (q.get('ma_phien') ?? '').trim();

  if (!maNhanSu) return Response.json({ loi: 'Thiếu nhân sự.' }, { status: 400 });
  if (!timNhanSu(maNhanSu)) return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });

  try {
    if (maPhien) {
      /**
       * Pagination uses a byte cursor, never a caller-controlled memory limit.
       * Missing cursor means newest page; zero means the beginning, not a missing cursor.
       */
      const troTho = q.get('truoc_byte');
      const troSo = troTho === null ? NaN : Number(troTho);
      const tro = Number.isFinite(troSo) && troSo >= 0 ? troSo : undefined;
      const kq = await lichSuPhien(maNhanSu, maPhien, tro);
      return Response.json({
        lich_su: kq.tin,
        con_nua: kq.con_nua,
        vi_tri: kq.vi_tri,
        tong_byte: kq.tong_byte,
        cat_dong_qua_dai: kq.cat_dong_qua_dai,
      });
    }
    // Ô nào đang giữ phiên nào → để không tự gắn cờ "đang chạy nơi khác" lên chính nó.
    const maO = /^o-\d+$/.test(q.get('ma_o') ?? '') ? q.get('ma_o')! : 'o-1';
    const o = layO(maO);
    const ownerPicker = q.get('owner_picker') === '1';
    const ds = dsPhien(maNhanSu, ownerPicker ? undefined : {
      ma: o?.ma_nhan_su === maNhanSu ? (o?.ma_phien ?? null) : null,
      mocKetThuc: o?.moc_ket_thuc ?? null,
    });
    // Keep every discovered session visible; only an Owner-confirmed binding authorizes
    // the existing co_so_huu auto-pick path. Suggestions never authorize auto-picking.
    // Missing ledger is normal on first use. Other failures reach the visible error response.
    const ownership = readOwnership();
    return Response.json({
      phien: ds.map((session) => ({
        ...session,
        dang_chay: session.dang_chay || (ownerPicker && phienCoTienTrinhSong(session.ma)),
        co_so_huu: ownership.get(session.ma)?.owner === maNhanSu,
        owner_seat: ownership.get(session.ma)?.owner ?? null,
        de_xuat_ghe: ownership.get(session.ma)?.proposal ?? null,
      })),
    });
  } catch (e) {
    return Response.json(
      { loi: e instanceof Error ? e.message : 'Không đọc được kho phiên.' },
      { status: 400 },
    );
  }
}
