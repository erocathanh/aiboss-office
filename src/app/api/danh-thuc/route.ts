import { NextRequest } from 'next/server';
import { layTatCa, datO } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { CAU_HINH } from '@/lib/cau-hinh';
import { xinLuot, xepHang, xemSo, timTheoKhoa, HAN_YEU_CAU_MS } from '@/lib/kho-danh-thuc';
import { batMotLan } from '@/lib/khoi-dong-nen';
import {
  generateRunOrWakeId,
  computeIdempotencyKey,
  findRecentWakeByIdempotencyKey,
  recordWake,
} from '@/lib/runs-ledger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 🔔 CỔNG ĐÁNH THỨC — `POST /api/danh-thuc` (A-1 Run Ledger & Idempotency)
 *
 * Nhận `{ ma_nhan_su, cau_hoi, tu_ai }` từ MỘT GHẾ hoặc chuông app.
 * - Trả về `{ wakeId, status: "queued" }` với mã 200.
 * - Idempotency trong cửa sổ 60 giây: cùng nội dung + ghế trong vòng 60s trả về `status: "skipped"`.
 * - Ghi nhận vào runs-ledger: operations/data/runs/<YYYY-MM-DD>.jsonl.
 */

interface Than {
  ma_nhan_su?: unknown;
  seat?: unknown;
  seatId?: unknown;
  cau_hoi?: unknown;
  prompt?: unknown;
  content?: unknown;
  tu_ai?: unknown;
  source?: unknown;
  /** 🔑 Khoá chống trùng — TUỲ CHỌN. Cùng khoá ⇒ trả lại mẩu CŨ. */
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

  const maNhanSu = typeof than.ma_nhan_su === 'string'
    ? than.ma_nhan_su.trim()
    : (typeof than.seat === 'string' ? than.seat.trim() : (typeof than.seatId === 'string' ? than.seatId.trim() : ''));
  const cauHoi = typeof than.cau_hoi === 'string'
    ? than.cau_hoi.trim()
    : (typeof than.prompt === 'string' ? than.prompt.trim() : (typeof than.content === 'string' ? than.content.trim() : ''));
  const tuAi = typeof than.tu_ai === 'string'
    ? than.tu_ai.trim()
    : (typeof than.source === 'string' ? than.source.trim() : 'bell');
  const khoa = typeof than.khoa === 'string' ? than.khoa.trim().slice(0, 80) : '';

  if (!maNhanSu) return Response.json({ loi: 'Missing `ma_nhan_su` — who do you want to wake up?' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Missing `cau_hoi` — waking up without prompt wastes a turn.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Prompt exceeds ${CAU_HINH.toiDaKyTu} characters.` }, { status: 413 });
  }

  // ⛔ CHỐNG VÒNG LẶP #1 — ⛔ không đánh thức chính mình (tự gọi tự trả lời = vòng vô tận).
  if (tuAi && tuAi === maNhanSu) {
    return Response.json(
      { loi: 'Cannot wake up yourself. You are already running — continue within this turn.' },
      { status: 400 },
    );
  }

  // 🔑 IDEMPOTENCY CHECK (A-1: 60s window deduplication)
  const idempotencyKey = computeIdempotencyKey(maNhanSu, cauHoi);
  const recentWake = findRecentWakeByIdempotencyKey(maNhanSu, idempotencyKey, 60_000);
  if (recentWake) {
    const duplicateWakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId: duplicateWakeId,
      seatId: maNhanSu,
      source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
      requestedAt: new Date().toISOString(),
      idempotencyKey,
      status: 'skipped',
      reason: 'idempotent_duplicate_within_60s',
    });
    return Response.json({
      xong: true,
      trung_khoa: true,
      wakeId: duplicateWakeId,
      existingWakeId: recentWake.wakeId,
      status: 'skipped',
      reason: 'idempotent_duplicate_within_60s',
      ma_nhan_su: maNhanSu,
      ma_yeu_cau: duplicateWakeId,
      ghi_chu: 'Duplicate wake within 60s window skipped by idempotency key.',
    });
  }

  /**
   * 🔑 KHOÁ CHỐNG TRÙNG — kiểm theo trường khoa do người gọi tự cấp nếu có.
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
        status: 'skipped',
        reason: 'idempotent_duplicate_key',
        ghi_chu:
          'This key has already been used — returning existing request without creating a new one. ' +
          'The seat will run only once for this key.',
      });
    }
  }

  if (!timNhanSu(maNhanSu)) {
    const wakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId,
      seatId: maNhanSu,
      source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
      requestedAt: new Date().toISOString(),
      idempotencyKey,
      status: 'skipped',
      reason: 'seat_not_found',
    });
    return Response.json({ loi: `Seat "${maNhanSu}" not found.`, wakeId, status: 'skipped', reason: 'seat_not_found' }, { status: 404 });
  }

  // ⛔ CHỐNG VÒNG LẶP #2 — trần 6 lượt/phút cho CẢ máy chủ.
  const suat = xinLuot();
  if (!suat.cho_qua) {
    return Response.json(
      { loi: suat.ly_do, cho_giay: suat.cho_giay },
      { status: 429, headers: { 'Retry-After': String(suat.cho_giay) } },
    );
  }

  // Tìm ô nào ĐANG MỞ ghế đó — đọc SỔ TRÊN ĐĨA, ⛔ không đoán.
  const so = layTatCa();
  let maO = Object.keys(so)
    .sort()
    .find((k) => so[k]?.ma_nhan_su === maNhanSu);

  if (!maO) {
    // If seat is not currently assigned to a slot, assign first open slot (o-1..o-4)
    const availableSlot = ['o-1', 'o-2', 'o-3', 'o-4'].find((slot) => !so[slot]?.ma_nhan_su);
    if (availableSlot) {
      datO(availableSlot, maNhanSu, null);
      maO = availableSlot;
    }
  }

  if (!maO) {
    const wakeId = generateRunOrWakeId('wake');
    recordWake({
      wakeId,
      seatId: maNhanSu,
      source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
      requestedAt: new Date().toISOString(),
      idempotencyKey,
      status: 'skipped',
      reason: 'no_available_slot',
    });
    const dangMo = Object.entries(so)
      .filter(([, v]) => v?.ma_nhan_su)
      .map(([k, v]) => `${k}=${v!.ma_nhan_su}`);
    return Response.json(
      {
        loi:
          `No slot is currently holding seat "${maNhanSu}". ` +
          'All slots are occupied. ' +
          'Please assign the seat to a slot in the UI and try again.',
        wakeId,
        status: 'skipped',
        reason: 'no_available_slot',
        dang_mo: dangMo.length ? dangMo : ['(no slot assigned)'],
      },
      { status: 404 },
    );
  }

  const wakeId = generateRunOrWakeId('wake');
  const wakeRecord = recordWake({
    wakeId,
    seatId: maNhanSu,
    source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
    requestedAt: new Date().toISOString(),
    idempotencyKey,
    status: 'queued',
  });

  const yeuCau = xepHang({ maO, maNhanSu, tuAi, cauHoi, wakeId, ...(khoa ? { khoa } : {}) });

  return Response.json({
    xong: true,
    wakeId: wakeRecord.wakeId,
    status: 'queued',
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
