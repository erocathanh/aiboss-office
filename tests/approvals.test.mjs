import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

const CHECK_SCRIPT = path.resolve(process.cwd(), 'operations/scripts/approval_check.py');
const MARK_SCRIPT = path.resolve(process.cwd(), 'operations/scripts/approval_mark.py');

function runCheckCli(seat, tool, sha256) {
  const res = spawnSync(
    'python3',
    [CHECK_SCRIPT, '--seat', seat, '--tool', tool, '--sha256', sha256],
    {
      env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
      encoding: 'utf-8',
    }
  );
  const stdout = (res.stdout || '').trim();
  const parsed = stdout ? JSON.parse(stdout) : null;
  return { status: res.status, body: parsed, rawStdout: stdout, rawStderr: res.stderr };
}

function runMarkCli(requestId, result, runId) {
  const args = [MARK_SCRIPT, '--request-id', requestId, '--result', result];
  if (runId) {
    args.push('--run-id', runId);
  }
  const res = spawnSync('python3', args, {
    env: { ...process.env, AIBOSS_DATA_DIR: testDataDir },
    encoding: 'utf-8',
  });
  const stdout = (res.stdout || '').trim();
  const parsed = stdout ? JSON.parse(stdout) : null;
  return { status: res.status, body: parsed, rawStdout: stdout, rawStderr: res.stderr };
}

console.log('--- Testing A-4 Approval Ledger & Hook Contract (tests/approvals.test.mjs) ---');

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
      params: { requestId: reqId1 },
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

    // Case 10: Decision with expiresAt in the past -> derived state is expired, approval_check.py exits 2
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
      }) + '\n',
      'utf-8'
    );

    const pastExpiresAt = '2020-01-01T00:00:00.000Z';
    const approveExpiredReq = new NextRequest(
      `http://127.0.0.1:4330/api/approvals/${reqIdExpired}/decision`,
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4330',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'approved',
          expiresAt: pastExpiresAt,
        }),
      }
    );
    const approveExpiredRes = await postDecisionRoute(approveExpiredReq, {
      params: { requestId: reqIdExpired },
    });
    assert.equal(approveExpiredRes.status, 200);
    const approveExpiredJson = await approveExpiredRes.json();
    assert.equal(approveExpiredJson.approval.status, 'expired');
    assert.equal(approveExpiredJson.approval.state, 'expired');

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
      params: { requestId: '0000000000000000' },
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
      params: { requestId: reqId1 },
    });
    assert.equal(
      duplicateDecisionRes.status,
      409,
      'Re-deciding an already-decided requestId must return HTTP 409'
    );
    console.log('  [PASS] Case 11: unknown requestId returns 404 and duplicate decision returns 409');

    // Case 12: Basic Auth records by="owner" and decision="denied" exits 2 with status="denied"
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
      params: { requestId: reqIdDenied },
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

    console.log('>>> ALL 13 A-4 APPROVAL LEDGER TEST CASES PASSED <<<');
  } finally {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup */
    }
  }
})();
