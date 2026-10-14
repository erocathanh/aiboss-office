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

import * as approvalsLedgerModule from '../src/lib/approvals-ledger.ts';
import {
  ApprovalIoError,
  ApprovalLedgerUnreadableError,
  ApprovalLockLostError,
  ApprovalLockTimeoutError,
  computeRequestId,
  getApprovalsDir,
  getApprovalLogPathForDate,
  getApprovals,
  getApprovalById,
  getSystemBootId,
  isLockFileStale,
  parseIsoTimestampMs,
  recordApprovalDecision,
  recordApprovalExecution,
  readApprovalRecords,
  trimAscii,
  withApprovalLock,
} from '../src/lib/approvals-ledger.ts';
import { GET as getApprovalsRoute } from '../src/app/api/approvals/route.ts';
import { POST as postDecisionRoute } from '../src/app/api/approvals/[requestId]/decision/route.ts';
import { ApprovalsSettingsCard } from '../src/components/office/ApprovalsSettingsCard.tsx';

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

console.log('--- Testing A-4 v04 Approval Ledger & Hook Contract (tests/approvals.test.mjs) ---');

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
    fs.appendFileSync(todayPath, '{"ts":"2026-10-14T11:16:00Z","seat":"truncated_frag', 'utf-8');

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

    // Case 25 (F14, F15, F16 v04): Single atomic `rename` stale lock recovery (no `.approvals.reclaim.lock`),
    // `bootId` liveness check (protects live PID with matching bootId, reclaims PID reuse across reboot),
    // old `.approvals.lock.tmp*`/`.stale-*` artifact sweep, and strict deadline enforcement (`lock_timeout`).
    const lockPath = path.join(getApprovalsDir(), '.approvals.lock');
    const traceFile = path.join(testDataDir, 'lock-reclaim-trace.txt');
    const currentBootId = getSystemBootId();

    // 25a (F16): Verify live PID lock > 30s old with matching bootId is NOT stale in TS or Python,
    // whereas live PID lock with MISMATCHED bootId (simulating reboot PID reuse) IS stale in both!
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        bootId: currentBootId,
        createdAt: Date.now() - 60_000,
      }),
      'utf-8'
    );
    const pastTimeSec = (Date.now() - 60_000) / 1000;
    fs.utimesSync(lockPath, pastTimeSec, pastTimeSec);
    assert.equal(
      isLockFileStale(lockPath),
      false,
      'Case 25a (F16): TS must NEVER treat a lock held by a live PID with matching bootId as stale even if age > 30s'
    );
    const pyLiveCheck = spawnSync(
      'python3',
      [
        '-c',
        `import sys; sys.path.insert(0, 'operations/scripts'); import approval_check; print(approval_check.is_lock_file_stale(${JSON.stringify(lockPath)}))`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyLiveCheck.stdout.trim(),
      'False',
      'Case 25a (F16): Python must NEVER treat a lock held by a live PID with matching bootId as stale even if age > 30s'
    );

    // Mismatched bootId with live PID -> stale in both TS and Python!
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        bootId: 'boot-id-from-previous-reboot-000',
        createdAt: Date.now() - 60_000,
      }),
      'utf-8'
    );
    assert.equal(
      isLockFileStale(lockPath),
      true,
      'Case 25a (F16): TS must treat lock with mismatched bootId as stale even if PID is alive after reboot'
    );
    const pyRebootCheck = spawnSync(
      'python3',
      [
        '-c',
        `import sys; sys.path.insert(0, 'operations/scripts'); import approval_check; print(approval_check.is_lock_file_stale(${JSON.stringify(lockPath)}))`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyRebootCheck.stdout.trim(),
      'True',
      'Case 25a (F16): Python must treat lock with mismatched bootId as stale even if PID is alive after reboot'
    );
    fs.unlinkSync(lockPath);

    // Verify F16 sweep of old `.approvals.lock.tmp-*` / `.approvals.lock.stale-*` (> 10 minutes old)
    const oldTmpArtifact = path.join(getApprovalsDir(), '.approvals.lock.tmp-old-crash');
    const oldStaleArtifact = path.join(getApprovalsDir(), '.approvals.lock.stale-old-crash');
    fs.writeFileSync(oldTmpArtifact, 'old', 'utf-8');
    fs.writeFileSync(oldStaleArtifact, 'old', 'utf-8');
    const fifteenMinAgoSec = (Date.now() - 15 * 60_000) / 1000;
    fs.utimesSync(oldTmpArtifact, fifteenMinAgoSec, fifteenMinAgoSec);
    fs.utimesSync(oldStaleArtifact, fifteenMinAgoSec, fifteenMinAgoSec);
    withApprovalLock(() => {});
    assert.equal(fs.existsSync(oldTmpArtifact), false, 'F16: old .tmp-* lock artifact must be swept');
    assert.equal(fs.existsSync(oldStaleArtifact), false, 'F16: old .stale-* lock artifact must be swept');

    // 25b (F14): Seed an orphan lock with a dead PID (99999999) and launch 2 concurrent child processes
    // that both reclaim the stale lock via single atomic `rename`, record `enter`, sleep 300ms inside the critical section, and record `exit`.
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 99999999, bootId: currentBootId, createdAt: Date.now() - 60_000 }),
      'utf-8'
    );
    fs.writeFileSync(traceFile, '', 'utf-8');

    const spawnLockWorker = (workerId) =>
      new Promise((resolve, reject) => {
        const script = `
          import fs from 'node:fs';
          import { withApprovalLock } from './src/lib/approvals-ledger.ts';
          const trace = process.env.LOCK_TRACE_FILE;
          const id = process.env.LOCK_WORKER_ID;
          withApprovalLock(() => {
            fs.appendFileSync(trace, \`enter:\${id}:\${Date.now()}\\n\`, 'utf-8');
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
            fs.appendFileSync(trace, \`exit:\${id}:\${Date.now()}\\n\`, 'utf-8');
          });
        `;
        const child = spawn(
          process.execPath,
          ['--import', './tests/register.mjs', '--input-type=module', '-e', script],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              AIBOSS_DATA_DIR: testDataDir,
              LOCK_TRACE_FILE: traceFile,
              LOCK_WORKER_ID: workerId,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        let stderr = '';
        child.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, stderr }));
      });

    const [w1, w2] = await Promise.all([spawnLockWorker('W1'), spawnLockWorker('W2')]);
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
      `Case 25b (F14): Critical sections overlapped during stale lock recovery! Trace: ${JSON.stringify(traceLines)}`
    );
    const leftoverLocks = fs
      .readdirSync(getApprovalsDir())
      .filter((f) => f.startsWith('.approvals.'));
    assert.deepEqual(leftoverLocks, [], 'Case 25b (F14): all lock/stale files must be cleaned up');

    // 25c (F15):
    // (1) Positive control: orphan lock (dead PID 99999999) is reclaimed by approval_check.py in < 1s
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: 99999999, bootId: currentBootId, createdAt: Date.now() - 10_000 }),
      'utf-8'
    );
    const t0Reclaim = Date.now();
    const pyOrphanReclaim = runCheckCli(f8Seat, f8Tool, f8Sha);
    const elapsedReclaimMs = Date.now() - t0Reclaim;
    assert.equal(pyOrphanReclaim.status, 0, 'Case 25c (F15): orphan lock must be reclaimed by approval_check.py');
    assert.equal(pyOrphanReclaim.body.status, 'approved');
    assert.ok(
      elapsedReclaimMs < 1000,
      `Case 25c (F15): orphan lock reclaim must finish in < 1000ms, took ${elapsedReclaimMs}ms`
    );

    // (2) Live PID holding `.approvals.lock` -> TS withApprovalLock throws ApprovalLockTimeoutError,
    // POST /api/approvals/<id>/decision returns HTTP 503 (`error: 'lock_timeout'`), and
    // Python approval_check.py (timeout 5s) exits 2 with `{"status": "lock_timeout"}` in <= 6s (never hangs!)
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        bootId: currentBootId,
        hostname: os.hostname(),
        createdAt: Date.now(),
      }),
      'utf-8'
    );
    try {
      assert.throws(
        () => withApprovalLock(() => {}, 150),
        (err) => err instanceof ApprovalLockTimeoutError && err.code === 'lock_timeout',
        'Case 25c (F15): TS withApprovalLock must throw ApprovalLockTimeoutError when deadline expires'
      );

      // Run Python 5s lock_timeout check and POST /api/approvals/<id>/decision 5s lock_timeout concurrently
      const t0PyTimeout = Date.now();
      const pyLockPromise = runCheckCliAsync(f8Seat, f8Tool, f8Sha);
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

      const pyLockTimeout = await pyLockPromise;
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
        elapsedPyTimeoutMs >= 4800 && elapsedPyTimeoutMs <= 6500,
        `Case 25c (F15): approval_check.py timeout must complete in 4.8s..6.5s, took ${elapsedPyTimeoutMs}ms`
      );
    } finally {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    }

    // 25d (F16 v05):
    // (1) Lock from a DIFFERENT hostname is conservatively treated as NOT stale even if bootId differs
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        bootId: 'boot-id-from-other-machine',
        hostname: 'remote-host-different-from-local.internal',
        createdAt: Date.now() - 60_000,
      }),
      'utf-8'
    );
    assert.equal(
      isLockFileStale(lockPath),
      false,
      'Case 25d (F16 v05): TS must NOT treat lock from another hostname as stale'
    );
    const pyOtherHostCheck = spawnSync(
      'python3',
      [
        '-c',
        `import sys; sys.path.insert(0, 'operations/scripts'); import approval_check; print(approval_check.is_lock_file_stale(${JSON.stringify(lockPath)}))`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyOtherHostCheck.stdout.trim(),
      'False',
      'Case 25d (F16 v05): Python must NOT treat lock from another hostname as stale'
    );
    fs.unlinkSync(lockPath);

    // (2) Sweep of old `.approvals.lock.tmp-<pid>-*` / `.stale-<pid>-*` (> 10 min) MUST preserve files owned by a LIVE PID
    // while sweeping files owned by a DEAD PID (99999999)
    const livePidTmpArtifact = path.join(
      getApprovalsDir(),
      `.approvals.lock.tmp-${process.pid}-live-owner`
    );
    const deadPidTmpArtifact = path.join(
      getApprovalsDir(),
      '.approvals.lock.tmp-99999999-dead-owner'
    );
    fs.writeFileSync(livePidTmpArtifact, 'live', 'utf-8');
    fs.writeFileSync(deadPidTmpArtifact, 'dead', 'utf-8');
    fs.utimesSync(livePidTmpArtifact, fifteenMinAgoSec, fifteenMinAgoSec);
    fs.utimesSync(deadPidTmpArtifact, fifteenMinAgoSec, fifteenMinAgoSec);
    try {
      withApprovalLock(() => {});
      assert.equal(
        fs.existsSync(deadPidTmpArtifact),
        false,
        'Case 25d (F16 v05): TS sweep must delete >10min .tmp artifact of dead PID'
      );
      assert.equal(
        fs.existsSync(livePidTmpArtifact),
        true,
        'Case 25d (F16 v05): TS sweep must NEVER delete .tmp artifact of a live PID even if >10min old'
      );

      // Recreate deadPidTmpArtifact and test Python sweep as well
      fs.writeFileSync(deadPidTmpArtifact, 'dead', 'utf-8');
      fs.utimesSync(deadPidTmpArtifact, fifteenMinAgoSec, fifteenMinAgoSec);
      runCheckCli(f8Seat, f8Tool, f8Sha);
      assert.equal(
        fs.existsSync(deadPidTmpArtifact),
        false,
        'Case 25d (F16 v05): Python sweep must delete >10min .tmp artifact of dead PID'
      );
      assert.equal(
        fs.existsSync(livePidTmpArtifact),
        true,
        'Case 25d (F16 v05): Python sweep must NEVER delete .tmp artifact of a live PID even if >10min old'
      );
    } finally {
      try {
        fs.unlinkSync(livePidTmpArtifact);
      } catch {
        /* ignore */
      }
      try {
        fs.unlinkSync(deadPidTmpArtifact);
      } catch {
        /* ignore */
      }
    }
    console.log('  [PASS] Case 25 (F14, F15, F16 v05): stale lock recovery, bootId + hostname liveness, live-PID sweep protection, and POST 503 + CLI <=6s lock_timeout');

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

    // Verify (f) F2 v05 Counterexample 3 & 4:
    // (f1) Valid decision line with non-standard JSON constant `"ZEBRA": NaN` -> rejected by BOTH TS and Python (stays pending)
    // (f2) Bare CR (`\r`, 0x0d) in the middle of a line -> neither TS nor Python treats bare `\r` as a line delimiter!
    const c26SeatNan = 'seat-c26-nan';
    const c26ShaNan = 'c267c267c267c267c267c267c267c267c267c267c267c267c267c267c267c267';
    const tsNan = '2026-10-14T12:14:00Z';
    const reqNan = computeRequestId(tsNan, c26SeatNan, c26ToolA, c26ShaNan);

    const c26SeatCr = 'seat-c26-cr';
    const c26ShaCr = 'c268c268c268c268c268c268c268c268c268c268c268c268c268c268c268c268';
    const tsCr = '2026-10-14T12:14:01Z';
    const reqCr = computeRequestId(tsCr, c26SeatCr, c26ToolA, c26ShaCr);

    const c26SeatCrWs = 'seat-c26-cr-ws';
    const c26ShaCrWs = 'c269c269c269c269c269c269c269c269c269c269c269c269c269c269c269c269';
    const tsCrWs = '2026-10-14T12:14:02Z';
    const reqCrWs = computeRequestId(tsCrWs, c26SeatCrWs, c26ToolA, c26ShaCrWs);

    fs.appendFileSync(
      todayPath,
      [
        JSON.stringify({
          ts: tsNan,
          seat: c26SeatNan,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaNan,
          head60: 'curl -X POST https://api.example.com/nan',
          reason: 'external_post_send',
        }),
        `{"type":"decision","requestId":"${reqNan}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}","ZEBRA":NaN}`,
        `{"type":"decision","requestId":"${reqNan}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}","INF":Infinity}`,
        JSON.stringify({
          ts: tsCr,
          seat: c26SeatCr,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaCr,
          head60: 'curl -X POST https://api.example.com/cr',
          reason: 'external_post_send',
        }),
        // Two JSON objects separated by bare \r on a single LF-delimited line -> must NOT be split into 2 lines by Python!
        `{"type":"decision","requestId":"${reqCr}","decision":"denied","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}"}\r` +
          JSON.stringify({
            type: 'decision',
            requestId: reqCr,
            decision: 'approved',
            by: 'owner',
            at: recentAtIso,
            expiresAt: futureExpIso,
          }),
        JSON.stringify({
          ts: tsCrWs,
          seat: c26SeatCrWs,
          tool: c26ToolA,
          host: 'api.example.com',
          len: 64,
          sha256: c26ShaCrWs,
          head60: 'curl -X POST https://api.example.com/crws',
          reason: 'external_post_send',
        }),
        // Single valid JSON object containing bare \r as RFC 8259 token whitespace -> kept as 1 line and parsed identically in both TS and Python!
        `{"type":\r"decision",\r"requestId":"${reqCrWs}","decision":"approved","by":"owner","at":"${recentAtIso}","expiresAt":"${futureExpIso}"}`,
      ].join('\n') + '\n',
      'utf-8'
    );

    assert.equal(getApprovalById(reqNan)?.status, 'pending', 'F2 v05: TS must reject decision line containing NaN/Infinity');
    const pyNan = runCheckCli(c26SeatNan, c26ToolA, c26ShaNan);
    assert.equal(pyNan.status, 2);
    assert.equal(
      pyNan.body.status,
      'pending',
      'F2 v05: Python must reject decision line containing NaN/Infinity (parse_constant)'
    );

    assert.equal(
      getApprovalById(reqCr)?.status,
      'pending',
      'F2 v05: TS must not split line on bare CR'
    );
    const pyCr = runCheckCli(c26SeatCr, c26ToolA, c26ShaCr);
    assert.equal(pyCr.status, 2);
    assert.equal(
      pyCr.body.status,
      'pending',
      'F2 v05: Python must split strictly on b"\\n" and never treat bare CR as a line boundary'
    );

    assert.equal(
      getApprovalById(reqCrWs)?.status,
      'approved',
      'F2 v05: TS must keep single JSON object with bare CR whitespace intact'
    );
    const pyCrWs = runCheckCli(c26SeatCrWs, c26ToolA, c26ShaCrWs);
    assert.equal(
      pyCrWs.status,
      0,
      'F2 v05: Python must keep single JSON object with bare CR whitespace intact'
    );
    assert.equal(pyCrWs.body.status, 'approved');
    console.log('  [PASS] Case 26 (F2 v03..v05): TS & Python fold identically on NaN/Infinity, bare CR LF-only line split, "type": null, U+FEFF BOM, numeric seatId, Unicode code points, and ms truncation');

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

    // Case 29 (F10 v03): O_APPEND atomic write prevents TS/Python from overwriting a concurrent H1 append
    // that occurs right after fstatSync measures file size.
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

    const origFstatSync = fs.fstatSync;
    let injectedH1 = false;
    fs.fstatSync = function (...args) {
      const statRes = origFstatSync.apply(this, args);
      if (!injectedH1) {
        injectedH1 = true;
        // Simulate guard_bulk_send.py (H1) appending concurrently via open(..., "a") right after fstatSync!
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
        spawnSync(
          'python3',
          [
            '-c',
            `with open(${JSON.stringify(todayPath)}, "a", encoding="utf-8") as f:\n    f.write(${JSON.stringify(h1Line)} + "\\n")\n    f.flush()`,
          ],
          { encoding: 'utf-8' }
        );
      }
      return statRes;
    };

    try {
      const decC29 = recordApprovalDecision({
        requestId: reqC29,
        decision: 'approved',
        by: 'owner',
      });
      assert.equal(decC29.ok, true);
    } finally {
      fs.fstatSync = origFstatSync;
    }

    assert.equal(injectedH1, true, 'Case 29 (F10): H1 concurrent append injection must have fired');
    const rawLinesAfterC29 = fs
      .readFileSync(todayPath, 'utf-8')
      .trim()
      .split('\n')
      .filter(Boolean);
    assert.equal(
      rawLinesAfterC29.length,
      linesBeforeC29 + 2,
      `Case 29 (F10): Expected ${linesBeforeC29 + 2} lines after concurrent H1 + TS append, got ${rawLinesAfterC29.length}`
    );
    const newLinesC29 = rawLinesAfterC29.slice(linesBeforeC29);
    assert.equal(newLinesC29.length, 2, 'Case 29 (F10): exactly 2 new lines must be appended');
    for (const line of newLinesC29) {
      assert.doesNotThrow(() => JSON.parse(line), `Case 29 (F10): Corrupted JSONL line: ${line}`);
    }
    for (const line of rawLinesAfterC29) {
      if (
        line.includes('truncated_frag') ||
        line.includes(':NaN') ||
        line.includes(':Infinity') ||
        line.includes('\r{"type"')
      ) {
        continue; // Intentional malformed lines from Case 17 & Case 26f
      }
      assert.doesNotThrow(() => JSON.parse(line), `Case 29 (F10): Corrupted JSONL line: ${line}`);
    }
    assert.equal(getApprovalById(reqC29)?.status, 'approved');
    assert.equal(
      getApprovalById(reqH1Concurrent)?.status,
      'pending',
      'Case 29 (F10): Concurrent H1 request line must be preserved intact'
    );
    console.log('  [PASS] Case 29 (F10 v03): O_APPEND preserves concurrent H1 request line appended after fstatSync (n + 2 valid JSON lines)');

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
    // ADVERSARIAL TESTS FOR A-4 v05 (Cases 33 - 35: Closing Hermes Round 4)
    // =========================================================================

    // Case 33 (F14a + F14b v05): Two-layer inode mutual exclusion for WRITES:
    // (33a) Owner A loses `.approvals.lock` (renamed/replaced by contender B) while inside critical section before write ->
    //       Owner A aborts with `lock_lost` (HTTP 503 in POST route / exit 2 in Python check & mark), writing 0 lines to ledger,
    //       and does NOT unlink contender B's replacement lock in `finally`.
    // (33b) Reclaimer B observes stale lock L0 (`ino_0`), contender A replaces L0 with live lock L1 (`ino_1`) right before B's `rename` ->
    //       B detects `stat(stale).ino !== ino_0`, immediately restores `rename(stale -> lock)` so `lockPath` has `ino_1` again,
    //       does NOT unlink L1, and does NOT write.
    const c33Ts = '2026-10-14T14:30:00Z';
    const c33Seat = 'seat-c33-f14';
    const c33Tool = 'Bash';
    const c33Sha = 'c330c330c330c330c330c330c330c330c330c330c330c330c330c330c330c330';
    const reqC33 = computeRequestId(c33Ts, c33Seat, c33Tool, c33Sha);
    fs.appendFileSync(
      todayPath,
      JSON.stringify({
        ts: c33Ts,
        seat: c33Seat,
        tool: c33Tool,
        host: 'api.example.com',
        len: 64,
        sha256: c33Sha,
        head60: 'curl -X POST https://api.example.com/c33',
        reason: 'external_post_send',
      }) + '\n',
      'utf-8'
    );

    // 33a-TS: Inject lock displacement in TS right after ledger read (before appendJsonlLineSafely writes)
    const sizeBefore33aTs = fs.statSync(todayPath).size;
    const origReadFileSync33 = fs.readFileSync;
    let displacedInTs = false;
    let contenderReplacementInoTs = null;
    fs.readFileSync = function (...args) {
      const res = origReadFileSync33.apply(this, args);
      if (
        !displacedInTs &&
        typeof args[0] === 'string' &&
        args[0].endsWith('.jsonl') &&
        fs.existsSync(lockPath)
      ) {
        displacedInTs = true;
        const stolenPath = `${lockPath}.stolen-by-b`;
        fs.renameSync(lockPath, stolenPath);
        fs.unlinkSync(stolenPath);
        // Contender B places its own live lock L2 at lockPath
        fs.writeFileSync(
          lockPath,
          JSON.stringify({
            pid: process.pid,
            token: 'contender-b-token',
            bootId: currentBootId,
            hostname: os.hostname(),
            createdAt: Date.now(),
          }),
          'utf-8'
        );
        contenderReplacementInoTs = fs.statSync(lockPath).ino;
      }
      return res;
    };

    try {
      const postLostRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqC33}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqC33 }) }
      );
      assert.equal(
        postLostRes.status,
        503,
        'Case 33a (F14a TS): POST decision must return HTTP 503 when lock ownership is lost before write'
      );
      const postLostJson = await postLostRes.json();
      assert.equal(postLostJson.error, 'lock_lost');
      assert.equal(
        postLostJson.message.includes(testDataDir),
        false,
        'Case 33a (F14a TS): 503 response must not leak internal filesystem path'
      );
    } finally {
      fs.readFileSync = origReadFileSync33;
    }

    assert.equal(displacedInTs, true, 'Case 33a (F14a TS): displacement hook must have fired');
    assert.equal(
      fs.statSync(todayPath).size,
      sizeBefore33aTs,
      'Case 33a (F14a TS): displaced owner must write 0 bytes to ledger'
    );
    assert.equal(
      fs.existsSync(lockPath) && fs.statSync(lockPath).ino === contenderReplacementInoTs,
      true,
      'Case 33a (F14a TS): displaced owner must NOT unlink contender B replacement lock in finally'
    );
    fs.unlinkSync(lockPath);

    // Approve reqC33 cleanly so we can test Python --consume and approval_mark.py under lock displacement
    const cleanDec33 = recordApprovalDecision({
      requestId: reqC33,
      decision: 'approved',
      by: 'owner',
    });
    assert.equal(cleanDec33.ok, true);

    // 33a-Py: Inject lock displacement in Python right before append_jsonl_safely in BOTH approval_check.py (--consume) and approval_mark.py
    const sizeBefore33aPy = fs.statSync(todayPath).size;
    const pyConsumeDisplacement = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys, json
sys.path.insert(0, 'operations/scripts')
import approval_check

orig_resolve = approval_check.resolve_target_file
def hooked_resolve(approvals_dir, source_file, now_utc):
    res = orig_resolve(approvals_dir, source_file, now_utc)
    lock_p = os.path.join(approvals_dir, '.approvals.lock')
    if os.path.exists(lock_p):
        stolen_p = lock_p + '.stolen-py'
        os.rename(lock_p, stolen_p)
        os.unlink(stolen_p)
        with open(lock_p, 'w', encoding='utf-8') as f:
            f.write(json.dumps({'pid': os.getpid(), 'token': 'py-contender-b', 'createdAt': 0}))
    return res

approval_check.resolve_target_file = hooked_resolve
sys.argv = ['approval_check.py', '--seat', ${JSON.stringify(c33Seat)}, '--tool', ${JSON.stringify(c33Tool)}, '--sha256', ${JSON.stringify(c33Sha)}, '--consume']
approval_check.main()
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyConsumeDisplacement.status,
      2,
      `Case 33a (F14a Python consume): expected exit 2 on lock_lost, got ${pyConsumeDisplacement.status} (${pyConsumeDisplacement.stderr})`
    );
    const pyConsumeLostJson = JSON.parse(pyConsumeDisplacement.stdout.trim());
    assert.equal(pyConsumeLostJson.status, 'lock_lost');
    assert.equal(
      fs.statSync(todayPath).size,
      sizeBefore33aPy,
      'Case 33a (F14a Python consume): displaced owner must write 0 bytes to ledger'
    );
    assert.equal(
      fs.existsSync(lockPath),
      true,
      'Case 33a (F14a Python consume): displaced owner must not delete contender replacement lock'
    );
    fs.unlinkSync(lockPath);

    const pyMarkDisplacement = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys, json
sys.path.insert(0, 'operations/scripts')
import approval_check, approval_mark

orig_resolve = approval_mark.resolve_target_file
def hooked_resolve(approvals_dir, source_file, now_utc):
    res = orig_resolve(approvals_dir, source_file, now_utc)
    lock_p = os.path.join(approvals_dir, '.approvals.lock')
    if os.path.exists(lock_p):
        stolen_p = lock_p + '.stolen-py-mark'
        os.rename(lock_p, stolen_p)
        os.unlink(stolen_p)
        with open(lock_p, 'w', encoding='utf-8') as f:
            f.write(json.dumps({'pid': os.getpid(), 'token': 'py-contender-b-mark', 'createdAt': 0}))
    return res

approval_mark.resolve_target_file = hooked_resolve
sys.argv = ['approval_mark.py', '--request-id', ${JSON.stringify(reqC33)}, '--result', 'executed']
approval_mark.main()
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(
      pyMarkDisplacement.status,
      2,
      `Case 33a (F14a Python mark): expected exit 2 on lock_lost, got ${pyMarkDisplacement.status}`
    );
    const pyMarkLostJson = JSON.parse(pyMarkDisplacement.stdout.trim());
    assert.equal(pyMarkLostJson.status, 'lock_lost');
    assert.equal(
      fs.statSync(todayPath).size,
      sizeBefore33aPy,
      'Case 33a (F14a Python mark): displaced owner must write 0 bytes to ledger'
    );
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

    // 33b-TS: Reclaimer B observes stale lock L0 (`ino_0`), contender A replaces L0 with live lock L1 (`ino_1`)
    // right after B's pre-rename stat check and right before B's `rename(lock -> stale)`.
    // B renames L1 to `staleTarget`, sees `stat(staleTarget).ino === ino_1 !== ino_0`, and immediately restores `rename(staleTarget -> lockPath)`!
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 99999999,
        bootId: currentBootId,
        hostname: os.hostname(),
        createdAt: Date.now() - 60_000,
      }),
      'utf-8'
    );
    const l0InoTs = fs.statSync(lockPath).ino;
    const origRenameSync33b = fs.renameSync;
    let injectedRace33bTs = false;
    let liveL1InoTs = null;
    fs.renameSync = function (oldP, newP) {
      if (
        !injectedRace33bTs &&
        oldP === lockPath &&
        typeof newP === 'string' &&
        newP.includes('.approvals.lock.stale-')
      ) {
        injectedRace33bTs = true;
        // Simulate contender A reclaiming L0 and publishing live lock L1 (with a new inode) right before B's rename!
        fs.unlinkSync(lockPath);
        const l1Tmp = `${lockPath}.l1-live`;
        fs.writeFileSync(
          l1Tmp,
          JSON.stringify({
            pid: process.pid,
            token: 'live-l1-token',
            bootId: currentBootId,
            hostname: os.hostname(),
            createdAt: Date.now(),
          }),
          'utf-8'
        );
        liveL1InoTs = fs.statSync(l1Tmp).ino;
        origRenameSync33b.call(this, l1Tmp, lockPath);
      }
      return origRenameSync33b.call(this, oldP, newP);
    };

    let bEnteredCriticalSectionTs = false;
    try {
      assert.throws(
        () =>
          withApprovalLock(() => {
            bEnteredCriticalSectionTs = true;
          }, 120),
        (err) => err instanceof ApprovalLockTimeoutError,
        'Case 33b (F14b TS): Reclaimer B must not enter critical section when it mis-reclaims live L1'
      );
    } finally {
      fs.renameSync = origRenameSync33b;
    }
    assert.equal(injectedRace33bTs, true, 'Case 33b (F14b TS): race hook must have fired');
    assert.equal(bEnteredCriticalSectionTs, false, 'Case 33b (F14b TS): B must not enter critical section');
    assert.notEqual(liveL1InoTs, l0InoTs);
    assert.equal(
      fs.existsSync(lockPath),
      true,
      'Case 33b (F14b TS): B must restore mis-reclaimed live lock L1 back to lockPath'
    );
    assert.equal(
      fs.statSync(lockPath).ino,
      liveL1InoTs,
      'Case 33b (F14b TS): restored lock at lockPath must have L1 inode (never unlinked)'
    );
    fs.unlinkSync(lockPath);

    // 33b-Py: Same race injection in Python `with_approval_lock`
    const pyReclaimRace = spawnSync(
      'python3',
      [
        '-c',
        `
import os, sys, json, socket
sys.path.insert(0, 'operations/scripts')
import approval_check

approvals_dir = approval_check.get_approvals_dir()
os.makedirs(approvals_dir, exist_ok=True)
lock_p = os.path.join(approvals_dir, '.approvals.lock')
with open(lock_p, 'w', encoding='utf-8') as f:
    f.write(json.dumps({
        'pid': 99999999,
        'bootId': approval_check.get_system_boot_id(),
        'hostname': socket.gethostname(),
        'createdAt': 0
    }))
l0_ino = os.stat(lock_p).st_ino

orig_rename = os.rename
state = {'injected': False, 'l1_ino': None, 'entered': False}

def hooked_rename(src, dst):
    if (not state['injected']) and src == lock_p and '.approvals.lock.stale-' in dst:
        state['injected'] = True
        os.unlink(lock_p)
        l1_tmp = lock_p + '.l1-py-live'
        with open(l1_tmp, 'w', encoding='utf-8') as f:
            f.write(json.dumps({
                'pid': os.getpid(),
                'token': 'py-live-l1',
                'bootId': approval_check.get_system_boot_id(),
                'hostname': socket.gethostname(),
                'createdAt': approval_check.current_utc_ms()
            }))
        state['l1_ino'] = os.stat(l1_tmp).st_ino
        orig_rename(l1_tmp, lock_p)
    return orig_rename(src, dst)

os.rename = hooked_rename
timed_out = False
try:
    with approval_check.with_approval_lock(approvals_dir, timeout_sec=0.12):
        state['entered'] = True
except approval_check.ApprovalLockTimeoutError:
    timed_out = True
finally:
    os.rename = orig_rename

restored_ino = os.stat(lock_p).st_ino if os.path.exists(lock_p) else None
if os.path.exists(lock_p):
    os.unlink(lock_p)
print(json.dumps({
    'injected': state['injected'],
    'entered': state['entered'],
    'timed_out': timed_out,
    'l0_ino': l0_ino,
    'l1_ino': state['l1_ino'],
    'restored_ino': restored_ino,
}))
`,
      ],
      { env: { ...process.env, AIBOSS_DATA_DIR: testDataDir }, encoding: 'utf-8' }
    );
    assert.equal(pyReclaimRace.status, 0, `Case 33b Python script failed: ${pyReclaimRace.stderr}`);
    const pyReclaimRaceRes = JSON.parse(pyReclaimRace.stdout.trim());
    assert.equal(pyReclaimRaceRes.injected, true);
    assert.equal(pyReclaimRaceRes.entered, false, 'Case 33b (F14b Python): B must not enter critical section');
    assert.equal(pyReclaimRaceRes.timed_out, true);
    assert.equal(
      pyReclaimRaceRes.restored_ino,
      pyReclaimRaceRes.l1_ino,
      'Case 33b (F14b Python): B must restore mis-reclaimed live lock L1 back to lockPath with exact inode'
    );
    console.log('  [PASS] Case 33 (F14a + F14b v05): displaced lock owner exits 2 / 503 with status="lock_lost" (+0 lines), and mis-reclaimed live lock is immediately restored in TS & Python');

    // Case 34 (F17 v05): Fail-closed `ledger_unreadable` when any `.jsonl` file (or approvals dir) cannot be read.
    // Specifically: old file (`yesterdayPath`) has `request` + `decision: approved` (readable),
    // newer file (`todayPath`) has `execution` (`executed`) for that request and is `chmod 0o000`.
    // `approval_check.py --consume`, `approval_mark.py`, `GET /api/approvals`, and `POST /api/approvals/<id>/decision`
    // MUST fail-closed (`status: "ledger_unreadable"` / HTTP 503) and write 0 bytes; restoring `0o644` returns `executed`!
    const c34Ts = '2026-10-13T23:50:00Z';
    const c34Seat = 'seat-c34-f17';
    const c34Tool = 'Bash';
    const c34Sha = 'c340c340c340c340c340c340c340c340c340c340c340c340c340c340c340c340';
    const reqC34 = computeRequestId(c34Ts, c34Seat, c34Tool, c34Sha);

    fs.appendFileSync(
      yesterdayPath,
      [
        JSON.stringify({
          ts: c34Ts,
          seat: c34Seat,
          tool: c34Tool,
          host: 'api.example.com',
          len: 64,
          sha256: c34Sha,
          head60: 'curl -X POST https://api.example.com/c34',
          reason: 'external_post_send',
        }),
        JSON.stringify({
          type: 'decision',
          requestId: reqC34,
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
        requestId: reqC34,
        seatId: c34Seat,
        at: new Date().toISOString(),
        result: 'executed',
        digest: c34Sha,
      }) + '\n',
      'utf-8'
    );

    const sizeYesterdayBefore34 = fs.statSync(yesterdayPath).size;
    const sizeTodayBefore34 = fs.statSync(todayPath).size;

    fs.chmodSync(todayPath, 0o000);
    try {
      const pyCheckUnreadable = runCheckCli(c34Seat, c34Tool, c34Sha, ['--consume']);
      assert.equal(
        pyCheckUnreadable.status,
        2,
        'Case 34 (F17): approval_check.py --consume must exit 2 when today.jsonl is chmod 000'
      );
      assert.equal(pyCheckUnreadable.body.status, 'ledger_unreadable');
      assert.equal(pyCheckUnreadable.body.file, path.basename(todayPath));

      const pyMarkUnreadable = runMarkCli(reqC34, 'executed', 'run-c34');
      assert.equal(
        pyMarkUnreadable.status,
        2,
        'Case 34 (F17): approval_mark.py must exit 2 when today.jsonl is chmod 000'
      );
      assert.equal(pyMarkUnreadable.body.status, 'ledger_unreadable');
      assert.equal(pyMarkUnreadable.body.file, path.basename(todayPath));

      const getUnreadableRes = await getApprovalsRoute(
        new NextRequest('http://127.0.0.1:4330/api/approvals')
      );
      assert.equal(
        getUnreadableRes.status,
        503,
        'Case 34 (F17): GET /api/approvals must return HTTP 503 when a ledger file is unreadable'
      );
      const getUnreadableJson = await getUnreadableRes.json();
      assert.equal(getUnreadableJson.error, 'ledger_unreadable');
      assert.equal(
        JSON.stringify(getUnreadableJson).includes(testDataDir),
        false,
        'Case 34 (F17): GET 503 response must not leak raw filesystem paths'
      );

      const postUnreadableRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqC34}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqC34 }) }
      );
      assert.equal(
        postUnreadableRes.status,
        503,
        'Case 34 (F17): POST decision must return HTTP 503 when a ledger file is unreadable'
      );
      const postUnreadableJson = await postUnreadableRes.json();
      assert.equal(postUnreadableJson.error, 'ledger_unreadable');
      assert.equal(
        JSON.stringify(postUnreadableJson).includes(testDataDir),
        false,
        'Case 34 (F17): POST 503 response must not leak raw filesystem paths'
      );
    } finally {
      fs.chmodSync(todayPath, 0o644);
    }

    assert.equal(
      fs.statSync(yesterdayPath).size,
      sizeYesterdayBefore34,
      'Case 34 (F17): yesterdayPath must have 0 bytes added after ledger_unreadable'
    );
    assert.equal(
      fs.statSync(todayPath).size,
      sizeTodayBefore34,
      'Case 34 (F17): todayPath must have 0 bytes added after ledger_unreadable'
    );

    // After restoring read permissions on todayPath, reqC34 is properly seen as `executed`
    const pyCheckRestored = runCheckCli(c34Seat, c34Tool, c34Sha, ['--consume']);
    assert.equal(pyCheckRestored.status, 2);
    assert.equal(pyCheckRestored.body.status, 'executed');
    assert.equal(getApprovalById(reqC34)?.status, 'executed');
    console.log('  [PASS] Case 34 (F17 v05): unreadable ledger file fails closed with status="ledger_unreadable" (exit 2 / HTTP 503, +0 bytes) and recovers to "executed" when chmod 644 restored');

    // Case 35 (F18 v05): Outer I/O error boundary in CLI (`approval_check.py`, `approval_mark.py`)
    // and API (`POST /api/approvals/<id>/decision`):
    // When approvals directory is read-only (`0o500`, so creating `.approvals.lock.tmp-*` fails with `EACCES`),
    // both Python CLIs output structured JSON `{"status": "io_error", "reason": "EACCES"}` and exit 2 (0 tracebacks, never exit 1),
    // and POST returns HTTP 503 (`error: "io_error"`) without leaking internal paths.
    fs.chmodSync(getApprovalsDir(), 0o500);
    try {
      const pyCheckIo = runCheckCli(c34Seat, c34Tool, c34Sha);
      assert.equal(
        pyCheckIo.status,
        2,
        `Case 35 (F18): approval_check.py must exit 2 (never 1) on EACCES, got ${pyCheckIo.status}`
      );
      assert.equal(pyCheckIo.body?.status, 'io_error');
      assert.equal(pyCheckIo.body?.reason, 'EACCES');
      assert.equal(
        pyCheckIo.rawStderr.includes('Traceback'),
        false,
        'Case 35 (F18): approval_check.py must not print a raw Python Traceback on I/O error'
      );

      const pyMarkIo = runMarkCli(reqC34, 'executed', 'run-c35');
      assert.equal(
        pyMarkIo.status,
        2,
        `Case 35 (F18): approval_mark.py must exit 2 (never 1) on EACCES, got ${pyMarkIo.status}`
      );
      assert.equal(pyMarkIo.body?.status, 'io_error');
      assert.equal(pyMarkIo.body?.reason, 'EACCES');
      assert.equal(
        pyMarkIo.rawStderr.includes('Traceback'),
        false,
        'Case 35 (F18): approval_mark.py must not print a raw Python Traceback on I/O error'
      );

      const postIoRes = await postDecisionRoute(
        new NextRequest(`http://127.0.0.1:4330/api/approvals/${reqC34}/decision`, {
          method: 'POST',
          headers: { host: '127.0.0.1:4330', 'content-type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        { params: Promise.resolve({ requestId: reqC34 }) }
      );
      assert.equal(
        postIoRes.status,
        503,
        'Case 35 (F18): POST decision must return HTTP 503 on io_error'
      );
      const postIoJson = await postIoRes.json();
      assert.equal(postIoJson.error, 'io_error');
      assert.equal(
        JSON.stringify(postIoJson).includes(testDataDir),
        false,
        'Case 35 (F18): POST 503 response must not leak raw filesystem paths'
      );
    } finally {
      fs.chmodSync(getApprovalsDir(), 0o755);
    }
    console.log('  [PASS] Case 35 (F18 v05): I/O errors output JSON {"status":"io_error","reason":"EACCES"} with exit 2 (0 tracebacks) in CLI and HTTP 503 in API');

    console.log('>>> ALL 35 A-4 v05 APPROVAL LEDGER TEST CASES PASSED <<<');
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
  }
})();
