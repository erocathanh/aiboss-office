import { NextRequest } from 'next/server';
import { layTatCa } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { CAU_HINH } from '@/lib/cau-hinh';
import { xinLuot, xepHang, xemSo, timTheoKhoa, HAN_YEU_CAU_MS } from '@/lib/kho-danh-thuc';
import { batMotLan } from '@/lib/khoi-dong-nen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 🔔 CỔNG ĐÁNH THỨC — `POST /api/danh-thuc`
 *
 * Nhận `{ ma_nhan_su, cau_hoi, tu_ai }` từ MỘT GHẾ (nó có Bash ⇒ gọi bằng curl).
 * Việc của cổng: tìm ô nào đang mở ghế đó → ghi một mẩu giấy xuống đĩa → trả lời ngay.
 *
 * ⛔ CỔNG NÀY KHÔNG CHẠY LƯỢT CHAT. Lý do đo được, ⛔ không phải cẩn thận thừa:
 *    `doc-phien.ts` coi tệp phiên vừa đổi trong 5 phút là "đang chạy nơi khác" và CHẶN.
 *    Cổng tự chạy = có lúc cổng và trình duyệt cùng gọi một phiên ⇒ hai tiến trình
 *    cùng ghi một tệp `.jsonl` = HỎNG BẢN GHI. ⇒ Cổng ghi giấy, trình duyệt bấm nút.
 *
 * ⛔ Cổng ⛔ KHÔNG mở ô mới, ⛔ KHÔNG đổi ô của người khác — chỉ đọc sổ ô hiện có.
 */

interface Than {
  ma_nhan_su?: unknown;
  cau_hoi?: unknown;
  tu_ai?: unknown;
  /** 🔑 Khoá chống trùng — TUỲ CHỌN. Cùng khoá ⇒ trả lại mẩu CŨ, ⛔ tạo mẩu mới. */
  khoa?: unknown;
}

export async function GET() {
  batMotLan(); // 🚀 bật bộ chạy nền MỘT LẦN — cửa này chạy runtime 'nodejs'
  // Xem sổ để nghiệm thu / tra "ai gọi ai lúc nào". Chỉ đọc.
  return Response.json({ ...xemSo(), han_yeu_cau_ms: HAN_YEU_CAU_MS });
}

export async function POST(req: NextRequest) {
  batMotLan(); // 🚀 bật bộ chạy nền MỘT LẦN — cửa này chạy runtime 'nodejs'
  let than: Than;
  try {
    than = (await req.json()) as Than;
  } catch {
    return Response.json({ loi: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : '';
  const cauHoi = typeof than.cau_hoi === 'string' ? than.cau_hoi.trim() : '';
  const tuAi = typeof than.tu_ai === 'string' ? than.tu_ai.trim() : '';
  const khoa = typeof than.khoa === 'string' ? than.khoa.trim().slice(0, 80) : '';

  /**
   * 🔑 KHOÁ CHỐNG TRÙNG — kiểm TRƯỚC MỌI THỨ, kể cả trước khi xin suất.
   *
   * 🐛 Ca Hermes nêu: người gửi hết giờ chờ rồi gọi lại ⇒ **ghế chạy HAI LẦN,
   *    Owner trả tiền hai lần**. Cùng khoá thì trả lại mẩu CŨ, ⛔ đẻ mẩu mới.
   * ⚠️ Đặt ở ĐÂY, ⛔ đặt sau `xinLuot()`: gọi lại lần hai mà vẫn tiêu một suất của
   *    trần 6 lượt/phút thì chính cái chống-trùng lại đi đốt hạn mức.
   * 📌 Khoá là TUỲ CHỌN. ⛔ có khoá ⇒ xử như cũ — ⛔ ép người gọi cũ phải đổi.
   */
  if (khoa) {
    const cu = timTheoKhoa(khoa);
    if (cu) {
      return Response.json({
        xong: true,
        trung_khoa: true,
        ma_o: cu.ma_o,
        ma_nhan_su: cu.ma_nhan_su,
        ma_yeu_cau: cu.ma,
        ghi_chu:
          'This key has already been used — returning existing request without creating a new one. ' +
          'The seat will run only once for this key.',
      });
    }
  }

  if (!maNhanSu) return Response.json({ loi: 'Missing `ma_nhan_su` — who do you want to wake up?' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Missing `cau_hoi` — waking up without prompt wastes a turn.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Prompt exceeds ${CAU_HINH.toiDaKyTu} characters.` }, { status: 413 });
  }
  // ⭐ Bắt buộc khai tên: nhãn "ai đánh thức" trên giao diện phải chỉ đúng người,
  //    và luật "⛔ không đánh thức chính mình" chỉ kiểm được khi biết người gửi.
  if (!tuAi) {
    return Response.json(
      { loi: 'Missing `tu_ai` — must specify which seat is calling.' },
      { status: 400 },
    );
  }

  if (!timNhanSu(maNhanSu)) {
    return Response.json({ loi: `Seat "${maNhanSu}" not found.` }, { status: 404 });
  }

  // ⛔ CHỐNG VÒNG LẶP #1 — ⛔ không đánh thức chính mình (tự gọi tự trả lời = vòng vô tận).
  if (tuAi === maNhanSu) {
    return Response.json(
      { loi: 'Cannot wake up yourself. You are already running — continue within this turn.' },
      { status: 400 },
    );
  }

  // ⛔ CHỐNG VÒNG LẶP #2 — trần 6 lượt/phút cho CẢ máy chủ.
  //    Đặt TRƯỚC bước tìm ô: vòng lặp gọi hụt (ghế đích ⛔ không mở ô nào) cũng phải bị
  //    chặn, ⛔ không thì cái vòng ồn ào nhất lại là cái duy nhất chạy tự do.
  const suat = xinLuot();
  if (!suat.cho_qua) {
    return Response.json(
      { loi: suat.ly_do, cho_giay: suat.cho_giay },
      { status: 429, headers: { 'Retry-After': String(suat.cho_giay) } },
    );
  }

  // Tìm ô nào ĐANG MỞ ghế đó — đọc SỔ TRÊN ĐĨA, ⛔ không đoán.
  const so = layTatCa();
  const maO = Object.keys(so)
    .sort()
    .find((k) => so[k]?.ma_nhan_su === maNhanSu);

  if (!maO) {
    // ⛔ KHÔNG im lặng nuốt: nói thẳng ghế nào đang mở để người gọi còn sửa.
    const dangMo = Object.entries(so)
      .filter(([, v]) => v?.ma_nhan_su)
      .map(([k, v]) => `${k}=${v!.ma_nhan_su}`);
    return Response.json(
      {
        loi:
          `No slot is currently holding seat "${maNhanSu}". ` +
          'This endpoint does not auto-open new slots. ' +
          'Please assign the seat to a slot in the UI and try again.',
        dang_mo: dangMo.length ? dangMo : ['(no slot assigned)'],
      },
      { status: 404 },
    );
  }

  const yeuCau = xepHang({ maO, maNhanSu, tuAi, cauHoi, ...(khoa ? { khoa } : {}) });

  return Response.json({
    xong: true,
    ma_o: maO,
    ma_nhan_su: maNhanSu,
    ma_yeu_cau: yeuCau.ma,
    con_lai_phut_nay: suat.con_lai,
    het_han_sau_giay: Math.round(HAN_YEU_CAU_MS / 1000),
    ghi_chu:
      `Queued; the server runner will pick it up (~5s). ` +
      'If server runner is disabled, request will expire after 3 minutes.',
  });
}
