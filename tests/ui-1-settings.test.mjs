import assert from 'node:assert/strict';
import {
  DEFAULT_TEXT_SIZE,
  isTextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
  TEXT_SIZE_STORAGE_KEY,
} from '../src/components/office/text-size.ts';
import { getOfficeConfig, getAgentLanguage } from '../src/lib/office-config.ts';
import { loiDanHeThong } from '../src/lib/cau-hinh.ts';

console.log('--- Testing UI-1: Default Large Font & Language Configuration ---');

// Test 1: DEFAULT_TEXT_SIZE is 'large'
{
  assert.equal(DEFAULT_TEXT_SIZE, 'large', 'DEFAULT_TEXT_SIZE must be large');
  assert.equal(isTextSize('large'), true, 'large must be valid TextSize');
  assert.equal(isTextSize('medium'), true, 'medium must be valid TextSize');
  assert.equal(isTextSize('small'), false, 'small must not be valid TextSize');
  assert.equal(isTextSize(null), false, 'null must not be valid TextSize');
  console.log('  [PASS] Test 1: DEFAULT_TEXT_SIZE is "large" and type guards pass');
}

// Test 2: Fallback readTextSize when localStorage is empty
{
  // Simulated node environment without window/localStorage
  const size = readTextSize();
  assert.equal(size, 'large', 'readTextSize without localStorage must return large');
  console.log('  [PASS] Test 2: readTextSize defaults to "large"');
}

// Test 3: applyTextSize in non-DOM environment is a safe no-op
{
  assert.doesNotThrow(() => applyTextSize('large'));
  assert.doesNotThrow(() => applyTextSize('medium'));
  console.log('  [PASS] Test 3: applyTextSize safely no-ops in non-DOM environment');
}

// Test 4: Language resolution in office-config
{
  const cfgAuto = { language: 'auto' };
  assert.equal(getAgentLanguage(cfgAuto), 'auto', 'language auto returns auto');

  const cfgVi = { language: 'vi' };
  assert.equal(getAgentLanguage(cfgVi), 'vi', 'language vi returns vi');

  const cfgEn = { language: 'en' };
  assert.equal(getAgentLanguage(cfgEn), 'en', 'language en returns en');

  const cfgEmpty = {};
  assert.equal(getAgentLanguage(cfgEmpty), 'auto', 'empty language defaults to auto');

  const currentConfig = getOfficeConfig();
  assert.equal(currentConfig.language, 'auto', 'config/office.json language should be auto');
  assert.equal(getAgentLanguage(), 'auto', 'default config agent language should be auto');
  console.log('  [PASS] Test 4: getAgentLanguage correctly resolves preferences');
}

// Test 5: loiDanHeThong reflects language parameter
{
  const promptVi = loiDanHeThong('TestSeat', 'Lead', 'Marketing', 'vi');
  assert.ok(promptVi.includes('tiếng Việt'), 'prompt for vi should specify tiếng Việt');

  const promptEn = loiDanHeThong('TestSeat', 'Lead', 'Marketing', 'en');
  assert.ok(promptEn.includes('English'), 'prompt for en should specify English');

  const promptAuto = loiDanHeThong('TestSeat', 'Lead', 'Marketing', 'auto');
  assert.ok(promptAuto.includes('ngôn ngữ của câu hỏi'), 'prompt for auto should specify question language');

  const promptDefault = loiDanHeThong('TestSeat', 'Lead', 'Marketing');
  assert.ok(promptDefault.includes('ngôn ngữ của câu hỏi'), 'prompt without arg should default to auto question language');
  console.log('  [PASS] Test 5: loiDanHeThong renders correct instruction per language');
}

console.log('All UI-1 unit tests passed.');
