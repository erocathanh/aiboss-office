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
import { GET as getRunsRoute } from '../src/app/api/runs/route.ts';
import { getWake, recordWake, recordRun } from '../src/lib/runs-ledger.ts';
import { datO } from '../src/lib/kho-phien.ts';
import { stopOfficeRunner, getOfficeRunnerStatus } from '../src/lib/office-runner.ts';
import { traVeHangDoi, boYeuCau, xemSo } from '../src/lib/kho-danh-thuc.ts';
import { baoMauChet } from '../src/lib/bao-mau-chet.ts';

console.log('--- Testing /api/danh-thuc and /api/wakes/[wakeId] routes ---');

try {
  // Case 1: GET /api/danh-thuc returns status 200 with queue inspection shape and calls batMotLan
  {
    const res = await GET();
    assert.equal(res.status, 200, 'GET /api/danh-thuc must return HTTP 200');
    const body = await res.json();
    assert.ok(Array.isArray(body.hang_doi), 'hang_doi must be an array');
    assert.ok(typeof body.con_lai === 'number', 'con_lai must be a number');
    assert.ok(typeof body.tran_moi_phut === 'number', 'tran_moi_phut must be a number');
    assert.ok(typeof body.han_yeu_cau_ms === 'number', 'han_yeu_cau_ms must be a number');

    // batMotLan executes on setImmediate
    await new Promise((r) => setImmediate(r));
    const runnerStatus = getOfficeRunnerStatus();
    assert.equal(runnerStatus.running, true, 'GET /api/danh-thuc must trigger runner startup via batMotLan');
    console.log('  [PASS] Case 1: GET /api/danh-thuc export restored and triggers batMotLan runner startup');
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

  // Case 4: Semantic duplicate within 60s preserves original ma_yeu_cau and ma_o of old item even if seat moved
  {
    // Simulate seat moving to a different slot in UI during retry window
    datO('o-2', testSeat, null);

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
      bodyDup.ma_o,
      'o-1',
      'Duplicate wake must return original item ma_o (o-1), NOT current slot (o-2)'
    );
    assert.equal(
      bodyDup.ma_yeu_cau,
      initialQueueId,
      'Duplicate wake must return real queueId, not wakeId fallback'
    );
    console.log('  [PASS] Case 4: semantic retry within 60s returns status: skipped, original ma_o, and real ma_yeu_cau');
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

  // Case 7: traVeHangDoi does not resurrect discarded ('bo') or already pending ('cho') items
  {
    const discardedId = initialQueueId;
    boYeuCau(discardedId, 'test_cancelled');
    const queueAfterBo = xemSo().hang_doi.find((x) => x.ma === discardedId);
    assert.equal(queueAfterBo?.trang_thai, 'bo');

    // Attempt to return 'bo' item to queue
    const reverted = traVeHangDoi(discardedId);
    assert.equal(reverted, false, 'traVeHangDoi must return false when attempting to revert item in bo status');

    const queueFinal = xemSo().hang_doi.find((x) => x.ma === discardedId);
    assert.equal(queueFinal?.trang_thai, 'bo', 'Item status must remain bo');
    console.log('  [PASS] Case 7: traVeHangDoi safely refuses to resurrect discarded (bo) items');
  }

  // Case 8: Embedded wake in /api/runs sanitizes legacy custom: keys
  {
    const legacyWakeId = 'wake-legacy-custom-test';
    const legacyRunId = 'run-legacy-custom-test';
    recordWake({
      wakeId: legacyWakeId,
      seatId: 'test-seat',
      source: 'app',
      requestedAt: new Date().toISOString(),
      idempotencyKey: 'custom:secret-user-prompt-data',
      status: 'claimed',
      runId: legacyRunId,
    });
    recordRun({
      runId: legacyRunId,
      wakeId: legacyWakeId,
      seatId: 'test-seat',
      startedAt: new Date().toISOString(),
      status: 'finished',
    });

    const runsReq = new NextRequest('http://127.0.0.1:4330/api/runs?seat=test-seat');
    const runsRes = await getRunsRoute(runsReq);
    assert.equal(runsRes.status, 200);
    const runsBody = await runsRes.json();
    const foundRun = runsBody.runs.find((r) => r.runId === legacyRunId);
    assert.ok(foundRun);
    assert.ok(foundRun.wake);
    assert.match(foundRun.wake.idempotencyKey, /^[a-f0-9]{32}$/, 'Embedded wake idempotencyKey must be 32-char hex hash');
    assert.ok(!foundRun.wake.idempotencyKey.includes('custom:'), 'Must never leak custom: prefix');
    console.log('  [PASS] Case 8: embedded wake in /api/runs sanitizes legacy custom: key to 32-char SHA-256');
  }

  // Case 9: baoMauChet honors AIBOSS_DATA_DIR: 0 new lines in home operations files
  {
    const homeSoDem = path.join(os.homedir(), 'Operations', 'dem-cua-mat-tin.jsonl');
    const homeKenh = path.join(os.homedir(), 'idea', 'inbox', 'phong-ban-ai-boss', 'BOSS-CHANNEL.md');

    const linesBeforeSoDem = fs.existsSync(homeSoDem)
      ? fs.readFileSync(homeSoDem, 'utf-8').split('\n').length
      : 0;
    const linesBeforeKenh = fs.existsSync(homeKenh)
      ? fs.readFileSync(homeKenh, 'utf-8').split('\n').length
      : 0;

    // Trigger baoMauChet with testDataDir (process.env.AIBOSS_DATA_DIR = testDataDir)
    const deadWake = {
      ma: 'dead-test-' + Date.now(),
      ma_o: 'o-1',
      ma_nhan_su: 'marketing-lead',
      tu_ai: 'tester-check-zero-leak',
      cau_hoi: 'Test dead wake pollution isolation',
      luc: Date.now() - 300000,
      da_xu: false,
    };
    const cua = baoMauChet(deadWake, { toanCuc: Date.now(), cuaO: 0 });
    assert.ok(cua, 'baoMauChet should classify and report');

    // Assert: home files MUST have exactly 0 new lines!
    const linesAfterSoDem = fs.existsSync(homeSoDem)
      ? fs.readFileSync(homeSoDem, 'utf-8').split('\n').length
      : 0;
    const linesAfterKenh = fs.existsSync(homeKenh)
      ? fs.readFileSync(homeKenh, 'utf-8').split('\n').length
      : 0;

    assert.equal(linesAfterSoDem, linesBeforeSoDem, 'Home dem-cua-mat-tin.jsonl must have 0 new lines when AIBOSS_DATA_DIR is set');
    assert.equal(linesAfterKenh, linesBeforeKenh, 'Home BOSS-CHANNEL.md must have 0 new lines when AIBOSS_DATA_DIR is set');

    // Assert: isolation target files inside testDataDir MUST receive the record
    const isolatedSoDem = path.join(testDataDir, 'dem-cua-mat-tin.jsonl');
    const isolatedKenh = path.join(testDataDir, 'BOSS-CHANNEL.md');
    assert.ok(fs.existsSync(isolatedSoDem), 'dem-cua-mat-tin.jsonl must be written inside AIBOSS_DATA_DIR');
    assert.ok(fs.existsSync(isolatedKenh), 'BOSS-CHANNEL.md must be written inside AIBOSS_DATA_DIR');

    const soDemContent = fs.readFileSync(isolatedSoDem, 'utf-8');
    assert.ok(soDemContent.includes(deadWake.ma), 'Isolated so-dem must contain dead wake record');

    console.log('  [PASS] Case 9: baoMauChet writes to AIBOSS_DATA_DIR with 0 leaks to home operations files');
  }

  console.log('>>> ALL DANH-THUC ROUTE TEST CASES PASSED <<<');
} finally {
  stopOfficeRunner();
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch {
    /* ignore cleanup */
  }
}
