import { NextRequest } from 'next/server';
import { dsPhien, lichSuPhien } from '@/lib/doc-phien';
import { layO } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/phien?ma_nhan_su=X            → danh sách phiên THẬT của nhân sự đó
 * GET /api/phien?ma_nhan_su=X&ma_phien=Y → lịch sử THẬT của một phiên
 *
 * Đọc thẳng `~/.claude/projects/**\/*.jsonl` — ⛔ không bóc chữ màn hình.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const maNhanSu = (q.get('ma_nhan_su') ?? '').trim();
  const maPhien = (q.get('ma_phien') ?? '').trim();

  if (!maNhanSu) return Response.json({ loi: 'Thiếu nhân sự.' }, { status: 400 });
  if (!timNhanSu(maNhanSu)) return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });

  try {
    if (maPhien) {
      return Response.json({ lich_su: await lichSuPhien(maNhanSu, maPhien) });
    }
    // Ô nào đang giữ phiên nào → để không tự gắn cờ "đang chạy nơi khác" lên chính nó.
    const maO = /^o-\d+$/.test(q.get('ma_o') ?? '') ? q.get('ma_o')! : 'o-1';
    const o = layO(maO);
    return Response.json({
      phien: dsPhien(maNhanSu, {
        ma: o?.ma_nhan_su === maNhanSu ? (o?.ma_phien ?? null) : null,
        mocKetThuc: o?.moc_ket_thuc ?? null,
      }),
    });
  } catch (e) {
    return Response.json(
      { loi: e instanceof Error ? e.message : 'Không đọc được kho phiên.' },
      { status: 400 },
    );
  }
}
