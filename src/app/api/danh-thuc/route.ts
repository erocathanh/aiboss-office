import { NextRequest } from 'next/server';
import { layTatCa } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { CAU_HINH } from '@/lib/cau-hinh';
import { xinLuot, xepHang, xemSo, HAN_YEU_CAU_MS } from '@/lib/kho-danh-thuc';

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
}

export async function GET() {
  // Xem sổ để nghiệm thu / tra "ai gọi ai lúc nào". Chỉ đọc.
  return Response.json({ ...xemSo(), han_yeu_cau_ms: HAN_YEU_CAU_MS });
}

export async function POST(req: NextRequest) {
  let than: Than;
  try {
    than = (await req.json()) as Than;
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : '';
  const cauHoi = typeof than.cau_hoi === 'string' ? than.cau_hoi.trim() : '';
  const tuAi = typeof than.tu_ai === 'string' ? than.tu_ai.trim() : '';

  if (!maNhanSu) return Response.json({ loi: 'Thiếu `ma_nhan_su` — muốn đánh thức ai?' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Thiếu `cau_hoi` — đánh thức mà không nói gì thì phí một lượt.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Câu dài quá ${CAU_HINH.toiDaKyTu} ký tự.` }, { status: 413 });
  }
  // ⭐ Bắt buộc khai tên: nhãn "ai đánh thức" trên giao diện phải chỉ đúng người,
  //    và luật "⛔ không đánh thức chính mình" chỉ kiểm được khi biết người gửi.
  if (!tuAi) {
    return Response.json(
      { loi: 'Thiếu `tu_ai` — phải khai ghế nào đang gọi (nhãn "ai đánh thức" lấy từ đây).' },
      { status: 400 },
    );
  }

  if (!timNhanSu(maNhanSu)) {
    return Response.json({ loi: `Không có nhân sự tên "${maNhanSu}".` }, { status: 404 });
  }

  // ⛔ CHỐNG VÒNG LẶP #1 — ⛔ không đánh thức chính mình (tự gọi tự trả lời = vòng vô tận).
  if (tuAi === maNhanSu) {
    return Response.json(
      { loi: '⛔ Không đánh thức chính mình. Bạn đang chạy sẵn rồi — cứ làm tiếp trong lượt này.' },
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
          `⛔ Không ô nào đang mở ghế "${maNhanSu}" — ⛔ không đánh thức được. ` +
          'Cổng này ⛔ KHÔNG tự mở ô mới (mở hộ = giẫm lên ô của người khác). ' +
          'Nhờ Owner mở ghế đó vào một ô rồi gọi lại.',
        dang_mo: dangMo.length ? dangMo : ['(không ô nào có ghế)'],
      },
      { status: 404 },
    );
  }

  const yeuCau = xepHang({ maO, maNhanSu, tuAi, cauHoi });

  return Response.json({
    xong: true,
    ma_o: maO,
    ma_nhan_su: maNhanSu,
    ma_yeu_cau: yeuCau.ma,
    con_lai_phut_nay: suat.con_lai,
    het_han_sau_giay: Math.round(HAN_YEU_CAU_MS / 1000),
    ghi_chu:
      `Đã xếp hàng cho ${maO}. Trình duyệt đang mở ô đó sẽ tự gửi trong ~5 giây. ` +
      'Trang KHÔNG mở → yêu cầu tự hết hạn sau 3 phút (⛔ không đánh thức bằng câu đã cũ).',
  });
}
