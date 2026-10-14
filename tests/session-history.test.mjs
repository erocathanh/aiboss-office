import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server.js';

// Isolate test data directory and Claude CLI config directory
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-sessions-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;
process.env.CLAUDE_CONFIG_DIR = path.join(testDataDir, 'fake-claude');

import {
  layThuMucData,
  gocKhoClaude,
  thuMucAgent,
  maHoaDuongDan,
  cacKhoPhienCua,
  layCwdTep,
  thuocVeGhe,
  timTepPhien,
  luuMetadataPhien,
  saoChepBanGhiPhien,
  dsPhien,
  lichSuPhien,
  coPhien,
  mocTepPhien,
} from '../src/lib/doc-phien.ts';
import {
  recordRun,
  updateRun,
  getRun,
  mergeRunRecordPair,
  generateRunOrWakeId,
} from '../src/lib/runs-ledger.ts';
import { GET as getPhienRoute } from '../src/app/api/phien/route.ts';

console.log('--- Testing Session Discovery, History, Isolation and Run Status (S15 v02) ---');

try {
  const seatId = 'content-writer';
  const seatWorkDir = thuMucAgent(seatId);

  // Setup fake Claude projects dir
  const fakeProjectsDir = gocKhoClaude();
  fs.mkdirSync(fakeProjectsDir, { recursive: true });

  // =========================================================================
  // T1: Long path test with CLI truncation and hash suffix (e.g. -tskv24)
  // =========================================================================
  {
    console.log('\n[TEST T1] Long Path Discovery with CLI Truncation & Transcript Verification:');
    const t1SessionId = 'a1111111-2222-3333-4444-555555555555';

    // Simulate truncated directory name with hash suffix (e.g. >= 200 chars)
    const longTruncatedDirName =
      '-private-tmp-claude-501--Users-erocathanh-DU-AN-aiboss-office-agents-claude-aiboss-office-pm-a5a73838-2e08-4067-a867-7db53ccd35b6-scratchpad-may-moi-142656-aiboss-office-departments-marketing-seats-co-tskv24';
    assert.ok(longTruncatedDirName.length >= 180, 'Simulated directory name must be long and truncated');

    const projectDir = path.join(fakeProjectsDir, longTruncatedDirName);
    fs.mkdirSync(projectDir, { recursive: true });
    const transcriptPath = path.join(projectDir, `${t1SessionId}.jsonl`);

    // Write transcript with matching cwd inside jsonl
    const transcriptContent = [
      JSON.stringify({
        type: 'user',
        userType: 'external',
        message: { content: 'Câu hỏi trên đường dài' },
        cwd: seatWorkDir,
        timestamp: new Date(Date.now() - 30000).toISOString(),
      }),
      JSON.stringify({
        type: 'assistant',
        message: { content: 'Câu trả lời đầy đủ của Claude trên đường dài.' },
        timestamp: new Date(Date.now() - 20000).toISOString(),
      }),
    ].join('\n');
    fs.writeFileSync(transcriptPath, transcriptContent, 'utf8');

    // Save durable metadata
    luuMetadataPhien(seatId, t1SessionId, 'Câu hỏi trên đường dài', 'run-t1');

    // 1. timTepPhien finds the file across truncated directory
    const foundPath = timTepPhien(seatId, t1SessionId);
    assert.ok(foundPath, 'timTepPhien must find transcript in truncated directory');
    assert.equal(foundPath, transcriptPath);

    // 2. GET /api/phien returns session with size_bytes > 0 and transcript: 'found'
    const reqList = new NextRequest(`http://127.0.0.1:4330/api/phien?ma_nhan_su=${seatId}`);
    const resList = await getPhienRoute(reqList);
    assert.equal(resList.status, 200);
    const bodyList = await resList.json();
    const phienT1 = bodyList.phien.find((p) => p.ma === t1SessionId);
    assert.ok(phienT1, 'Session T1 must appear in session list');
    assert.ok(phienT1.size_bytes > 0, `size_bytes must be > 0 (got ${phienT1.size_bytes})`);
    assert.equal(phienT1.transcript, 'found');

    // 3. GET /api/phien with ma_phien returns Claude assistant response
    const reqDetail = new NextRequest(`http://127.0.0.1:4330/api/phien?ma_nhan_su=${seatId}&ma_phien=${t1SessionId}`);
    const resDetail = await getPhienRoute(reqDetail);
    assert.equal(resDetail.status, 200);
    const bodyDetail = await resDetail.json();
    assert.ok(Array.isArray(bodyDetail.lich_su) && bodyDetail.lich_su.length >= 2);
    assert.equal(bodyDetail.lich_su[0].ai, 'toi');
    assert.equal(bodyDetail.lich_su[0].chu, 'Câu hỏi trên đường dài');
    assert.equal(bodyDetail.lich_su[1].ai, 'ho');
    assert.equal(bodyDetail.lich_su[1].chu, 'Câu trả lời đầy đủ của Claude trên đường dài.');

    // 4. Đối chứng (Counter-proof): path guessing via maHoaDuongDan fails for truncated folders
    const guessedPath = path.join(fakeProjectsDir, maHoaDuongDan(seatWorkDir), `${t1SessionId}.jsonl`);
    assert.equal(fs.existsSync(guessedPath), false, 'Path guessing MUST fail for truncated directory names');

    console.log('  [PASS] T1: Transcript located by UUID, verified cwd, read full conversation (>0 bytes).');
    console.log('  [PASS] T1 Counter-proof: Direct path guessing failed as expected on truncated path.');
  }

  // =========================================================================
  // T2: Cross-clone isolation test (rejecting different clone with same seat name)
  // =========================================================================
  {
    console.log('\n[TEST T2] Cross-Clone Isolation via cwd Verification:');
    const t2SessionId = 'a2222222-3333-4444-5555-666666666666';
    const foreignCloneWorkDir = '/private/tmp/other-clone/departments/marketing/seats/content-writer';

    // Create a foreign directory in ~/.claude/projects/ with matching seat suffix
    const foreignProjectDir = path.join(fakeProjectsDir, '-private-tmp-other-clone-seats-content-writer');
    fs.mkdirSync(foreignProjectDir, { recursive: true });
    const foreignTranscriptPath = path.join(foreignProjectDir, `${t2SessionId}.jsonl`);

    const foreignContent = [
      JSON.stringify({
        type: 'user',
        userType: 'external',
        message: { content: 'Dữ liệu bí mật của clone khác' },
        cwd: foreignCloneWorkDir,
        timestamp: new Date().toISOString(),
      }),
    ].join('\n');
    fs.writeFileSync(foreignTranscriptPath, foreignContent, 'utf8');

    // 1. thuocVeGhe must reject foreign transcript
    assert.equal(thuocVeGhe(foreignTranscriptPath, seatId), false, 'thuocVeGhe must return false for foreign cwd');

    // 2. timTepPhien must not return foreign transcript for this seat
    assert.equal(timTepPhien(seatId, t2SessionId), null, 'timTepPhien must return null for foreign session');

    // 3. dsPhien must not include foreign session
    const list = dsPhien(seatId);
    assert.equal(list.some((p) => p.ma === t2SessionId), false, 'dsPhien must NOT include foreign clone session');

    // 4. API detail route must return empty transcript for foreign session
    const reqForeign = new NextRequest(`http://127.0.0.1:4330/api/phien?ma_nhan_su=${seatId}&ma_phien=${t2SessionId}`);
    const resForeign = await getPhienRoute(reqForeign);
    const bodyForeign = await resForeign.json();
    assert.deepEqual(bodyForeign.lich_su, [], 'Detail route must return empty for foreign clone session');

    // 5. Đối chứng (Counter-proof): Suffix matching without cwd check would leak foreign session
    const wouldLeakWithSuffix = path.basename(foreignProjectDir).endsWith('-content-writer');
    assert.ok(wouldLeakWithSuffix, 'Foreign directory indeed has -content-writer suffix');
    console.log('  [PASS] T2: Cross-clone transcript rejected via cwd verification.');
    console.log('  [PASS] T2 Counter-proof: Suffix matching would have leaked the foreign session.');
  }

  // =========================================================================
  // T3: Run status accuracy & terminal downgrade prevention
  // =========================================================================
  {
    console.log('\n[TEST T3] Run Status Accuracy & Downgrade Prevention:');
    const runId = generateRunOrWakeId('run');

    // 1. Record running run
    recordRun({
      runId,
      seatId,
      startedAt: new Date().toISOString(),
      status: 'running',
    });
    assert.equal(getRun(runId)?.status, 'running');

    // 2. Mark run as failed (due to error, exception, or non-zero exit)
    updateRun(runId, {
      status: 'failed',
      exitCode: 1,
      errorKind: 'exit_nonzero',
      finishedAt: new Date().toISOString(),
    });
    assert.equal(getRun(runId)?.status, 'failed');
    assert.equal(getRun(runId)?.exitCode, 1);

    // 3. Attempt to downgrade failed -> finished (simulating buggy finally block)
    updateRun(runId, {
      status: 'finished',
      exitCode: 0,
      finishedAt: new Date().toISOString(),
    });
    const runAfterDowngrade = getRun(runId);
    assert.equal(runAfterDowngrade?.status, 'failed', 'updateRun MUST NOT downgrade failed status to finished');
    assert.equal(runAfterDowngrade?.exitCode, 1, 'exitCode must remain non-zero');

    // 4. Attempt to downgrade failed -> running
    updateRun(runId, { status: 'running' });
    assert.equal(getRun(runId)?.status, 'failed', 'updateRun MUST NOT downgrade terminal status to running');

    // 5. Verify mergeRunRecordPair also protects terminal states during folding
    const olderFailed = {
      type: 'run',
      runId: 'fold-1',
      seatId,
      startedAt: new Date().toISOString(),
      status: 'failed',
      exitCode: 1,
    };
    const newerFinishedPatch = {
      type: 'run',
      runId: 'fold-1',
      seatId,
      startedAt: new Date().toISOString(),
      status: 'finished',
      exitCode: 0,
    };
    const folded = mergeRunRecordPair(olderFailed, newerFinishedPatch);
    assert.equal(folded.status, 'failed', 'mergeRunRecordPair must retain failed status');
    assert.equal(folded.exitCode, 1, 'mergeRunRecordPair must retain failed exitCode');

    // 6. Đối chứng (Counter-proof): Raw Object.assign overwrites failed status
    const rawOverwritten = Object.assign({}, olderFailed, newerFinishedPatch);
    assert.equal(rawOverwritten.status, 'finished', 'Naive overwrite would improperly mark status finished');

    console.log('  [PASS] T3: Run status correctly tracked, terminal status downgrade prevented.');
    console.log('  [PASS] T3 Counter-proof: Raw object assign would have downgraded to finished.');
  }

  // =========================================================================
  // T4: Durable metadata persistence without .jsonl copying
  // =========================================================================
  {
    console.log('\n[TEST T4] Durable Metadata Persistence & Zero .jsonl Copying:');
    const t4SessionId = 'a4444444-5555-6666-7777-888888888888';
    const runId4 = generateRunOrWakeId('run');

    luuMetadataPhien(seatId, t4SessionId, 'Câu hỏi kiểm tra metadata bền', runId4);

    const seatSessionsDir = path.join(testDataDir, 'sessions', seatId);
    const metaPath = path.join(seatSessionsDir, `${t4SessionId}.json`);
    const copiedJsonlPath = path.join(seatSessionsDir, `${t4SessionId}.jsonl`);

    // 1. Metadata .json must exist
    assert.ok(fs.existsSync(metaPath), 'Metadata .json must be created');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    assert.equal(meta.ma, t4SessionId);
    assert.equal(meta.ma_nhan_su, seatId);
    assert.equal(meta.cau_hoi, 'Câu hỏi kiểm tra metadata bền');
    assert.equal(meta.run_id, runId4);
    assert.ok(meta.cwd, 'cwd must be recorded in metadata');

    // 2. .jsonl file must NOT be copied into AIBOSS_DATA_DIR
    assert.equal(fs.existsSync(copiedJsonlPath), false, '.jsonl file MUST NOT be copied to AIBOSS_DATA_DIR');

    // 3. File permissions (0700 dir, 0600 file)
    const dirStat = fs.statSync(seatSessionsDir);
    const fileStat = fs.statSync(metaPath);
    const dirMode = dirStat.mode & 0o777;
    const fileMode = fileStat.mode & 0o777;
    assert.equal(dirMode, 0o700, `Directory permissions must be 0700 (got ${dirMode.toString(8)})`);
    assert.equal(fileMode, 0o600, `File permissions must be 0600 (got ${fileMode.toString(8)})`);

    // 4. Missing transcript status when transcript not on disk
    const list = dsPhien(seatId);
    const phien4 = list.find((p) => p.ma === t4SessionId);
    assert.ok(phien4, 'Metadata session must appear in dsPhien');
    assert.equal(phien4.transcript, 'missing', 'Missing transcript must be marked transcript: missing');
    assert.equal(phien4.size_bytes, 0, 'Missing transcript size_bytes must be 0');

    console.log('  [PASS] T4: Metadata saved with 0700/0600 permissions, zero .jsonl copied, transcript: missing recorded.');
  }

  // =========================================================================
  // T5: docDau fallback for large files (>256KB) where user prompt is at head
  // =========================================================================
  {
    console.log('\n[TEST T5] docDau fallback for large files:');
    const largeSessionId = 'a5555555-6666-7777-8888-999999999999';
    const projectDir = path.join(fakeProjectsDir, maHoaDuongDan(seatWorkDir));
    fs.mkdirSync(projectDir, { recursive: true });
    const largeFilePath = path.join(projectDir, `${largeSessionId}.jsonl`);

    const head = JSON.stringify({
      type: 'user',
      userType: 'external',
      message: { content: 'Câu hỏi trong tệp rất lớn ở đầu' },
      cwd: seatWorkDir,
      timestamp: new Date(Date.now() - 30000).toISOString(),
    }) + '\n';

    const padChunk = JSON.stringify({
      type: 'assistant',
      message: { content: 'x'.repeat(4000) },
      timestamp: new Date().toISOString(),
    }) + '\n';
    const padding = padChunk.repeat(80); // ~320 KB

    fs.writeFileSync(largeFilePath, head + padding, 'utf8');

    const danhSach = dsPhien(seatId);
    const phienLon = danhSach.find((p) => p.ma === largeSessionId);
    assert.ok(phienLon, 'dsPhien must find large session');
    assert.equal(phienLon.tin_cuoi, 'Câu hỏi trong tệp rất lớn ở đầu');
    assert.ok(phienLon.size_bytes > 300000);
    assert.equal(phienLon.transcript, 'found');
    console.log('  [PASS] T5: docDau correctly extracts prompt from head when file exceeds tail window.');
  }

  // =========================================================================
  // T6: coPhien and mocTepPhien tests
  // =========================================================================
  {
    console.log('\n[TEST T6] coPhien and mocTepPhien queries:');
    const t6SessionId = 'a1111111-2222-3333-4444-555555555555';
    assert.equal(coPhien(seatId, t6SessionId), true);
    const moc = mocTepPhien(seatId, t6SessionId);
    assert.ok(typeof moc === 'number' && moc > 0);
    assert.equal(coPhien(seatId, '00000000-0000-0000-0000-000000000000'), false);
    console.log('  [PASS] T6: coPhien and mocTepPhien accurately verify session existence.');
  }

  console.log('\n================================================================');
  console.log('ALL S15 v02 TESTS PASSED WITH RIGOROUS POSITIVE & COUNTER PROOFS');
  console.log('================================================================');
} finally {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
