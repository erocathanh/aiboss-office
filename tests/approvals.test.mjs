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

import {
  computeRequestId,
  getApprovalsDir,
  getApprovalLogPathForDate,
  getApprovals,
  getApprovalById,
  recordApprovalDecision,
  recordApprovalExecution,
  readApprovalRecords,
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

console.log('--- Testing A-4 v02 Approval Ledger & Hook Contract (tests/approvals.test.mjs) ---');

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

    // Case 4: POST /api/approvals/<requestId>/decision (approve on localhost -> by: "localhost")
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

    // Case 9: Second non-idempotent execution attempt via recordApprovalExecution is rejected with digest_mismatch
    const secondExecAttempt = recordApprovalExecution({
      requestId: reqId1,
      result: 'executed',
      runId: 'run-20261014-0002',
      idempotent: false,
    });
    assert.equal(secondExecAttempt.ok, false);
    assert.equal(secondExecAttempt.status, 'digest_mismatch');
    assert.equal(getApprovalById(reqId1)?.status, 'executed');
    console.log('  [PASS] Case 9: second non-idempotent execution on same requestId is rejected as digest_mismatch');

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

    const linesBeforeUnapprovedMark = fs.readFileSync(todayPath, 'utf-8').trim().split('\n').length;
    const markUnapprovedCli = runMarkCli(reqF1a, 'executed');
    assert.equal(markUnapprovedCli.status, 2, 'F1a: approval_mark.py must exit 2 on pending request');
    assert.equal(markUnapprovedCli.body.status, 'pending');
    const markUnapprovedTs = recordApprovalExecution({
      requestId: reqF1a,
      result: 'executed',
    });
    assert.equal(markUnapprovedTs.ok, false);
    assert.equal(markUnapprovedTs.status, 'pending');
    const linesAfterUnapprovedMark = fs.readFileSync(todayPath, 'utf-8').trim().split('\n').length;
    assert.equal(linesAfterUnapprovedMark, linesBeforeUnapprovedMark, 'F1a: failed mark on pending must write 0 lines');

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
    console.log('  [PASS] Case 14 (F1a): mark before approval is rejected (0 lines written) and pre-approval execution lines are ignored');

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

    // Case 21 (F7): Strict actor attribution — wrong Basic Auth on localhost -> by="localhost";
    // unconfigured env with Basic Auth -> by="localhost"; wrong Basic Auth off-localhost -> 401
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

    // Localhost with wrong Basic Auth -> allowed via localhost exemption, attributed as by="localhost" (never "owner")
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
    assert.equal(localWrongRes.status, 200);
    const localWrongJson = await localWrongRes.json();
    assert.equal(localWrongJson.decision.by, 'localhost', 'F7: wrong Basic Auth on localhost must attribute by="localhost"');

    // Unconfigured env with Basic Auth on localhost -> attributed as by="localhost" (never "owner")
    delete process.env.PHONGBAN_USER;
    delete process.env.PHONGBAN_PASS;
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
    console.log('  [PASS] Case 21 (F7): actor attribution strictly requires matching configured Basic Auth for by="owner"');

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

    // Case 23 (F9): All 7 real Vietnamese H1 reason strings from guard_bulk_send.py map to English
    // in both API responses and rendered ApprovalsSettingsCard UI (0 Vietnamese characters)
    const realH1Reasons = [
      {
        raw: 'Công cụ MCP (mcp__gmail__send) thực hiện gửi dữ liệu ra bên ngoài. Cần chủ phê duyệt trước khi chạy.',
        expected: 'mcp_external_send',
      },
      {
        raw: 'Phát hiện lệnh curl sử dụng tệp cấu hình (-K/--config). Không được phép dùng cờ này để tránh lách bộ lọc bảo mật.',
        expected: 'curl_config_flag',
      },
      {
        raw: 'Phát hiện lệnh truy xuất tin nhắn hộp thư (fetch_page_messages.py). Cần chủ phê duyệt trước khi chạy.',
        expected: 'inbox_message_fetch',
      },
      {
        raw: 'Phát hiện mã/lệnh kết nối tới graph.facebook.com gửi tin nhắn (/messages). Cần chủ phê duyệt trước khi chạy.',
        expected: 'facebook_graph_messages',
      },
      {
        raw: 'Phát hiện batch request gửi tin nhắn qua graph.facebook.com. Cần chủ phê duyệt trước khi chạy.',
        expected: 'facebook_graph_batch',
      },
      {
        raw: 'Phát hiện lệnh POST gửi tin nhắn/email ra dịch vụ bên ngoài. Cần chủ phê duyệt trước khi chạy.',
        expected: 'external_post_send',
      },
      {
        raw: 'Phát hiện lệnh kết nối gửi tin/email ra dịch vụ bên ngoài (api\\.sendgrid\\.com). Cần chủ phê duyệt trước khi chạy.',
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
    console.log('  [PASS] Case 23 (F9): all 7 Vietnamese H1 reasons normalize to English codes in API and UI (0 Vietnamese chars)');

    console.log('>>> ALL 23 A-4 v02 APPROVAL LEDGER TEST CASES PASSED <<<');
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
  }
})();
