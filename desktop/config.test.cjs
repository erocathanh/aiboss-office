'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { parseCliPort, readConfigPort, resolvePort } = require('./config.cjs');

test('parseCliPort extracts valid port from flags', () => {
  assert.equal(parseCliPort(['node', 'main.cjs', '--port', '4331']), 4331);
  assert.equal(parseCliPort(['node', 'main.cjs', '-p', '4332']), 4332);
  assert.equal(parseCliPort(['node', 'main.cjs', '--port=4333']), 4333);
  assert.equal(parseCliPort(['node', 'main.cjs', '--dev']), null);
  assert.equal(parseCliPort(['node', 'main.cjs', '--port', 'invalid']), null);
  assert.equal(parseCliPort(['node', 'main.cjs', '--port', '99999']), null);
});

test('readConfigPort reads service.port from config/office.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-cfg-'));
  try {
    const configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // No service.port
    fs.writeFileSync(path.join(configDir, 'office.json'), JSON.stringify({ version: 1 }));
    assert.equal(readConfigPort(tmpDir), null);

    // With service.port
    fs.writeFileSync(
      path.join(configDir, 'office.json'),
      JSON.stringify({ version: 1, service: { port: 4335 } })
    );
    assert.equal(readConfigPort(tmpDir), 4335);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolvePort respects priority: CLI > ENV > Config > Default 4330', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiboss-pri-'));
  try {
    const configDir = path.join(tmpDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'office.json'),
      JSON.stringify({ version: 1, service: { port: 4338 } })
    );

    // Default when no config/cli/env
    assert.equal(resolvePort({ argv: [], env: {}, repoRoot: '/nonexistent' }), 4330);

    // Config priority over default
    assert.equal(resolvePort({ argv: [], env: {}, repoRoot: tmpDir }), 4338);

    // Env priority over config
    assert.equal(
      resolvePort({
        argv: [],
        env: { AIBOSS_OFFICE_PORT: '4339' },
        repoRoot: tmpDir,
      }),
      4339
    );

    // CLI priority over Env
    assert.equal(
      resolvePort({
        argv: ['node', 'main.cjs', '--port', '4340'],
        env: { AIBOSS_OFFICE_PORT: '4339' },
        repoRoot: tmpDir,
      }),
      4340
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
