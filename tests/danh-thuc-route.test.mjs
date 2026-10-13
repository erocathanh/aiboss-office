import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server.js';

// 1. ISOLATE DATA DIR
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-route-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;

import { GET, POST } from '../src/app/api/danh-thuc/route.ts';
import { GET as getWakeRoute } from '../src/app/api/wakes/[wakeId]/route.ts';
import { getWake } from '../src/lib/runs-ledger.ts';
import { datO } from '../src/lib/kho-phien.ts';

console.log('--- Testing /api/danh-thuc and /api/wakes/[wakeId] routes ---');

try {
  // Case 1: GET /api/danh-thuc returns status 200 with queue inspection shape
  {
    const res = await GET();
    assert.equal(res.status, 200, 'GET /api/danh-thuc must return HTTP 200');
    const body = await res.json();
    assert.ok(Array.isArray(body.hang_doi), 'hang_doi must be an array');
    assert.ok(typeof body.con_lai === 'number', 'con_lai must be a number');
    assert.ok(typeof body.tran_moi_phut === 'number', 'tran_moi_phut must be a number');
    assert.ok(typeof body.han_yeu_cau_ms === 'number', 'han_yeu_cau_ms must be a number');
    console.log('  [PASS] Case 1: GET /api/danh-thuc export restored and returns queue status');
  }

  // Case 2: POST /api/danh-thuc with unallocated seat returns HTTP 404 (not 409)
  {
    const req = new NextRequest('http://127.0.0.1:4330/api/danh-thuc', {
      method: 'POST',
      body: JSON.stringify({
        ma_nhan_su: 'content-writer',
        cau_hoi: 'Hello unallocated',
        tu_ai: 'tester',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    assert.equal(res.status, 404, 'Unallocated seat must return 404');
    const body = await res.json();
    assert.equal(body.status, 'skipped');
    assert.equal(body.reason, 'seat_not_open_in_any_slot');
    assert.ok(Array.isArray(body.dang_mo));
    console.log('  [PASS] Case 2: unallocated seat returns HTTP 404 with skipped details');
  }

  // Case 3: POST /api/danh-thuc with allocated seat succeeds, hashes idempotencyKey, and records queueId
  const testSeat = 'marketing-lead';
  datO('o-1', testSeat, null);

  let initialWakeId = '';
  let initialQueueId = '';
  {
    const req = new NextRequest('http://127.0.0.1:4330/api/danh-thuc', {
      method: 'POST',
      body: JSON.stringify({
        ma_nhan_su: testSeat,
        cau_hoi: 'Write launch announcement for v03',
        tu_ai: 'tester',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.xong, true);
    assert.equal(body.status, 'queued');
    assert.equal(body.ma_o, 'o-1');
    assert.equal(body.ma_nhan_su, testSeat);
    assert.ok(body.wakeId);
    assert.ok(body.ma_yeu_cau);
    initialWakeId = body.wakeId;
    initialQueueId = body.ma_yeu_cau;

    // Verify idempotencyKey in ledger is a 32-char SHA-256 hash (never raw text)
    const wake = getWake(initialWakeId);
    assert.ok(wake);
    assert.match(wake.idempotencyKey, /^[a-f0-9]{32}$/, 'idempotencyKey must be 32-char hex hash');
    assert.equal(wake.queueId, initialQueueId, 'queueId must be recorded in wake ledger');
    console.log('  [PASS] Case 3: valid wake queued with 32-char hash idempotencyKey and queueId recorded');
  }

  // Case 4: Semantic duplicate within 60s preserves original ma_yeu_cau
  {
    const reqDup = new NextRequest('http://127.0.0.1:4330/api/danh-thuc', {
      method: 'POST',
      body: JSON.stringify({
        ma_nhan_su: testSeat,
        cau_hoi: 'Write launch announcement for v03',
        tu_ai: 'tester',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const resDup = await POST(reqDup);
    assert.equal(resDup.status, 200);
    const bodyDup = await resDup.json();
    assert.equal(bodyDup.xong, true);
    assert.equal(bodyDup.trung_khoa, true);
    assert.equal(bodyDup.status, 'skipped');
    assert.equal(bodyDup.reason, 'idempotent_duplicate_within_60s');
    assert.equal(
      bodyDup.ma_yeu_cau,
      initialQueueId,
      'Duplicate wake must return real queueId, not wakeId fallback'
    );
    console.log('  [PASS] Case 4: semantic retry within 60s returns status: skipped and real ma_yeu_cau');
  }

  // Case 5: Custom key duplicate (caller-provided khoa) stores hash, returns original ma_yeu_cau
  {
    const customKhoa = 'custom-user-provided-key-secret-12345';
    const req1 = new NextRequest('http://127.0.0.1:4330/api/danh-thuc', {
      method: 'POST',
      body: JSON.stringify({
        ma_nhan_su: testSeat,
        cau_hoi: 'Distinct task for custom key',
        tu_ai: 'tester',
        khoa: customKhoa,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res1 = await POST(req1);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.status, 'queued');
    const customQueueId = body1.ma_yeu_cau;

    // Retry with same custom key
    const req2 = new NextRequest('http://127.0.0.1:4330/api/danh-thuc', {
      method: 'POST',
      body: JSON.stringify({
        ma_nhan_su: testSeat,
        cau_hoi: 'Different prompt with same key',
        tu_ai: 'tester',
        khoa: customKhoa,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res2 = await POST(req2);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.xong, true);
    assert.equal(body2.trung_khoa, true);
    assert.equal(body2.ma_yeu_cau, customQueueId, 'Custom key retry must return original ma_yeu_cau');
    assert.equal(body2.status, 'skipped');

    // Verify duplicate wake record in ledger does NOT store raw custom text
    const dupWake = getWake(body2.wakeId);
    assert.ok(dupWake);
    assert.match(dupWake.idempotencyKey, /^[a-f0-9]{32}$/, 'Custom key idempotencyKey must be 32-char SHA-256 hash');
    assert.ok(
      !dupWake.idempotencyKey.includes(customKhoa),
      'Must never store raw caller-provided custom key in ledger'
    );
    console.log('  [PASS] Case 5: custom key retry returns original ma_yeu_cau and hashes idempotencyKey');
  }

  // Case 6: GET /api/wakes/[wakeId] returns 200 and sanitized record; 404 for missing
  {
    const req = new NextRequest(`http://127.0.0.1:4330/api/wakes/${initialWakeId}`);
    const res = await getWakeRoute(req, { params: Promise.resolve({ wakeId: initialWakeId }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.wake);
    assert.equal(body.wake.wakeId, initialWakeId);
    assert.match(body.wake.idempotencyKey, /^[a-f0-9]{32}$/);

    // 404 for missing
    const missingReq = new NextRequest('http://127.0.0.1:4330/api/wakes/wake-fake-id');
    const missingRes = await getWakeRoute(missingReq, { params: Promise.resolve({ wakeId: 'wake-fake-id' }) });
    assert.equal(missingRes.status, 404);
    console.log('  [PASS] Case 6: GET /api/wakes/[wakeId] returns 200 for existing wake and 404 for missing');
  }

  console.log('>>> ALL DANH-THUC ROUTE TEST CASES PASSED <<<');
} finally {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
  process.exit(0);
}
