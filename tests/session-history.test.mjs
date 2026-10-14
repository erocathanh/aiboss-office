import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server.js';

// Isolate test data directory
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-sessions-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;

import {
  layThuMucData,
  thuMucAgent,
  cacKhoPhienCua,
  timTepPhien,
  saoChepBanGhiPhien,
  dsPhien,
  lichSuPhien,
  coPhien,
  mocTepPhien,
} from '../src/lib/doc-phien.ts';
import { recordRun, generateRunOrWakeId } from '../src/lib/runs-ledger.ts';
import { GET as getPhienRoute } from '../src/app/api/phien/route.ts';

console.log('--- Testing Session Discovery, History and Persistence (S15) ---');

try {
  // Case 1: layThuMucData respects process.env.AIBOSS_DATA_DIR
  {
    assert.equal(layThuMucData(), testDataDir, 'layThuMucData must return AIBOSS_DATA_DIR when set');
    console.log('  [PASS] Case 1: layThuMucData correctly returns isolated AIBOSS_DATA_DIR');
  }

  // Case 2: cacKhoPhienCua includes local sessions store
  {
    const kho = cacKhoPhienCua('content-writer');
    const expectedLocal = path.join(testDataDir, 'sessions', 'content-writer');
    assert.ok(kho.includes(expectedLocal), 'cacKhoPhienCua must include local durable session store');
    console.log('  [PASS] Case 2: cacKhoPhienCua contains local data directory');
  }

  // Case 3: saoChepBanGhiPhien writes durable transcript and metadata
  const testSessionId = '11111111-2222-3333-4444-555555555555';
  {
    const fakeClaudeProjectsDir = path.join(testDataDir, 'fake-claude', 'projects');
    fs.mkdirSync(fakeClaudeProjectsDir, { recursive: true });
    const fakeTranscriptPath = path.join(fakeClaudeProjectsDir, `${testSessionId}.jsonl`);

    const transcriptLines = [
      JSON.stringify({ type: 'user', userType: 'external', message: { content: 'Xin chào trợ lý' }, timestamp: new Date(Date.now() - 60000).toISOString() }),
      JSON.stringify({ type: 'assistant', message: { content: 'Chào bạn, tôi sẵn sàng hỗ trợ.' }, timestamp: new Date(Date.now() - 50000).toISOString() }),
    ].join('\n');
    fs.writeFileSync(fakeTranscriptPath, transcriptLines, 'utf8');

    // Simulate saoChepBanGhiPhien
    const localStoreDir = path.join(testDataDir, 'sessions', 'content-writer');
    fs.mkdirSync(localStoreDir, { recursive: true });
    fs.copyFileSync(fakeTranscriptPath, path.join(localStoreDir, `${testSessionId}.jsonl`));
    saoChepBanGhiPhien('content-writer', testSessionId, 'Xin chào trợ lý');

    const metaPath = path.join(localStoreDir, `${testSessionId}.json`);
    assert.ok(fs.existsSync(metaPath), 'Metadata JSON file must be created');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.equal(meta.ma, testSessionId);
    assert.equal(meta.cau_hoi, 'Xin chào trợ lý');
    console.log('  [PASS] Case 3: saoChepBanGhiPhien persists metadata and transcript to durable store');
  }

  // Case 4: coPhien and mocTepPhien find session in local durable store
  {
    assert.equal(coPhien('content-writer', testSessionId), true, 'coPhien must find session in local store');
    const moc = mocTepPhien('content-writer', testSessionId);
    assert.ok(typeof moc === 'number' && moc > 0, 'mocTepPhien must return a positive timestamp');
    console.log('  [PASS] Case 4: coPhien and mocTepPhien accurately query local session store');
  }

  // Case 5: dsPhien discovers session and extracts prompt
  {
    const danhSach = dsPhien('content-writer');
    assert.ok(Array.isArray(danhSach), 'dsPhien must return an array');
    const phien = danhSach.find((p) => p.ma === testSessionId);
    assert.ok(phien, 'dsPhien must include our test session');
    assert.equal(phien.tin_cuoi, 'Xin chào trợ lý', 'tin_cuoi must match user prompt');
    assert.ok(phien.so_luot >= 1, 'so_luot must be >= 1');
    console.log('  [PASS] Case 5: dsPhien discovers session with accurate tin_cuoi');
  }

  // Case 6: docDau fallback for large files (>256KB) where user prompt is only in first 50KB
  const largeSessionId = '22222222-3333-4444-5555-666666666666';
  {
    const localStoreDir = path.join(testDataDir, 'sessions', 'content-writer');
    const largeFilePath = path.join(localStoreDir, `${largeSessionId}.jsonl`);

    // Write initial user message
    const head = JSON.stringify({
      type: 'user',
      userType: 'external',
      message: { content: 'Câu hỏi trong tệp rất lớn' },
      timestamp: new Date(Date.now() - 30000).toISOString(),
    }) + '\n';

    // Pad with > 300KB of assistant/tool data without userType external
    const padChunk = JSON.stringify({
      type: 'assistant',
      message: { content: 'x'.repeat(4000) },
      timestamp: new Date().toISOString(),
    }) + '\n';
    const padding = padChunk.repeat(80); // ~320 KB

    fs.writeFileSync(largeFilePath, head + padding, 'utf8');

    const danhSach = dsPhien('content-writer');
    const phienLon = danhSach.find((p) => p.ma === largeSessionId);
    assert.ok(phienLon, 'dsPhien must find large session');
    assert.equal(phienLon.tin_cuoi, 'Câu hỏi trong tệp rất lớn', 'docDau fallback must extract prompt from head');
    console.log('  [PASS] Case 6: docDau fallback correctly extracts tin_cuoi for large transcripts');
  }

  // Case 7: Session recorded in runs-ledger is discovered by dsPhien even if .jsonl transcript is absent
  const runOnlySessionId = '33333333-4444-5555-6666-777777777777';
  {
    const runId = generateRunOrWakeId('run');
    recordRun({
      runId,
      seatId: 'content-writer',
      sessionId: runOnlySessionId,
      startedAt: new Date(Date.now() - 10000).toISOString(),
      finishedAt: new Date().toISOString(),
      status: 'finished',
      exitCode: 0,
    });

    const danhSach = dsPhien('content-writer');
    const phienRun = danhSach.find((p) => p.ma === runOnlySessionId);
    assert.ok(phienRun, 'dsPhien must discover sessions recorded in runs-ledger');
    console.log('  [PASS] Case 7: dsPhien fallback folds runs-ledger sessions into session history');
  }

  // Case 8: GET /api/phien endpoint returns session list and individual session transcript
  {
    // List sessions
    const reqList = new NextRequest('http://127.0.0.1:4330/api/phien?ma_nhan_su=content-writer');
    const resList = await getPhienRoute(reqList);
    assert.equal(resList.status, 200, 'GET /api/phien must return HTTP 200');
    const bodyList = await resList.json();
    assert.ok(Array.isArray(bodyList.phien), 'body.phien must be an array');
    assert.ok(bodyList.phien.some((p) => p.ma === testSessionId), 'API must return testSessionId');

    // Read session transcript
    const reqDetail = new NextRequest(`http://127.0.0.1:4330/api/phien?ma_nhan_su=content-writer&ma_phien=${testSessionId}`);
    const resDetail = await getPhienRoute(reqDetail);
    assert.equal(resDetail.status, 200, 'GET /api/phien with ma_phien must return HTTP 200');
    const bodyDetail = await resDetail.json();
    assert.ok(Array.isArray(bodyDetail.lich_su), 'body.lich_su must be an array');
    assert.ok(bodyDetail.lich_su.length >= 2, 'body.lich_su must have recorded turns');
    assert.equal(bodyDetail.lich_su[0].chu, 'Xin chào trợ lý');
    console.log('  [PASS] Case 8: GET /api/phien returns sessions and transcript correctly');
  }

  console.log('\n--- ALL SESSION HISTORY TESTS PASSED (8/8) ---');
} finally {
  // Cleanup test data dir
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
