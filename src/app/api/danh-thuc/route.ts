import { NextRequest } from 'next/server';
import { layTatCa } from '@/lib/kho-phien';
import { timNhanSu } from '@/lib/nhan-su';
import { CAU_HINH } from '@/lib/cau-hinh';
import { xinLuot, xepHang, xemSo, timTheoKhoa, HAN_YEU_CAU_MS } from '@/lib/kho-danh-thuc';
import { batMotLan } from '@/lib/khoi-dong-nen';
import { getIsRunnerStarting } from '@/lib/office-runner';
import {
  generateRunOrWakeId,
  computeIdempotencyKey,
  computeCustomIdempotencyKey,
  findRecentWakeByIdempotencyKey,
  recordWake,
  updateWake,
} from '@/lib/runs-ledger';
import {
  buildServerNotice,
  resolveRequestUiLanguage,
  serverNoticeJson,
} from '@/lib/server-notices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/danh-thuc
 * Returns queue overview and timeout configuration for inspection and health checking.
 * Triggers background runner activation via batMotLan on server startup / health check.
 */
export async function GET() {
  if (getIsRunnerStarting()) {
    return Response.json(
      { error: 'runner_starting', message: 'Office runner is starting up and waiting for startup lock.' },
      { status: 503 }
    );
  }
  batMotLan();
  return Response.json({ ...xemSo(), han_yeu_cau_ms: HAN_YEU_CAU_MS });
}

/**
 * 🔔 CỔNG ĐÁNH THỨC — `POST /api/danh-thuc` (A-1 Run Ledger & Idempotency)
 *
 * Nhận `{ ma_nhan_su, cau_hoi, tu_ai }` từ MỘT GHẾ hoặc chuông app.
 * - Trả về `{ wakeId, status: "queued" }` với mã 200.
 * - Idempotency trong cửa sổ 60 giây trượt: cùng nội dung + ghế trong vòng 60s trả về `status: "skipped"`.
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

export async function POST(req: NextRequest) {
  if (getIsRunnerStarting()) {
    return Response.json(
      { error: 'runner_starting', message: 'Office runner is starting up and waiting for startup lock.' },
      { status: 503 }
    );
  }

  // 🔌 Đánh thức tiến trình nền nếu máy chủ mới mở lần đầu
  batMotLan();

  let than: Than;
  try {
    than = (await req.json()) as Than;
  } catch {
    return Response.json({ loi: 'Invalid JSON body.' }, { status: 400 });
  }

  const maNhanSu = typeof than.ma_nhan_su === 'string'
    ? than.ma_nhan_su.trim()
    : (typeof than.seat === 'string'
      ? than.seat.trim()
      : (typeof than.seatId === 'string' ? than.seatId.trim() : ''));
  const cauHoi = typeof than.cau_hoi === 'string'
    ? than.cau_hoi.trim()
    : (typeof than.prompt === 'string'
      ? than.prompt.trim()
      : (typeof than.content === 'string' ? than.content.trim() : ''));
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

  // 🔑 IDEMPOTENCY CHECK (A-1: 60s sliding window deduplication)
  const idempotencyKey = computeIdempotencyKey(maNhanSu, cauHoi);
  const recentWake = findRecentWakeByIdempotencyKey(maNhanSu, idempotencyKey, 60_000);
  if (recentWake) {
    const duplicateWakeId = generateRunOrWakeId('wake');
    try {
      recordWake({
        wakeId: duplicateWakeId,
        seatId: maNhanSu,
        source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
        requestedAt: new Date().toISOString(),
        idempotencyKey,
        status: 'skipped',
        reason: 'idempotent_duplicate_within_60s',
      });
    } catch (err: unknown) {
      return Response.json(
        { loi: 'Failed to record wake ledger', chi_tiet: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }

    const existingQueueItem = xemSo().hang_doi.find(
      (y) => y.ma_nhan_su === maNhanSu && (y.wakeId === recentWake.wakeId || y.ma === recentWake.queueId)
    );

    return Response.json({
      xong: true,
      trung_khoa: true,
      ma_o: existingQueueItem?.ma_o ?? null,
      ma_nhan_su: maNhanSu,
      ma_yeu_cau: existingQueueItem?.ma ?? recentWake.queueId ?? null,
      wakeId: duplicateWakeId,
      existingWakeId: recentWake.wakeId,
      status: 'skipped',
      reason: 'idempotent_duplicate_within_60s',
      ghi_chu: 'Duplicate wake within 60s window skipped by idempotency key.',
    });
  }

  /**
   * 🔑 KHOÁ CHỐNG TRÙNG — kiểm theo trường khoa do người gọi tự cấp nếu có.
   */
  if (khoa) {
    const cu = timTheoKhoa(khoa);
    if (cu) {
      const duplicateWakeId = generateRunOrWakeId('wake');
      const customHash = computeCustomIdempotencyKey(maNhanSu, khoa);
      try {
        recordWake({
          wakeId: duplicateWakeId,
          seatId: maNhanSu,
          source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
          requestedAt: new Date().toISOString(),
          idempotencyKey: customHash,
          status: 'skipped',
          reason: 'idempotent_duplicate_key',
        });
      } catch (err: unknown) {
        return Response.json(
          { loi: 'Failed to record wake ledger', chi_tiet: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }

      return Response.json({
        xong: true,
        trung_khoa: true,
        ma_o: cu.ma_o,
        ma_nhan_su: cu.ma_nhan_su,
        ma_yeu_cau: cu.ma,
        wakeId: duplicateWakeId,
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
    try {
      recordWake({
        wakeId,
        seatId: maNhanSu,
        source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
        requestedAt: new Date().toISOString(),
        idempotencyKey,
        status: 'skipped',
        reason: 'seat_not_found',
      });
    } catch {
      /* ignore */
    }
    return Response.json({ loi: `Seat "${maNhanSu}" not found.`, wakeId, status: 'skipped', reason: 'seat_not_found' }, { status: 404 });
  }

  // ⛔ CHỐNG VÒNG LẶP #2 — trần 6 lượt/phút cho CẢ máy chủ.
  const suat = xinLuot();
  if (!suat.cho_qua) {
    const rateNotice = buildServerNotice(suat.code, suat.params, resolveRequestUiLanguage(req));
    return Response.json(
      {
        code: rateNotice.code,
        ...(rateNotice.params ? { params: rateNotice.params } : {}),
        text: rateNotice.text,
        loi: rateNotice.text,
        cho_giay: suat.cho_giay,
      },
      { status: 429, headers: { 'Retry-After': String(suat.cho_giay) } },
    );
  }

  // Tìm ô nào ĐANG MỞ ghế đó — đọc SỔ TRÊN ĐĨA, ⛔ không đoán.
  const so = layTatCa();
  const maO = Object.keys(so)
    .sort()
    .find((k) => so[k]?.ma_nhan_su === maNhanSu);

  if (!maO) {
    const wakeId = generateRunOrWakeId('wake');
    try {
      recordWake({
        wakeId,
        seatId: maNhanSu,
        source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
        requestedAt: new Date().toISOString(),
        idempotencyKey,
        status: 'skipped',
        reason: 'seat_not_open_in_any_slot',
      });
    } catch {
      /* ignore */
    }
    const dangMo = Object.entries(so)
      .filter(([, v]) => v?.ma_nhan_su)
      .map(([k, v]) => `${k}=${v!.ma_nhan_su}`);
    return serverNoticeJson(
      req,
      'wake.seatNotOpen',
      {
        seatId: maNhanSu,
        openSlots: dangMo.join(', '),
      },
      404,
      {
        wakeId,
        status: 'skipped',
        reason: 'seat_not_open_in_any_slot',
        dang_mo: dangMo.length ? dangMo : ['(none)'],
      },
    );
  }

  const wakeId = generateRunOrWakeId('wake');
  let wakeRecord;
  try {
    wakeRecord = recordWake({
      wakeId,
      seatId: maNhanSu,
      source: (tuAi === 'bell' || !tuAi ? 'bell' : 'app'),
      requestedAt: new Date().toISOString(),
      idempotencyKey,
      status: 'queued',
    });
  } catch (err: unknown) {
    return Response.json(
      { loi: 'Failed to record wake ledger', chi_tiet: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const yeuCau = xepHang({ maO, maNhanSu, tuAi, cauHoi, wakeId, ...(khoa ? { khoa } : {}) });

  // Record queueId in wake ledger for exact duplicate retry tracking
  try {
    updateWake(wakeRecord.wakeId, { queueId: yeuCau.ma });
  } catch (err: unknown) {
    console.error('[danh-thuc] Failed to record queueId in wake ledger:', err);
  }

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
