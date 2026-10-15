import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
import { BongBong } from '../src/components/ung-dung/bong-bong.tsx';
import {
  scanServerNoticeLiterals,
  scanServerSourceText,
} from '../operations/scripts/check-i18n-literals.mjs';

const VI_DIACRITIC_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const tEn = (key, params) => translateCore(key, params, 'en');
const tVi = (key, params) => translateCore(key, params, 'vi');

describe('UI-2f: Server-generated notices i18n, deduplication & AST scanner', () => {
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
});
