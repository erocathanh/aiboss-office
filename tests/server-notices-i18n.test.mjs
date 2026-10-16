import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { t as translateCore } from '../src/i18n/core.ts';
import { dichLoi } from '../src/lib/chay-agent.ts';
import {
  buildServerNotice,
  classifyAgentError,
  resolveClientNotice,
  appendOrDedupeErrorTin,
} from '../src/lib/server-notices.ts';
import {
  gopThongBaoLuot,
  lichSuPhien,
  luuMetadataPhien,
  thuMucAgent,
  maHoaDuongDan,
} from '../src/lib/doc-phien.ts';
import { BongBong } from '../src/components/ung-dung/bong-bong.tsx';
import {
  scanServerNoticeLiterals,
  scanServerSourceText,
} from '../operations/scripts/check-i18n-literals.mjs';

const VI_DIACRITIC_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const tEn = (key, params) => translateCore(key, params, 'en');
const tVi = (key, params) => translateCore(key, params, 'vi');

describe('UI-2f & UI-2g: Server-generated notices i18n, session history replay, deduplication & AST scanner', () => {
  it('1. dichLoi / classifyAgentError emit structured { code, params, text } with English fallback text', () => {
    const oauthNotice = dichLoi(
      'Failed to authenticate: OAuth session expired and could not be refreshed',
    );
    assert.equal(oauthNotice.code, 'auth.expired');
    assert.equal(
      oauthNotice.text,
      'Claude Code login expired on this Mac. Open Terminal, run `claude`, type `/login`, then send again.',
    );
    assert.equal(VI_DIACRITIC_RE.test(oauthNotice.text), false);

    const emptyNotice = dichLoi('   ');
    assert.equal(emptyNotice.code, 'run.failedNoDetail');
    assert.equal(VI_DIACRITIC_RE.test(emptyNotice.text), false);

    const toolNotice = classifyAgentError(
      'messages.3: tool_use block without a matching tool_result block',
    );
    assert.equal(toolNotice.code, 'run.interruptedToolUse');
    assert.equal(VI_DIACRITIC_RE.test(toolNotice.text), false);

    const genericNotice = dichLoi('Upstream rate limit exceeded');
    assert.equal(genericNotice.code, 'run.failed');
    assert.deepEqual(genericNotice.params, { detail: 'Upstream rate limit exceeded' });
    assert.equal(VI_DIACRITIC_RE.test(genericNotice.text), false);
  });

  it('2. resolveClientNotice translates server notice codes according to active UI language (EN vs VI)', () => {

    const oauthPayload = buildServerNotice('auth.expired');
    const enOauth = resolveClientNotice(oauthPayload, tEn);
    const viOauth = resolveClientNotice(oauthPayload, tVi);
    assert.equal(
      enOauth.text,
      'Claude Code login expired on this Mac. Open Terminal, run `claude`, type `/login`, then send again.',
    );
    assert.equal(
      viOauth.text,
      'Đăng nhập Claude Code trên máy này đã hết hạn. Mở Terminal, gõ `claude`, gõ `/login`, rồi gửi lại.',
    );

    const exitedPayload = buildServerNotice('process.exited', { exitCode: '1' });
    assert.equal(
      resolveClientNotice(exitedPayload, tEn).text,
      'Claude process exited with code 1.',
    );
    assert.equal(
      resolveClientNotice(exitedPayload, tVi).text,
      'Tiến trình claude thoát với mã 1.',
    );

    const signaledPayload = buildServerNotice('process.signaled', { signal: 'SIGTERM' });
    assert.equal(
      resolveClientNotice(signaledPayload, tEn).text,
      'Claude process was terminated by signal SIGTERM.',
    );
    assert.equal(
      resolveClientNotice(signaledPayload, tVi).text,
      'Tiến trình claude bị dừng bởi tín hiệu SIGTERM.',
    );

    const budgetHourPayload = buildServerNotice('budget.capped', {
      period: 'hour',
      used: 10,
      cap: 10,
    });
    const enBudget = resolveClientNotice(budgetHourPayload, tEn);
    const viBudget = resolveClientNotice(budgetHourPayload, tVi);
    assert.equal(VI_DIACRITIC_RE.test(enBudget.text), false);
    assert.match(enBudget.text, /for this hour \(10\/10 turns\)/);
    assert.match(viBudget.text, /trong giờ này \(10\/10\)/);

    // Dotted alias run.failed.noDetail normalizes cleanly
    const dottedNoDetail = resolveClientNotice({ code: 'run.failed.noDetail' }, tEn);
    assert.equal(dottedNoDetail.code, 'run.failedNoDetail');
    assert.equal(VI_DIACRITIC_RE.test(dottedNoDetail.text), false);
  });

  it('3. appendOrDedupeErrorTin collapses 6 consecutive identical errors into 1 item with ×6 badge', () => {
    let tinList = [
      {
        ma: 'u-1',
        ai: 'toi',
        chu: 'Check campaign status',
        gio: '19:51',
      },
    ];

    for (let k = 0; k < 6; k++) {
      const resolved = resolveClientNotice(
        dichLoi('Failed to authenticate: OAuth session expired and could not be refreshed'),
        tEn,
      );
      tinList = appendOrDedupeErrorTin(tinList, {
        ma: `err-${k + 1}`,
        ai: 'ho',
        chu: resolved.text,
        gio: '19:51',
        loi: true,
        thongBaoHeThong: { code: resolved.code, params: resolved.params },
      });
    }

    assert.equal(tinList.length, 2, '6 identical errors must collapse into 1 error bubble after user message');
    assert.equal(tinList[1].soLanLap, 6);
    assert.equal(tinList[1].thongBaoHeThong?.code, 'auth.expired');

    // Subsequent distinct error (process.exited) appends as a separate bubble
    const exitResolved = resolveClientNotice(
      buildServerNotice('process.exited', { exitCode: '1' }),
      tEn,
    );
    tinList = appendOrDedupeErrorTin(tinList, {
      ma: 'err-exit',
      ai: 'ho',
      chu: exitResolved.text,
      gio: '19:51',
      loi: true,
      thongBaoHeThong: { code: exitResolved.code, params: exitResolved.params },
    });

    assert.equal(tinList.length, 3);
    assert.equal(tinList[1].soLanLap, 6);
    assert.equal(tinList[2].soLanLap, undefined);
    assert.equal(tinList[2].chu, 'Claude process exited with code 1.');

    // Render BongBong with soLanLap=6 and verify ×6 badge markup
    const html = renderToStaticMarkup(
      React.createElement(BongBong, {
        chu: tinList[1].chu,
        hienMau: false,
        loi: true,
        dangChay: false,
        soLanLap: tinList[1].soLanLap,
        nhanLapAria: tEn('system.repeatBadgeAria', { count: tinList[1].soLanLap }),
      }),
    );
    assert.match(html, /class="nhan-lap-loi"[^>]*>×6<\/span>/);
  });

  it('4. AST server notice scanner passes on repo and fails on injected Vietnamese payload (positive control)', () => {
    const report = scanServerNoticeLiterals();
    assert.ok(report.scannedFilesCount >= 50);
    assert.equal(
      report.violations.length,
      0,
      `Expected 0 server notice violations, found: ${JSON.stringify(report.violations)}`,
    );

    // Positive control: Vietnamese literal in Response.json / SSE event payload MUST fail
    const badApiSnippet = `
      export async function POST() {
        console.error('Lỗi nội bộ máy chủ được phép trong console');
        return Response.json({ loi: 'Tiến trình claude thoát với mã 1.' }, { status: 500 });
      }
    `;
    const posCtrl = scanServerSourceText(badApiSnippet, 'src/app/api/chat/route.ts');
    assert.equal(
      posCtrl.violations.length,
      1,
      'Positive control must catch Vietnamese literal in Response.json while ignoring console.error',
    );
    assert.match(posCtrl.violations[0].text, /Tiến trình claude thoát với mã 1/);
  });

  it('6. UI-2g Nit 1a: Session history replay (luuMetadataPhien + lichSuPhien) persists code+params+so_lan_lap and renders in active UI language (EN vs VI)', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2g-hist-'));
    const prevClaudeDir = process.env.CLAUDE_CONFIG_DIR;
    const prevDataDir = process.env.AIBOSS_DATA_DIR;
    process.env.CLAUDE_CONFIG_DIR = path.join(tmpRoot, 'claude-cfg');
    process.env.AIBOSS_DATA_DIR = path.join(tmpRoot, 'data-dir');

    try {
      const seatId = 'copywriter';
      const sessionId = '11111111-2222-3333-4444-555555555555';
      const seatCwd = thuMucAgent(seatId);
      const projDir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', maHoaDuongDan(seatCwd));
      fs.mkdirSync(projDir, { recursive: true });

      const t1 = '2026-10-16T02:00:00.000Z';
      const t2 = '2026-10-16T02:00:01.000Z';
      const jsonlPath = path.join(projDir, `${sessionId}.jsonl`);
      fs.writeFileSync(
        jsonlPath,
        [
          JSON.stringify({
            type: 'user',
            userType: 'external',
            cwd: seatCwd,
            timestamp: t1,
            message: { content: 'ping ui-2g' },
          }),
          JSON.stringify({
            type: 'assistant',
            isApiErrorMessage: true,
            cwd: seatCwd,
            timestamp: t2,
            message: { content: [{ type: 'text', text: 'Not logged in · Please run /login' }] },
          }),
        ].join('\n') + '\n',
        'utf8',
      );

      let notices = [];
      notices = gopThongBaoLuot(notices, {
        run_id: 'run-ui2g-1',
        code: 'auth.notAuthenticated',
        text: 'Not signed in to Claude. Run `claude` in Terminal and complete `/login`.',
        gio: '02:00',
        luc: Date.parse(t2),
      });
      notices = gopThongBaoLuot(notices, {
        run_id: 'run-ui2g-1',
        code: 'auth.notAuthenticated',
        text: 'Not signed in to Claude. Run `claude` in Terminal and complete `/login`.',
        gio: '02:00',
        luc: Date.parse(t2) + 10,
      });
      notices = gopThongBaoLuot(notices, {
        run_id: 'run-ui2g-1',
        code: 'process.exited',
        params: { code: 1 },
        text: 'Claude process exited with code 1.',
        gio: '02:00',
        luc: Date.parse(t2) + 20,
      });

      luuMetadataPhien(seatId, sessionId, 'ping ui-2g', 'run-ui2g-1', notices);

      // Replay in EN
      const replayEn = await lichSuPhien(seatId, sessionId, undefined, 'en');
      assert.equal(replayEn.tin.length, 3);
      assert.equal(replayEn.tin[0].ai, 'toi');
      assert.equal(replayEn.tin[0].chu, 'ping ui-2g');
      assert.equal(replayEn.tin[1].loi, true);
      assert.equal(replayEn.tin[1].thongBaoHeThong?.code, 'auth.notAuthenticated');
      assert.equal(replayEn.tin[1].soLanLap, 2);
      assert.equal(replayEn.tin[1].chu, tEn('system.auth.notAuthenticated'));
      assert.equal(replayEn.tin[2].loi, true);
      assert.equal(replayEn.tin[2].thongBaoHeThong?.code, 'process.exited');
      assert.deepEqual(replayEn.tin[2].thongBaoHeThong?.params, { code: 1 });
      assert.equal(replayEn.tin[2].chu, tEn('system.process.exited', { code: 1 }));

      // Replay in VI (same persisted session history, switched UI language)
      const replayVi = await lichSuPhien(seatId, sessionId, undefined, 'vi');
      assert.equal(replayVi.tin.length, 3);
      assert.equal(replayVi.tin[1].thongBaoHeThong?.code, 'auth.notAuthenticated');
      assert.equal(replayVi.tin[1].soLanLap, 2);
      assert.equal(replayVi.tin[1].chu, tVi('system.auth.notAuthenticated'));
      assert.equal(replayVi.tin[2].thongBaoHeThong?.code, 'process.exited');
      assert.equal(replayVi.tin[2].chu, tVi('system.process.exited', { code: 1 }));
    } finally {
      if (prevClaudeDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = prevClaudeDir;
      if (prevDataDir === undefined) delete process.env.AIBOSS_DATA_DIR;
      else process.env.AIBOSS_DATA_DIR = prevDataDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('7. UI-2g Nit 1b: Legacy history records without code preserve raw text verbatim (never guess code from raw text)', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ui2g-legacy-'));
    const prevClaudeDir = process.env.CLAUDE_CONFIG_DIR;
    const prevDataDir = process.env.AIBOSS_DATA_DIR;
    process.env.CLAUDE_CONFIG_DIR = path.join(tmpRoot, 'claude-cfg');
    process.env.AIBOSS_DATA_DIR = path.join(tmpRoot, 'data-dir');

    try {
      const seatId = 'copywriter';
      const legacySessionId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const seatCwd = thuMucAgent(seatId);
      const projDir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', maHoaDuongDan(seatCwd));
      fs.mkdirSync(projDir, { recursive: true });

      const legacyRawText = 'Not logged in · Please run /login (legacy raw entry without code)';
      const jsonlPath = path.join(projDir, `${legacySessionId}.jsonl`);
      fs.writeFileSync(
        jsonlPath,
        [
          JSON.stringify({
            type: 'user',
            userType: 'external',
            cwd: seatCwd,
            timestamp: '2026-10-10T10:00:00.000Z',
            message: { content: 'legacy prompt' },
          }),
          JSON.stringify({
            type: 'assistant',
            isApiErrorMessage: true,
            cwd: seatCwd,
            timestamp: '2026-10-10T10:00:01.000Z',
            message: { content: [{ type: 'text', text: legacyRawText }] },
          }),
        ].join('\n') + '\n',
        'utf8',
      );

      // Legacy metadata without thong_bao_he_thong
      luuMetadataPhien(seatId, legacySessionId, 'legacy prompt', 'legacy-run');

      const replayVi = await lichSuPhien(seatId, legacySessionId, undefined, 'vi');
      assert.equal(replayVi.tin.length, 2);
      assert.equal(replayVi.tin[1].chu, legacyRawText);
      assert.equal(replayVi.tin[1].thongBaoHeThong, undefined);

      // Client resolveClientNotice on raw string without code also preserves raw text verbatim
      const resolvedClient = resolveClientNotice(legacyRawText, tVi);
      assert.equal(resolvedClient.code, undefined);
      assert.equal(resolvedClient.text, legacyRawText);
    } finally {
      if (prevClaudeDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = prevClaudeDir;
      if (prevDataDir === undefined) delete process.env.AIBOSS_DATA_DIR;
      else process.env.AIBOSS_DATA_DIR = prevDataDir;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
