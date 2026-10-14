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

// Unref watchdog timers (>= 60s, e.g. hanGio 600s) so they don't keep the test process alive after completion
const origSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = function (fn, ms, ...args) {
  const timer = origSetTimeout(fn, ms, ...args);
  if (typeof ms === 'number' && ms >= 60_000) {
    timer.unref?.();
  }
  return timer;
};

// Create mock Claude runner script for testing real child process lifecycles
const mockClaudePath = path.join(testDataDir, 'mock-claude.js');
fs.mkdirSync(testDataDir, { recursive: true });
fs.writeFileSync(
  mockClaudePath,
  `#!/usr/bin/env node
const mode = process.env.TEST_MOCK_CLAUDE_MODE || 'sleep-then-exit-0';
const sessionId = process.env.TEST_MOCK_SESSION_ID || 'a3333333-3333-3333-3333-333333333333';

process.stdin.on('data', () => {});
process.stdin.on('error', () => {});
process.on('SIGTERM', () => {
  setTimeout(() => {
    process.exit(0);
  }, 200);
});

// 1. Emit session_id
process.stdout.write(JSON.stringify({ type: 'system', session_id: sessionId }) + '\\n');

// 2. Stream chunk
process.stdout.write(JSON.stringify({
  type: 'stream_event',
  event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello from mock child process' } }
}) + '\\n');

if (mode === 'sleep-then-exit-0') {
  setTimeout(() => {
    process.stdout.write(JSON.stringify({ type: 'result', total_cost_usd: 0.001 }) + '\\n');
    process.exit(0);
  }, 400);
} else if (mode === 'sleep-long') {
  setTimeout(() => {
    process.stdout.write(JSON.stringify({ type: 'result', total_cost_usd: 0.001 }) + '\\n');
    process.exit(0);
  }, 2000);
} else if (mode === 'exit-1') {
  setTimeout(() => {
    process.stderr.write('Mock process non-zero exit\\n');
    process.exit(1);
  }, 150);
} else if (mode === 'result-error') {
  setTimeout(() => {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: true, errors: ['Mock agent error'] }) + '\\n');
    process.exit(1);
  }, 150);
}
`,
  { mode: 0o755 }
);

// Instruct chay-agent to use our mock script
process.env.DUONG_DAN_CLAUDE = mockClaudePath;

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
  setLegacyPrefixFilterForTest,
  setDisableViewerGoneGuardForTest,
  setBypassSlotGateForTest,
  xoaCacheCwd,
} from '../src/lib/doc-phien.ts';
import {
  recordRun,
  updateRun,
  getRun,
  getRuns,
  mergeRunRecordPair,
  generateRunOrWakeId,
} from '../src/lib/runs-ledger.ts';
import { stopOfficeRunner } from '../src/lib/office-runner.ts';
import { gietViec } from '../src/lib/kho-tien-trinh.ts';
import { readSeatActive } from '../src/lib/seat-active.ts';
import { GET as getPhienRoute } from '../src/app/api/phien/route.ts';
import { POST as postChatRoute } from '../src/app/api/chat/route.ts';

console.log('--- Testing Session Discovery, History, Isolation and Run Status (S15 v03) ---');

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

    // Simulate truncated directory name with hash suffix (e.g. >= 180 chars)
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
  // T2: Multi-Directory Discovery (≥ 50 dirs), Missing CWD Fail-Closed, & Isolation
  // =========================================================================
  {
    console.log('\n[TEST T2] Multi-Directory Discovery (≥ 50 dirs) & Missing CWD Fail-Closed:');

    // Create 52 fake project directories to trigger > 50 entry threshold
    for (let i = 0; i < 50; i++) {
      const dummyDir = path.join(fakeProjectsDir, `unrelated-project-dir-${i}`);
      fs.mkdirSync(dummyDir, { recursive: true });
      fs.writeFileSync(
        path.join(dummyDir, `session-dummy-${i}.jsonl`),
        JSON.stringify({ type: 'user', cwd: `/some/other/path/${i}` }) + '\n'
      );
    }

    // Directory 50: arbitrary name not matching any prefix heuristic, but cwd matches seat
    const t2ArbitrarySessionId = 'a8888888-8888-8888-8888-888888888888';
    const arbitraryDir = path.join(fakeProjectsDir, 'completely-random-unmatched-dir-hash-9876543210');
    fs.mkdirSync(arbitraryDir, { recursive: true });
    const arbitraryTranscript = path.join(arbitraryDir, `${t2ArbitrarySessionId}.jsonl`);
    fs.writeFileSync(
      arbitraryTranscript,
      [
        JSON.stringify({
          type: 'user',
          userType: 'external',
          message: { content: 'Phiên trong thư mục tên ngẫu nhiên' },
          cwd: seatWorkDir,
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: 'Trả lời từ thư mục ngẫu nhiên' },
        }),
      ].join('\n')
    );

    // Directory 51: First file missing cwd (fail-closed), second file valid
    const t2SecondSessionId = 'a9999999-9999-9999-9999-999999999999';
    const multiFileDir = path.join(fakeProjectsDir, 'multi-file-mixed-dir');
    fs.mkdirSync(multiFileDir, { recursive: true });
    // First file: corrupted / missing cwd
    fs.writeFileSync(
      path.join(multiFileDir, 'first-corrupted.jsonl'),
      '{"type":"assistant","message":{"content":"No cwd field here"}}\n'
    );
    // Second file: valid session
    fs.writeFileSync(
      path.join(multiFileDir, `${t2SecondSessionId}.jsonl`),
      [
        JSON.stringify({
          type: 'user',
          userType: 'external',
          message: { content: 'Phiên thứ hai sau tệp lỗi' },
          cwd: seatWorkDir,
        }),
      ].join('\n')
    );

    // Foreign directory: matches seat name suffix but foreign cwd
    const foreignSessionId = 'a2222222-3333-4444-5555-666666666666';
    const foreignProjectDir = path.join(fakeProjectsDir, '-private-tmp-other-clone-seats-content-writer');
    fs.mkdirSync(foreignProjectDir, { recursive: true });
    fs.writeFileSync(
      path.join(foreignProjectDir, `${foreignSessionId}.jsonl`),
      JSON.stringify({
        type: 'user',
        userType: 'external',
        message: { content: 'Foreign session' },
        cwd: '/private/tmp/other-clone/departments/marketing/seats/content-writer',
      }) + '\n'
    );

    // Clear cwd cache before discovery test
    xoaCacheCwd();

    // In production mode: all directories scanned without name filtering
    const list = dsPhien(seatId);
    assert.ok(
      list.some((p) => p.ma === t2ArbitrarySessionId),
      'Session in arbitrary directory name MUST be discovered in >=50 dirs'
    );
    assert.ok(
      list.some((p) => p.ma === t2SecondSessionId),
      'Second session in multi-file dir MUST be discovered even if first file lacks cwd'
    );
    assert.equal(
      list.some((p) => p.ma === 'first-corrupted'),
      false,
      'Transcript missing cwd MUST be rejected (fail-closed)'
    );
    assert.equal(
      list.some((p) => p.ma === foreignSessionId),
      false,
      'Foreign clone transcript MUST be rejected despite matching suffix'
    );

    // Counter-proof: enable legacy prefix filtering
    setLegacyPrefixFilterForTest(true);
    const legacyList = dsPhien(seatId);
    assert.equal(
      legacyList.some((p) => p.ma === t2ArbitrarySessionId),
      false,
      'Counter-proof: Legacy prefix filter drops session in arbitrary directory name'
    );
    setLegacyPrefixFilterForTest(false);

    console.log('  [PASS] T2: Multi-directory discovery (52 dirs), fail-closed missing cwd, and cross-clone isolation.');
    console.log('  [PASS] T2 Counter-proof: Legacy prefix filtering drops arbitrary directory name.');
  }

  // =========================================================================
  // T3: Real Child Process Lifecycle, SSE Disconnect, and Status Accuracy
  // =========================================================================
  {
    console.log('\n[TEST T3] Real Child Process Lifecycle & SSE Cancel:');

    // Part 1: Viewer cancels SSE while child process is alive -> run remains running, then finishes on exit 0
    {
      const liveSessionId = 'a3333333-3333-3333-3333-111111111111';
      process.env.TEST_MOCK_CLAUDE_MODE = 'sleep-then-exit-0';
      process.env.TEST_MOCK_SESSION_ID = liveSessionId;

      const req = new NextRequest('http://127.0.0.1:4330/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_o: 'o-1',
          ma_nhan_su: seatId,
          cau_hoi: 'Kiểm tra vòng đời SSE khi người xem ngắt kết nối',
        }),
      });

      const res = await postChatRoute(req);
      assert.equal(res.status, 200, 'POST /api/chat must return 200 SSE stream');
      const reader = res.body.getReader();

      // Read chunks until 'da-noi-mach' (which is emitted right after 'phien' saves metadata)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        if (text.includes('da-noi-mach')) break;
      }

      // 1. Assert metadata .json was persisted IMMEDIATELY upon receiving sessionId
      const metaPath = path.join(testDataDir, 'sessions', seatId, `${liveSessionId}.json`);
      assert.ok(fs.existsSync(metaPath), 'Metadata .json MUST be saved immediately when session ID is received');
      const metaInit = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      assert.equal(metaInit.ma, liveSessionId);
      assert.equal(metaInit.ma_nhan_su, seatId);
      const runId = metaInit.run_id;
      assert.ok(runId, 'run_id must be recorded in metadata');

      // 2. Cancel SSE stream while child process is STILL LIVING in background
      await reader.cancel();

      // Assert immediately after cancel:
      // - Run status is STILL 'running'!
      // - Active PID on seat is NOT cleared!
      const runWhileLiving = getRun(runId);
      assert.equal(runWhileLiving?.status, 'running', 'Run MUST remain running immediately after viewer disconnects');
      const activeWhileLiving = readSeatActive(seatId);
      assert.ok(activeWhileLiving?.pid, 'Active PID MUST NOT be cleared while child process is alive');

      // 3. Wait for child process to finish exit 0 (sleep is 400ms)
      await new Promise((r) => setTimeout(r, 450));

      // Assert after child exit 0:
      // - Run status transitioned to 'finished'!
      // - exitCode is 0!
      // - Active PID is now cleared!
      const runAfterExit = getRun(runId);
      assert.equal(runAfterExit?.status, 'finished', 'Run status MUST transition to finished when child exits 0');
      assert.equal(runAfterExit?.exitCode, 0);
      assert.ok(runAfterExit?.finishedAt);
      const activeAfterExit = readSeatActive(seatId);
      assert.equal(activeAfterExit?.pid, null, 'Active PID MUST be cleared when child exits');
      console.log('  [PASS] T3 Part 1: Viewer cancel preserves running status; child exit 0 marks finished.');
    }

    // Part 2: Counter-proof: Disabling viewerGone guard causes SSE cancel to fail run
    {
      setDisableViewerGoneGuardForTest(true);
      const counterSessionId = 'a3333333-3333-3333-3333-222222222222';
      process.env.TEST_MOCK_CLAUDE_MODE = 'sleep-then-exit-0';
      process.env.TEST_MOCK_SESSION_ID = counterSessionId;

      const reqCounter = new NextRequest('http://127.0.0.1:4330/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_o: 'o-1',
          ma_nhan_su: seatId,
          cau_hoi: 'Đối chứng khi không có viewerGone guard',
        }),
      });

      const resCounter = await postChatRoute(reqCounter);
      const readerCounter = resCounter.body.getReader();
      while (true) {
        const { value, done } = await readerCounter.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        if (text.includes('da-noi-mach')) break;
      }

      const metaPathCounter = path.join(testDataDir, 'sessions', seatId, `${counterSessionId}.json`);
      assert.ok(fs.existsSync(metaPathCounter));
      const runIdCounter = JSON.parse(fs.readFileSync(metaPathCounter, 'utf8')).run_id;

      // Cancel reader without viewerGone guard
      await readerCounter.cancel();
      await new Promise((r) => setTimeout(r, 80));

      // Without viewerGone guard, enqueue exception causes daCoLoi = true
      // and when child exits, isClean is false -> status becomes failed
      await new Promise((r) => setTimeout(r, 400));
      const runCounter = getRun(runIdCounter);
      assert.equal(
        runCounter?.status,
        'failed',
        'Counter-proof: Disabling viewerGone guard causes enqueue failure to mark run as failed'
      );
      setDisableViewerGoneGuardForTest(false);
      console.log('  [PASS] T3 Part 2 Counter-proof: Disabling viewerGone guard causes cancel to downgrade to failed.');
    }

    // Part 3: Child process exit 1 marks run as failed
    {
      const failSessionId = 'a3333333-3333-3333-3333-333333333333';
      process.env.TEST_MOCK_CLAUDE_MODE = 'exit-1';
      process.env.TEST_MOCK_SESSION_ID = failSessionId;

      const reqFail = new NextRequest('http://127.0.0.1:4330/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ma_o: 'o-1',
          ma_nhan_su: seatId,
          cau_hoi: 'Kiểm tra tiến trình thoát lỗi exit 1',
        }),
      });

      const resFail = await postChatRoute(reqFail);
      const readerFail = resFail.body.getReader();
      while (true) {
        const { done } = await readerFail.read();
        if (done) break;
      }
      await new Promise((r) => setTimeout(r, 200));

      const metaFailPath = path.join(testDataDir, 'sessions', seatId, `${failSessionId}.json`);
      assert.ok(fs.existsSync(metaFailPath));
      const runIdFail = JSON.parse(fs.readFileSync(metaFailPath, 'utf8')).run_id;

      const runFail = getRun(runIdFail);
      assert.equal(runFail?.status, 'failed', 'Child process exit 1 MUST mark run failed');
      assert.equal(runFail?.exitCode, 1);
      assert.equal(runFail?.errorKind, 'exit_nonzero');
      console.log('  [PASS] T3 Part 3: Child exit 1 accurately recorded as failed with exit_nonzero.');
    }

    // Part 4: Terminal status downgrade prevention in runs-ledger
    {
      const ledgerRunId = generateRunOrWakeId('run');
      recordRun({
        runId: ledgerRunId,
        seatId,
        startedAt: new Date().toISOString(),
        status: 'running',
      });
      updateRun(ledgerRunId, { status: 'failed', exitCode: 1, finishedAt: new Date().toISOString() });
      assert.equal(getRun(ledgerRunId)?.status, 'failed');

      // Attempt downgrade failed -> finished
      updateRun(ledgerRunId, { status: 'finished', exitCode: 0 });
      assert.equal(getRun(ledgerRunId)?.status, 'failed');

      // Attempt downgrade failed -> running
      updateRun(ledgerRunId, { status: 'running' });
      assert.equal(getRun(ledgerRunId)?.status, 'failed');

      // Folding protection
      const folded = mergeRunRecordPair(
        { type: 'run', runId: 'f1', seatId, startedAt: '', status: 'failed', exitCode: 1 },
        { type: 'run', runId: 'f1', seatId, startedAt: '', status: 'finished', exitCode: 0 }
      );
      assert.equal(folded.status, 'failed');
      console.log('  [PASS] T3 Part 4: Terminal status downgrade prevention in runs-ledger verified.');
    }
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
    const padding = padChunk.repeat(80); // ~320KB

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
  // T6: coPhien and mocTepPhien queries
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

  // =========================================================================
  // T7: Slot Conflict Rejection Lifecycle & Single Terminal Assertion (S15b)
  // =========================================================================
  {
    console.log('\n[TEST T7] Slot Conflict Rejection Lifecycle & Single Terminal Assertion:');
    const t7SessionId1 = 'a7777771-7777-7777-7777-777777777771';
    const t7SessionId2 = 'a7777772-7777-7777-7777-777777777772';
    process.env.TEST_MOCK_CLAUDE_MODE = 'sleep-long';
    process.env.TEST_MOCK_SESSION_ID = t7SessionId1;

    // 1. Start Turn 1 on slot 'o-conflict'
    const req1 = new NextRequest('http://127.0.0.1:4330/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ma_o: 'o-2',
        ma_nhan_su: seatId,
        cau_hoi: 'Lượt 1 đang chạy trên ô o-2',
      }),
    });

    const res1 = await postChatRoute(req1);
    assert.equal(res1.status, 200);
    const reader1 = res1.body.getReader();

    // Read until Turn 1 establishes session and registers in slot
    while (true) {
      const { value, done } = await reader1.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      if (text.includes('da-noi-mach')) break;
    }

    // Turn 1 is now living in slot 'o-2'
    // 2. Start Turn 2 on the SAME slot 'o-2' while Turn 1 is alive
    // Enable bypassSlotGate to simulate race condition bypassing outer gate and exercising dangKyViec conflict rejection
    setBypassSlotGateForTest(true);
    process.env.TEST_MOCK_SESSION_ID = t7SessionId2;
    const req2 = new NextRequest('http://127.0.0.1:4330/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ma_o: 'o-2',
        ma_nhan_su: seatId,
        phien_moi: true,
        cau_hoi: 'Lượt 2 bị từ chối vì ô đang bận',
      }),
    });

    const res2 = await postChatRoute(req2);
    setBypassSlotGateForTest(false);
    assert.equal(res2.status, 200);
    const reader2 = res2.body.getReader();

    // Read until Turn 2 receives rejection error
    let receivedRejectionError = false;
    while (true) {
      const { value, done } = await reader2.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      if (text.includes('Ô này ĐANG CHẠY một lượt khác')) {
        receivedRejectionError = true;
        break;
      }
    }
    assert.ok(receivedRejectionError, 'Turn 2 must receive slot conflict rejection SSE error');

    // Find runId for Turn 2 from runs ledger (most recent run for seat)
    const runsList = getRuns({ seat: seatId, limit: 10 });
    assert.ok(runsList.length > 0, 'Runs ledger must contain runs for seat');
    const run2 = runsList[0];
    const run2Id = run2.runId;

    // Critical assertion (Hermes Finding 3):
    // Turn 2's child process is still living / closing in background.
    // Turn 2 MUST NOT have finishedAt yet! Status must remain 'running' until child actually exits.
    const run2Immediate = getRun(run2Id);
    assert.equal(run2Immediate?.status, 'running', 'Turn 2 run status MUST remain running before child terminates');
    assert.equal(run2Immediate?.finishedAt, undefined, 'Turn 2 run MUST NOT have finishedAt before child terminates');

    // 3. Wait for Turn 2 child to terminate (SIGTERM was sent by guiLenhDung)
    await new Promise((r) => setTimeout(r, 350));

    // After child process terminates:
    // Turn 2 MUST transition to 'failed' via khiChet
    const run2AfterExit = getRun(run2Id);
    assert.equal(run2AfterExit?.status, 'failed', 'Turn 2 run status MUST transition to failed via khiChet');
    assert.ok(run2AfterExit?.finishedAt, 'Turn 2 run MUST have finishedAt recorded by khiChet');
    assert.equal(run2AfterExit?.errorKind, 'result_error', 'Turn 2 errorKind must be result_error');

    // 4. Assert terminal record was written EXACTLY ONCE in ledger
    const runsDir = path.join(testDataDir, 'runs');
    let terminalCount = 0;
    if (fs.existsSync(runsDir)) {
      const runFiles = fs.readdirSync(runsDir).filter((f) => f.endsWith('.jsonl'));
      for (const f of runFiles) {
        const lines = fs.readFileSync(path.join(runsDir, f), 'utf8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.runId === run2Id && (parsed.status === 'failed' || parsed.status === 'finished')) {
              terminalCount++;
            }
          } catch { /* ignore */ }
        }
      }
    }
    assert.equal(terminalCount, 1, 'Terminal status for rejected child MUST be recorded EXACTLY ONCE');

    // Cancel readers and stop Turn 1 child
    gietViec('o-2');
    await reader1.cancel();
    await reader2.cancel();
    await new Promise((r) => setTimeout(r, 450));
    console.log('  [PASS] T7: Child rejection preserves running until close; terminal recorded EXACTLY ONCE.');
  }

  console.log('\n================================================================');
  console.log('ALL S15b TESTS PASSED WITH RIGOROUS POSITIVE & COUNTER PROOFS');
  console.log('================================================================');
} finally {
  stopOfficeRunner();
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}
