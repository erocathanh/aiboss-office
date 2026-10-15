import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

// 1. ISOLATE DATA DIR: Tests must NEVER touch operations/data or production ledgers
const testDataDir = path.join(
  os.tmpdir(),
  'aiboss-test-approvals-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
);
process.env.AIBOSS_DATA_DIR = testDataDir;
// F21 (v07): Create `.test-ledger` marker file in `<testDataDir>/approvals` so the
// 4-condition test lock-bypass switch can only ever activate inside this isolated test ledger.
const testApprovalsDir = path.join(testDataDir, 'approvals');
fs.mkdirSync(testApprovalsDir, { recursive: true });
if (process.env.AIBOSS_TEST_MARKER_AS_SYMLINK === '1') {
  const realTargetPath = path.join(testDataDir, '.real-marker-target');
  fs.writeFileSync(realTargetPath, 'aiboss-test-ledger-marker\n', 'utf-8');
  fs.symlinkSync(realTargetPath, path.join(testApprovalsDir, '.test-ledger'));
} else {
  fs.writeFileSync(
    path.join(testApprovalsDir, '.test-ledger'),
    'aiboss-test-ledger-marker\n',
    'utf-8'
  );
}

const CASE_17_TRUNCATED_FIXTURE_LINE = '{"ts":"2026-10-14T11:16:00Z","seat":"truncated_frag';

import * as approvalsLedgerModule from '../src/lib/approvals-ledger.ts';
import {
  ApprovalIoError,
  ApprovalLedgerUnreadableError,
  ApprovalLockTimeoutError,
  computeRequestId,
  getApprovalsDir,
  getApprovalLogPathForDate,
  getApprovals,
  getApprovalById,
  parseIsoTimestampMs,
  recordApprovalDecision,
  recordApprovalExecution,
  readApprovalRecords,
  trimAscii,
} from '../src/lib/approvals-ledger.ts';
import { GET as getApprovalsRoute } from '../src/app/api/approvals/route.ts';
import { POST as postDecisionRoute } from '../src/app/api/approvals/[requestId]/decision/route.ts';
import { ApprovalsSettingsCard } from '../src/components/office/ApprovalsSettingsCard.tsx';
import SettingsPage from '../src/app/settings/page.tsx';

const LEDGER_SCRIPT = path.resolve(process.cwd(), 'operations/scripts/approval_ledger.py');
const CHECK_SCRIPT = path.resolve(process.cwd(), 'operations/scripts/approval_check.py');
const MARK_SCRIPT = path.resolve(process.cwd(), 'operations/scripts/approval_mark.py');

function runCheckCli(seat, tool, sha256, extraArgs = []) {
  const res = spawnSync(
    'python3',
    [CHECK_SCRIPT, '--seat', seat, '--tool', tool, '--sha256', sha256, ...extraArgs],
    {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
      encoding: 'utf-8',
    }
  );
  const stdout = (res.stdout || '').trim();
  const parsed = stdout ? JSON.parse(stdout) : null;
  return { status: res.status, body: parsed, rawStdout: stdout, rawStderr: res.stderr };
}

function runCheckCliAsync(seat, tool, sha256, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python3',
      [CHECK_SCRIPT, '--seat', seat, '--tool', tool, '--sha256', sha256, ...extraArgs],
      {
        env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const trimmed = stdout.trim();
      let parsed = null;
      try {
        parsed = trimmed ? JSON.parse(trimmed) : null;
      } catch {
        parsed = null;
      }
      resolve({ status: code, body: parsed, rawStdout: trimmed, rawStderr: stderr });
    });
  });
}

function runMarkCli(requestId, result, runId, claimId) {
  const args = [MARK_SCRIPT, '--request-id', requestId, '--result', result];
  if (runId) {
    args.push('--run-id', runId);
  }
  if (claimId) {
    args.push('--claim-id', claimId);
  }
  const res = spawnSync('python3', args, {
    env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
    encoding: 'utf-8',
  });
  const stdout = (res.stdout || '').trim();
  const parsed = stdout ? JSON.parse(stdout) : null;
  return { status: res.status, body: parsed, rawStdout: stdout, rawStderr: res.stderr };
}

console.log('--- Testing A-4 v08 Approval Ledger & Hook Contract (tests/approvals.test.mjs) ---');

await (async () => {
  try {
    const todayPath = getApprovalLogPathForDate();

    // Case 1: Deterministic requestId formula
    const sampleTs = '2026-10-14T10:00:00Z';
    const sampleSeat = 'email-crm';
    const sampleTool = 'Bash';
    const sampleSha =
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const expectedHash = crypto
      .createHash('sha256')
      .update(`${sampleTs}|${sampleSeat}|${sampleTool}|${sampleSha}`, 'utf8')
      .digest('hex')
      .slice(0, 16);
    const reqId1 = computeRequestId(sampleTs, sampleSeat, sampleTool, sampleSha);
    assert.equal(reqId1, expectedHash);
    assert.equal(reqId1.length, 16);
    console.log(`  [PASS] Case 1: deterministic requestId = ${reqId1}`);

    // Case 2: Seed hook-style request line (no `type` field, plus injected ZEBRA secret field to verify whitelist)
    const hookRequestLine = {
      ts: sampleTs,
      seat: sampleSeat,
      tool: sampleTool,
      host: 'api.sendgrid.com',
      len: 248,
      sha256: sampleSha,
      head60: 'curl -X POST https://api.sendgrid.com/v3/mail/send -d ...',
      reason: 'external_host',
      prompt: 'ZEBRA-SECRET-TURN-TEXT-MUST-NEVER-LEAK',
      rawUsage: { secret: 'ZEBRA-RAW-USAGE' },
    };
    fs.appendFileSync(todayPath, JSON.stringify(hookRequestLine) + '\n', 'utf-8');

    const checkPending = runCheckCli(sampleSeat, sampleTool, sampleSha);
    assert.equal(checkPending.status, 2, 'Pending request must exit 2 in approval_check.py');
    assert.equal(checkPending.body.status, 'pending');
    assert.equal(checkPending.body.requestId, reqId1);
    console.log('  [PASS] Case 2: seeded hook line (without type) is read as pending and approval_check.py exits 2');

    // Case 3: GET /api/approvals?status=pending & whitelist sanitization check
    const getPendingReq = new NextRequest(
      'http://127.0.0.1:4330/api/approvals?status=pending&limit=50',
      { headers: { host: '127.0.0.1:4330' } }
    );
    const getPendingRes = await getApprovalsRoute(getPendingReq);
    assert.equal(getPendingRes.status, 200);
    const getPendingJson = await getPendingRes.json();
    assert.equal(getPendingJson.approvals.length, 1);
    assert.equal(getPendingJson.approvals[0].requestId, reqId1);
    assert.equal(getPendingJson.approvals[0].status, 'pending');
    assert.equal(getPendingJson.approvals[0].state, 'requested');
    assert.equal('prompt' in getPendingJson.approvals[0], false);
    assert.equal('rawUsage' in getPendingJson.approvals[0], false);
    assert.equal(JSON.stringify(getPendingJson).includes('ZEBRA-'), false);
    console.log('  [PASS] Case 3: GET /api/approvals?status=pending returns item with strict field whitelist (0 ZEBRA leaks)');

    // Case 4: POST /api/approvals/<requestId>/decision (approve on localhost when env is unconfigured -> by: "localhost")
    delete process.env.PHONGBAN_USER;
    delete process.env.PHONGBAN_PASS;
    const approveReq = new NextRequest(
      `http://127.0.0.1:4330/api/approvals/${reqId1}/decision`,
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'approved',
          note: 'Approved for small business newsletter dispatch',
        }),
      }
    );
    const approveRes = await postDecisionRoute(approveReq, {
      params: Promise.resolve({ requestId: reqId1 }),
    });
    assert.equal(approveRes.status, 200);
    const approveJson = await approveRes.json();
    assert.equal(approveJson.ok, true);
    assert.equal(approveJson.approval.status, 'approved');
    assert.equal(approveJson.approval.state, 'approved');
    assert.notEqual(approveJson.approval.status, 'executed');
    assert.equal(approveJson.decision.by, 'localhost');
    assert.ok(approveJson.decision.expiresAt);

    // Verify GET /api/approvals?status=approved has the item and GET /api/approvals?status=executed is empty
    const getApprovedRes = await getApprovalsRoute(
      new NextRequest('http://127.0.0.1:4330/api/approvals?status=approved')
    );
    const getApprovedJson = await getApprovedRes.json();
    assert.equal(getApprovedJson.approvals.length, 1);
    assert.equal(getApprovedJson.approvals[0].requestId, reqId1);
    assert.equal(getApprovedJson.approvals[0].status, 'approved');

    const getExecEmptyRes = await getApprovalsRoute(
      new NextRequest('http://127.0.0.1:4330/api/approvals?status=executed')
    );
    const getExecEmptyJson = await getExecEmptyRes.json();
    assert.equal(getExecEmptyJson.approvals.length, 0, 'Approved item must NEVER appear in status=executed');
    console.log('  [PASS] Case 4: POST decision approves request (by="localhost") and never conflates approved with executed');

    // Case 5: approval_check.py exits 0 when approved, unexpired, unexecuted, and sha256 matches
    const checkApproved = runCheckCli(sampleSeat, sampleTool, sampleSha);
    assert.equal(checkApproved.status, 0, 'Approved matching request must exit 0');
    assert.equal(checkApproved.body.status, 'approved');
    assert.equal(checkApproved.body.requestId, reqId1);
    assert.equal(checkApproved.body.expiresAt, approveJson.decision.expiresAt);
    console.log('  [PASS] Case 5: approval_check.py exits 0 with {requestId, status: "approved", expiresAt}');

    // Case 6: Changing 1 character of sha256 -> approval_check.py exits 2 with status: "digest_mismatch"
    const mutatedSha =
      (sampleSha[0] === 'a' ? 'b' : 'a') + sampleSha.slice(1);
    const checkMismatch = runCheckCli(sampleSeat, sampleTool, mutatedSha);
    assert.equal(
      checkMismatch.status,
      2,
      'Mismatched sha256 must exit 2 in approval_check.py'
    );
    assert.equal(
      checkMismatch.body.status,
      'digest_mismatch',
      'Mismatched sha256 must report status="digest_mismatch"'
    );
    assert.equal(checkMismatch.body.requestId, reqId1);
    console.log('  [PASS] Case 6: changing 1 char of sha256 exits 2 with status="digest_mismatch"');

    // Case 7: approval_mark.py records execution and is idempotent on repeat calls
    const recordsBeforeMark = readApprovalRecords().length;
    const markFirst = runMarkCli(reqId1, 'executed', 'run-20261014-0001');
    assert.equal(markFirst.status, 0);
    assert.equal(markFirst.body.status, 'executed');
    assert.equal(markFirst.body.idempotent, false);
    const recordsAfterFirstMark = readApprovalRecords().length;
    assert.equal(recordsAfterFirstMark, recordsBeforeMark + 1);

    const markSecond = runMarkCli(reqId1, 'executed', 'run-20261014-0001');
    assert.equal(markSecond.status, 0);
    assert.equal(markSecond.body.status, 'executed');
    assert.equal(markSecond.body.idempotent, true);
    const recordsAfterSecondMark = readApprovalRecords().length;
    assert.equal(
      recordsAfterSecondMark,
      recordsAfterFirstMark,
      'Idempotent approval_mark.py must not append a duplicate execution line'
    );
    console.log('  [PASS] Case 7: approval_mark.py appends execution line once and is idempotent on repeat calls');

    // Case 8: approval_check.py after mark executed exits 2 (single-use enforcement)
    const checkAfterMark = runCheckCli(sampleSeat, sampleTool, sampleSha);
    assert.equal(
      checkAfterMark.status,
      2,
      'Already-executed request must exit 2 on subsequent approval_check.py'
    );
    assert.equal(checkAfterMark.body.status, 'executed');
    assert.equal(checkAfterMark.body.requestId, reqId1);

    const getExecutedRes = await getApprovalsRoute(
      new NextRequest('http://127.0.0.1:4330/api/approvals?status=executed')
    );
    const getExecutedJson = await getExecutedRes.json();
    assert.equal(getExecutedJson.approvals.length, 1);
    assert.equal(getExecutedJson.approvals[0].requestId, reqId1);
    assert.equal(getExecutedJson.approvals[0].status, 'executed');
    console.log('  [PASS] Case 8: second check after mark exits 2 (status="executed") and API status=executed matches');

    // Case 9: Second non-idempotent execution attempt via recordApprovalExecution is rejected with digest_mismatch (0 lines written)
    const sizeBeforeCase9 = fs.statSync(todayPath).size;
    const secondExecAttempt = recordApprovalExecution({
      requestId: reqId1,
      result: 'executed',
      runId: 'run-20261014-0002',
      idempotent: false,
    });
    assert.equal(secondExecAttempt.ok, false);
    assert.equal(secondExecAttempt.status, 'digest_mismatch');
    assert.equal(fs.statSync(todayPath).size, sizeBeforeCase9, 'Case 9: rejected second execution must write 0 bytes');
    assert.equal(getApprovalById(reqId1)?.status, 'executed');
    console.log('  [PASS] Case 9: second non-idempotent execution on same requestId is rejected as digest_mismatch (0 bytes written)');

    // Case 10: Seeded decision with expiresAt in the past -> derived state is expired, approval_check.py exits 2
    const expiredTs = '2026-10-14T10:05:00Z';
    const expiredSeat = 'paid-media';
    const expiredTool = 'Bash';
    const expiredSha =
      'c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';
    const reqIdExpired = computeRequestId(
      expiredTs,
      expiredSeat,
      expiredTool,
      expiredSha
    );
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: expiredTs,
        seat: expiredSeat,
        tool: expiredTool,
        host: 'ads.example.com',
        len: 120,
        sha256: expiredSha,
        head60: 'curl -X POST https://ads.example.com/v1/campaigns',
        reason: 'external_host',
      }) +
        '\n' +
        JSON.stringify({
          type: 'decision',
          requestId: reqIdExpired,
          decision: 'approved',
          by: 'owner',
          at: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-01-01T01:00:00.000Z',
        }) +
        '\n',
      'utf-8'
    );

    const expiredItem = getApprovalById(reqIdExpired);
    assert.equal(expiredItem?.status, 'expired');
    assert.equal(expiredItem?.state, 'expired');

    const checkExpired = runCheckCli(expiredSeat, expiredTool, expiredSha);
    assert.equal(checkExpired.status, 2, 'Expired approval must exit 2');
    assert.equal(checkExpired.body.status, 'expired');
    assert.equal(checkExpired.body.requestId, reqIdExpired);

    const getExpiredRes = await getApprovalsRoute(
      new NextRequest('http://127.0.0.1:4330/api/approvals?status=expired')
    );
    const getExpiredJson = await getExpiredRes.json();
    assert.equal(
      getExpiredJson.approvals.some((a) => a.requestId === reqIdExpired),
      true
    );
    console.log('  [PASS] Case 10: approval with past expiresAt derives status="expired" and approval_check.py exits 2');

    // Case 11: Fake requestId -> 404; deciding an already-decided requestId -> 409
    const fakeReq = new NextRequest(
      'http://127.0.0.1:4330/api/approvals/0000000000000000/decision',
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }
    );
    const fakeRes = await postDecisionRoute(fakeReq, {
      params: Promise.resolve({ requestId: '0000000000000000' }),
    });
    assert.equal(fakeRes.status, 404, 'Unknown requestId must return HTTP 404');

    const duplicateDecisionReq = new NextRequest(
      `http://127.0.0.1:4330/api/approvals/${reqId1}/decision`,
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'denied' }),
      }
    );
    const duplicateDecisionRes = await postDecisionRoute(duplicateDecisionReq, {
      params: Promise.resolve({ requestId: reqId1 }),
    });
    assert.equal(
      duplicateDecisionRes.status,
      409,
      'Re-deciding an already-decided requestId must return HTTP 409'
    );
    console.log('  [PASS] Case 11: unknown requestId returns 404 and duplicate decision returns 409');

    // Case 12: Configured Basic Auth records by="owner" and decision="denied" exits 2 with status="denied"
    process.env.PHONGBAN_USER = 'owner_admin';
    process.env.PHONGBAN_PASS = 'test_pass_123';
    const deniedTs = '2026-10-14T10:10:00Z';
    const deniedSeat = 'social-community';
    const deniedTool = 'Bash';
    const deniedSha =
      'd4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3';
    const reqIdDenied = computeRequestId(deniedTs, deniedSeat, deniedTool, deniedSha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: deniedTs,
        seat: deniedSeat,
        tool: deniedTool,
        host: 'social.example.com',
        len: 95,
        sha256: deniedSha,
        head60: 'curl -X DELETE https://social.example.com/posts/1',
        reason: 'destructive_flag',
      }) + '\n',
      'utf-8'
    );

    const basicCreds = Buffer.from('owner_admin:test_pass_123', 'utf8').toString('base64');
    const denyReq = new NextRequest(
      `http://127.0.0.1:4330/api/approvals/${reqIdDenied}/decision`,
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          authorization: `Basic ${basicCreds}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'denied',
          note: 'Destructive action rejected by owner',
        }),
      }
    );
    const denyRes = await postDecisionRoute(denyReq, {
      params: Promise.resolve({ requestId: reqIdDenied }),
    });
    assert.equal(denyRes.status, 200);
    const denyJson = await denyRes.json();
    assert.equal(denyJson.decision.by, 'owner');
    assert.equal(denyJson.approval.status, 'denied');

    const checkDenied = runCheckCli(deniedSeat, deniedTool, deniedSha);
    assert.equal(checkDenied.status, 2);
    assert.equal(checkDenied.body.status, 'denied');
    delete process.env.PHONGBAN_USER;
    delete process.env.PHONGBAN_PASS;
    console.log('  [PASS] Case 12: Basic Auth records by="owner", decision="denied" derives denied and exits 2');

    // Case 13: Cross-day folding (request in yesterday's file, decision in today's file)
    const yesterdayDate = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
    const yesterdayPath = path.join(getApprovalsDir(), `${yesterdayDate}.jsonl`);
    const yTs = `${yesterdayDate}T23:50:00Z`;
    const ySeat = 'funnel-offer';
    const yTool = 'Bash';
    const ySha =
      'e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';
    const reqIdYesterday = computeRequestId(yTs, ySeat, yTool, ySha);
    fs.writeFileSync(
      yesterdayPath,
      JSON.stringify({
        ts: yTs,
        seat: ySeat,
        tool: yTool,
        host: 'webhook.example.com',
        len: 80,
        sha256: ySha,
        head60: 'curl -X POST https://webhook.example.com/trigger',
        reason: 'external_host',
      }) + '\n',
      'utf-8'
    );

    const decY = recordApprovalDecision({
      requestId: reqIdYesterday,
      decision: 'approved',
      by: 'owner',
    });
    assert.equal(decY.ok, true);

    const checkYesterdayApproved = runCheckCli(ySeat, yTool, ySha);
    assert.equal(checkYesterdayApproved.status, 0);
    assert.equal(checkYesterdayApproved.body.requestId, reqIdYesterday);
    assert.equal(checkYesterdayApproved.body.status, 'approved');
    console.log('  [PASS] Case 13: cross-day ledger folding (yesterday request + today decision) works in TS & Python');

    // =========================================================================
    // ADVERSARIAL TESTS FOR A-4 v02 (F1 - F9)
    // =========================================================================

    // Case 14 (F1a): approval_mark.py and recordApprovalExecution reject unapproved/denied requests;
    // pre-approval execution lines in ledger never transition state to executed
    const f1aTs = '2026-10-14T11:00:00Z';
    const f1aSeat = 'seat-f1a';
    const f1aTool = 'Bash';
    const f1aSha = '1111111111111111111111111111111111111111111111111111111111111111';
    const reqF1a = computeRequestId(f1aTs, f1aSeat, f1aTool, f1aSha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f1aTs,
        seat: f1aSeat,
        tool: f1aTool,
        host: 'api.example.com',
        len: 64,
        sha256: f1aSha,
        head60: 'curl -X POST https://api.example.com/send',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const sizeBeforeUnapprovedMark = fs.statSync(todayPath).size;
    const markUnapprovedCli = runMarkCli(reqF1a, 'executed');
    assert.equal(markUnapprovedCli.status, 2, 'F1a: approval_mark.py must exit 2 on pending request');
    assert.equal(markUnapprovedCli.body.status, 'pending');
    const markUnapprovedTs = recordApprovalExecution({
      requestId: reqF1a,
      result: 'executed',
    });
    assert.equal(markUnapprovedTs.ok, false);
    assert.equal(markUnapprovedTs.status, 'pending');
    const sizeAfterUnapprovedMark = fs.statSync(todayPath).size;
    assert.equal(sizeAfterUnapprovedMark, sizeBeforeUnapprovedMark, 'F1a: failed mark on pending must write 0 bytes');

    // Also inject a rogue execution line BEFORE decision: "approved" and verify both TS and Python ignore it
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        type: 'execution',
        requestId: reqF1a,
        seatId: f1aSeat,
        at: '2026-10-14T11:01:00.000Z',
        result: 'executed',
        digest: f1aSha,
      }) + '\n',
      'utf-8'
    );
    const decF1a = recordApprovalDecision({
      requestId: reqF1a,
      decision: 'approved',
      by: 'owner',
    });
    assert.equal(decF1a.ok, true);
    assert.equal(getApprovalById(reqF1a)?.status, 'approved', 'F1a: pre-approval execution line must be ignored by TS fold');
    const checkF1a = runCheckCli(f1aSeat, f1aTool, f1aSha);
    assert.equal(checkF1a.status, 0, 'F1a: pre-approval execution line must be ignored by Python fold');
    assert.equal(checkF1a.body.status, 'approved');
    console.log('  [PASS] Case 14 (F1a): mark before approval is rejected (0 bytes written) and pre-approval execution lines are ignored');

    // Case 15 (F1b): Atomic claim/consume under lock — two concurrent `approval_check.py --consume` processes
    // must result in EXACTLY ONE exit 0 and ONE exit 2 (`status: "claimed"`), and `approval_mark.py --claim-id`
    // only accepts the winning `claimId`.
    const f1bTs = '2026-10-14T11:05:00Z';
    const f1bSeat = 'seat-f1b-concurrent';
    const f1bTool = 'Bash';
    const f1bSha = '2222222222222222222222222222222222222222222222222222222222222222';
    const reqF1b = computeRequestId(f1bTs, f1bSeat, f1bTool, f1bSha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f1bTs,
        seat: f1bSeat,
        tool: f1bTool,
        host: 'api.example.com',
        len: 64,
        sha256: f1bSha,
        head60: 'curl -X POST https://api.example.com/concurrent',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqF1b,
      decision: 'approved',
      by: 'owner',
    });

    const [cRes1, cRes2] = await Promise.all([
      runCheckCliAsync(f1bSeat, f1bTool, f1bSha, ['--consume']),
      runCheckCliAsync(f1bSeat, f1bTool, f1bSha, ['--consume']),
    ]);
    const exitZeroList = [cRes1, cRes2].filter((r) => r.status === 0);
    const exitTwoList = [cRes1, cRes2].filter((r) => r.status === 2);
    assert.equal(
      exitZeroList.length,
      1,
      `F1b: Expected exactly 1 concurrent --consume to exit 0, got ${exitZeroList.length} (cRes1=${cRes1.status}, cRes2=${cRes2.status})`
    );
    assert.equal(
      exitTwoList.length,
      1,
      `F1b: Expected exactly 1 concurrent --consume to exit 2, got ${exitTwoList.length}`
    );
    const winningClaimId = exitZeroList[0].body.claimId;
    assert.ok(winningClaimId && winningClaimId.length === 16, 'F1b: winner must receive 16-hex claimId');
    assert.equal(exitTwoList[0].body.status, 'claimed');
    assert.equal(exitTwoList[0].body.claimId, winningClaimId);

    // Subsequent check without --consume also sees status="claimed" and exits 2
    const checkAfterClaim = runCheckCli(f1bSeat, f1bTool, f1bSha);
    assert.equal(checkAfterClaim.status, 2);
    assert.equal(checkAfterClaim.body.status, 'claimed');

    // Marking with wrong claimId or missing claimId must be rejected (exit 2)
    const markWrongClaim = runMarkCli(reqF1b, 'executed', 'run-f1b', '0000000000000000');
    assert.equal(markWrongClaim.status, 2);
    assert.equal(markWrongClaim.body.status, 'claim_mismatch');
    const markMissingClaim = runMarkCli(reqF1b, 'executed', 'run-f1b');
    assert.equal(markMissingClaim.status, 2);
    assert.equal(markMissingClaim.body.status, 'claim_mismatch');

    // Marking with the winning claimId succeeds (exit 0)
    const markValidClaim = runMarkCli(reqF1b, 'executed', 'run-f1b', winningClaimId);
    assert.equal(markValidClaim.status, 0);
    assert.equal(markValidClaim.body.status, 'executed');
    assert.equal(markValidClaim.body.claimId, winningClaimId);
    assert.equal(getApprovalById(reqF1b)?.status, 'executed');
    console.log('  [PASS] Case 15 (F1b): concurrent approval_check.py --consume grants claimId to exactly 1 process and enforces --claim-id on mark');

    // Case 16 (F2): Identical TS & Python fold validation — invalid execution lines (missing seatId/digest,
    // wrong seatId, wrong digest, or timestamp before decision) are ignored by both TS and Python
    const f2Ts = '2026-10-14T11:10:00Z';
    const f2Seat = 'seat-f2';
    const f2Tool = 'Bash';
    const f2Sha = '3333333333333333333333333333333333333333333333333333333333333333';
    const reqF2 = computeRequestId(f2Ts, f2Seat, f2Tool, f2Sha);
    const decF2At = new Date().toISOString();
    const decF2Exp = new Date(Date.now() + 3600_000).toISOString();
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: f2Ts,
          seat: f2Seat,
          tool: f2Tool,
          host: 'api.example.com',
          len: 64,
          sha256: f2Sha,
          head60: 'curl -X POST https://api.example.com/f2',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqF2,
          decision: 'approved',
          by: 'owner',
          at: decF2At,
          expiresAt: decF2Exp,
        }),
        // Invalid 1: missing seatId and digest
        JSON.stringify({
          type: 'execution',
          requestId: reqF2,
          at: decF2At,
          result: 'executed',
        }),
        // Invalid 2: wrong seatId
        JSON.stringify({
          type: 'execution',
          requestId: reqF2,
          seatId: 'wrong-seat',
          at: decF2At,
          result: 'executed',
          digest: f2Sha,
        }),
        // Invalid 3: wrong digest
        JSON.stringify({
          type: 'execution',
          requestId: reqF2,
          seatId: f2Seat,
          at: decF2At,
          result: 'executed',
          digest: '9999999999999999999999999999999999999999999999999999999999999999',
        }),
        // Invalid 4: execution timestamp before decision.at
        JSON.stringify({
          type: 'execution',
          requestId: reqF2,
          seatId: f2Seat,
          at: '2020-01-01T00:00:00.000Z',
          result: 'executed',
          digest: f2Sha,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    const tsItemF2 = getApprovalById(reqF2);
    const pyCheckF2 = runCheckCli(f2Seat, f2Tool, f2Sha);
    assert.equal(tsItemF2?.status, 'approved', 'F2: TS must ignore invalid execution lines and keep status="approved"');
    assert.equal(pyCheckF2.status, 0, 'F2: Python must ignore invalid execution lines and exit 0');
    assert.equal(pyCheckF2.body.status, 'approved');
    console.log('  [PASS] Case 16 (F2): TS and Python identically reject execution records with missing/mismatched seatId, digest, or timestamp');

    // Case 17 (F3): Partial JSONL tail without trailing newline does NOT swallow new execution record
    const f3Ts = '2026-10-14T11:15:00Z';
    const f3Seat = 'seat-f3';
    const f3Tool = 'Bash';
    const f3Sha = '4444444444444444444444444444444444444444444444444444444444444444';
    const reqF3 = computeRequestId(f3Ts, f3Seat, f3Tool, f3Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f3Ts,
        seat: f3Seat,
        tool: f3Tool,
        host: 'api.example.com',
        len: 64,
        sha256: f3Sha,
        head60: 'curl -X POST https://api.example.com/f3',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqF3,
      decision: 'approved',
      by: 'owner',
    });

    // Simulate a crashed writer leaving a truncated JSON fragment WITHOUT a trailing newline
    fs.appendFileSync(todayPath, CASE_17_TRUNCATED_FIXTURE_LINE, 'utf-8');

    const markF3 = runMarkCli(reqF3, 'executed', 'run-f3');
    assert.equal(markF3.status, 0, 'F3: approval_mark.py must succeed after repairing newline boundary');

    const checkF3After = runCheckCli(f3Seat, f3Tool, f3Sha);
    assert.equal(
      checkF3After.status,
      2,
      'F3: approval_check.py must NOT re-grant approval after mark on partial-tail ledger'
    );
    assert.equal(checkF3After.body.status, 'executed');
    assert.equal(getApprovalById(reqF3)?.status, 'executed', 'F3: TS must also read execution after partial tail');
    console.log('  [PASS] Case 17 (F3): partial JSONL tail without newline is safely newline-terminated before mark and never re-grants approval');

    // Case 18 (F4): Newer request for same (seat, tool, sha256) overrides older approved request;
    // sorted by real UTC epoch timestamp (not lexicographical string order)
    const f4Seat = 'seat-f4';
    const f4Tool = 'Bash';
    const f4Sha = '5555555555555555555555555555555555555555555555555555555555555555';
    // R1 is 12:00+02:00 (= 10:00Z UTC), R2 is 10:30Z UTC (30 mins LATER in real time, but lexicographically smaller!)
    const f4TsOld = '2026-10-14T12:00:00+02:00';
    const f4TsNew = '2026-10-14T10:30:00Z';
    const reqF4Old = computeRequestId(f4TsOld, f4Seat, f4Tool, f4Sha);
    const reqF4New = computeRequestId(f4TsNew, f4Seat, f4Tool, f4Sha);

    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f4TsOld,
        seat: f4Seat,
        tool: f4Tool,
        host: 'api.example.com',
        len: 64,
        sha256: f4Sha,
        head60: 'curl -X POST https://api.example.com/f4',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqF4Old,
      decision: 'approved',
      by: 'owner',
    });
    assert.equal(runCheckCli(f4Seat, f4Tool, f4Sha).status, 0);

    // Append newer request R2 with same (seat, tool, sha256) that is still pending
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f4TsNew,
        seat: f4Seat,
        tool: f4Tool,
        host: 'api.example.com',
        len: 64,
        sha256: f4Sha,
        head60: 'curl -X POST https://api.example.com/f4',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const checkF4Pending = runCheckCli(f4Seat, f4Tool, f4Sha);
    assert.equal(
      checkF4Pending.status,
      2,
      'F4: Newer pending request R2 must prevent fallback to older approved R1'
    );
    assert.equal(checkF4Pending.body.requestId, reqF4New);
    assert.equal(checkF4Pending.body.status, 'pending');

    // Deny R2 and verify check still exits 2 with status="denied"
    recordApprovalDecision({
      requestId: reqF4New,
      decision: 'denied',
      by: 'owner',
    });
    const checkF4Denied = runCheckCli(f4Seat, f4Tool, f4Sha);
    assert.equal(checkF4Denied.status, 2, 'F4: Newer denied request R2 must exit 2');
    assert.equal(checkF4Denied.body.requestId, reqF4New);
    assert.equal(checkF4Denied.body.status, 'denied');
    console.log('  [PASS] Case 18 (F4): newer pending/denied request (by UTC epoch) is evaluated without falling back to older approval');

    // Case 19 (F5): Invalid ISO-8601 timestamps in decision fail closed in both TS and Python
    const f5Ts = '2026-10-14T11:25:00Z';
    const f5Seat = 'seat-f5';
    const f5Tool = 'Bash';
    const f5Sha = '6666666666666666666666666666666666666666666666666666666666666666';
    const reqF5 = computeRequestId(f5Ts, f5Seat, f5Tool, f5Sha);
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: f5Ts,
          seat: f5Seat,
          tool: f5Tool,
          host: 'api.example.com',
          len: 64,
          sha256: f5Sha,
          head60: 'curl -X POST https://api.example.com/f5',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqF5,
          decision: 'approved',
          by: 'owner',
          at: '2026-10-14T11:26:00Z',
          expiresAt: 'not-a-valid-timestamp',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    const checkF5 = runCheckCli(f5Seat, f5Tool, f5Sha);
    assert.equal(checkF5.status, 2, 'F5: Malformed expiresAt must fail closed (exit 2)');
    assert.notEqual(getApprovalById(reqF5)?.status, 'approved', 'F5: Malformed expiresAt must never display as approved');
    console.log('  [PASS] Case 19 (F5): malformed ISO timestamps fail closed in both TS and Python');

    // Case 20 (F6): Note > 200 chars or non-string returns HTTP 400 and appends 0 lines to ledger
    const f6Ts = '2026-10-14T11:30:00Z';
    const f6Seat = 'seat-f6';
    const f6Tool = 'Bash';
    const f6Sha = '7777777777777777777777777777777777777777777777777777777777777777';
    const reqF6 = computeRequestId(f6Ts, f6Seat, f6Tool, f6Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f6Ts,
        seat: f6Seat,
        tool: f6Tool,
        host: 'api.example.com',
        len: 64,
        sha256: f6Sha,
        head60: 'curl -X POST https://api.example.com/f6',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const sizeBeforeF6 = fs.statSync(todayPath).size;
    const longNoteRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF6}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: 'x'.repeat(201) }),
      }),
      { params: Promise.resolve({ requestId: reqF6 }) }
    );
    assert.equal(longNoteRes.status, 400, 'F6: note > 200 chars must return HTTP 400');

    const badTypeNoteRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF6}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: 12345 }),
      }),
      { params: Promise.resolve({ requestId: reqF6 }) }
    );
    assert.equal(badTypeNoteRes.status, 400, 'F6: non-string note must return HTTP 400');

    const sizeAfterF6 = fs.statSync(todayPath).size;
    assert.equal(sizeAfterF6, sizeBeforeF6, 'F6: rejected 400 requests must not write to ledger');
    assert.equal(getApprovalById(reqF6)?.status, 'pending');
    console.log('  [PASS] Case 20 (F6): overlong (>200 chars) or non-string note returns HTTP 400 without writing to ledger');

    // Case 21 (F7 & F13): Strict actor attribution & mandatory Basic Auth when PHONGBAN_USER/PHONGBAN_PASS are configured
    // - When PHONGBAN_USER & PHONGBAN_PASS are configured: Basic Auth is required EVEN on localhost (401 on missing/wrong, by="owner" on match)
    // - When PHONGBAN_USER & PHONGBAN_PASS are NOT configured: localhost is exempted with by="localhost" (never "owner"), and localhost.example.com returns 503
    const f7Ts1 = '2026-10-14T11:35:00Z';
    const f7Ts2 = '2026-10-14T11:35:01Z';
    const f7Seat = 'seat-f7';
    const f7Tool = 'Bash';
    const f7Sha1 = '8888888888888888888888888888888888888888888888888888888888888881';
    const f7Sha2 = '8888888888888888888888888888888888888888888888888888888888888882';
    const reqF7a = computeRequestId(f7Ts1, f7Seat, f7Tool, f7Sha1);
    const reqF7b = computeRequestId(f7Ts2, f7Seat, f7Tool, f7Sha2);
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: f7Ts1,
          seat: f7Seat,
          tool: f7Tool,
          host: 'api.example.com',
          len: 64,
          sha256: f7Sha1,
          head60: 'curl -X POST https://api.example.com/f7a',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          ts: f7Ts2,
          seat: f7Seat,
          tool: f7Tool,
          host: 'api.example.com',
          len: 64,
          sha256: f7Sha2,
          head60: 'curl -X POST https://api.example.com/f7b',
          reason: 'external_post_send',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    process.env.PHONGBAN_USER = 'owner_admin';
    process.env.PHONGBAN_PASS = 'test_pass_123';
    const wrongCreds = Buffer.from('owner_admin:wrong_password', 'utf8').toString('base64');

    // Off-localhost with wrong Basic Auth -> 401
    const remoteWrongRes = await postDecisionRoute(
      new NextRequest(`http://office.example.com/api/approvals/${reqF7a}/decision`, {
        method: 'POST',
        headers: {
          host: 'office.example.com',
          authorization: `Basic ${wrongCreds}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7a }) }
    );
    assert.equal(remoteWrongRes.status, 401);

    // F13: Localhost with wrong Basic Auth when env is configured -> MUST return 401
    const localWrongRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF7a}/decision`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          authorization: `Basic ${wrongCreds}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7a }) }
    );
    assert.equal(localWrongRes.status, 401, 'F13: wrong Basic Auth on localhost must return 401 when PHONGBAN_USER/PHONGBAN_PASS are set');

    // F13: Localhost with missing Basic Auth when env is configured -> MUST return 401
    const localNoAuthRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF7a}/decision`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7a }) }
    );
    assert.equal(localNoAuthRes.status, 401, 'F13: missing Basic Auth on localhost must return 401 when PHONGBAN_USER/PHONGBAN_PASS are set');

    // F13: Localhost with matching Basic Auth when env is configured -> 200, by="owner"
    const localMatchingRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF7a}/decision`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          authorization: `Basic ${basicCreds}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7a }) }
    );
    assert.equal(localMatchingRes.status, 200);
    const localMatchingJson = await localMatchingRes.json();
    assert.equal(localMatchingJson.decision.by, 'owner');

    // Unconfigured env with Basic Auth on localhost -> attributed as by="localhost" (never "owner"),
    // and spoofed Host `localhost.example.com` is rejected with 503
    delete process.env.PHONGBAN_USER;
    delete process.env.PHONGBAN_PASS;
    const spoofedLocalhostRes = await postDecisionRoute(
      new NextRequest(`http://localhost.example.com/api/approvals/${reqF7b}/decision`, {
        method: 'POST',
        headers: {
          host: 'localhost.example.com',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7b }) }
    );
    assert.equal(spoofedLocalhostRes.status, 503, 'F13: localhost.example.com must not match localhost');

    const emptyHostRes = await postDecisionRoute(
      new NextRequest(`http://localhost.example.com/api/approvals/${reqF7b}/decision`, {
        method: 'POST',
        headers: {
          host: '',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7b }) }
    );
    assert.equal(emptyHostRes.status, 503, 'F13 v04: empty Host header must not match localhost');

    const unconfRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF7b}/decision`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          authorization: `Basic ${basicCreds}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ requestId: reqF7b }) }
    );
    assert.equal(unconfRes.status, 200);
    const unconfJson = await unconfRes.json();
    assert.equal(unconfJson.decision.by, 'localhost', 'F7: unconfigured env must never attribute by="owner"');
    console.log('  [PASS] Case 21 (F7 & F13 v04): Basic Auth timingSafeEqual on localhost when configured; empty/spoofed Host rejected with 503');

    // Case 22 (F8): Public decision API ignores client-supplied `expiresAt`
    const f8Ts = '2026-10-14T11:40:00Z';
    const f8Seat = 'seat-f8';
    const f8Tool = 'Bash';
    const f8Sha = '9999999999999999999999999999999999999999999999999999999999999991';
    const reqF8 = computeRequestId(f8Ts, f8Seat, f8Tool, f8Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: f8Ts,
        seat: f8Seat,
        tool: f8Tool,
        host: 'api.example.com',
        len: 64,
        sha256: f8Sha,
        head60: 'curl -X POST https://api.example.com/f8',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const f8Res = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF8}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'approved',
          expiresAt: '2020-01-01T00:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ requestId: reqF8 }) }
    );
    assert.equal(f8Res.status, 200);
    const f8Json = await f8Res.json();
    assert.equal(f8Json.approval.status, 'approved', 'F8: client past expiresAt must be ignored');
    assert.ok(
      Date.parse(f8Json.decision.expiresAt) > Date.now() + 50 * 60_000,
      'F8: server must compute expiresAt from configured TTL'
    );
    console.log('  [PASS] Case 22 (F8): client expiresAt in POST body is ignored in favor of server TTL');

    // Case 23 (F9): All 7 real verbatim Vietnamese H1 reason strings from guard_bulk_send.py
    // (lines 107, 120, 124, 132, 136, 159, 162) map to English in both API responses and UI
    const realH1Reasons = [
      {
        raw: 'Công cụ MCP (mcp__gmail__send) thực hiện gửi dữ liệu ra bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'mcp_external_send',
      },
      {
        raw: 'Phát hiện lệnh curl sử dụng tệp cấu hình (-K/--config) có thể gửi yêu cầu ra ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'curl_config_flag',
      },
      {
        raw: 'Phát hiện lệnh truy xuất tin nhắn hộp thư (fetch_page_messages.py). Lệnh bị chặn và được ghi nhận vào sổ duyệt.',
        expected: 'inbox_message_fetch',
      },
      {
        raw: 'Phát hiện mã/lệnh kết nối tới graph.facebook.com gửi tin nhắn (/messages). Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'facebook_graph_messages',
      },
      {
        raw: 'Phát hiện batch request gửi tin nhắn qua graph.facebook.com. Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'facebook_graph_batch',
      },
      {
        raw: 'Phát hiện lệnh POST gửi tin nhắn/email ra dịch vụ bên ngoài. Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'external_post_send',
      },
      {
        raw: 'Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài (api\\.sendgrid\\.com). Lệnh bị chặn và cần chủ trực tiếp duyệt.',
        expected: 'external_endpoint_send',
      },
    ];

    const f9Ids = [];
    for (let i = 0; i < realH1Reasons.length; i++) {
      const ts = `2026-10-14T11:45:0${i}Z`;
      const seat = 'email-crm';
      const tool = 'Bash';
      const sha = `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa${i}`;
      const id = computeRequestId(ts, seat, tool, sha);
      f9Ids.push({ id, expected: realH1Reasons[i].expected });
      fs.appendFileSync(
        todayPath,
        JSON.stringify({
          ts,
          seat,
          tool,
          host: 'api.sendgrid.com',
          len: 100,
          sha256: sha,
          head60: 'curl -X POST https://api.sendgrid.com/v3/mail/send',
          reason: realH1Reasons[i].raw,
        }) + '\n',
        'utf-8'
      );
    }

    const allApprovals = getApprovals({ limit: 50 }).approvals;
    for (const { id, expected } of f9Ids) {
      const found = allApprovals.find((a) => a.requestId === id);
      assert.ok(found, `F9: missing request ${id}`);
      assert.equal(found.reason, expected, `F9: expected reason "${expected}", got "${found.reason}"`);
    }

    const htmlMarkup = renderToStaticMarkup(
      React.createElement(ApprovalsSettingsCard, { initialApprovals: allApprovals })
    );
    const vietnameseDiacriticRegex =
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    assert.equal(
      vietnameseDiacriticRegex.test(htmlMarkup),
      false,
      'F9: Rendered ApprovalsSettingsCard HTML must contain 0 Vietnamese diacritics'
    );
    assert.equal(
      vietnameseDiacriticRegex.test(JSON.stringify(allApprovals)),
      false,
      'F9: API payload must contain 0 Vietnamese diacritics'
    );
    console.log('  [PASS] Case 23 (F9): all 7 verbatim Vietnamese H1 reasons normalize to English codes in API and UI (0 Vietnamese chars)');

    // =========================================================================
    // ADVERSARIAL TESTS FOR A-4 v03 + v04 (Cases 24 - 32: Closing Hermes Rounds 2 & 3)
    // =========================================================================

    // Case 24 (F1a v03): Marking an expired request throws Error in TS (when throwOnError=true),
    // exits 2 in Python (`status: "expired"`), and writes 0 bytes to the ledger in both.
    const c24Ts = '2026-10-14T12:00:00Z';
    const c24Seat = 'seat-c24-expired';
    const c24Tool = 'Bash';
    const c24Sha = 'b024b024b024b024b024b024b024b024b024b024b024b024b024b024b024b024';
    const reqC24 = computeRequestId(c24Ts, c24Seat, c24Tool, c24Sha);
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: c24Ts,
          seat: c24Seat,
          tool: c24Tool,
          host: 'api.example.com',
          len: 64,
          sha256: c24Sha,
          head60: 'curl -X POST https://api.example.com/c24',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC24,
          decision: 'approved',
          by: 'owner',
          at: '2020-01-01T00:00:00.000Z',
          expiresAt: '2020-01-01T01:00:00.000Z',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    const sizeBeforeC24 = fs.statSync(todayPath).size;
    assert.throws(
      () =>
        recordApprovalExecution({
          requestId: reqC24,
          result: 'executed',
          throwOnError: true,
        }),
      /expired/,
      'Case 24 (F1a): recordApprovalExecution with throwOnError=true must throw on expired approval'
    );
    const c24TsRes = recordApprovalExecution({
      requestId: reqC24,
      result: 'executed',
    });
    assert.equal(c24TsRes.ok, false);
    assert.equal(c24TsRes.status, 'expired');

    const c24PyRes = runMarkCli(reqC24, 'executed', 'run-c24');
    assert.equal(c24PyRes.status, 2, 'Case 24 (F1a): approval_mark.py must exit 2 on expired approval');
    assert.equal(c24PyRes.body.status, 'expired');

    const sizeAfterC24 = fs.statSync(todayPath).size;
    assert.equal(
      sizeAfterC24,
      sizeBeforeC24,
      'Case 24 (F1a): failed mark on expired request must write 0 bytes to ledger'
    );
    console.log('  [PASS] Case 24 (F1a v03): expired mark throws in TS, exits 2 in Python, and writes 0 bytes to ledger');

    // Case 25 (v06 — Item 1, F1b, F15): OS kernel `fcntl.flock(fd, LOCK_EX)` on `<approvals_dir>/.approvals.lock`:
    // (25a) Two concurrent workers acquiring `with_approval_lock` strictly serialize (`enter`, `exit`, `enter`, `exit`).
    // (25b) When a process holding `flock` is killed with `SIGKILL` (`kill -9`), the OS kernel immediately releases
    //       the lock so `approval_check.py` acquires it in `< 1000ms` without any stale-lock reclaim code.
    // (25c) When a live process holds `flock`, `approval_check.py` exits 2 with `{"status": "lock_timeout"}` in `4800..6000ms` (<= 6s),
    //       and `POST /api/approvals/<id>/decision` returns HTTP 503 (`error: 'lock_timeout'`).
    const lockPath = path.join(getApprovalsDir(), '.approvals.lock');
    const traceFile = path.join(testDataDir, 'lock-reclaim-trace.txt');
    fs.writeFileSync(traceFile, '', 'utf-8');

    const spawnFlockWorker = (workerId) =>
      new Promise((resolve, reject) => {
        const pyCode = `
import os, sys, time
sys.path.insert(0, 'operations/scripts')
import approval_ledger
trace = os.environ['LOCK_TRACE_FILE']
wid = os.environ['LOCK_WORKER_ID']
with approval_ledger.with_approval_lock(approval_ledger.get_approvals_dir(), timeout_sec=5.0):
    with open(trace, 'a', encoding='utf-8') as f:
        f.write(f"enter:{wid}:{int(time.time()*1000)}\\n")
        f.flush()
    time.sleep(0.25)
    with open(trace, 'a', encoding='utf-8') as f:
        f.write(f"exit:{wid}:{int(time.time()*1000)}\\n")
        f.flush()
`;
        const child = spawn('python3', ['-c', pyCode], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            AIBOSS_DATA_DIR: testDataDir,
            LOCK_TRACE_FILE: traceFile,
            LOCK_WORKER_ID: workerId,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stderr }));
      });

    const [w1, w2] = await Promise.all([spawnFlockWorker('W1'), spawnFlockWorker('W2')]);
    assert.equal(w1.code, 0, `Worker W1 failed: ${w1.stderr}`);
    assert.equal(w2.code, 0, `Worker W2 failed: ${w2.stderr}`);

    const traceLines = fs
      .readFileSync(traceFile, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.equal(traceLines.length, 4, `Expected 4 trace events, got: ${JSON.stringify(traceLines)}`);
    const actions = traceLines.map((l) => l.split(':')[0]);
    assert.deepEqual(
      actions,
      ['enter', 'exit', 'enter', 'exit'],
      `Case 25a (v06 flock): Critical sections overlapped! Trace: ${JSON.stringify(traceLines)}`
    );

    // Helper: spawn a child process that acquires `fcntl.flock(fd, LOCK_EX)` on `.approvals.lock` and prints "LOCKED\n"
    const spawnLiveFlockHolder = () =>
      new Promise((resolve, reject) => {
        const child = spawn(
          'python3',
          [
            '-c',
            `
import fcntl, os, sys, time
lock_p = sys.argv[1]
os.makedirs(os.path.dirname(lock_p), exist_ok=True)
fd = os.open(lock_p, os.O_CREAT | os.O_RDWR, 0o600)
fcntl.flock(fd, fcntl.LOCK_EX)
sys.stdout.write("LOCKED\\n")
sys.stdout.flush()
time.sleep(60)
`,
            lockPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let buf = '';
        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf-8');
          if (buf.includes('LOCKED')) {
            resolve(child);
          }
        });
        child.on('error', reject);
      });

    // 25b (v06): Holder acquires `flock` and is killed with SIGKILL (`kill -9`) -> kernel immediately releases lock (< 1000ms)
    const killedHolder = await spawnLiveFlockHolder();
    await new Promise((resolve) => {
      killedHolder.once('exit', resolve);
      killedHolder.kill('SIGKILL');
    });
    const t0Reclaim = Date.now();
    const pyAfterKill = runCheckCli(f8Seat, f8Tool, f8Sha);
    const elapsedReclaimMs = Date.now() - t0Reclaim;
    assert.equal(pyAfterKill.status, 0, 'Case 25b (v06): lock must be immediately available after holder is killed with SIGKILL');
    assert.equal(pyAfterKill.body.status, 'approved');
    assert.ok(
      elapsedReclaimMs < 1000,
      `Case 25b (v06): lock acquisition after SIGKILL must finish in < 1000ms, took ${elapsedReclaimMs}ms`
    );

    // 25c (F15 + Item 9): Live process holding `flock` on `.approvals.lock` ->
    // `approval_check.py` (timeout 5s) exits 2 with `{"status": "lock_timeout"}` in `4800..6000ms` (<= 6s),
    // and `POST /api/approvals/<id>/decision` returns HTTP 503 (`error: 'lock_timeout'`).
    const liveHolder = await spawnLiveFlockHolder();
    try {
      const t0PyTimeout = Date.now();
      const pyLockTimeout = runCheckCli(f8Seat, f8Tool, f8Sha);
      const elapsedPyTimeoutMs = Date.now() - t0PyTimeout;
      assert.equal(
        pyLockTimeout.status,
        2,
        'Case 25c (F15): approval_check.py must exit 2 on lock_timeout'
      );
      assert.equal(
        pyLockTimeout.body.status,
        'lock_timeout',
        `Case 25c (F15): expected status="lock_timeout", got ${JSON.stringify(pyLockTimeout.body)}`
      );
      assert.ok(
        elapsedPyTimeoutMs >= 4800 && elapsedPyTimeoutMs <= 6000,
        `Case 25c (F15): approval_check.py timeout must complete in 4.8s..6.0s, took ${elapsedPyTimeoutMs}ms`
      );

      const postLockRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF8}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqF8 }) }
      );
      assert.equal(
        postLockRes.status,
        503,
        'Case 25c (F15 + Item 9): POST /api/approvals/<id>/decision must return HTTP 503 on lock_timeout'
      );
      const postLockJson = await postLockRes.json();
      assert.equal(postLockJson.error, 'lock_timeout');
    } finally {
      await new Promise((resolve) => {
        liveHolder.once('exit', resolve);
        liveHolder.kill('SIGKILL');
      });
    }
    console.log('  [PASS] Case 25 (v06 flock + F15): OS flock mutual exclusion, SIGKILL immediate release (<1s), and POST 503 + CLI <=6s lock_timeout');

    // Case 26 (F2a, F2b, F2c v03 + F2 v04): Strict TS & Python parity on (a) non-string seatId,
    // (b) 201-space note vs 150-emoji note, (c) sub-millisecond timestamp truncation,
    // (d) `"type": null` on request line rejected identically, and (e) U+FEFF (BOM) never stripped
    const c26TsA = '2026-10-14T12:10:00Z';
    const c26SeatA = '123';
    const c26ToolA = 'Bash';
    const c26ShaA = 'c26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26ac26a';
    const reqC26A = computeRequestId(c26TsA, c26SeatA, c26ToolA, c26ShaA);

    const c26TsB1 = '2026-10-14T12:10:01Z';
    const c26SeatB1 = 'seat-c26-b1';
    const c26ShaB1 = 'c261c261c261c261c261c261c261c261c261c261c261c261c261c261c261c261';
    const reqC26B1 = computeRequestId(c26TsB1, c26SeatB1, c26ToolA, c26ShaB1);

    const c26TsB2 = '2026-10-14T12:10:02Z';
    const c26SeatB2 = 'seat-c26-b2';
    const c26ShaB2 = 'c262c262c262c262c262c262c262c262c262c262c262c262c262c262c262c262';
    const reqC26B2 = computeRequestId(c26TsB2, c26SeatB2, c26ToolA, c26ShaB2);

    const c26TsC = '2026-10-14T12:10:03Z';
    const c26SeatC = 'seat-c26-c';
    const c26ShaC = 'c26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26cc26c';
    const reqC26C = computeRequestId(c26TsC, c26SeatC, c26ToolA, c26ShaC);

    const futureExpIso = new Date(Date.now() + 3600_000).toISOString();
    const recentAtIso = new Date(Date.now() - 60_000).toISOString();

    fs.appendFileSync(
      todayPath,
      [
        // (a) Request for seat "123", approved, followed by execution with numeric seatId: 123
        JSON.stringify({
          ts: c26TsA,
          seat: c26SeatA,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaA,
          head60: 'curl -X POST https://api.example.com/c26a',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC26A,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
        }),
        JSON.stringify({
          type: 'execution',
          requestId: reqC26A,
          seatId: 123, // numeric! Must be rejected by isinstance(seatId, str) in Python and typeof in TS
          at: recentAtIso,
          result: 'executed',
          digest: c26ShaA,
        }),
        // (b1) Decision with note of 201 spaces (untrimmed code points = 201 > 200 -> invalid decision in both)
        JSON.stringify({
          ts: c26TsB1,
          seat: c26SeatB1,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaB1,
          head60: 'curl -X POST https://api.example.com/c26b1',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC26B1,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
          note: ' '.repeat(201),
        }),
        // (b2) Decision with note of 150 astral emojis (150 Unicode code points <= 200, 300 UTF-16 code units -> valid in both)
        JSON.stringify({
          ts: c26TsB2,
          seat: c26SeatB2,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaB2,
          head60: 'curl -X POST https://api.example.com/c26b2',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC26B2,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
          note: '🙂'.repeat(150),
        }),
        // (c) Sub-millisecond timestamps within the same integer millisecond (.100900Z vs .100100Z)
        JSON.stringify({
          ts: c26TsC,
          seat: c26SeatC,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaC,
          head60: 'curl -X POST https://api.example.com/c26c',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC26C,
          decision: 'approved',
          by: 'owner',
          at: '2026-10-14T12:10:05.100900Z',
          expiresAt: futureExpIso,
        }),
        JSON.stringify({
          type: 'execution',
          requestId: reqC26C,
          seatId: c26SeatC,
          at: '2026-10-14T12:10:05.100100Z',
          result: 'executed',
          digest: c26ShaC,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    // Verify (a): numeric seatId: 123 ignored in both TS and Python -> remains approved
    assert.equal(getApprovalById(reqC26A)?.status, 'approved', 'F2a: TS must ignore numeric seatId');
    const pyC26A = runCheckCli(c26SeatA, c26ToolA, c26ShaA);
    assert.equal(pyC26A.status, 0, 'F2a: Python must ignore numeric seatId (no str() coercion)');
    assert.equal(pyC26A.body.status, 'approved');

    // Verify (b1): 201 spaces in note rejected by both TS and Python -> remains pending
    assert.equal(getApprovalById(reqC26B1)?.status, 'pending', 'F2b: TS must reject 201-space note');
    const pyC26B1 = runCheckCli(c26SeatB1, c26ToolA, c26ShaB1);
    assert.equal(pyC26B1.status, 2);
    assert.equal(pyC26B1.body.status, 'pending', 'F2b: Python must reject 201-space note');

    // Verify (b2): 150 emojis (150 code points <= 200) accepted by both TS and Python -> approved
    assert.equal(getApprovalById(reqC26B2)?.status, 'approved', 'F2b: TS must count Unicode code points for emoji note');
    const pyC26B2 = runCheckCli(c26SeatB2, c26ToolA, c26ShaB2);
    assert.equal(pyC26B2.status, 0, 'F2b: Python must accept 150-emoji note');
    assert.equal(pyC26B2.body.status, 'approved');

    // Verify (c): sub-millisecond truncation (.100900Z vs .100100Z -> both 100ms) -> executed in both TS and Python
    assert.equal(getApprovalById(reqC26C)?.status, 'executed', 'F2c: TS must accept execution in same integer ms');
    const pyC26C = runCheckCli(c26SeatC, c26ToolA, c26ShaC);
    assert.equal(pyC26C.status, 2);
    assert.equal(pyC26C.body.status, 'executed', 'F2c: Python must truncate to integer ms and match TS');

    // Also verify F2c same-ms request tie-break with an invalid line in between:
    // R_tie_1 (.500900Z -> 500ms, approved) followed by invalid line, followed by R_tie_2 (.500100Z -> 500ms, pending)
    // Both TS and Python must truncate both to 500ms and pick R_tie_2 (later order_index -> pending)
    const c26SeatTie = 'seat-c26-tie';
    const c26ShaTie = 'c26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26dc26d';
    const tsTie1 = '2026-10-14T12:10:06.500900Z';
    const tsTie2 = '2026-10-14T12:10:06.500100Z';
    const reqTie1 = computeRequestId(tsTie1, c26SeatTie, c26ToolA, c26ShaTie);
    const reqTie2 = computeRequestId(tsTie2, c26SeatTie, c26ToolA, c26ShaTie);
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: tsTie1,
          seat: c26SeatTie,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaTie,
          head60: 'curl -X POST https://api.example.com/tie1',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqTie1,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
        }),
        '{"type":"decision","requestId":"invalid_line_between"}',
        JSON.stringify({
          ts: tsTie2,
          seat: c26SeatTie,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaTie,
          head60: 'curl -X POST https://api.example.com/tie2',
          reason: 'external_post_send',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    const pyTie = runCheckCli(c26SeatTie, c26ToolA, c26ShaTie);
    const tsTieList = getApprovals({ seat: c26SeatTie }).approvals;
    assert.equal(pyTie.status, 2);
    assert.equal(pyTie.body.requestId, reqTie2, 'F2c: Python must pick R_tie_2 on same-ms tie');
    assert.equal(pyTie.body.status, 'pending');
    assert.equal(tsTieList[0]?.requestId, reqTie2, 'F2c: TS must sort R_tie_2 first on same-ms tie');
    assert.equal(tsTieList[0]?.status, 'pending');

    // Verify (d) F2 v04 Counterexample 1: R1 old `approved`, R2 newer with `"type": null`
    // Both TS and Python must reject R2 (`"type": null`) and return R1 (`approved`).
    const c26SeatTypeNull = 'seat-c26-typenull';
    const c26ShaTypeNull = 'c26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26ec26e';
    const tsTypeNull1 = '2026-10-14T12:11:00Z';
    const tsTypeNull2 = '2026-10-14T12:12:00Z';
    const reqTypeNull1 = computeRequestId(tsTypeNull1, c26SeatTypeNull, c26ToolA, c26ShaTypeNull);
    const reqTypeNull2 = computeRequestId(tsTypeNull2, c26SeatTypeNull, c26ToolA, c26ShaTypeNull);
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: tsTypeNull1,
          seat: c26SeatTypeNull,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaTypeNull,
          head60: 'curl -X POST https://api.example.com/typenull1',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqTypeNull1,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
        }),
        JSON.stringify({
          type: null,
          ts: tsTypeNull2,
          seat: c26SeatTypeNull,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaTypeNull,
          head60: 'curl -X POST https://api.example.com/typenull2',
          reason: 'external_post_send',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    assert.equal(
      getApprovalById(reqTypeNull2),
      null,
      'F2 v04: TS must reject request line with "type": null'
    );
    assert.equal(getApprovalById(reqTypeNull1)?.status, 'approved');
    const pyTypeNull = runCheckCli(c26SeatTypeNull, c26ToolA, c26ShaTypeNull);
    assert.equal(
      pyTypeNull.status,
      0,
      'F2 v04: Python must reject R2 ("type": null) and return R1 (approved)'
    );
    assert.equal(pyTypeNull.body.requestId, reqTypeNull1);
    assert.equal(pyTypeNull.body.status, 'approved');

    // Verify (e) F2 v04 Counterexample 2: U+FEFF (BOM) in `execution.seatId` (`"\uFEFF" + seat`)
    // and in `decision.note` (`"\uFEFF" + "a".repeat(200)` = 201 code points) -> neither TS nor Python strips U+FEFF!
    assert.equal(trimAscii('\uFEFFseat-bom\uFEFF'), '\uFEFFseat-bom\uFEFF', 'F2 v04: trimAscii must preserve U+FEFF');
    const c26SeatBom1 = 'seat-c26-bom-exec';
    const c26ShaBom1 = 'c26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26fc26f';
    const tsBom1 = '2026-10-14T12:13:00Z';
    const reqBom1 = computeRequestId(tsBom1, c26SeatBom1, c26ToolA, c26ShaBom1);

    const c26SeatBom2 = 'seat-c26-bom-note';
    const c26ShaBom2 = 'c260c260c260c260c260c260c260c260c260c260c260c260c260c260c260c260';
    const tsBom2 = '2026-10-14T12:13:01Z';
    const reqBom2 = computeRequestId(tsBom2, c26SeatBom2, c26ToolA, c26ShaBom2);

    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: tsBom1,
          seat: c26SeatBom1,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaBom1,
          head60: 'curl -X POST https://api.example.com/bom1',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqBom1,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
        }),
        JSON.stringify({
          type: 'execution',
          requestId: reqBom1,
          seatId: `\uFEFF${c26SeatBom1}`,
          at: recentAtIso,
          result: 'executed',
          digest: c26ShaBom1,
        }),
        JSON.stringify({
          ts: tsBom2,
          seat: c26SeatBom2,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaBom2,
          head60: 'curl -X POST https://api.example.com/bom2',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqBom2,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
          note: `\uFEFF${'a'.repeat(200)}`,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    // Both TS and Python must reject execution with seatId="\uFEFF"+seat -> reqBom1 stays approved
    assert.equal(getApprovalById(reqBom1)?.status, 'approved', 'F2 v04: TS must not strip U+FEFF from execution.seatId');
    const pyBom1 = runCheckCli(c26SeatBom1, c26ToolA, c26ShaBom1);
    assert.equal(pyBom1.status, 0, 'F2 v04: Python must not strip U+FEFF from execution.seatId');
    assert.equal(pyBom1.body.status, 'approved');

    // Both TS and Python must reject decision with note="\uFEFF"+"a".repeat(200) (201 code points > 200) -> reqBom2 stays pending
    assert.equal(getApprovalById(reqBom2)?.status, 'pending', 'F2 v04: TS must not strip U+FEFF from decision.note');
    const pyBom2 = runCheckCli(c26SeatBom2, c26ToolA, c26ShaBom2);
    assert.equal(pyBom2.status, 2);
    assert.equal(pyBom2.body.status, 'pending', 'F2 v04: Python must not strip U+FEFF from decision.note');

    console.log('  [PASS] Case 26 (F2 v03..v06): TS & Python fold identically on "type": null, U+FEFF BOM, numeric seatId, Unicode code points, and ms truncation');

    // Case 27 (F4 v03): Select newest request for (seat, tool, sha256) BEFORE checking --request-id;
    // passing --request-id of an older approved request R1 when newer R2 is pending returns status="superseded" (exit 2, 0 bytes written)
    const c27Seat = 'seat-c27-f4';
    const c27Tool = 'Bash';
    const c27Sha = 'c270c270c270c270c270c270c270c270c270c270c270c270c270c270c270c270';
    const c27TsR1 = '2026-10-14T13:00:00Z';
    const c27TsR2 = '2026-10-14T13:05:00Z';
    const reqC27R1 = computeRequestId(c27TsR1, c27Seat, c27Tool, c27Sha);
    const reqC27R2 = computeRequestId(c27TsR2, c27Seat, c27Tool, c27Sha);

    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c27TsR1,
        seat: c27Seat,
        tool: c27Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c27Sha,
        head60: 'curl -X POST https://api.example.com/c27',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqC27R1,
      decision: 'approved',
      by: 'owner',
    });

    // Append newer R2 (pending) for the same (seat, tool, sha256)
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c27TsR2,
        seat: c27Seat,
        tool: c27Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c27Sha,
        head60: 'curl -X POST https://api.example.com/c27',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const sizeBeforeC27 = fs.statSync(todayPath).size;
    const pyC27 = runCheckCli(c27Seat, c27Tool, c27Sha, [
      '--request-id',
      reqC27R1,
      '--consume',
    ]);
    assert.equal(pyC27.status, 2, 'Case 27 (F4): --request-id <older R1> must exit 2');
    assert.equal(pyC27.body.status, 'superseded');
    assert.equal(pyC27.body.requestId, reqC27R1);

    const pyC27Newest = runCheckCli(c27Seat, c27Tool, c27Sha);
    assert.equal(pyC27Newest.status, 2);
    assert.equal(pyC27Newest.body.status, 'pending');
    assert.equal(pyC27Newest.body.requestId, reqC27R2);
    assert.equal(
      fs.statSync(todayPath).size,
      sizeBeforeC27,
      'Case 27 (F4): superseded check must write 0 bytes to ledger'
    );
    console.log('  [PASS] Case 27 (F4 v03): --request-id of older request returns status="superseded" (exit 2, 0 bytes written)');

    // Case 28 (F5 v03 + v04): Identical ASCII-only ISO-8601 timestamp validation in TS and Python
    // including year range [1970, 9999] and UTC epoch range [0, 253_402_300_799_999]
    const invalidTimestamps = [
      '2026-02-30T00:00:00Z',
      '2026-10-14T24:00:00Z',
      '٢٠٢٦-10-14T00:00:00Z',
      '0099-01-01T00:00:00Z',
      '9999-12-31T23:59:59-00:01',
      '1970-01-01T00:00:00+00:01',
    ];
    for (const badTs of invalidTimestamps) {
      assert.equal(
        parseIsoTimestampMs(badTs),
        null,
        `Case 28 (F5 v04): TS must reject invalid/out-of-bounds timestamp ${badTs}`
      );
      const pyBad = spawnSync(
        'python3',
        [
          '-c',
          `import sys; sys.path.insert(0, 'operations/scripts'); import approval_check; print(approval_check.parse_iso_ts_ms(${JSON.stringify(badTs)}))`,
        ],
        { encoding: 'utf-8' }
      );
      assert.equal(
        pyBad.status,
        0,
        `Case 28 (F5 v04): Python parse_iso_ts_ms must not raise OverflowError on ${badTs}: ${pyBad.stderr}`
      );
      assert.equal(
        pyBad.stdout.trim(),
        'None',
        `Case 28 (F5 v04): Python must reject invalid/out-of-bounds timestamp ${badTs}`
      );
    }

    // Also append lines with '0099-01-01T00:00:00Z' and '9999-12-31T23:59:59-00:01' into the ledger
    // and verify neither TS getApprovals nor Python approval_check.py crashes!
    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: '0099-01-01T00:00:00Z',
          seat: 'seat-f5-0099',
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: 'f500f500f500f500f500f500f500f500f500f500f500f500f500f500f500f500',
          head60: 'curl -X POST https://api.example.com/f5-0099',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          ts: '9999-12-31T23:59:59-00:01',
          seat: 'seat-f5-9999',
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: 'f599f599f599f599f599f599f599f599f599f599f599f599f599f599f599f599',
          head60: 'curl -X POST https://api.example.com/f5-9999',
          reason: 'external_post_send',
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    assert.equal(getApprovals({ seat: 'seat-f5-0099' }).approvals.length, 0);
    assert.equal(getApprovals({ seat: 'seat-f5-9999' }).approvals.length, 0);
    const pyF50099 = runCheckCli(
      'seat-f5-0099',
      'Bash',
      'f500f500f500f500f500f500f500f500f500f500f500f500f500f500f500f500'
    );
    assert.equal(pyF50099.status, 2);
    assert.equal(pyF50099.body.status, 'not_found');
    const pyF59999 = runCheckCli(
      'seat-f5-9999',
      'Bash',
      'f599f599f599f599f599f599f599f599f599f599f599f599f599f599f599f599'
    );
    assert.equal(pyF59999.status, 2);
    assert.equal(pyF59999.body.status, 'not_found');

    const validTimestamps = [
      '2026-10-14T19:46:42.818Z',
      '2026-10-14T12:00:00+02:00',
      '2026-10-14T12:00:00.123456Z',
      '1970-01-01T00:00:00Z',
      '9999-12-31T23:59:59.999Z',
    ];
    for (const goodTs of validTimestamps) {
      const tsMs = parseIsoTimestampMs(goodTs);
      assert.equal(typeof tsMs, 'number', `Case 28 (F5 v04): TS must accept ${goodTs}`);
      const pyGoodDirect = spawnSync(
        'python3',
        [
          '-c',
          `import sys; sys.path.insert(0, 'operations/scripts'); import approval_check; print(approval_check.parse_iso_ts_ms(${JSON.stringify(goodTs)}))`,
        ],
        { encoding: 'utf-8' }
      );
      assert.equal(
        Number(pyGoodDirect.stdout.trim()),
        tsMs,
        `Case 28 (F5 v04): TS and Python must produce identical ms epoch for ${goodTs}`
      );
    }
    console.log('  [PASS] Case 28 (F5 v03 + v04): TS & Python reject 0099-01-01, 9999-12-31T23:59:59-00:01, 2026-02-30, 24:00:00, and Unicode digits, and match on valid ISO timestamps');

    // Case 29 (F10 v03..v06): O_APPEND atomic write prevents Python writer from overwriting a concurrent H1 append
    // that occurs right after os.fstat(fd) measures file size.
    const c29Ts = '2026-10-14T14:00:00Z';
    const c29Seat = 'seat-c29-f10';
    const c29Tool = 'Bash';
    const c29Sha = 'c290c290c290c290c290c290c290c290c290c290c290c290c290c290c290c290';
    const reqC29 = computeRequestId(c29Ts, c29Seat, c29Tool, c29Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c29Ts,
        seat: c29Seat,
        tool: c29Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c29Sha,
        head60: 'curl -X POST https://api.example.com/c29',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const linesBeforeC29 = fs
      .readFileSync(todayPath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean).length;

    const h1ConcurrentTs = '2026-10-14T14:00:01Z';
    const h1ConcurrentSeat = 'seat-h1-concurrent';
    const h1ConcurrentSha = 'f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f10f';
    const reqH1Concurrent = computeRequestId(
      h1ConcurrentTs,
      h1ConcurrentSeat,
      c29Tool,
      h1ConcurrentSha
    );

    const h1Line = JSON.stringify({
      ts: h1ConcurrentTs,
      seat: h1ConcurrentSeat,
      tool: c29Tool,
      host: 'api.sendgrid.com',
      len: 128,
      sha256: h1ConcurrentSha,
      head60: 'curl -X POST https://api.sendgrid.com/v3/mail/send',
      reason: 'external_post_send',
    });

    const pyC29Run = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys, json
sys.path.insert(0, 'operations/scripts')
import approval_ledger

orig_fstat = os.fstat
injected = {'done': False}
def hooked_fstat(fd):
    st = orig_fstat(fd)
    if not injected['done']:
        injected['done'] = True
        with open(${JSON.stringify(todayPath)}, 'a', encoding='utf-8') as f:
            f.write(${JSON.stringify(h1Line)} + '\\n')
            f.flush()
    return st

os.fstat = hooked_fstat
try:
    approval_ledger.run_decide_command(
        request_id=${JSON.stringify(reqC29)},
        decision='approved',
        by='owner'
    )
finally:
    os.fstat = orig_fstat
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(pyC29Run.status, 0, `Case 29 Python failed: ${pyC29Run.stderr}`);
    const pyC29Out = JSON.parse(pyC29Run.stdout.trim());
    assert.equal(pyC29Out.ok, true);

    const rawLinesAfterC29 = fs
      .readFileSync(todayPath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.equal(
      rawLinesAfterC29.length,
      linesBeforeC29 + 2,
      `Case 29 (F10): Expected ${linesBeforeC29 + 2} lines after concurrent H1 + decision append, got ${rawLinesAfterC29.length}`
    );
    const newLinesC29 = rawLinesAfterC29.slice(linesBeforeC29);
    assert.equal(newLinesC29.length, 2, 'Case 29 (F10): exactly 2 new lines must be appended');
    for (const line of newLinesC29) {
      assert.doesNotThrow(() => JSON.parse(line), `Case 29 (F10): Corrupted JSONL line: ${line}`);
    }
    for (const line of rawLinesAfterC29) {
      if (line === CASE_17_TRUNCATED_FIXTURE_LINE) continue; // Exact Case 17 fixture line only (F25)
      assert.doesNotThrow(() => JSON.parse(line), `Case 29 (F10): Corrupted JSONL line: ${line}`);
    }
    assert.equal(getApprovalById(reqC29)?.status, 'approved');
    assert.equal(
      getApprovalById(reqH1Concurrent)?.status,
      'pending',
      'Case 29 (F10): Concurrent H1 request line must be preserved intact'
    );
    console.log('  [PASS] Case 29 (F10 v06): O_APPEND preserves concurrent H1 request line appended after fstat (n + 2 valid JSON lines)');

    // Case 30 (F11 v03): Future decision.at (now < decision.at) -> status="not_yet_valid", exit 2, 0 claims written
    const c30Ts = '2026-10-14T14:10:00Z';
    const c30Seat = 'seat-c30-f11';
    const c30Tool = 'Bash';
    const c30Sha = 'c300c300c300c300c300c300c300c300c300c300c300c300c300c300c300c300';
    const reqC30 = computeRequestId(c30Ts, c30Seat, c30Tool, c30Sha);
    const futureDecisionAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const futureDecisionExp = new Date(Date.now() + 70 * 60_000).toISOString();

    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: c30Ts,
          seat: c30Seat,
          tool: c30Tool,
          host: 'api.example.com',
          len: 64,
          sha256: c30Sha,
          head60: 'curl -X POST https://api.example.com/c30',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC30,
          decision: 'approved',
          by: 'owner',
          at: futureDecisionAt,
          expiresAt: futureDecisionExp,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );

    const sizeBeforeC30 = fs.statSync(todayPath).size;
    const pyC30First = runCheckCli(c30Seat, c30Tool, c30Sha, ['--consume']);
    assert.equal(pyC30First.status, 2, 'Case 30 (F11): future decision.at must exit 2');
    assert.equal(pyC30First.body.status, 'not_yet_valid');

    const pyC30Second = runCheckCli(c30Seat, c30Tool, c30Sha, ['--consume']);
    assert.equal(pyC30Second.status, 2);
    assert.equal(
      pyC30Second.body.status,
      'not_yet_valid',
      'Case 30 (F11): second --consume must also report not_yet_valid (never claimed)'
    );

    const pyC30Mark = runMarkCli(reqC30, 'executed', 'run-c30');
    assert.equal(pyC30Mark.status, 2);
    assert.equal(pyC30Mark.body.status, 'not_yet_valid');

    const tsC30Exec = recordApprovalExecution({
      requestId: reqC30,
      result: 'executed',
    });
    assert.equal(tsC30Exec.ok, false);
    assert.equal(tsC30Exec.status, 'not_yet_valid');
    assert.equal(
      fs.statSync(todayPath).size,
      sizeBeforeC30,
      'Case 30 (F11): future decision.at must write 0 bytes to ledger'
    );
    console.log('  [PASS] Case 30 (F11 v03): future decision.at returns status="not_yet_valid" (exit 2) and writes 0 claims/executions');

    // Case 31 (F6 v03): POST /api/approvals/<id>/decision with {"decision":"approved","note":null}
    // or 201-space note returns HTTP 400 and leaves ledger byte size unchanged
    const sizeBeforeC31 = fs.statSync(todayPath).size;
    const nullNoteRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF6}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: null }),
      }),
      { params: Promise.resolve({ requestId: reqF6 }) }
    );
    assert.equal(nullNoteRes.status, 400, 'Case 31 (F6): note: null must return HTTP 400');
    const nullNoteJson = await nullNoteRes.json();
    assert.equal(nullNoteJson.error, 'invalid_note');

    const spaces201Res = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF6}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: ' '.repeat(201) }),
      }),
      { params: Promise.resolve({ requestId: reqF6 }) }
    );
    assert.equal(spaces201Res.status, 400, 'Case 31 (F6): 201 spaces in note must return HTTP 400');

    assert.equal(
      fs.statSync(todayPath).size,
      sizeBeforeC31,
      'Case 31 (F6): note: null and 201-space note must write 0 bytes to ledger'
    );
    console.log('  [PASS] Case 31 (F6 v03): note: null and 201-space note return HTTP 400 with 0 bytes written');

    // Case 32 (Item 6 v04): Verify unused TS checkAndConsumeApproval & consumeApprovalForAction are removed
    // and end-to-end consumption via approval_check.py --consume pairs cleanly with TS recordApprovalExecution
    assert.equal(
      'checkAndConsumeApproval' in approvalsLedgerModule,
      false,
      'Case 32 (v04): checkAndConsumeApproval dead code must be removed from src/lib/approvals-ledger.ts'
    );
    assert.equal(
      'consumeApprovalForAction' in approvalsLedgerModule,
      false,
      'Case 32 (v04): consumeApprovalForAction dead code must be removed from src/lib/approvals-ledger.ts'
    );

    const c32Ts = '2026-10-14T14:20:00Z';
    const c32Seat = 'seat-c32-v04';
    const c32Tool = 'Bash';
    const c32Sha = 'c320c320c320c320c320c320c320c320c320c320c320c320c320c320c320c320';
    const reqC32 = computeRequestId(c32Ts, c32Seat, c32Tool, c32Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c32Ts,
        seat: c32Seat,
        tool: c32Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c32Sha,
        head60: 'curl -X POST https://api.example.com/c32',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    const c32Pending = runCheckCli(c32Seat, c32Tool, c32Sha, ['--consume']);
    assert.equal(c32Pending.status, 2);
    assert.equal(c32Pending.body.status, 'pending');

    recordApprovalDecision({
      requestId: reqC32,
      decision: 'approved',
      by: 'owner',
    });

    const c32Consumed = runCheckCli(c32Seat, c32Tool, c32Sha, [
      '--request-id',
      reqC32,
      '--consume',
    ]);
    assert.equal(c32Consumed.status, 0);
    assert.equal(c32Consumed.body.status, 'approved');
    assert.equal(c32Consumed.body.requestId, reqC32);
    assert.ok(c32Consumed.body.claimId && c32Consumed.body.claimId.length === 16);

    const sizeAfterFirstConsume = fs.statSync(todayPath).size;
    const c32Second = runCheckCli(c32Seat, c32Tool, c32Sha, ['--consume']);
    assert.equal(c32Second.status, 2);
    assert.equal(c32Second.body.status, 'claimed');
    assert.equal(c32Second.body.claimId, c32Consumed.body.claimId);
    assert.equal(
      fs.statSync(todayPath).size,
      sizeAfterFirstConsume,
      'Case 32 (v04): second --consume must write 0 bytes'
    );

    const c32Exec = recordApprovalExecution({
      requestId: reqC32,
      result: 'executed',
      claimId: c32Consumed.body.claimId,
      runId: 'run-c32',
      throwOnError: true,
    });
    assert.equal(c32Exec.ok, true);
    assert.equal(c32Exec.status, 'executed');
    assert.equal(getApprovalById(reqC32)?.status, 'executed');
    console.log('  [PASS] Case 32 (Item 6 v04): unused TS checkAndConsumeApproval removed; Python --consume pairs with TS recordApprovalExecution');

    // =========================================================================
    // ADVERSARIAL TESTS FOR A-4 v06 (Cases 33 - 38: Single Python Writer/Reader + fcntl.flock)
    // =========================================================================

    // Case 33 (v06 Requirement 1): 20 rounds of 2 concurrent `approval_check.py --consume` processes
    // racing on the same approved request -> EVERY round must yield approved === 1 and claimed === 1!
    for (let round = 1; round <= 20; round++) {
      const rTs = `2026-10-14T15:${String(Math.floor(round / 60)).padStart(2, '0')}:${String(round % 60).padStart(2, '0')}Z`;
      const rSeat = `seat-c33-r${round}`;
      const rTool = 'Bash';
      const rSha = `${String(round).padStart(4, '0')}${'c33f'.repeat(15)}`;
      const rReqId = computeRequestId(rTs, rSeat, rTool, rSha);

      fs.appendFileSync(
        todayPath,
        JSON.stringify({
          ts: rTs,
          seat: rSeat,
          tool: rTool,
          host: 'api.example.com',
          len: 64,
          sha256: rSha,
          head60: `curl -X POST https://api.example.com/c33/${round}`,
          reason: 'external_post_send',
        }) + '\n',
        'utf-8'
      );
      recordApprovalDecision({
        requestId: rReqId,
        decision: 'approved',
        by: 'owner',
      });

      const runConcurrentConsumer = () =>
        new Promise((resolve) => {
          const proc = spawn(
            'python3',
            [
              CHECK_SCRIPT,
              '--seat',
              rSeat,
              '--tool',
              rTool,
              '--sha256',
              rSha,
              '--request-id',
              rReqId,
              '--consume',
            ],
            {
              env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
              stdio: ['ignore', 'pipe', 'pipe'],
            }
          );
          let out = '';
          proc.stdout.on('data', (d) => {
            out += d.toString();
          });
          proc.on('close', (code) => {
            resolve({ code, body: JSON.parse(out.trim()) });
          });
        });

      const [p1, p2] = await Promise.all([runConcurrentConsumer(), runConcurrentConsumer()]);
      const codes = [p1.code, p2.code].sort((a, b) => a - b);
      assert.deepEqual(
        codes,
        [0, 2],
        `Case 33 (round ${round}/20): Expected exit codes [0, 2], got ${JSON.stringify(codes)}`
      );
      const statuses = [p1.body.status, p2.body.status].sort();
      assert.deepEqual(
        statuses,
        ['approved', 'claimed'],
        `Case 33 (round ${round}/20): Expected ['approved', 'claimed'], got ${JSON.stringify(statuses)}`
      );
      const winner33 = p1.code === 0 ? p1 : p2;
      const loser33 = p1.code === 2 ? p1 : p2;
      assert.equal(winner33.body.status, 'approved');
      assert.equal(loser33.body.status, 'claimed');
      assert.ok(
        typeof winner33.body.claimId === 'string' && /^[0-9a-f]{16}$/.test(winner33.body.claimId),
        `Case 33 (round ${round}/20): Winner must receive 16-hex claimId, got ${winner33.body.claimId}`
      );
      assert.equal(
        loser33.body.claimId,
        winner33.body.claimId,
        `Case 33 (round ${round}/20): Loser claimId must match winner claimId`
      );
    }
    console.log('  [PASS] Case 33 (v06..v07 Lock Mutual Exclusion + F25): 20/20 rounds of 2 concurrent --consume processes yielded exit [0, 2], statuses [approved, claimed], and matching 16-hex claimId');

    // Case 34 (v06 Requirement 2): Process A holds `fcntl.flock(fd, LOCK_EX)` on `.approvals.lock` and is killed via `kill -9` (`SIGKILL`);
    // Process B acquires the lock immediately (< 1000ms, no 30s stale wait, no rename, no `.tmp`/`.stale`/`.rel` files).
    const sigkillHolder34 = spawn(
      'python3',
      [
        '-c',
        `
import os, fcntl, sys, time
lock_path = sys.argv[1]
fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
fcntl.flock(fd, fcntl.LOCK_EX)
sys.stdout.write("LOCKED_34\\n")
sys.stdout.flush()
time.sleep(60)
`,
        lockPath,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    );
    await new Promise((resolve, reject) => {
      sigkillHolder34.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('LOCKED_34')) resolve();
      });
      sigkillHolder34.on('error', reject);
    });
    const inoBeforeKill34 = fs.statSync(lockPath).ino;
    process.kill(sigkillHolder34.pid, 'SIGKILL');
    await new Promise((resolve) => sigkillHolder34.on('close', resolve));

    const startAfterKill34 = Date.now();
    const c34SeatKill = 'seat-c34-kill9';
    const c34ShaKill = 'c349c349c349c349c349c349c349c349c349c349c349c349c349c349c349c349';
    const c34TsKill = '2026-10-14T15:30:00Z';
    const reqC34Kill = computeRequestId(c34TsKill, c34SeatKill, 'Bash', c34ShaKill);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c34TsKill,
        seat: c34SeatKill,
        tool: 'Bash',
        host: 'api.example.com',
        len: 64,
        sha256: c34ShaKill,
        head60: 'curl -X POST https://api.example.com/c34-kill9',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqC34Kill,
      decision: 'approved',
      by: 'owner',
    });
    const pyAfterKill34 = runCheckCli(c34SeatKill, 'Bash', c34ShaKill, ['--consume']);
    const elapsedAfterKill34 = Date.now() - startAfterKill34;
    assert.equal(pyAfterKill34.status, 0);
    assert.equal(pyAfterKill34.body.status, 'approved');
    assert.ok(
      elapsedAfterKill34 < 1000,
      `Case 34 (v06 SIGKILL release): Expected immediate acquisition (< 1000ms) after kill -9, took ${elapsedAfterKill34}ms`
    );
    assert.equal(
      fs.statSync(lockPath).ino,
      inoBeforeKill34,
      'Case 34 (v06): .approvals.lock inode must remain unchanged across kill -9 and subsequent lock acquisition'
    );
    const auxLockFiles34 = fs
      .readdirSync(getApprovalsDir())
      .filter((n) => n.startsWith('.approvals.lock') && n !== '.approvals.lock');
    assert.deepEqual(
      auxLockFiles34,
      [],
      'Case 34 (v06): Zero .tmp/.stale/.rel lock files may ever be created'
    );
    console.log(
      `  [PASS] Case 34 (v06 SIGKILL Release): OS released flock immediately after kill -9 (${elapsedAfterKill34}ms < 1000ms), same inode, 0 auxiliary files`
    );

    // Case 35 (F20 v06 Requirement 3): Short write protection (`os.write` loop + `os.pread` tail readback verification):
    // (35a) Monkeypatch `os.write = lambda fd, b: orig_write(fd, b[:len(b)//2])` during `approval_check.py --consume`:
    //       Writer detects persistent short write, raises `ApprovalIoError`, CLI exits 2 with `{"status": "io_error"}`
    //       (NEVER returns `approved`), and the half-written line on disk is safely skipped by reader (`status: "approved"` remains unconsumed).
    // (35b) Monkeypatch `os.write = lambda fd, b: (orig_write(fd, b[:len(b)//2]), len(b))[1]` (lying short write returning full length):
    //       Tail readback (`os.pread`) catches the truncated line lacking `\n` / matching JSON and raises `ApprovalIoError` (exit 2).
    const c35Ts = '2026-10-14T15:40:00Z';
    const c35Seat = 'seat-c35-f20';
    const c35Tool = 'Bash';
    const c35Sha = 'c350c350c350c350c350c350c350c350c350c350c350c350c350c350c350c350';
    const reqC35 = computeRequestId(c35Ts, c35Seat, c35Tool, c35Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c35Ts,
        seat: c35Seat,
        tool: c35Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c35Sha,
        head60: 'curl -X POST https://api.example.com/c35-f20',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    recordApprovalDecision({
      requestId: reqC35,
      decision: 'approved',
      by: 'owner',
    });

    const pyShortWrite35a = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys
sys.path.insert(0, 'operations/scripts')
import approval_check

orig_write = os.write
os.write = lambda fd, b: orig_write(fd, b[:max(1, len(b)//2)])
sys.argv = ['approval_check.py', '--seat', ${JSON.stringify(c35Seat)}, '--tool', ${JSON.stringify(c35Tool)}, '--sha256', ${JSON.stringify(c35Sha)}, '--consume']
approval_check.main()
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyShortWrite35a.status,
      2,
      `Case 35a (F20): short write must exit 2 (never 0), got ${pyShortWrite35a.status} (${pyShortWrite35a.stdout})`
    );
    const pyShortWrite35aBody = JSON.parse(pyShortWrite35a.stdout.trim());
    assert.equal(
      pyShortWrite35aBody.status,
      'io_error',
      'Case 35a (F20): short write must report status="io_error" and NEVER "approved"'
    );
    assert.equal(pyShortWrite35a.stderr.includes('Traceback'), false);

    // Ensure the half-written line (if any) ends with \n before next append or verify reader skips it cleanly
    // Reader splits on \n, so if the last line lacks \n, let's verify reader right now skips the half-written tail!
    assert.equal(
      getApprovalById(reqC35)?.status,
      'approved',
      'Case 35a (F20): half-written claim line must be skipped when reading ledger'
    );
    const pyCheckAfterShort35a = runCheckCli(c35Seat, c35Tool, c35Sha);
    assert.equal(pyCheckAfterShort35a.status, 0);
    assert.equal(pyCheckAfterShort35a.body.status, 'approved');

    // Terminate the intentionally truncated fragment with a newline so subsequent appends start on a fresh line
    fs.appendFileSync(todayPath, '\n', 'utf-8');

    // (35b) Lying short write that returns `len(b)` while only writing `b[:len(b)//2]` -> caught by `os.pread` tail verification!
    const pyLyingShortWrite35b = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys
sys.path.insert(0, 'operations/scripts')
import approval_check

orig_write = os.write
def lying_write(fd, b):
    orig_write(fd, b[:len(b)//2])
    return len(b)

os.write = lying_write
sys.argv = ['approval_check.py', '--seat', ${JSON.stringify(c35Seat)}, '--tool', ${JSON.stringify(c35Tool)}, '--sha256', ${JSON.stringify(c35Sha)}, '--consume']
approval_check.main()
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyLyingShortWrite35b.status,
      2,
      'Case 35b (F20): lying short write caught by tail readback must exit 2'
    );
    const pyLyingBody35b = JSON.parse(pyLyingShortWrite35b.stdout.trim());
    assert.equal(pyLyingBody35b.status, 'io_error');
    fs.appendFileSync(todayPath, '\n', 'utf-8');

    // (35c) Transient 2-part short write (first os.write writes half, second os.write writes remaining half) succeeds cleanly!
    const pyTransientShortWrite35c = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys
sys.path.insert(0, 'operations/scripts')
import approval_check

orig_write = os.write
state = {'calls': 0}
def transient_short_write(fd, b):
    state['calls'] += 1
    if state['calls'] == 1:
        return orig_write(fd, b[:len(b)//2])
    return orig_write(fd, b)

os.write = transient_short_write
sys.argv = ['approval_check.py', '--seat', ${JSON.stringify(c35Seat)}, '--tool', ${JSON.stringify(c35Tool)}, '--sha256', ${JSON.stringify(c35Sha)}, '--consume']
approval_check.main()
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(pyTransientShortWrite35c.status, 0);
    const transientOut35c = JSON.parse(pyTransientShortWrite35c.stdout.trim());
    assert.equal(transientOut35c.status, 'approved');
    assert.equal(runCheckCli(c35Seat, c35Tool, c35Sha).body.status, 'claimed');
    assert.equal(getApprovalById(reqC35)?.claim?.claimId, transientOut35c.claimId);
    console.log('  [PASS] Case 35 (F20 v06 Short Write): persistent/lying short write exits 2 with status="io_error" (half line skipped); transient partial write loops to completion');

    // Case 36 (v06 Requirement 4): Single Python Reader/Folder handles BOM (`0xef 0xbb 0xbf` and `U+FEFF` after whitespace),
    // `NaN`/`Infinity`, bare `\r`, and powers both CLI (`approval_check.py`) and API (`GET /api/approvals`, `POST /api/approvals/<id>/decision`).
    const c36SeatNan = 'seat-c36-nan';
    const c36ShaNan = 'c367c367c367c367c367c367c367c367c367c367c367c367c367c367c367c367';
    const tsNan36 = '2026-10-14T15:45:00Z';
    const reqNan36 = computeRequestId(tsNan36, c36SeatNan, 'Bash', c36ShaNan);

    const c36SeatCr = 'seat-c36-cr';
    const c36ShaCr = 'c368c368c368c368c368c368c368c368c368c368c368c368c368c368c368c368';
    const tsCr36 = '2026-10-14T15:45:01Z';
    const reqCr36 = computeRequestId(tsCr36, c36SeatCr, 'Bash', c36ShaCr);

    const c36SeatCrWs = 'seat-c36-cr-ws';
    const c36ShaCrWs = 'c369c369c369c369c369c369c369c369c369c369c369c369c369c369c369c369';
    const tsCrWs36 = '2026-10-14T15:45:02Z';
    const reqCrWs36 = computeRequestId(tsCrWs36, c36SeatCrWs, 'Bash', c36ShaCrWs);

    const c36SeatBomWs = 'seat-c36-bom-ws';
    const c36ShaBomWs = 'c36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36ac36a';
    const tsBomWs36 = '2026-10-14T15:45:03Z';
    const reqBomWs36 = computeRequestId(tsBomWs36, c36SeatBomWs, 'Bash', c36ShaBomWs);

    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: tsNan36,
          seat: c36SeatNan,
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: c36ShaNan,
          head60: 'curl -X POST https://api.example.com/nan',
          reason: 'external_post_send',
        }),
        `{"type":"decision","requestId":"${reqNan36}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}","ZEBRA":NaN}`,
        `{"type":"decision","requestId":"${reqNan36}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}","INF":Infinity}`,
        JSON.stringify({
          ts: tsCr36,
          seat: c36SeatCr,
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: c36ShaCr,
          head60: 'curl -X POST https://api.example.com/cr',
          reason: 'external_post_send',
        }),
        `{"type":"decision","requestId":"${reqCr36}","decision":"denied","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}"}\r` +
          JSON.stringify({
            type: 'decision',
            requestId: reqCr36,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        JSON.stringify({
          ts: tsCrWs36,
          seat: c36SeatCrWs,
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: c36ShaCrWs,
          head60: 'curl -X POST https://api.example.com/crws',
          reason: 'external_post_send',
        }),
        `{"type":\r"decision",\r"requestId":"${reqCrWs36}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}"}`,
        JSON.stringify({
          ts: tsBomWs36,
          seat: c36SeatBomWs,
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: c36ShaBomWs,
          head60: 'curl -X POST https://api.example.com/bomws',
          reason: 'external_post_send',
        }),
        // Leading space followed by UTF-8 BOM (b" \xef\xbb\xbf{...}") -> Hermes Round 5 counterexample!
        ` \uFEFF` +
          JSON.stringify({
            type: 'decision',
            requestId: reqBomWs36,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
      ].join('\n') + '\n',
      'utf-8'
    );

    assert.equal(getApprovalById(reqNan36)?.status, 'pending');
    const checkNan36 = runCheckCli(c36SeatNan, 'Bash', c36ShaNan);
    assert.equal(checkNan36.status, 2, 'Case 36 (F25): NaN/Infinity decision must exit 2');
    assert.equal(checkNan36.body.status, 'pending');

    assert.equal(getApprovalById(reqCr36)?.status, 'pending');
    const checkCr36 = runCheckCli(c36SeatCr, 'Bash', c36ShaCr);
    assert.equal(checkCr36.status, 2, 'Case 36 (F25): bare CR smuggled line must exit 2');
    assert.equal(checkCr36.body.status, 'pending');

    assert.equal(getApprovalById(reqCrWs36)?.status, 'approved');
    const checkCrWs36 = runCheckCli(c36SeatCrWs, 'Bash', c36ShaCrWs);
    assert.equal(checkCrWs36.status, 0, 'Case 36 (F25): valid CR whitespace line must exit 0');
    assert.equal(checkCrWs36.body.status, 'approved');

    assert.equal(
      getApprovalById(reqBomWs36)?.status,
      'pending',
      'Case 36 (v06): Line starting with whitespace + U+FEFF must be rejected'
    );
    const checkBomWs36 = runCheckCli(c36SeatBomWs, 'Bash', c36ShaBomWs);
    assert.equal(checkBomWs36.status, 2, 'Case 36 (F25): whitespace + U+FEFF line must exit 2');
    assert.equal(checkBomWs36.body.status, 'pending');

    // Verify GET /api/approvals and POST /api/approvals/<id>/decision work end-to-end via Python CLI
    const getRes36 = await getApprovalsRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals?seat=${c36SeatNan}`)
    );
    assert.equal(getRes36.status, 200);
    const getJson36 = await getRes36.json();
    assert.equal(getJson36.approvals.length, 1);
    assert.equal(getJson36.approvals[0].status, 'pending');

    const postRes36 = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqNan36}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: 'Approved via Python CLI decide' }),
      }),
      { params: Promise.resolve({ requestId: reqNan36 }) }
    );
    assert.equal(postRes36.status, 200);
    const postJson36 = await postRes36.json();
    assert.equal(postJson36.ok, true);
    assert.equal(postJson36.approval.status, 'approved');
    const checkNan36AfterPost = runCheckCli(c36SeatNan, 'Bash', c36ShaNan);
    assert.equal(checkNan36AfterPost.status, 0, 'Case 36 (F25): after POST approved, check must exit 0');
    assert.equal(checkNan36AfterPost.body.status, 'approved');
    console.log('  [PASS] Case 36 (v06..v07 Single Reader/Folder + CLI API + F25): BOM/NaN/Infinity/CR fixtures folded by single Python reader with verified exit codes and GET/POST API');

    // Case 37 (F17 v05..v06): Fail-closed `ledger_unreadable` when any `.jsonl` file (or approvals dir) cannot be read.
    // Old file (`yesterdayPath`) has `request` + `decision: approved` (readable),
    // newer file (`todayPath`) has `execution` (`executed`) for that request and is `chmod 0o000`.
    // `approval_check.py --consume`, `approval_mark.py`, `GET /api/approvals`, and `POST /api/approvals/<id>/decision`
    // MUST fail-closed (`status: "ledger_unreadable"` / HTTP 503) and write 0 bytes; restoring `0o644` returns `executed`!
    const c37Ts = '2026-10-13T23:50:00Z';
    const c37Seat = 'seat-c37-f17';
    const c37Tool = 'Bash';
    const c37Sha = 'c370c370c370c370c370c370c370c370c370c370c370c370c370c370c370c370';
    const reqC37 = computeRequestId(c37Ts, c37Seat, c37Tool, c37Sha);

    fs.appendFileSync(
      yesterdayPath,
      [
        JSON.stringify({
          ts: c37Ts,
          seat: c37Seat,
          tool: c37Tool,
          host: 'api.example.com',
          len: 64,
          sha256: c37Sha,
          head60: 'curl -X POST https://api.example.com/c37',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC37,
          decision: 'approved',
          by: 'owner',
          at: recentAtIso,
          expiresAt: futureExpIso,
        }),
      ].join('\n') + '\n',
      'utf-8'
    );
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        type: 'execution',
        requestId: reqC37,
        seatId: c37Seat,
        at: new Date().toISOString(),
        result: 'executed',
        digest: c37Sha,
      }) + '\n',
      'utf-8'
    );

    const sizeYesterdayBefore37 = fs.statSync(yesterdayPath).size;
    const sizeTodayBefore37 = fs.statSync(todayPath).size;

    fs.chmodSync(todayPath, 0o000);
    try {
      const pyCheckUnreadable = runCheckCli(c37Seat, c37Tool, c37Sha, ['--consume']);
      assert.equal(
        pyCheckUnreadable.status,
        2,
        'Case 37 (F17): approval_check.py --consume must exit 2 when today.jsonl is chmod 000'
      );
      assert.equal(pyCheckUnreadable.body.status, 'ledger_unreadable');
      assert.equal(pyCheckUnreadable.body.file, path.basename(todayPath));

      const pyMarkUnreadable = runMarkCli(reqC37, 'executed', 'run-c37');
      assert.equal(
        pyMarkUnreadable.status,
        2,
        'Case 37 (F17): approval_mark.py must exit 2 when today.jsonl is chmod 000'
      );
      assert.equal(pyMarkUnreadable.body.status, 'ledger_unreadable');
      assert.equal(pyMarkUnreadable.body.file, path.basename(todayPath));

      const getUnreadableRes = await getApprovalsRoute(
        new NextRequest('http://127.0.0.1:4330/api/approvals')
      );
      assert.equal(
        getUnreadableRes.status,
        503,
        'Case 37 (F17): GET /api/approvals must return HTTP 503 when a ledger file is unreadable'
      );
      const getUnreadableJson = await getUnreadableRes.json();
      assert.equal(getUnreadableJson.error, 'ledger_unreadable');
      assert.equal(
        JSON.stringify(getUnreadableJson).includes(testDataDir),
        false,
        'Case 37 (F17): GET 503 response must not leak raw filesystem paths'
      );

      const postUnreadableRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqC37}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqC37 }) }
      );
      assert.equal(
        postUnreadableRes.status,
        503,
        'Case 37 (F17): POST decision must return HTTP 503 when a ledger file is unreadable'
      );
      const postUnreadableJson = await postUnreadableRes.json();
      assert.equal(postUnreadableJson.error, 'ledger_unreadable');
      assert.equal(
        JSON.stringify(postUnreadableJson).includes(testDataDir),
        false,
        'Case 37 (F17): POST 503 response must not leak raw filesystem paths'
      );
    } finally {
      fs.chmodSync(todayPath, 0o644);
    }

    assert.equal(
      fs.statSync(yesterdayPath).size,
      sizeYesterdayBefore37,
      'Case 37 (F17): yesterdayPath must have 0 bytes added after ledger_unreadable'
    );
    assert.equal(
      fs.statSync(todayPath).size,
      sizeTodayBefore37,
      'Case 37 (F17): todayPath must have 0 bytes added after ledger_unreadable'
    );

    const pyCheckRestored = runCheckCli(c37Seat, c37Tool, c37Sha, ['--consume']);
    assert.equal(pyCheckRestored.status, 2);
    assert.equal(pyCheckRestored.body.status, 'executed');
    assert.equal(getApprovalById(reqC37)?.status, 'executed');
    console.log('  [PASS] Case 37 (F17 v06): unreadable ledger file fails closed with status="ledger_unreadable" (exit 2 / HTTP 503, +0 bytes) and recovers to "executed" when chmod 644 restored');

    // Case 38 (F18 v05..v06): Outer I/O error boundary in CLI (`approval_check.py`, `approval_mark.py`)
    // and API (`POST /api/approvals/<id>/decision`):
    // When approvals directory is read-only (`0o500`), both Python CLIs output structured JSON
    // `{"status": "io_error", "reason": "EACCES"}` and exit 2 (0 tracebacks, never exit 1),
    // and POST returns HTTP 503 (`error: "io_error"`) without leaking internal paths.
    fs.chmodSync(getApprovalsDir(), 0o500);
    try {
      const pyCheckIo = runCheckCli(c37Seat, c37Tool, c37Sha);
      assert.equal(
        pyCheckIo.status,
        2,
        `Case 38 (F18): approval_check.py must exit 2 (never 1) on EACCES, got ${pyCheckIo.status}`
      );
      assert.equal(pyCheckIo.body?.status, 'io_error');
      assert.equal(pyCheckIo.body?.reason, 'EACCES');
      assert.equal(
        pyCheckIo.rawStderr.includes('Traceback'),
        false,
        'Case 38 (F18): approval_check.py must not print a raw Python Traceback on I/O error'
      );

      const pyMarkIo = runMarkCli(reqC37, 'executed', 'run-c38');
      assert.equal(
        pyMarkIo.status,
        2,
        `Case 38 (F18): approval_mark.py must exit 2 (never 1) on EACCES, got ${pyMarkIo.status}`
      );
      assert.equal(pyMarkIo.body?.status, 'io_error');
      assert.equal(pyMarkIo.body?.reason, 'EACCES');
      assert.equal(
        pyMarkIo.rawStderr.includes('Traceback'),
        false,
        'Case 38 (F18): approval_mark.py must not print a raw Python Traceback on I/O error'
      );

      const postIoRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqC37}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqC37 }) }
      );
      assert.equal(
        postIoRes.status,
        503,
        'Case 38 (F18): POST decision must return HTTP 503 on io_error'
      );
      const postIoJson = await postIoRes.json();
      assert.equal(postIoJson.error, 'io_error');
      assert.equal(
        JSON.stringify(postIoJson).includes(testDataDir),
        false,
        'Case 38 (F18): POST 503 response must not leak raw filesystem paths'
      );
    } finally {
      fs.chmodSync(getApprovalsDir(), 0o755);
    }
    console.log('  [PASS] Case 38 (F18 v06): I/O errors output JSON {"status":"io_error","reason":"EACCES"} with exit 2 (0 tracebacks) in CLI and HTTP 503 in API');

    // =========================================================================
    // ADVERSARIAL TESTS FOR A-4 v07 & v08 (Cases 39 - 42: Closing Hermes Rounds 6 & 7 F21..F29)
    // =========================================================================

    // Case 39 (F21 P1 + F26 P1 + F27 P2 v08):
    // - `is_lock_disabled_for_test` requires ALL 4 conditions simultaneously:
    //   (1) `AIBOSS_TEST_MODE == "1"`
    //   (2) `AIBOSS_TEST_DISABLE_APPROVAL_LOCK == "1"`
    //   (3) `NODE_ENV != "production"`
    //   (4) `AIBOSS_DATA_DIR` set AND `<AIBOSS_DATA_DIR>/approvals/.test-ledger` is a TRUE REGULAR FILE
    //       at that exact directory entry (`os.lstat` + `stat.S_ISREG` + `O_NOFOLLOW`; symlinks are strictly rejected — F26).
    // - TS `buildPythonCliEnv` strips all `AIBOSS_TEST_*` variables unless `NODE_ENV === "test"` (F27).
    const f21NoMarkerDir = path.join(
      os.tmpdir(),
      'aiboss-f21-nomarker-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    );
    const f21NoMarkerApprovalsDir = path.join(f21NoMarkerDir, 'approvals');
    fs.mkdirSync(f21NoMarkerApprovalsDir, { recursive: true });

    const f26SymlinkDir = path.join(
      os.tmpdir(),
      'aiboss-f26-symlink-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    );
    const f26SymlinkApprovalsDir = path.join(f26SymlinkDir, 'approvals');
    fs.mkdirSync(f26SymlinkApprovalsDir, { recursive: true });
    const f26ExternalRegularFile = path.join(f26SymlinkDir, 'real-regular-file.txt');
    fs.writeFileSync(f26ExternalRegularFile, 'aiboss-test-ledger-marker\n', 'utf-8');
    fs.symlinkSync(
      f26ExternalRegularFile,
      path.join(f26SymlinkApprovalsDir, '.test-ledger')
    );

    const f27RealMarkerDir = path.join(
      os.tmpdir(),
      'aiboss-f27-realmarker-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    );
    const f27RealMarkerApprovalsDir = path.join(f27RealMarkerDir, 'approvals');
    fs.mkdirSync(f27RealMarkerApprovalsDir, { recursive: true });
    fs.writeFileSync(
      path.join(f27RealMarkerApprovalsDir, '.test-ledger'),
      'aiboss-test-ledger-marker\n',
      'utf-8'
    );

    try {
      // (39a) Verify `is_lock_disabled_for_test` directly across all 4 conditions + symlink rejection (F21, F26, F27):
      const checkBypassFlag = (envOverrides, targetDir) => {
        const res = spawnSync(
          'python3',
          [
            '-c',
            `import sys; sys.path.insert(0, 'operations/scripts'); import approval_ledger; print(approval_ledger.is_lock_disabled_for_test(${JSON.stringify(targetDir)}))`,
          ],
          {
            env: {
              PATH: process.env.PATH || '/usr/bin:/bin',
              HOME: process.env.HOME || '/tmp',
              ...envOverrides,
            },
            encoding: 'utf-8',
          }
        );
        assert.equal(res.status, 0, `checkBypassFlag failed: ${res.stderr}`);
        return res.stdout.trim();
      };

      // All 4 conditions met on f27RealMarkerApprovalsDir (which has regular .test-ledger) -> True
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'test',
            AIBOSS_DATA_DIR: f27RealMarkerDir,
          },
          f27RealMarkerApprovalsDir
        ),
        'True',
        'Case 39a (F21): All 4 conditions on dir with regular .test-ledger must return True'
      );

      // Missing condition 1 (AIBOSS_TEST_MODE) -> False
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'test',
            AIBOSS_DATA_DIR: f27RealMarkerDir,
          },
          f27RealMarkerApprovalsDir
        ),
        'False',
        'Case 39a (F21): Missing AIBOSS_TEST_MODE=1 must return False'
      );

      // Missing condition 2 (AIBOSS_TEST_DISABLE_APPROVAL_LOCK) when AIBOSS_TEST_MODE=1 + regular .test-ledger exist -> False (F27)
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            NODE_ENV: 'test',
            AIBOSS_DATA_DIR: f27RealMarkerDir,
          },
          f27RealMarkerApprovalsDir
        ),
        'False',
        'Case 39a (F27): Missing AIBOSS_TEST_DISABLE_APPROVAL_LOCK=1 must return False even with AIBOSS_TEST_MODE=1 and regular .test-ledger'
      );

      // Missing condition 3 (NODE_ENV=production) -> False
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'production',
            AIBOSS_DATA_DIR: f27RealMarkerDir,
          },
          f27RealMarkerApprovalsDir
        ),
        'False',
        'Case 39a (F21): NODE_ENV=production must return False even when AIBOSS_TEST_MODE=1 and .test-ledger exist'
      );

      // Missing condition 4a (AIBOSS_DATA_DIR unset) -> False
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'test',
          },
          f27RealMarkerApprovalsDir
        ),
        'False',
        'Case 39a (F21): Missing AIBOSS_DATA_DIR must return False'
      );

      // Missing condition 4b (directory has NO .test-ledger marker file) -> False
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'development',
            AIBOSS_DATA_DIR: f21NoMarkerDir,
          },
          f21NoMarkerApprovalsDir
        ),
        'False',
        'Case 39a (F21): Directory without .test-ledger marker file must return False'
      );

      // Condition 4c (F26 P1): `.test-ledger` is a SYMLINK pointing to a regular file -> MUST return False!
      assert.equal(
        fs.lstatSync(path.join(f26SymlinkApprovalsDir, '.test-ledger')).isSymbolicLink(),
        true,
        'Case 39a (F26): fixture .test-ledger must be a symbolic link'
      );
      assert.equal(
        fs.statSync(path.join(f26SymlinkApprovalsDir, '.test-ledger')).isFile(),
        true,
        'Case 39a (F26): symlink target must be a regular file'
      );
      assert.equal(
        checkBypassFlag(
          {
            AIBOSS_TEST_MODE: '1',
            AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
            NODE_ENV: 'test',
            AIBOSS_DATA_DIR: f26SymlinkDir,
          },
          f26SymlinkApprovalsDir
        ),
        'False',
        'Case 39a (F26 P1): Symlink .test-ledger pointing to a regular file MUST return False (lstat + S_ISREG + O_NOFOLLOW)'
      );

      // Helper to run 2 concurrent `approval_check.py --consume` processes on any ledger directory & explicit env
      const runTwoConcurrentConsumers = async (dataDir, seat, tool, sha, reqId, envVars) => {
        const spawnOne = () =>
          new Promise((resolve) => {
            const proc = spawn(
              'python3',
              [
                CHECK_SCRIPT,
                '--seat',
                seat,
                '--tool',
                tool,
                '--sha256',
                sha,
                '--request-id',
                reqId,
                '--consume',
              ],
              {
                env: {
                  PATH: process.env.PATH,
                  ...envVars,
                  AIBOSS_DATA_DIR: dataDir,
                },
                stdio: ['ignore', 'pipe', 'pipe'],
              }
            );
            let out = '';
            proc.stdout.on('data', (d) => {
              out += d.toString();
            });
            proc.on('close', (code) => {
              resolve({ code, body: JSON.parse(out.trim()) });
            });
          });
        const [p1, p2] = await Promise.all([spawnOne(), spawnOne()]);
        return {
          codes: [p1.code, p2.code].sort((a, b) => a - b),
          statuses: [p1.body.status, p2.body.status].sort(),
          winner: p1.code === 0 ? p1 : p2,
          loser: p1.code === 2 ? p1 : p2,
        };
      };

      const f21Date = new Date().toISOString().split('T')[0];

      // (39b — F26 P1): End-to-end concurrent `--consume` on directory where `.test-ledger` is a SYMLINK to a regular file
      // + all 3 env vars (`AIBOSS_TEST_MODE=1`, `AIBOSS_TEST_DISABLE_APPROVAL_LOCK=1`, `NODE_ENV=test`) ->
      // lock MUST stay active (`codes: [0, 2]`, `statuses: ['approved', 'claimed']`)!
      const f26LogPath = path.join(f26SymlinkApprovalsDir, `${f21Date}.jsonl`);
      const f26Ts = '2026-10-14T16:00:00Z';
      const f26Seat = 'seat-c39-f26-symlink';
      const f26Tool = 'Bash';
      const f26Sha = 'c396c396c396c396c396c396c396c396c396c396c396c396c396c396c396c396';
      const reqF26 = computeRequestId(f26Ts, f26Seat, f26Tool, f26Sha);
      fs.appendFileSync(
        f26LogPath,
        [
          JSON.stringify({
            ts: f26Ts,
            seat: f26Seat,
            tool: f26Tool,
            host: 'api.example.com',
            len: 64,
            sha256: f26Sha,
            head60: 'curl -X POST https://api.example.com/c39-f26',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqF26,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        ].join('\n') + '\n',
        'utf-8'
      );

      const f26Race = await runTwoConcurrentConsumers(
        f26SymlinkDir,
        f26Seat,
        f26Tool,
        f26Sha,
        reqF26,
        {
          NODE_ENV: 'test',
          AIBOSS_TEST_MODE: '1',
          AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
        }
      );
      assert.deepEqual(
        f26Race.codes,
        [0, 2],
        `Case 39b (F26 P1): Symlink .test-ledger MUST NOT disable flock! Got exit codes ${JSON.stringify(f26Race.codes)}`
      );
      assert.deepEqual(f26Race.statuses, ['approved', 'claimed']);
      assert.equal(f26Race.loser.body.claimId, f26Race.winner.body.claimId);

      // (39c — F27 P2): End-to-end concurrent `--consume` on directory WITH regular `.test-ledger` and `AIBOSS_TEST_MODE=1`,
      // but MISSING `AIBOSS_TEST_DISABLE_APPROVAL_LOCK` -> lock MUST stay active (`[0, 2]`, `['approved', 'claimed']`)!
      const f27LogPath = path.join(f27RealMarkerApprovalsDir, `${f21Date}.jsonl`);
      const f27Ts1 = '2026-10-14T16:01:00Z';
      const f27Seat1 = 'seat-c39-f27-nodisable';
      const f27Sha1 = 'c397c397c397c397c397c397c397c397c397c397c397c397c397c397c397c397';
      const reqF27a = computeRequestId(f27Ts1, f27Seat1, 'Bash', f27Sha1);
      fs.appendFileSync(
        f27LogPath,
        [
          JSON.stringify({
            ts: f27Ts1,
            seat: f27Seat1,
            tool: 'Bash',
            host: 'api.example.com',
            len: 64,
            sha256: f27Sha1,
            head60: 'curl -X POST https://api.example.com/c39-f27a',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqF27a,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        ].join('\n') + '\n',
        'utf-8'
      );

      const f27RaceNoDisable = await runTwoConcurrentConsumers(
        f27RealMarkerDir,
        f27Seat1,
        'Bash',
        f27Sha1,
        reqF27a,
        {
          NODE_ENV: 'test',
          AIBOSS_TEST_MODE: '1',
        }
      );
      assert.deepEqual(
        f27RaceNoDisable.codes,
        [0, 2],
        `Case 39c (F27 P2): Missing AIBOSS_TEST_DISABLE_APPROVAL_LOCK must keep flock active! Got ${JSON.stringify(f27RaceNoDisable.codes)}`
      );
      assert.deepEqual(f27RaceNoDisable.statuses, ['approved', 'claimed']);

      // Also verify missing AIBOSS_TEST_MODE (with regular .test-ledger + AIBOSS_TEST_DISABLE_APPROVAL_LOCK=1) -> lock stays active
      const f27Ts1b = '2026-10-14T16:01:30Z';
      const f27Seat1b = 'seat-c39-f27-notestmode';
      const f27Sha1b = 'c39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39bc39b';
      const reqF27NoMode = computeRequestId(f27Ts1b, f27Seat1b, 'Bash', f27Sha1b);
      fs.appendFileSync(
        f27LogPath,
        [
          JSON.stringify({
            ts: f27Ts1b,
            seat: f27Seat1b,
            tool: 'Bash',
            host: 'api.example.com',
            len: 64,
            sha256: f27Sha1b,
            head60: 'curl -X POST https://api.example.com/c39-f27b',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqF27NoMode,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        ].join('\n') + '\n',
        'utf-8'
      );
      const f27RaceNoMode = await runTwoConcurrentConsumers(
        f27RealMarkerDir,
        f27Seat1b,
        'Bash',
        f27Sha1b,
        reqF27NoMode,
        {
          NODE_ENV: 'test',
          AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
        }
      );
      assert.deepEqual(
        f27RaceNoMode.codes,
        [0, 2],
        `Case 39c (F27 P2): Missing AIBOSS_TEST_MODE must keep flock active! Got ${JSON.stringify(f27RaceNoMode.codes)}`
      );
      assert.deepEqual(f27RaceNoMode.statuses, ['approved', 'claimed']);

      // (39d — F27 P2): Isolate TS `buildPythonCliEnv()` env stripping!
      // On `f27RealMarkerDir` (which HAS a real regular `.test-ledger` file), set `NODE_ENV='development'`,
      // `AIBOSS_TEST_MODE='1'`, `AIBOSS_TEST_DISABLE_APPROVAL_LOCK='1'` in `process.env`, AND hold `fcntl.flock`
      // on `<f27RealMarkerApprovalsDir>/.approvals.lock` from a child process.
      // Because `buildPythonCliEnv()` strips `AIBOSS_TEST_*` when `NODE_ENV !== 'test'`, `POST /api/approvals/<id>/decision`
      // MUST NOT bypass the lock — it must wait on the held `flock` and return HTTP 503 (`error: 'lock_timeout'`)!
      // (If `buildPythonCliEnv()` were replaced by raw `process.env`, Python would see all 4 bypass conditions including
      // the real `.test-ledger` file, skip `with_approval_lock`, and return HTTP 200 instead of 503!)
      const f27Ts2 = '2026-10-14T16:02:00Z';
      const f27Seat2 = 'seat-c39-f27-api-env';
      const f27Sha2 = 'c398c398c398c398c398c398c398c398c398c398c398c398c398c398c398c398';
      const reqF27b = computeRequestId(f27Ts2, f27Seat2, 'Bash', f27Sha2);
      fs.appendFileSync(
        f27LogPath,
        JSON.stringify({
          ts: f27Ts2,
          seat: f27Seat2,
          tool: 'Bash',
          host: 'api.example.com',
          len: 64,
          sha256: f27Sha2,
          head60: 'curl -X POST https://api.example.com/c39-f27b',
          reason: 'external_post_send',
        }) + '\n',
        'utf-8'
      );

      const f27LockPath = path.join(f27RealMarkerApprovalsDir, '.approvals.lock');
      const f27Holder = await new Promise((resolve, reject) => {
        const child = spawn(
          'python3',
          [
            '-c',
            `
import fcntl, os, sys, time
lp = sys.argv[1]
fd = os.open(lp, os.O_CREAT | os.O_RDWR, 0o600)
fcntl.flock(fd, fcntl.LOCK_EX)
sys.stdout.write("LOCKED_F27\\n")
sys.stdout.flush()
time.sleep(60)
`,
            f27LockPath,
          ],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let buf = '';
        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf-8');
          if (buf.includes('LOCKED_F27')) resolve(child);
        });
        child.on('error', reject);
      });

      const savedDataDir = process.env.AIBOSS_DATA_DIR;
      const savedNodeEnv = process.env.NODE_ENV;
      const savedTestMode = process.env.AIBOSS_TEST_MODE;
      const savedDisableLock = process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK;
      try {
        process.env.AIBOSS_DATA_DIR = f27RealMarkerDir;
        process.env.NODE_ENV = 'development';
        process.env.AIBOSS_TEST_MODE = '1';
        process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK = '1';

        const postF27HeldRes = await postDecisionRoute(
          new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF27b}/decision`, {
            method: 'POST',
            headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
            body: JSON.stringify({ decision: 'approved', note: 'Must hit lock_timeout 503' }),
          }),
          { params: Promise.resolve({ requestId: reqF27b }) }
        );
        assert.equal(
          postF27HeldRes.status,
          503,
          `Case 39d (F27 P2): With real .test-ledger + AIBOSS_TEST_MODE=1 + AIBOSS_TEST_DISABLE_APPROVAL_LOCK=1 in NODE_ENV=development while flock is held, POST must return HTTP 503 (proving buildPythonCliEnv stripped AIBOSS_TEST_*), got ${postF27HeldRes.status}`
        );
        const postF27HeldJson = await postF27HeldRes.json();
        assert.equal(postF27HeldJson.error, 'lock_timeout');
      } finally {
        await new Promise((resolve) => {
          f27Holder.once('exit', resolve);
          f27Holder.kill('SIGKILL');
        });
        process.env.AIBOSS_DATA_DIR = savedDataDir;
        if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = savedNodeEnv;
        if (savedTestMode === undefined) delete process.env.AIBOSS_TEST_MODE;
        else process.env.AIBOSS_TEST_MODE = savedTestMode;
        if (savedDisableLock === undefined) delete process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK;
        else process.env.AIBOSS_TEST_DISABLE_APPROVAL_LOCK = savedDisableLock;
      }
      // (39e — F31 coverage preservation): E2E concurrent `--consume` and `POST /api/approvals/<id>/decision`
      // on `f21NoMarkerDir` (directory without `.test-ledger`) -> lock remains active (`[0, 2]`, `['approved', 'claimed']`) and POST returns 200
      const f21NoMarkerLogPath = path.join(f21NoMarkerApprovalsDir, `${f21Date}.jsonl`);
      const f21NmTs1 = '2026-10-14T16:03:00Z';
      const f21NmSeat1 = 'seat-c39-nomarker-race';
      const f21NmSha1 = 'c399c399c399c399c399c399c399c399c399c399c399c399c399c399c399c399';
      const reqF21NmRace = computeRequestId(f21NmTs1, f21NmSeat1, 'Bash', f21NmSha1);
      const f21NmTs2 = '2026-10-14T16:03:30Z';
      const f21NmSeat2 = 'seat-c39-nomarker-post';
      const f21NmSha2 = 'c39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39ac39a';
      const reqF21NmPost = computeRequestId(f21NmTs2, f21NmSeat2, 'Bash', f21NmSha2);
      fs.appendFileSync(
        f21NoMarkerLogPath,
        [
          JSON.stringify({
            ts: f21NmTs1,
            seat: f21NmSeat1,
            tool: 'Bash',
            host: 'api.example.com',
            len: 64,
            sha256: f21NmSha1,
            head60: 'curl -X POST https://api.example.com/c39-nm1',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqF21NmRace,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
          JSON.stringify({
            ts: f21NmTs2,
            seat: f21NmSeat2,
            tool: 'Bash',
            host: 'api.example.com',
            len: 64,
            sha256: f21NmSha2,
            head60: 'curl -X POST https://api.example.com/c39-nm2',
            reason: 'external_post_send',
          }),
        ].join('\n') + '\n',
        'utf-8'
      );
      const f21NoMarkerRace = await runTwoConcurrentConsumers(
        f21NoMarkerDir,
        f21NmSeat1,
        'Bash',
        f21NmSha1,
        reqF21NmRace,
        {
          NODE_ENV: 'test',
          AIBOSS_TEST_MODE: '1',
          AIBOSS_TEST_DISABLE_APPROVAL_LOCK: '1',
        }
      );
      assert.deepEqual(f21NoMarkerRace.codes, [0, 2]);
      assert.deepEqual(f21NoMarkerRace.statuses, ['approved', 'claimed']);

      const savedDataDirNm = process.env.AIBOSS_DATA_DIR;
      try {
        process.env.AIBOSS_DATA_DIR = f21NoMarkerDir;
        const postNmRes = await postDecisionRoute(
          new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF21NmPost}/decision`, {
            method: 'POST',
            headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
            body: JSON.stringify({ decision: 'approved', note: 'No-marker dir normal POST 200' }),
          }),
          { params: Promise.resolve({ requestId: reqF21NmPost }) }
        );
        assert.equal(postNmRes.status, 200);
      } finally {
        process.env.AIBOSS_DATA_DIR = savedDataDirNm;
      }
    } finally {
      fs.rmSync(f21NoMarkerDir, { recursive: true, force: true });
      fs.rmSync(f26SymlinkDir, { recursive: true, force: true });
      fs.rmSync(f27RealMarkerDir, { recursive: true, force: true });
    }
    console.log('  [PASS] Case 39 (F21 + F26 P1 + F27 P2 + F31 v09): Symlink .test-ledger rejected via lstat+S_ISREG+O_NOFOLLOW; missing DISABLE_LOCK & no-marker E2E verified; buildPythonCliEnv stripping isolated via held flock -> HTTP 503');

    // Case 40 (F23 P2 v07): Option values starting with dash (`"--review"`, `"-x"`, `"--line1\n--line2"`, Unicode)
    // pass cleanly through `--flag=<value>` in `src/lib/approvals-ledger.ts` and return HTTP 200 with exact persistence.
    const f23Notes = [
      '--review',
      '-x',
      '--line1\n--line2',
      '--duyệt-unicode-🚀-café',
    ];
    for (let i = 0; i < f23Notes.length; i++) {
      const noteVal = f23Notes[i];
      const f23Ts = `2026-10-14T16:10:0${i}Z`;
      const f23Seat = `seat-c40-f23-${i}`;
      const f23Tool = 'Bash';
      const f23Sha = `c40${i}${'f230'.repeat(15)}`;
      const reqF23 = computeRequestId(f23Ts, f23Seat, f23Tool, f23Sha);

      fs.appendFileSync(
        todayPath,
        JSON.stringify({
          ts: f23Ts,
          seat: f23Seat,
          tool: f23Tool,
          host: 'api.example.com',
          len: 64,
          sha256: f23Sha,
          head60: `curl -X POST https://api.example.com/c40/${i}`,
          reason: 'external_post_send',
        }) + '\n',
        'utf-8'
      );

      const postF23 = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF23}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved', note: noteVal }),
        }),
        { params: Promise.resolve({ requestId: reqF23 }) }
      );
      assert.equal(
        postF23.status,
        200,
        `Case 40 (F23): POST decision with note=${JSON.stringify(noteVal)} must return HTTP 200, got ${postF23.status}`
      );
      const postF23Json = await postF23.json();
      assert.equal(postF23Json.ok, true);
      assert.equal(
        postF23Json.decision.note,
        noteVal,
        `Case 40 (F23): decision.note must preserve ${JSON.stringify(noteVal)}`
      );
      assert.equal(
        getApprovalById(reqF23)?.decision?.note,
        noteVal,
        `Case 40 (F23): getApprovalById must read back exact note=${JSON.stringify(noteVal)}`
      );

      // Also verify recordApprovalExecution with a dash-prefixed runId ("--run-dash-0") works via --run-id=<value>
      const execF23 = recordApprovalExecution({
        requestId: reqF23,
        result: 'executed',
        runId: `--run-dash-${i}`,
        throwOnError: true,
      });
      assert.equal(execF23.ok, true);
      assert.equal(execF23.status, 'executed');
      assert.equal(getApprovalById(reqF23)?.execution?.runId, `--run-dash-${i}`);
    }

    // Verify existing note validation (note: null -> 400, >200 Unicode code points -> 400) still holds
    const f23BadEmojiRes = await postDecisionRoute(
      new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqF6}/decision`, {
        method: 'POST',
        headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', note: '--' + '🚀'.repeat(199) }),
      }),
      { params: Promise.resolve({ requestId: reqF6 }) }
    );
    assert.equal(f23BadEmojiRes.status, 400, 'Case 40 (F23): >200 code points starting with -- must still return 400');
    console.log('  [PASS] Case 40 (F23 P2 v07): Dash-prefixed notes ("--review", "-x", "--line1\\n--line2", Unicode) and --run-id pass via --flag=<value> and return HTTP 200');

    // Case 41 (F24 + F28 + F32 P2 v09): CLI JSON contract verification for `approval_check.py` and `approval_mark.py`
    // Verifies exact key sets AND exact values/types for tested branches (`not_found`, `pending`, `approved`,
    // `consume`, `claimed`, `claim_mismatch`, `executed` idempotent=false/true, `superseded` with `latestRequestId`,
    // and strict `.mmmZ` UTC ISO regex on `expiresAt`).
    const ISO_UTC_MS_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const c41Ts = '2026-10-14T16:20:00Z';
    const c41Seat = 'seat-c41-f24';
    const c41Tool = 'Bash';
    const c41Sha = 'c410c410c410c410c410c410c410c410c410c410c410c410c410c410c410c410';
    const reqC41 = computeRequestId(c41Ts, c41Seat, c41Tool, c41Sha);
    assert.match(reqC41, /^[0-9a-f]{16}$/);

    // 1. not_found branch on check (without and with --request-id) and mark
    const checkNotFound41 = runCheckCli(c41Seat, c41Tool, c41Sha);
    assert.equal(checkNotFound41.status, 2);
    assert.deepEqual(Object.keys(checkNotFound41.body).sort(), ['status']);
    assert.equal(checkNotFound41.body.status, 'not_found');

    const checkNotFoundWithReq41 = runCheckCli(c41Seat, c41Tool, c41Sha, ['--request-id', reqC41]);
    assert.equal(checkNotFoundWithReq41.status, 2);
    assert.deepEqual(Object.keys(checkNotFoundWithReq41.body).sort(), ['requestId', 'status']);
    assert.equal(checkNotFoundWithReq41.body.status, 'not_found');
    assert.equal(checkNotFoundWithReq41.body.requestId, reqC41);

    const markNotFound41 = runMarkCli(reqC41, 'executed', 'run-41');
    assert.equal(markNotFound41.status, 2);
    assert.deepEqual(Object.keys(markNotFound41.body).sort(), ['message', 'ok', 'requestId', 'status']);
    assert.equal(markNotFound41.body.status, 'not_found');
    assert.equal(markNotFound41.body.requestId, reqC41);
    assert.equal(markNotFound41.body.ok, false);
    assert.ok(typeof markNotFound41.body.message === 'string' && markNotFound41.body.message.length > 0);

    // 2. pending branch on check and mark
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c41Ts,
        seat: c41Seat,
        tool: c41Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c41Sha,
        head60: 'curl -X POST https://api.example.com/c41',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    const checkPending41 = runCheckCli(c41Seat, c41Tool, c41Sha);
    assert.equal(checkPending41.status, 2);
    assert.deepEqual(Object.keys(checkPending41.body).sort(), ['requestId', 'status']);
    assert.equal(checkPending41.body.status, 'pending');
    assert.equal(checkPending41.body.requestId, reqC41);

    const markPending41 = runMarkCli(reqC41, 'executed', 'run-41');
    assert.equal(markPending41.status, 2);
    assert.deepEqual(Object.keys(markPending41.body).sort(), ['message', 'ok', 'requestId', 'status']);
    assert.equal(markPending41.body.status, 'pending');
    assert.equal(markPending41.body.requestId, reqC41);
    assert.equal(markPending41.body.ok, false);
    assert.ok(typeof markPending41.body.message === 'string' && markPending41.body.message.length > 0);

    // 3. approved (non-consume), approved (--consume), claimed, claim_mismatch, executed (idempotent=false & true)
    recordApprovalDecision({
      requestId: reqC41,
      decision: 'approved',
      by: 'owner',
    });
    const checkApproved41 = runCheckCli(c41Seat, c41Tool, c41Sha);
    assert.equal(checkApproved41.status, 0);
    assert.deepEqual(Object.keys(checkApproved41.body).sort(), ['expiresAt', 'requestId', 'status']);
    assert.equal(checkApproved41.body.status, 'approved');
    assert.equal(checkApproved41.body.requestId, reqC41);
    assert.equal(typeof checkApproved41.body.expiresAt, 'string');
    assert.match(checkApproved41.body.expiresAt, ISO_UTC_MS_REGEX);
    assert.ok(
      typeof parseIsoTimestampMs(checkApproved41.body.expiresAt) === 'number',
      'Case 41 (F28): checkApproved41.body.expiresAt must be a valid ISO timestamp'
    );

    const checkConsumed41 = runCheckCli(c41Seat, c41Tool, c41Sha, ['--consume']);
    assert.equal(checkConsumed41.status, 0);
    assert.deepEqual(
      Object.keys(checkConsumed41.body).sort(),
      ['claimId', 'expiresAt', 'requestId', 'status']
    );
    assert.equal(checkConsumed41.body.status, 'approved');
    assert.equal(checkConsumed41.body.requestId, reqC41);
    assert.equal(checkConsumed41.body.expiresAt, checkApproved41.body.expiresAt);
    assert.match(checkConsumed41.body.expiresAt, ISO_UTC_MS_REGEX);
    assert.ok(typeof parseIsoTimestampMs(checkConsumed41.body.expiresAt) === 'number');
    assert.match(checkConsumed41.body.claimId, /^[0-9a-f]{16}$/);

    const checkClaimed41 = runCheckCli(c41Seat, c41Tool, c41Sha, ['--consume']);
    assert.equal(checkClaimed41.status, 2);
    assert.deepEqual(
      Object.keys(checkClaimed41.body).sort(),
      ['claimId', 'expiresAt', 'requestId', 'status']
    );
    assert.equal(checkClaimed41.body.status, 'claimed');
    assert.equal(checkClaimed41.body.requestId, reqC41, 'Case 41 (F28): claimed response must have requestId === reqC41');
    assert.equal(checkClaimed41.body.claimId, checkConsumed41.body.claimId);
    assert.equal(checkClaimed41.body.expiresAt, checkApproved41.body.expiresAt);
    assert.match(checkClaimed41.body.expiresAt, ISO_UTC_MS_REGEX);
    assert.ok(typeof parseIsoTimestampMs(checkClaimed41.body.expiresAt) === 'number');

    const markMismatch41 = runMarkCli(reqC41, 'executed', 'run-41', '0000000000000000');
    assert.equal(markMismatch41.status, 2);
    assert.deepEqual(Object.keys(markMismatch41.body).sort(), ['message', 'ok', 'requestId', 'status']);
    assert.equal(markMismatch41.body.status, 'claim_mismatch');
    assert.equal(markMismatch41.body.requestId, reqC41);
    assert.equal(markMismatch41.body.ok, false);
    assert.ok(typeof markMismatch41.body.message === 'string' && markMismatch41.body.message.length > 0);

    const markExecFirst41 = runMarkCli(
      reqC41,
      'executed',
      'run-41',
      checkConsumed41.body.claimId
    );
    assert.equal(markExecFirst41.status, 0);
    assert.deepEqual(
      Object.keys(markExecFirst41.body).sort(),
      ['claimId', 'idempotent', 'ok', 'requestId', 'status']
    );
    assert.equal(markExecFirst41.body.status, 'executed');
    assert.equal(markExecFirst41.body.requestId, reqC41);
    assert.equal(markExecFirst41.body.claimId, checkConsumed41.body.claimId);
    assert.equal(markExecFirst41.body.idempotent, false);
    assert.equal(markExecFirst41.body.ok, true);

    const markExecSecond41 = runMarkCli(
      reqC41,
      'executed',
      'run-41',
      checkConsumed41.body.claimId
    );
    assert.equal(markExecSecond41.status, 0);
    assert.deepEqual(
      Object.keys(markExecSecond41.body).sort(),
      ['claimId', 'idempotent', 'ok', 'requestId', 'status']
    );
    assert.equal(markExecSecond41.body.status, 'executed');
    assert.equal(markExecSecond41.body.requestId, reqC41);
    assert.equal(
      markExecSecond41.body.claimId,
      checkConsumed41.body.claimId,
      'Case 41 (F28): idempotent mark response must preserve claimId'
    );
    assert.equal(markExecSecond41.body.idempotent, true);
    assert.equal(markExecSecond41.body.ok, true);

    const checkExecuted41 = runCheckCli(c41Seat, c41Tool, c41Sha);
    assert.equal(checkExecuted41.status, 2);
    assert.deepEqual(
      Object.keys(checkExecuted41.body).sort(),
      ['claimId', 'expiresAt', 'requestId', 'status']
    );
    assert.equal(checkExecuted41.body.status, 'executed');
    assert.equal(checkExecuted41.body.requestId, reqC41);
    assert.equal(checkExecuted41.body.claimId, checkConsumed41.body.claimId);
    assert.equal(checkExecuted41.body.expiresAt, checkApproved41.body.expiresAt);
    assert.match(checkExecuted41.body.expiresAt, ISO_UTC_MS_REGEX);

    // 4. superseded branch (F32): append a newer request for the same (seat, tool, sha256) and verify `--request-id` of older request
    const c41TsNewer = '2026-10-14T16:25:00Z';
    const reqC41Newer = computeRequestId(c41TsNewer, c41Seat, c41Tool, c41Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c41TsNewer,
        seat: c41Seat,
        tool: c41Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c41Sha,
        head60: 'curl -X POST https://api.example.com/c41-newer',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );
    const checkSuperseded41 = runCheckCli(c41Seat, c41Tool, c41Sha, ['--request-id', reqC41]);
    assert.equal(checkSuperseded41.status, 2);
    assert.deepEqual(
      Object.keys(checkSuperseded41.body).sort(),
      ['latestRequestId', 'requestId', 'status']
    );
    assert.equal(checkSuperseded41.body.status, 'superseded');
    assert.equal(checkSuperseded41.body.requestId, reqC41);
    assert.equal(checkSuperseded41.body.latestRequestId, reqC41Newer);
    console.log('  [PASS] Case 41 (F24 + F28 + F32 P2 v09): CLI JSON contract keys & exact values verified (including idempotent claimId, claimed requestId, superseded latestRequestId, and .mmmZ ISO expiresAt)');

    // Case 42 (F22 + F29 + F31 P2 v09): Dedicated isolated ledger for Case 42 so EVERY SINGLE LINE in the `.jsonl` file
    // is parsed and verified (0 skipped lines, 0 `.slice(-4)`), PLUS read-back verification (`check` + `dump`) after `mark`:
    // - (42a) Truncating 1 byte (`\n`) after `--consume` -> second `--consume` exits 2 (`status: "claimed"`),
    //   `approval_mark.py --claim-id` exits 0 (`status: "executed"`), read-back via `check` and `dump --request-id` confirms
    //   `status === "executed"` with matching `requestId`, `claimId`, and `runId`, and EVERY line in the ledger parses as valid JSON.
    // - (42b) Injecting a partial `os.write` that writes `b[:-1]` (complete JSON claim object missing only its trailing `\n`)
    //   and then raises `OSError(errno.EIO)` during `approval_check.py --consume`:
    //   - First caller receives `exit 2` with `{"status": "io_error", "reason": "EIO"}` (never `approved`), and the ledger file ends with byte `0x7d` (`}`).
    //   - Subsequent `approval_check.py --consume` folds the complete JSON object at EOF and exits 2 (`status: "claimed"`, with matching 16-hex `claimId`).
    //   - `approval_mark.py --claim-id` repairs the missing `\n`, records `executed` (`exit 0`), read-back via `check` and `dump --request-id`
    //     confirms `status === "executed"` with matching `requestId`, `claimId`, and `runId`, and EVERY SINGLE LINE in the ledger parses as valid JSON!
    const c42IsolatedDir = path.join(
      os.tmpdir(),
      'aiboss-c42-f29-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    );
    const c42ApprovalsDir = path.join(c42IsolatedDir, 'approvals');
    fs.mkdirSync(c42ApprovalsDir, { recursive: true });
    try {
      const c42DateStr = new Date().toISOString().split('T')[0];
      const c42LogPath = path.join(c42ApprovalsDir, `${c42DateStr}.jsonl`);

      const runCheckC42 = (seat, tool, sha, extra = []) => {
        const res = spawnSync(
          'python3',
          [CHECK_SCRIPT, '--seat', seat, '--tool', tool, '--sha256', sha, ...extra],
          {
            env: { ...process.env, AIBOSS_DATA_DIR: c42IsolatedDir },
            encoding: 'utf-8',
          }
        );
        const out = (res.stdout || '').trim();
        return { status: res.status, body: out ? JSON.parse(out) : null };
      };

      const runMarkC42 = (reqId, result, runId, claimId) => {
        const args = [
          MARK_SCRIPT,
          `--request-id=${reqId}`,
          `--result=${result}`,
          `--run-id=${runId}`,
          `--claim-id=${claimId}`,
        ];
        const res = spawnSync('python3', args, {
          env: { ...process.env, AIBOSS_DATA_DIR: c42IsolatedDir },
          encoding: 'utf-8',
        });
        const out = (res.stdout || '').trim();
        return { status: res.status, body: out ? JSON.parse(out) : null };
      };

      const runDumpItemC42 = (reqId) => {
        const res = spawnSync(
          'python3',
          [LEDGER_SCRIPT, 'dump', '--json', `--request-id=${reqId}`],
          {
            env: { ...process.env, AIBOSS_DATA_DIR: c42IsolatedDir },
            encoding: 'utf-8',
          }
        );
        assert.equal(res.status, 0, `runDumpItemC42 failed: ${res.stderr}`);
        return JSON.parse(res.stdout.trim()).item;
      };

      // Helper that parses EVERY SINGLE LINE in `c42LogPath` with zero exemptions
      const assertAllLedgerLinesValidJson = (expectedLineCount, label) => {
        const rawBytes = fs.readFileSync(c42LogPath);
        assert.equal(
          rawBytes[rawBytes.length - 1],
          0x0a,
          `Case 42 (${label}): ledger file must end with LF (0x0a)`
        );
        const rawText = rawBytes.toString('utf-8');
        const lines = rawText.split('\n').filter((l) => l.length > 0);
        for (let idx = 0; idx < lines.length; idx++) {
          assert.doesNotThrow(
            () => JSON.parse(lines[idx]),
            `Case 42 (${label}): line ${idx + 1}/${lines.length} failed JSON.parse: ${lines[idx]}`
          );
        }
        assert.equal(
          lines.length,
          expectedLineCount,
          `Case 42 (${label}): expected ${expectedLineCount} total lines in isolated ledger, got ${lines.length}`
        );
      };

      // (42a) Truncate 1 byte (`\n`) after `--consume`
      const c42TsA = '2026-10-14T16:30:00Z';
      const c42SeatA = 'seat-c42a-f22';
      const c42ToolA = 'Bash';
      const c42ShaA = 'c42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42ac42a';
      const reqC42A = computeRequestId(c42TsA, c42SeatA, c42ToolA, c42ShaA);

      fs.appendFileSync(
        c42LogPath,
        [
          JSON.stringify({
            ts: c42TsA,
            seat: c42SeatA,
            tool: c42ToolA,
            host: 'api.example.com',
            len: 64,
            sha256: c42ShaA,
            head60: 'curl -X POST https://api.example.com/c42a-f22',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqC42A,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        ].join('\n') + '\n',
        'utf-8'
      );

      const firstConsume42a = runCheckC42(c42SeatA, c42ToolA, c42ShaA, ['--consume']);
      assert.equal(firstConsume42a.status, 0);
      assert.equal(firstConsume42a.body.status, 'approved');
      const claimId42a = firstConsume42a.body.claimId;
      assert.match(claimId42a, /^[0-9a-f]{16}$/);

      const statBeforeTrunc42a = fs.statSync(c42LogPath);
      const lastByteBuf42a = Buffer.alloc(1);
      const fd42a = fs.openSync(c42LogPath, 'r');
      fs.readSync(fd42a, lastByteBuf42a, 0, 1, statBeforeTrunc42a.size - 1);
      fs.closeSync(fd42a);
      assert.equal(lastByteBuf42a[0], 0x0a, 'Case 42a (F22): last byte before truncation must be LF');
      fs.truncateSync(c42LogPath, statBeforeTrunc42a.size - 1);

      const secondConsume42a = runCheckC42(c42SeatA, c42ToolA, c42ShaA, ['--consume']);
      assert.equal(secondConsume42a.status, 2);
      assert.equal(secondConsume42a.body.status, 'claimed');
      assert.equal(secondConsume42a.body.claimId, claimId42a);

      const markAfterTrunc42a = runMarkC42(reqC42A, 'executed', 'run-c42a', claimId42a);
      assert.equal(markAfterTrunc42a.status, 0);
      assert.equal(markAfterTrunc42a.body.status, 'executed');

      // Read-back verification on isolated ledger after 42a mark (F31)
      const checkAfterMark42a = runCheckC42(c42SeatA, c42ToolA, c42ShaA);
      assert.equal(checkAfterMark42a.status, 2);
      assert.equal(checkAfterMark42a.body.status, 'executed');
      assert.equal(checkAfterMark42a.body.requestId, reqC42A);
      assert.equal(checkAfterMark42a.body.claimId, claimId42a);
      const dumpItem42a = runDumpItemC42(reqC42A);
      assert.equal(dumpItem42a.status, 'executed');
      assert.equal(dumpItem42a.requestId, reqC42A);
      assert.equal(dumpItem42a.claim.claimId, claimId42a);
      assert.equal(dumpItem42a.execution.claimId, claimId42a);
      assert.equal(dumpItem42a.execution.result, 'executed');
      assert.equal(dumpItem42a.execution.runId, 'run-c42a');

      // Parse EVERY SINGLE LINE in `c42LogPath` (4 lines: request, decision, claim, execution)
      assertAllLedgerLinesValidJson(4, '42a-post-mark');

      // (42b — F29 + F31): Inject `os.write` that writes `b[:-1]` (complete JSON claim object without trailing `\n`)
      // and raises `OSError(errno.EIO)` on the remaining 1 byte:
      // - Caller 1 receives `exit 2`, `status: "io_error"`, `reason: "EIO"`, and the file ends with byte `0x7d` (`}`).
      // - Caller 2 (`--consume`) sees `status: "claimed"` (`exit 2`) with the exact `claimId` from the unterminated tail line.
      // - `approval_mark.py` repairs the missing `\n` and records `executed` (`exit 0`),
      //   read-back (`check` + `dump`) confirms `executed` with matching `requestId`/`claimId`/`runId`,
      //   and all 8 lines in `c42LogPath` parse cleanly as valid JSON!
      const c42TsB = '2026-10-14T16:31:00Z';
      const c42SeatB = 'seat-c42b-f29';
      const c42ToolB = 'Bash';
      const c42ShaB = 'c42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42bc42b';
      const reqC42B = computeRequestId(c42TsB, c42SeatB, c42ToolB, c42ShaB);

      fs.appendFileSync(
        c42LogPath,
        [
          JSON.stringify({
            ts: c42TsB,
            seat: c42SeatB,
            tool: c42ToolB,
            host: 'api.example.com',
            len: 64,
            sha256: c42ShaB,
            head60: 'curl -X POST https://api.example.com/c42b-f29',
            reason: 'external_post_send',
          }),
          JSON.stringify({
            type: 'decision',
            requestId: reqC42B,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        ].join('\n') + '\n',
        'utf-8'
      );

      const pyMissingLfEio42b = spawnSync(
        'python3',
        [
          '-c',
          `
import errno, os, sys
sys.path.insert(0, 'operations/scripts')
import approval_check

orig_write = os.write
state = {'calls': 0}
def write_without_final_lf_then_eio(fd, b):
    state['calls'] += 1
    if state['calls'] == 1 and b.endswith(b'\\n') and len(b) > 1:
        return orig_write(fd, b[:-1])
    raise OSError(errno.EIO, 'Simulated EIO on final LF byte')

os.write = write_without_final_lf_then_eio
sys.argv = ['approval_check.py', '--seat', ${JSON.stringify(c42SeatB)}, '--tool', ${JSON.stringify(c42ToolB)}, '--sha256', ${JSON.stringify(c42ShaB)}, '--consume']
approval_check.main()
`,
        ],
        {
          env: { ...process.env, AIBOSS_DATA_DIR: c42IsolatedDir },
          encoding: 'utf-8',
        }
      );
      assert.equal(
        pyMissingLfEio42b.status,
        2,
        `Case 42b (F29): injected write missing LF + EIO must exit 2, got ${pyMissingLfEio42b.status}`
      );
      const body42bCaller1 = JSON.parse(pyMissingLfEio42b.stdout.trim());
      assert.equal(body42bCaller1.status, 'io_error');
      assert.equal(body42bCaller1.reason, 'EIO');

      // Directly assert the ledger file currently ends with byte 0x7d ('}') and parse the unterminated claim line
      const rawBytesAfterEio42b = fs.readFileSync(c42LogPath);
      assert.equal(
        rawBytesAfterEio42b[rawBytesAfterEio42b.length - 1],
        0x7d,
        'Case 42b (F29): ledger file immediately after write-without-LF + EIO must end with 0x7d (})'
      );
      const rawLinesAfterEio42b = rawBytesAfterEio42b.toString('utf-8').split('\n');
      const unterminatedTail42b = JSON.parse(rawLinesAfterEio42b[rawLinesAfterEio42b.length - 1]);
      assert.equal(unterminatedTail42b.type, 'claim');
      assert.equal(unterminatedTail42b.requestId, reqC42B);

      // Second `--consume` sees `status: "claimed"` (`exit 2`) with the exact claimId from the unterminated tail line
      const secondConsume42b = runCheckC42(c42SeatB, c42ToolB, c42ShaB, ['--consume']);
      assert.equal(secondConsume42b.status, 2);
      assert.equal(secondConsume42b.body.status, 'claimed');
      assert.equal(secondConsume42b.body.requestId, reqC42B);
      const claimId42b = secondConsume42b.body.claimId;
      assert.match(claimId42b, /^[0-9a-f]{16}$/);
      assert.equal(claimId42b, unterminatedTail42b.claimId);

      // `approval_mark.py` repairs the missing `\n` and records `executed` (`exit 0`)
      const markAfterEio42b = runMarkC42(reqC42B, 'executed', 'run-c42b', claimId42b);
      assert.equal(markAfterEio42b.status, 0);
      assert.equal(markAfterEio42b.body.status, 'executed');

      // Read-back verification on isolated ledger after 42b mark (F31)
      const checkAfterMark42b = runCheckC42(c42SeatB, c42ToolB, c42ShaB);
      assert.equal(checkAfterMark42b.status, 2);
      assert.equal(checkAfterMark42b.body.status, 'executed');
      assert.equal(checkAfterMark42b.body.requestId, reqC42B);
      assert.equal(checkAfterMark42b.body.claimId, claimId42b);
      const dumpItem42b = runDumpItemC42(reqC42B);
      assert.equal(dumpItem42b.status, 'executed');
      assert.equal(dumpItem42b.requestId, reqC42B);
      assert.equal(dumpItem42b.claim.claimId, claimId42b);
      assert.equal(dumpItem42b.execution.claimId, claimId42b);
      assert.equal(dumpItem42b.execution.result, 'executed');
      assert.equal(dumpItem42b.execution.runId, 'run-c42b');

      // Parse EVERY SINGLE LINE in `c42LogPath` (all 8 lines across 42a + 42b must be valid JSON!)
      assertAllLedgerLinesValidJson(8, '42b-all-8-lines');
    } finally {
      fs.rmSync(c42IsolatedDir, { recursive: true, force: true });
    }
    console.log('  [PASS] Case 42 (F22 + F29 + F31 P2 v09): Isolated ledger verifies 100% of lines parse as valid JSON + read-back check/dump executed after 1-byte LF truncation AND after injected write-missing-LF + EIO');

    // =========================================================================
    // CASE 43 (DE-A4-v10 F34 & F33): `/settings` page error boundary
    // Ledger failures (`io_error` when python3 fails/missing, `ledger_unreadable`
    // when ledger file is chmod 000, `lock_timeout` when lock is held) MUST NOT
    // crash `/settings`; UI-1 cards (`display-settings-card`, `Text size`,
    // `Agent Response Language`) must still render alongside
    // `data-testid="approvals-error-card"` with the exact reason code and `Retry`
    // button, and NEVER show "No pending approval requests." while in error state.
    // =========================================================================
    const c43IsolatedDir = path.join(testDataDir, 'case43-settings-boundary');
    const c43ApprovalsDir = path.join(c43IsolatedDir, 'approvals');
    fs.mkdirSync(c43ApprovalsDir, { recursive: true });
    fs.writeFileSync(
      path.join(c43ApprovalsDir, '.test-ledger'),
      'aiboss-test-ledger-marker\n',
      'utf-8'
    );
    const prevDataDir43 = process.env.AIBOSS_DATA_DIR;
    const prevPath43 = process.env.PATH;
    const prevLockTimeout43 = process.env.AIBOSS_TEST_LOCK_TIMEOUT_SEC;
    process.env.AIBOSS_DATA_DIR = c43IsolatedDir;
    const c43TodayPath = getApprovalLogPathForDate(new Date());
    fs.writeFileSync(c43TodayPath, '', 'utf-8');

    try {
      // 43a: Broken/missing python3 on PATH -> io_error card on /settings, UI-1 intact
      const emptyBinDir43 = path.join(c43IsolatedDir, 'empty-bin');
      fs.mkdirSync(emptyBinDir43, { recursive: true });
      process.env.PATH = emptyBinDir43;
      const html43a = renderToStaticMarkup(React.createElement(SettingsPage));
      process.env.PATH = prevPath43;

      assert.ok(
        html43a.includes('display-settings-card'),
        'Case 43a (F34): /settings must still render display-settings-card when python3 is unavailable'
      );
      assert.ok(
        html43a.includes('Text size'),
        'Case 43a (F34/F33): /settings must still render "Text size" label when python3 is unavailable'
      );
      assert.ok(
        html43a.includes('Agent Response Language'),
        'Case 43a (F34): /settings must still render "Agent Response Language" when python3 is unavailable'
      );
      assert.ok(
        html43a.includes('id="approvals-settings-card"'),
        'Case 43a (F34): /settings must render approvals-settings-card section'
      );
      assert.ok(
        html43a.includes('data-testid="approvals-error-card"'),
        'Case 43a (F34): /settings must render data-testid="approvals-error-card" on io_error'
      );
      assert.ok(
        html43a.includes('data-error-code="io_error"') && html43a.includes('>io_error</code>'),
        'Case 43a (F34): approvals-error-card must display reason code io_error'
      );
      assert.ok(
        html43a.includes('data-testid="approvals-retry-btn"') && html43a.includes('>Retry</button>'),
        'Case 43a (F34): approvals-error-card must include Retry button'
      );
      assert.ok(
        !html43a.includes('No pending approval requests.'),
        'Case 43a (F34): must NOT masquerade io_error as empty pending approvals'
      );
      assert.ok(
        !html43a.includes('No decided requests recorded yet.'),
        'Case 43a (F34): must NOT masquerade io_error as empty decided ledger'
      );

      // 43b: Unreadable ledger file (chmod 000) -> ledger_unreadable card on /settings, UI-1 intact
      fs.chmodSync(c43TodayPath, 0o000);
      let html43b = '';
      try {
        html43b = renderToStaticMarkup(React.createElement(SettingsPage));
      } finally {
        fs.chmodSync(c43TodayPath, 0o644);
      }
      assert.ok(
        html43b.includes('display-settings-card') && html43b.includes('Text size'),
        'Case 43b (F34): /settings must still render display-settings-card and "Text size" when ledger is chmod 000'
      );
      assert.ok(
        html43b.includes('data-testid="approvals-error-card"'),
        'Case 43b (F34): /settings must render data-testid="approvals-error-card" on chmod 000'
      );
      assert.ok(
        html43b.includes('data-error-code="ledger_unreadable"') &&
          html43b.includes('>ledger_unreadable</code>'),
        'Case 43b (F34): approvals-error-card must display reason code ledger_unreadable'
      );
      assert.ok(
        html43b.includes('data-testid="approvals-retry-btn"'),
        'Case 43b (F34): approvals-error-card must include Retry button on ledger_unreadable'
      );
      assert.ok(
        !html43b.includes('No pending approval requests.'),
        'Case 43b (F34): must NOT masquerade ledger_unreadable as empty pending approvals'
      );

      // 43c: Lock timeout (ApprovalLockTimeoutError thrown by getApprovals) -> lock_timeout card on /settings, UI-1 intact
      const lockTimeoutBinDir43 = path.join(c43IsolatedDir, 'lock-timeout-bin');
      fs.mkdirSync(lockTimeoutBinDir43, { recursive: true });
      const lockTimeoutPy43 = path.join(lockTimeoutBinDir43, 'python3');
      fs.writeFileSync(
        lockTimeoutPy43,
        '#!/bin/sh\nprintf \'{"status":"lock_timeout"}\\n\'\nexit 2\n',
        'utf-8'
      );
      fs.chmodSync(lockTimeoutPy43, 0o755);
      process.env.PATH = `${lockTimeoutBinDir43}:${prevPath43}`;
      let html43c = '';
      try {
        html43c = renderToStaticMarkup(React.createElement(SettingsPage));
      } finally {
        process.env.PATH = prevPath43;
      }
      assert.ok(
        html43c.includes('display-settings-card') && html43c.includes('Text size'),
        'Case 43c (F34): /settings must still render display-settings-card and "Text size" on lock_timeout'
      );
      assert.ok(
        html43c.includes('data-testid="approvals-error-card"') &&
          html43c.includes('data-error-code="lock_timeout"') &&
          html43c.includes('>lock_timeout</code>'),
        'Case 43c (F34): approvals-error-card must display reason code lock_timeout'
      );
      assert.ok(
        !html43c.includes('No pending approval requests.'),
        'Case 43c (F34): must NOT masquerade lock_timeout as empty pending approvals'
      );

      // 43d: Normal healthy ledger -> renders normal Approvals card without error card
      const html43d = renderToStaticMarkup(React.createElement(SettingsPage));
      assert.ok(
        html43d.includes('display-settings-card') &&
          html43d.includes('Text size') &&
          html43d.includes('Agent Response Language') &&
          html43d.includes('id="approvals-settings-card"'),
        'Case 43d (F34/F33): normal /settings must render display-settings-card, "Text size", "Agent Response Language", and id="approvals-settings-card"'
      );
      assert.ok(
        !html43d.includes('data-testid="approvals-error-card"'),
        'Case 43d (F34): normal /settings must NOT render approvals-error-card'
      );
      assert.ok(
        html43d.includes('Pending Requests') &&
          html43d.includes('Decided Ledger') &&
          html43d.includes('No pending approval requests.'),
        'Case 43d (F34): normal empty ledger on /settings renders Pending Requests & Decided Ledger normally'
      );
    } finally {
      process.env.PATH = prevPath43;
      process.env.AIBOSS_DATA_DIR = prevDataDir43;
      if (prevLockTimeout43 === undefined) {
        delete process.env.AIBOSS_TEST_LOCK_TIMEOUT_SEC;
      } else {
        process.env.AIBOSS_TEST_LOCK_TIMEOUT_SEC = prevLockTimeout43;
      }
      fs.rmSync(c43IsolatedDir, { recursive: true, force: true });
    }
    console.log('  [PASS] Case 43 (F34 + F33 P2 v10): /settings page error boundary isolates io_error, ledger_unreadable, and lock_timeout into approvals-error-card while keeping DisplaySettingsCard ("Text size") intact');

    console.log('>>> ALL 43 A-4 v10 APPROVAL LEDGER TEST CASES PASSED <<<');
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
  }
})();
