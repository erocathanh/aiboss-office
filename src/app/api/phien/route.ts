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
      /**
       * 📖 PHÂN TRANG BẰNG CON TRỎ — ⛔ phải bằng cách nới trần.
       * `truoc_byte` = trang trước bắt đầu ở byte nào. Xin trang CŨ HƠN thì gửi lại số đó.
       * ⛔ truyền gì ⇒ lấy phần MỚI NHẤT (mở phiên).
       * 🛡 Trần RAM nằm ở `TRAN_CUNG` trong doc-phien.ts và **⛔ tham số nào nới được nó** —
       *    người gọi ⛔ còn cách nào bảo máy chủ đọc trọn tệp 375 MB nữa.
       */
      /**
       * 🐛 FAIL 4 (Hermes lần 3): bản trước gộp «⛔ truyền» với «truyền số 0» làm một
       *    ⇒ client xin `truoc_byte=0` (nghĩa là «tôi đã ở ĐẦU tệp») thì máy chủ hiểu thành
       *    «⛔ truyền gì» rồi trả lại **CUỐI tệp**. Nhảy từ đầu về cuối, ⛔ ai báo.
       * ✅ Phân biệt bằng CÓ MẶT THAM SỐ, ⛔ bằng giá trị.
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
