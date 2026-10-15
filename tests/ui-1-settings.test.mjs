import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
  shouldSyncTextSizeStorageKey,
  syncTextSizeOnStorageEvent,
  TEXT_SIZE_STORAGE_KEY,
} from '../src/components/office/text-size.ts';
import {
  getOfficeConfig,
  getAgentLanguage,
  normalizeAgentLanguage,
} from '../src/lib/office-config.ts';
import { loiDanHeThong } from '../src/lib/cau-hinh.ts';
import {
  resolveSeatLanguageRule,
  generateSeatClaudeMd,
} from '../operations/scripts/gen-seat-claude-md.mjs';

console.log('--- Testing UI-1: Default Large Font, Storage Sync & Language Configuration ---');

// Test 1: DEFAULT_TEXT_SIZE is 'large' and type guard validates strictly
{
  assert.equal(DEFAULT_TEXT_SIZE, 'large', 'DEFAULT_TEXT_SIZE must be large');
  assert.equal(isTextSize('large'), true, 'large must be valid TextSize');
  assert.equal(isTextSize('medium'), true, 'medium must be valid TextSize');
  assert.equal(isTextSize('small'), false, 'small must not be valid TextSize');
  assert.equal(isTextSize(null), false, 'null must not be valid TextSize');
  assert.equal(isTextSize(123), false, 'number must not be valid TextSize');
  console.log('  [PASS] Test 1: DEFAULT_TEXT_SIZE is "large" and type guards pass');
}

// Test 2: readTextSize and saveTextSize with simulated localStorage (empty, medium, corrupt, throwing)
{
  // Without localStorage (Node default)
  assert.equal(readTextSize(), 'large', 'readTextSize without localStorage must return large');

  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };

  try {
    // Empty storage -> 'large'
    assert.equal(readTextSize(), 'large', 'empty localStorage must default to large');

    // Save 'medium' -> reads back 'medium'
    saveTextSize('medium');
    assert.equal(store.get(TEXT_SIZE_STORAGE_KEY), 'medium');
    assert.equal(readTextSize(), 'medium', 'saved medium must read back as medium');

    // Corrupt value in localStorage -> falls back to 'large'
    store.set(TEXT_SIZE_STORAGE_KEY, 'corrupt-value');
    assert.equal(readTextSize(), 'large', 'corrupt localStorage value must fall back to large');

    // Throwing localStorage (private browsing) -> falls back to 'large' without throwing
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('QuotaExceeded / SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded / SecurityError');
      },
    };
    assert.equal(readTextSize(), 'large', 'throwing localStorage must fall back to large');
    assert.doesNotThrow(() => saveTextSize('medium'), 'saveTextSize must not throw on storage error');
  } finally {
    delete globalThis.localStorage;
  }
  console.log('  [PASS] Test 2: readTextSize and saveTextSize handle empty, saved, corrupt, and throwing localStorage');
}

// Test 3: applyTextSize and syncTextSizeOnStorageEvent (including e.key === null on localStorage.clear())
{
  // Safe no-op when document is undefined
  assert.doesNotThrow(() => applyTextSize('large'));
  assert.doesNotThrow(() => applyTextSize('medium'));

  const attrs = new Map();
  const store = new Map();
  globalThis.document = {
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => attrs.get(k) ?? null,
    },
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    clear: () => store.clear(),
  };

  try {
    applyTextSize('medium');
    assert.equal(attrs.get('data-text-size'), 'medium', 'data-text-size must be medium');
    assert.equal(attrs.get('data-co-chu'), 'vua', 'data-co-chu must be synced to vua for medium');

    applyTextSize('large');
    assert.equal(attrs.get('data-text-size'), 'large', 'data-text-size must be large');
    assert.equal(attrs.get('data-co-chu'), 'lon', 'data-co-chu must be synced to lon for large');

    // Simulate user having 'medium' saved
    saveTextSize('medium');
    applyTextSize('medium');
    assert.equal(attrs.get('data-text-size'), 'medium');
    assert.equal(attrs.get('data-co-chu'), 'vua');

    // Unrelated storage key is ignored
    let callbackValue = null;
    assert.equal(shouldSyncTextSizeStorageKey('other-key'), false);
    const ignored = syncTextSizeOnStorageEvent({ key: 'other-key' }, (val) => {
      callbackValue = val;
    });
    assert.equal(ignored, null);
    assert.equal(callbackValue, null);
    assert.equal(attrs.get('data-text-size'), 'medium');

    // Exact TEXT_SIZE_STORAGE_KEY event syncs updated storage value
    store.set(TEXT_SIZE_STORAGE_KEY, 'large');
    assert.equal(shouldSyncTextSizeStorageKey(TEXT_SIZE_STORAGE_KEY), true);
    const syncedOnKey = syncTextSizeOnStorageEvent({ key: TEXT_SIZE_STORAGE_KEY }, (val) => {
      callbackValue = val;
    });
    assert.equal(syncedOnKey, 'large');
    assert.equal(callbackValue, 'large');
    assert.equal(attrs.get('data-text-size'), 'large');
    assert.equal(attrs.get('data-co-chu'), 'lon');

    // Reset back to medium before testing storage.clear() (key === null)
    saveTextSize('medium');
    applyTextSize('medium');
    callbackValue = null;

    // Another tab calls localStorage.clear() -> fires storage event with key === null
    store.clear();
    assert.equal(shouldSyncTextSizeStorageKey(null), true);
    const syncedOnClear = syncTextSizeOnStorageEvent({ key: null }, (val) => {
      callbackValue = val;
    });
    assert.equal(syncedOnClear, 'large', 'storage clear (key === null) must reset text size to large');
    assert.equal(callbackValue, 'large', 'DisplaySettingsCard state callback must receive large on key === null');
    assert.equal(attrs.get('data-text-size'), 'large', 'DOM data-text-size must reset to large on key === null');
    assert.equal(attrs.get('data-co-chu'), 'lon', 'DOM data-co-chu must reset to lon on key === null');
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
  console.log('  [PASS] Test 3: applyTextSize syncs both attributes and syncTextSizeOnStorageEvent handles TEXT_SIZE_STORAGE_KEY and key === null');
}

// Test 4: Language normalization handles valid strings, whitespace/case, unknown codes, and non-string types
{
  assert.equal(normalizeAgentLanguage('auto'), 'auto');
  assert.equal(normalizeAgentLanguage('vi'), 'vi');
  assert.equal(normalizeAgentLanguage('en'), 'en');
  assert.equal(normalizeAgentLanguage(' EN '), 'en', 'trimmed uppercase EN must normalize to en');
  assert.equal(normalizeAgentLanguage(' VI '), 'vi', 'trimmed uppercase VI must normalize to vi');
  assert.equal(normalizeAgentLanguage('fr'), 'auto', 'unsupported language code fr must fall back to auto');
  assert.equal(normalizeAgentLanguage(''), 'auto', 'empty string must fall back to auto');
  assert.equal(normalizeAgentLanguage('   '), 'auto', 'whitespace string must fall back to auto');

  // Non-string types in JSON must not throw TypeError and must return 'auto'
  for (const invalidVal of [123, true, false, null, undefined, {}, ['vi']]) {
    assert.doesNotThrow(() => normalizeAgentLanguage(invalidVal));
    assert.equal(normalizeAgentLanguage(invalidVal), 'auto', `non-string ${JSON.stringify(invalidVal)} must return auto`);
    assert.equal(
      getAgentLanguage({ language: invalidVal }),
      'auto',
      `getAgentLanguage with ${JSON.stringify(invalidVal)} must return auto`
    );
  }

  assert.equal(getAgentLanguage({ language: ' EN ' }), 'en');
  assert.equal(getAgentLanguage({ language: ' VI ' }), 'vi');
  assert.equal(getAgentLanguage({ language: 'fr' }), 'auto');
  assert.equal(getAgentLanguage({}), 'auto');

  const currentConfig = getOfficeConfig();
  assert.equal(currentConfig.language, 'auto', 'config/office.json language should be auto');
  assert.equal(getAgentLanguage(), 'auto', 'default config agent language should be auto');
  console.log('  [PASS] Test 4: getAgentLanguage and normalizeAgentLanguage handle all valid, unknown, and non-string inputs');
}

// Test 5: loiDanHeThong branch-distinguishing assertions & non-string safety
{
  const promptVi = loiDanHeThong('TestSeat', 'Lead', 'Marketing', 'vi');
  assert.ok(
    promptVi.includes('Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc.'),
    'vi prompt must include unique Vietnamese instruction'
  );
  assert.ok(
    !promptVi.includes('ngôn ngữ của câu hỏi'),
    'vi prompt must NOT include auto question-language instruction'
  );
  assert.ok(
    !promptVi.includes('Answer in English'),
    'vi prompt must NOT include English instruction'
  );

  const promptEn = loiDanHeThong('TestSeat', 'Lead', 'Marketing', ' EN ');
  assert.ok(
    promptEn.includes('Answer in English, concise and directly to the point.'),
    'en prompt must include unique English instruction'
  );
  assert.ok(
    !promptEn.includes('Trả lời bằng tiếng Việt'),
    'en prompt must NOT include Vietnamese instruction'
  );
  assert.ok(
    !promptEn.includes('ngôn ngữ của câu hỏi'),
    'en prompt must NOT include auto question-language instruction'
  );

  for (const autoInput of ['auto', 'fr', '', 123, true, null, undefined, {}]) {
    const promptAuto = loiDanHeThong('TestSeat', 'Lead', 'Marketing', autoInput);
    assert.ok(
      promptAuto.includes('Trả lời theo đúng ngôn ngữ của câu hỏi (tiếng Việt hoặc tiếng Anh)'),
      `auto prompt for ${JSON.stringify(autoInput)} must include question-language instruction`
    );
    assert.ok(
      !promptAuto.includes('Trả lời bằng tiếng Việt, ngắn gọn'),
      `auto prompt for ${JSON.stringify(autoInput)} must NOT include fixed vi instruction`
    );
    assert.ok(
      !promptAuto.includes('Answer in English'),
      `auto prompt for ${JSON.stringify(autoInput)} must NOT include fixed en instruction`
    );
  }
  console.log('  [PASS] Test 5: loiDanHeThong uniquely distinguishes vi, en, and auto branches and handles non-strings');
}

// Test 6: Seat CLAUDE.md generator (gen-seat-claude-md.mjs) idempotence, 0-diff on auto, and override on vi/en in isolated temp dir
{
  assert.equal(
    resolveSeatLanguageRule('vi'),
    'answer in Vietnamese, keep code and identifiers in English'
  );
  assert.equal(resolveSeatLanguageRule(' EN '), 'answer in English');
  assert.equal(
    resolveSeatLanguageRule('auto'),
    'answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English'
  );
  assert.equal(
    resolveSeatLanguageRule('vietnamese'),
    'answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English',
    'legacy vietnamese alias must fall back to auto rule'
  );
  assert.equal(
    resolveSeatLanguageRule('english'),
    'answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English',
    'legacy english alias must fall back to auto rule'
  );
  assert.equal(
    resolveSeatLanguageRule(123),
    'answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English'
  );

  // Copy fixture (seats.json, department.json, config/office.json, and committed seat CLAUDE.md files)
  // to an isolated temp workspace so the working tree is NEVER written to during tests.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui1-seat-gen-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'departments', 'marketing'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });

    const seatsData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'seats.json'), 'utf-8')
    );
    fs.copyFileSync(
      path.join(process.cwd(), 'data', 'seats.json'),
      path.join(tmpDir, 'data', 'seats.json')
    );
    fs.copyFileSync(
      path.join(process.cwd(), 'departments', 'marketing', 'department.json'),
      path.join(tmpDir, 'departments', 'marketing', 'department.json')
    );
    const tmpCfgPath = path.join(tmpDir, 'config', 'office.json');
    fs.copyFileSync(path.join(process.cwd(), 'config', 'office.json'), tmpCfgPath);

    for (const seat of seatsData) {
      if (seat.department !== 'marketing') continue;
      const srcClaude = path.join(process.cwd(), seat.dir, 'CLAUDE.md');
      const dstDir = path.join(tmpDir, seat.dir);
      fs.mkdirSync(dstDir, { recursive: true });
      fs.copyFileSync(srcClaude, path.join(dstDir, 'CLAUDE.md'));
    }

    const soulSentinelPath = path.join(
      tmpDir,
      'departments',
      'marketing',
      'seats',
      'content-writer',
      'SOUL.md'
    );
    fs.writeFileSync(soulSentinelPath, '# SOUL sentinel\n', 'utf-8');

    // 6a: Running against copied fixture in tmpDir with committed config ("auto") produces 0 updates
    const autoRun = generateSeatClaudeMd({ repoRoot: tmpDir, configPath: tmpCfgPath, quiet: true });
    assert.equal(autoRun.totalCount, 8, 'must check all 8 marketing seats');
    assert.equal(autoRun.updatedCount, 0, 'with language="auto", copied CLAUDE.md fixture must have 0 diff');

    // 6b: Write config with language: "vi" in temp workspace
    fs.writeFileSync(tmpCfgPath, JSON.stringify({ language: 'vi' }), 'utf-8');

    const viRun1 = generateSeatClaudeMd({ repoRoot: tmpDir, configPath: tmpCfgPath, quiet: true });
    assert.equal(viRun1.totalCount, 8);
    assert.equal(viRun1.updatedCount, 8, 'first run with vi in temp dir must write 8 seat CLAUDE.md files');

    const writerClaudeVi = fs.readFileSync(
      path.join(tmpDir, 'departments', 'marketing', 'seats', 'content-writer', 'CLAUDE.md'),
      'utf-8'
    );
    assert.ok(
      writerClaudeVi.includes('answer in Vietnamese, keep code and identifiers in English'),
      'generated CLAUDE.md for vi must contain Vietnamese rule'
    );
    assert.ok(
      !writerClaudeVi.includes('language the owner writes in'),
      'generated CLAUDE.md for vi must NOT contain auto rule'
    );

    // Second run with same config is idempotent (0 writes)
    const viRun2 = generateSeatClaudeMd({ repoRoot: tmpDir, configPath: tmpCfgPath, quiet: true });
    assert.equal(viRun2.updatedCount, 0, 'second run with unchanged language must be idempotent (0 writes)');

    // 6c: Write config with language: "en" in temp workspace
    fs.writeFileSync(tmpCfgPath, JSON.stringify({ language: 'en' }), 'utf-8');
    const enRun1 = generateSeatClaudeMd({ repoRoot: tmpDir, configPath: tmpCfgPath, quiet: true });
    assert.equal(enRun1.totalCount, 8);
    assert.equal(enRun1.updatedCount, 8, 'switching from vi to en in temp dir must update 8 seat CLAUDE.md files');

    const writerClaudeEn = fs.readFileSync(
      path.join(tmpDir, 'departments', 'marketing', 'seats', 'content-writer', 'CLAUDE.md'),
      'utf-8'
    );
    assert.ok(
      writerClaudeEn.includes('answer in English'),
      'generated CLAUDE.md for en must contain English rule'
    );
    assert.ok(
      !writerClaudeEn.includes('answer in Vietnamese'),
      'generated CLAUDE.md for en must NOT contain Vietnamese rule'
    );
    assert.ok(
      !writerClaudeEn.includes('language the owner writes in'),
      'generated CLAUDE.md for en must NOT contain auto rule'
    );

    // SOUL.md sentinel is untouched
    assert.equal(fs.readFileSync(soulSentinelPath, 'utf-8'), '# SOUL sentinel\n');

    // 6d: Verify gen-seat-files.mjs imports and reuses resolveSeatLanguageRule
    const genSeatFilesSrc = fs.readFileSync(
      path.join(process.cwd(), 'operations', 'scripts', 'gen-seat-files.mjs'),
      'utf-8'
    );
    assert.ok(
      genSeatFilesSrc.includes("import { resolveSeatLanguageRule } from './gen-seat-claude-md.mjs'"),
      'gen-seat-files.mjs must import resolveSeatLanguageRule from gen-seat-claude-md.mjs'
    );
    assert.ok(
      genSeatFilesSrc.includes('resolveSeatLanguageRule(rawLang)'),
      'gen-seat-files.mjs must call resolveSeatLanguageRule(rawLang)'
    );
    assert.ok(
      !genSeatFilesSrc.includes('vietnamese') && !genSeatFilesSrc.includes('english'),
      'gen-seat-files.mjs must not diverge with legacy vietnamese/english branches'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('  [PASS] Test 6: generateSeatClaudeMd is idempotent, 0-diff on auto in temp dir, and applies vi/en overrides to SOUL seats');
}

// Test 7: Typography scale rules in globals.css cover .o-dan, .o-cau-dau (with 16px floor), and .lien-ket
{
  const globalsCss = fs.readFileSync(
    path.join(process.cwd(), 'src', 'app', 'globals.css'),
    'utf-8'
  );
  assert.ok(
    /\.o-cau-dau\s*\{[^}]*font-size:\s*max\(16px,\s*calc\(16px\s*\*\s*var\(--text-scale,\s*1\)\)\)/.test(globalsCss),
    '.o-cau-dau must scale with --text-scale while keeping 16px minimum floor'
  );
  assert.ok(
    /\.soan textarea,\s*\.o-dan,\s*\.o-cau-dau\s*\{\s*font-size:\s*max\(16px,\s*calc\(16px\s*\*\s*var\(--text-scale,\s*1\)\)\)\s*!important;/.test(globalsCss),
    '.o-dan and .o-cau-dau must share max(16px, calc(16px * var(--text-scale, 1))) !important scaling override'
  );
  assert.ok(
    /\.lien-ket\s*\{\s*font-size:\s*calc\(12px\s*\*\s*var\(--text-scale,\s*1\)\);/.test(globalsCss),
    '.lien-ket must scale with calc(12px * var(--text-scale, 1))'
  );
  console.log('  [PASS] Test 7: .o-dan, .o-cau-dau, and .lien-ket scale with --text-scale while preserving 16px input floor');
}

console.log('All UI-1 unit tests passed.');
