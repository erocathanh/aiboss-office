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
       * 🚦 Mặc định chỉ nạp PHẦN CUỐI (~1,5 MB). Muốn kéo thêm về trước thì gọi lại
       * với `tran_byte` lớn hơn — trình duyệt đọc `con_nua` để biết còn gì mà kéo ⛔.
       * ⚠️ Trần trên 64 MB: chặn người gõ tay một số khổng lồ làm máy chủ ngốn hết bộ nhớ.
       *    (kho chung có tệp 375 MB — đọc trọn là đẩy 29.041 tin về trình duyệt.)
       */
      /**
       * 🐛 BLOCKER ① (Hermes 30/08): bản trước kẹp cứng 64 MB. Với tệp 375 MB thì
       *    `con_nua` LUÔN true, mà mọi lần bấm «xem thêm» đều trả ĐÚNG CÙNG khúc đuôi
       *    ⇒ nút bấm mãi ⛔ đi tiếp được. Trần cố định + vòng nhân đôi = **kẹt vĩnh viễn**.
       * ✅ Chữa: ⛔ kẹp bằng SỐ CỐ ĐỊNH nữa. Chặn duy nhất là KÍCH THƯỚC TỆP —
       *    xin quá tệp thì đọc trọn tệp, `con_nua` thành false, vòng lặp KẾT THÚC.
       * 🛡 Bộ nhớ vẫn được bảo vệ, nhưng bằng thứ khác: mỗi bước nới là MỘT CÚ BẤM TAY
       *    của người dùng, ⛔ phải vòng tự chạy. Muốn đọc trọn tệp 375 MB thì phải bấm
       *    ~7 lần và tự thấy nó chậm dần — đó là phanh THẬT, ⛔ phải một con số bịa.
       */
      const tranTho = Number(q.get('tran_byte'));
      const tran = Number.isFinite(tranTho) && tranTho > 0 ? tranTho : undefined;
      const kq = await lichSuPhien(maNhanSu, maPhien, tran);
      return Response.json({
        lich_su: kq.tin,
        con_nua: kq.con_nua,
        da_doc: kq.da_doc,
        tong_byte: kq.tong_byte,
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
