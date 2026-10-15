import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComposerMetrics,
  insertTextAtCursor,
  isSpeechRecognitionSupported,
  resolveEffectiveLineHeight,
} from '../src/lib/composer-utils.ts';
import { vi } from '../src/i18n/vi.ts';
import { en } from '../src/i18n/en.ts';

test('UI-3 A: computeComposerMetrics scales for 1, 5, 10, and caps at 15 lines (Medium & Large)', () => {
  for (const fontSizePx of [16, 20]) {
    const lineHeightPx = Math.round(fontSizePx * 1.45 * 100) / 100;
    const paddingTopPx = 2;
    const paddingBottomPx = 4;
    const pad = paddingTopPx + paddingBottomPx;

    const m1 = computeComposerMetrics({
      lineCount: 1,
      lineHeightPx,
      fontSizePx,
      paddingTopPx,
      paddingBottomPx,
      maxLines: 10,
    });
    const m5 = computeComposerMetrics({
      lineCount: 5,
      lineHeightPx,
      fontSizePx,
      paddingTopPx,
      paddingBottomPx,
      maxLines: 10,
    });
    const m10 = computeComposerMetrics({
      lineCount: 10,
      lineHeightPx,
      fontSizePx,
      paddingTopPx,
      paddingBottomPx,
      maxLines: 10,
    });
    const m15 = computeComposerMetrics({
      lineCount: 15,
      lineHeightPx,
      fontSizePx,
      paddingTopPx,
      paddingBottomPx,
      maxLines: 10,
    });

    assert.equal(m1.heightPx, Math.round(1 * lineHeightPx + pad));
    assert.equal(m1.overflowY, 'hidden');
    assert.equal(m1.isCapped, false);

    assert.equal(m5.heightPx, Math.round(5 * lineHeightPx + pad));
    assert.ok(m5.heightPx > m1.heightPx);
    assert.equal(m5.overflowY, 'hidden');
    assert.equal(m5.isCapped, false);

    assert.equal(m10.heightPx, Math.round(10 * lineHeightPx + pad));
    assert.equal(m10.heightPx, m10.maxHeightPx);
    assert.equal(m10.overflowY, 'hidden');
    assert.equal(m10.isCapped, false);

    // 15 lines must stay capped at 10 lines height and enable internal scroll
    assert.equal(m15.heightPx, m10.maxHeightPx);
    assert.equal(m15.overflowY, 'auto');
    assert.equal(m15.isCapped, true);
  }
});

test('UI-3 A: resolveEffectiveLineHeight falls back to 1.4 * fontSize when lineHeight is normal/NaN', () => {
  assert.equal(resolveEffectiveLineHeight(NaN, 20), 28);
  assert.equal(resolveEffectiveLineHeight(undefined, 16), 22.4);
  assert.equal(resolveEffectiveLineHeight(24, 16), 24);
});

test('UI-3 §7: insertTextAtCursor handles start, middle, end, selection range, and empty input', () => {
  // 1. Empty input
  const rEmpty = insertTextAtCursor('', 'xin chào', 0, 0);
  assert.equal(rEmpty.value, 'xin chào');
  assert.equal(rEmpty.cursor, 8);

  // 2. Start of existing text (đầu)
  const rStart = insertTextAtCursor('thế giới', 'xin chào', 0, 0);
  assert.equal(rStart.value, 'xin chào thế giới');
  assert.equal(rStart.cursor, 8);

  // 3. Middle of existing text (giữa)
  const rMid = insertTextAtCursor('xin thế giới', 'chào', 4, 4);
  assert.equal(rMid.value, 'xin chào thế giới');
  assert.equal(rMid.cursor, 8);

  // 4. End of existing text (cuối)
  const rEnd = insertTextAtCursor('xin chào', 'thế giới', 8, 8);
  assert.equal(rEnd.value, 'xin chào thế giới');
  assert.equal(rEnd.cursor, 17);

  // 5. With selected range (có chọn vùng)
  const rSel = insertTextAtCursor('xin chào bạn bè!', 'thế giới', 9, 15);
  assert.equal(rSel.value, 'xin chào thế giới!');
  assert.equal(rSel.cursor, 17);
});

test('UI-3 §7: isSpeechRecognitionSupported hides mic in Electron and unsupported browsers', () => {
  assert.equal(
    isSpeechRecognitionSupported({
      hasSpeechApi: true,
      userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36',
      hasDesktopBridge: false,
    }),
    true,
  );
  assert.equal(
    isSpeechRecognitionSupported({
      hasSpeechApi: false,
      userAgent: 'Mozilla/5.0 Firefox/135.0',
      hasDesktopBridge: false,
    }),
    false,
  );
  assert.equal(
    isSpeechRecognitionSupported({
      hasSpeechApi: true,
      userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Electron/44.7.0 Safari/537.36',
      hasDesktopBridge: false,
    }),
    false,
  );
  assert.equal(
    isSpeechRecognitionSupported({
      hasSpeechApi: true,
      userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36',
      hasDesktopBridge: true,
    }),
    false,
  );
});

test('UI-3 D: vi and en dictionaries contain all required composer and queue keys', () => {
  assert.equal(vi.home.slot.placeholderQueue, 'Xếp hàng cho sau lượt này…');
  assert.equal(en.home.slot.placeholderQueue, 'Queue for after this turn…');

  const requiredComposerKeys = [
    'send',
    'sendAria',
    'more',
    'newSession',
    'clearInput',
    'seatModelChip',
    'defaultModel',
    'mic',
    'micListening',
    'micStop',
    'micUnsupported',
    'micPermissionDenied',
    'micNoSpeech',
    'micNetworkError',
  ];
  for (const k of requiredComposerKeys) {
    assert.equal(typeof vi.home.composer[k], 'string', `Missing vi.home.composer.${k}`);
    assert.ok(vi.home.composer[k].length > 0, `Empty vi.home.composer.${k}`);
    assert.equal(typeof en.home.composer[k], 'string', `Missing en.home.composer.${k}`);
    assert.ok(en.home.composer[k].length > 0, `Empty en.home.composer.${k}`);
  }
});
