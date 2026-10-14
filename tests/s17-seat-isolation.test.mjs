import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  GIONG_TERMINAL,
  CAM_KHI_HAN_CHE,
  SEAT_ISOLATION_SETTINGS_JSON,
  CLAUDE_SEAT_ENV_WHITELIST,
  chayNhuTerminal,
  ngheRaNgoai,
  resolveSeatMcpConfig,
  buildClaudeMdExcludes,
  buildClaudeSeatSettingsJson,
  buildClaudeSeatEnv,
  buildClaudeSeatArgv,
  escapeSeatSettingsGlobPath,
  verifySeatSettingsRootAnchor,
  ensureSeatSettingsAnchored,
  spawnClaudeSeatProcess,
} from '../src/lib/chay-agent.ts';
import { generateSeatFiles } from '../operations/scripts/gen-seat-files.mjs';

const REPO_ROOT = process.cwd();

test('S17-1 & F1/F6: GIONG_TERMINAL ignores legacy GIONG_TERMINAL env var, network brake is fail-closed without -H, and shared argv builder isolates both chat/runner and fork', () => {
  assert.equal(GIONG_TERMINAL, false, 'GIONG_TERMINAL must default to false');
  assert.equal(
    chayNhuTerminal({ GIONG_TERMINAL: '1' }),
    false,
    'F1a: legacy GIONG_TERMINAL=1 env var must be ignored'
  );
  assert.equal(
    chayNhuTerminal({ AIBOSS_SEAT_TERMINAL_MODE: '1' }),
    true,
    'AIBOSS_SEAT_TERMINAL_MODE=1 must enable terminal mode'
  );

  // F6: fail-closed when -H is absent or 0.0.0.0, local when -H 127.0.0.1
  assert.equal(ngheRaNgoai(['node', 'next', 'start', '-p', '4330']), true, 'F6: missing -H must be treated as external (fail-closed)');
  assert.equal(ngheRaNgoai(['node', 'next', 'start', '-p', '4330', '-H', '0.0.0.0']), true, 'F6: -H 0.0.0.0 must be external');
  assert.equal(ngheRaNgoai(['node', 'next', 'start', '-p', '4330', '-H', '127.0.0.1']), false, 'F6: -H 127.0.0.1 must be local');
  assert.equal(ngheRaNgoai(['node', 'next', 'start', '--hostname=localhost']), false, 'F6: --hostname=localhost must be local');

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'next start -p 4330 -H 127.0.0.1', 'F6: package.json start script must include -H 127.0.0.1');
  assert.ok(
    pkg.scripts.prestart.includes('operations/scripts/gen-seat-files.mjs') &&
      pkg.scripts.prestart.includes('operations/scripts/gen-seat-claude-md.mjs'),
    'F7a: package.json prestart must run both gen-seat-files.mjs and gen-seat-claude-md.mjs'
  );

  const seatDir = path.join(REPO_ROOT, 'departments', 'marketing', 'seats', 'content-writer');

  // Argv when bound locally (-H 127.0.0.1)
  const localArgv = buildClaudeSeatArgv({
    thuMuc: seatDir,
    maNhanSu: 'content-writer',
    argv: ['node', 'next', 'start', '-p', '4330', '-H', '127.0.0.1'],
    env: {},
  });
  assert.ok(localArgv.includes('--setting-sources') && localArgv[localArgv.indexOf('--setting-sources') + 1] === 'project');
  assert.ok(localArgv.includes('--strict-mcp-config'));
  assert.ok(localArgv.includes('--disable-slash-commands'));
  assert.equal(localArgv[localArgv.indexOf('--permission-mode') + 1], 'bypassPermissions');
  assert.ok(!localArgv.includes('--disallowedTools'), 'Local -H 127.0.0.1 must not disallow tools');

  // Argv when started without -H (fail-closed F6)
  const noHostArgv = buildClaudeSeatArgv({
    thuMuc: seatDir,
    maNhanSu: 'content-writer',
    argv: ['node', 'next', 'start', '-p', '4330'],
    env: {},
  });
  assert.equal(noHostArgv[noHostArgv.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(noHostArgv.includes('--disallowedTools'), 'Missing -H must include --disallowedTools');
  for (const tool of CAM_KHI_HAN_CHE) {
    assert.ok(noHostArgv.includes(tool), `Missing -H must disallow ${tool}`);
  }

  // F1b: Fork argv must also carry full seat isolation flags
  const forkArgv = buildClaudeSeatArgv({
    thuMuc: seatDir,
    maNhanSu: 'content-writer',
    outputFormat: 'json',
    maPhienCu: '11111111-2222-3333-4444-555555555555',
    forkSession: true,
    argv: ['node', 'next', 'start', '-p', '4330', '-H', '127.0.0.1'],
    env: {},
  });
  assert.equal(forkArgv[forkArgv.indexOf('--output-format') + 1], 'json');
  assert.ok(forkArgv.includes('--fork-session'));
  assert.equal(forkArgv[forkArgv.indexOf('--resume') + 1], '11111111-2222-3333-4444-555555555555');
  assert.equal(forkArgv[forkArgv.indexOf('--setting-sources') + 1], 'project');
  assert.ok(forkArgv.includes('--settings'));
  assert.ok(forkArgv.includes('--strict-mcp-config'));
  assert.ok(forkArgv.includes('--disable-slash-commands'));

  // F1b: Scan all files in src/ to verify no spawn/execa calls claude outside src/lib/chay-agent.ts
  function listTsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...listTsFiles(full));
      else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  }
  const srcFiles = listTsFiles(path.join(REPO_ROOT, 'src'));
  const chayAgentPath = path.resolve(REPO_ROOT, 'src', 'lib', 'chay-agent.ts');
  for (const file of srcFiles) {
    if (path.resolve(file) === chayAgentPath) continue;
    const content = fs.readFileSync(file, 'utf8');
    assert.ok(
      !/\b(?:spawn|spawnSync|exec|execFile|execSync|execFileSync|execa)\s*\([^)]*(?:lenhClaude|['"`]claude['"`])/.test(content),
      `File ${path.relative(REPO_ROOT, file)} must not directly spawn claude outside chay-agent.ts`
    );
  }
});

test('F2: buildClaudeMdExcludes computes ancestor excludes dynamically without excluding <REPO_ROOT>/CLAUDE.md at any clone depth', () => {
  const defaultSettings = JSON.parse(SEAT_ISOLATION_SETTINGS_JSON);
  assert.equal(defaultSettings.autoMemoryEnabled, false);
  assert.ok(!defaultSettings.claudeMdExcludes.includes('/*/*/CLAUDE.md'), 'Must not contain depth-2 wildcard');
  assert.ok(!defaultSettings.claudeMdExcludes.includes('/*/*/*/CLAUDE.md'), 'Must not contain depth-3 wildcard');
  assert.ok(!defaultSettings.claudeMdExcludes.includes('/**/.claude/CLAUDE.md'), 'Must not contain global .claude wildcard');
  assert.ok(!defaultSettings.claudeMdExcludes.includes('/**/.claude/rules/**'), 'Must not contain global .claude/rules wildcard');

  for (const sampleRoot of [
    '/tmp/x/aiboss-office',
    '/Users/erocathanh/Projects/aiboss-office',
    '/Users/erocathanh/work/deep/sub/aiboss-office',
  ]) {
    const excludes = buildClaudeMdExcludes({
      repoRoot: sampleRoot,
      homeDir: '/Users/erocathanh',
    });
    assert.ok(!excludes.includes(`${sampleRoot}/CLAUDE.md`), `Must NEVER exclude ${sampleRoot}/CLAUDE.md`);
    assert.ok(!excludes.includes(`${sampleRoot}/.claude/CLAUDE.md`), `Must NEVER exclude ${sampleRoot}/.claude/CLAUDE.md`);
    assert.ok(!excludes.includes(`${sampleRoot}/.claude/rules/**`), `Must NEVER exclude ${sampleRoot}/.claude/rules/**`);

    const parentDir = path.dirname(sampleRoot);
    assert.ok(excludes.includes(`${parentDir}/CLAUDE.md`), `Must exclude parent ${parentDir}/CLAUDE.md`);
    assert.ok(excludes.includes(`${parentDir}/.claude/CLAUDE.md`), `Must exclude parent ${parentDir}/.claude/CLAUDE.md`);
    assert.ok(excludes.includes(`${parentDir}/.claude/rules/**`), `Must exclude parent ${parentDir}/.claude/rules/**`);
    assert.ok(excludes.includes('/Users/erocathanh/CLAUDE.md'), 'Must exclude HOME/CLAUDE.md');
    assert.ok(excludes.includes('/Users/erocathanh/.claude/CLAUDE.md'), 'Must exclude HOME/.claude/CLAUDE.md');
    assert.ok(excludes.includes('/Users/erocathanh/.claude/rules/**'), 'Must exclude HOME/.claude/rules/**');
  }
});

test('S17-2: resolveSeatMcpConfig returns per-seat .mcp.json for listed seats and empty JSON for unlisted seats', () => {
  const seats = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'seats.json'), 'utf8'));
  assert.equal(seats.length, 8);

  for (const seat of seats) {
    const resolved = resolveSeatMcpConfig(seat.seat_id, path.join(REPO_ROOT, seat.dir));
    const expectedPath = path.resolve(REPO_ROOT, seat.dir, '.mcp.json');
    assert.equal(resolved, expectedPath, `Seat ${seat.seat_id} should resolve to ${expectedPath}`);
    assert.ok(fs.existsSync(resolved), `.mcp.json must exist at ${resolved}`);
    const mcpContent = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    assert.ok(mcpContent.mcpServers && mcpContent.mcpServers['agent-broker'], `Seat ${seat.seat_id} .mcp.json must configure agent-broker`);
  }

  assert.equal(resolveSeatMcpConfig('search-ai-visibility'), '{"mcpServers":{}}');
  assert.equal(resolveSeatMcpConfig('non-existent-seat'), '{"mcpServers":{}}');
  assert.equal(resolveSeatMcpConfig(null), '{"mcpServers":{}}');
  assert.equal(resolveSeatMcpConfig(undefined), '{"mcpServers":{}}');
});

test('S17-3, S17-5, F4, F7 & F11: root and per-seat .claude/settings.json register all hooks, preserve seat-specific deny rules, anchor absolute deny rules to process.cwd(), and spawnClaudeSeatProcess rejects /opt/fake mismatch', () => {
  const rootSettings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
  const denyList = rootSettings.permissions.deny;
  const escapedCwd = escapeSeatSettingsGlobPath(path.resolve(REPO_ROOT).replace(/^\/+/, ''));

  // F11: Root settings.json must register block_ollama.py, block_ad_account_write.py, and block_public_publish.py
  const rootHooksJson = JSON.stringify(rootSettings.hooks);
  for (const hookScript of ['block_ollama.py', 'block_ad_account_write.py', 'block_public_publish.py']) {
    assert.ok(rootHooksJson.includes(hookScript), `F11: Root .claude/settings.json must register ${hookScript}`);
  }

  for (const forbiddenWildcard of [
    'Edit(//Users/**/projects/**/inputs/**)',
    'Edit(//Users/**/projects/**/references/**)',
    'Edit(//Users/**/projects/**/templates/**)',
    'Edit(//Users/**/operations/data/**)',
    'Edit(//home/**/projects/**/inputs/**)',
    'Edit(//home/**/operations/data/**)',
  ]) {
    assert.ok(!denyList.includes(forbiddenWildcard), `F4: settings.json must NOT contain ${forbiddenWildcard}`);
  }

  const requiredBaseDeny = [
    'Bash(sudo:*)',
    'Bash(git push --force:*)',
    'Bash(git reset --hard:*)',
    'Bash(chmod 777:*)',
    'Edit(projects/**/inputs/**)',
    'Edit(projects/**/references/**)',
    'Edit(projects/**/templates/**)',
    'Edit(operations/data/**)',
    `Edit(//${escapedCwd}/projects/**/inputs/**)`,
    `Edit(//${escapedCwd}/projects/**/references/**)`,
    `Edit(//${escapedCwd}/projects/**/templates/**)`,
    `Edit(//${escapedCwd}/operations/data/**)`,
  ];
  for (const rule of requiredBaseDeny) {
    assert.ok(denyList.includes(rule), `Root settings.json must include ${rule}`);
  }

  // F11: Every absolute Edit(//...) rule in root settings must be anchored to process.cwd()
  for (const rule of denyList.filter((r) => /^(?:Edit|Write|Read)\(\/\//.test(r))) {
    assert.ok(
      rule.startsWith(`Edit(//${escapedCwd}/`),
      `F11: Root absolute deny rule ${rule} must be anchored to process.cwd() (//${escapedCwd}/)`
    );
  }

  // F11: Verify seat-specific deny rules for paid-media and social-community, plus process.cwd() anchor on all 8 seats
  const seats = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'seats.json'), 'utf8'));
  for (const seat of seats) {
    const claudeMd = fs.readFileSync(path.join(REPO_ROOT, seat.dir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes('\n@SOUL.md\n'), `Seat ${seat.seat_id} CLAUDE.md must embed @SOUL.md`);

    const seatSettingsPath = path.join(REPO_ROOT, seat.dir, '.claude', 'settings.json');
    const seatSettings = JSON.parse(fs.readFileSync(seatSettingsPath, 'utf8'));
    const seatDeny = seatSettings.permissions.deny;
    for (const rule of seatDeny.filter((r) => /^(?:Edit|Write|Read)\(\/\//.test(r))) {
      assert.ok(
        rule.startsWith(`Edit(//${escapedCwd}/`),
        `F11: Seat ${seat.seat_id} absolute deny rule ${rule} must be anchored to process.cwd() (//${escapedCwd}/)`
      );
    }
  }

  const seatSpecificRules = [
    'Read(~/.meta-token-fanpage)',
    'Read(~/.fb-user-token-long)',
    'Read(~/.cloudflare*)',
    'Read(~/.vercel*/**)',
    'Read(~/ai-agent/*/khoa/**)',
    'Read(**/.env*)',
    'Bash(python3 ~/.claude/skills/doc-comment-fanpage/*)',
    'Bash(/usr/bin/python3 ~/.claude/skills/doc-comment-fanpage/*)',
    'Bash(python3 ~/.claude/skills/tra-loi-inbox-fanpage/*)',
    'Bash(/usr/bin/python3 ~/.claude/skills/tra-loi-inbox-fanpage/*)',
  ];

  const paidMediaSettings = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'departments/marketing/seats/paid-media/.claude/settings.json'), 'utf8')
  );
  for (const pmRule of seatSpecificRules) {
    assert.ok(paidMediaSettings.permissions.deny.includes(pmRule), `F11: paid-media deny must include ${pmRule}`);
  }

  const socialSettings = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'departments/marketing/seats/social-community/.claude/settings.json'), 'utf8')
  );
  for (const scRule of seatSpecificRules) {
    assert.ok(socialSettings.permissions.deny.includes(scRule), `F11: social-community deny must include ${scRule}`);
  }

  // F7: Test --check mode, fake root /opt/fake rejection on spawnClaudeSeatProcess, and valid root spawn
  const checkRes = generateSeatFiles({ repoRoot: REPO_ROOT, checkOnly: true, quiet: true });
  assert.equal(checkRes.driftedCount, 0, 'F7: gen-seat-files.mjs --check must report 0 drifted files on anchored repo');

  const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), 's17c-f7-clone-'));
  try {
    fs.mkdirSync(path.join(tmpClone, 'data'), { recursive: true });
    fs.mkdirSync(path.join(tmpClone, 'departments', 'marketing'), { recursive: true });
    fs.mkdirSync(path.join(tmpClone, 'config'), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, 'data', 'seats.json'), path.join(tmpClone, 'data', 'seats.json'));
    fs.copyFileSync(
      path.join(REPO_ROOT, 'departments', 'marketing', 'department.json'),
      path.join(tmpClone, 'departments', 'marketing', 'department.json')
    );
    fs.copyFileSync(path.join(REPO_ROOT, 'config', 'office.json'), path.join(tmpClone, 'config', 'office.json'));

    const tmpSeatDir = path.join(tmpClone, 'departments', 'marketing', 'seats', 'content-writer');

    // 1. Generate settings with fake root /opt/fake -> verifySeatSettingsRootAnchor fails & spawnClaudeSeatProcess rejects
    generateSeatFiles({ repoRoot: tmpClone, anchorRoot: '/opt/fake', quiet: true });
    const driftFake = generateSeatFiles({ repoRoot: tmpClone, checkOnly: true, quiet: true });
    assert.ok(driftFake.driftedCount > 0, 'F7: --check must detect drift when anchored to /opt/fake');

    const badVerify = verifySeatSettingsRootAnchor(tmpSeatDir, tmpClone);
    assert.equal(badVerify.valid, false, 'F7: verifySeatSettingsRootAnchor must return valid=false for /opt/fake');
    assert.throws(
      () =>
        spawnClaudeSeatProcess({
          thuMuc: tmpSeatDir,
          maNhanSu: 'content-writer',
          repoRoot: tmpClone,
          autoRegenerateSettings: false,
        }),
      /seat_settings_root_mismatch/,
      'F7: spawnClaudeSeatProcess must reject with seat_settings_root_mismatch when settings anchor to /opt/fake'
    );

    // 2. Generate settings with real root tmpClone -> verifySeatSettingsRootAnchor passes & spawnClaudeSeatProcess runs
    generateSeatFiles({ repoRoot: tmpClone, anchorRoot: tmpClone, quiet: true });
    const secondRun = generateSeatFiles({ repoRoot: tmpClone, anchorRoot: tmpClone, quiet: true });
    assert.equal(secondRun.updatedCount, 0, 'F7: generateSeatFiles must be idempotent (0 writes on second run)');

    const goodVerify = verifySeatSettingsRootAnchor(tmpSeatDir, tmpClone);
    assert.equal(goodVerify.valid, true, 'F7: verifySeatSettingsRootAnchor must pass when anchored to real tmpClone');

    const prevClaudeBin = process.env.DUONG_DAN_CLAUDE;
    process.env.DUONG_DAN_CLAUDE = '/usr/bin/true';
    try {
      const spawned = spawnClaudeSeatProcess({
        thuMuc: tmpSeatDir,
        maNhanSu: 'content-writer',
        repoRoot: tmpClone,
        autoRegenerateSettings: false,
      });
      assert.ok(spawned.tien, 'F7: spawnClaudeSeatProcess must succeed when settings match real repoRoot');
      spawned.tien.kill('SIGTERM');
    } finally {
      if (prevClaudeBin === undefined) delete process.env.DUONG_DAN_CLAUDE;
      else process.env.DUONG_DAN_CLAUDE = prevClaudeBin;
    }
  } finally {
    fs.rmSync(tmpClone, { recursive: true, force: true });
  }
});

test('S17-4, F3, F8, F9 & F13: Hook 2.1 blocks 8 PCN cases + F3a/F9 bypasses, F8 keeps block_secret_leak independent of Hook 2.1, and F13 preserves proxy env vars', () => {
  const hookPath = path.join(REPO_ROOT, 'operations', 'hooks', 'block_public_publish.py');
  const secretLeakPath = path.join(REPO_ROOT, 'operations', 'hooks', 'block_secret_leak.py');

  const eightCases = [
    { id: 'K1', payload: { tool_name: 'Read', tool_input: { file_path: '/Users/test/.meta-token-fanpage' } } },
    { id: 'K2', payload: { tool_name: 'Bash', tool_input: { command: 'cat ~/.meta-token-fanpage' } } },
    { id: 'K3', payload: { tool_name: 'Bash', tool_input: { command: "python3 -c \"print(open('/Users/test/.meta-token-fanpage').read()[:20])\"" } } },
    { id: 'K4', payload: { tool_name: 'Read', tool_input: { file_path: '/Users/test/.fb-user-token-long' } } },
    { id: 'P1', payload: { tool_name: 'Bash', tool_input: { command: 'python3 ~/.claude/skills/doc-comment-fanpage/scripts/doc-comment.py --trang AIBOSS --tra-loi 123_456 --noi-dung "test" --dong-y' } } },
    { id: 'P2', payload: { tool_name: 'Bash', tool_input: { command: 'python3 ~/.claude/skills/tra-loi-inbox-fanpage/scripts/inbox.py --trang AIBOSS --gui t_999 --tin "test" --dong-y' } } },
    { id: 'P3', payload: { tool_name: 'Bash', tool_input: { command: 'curl -s -X POST "https://graph.facebook.com/v25.0/123_456/comments" -d "message=hi" -d "access_token=EAAxxxx"' } } },
    { id: 'P4', payload: { tool_name: 'Bash', tool_input: { command: 'curl -s -X POST "https://graph.facebook.com/v25.0/me/feed" -d "message=bai moi"' } } },
  ];

  for (const c of eightCases) {
    const res = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '0' },
    });
    assert.equal(res.status, 2, `Case ${c.id} must be blocked (exit 2) when Hook 2.1 is enabled`);
    assert.ok(res.stderr.includes('[opc-harness:block_public_publish]'));

    // F3b: Setting AIBOSS_DISABLE_HOOK_2_1=1 alone WITHOUT AIBOSS_TEST_MODE=1 must STILL block
    const noTestModeRes = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1', AIBOSS_TEST_MODE: '0', NODE_ENV: 'development' },
    });
    assert.equal(noTestModeRes.status, 2, `F3b: case ${c.id} must STILL be blocked when AIBOSS_TEST_MODE is not 1`);

    // F3b: Setting AIBOSS_DISABLE_HOOK_2_1=1 + AIBOSS_TEST_MODE=1 in production must STILL block
    const prodModeRes = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1', AIBOSS_TEST_MODE: '1', NODE_ENV: 'production' },
    });
    assert.equal(prodModeRes.status, 2, `F3b: case ${c.id} must STILL be blocked when NODE_ENV=production`);

    // Counter-proof: AIBOSS_DISABLE_HOOK_2_1=1 + AIBOSS_TEST_MODE=1 + NODE_ENV=test allows the 8 cases through Hook 2.1
    const counterRes = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1', AIBOSS_TEST_MODE: '1', NODE_ENV: 'test' },
    });
    assert.equal(counterRes.status, 0, `Counter-proof: case ${c.id} must exit 0 on Hook 2.1 when AIBOSS_DISABLE_HOOK_2_1=1 and AIBOSS_TEST_MODE=1`);

    // F8: For K1–K4 (Facebook token paths), block_secret_leak.py MUST STILL BLOCK even when Hook 2.1 is disabled!
    if (c.id.startsWith('K')) {
      const secretRes = spawnSync('/usr/bin/python3', [secretLeakPath], {
        input: JSON.stringify(c.payload),
        encoding: 'utf8',
        env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1', AIBOSS_TEST_MODE: '1', NODE_ENV: 'test' },
      });
      assert.equal(
        secretRes.status,
        2,
        `F8: ${c.id} must STILL be blocked by block_secret_leak.py when AIBOSS_TEST_MODE=1 AIBOSS_DISABLE_HOOK_2_1=1`
      );
      assert.ok(secretRes.stderr.includes('[opc-harness:block_secret_leak]'));
    }
  }

  // F3a & F9: bypass cases + positive controls
  const tmpScriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 's17c-f9-'));
  try {
    const smallScript = path.join(tmpScriptDir, 'post.sh');
    fs.writeFileSync(smallScript, '#!/bin/sh\ncurl -s -X POST "https://graph.facebook.com/v25.0/me/feed" -d "message=bypass"\n', 'utf8');
    const bigScript = path.join(tmpScriptDir, 'big.sh');
    fs.writeFileSync(bigScript, '#!/bin/sh\n' + '# padding\n'.repeat(25000), 'utf8');
    const fakeFetcher = path.join(tmpScriptDir, 'fetch_page_messages.py');
    fs.writeFileSync(fakeFetcher, 'import urllib.request\nurllib.request.urlopen("https://graph.facebook.com/v25.0/me/feed", data=b"x")\n', 'utf8');

    const f3aAndF9BlockCases = [
      { name: 'env-url', cmd: 'GRAPH_URL="https://graph.facebook.com/v25.0/me/feed"; curl -s -X POST "$GRAPH_URL" -d "message=hi"' },
      { name: 'python-concat', cmd: "python3 -c \"import requests; requests.post('https://graph.' + 'facebook.com/v25.0/me/feed', data={'message':'hi'})\"" },
      { name: 'redirector-host', cmd: 'curl -L -X POST "https://my-redirector.example.com/publish" -d "message=hi"' },
      { name: 'bash-script-file', cmd: `bash "${smallScript}"` },
      { name: 'oversized-script-file', cmd: `bash "${bigScript}"` },
      { name: 'f9a-dynamic-url-with-localhost-payload', cmd: 'U=$(cat /tmp/url); curl -X POST "$U" -d "ref=http://localhost/ok"' },
      { name: 'f9b-fake-fetch-page-messages-basename', cmd: `python3 "${fakeFetcher}"` },
      { name: 'f9c-nonexistent-script-fail-closed', cmd: `bash "${path.join(tmpScriptDir, 'missing-script.sh')}"` },
    ];

    for (const bc of f3aAndF9BlockCases) {
      const r = spawnSync('/usr/bin/python3', [hookPath], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: bc.cmd }, cwd: REPO_ROOT }),
        encoding: 'utf8',
      });
      assert.equal(r.status, 2, `F3a/F9 case ${bc.name} must be blocked (exit 2), got ${r.status}`);
    }

    // Positive control: read-only GET curl and local 127.0.0.1 POST
    for (const allowCmd of [
      "curl -s 'https://graph.facebook.com/v19.0/me?fields=id,name'",
      'curl -s -X POST "http://127.0.0.1:4330/api/danh-thuc" -d "{}"',
    ]) {
      const r = spawnSync('/usr/bin/python3', [hookPath], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: allowCmd }, cwd: REPO_ROOT }),
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, `F3a/F9 positive control (${allowCmd}) must be allowed (exit 0), stderr: ${r.stderr}`);
    }
  } finally {
    fs.rmSync(tmpScriptDir, { recursive: true, force: true });
  }

  // F3b & F13: Child process env whitelist preserves proxy vars and strips AIBOSS_DISABLE_HOOK_2_1, AIBOSS_TEST_MODE, and arbitrary secrets
  const filteredEnv = buildClaudeSeatEnv({
    PATH: '/usr/bin:/bin',
    HOME: '/Users/test',
    HTTP_PROXY: 'http://127.0.0.1:8080',
    HTTPS_PROXY: 'http://127.0.0.1:8443',
    NO_PROXY: 'localhost,127.0.0.1',
    ALL_PROXY: 'socks5://127.0.0.1:1080',
    http_proxy: 'http://127.0.0.1:8080',
    https_proxy: 'http://127.0.0.1:8443',
    no_proxy: 'localhost,127.0.0.1',
    all_proxy: 'socks5://127.0.0.1:1080',
    AIBOSS_DISABLE_HOOK_2_1: '1',
    AIBOSS_TEST_MODE: '1',
    UNLISTED_SECRET_TOKEN: 'secret123',
    AIBOSS_DATA_DIR: '/tmp/data',
  });
  assert.equal(filteredEnv.AIBOSS_DISABLE_HOOK_2_1, undefined, 'F3b: AIBOSS_DISABLE_HOOK_2_1 must be stripped');
  assert.equal(filteredEnv.AIBOSS_TEST_MODE, undefined, 'F3b: AIBOSS_TEST_MODE must be stripped');
  assert.equal(filteredEnv.UNLISTED_SECRET_TOKEN, undefined, 'F3b: unlisted env vars must be stripped');
  assert.equal(filteredEnv.AIBOSS_DATA_DIR, '/tmp/data');
  assert.equal(filteredEnv.HTTP_PROXY, 'http://127.0.0.1:8080', 'F13: HTTP_PROXY must be preserved');
  assert.equal(filteredEnv.HTTPS_PROXY, 'http://127.0.0.1:8443', 'F13: HTTPS_PROXY must be preserved');
  assert.equal(filteredEnv.NO_PROXY, 'localhost,127.0.0.1', 'F13: NO_PROXY must be preserved');
  assert.equal(filteredEnv.ALL_PROXY, 'socks5://127.0.0.1:1080', 'F13: ALL_PROXY must be preserved');
  assert.equal(filteredEnv.http_proxy, 'http://127.0.0.1:8080', 'F13: http_proxy must be preserved');
  assert.equal(filteredEnv.https_proxy, 'http://127.0.0.1:8443', 'F13: https_proxy must be preserved');
  assert.equal(filteredEnv.no_proxy, 'localhost,127.0.0.1', 'F13: no_proxy must be preserved');
  assert.equal(filteredEnv.all_proxy, 'socks5://127.0.0.1:1080', 'F13: all_proxy must be preserved');

  const secretLeakSrc = fs.readFileSync(secretLeakPath, 'utf8');
  assert.ok(!secretLeakSrc.includes('AIBOSS_DISABLE_HOOK_2_1'), 'F3c/F8: block_secret_leak.py must not reference AIBOSS_DISABLE_HOOK_2_1');
});

test('F5, F10 & F12: lock_raw_inputs.py blocks heredoc writes, string-concat open(), and copyFileSync dst into protected paths while allowing wip/ and whitespace literals', () => {
  const lockHookPath = path.join(REPO_ROOT, 'operations', 'hooks', 'lock_raw_inputs.py');
  const blockCases = [
    {
      name: 'heredoc-python-operations-data',
      cmd: "python3 - <<'EOF'\nopen('operations/data/approvals/2026-10-14.jsonl', 'a').write('x')\nEOF",
    },
    {
      name: 'dynamic-var-redirect',
      cmd: 'p=operations/data/approvals/2026-10-14.jsonl; printf x > "$p"',
      expectMsg: 'đích không đọc được',
    },
    {
      name: 'node-e-writeFileSync',
      cmd: "node -e \"require('fs').writeFileSync('operations/data/approvals/2026-10-14.jsonl', 'x')\"",
    },
    {
      name: 'heredoc-python-path-write-inputs',
      cmd: "python3 - <<'EOF'\nfrom pathlib import Path\nPath('projects/THU-SU-THAT/inputs/a.md').write_text('x')\nEOF",
    },
    {
      name: 'f10-python-open-string-concat',
      cmd: "python3 -c \"open('operations/'+'data/approvals/x.jsonl','a').write('x')\"",
    },
    {
      name: 'f10-node-copyFileSync-dst-protected',
      cmd: "node -e \"require('fs').copyFileSync('a','operations/data/approvals/x.jsonl')\"",
    },
  ];

  for (const bc of blockCases) {
    const r = spawnSync('/usr/bin/python3', [lockHookPath], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: bc.cmd }, cwd: REPO_ROOT }),
      encoding: 'utf8',
    });
    assert.equal(r.status, 2, `F5/F10 case ${bc.name} must be blocked (exit 2), got ${r.status}`);
    if (bc.expectMsg) {
      assert.ok(r.stderr.includes(bc.expectMsg), `F5/F10 case ${bc.name} stderr must include "${bc.expectMsg}", got: ${r.stderr}`);
    }
  }

  // Positive controls: printf x > /tmp/ok.txt, copyFileSync('a','wip/b'), and whitespace literals open( 'wip/ok.txt','w')
  for (const allowCmd of [
    'printf x > /tmp/ok.txt',
    "node -e \"require('fs').copyFileSync('a','wip/b')\"",
    "python3 -c \"open( 'wip/ok.txt', 'w').write('x')\"",
    "node -e \"require('fs').writeFileSync( 'wip/ok.txt', 'x')\"",
  ]) {
    const okRes = spawnSync('/usr/bin/python3', [lockHookPath], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: allowCmd }, cwd: REPO_ROOT }),
      encoding: 'utf8',
    });
    assert.equal(okRes.status, 0, `F5/F10/F12 positive control (${allowCmd}) must exit 0, stderr: ${okRes.stderr}`);
  }
});

