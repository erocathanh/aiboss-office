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

test('S17-3, S17-5, F4 & Item 7: root and per-seat .claude/settings.json anchor deny rules to real REPO_ROOT (no //Users/** or //home/**), and seat CLAUDE.md embeds @SOUL.md', () => {
  const rootSettings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
  const denyList = rootSettings.permissions.deny;

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
  ];
  for (const rule of requiredBaseDeny) {
    assert.ok(denyList.includes(rule), `Root settings.json must include ${rule}`);
  }
  assert.ok(
    denyList.some((r) => /^Edit\(\/\/.+\/projects\/\*\*\/inputs\/\*\*\)$/.test(r) && !r.includes('//Users/**')),
    'Root settings.json must include REPO_ROOT-anchored Edit(//<REPO_ROOT>/projects/**/inputs/**)'
  );
  assert.ok(
    denyList.some((r) => /^Edit\(\/\/.+\/operations\/data\/\*\*\)$/.test(r) && !r.includes('//Users/**')),
    'Root settings.json must include REPO_ROOT-anchored Edit(//<REPO_ROOT>/operations/data/**)'
  );

  // Item 7: Verify all 8 seats embed @SOUL.md in CLAUDE.md
  const seats = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'seats.json'), 'utf8'));
  for (const seat of seats) {
    const claudeMd = fs.readFileSync(path.join(REPO_ROOT, seat.dir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes('\n@SOUL.md\n'), `Seat ${seat.seat_id} CLAUDE.md must embed @SOUL.md`);
  }

  // F4: Test generating seat files in a clone outside /Users (in /tmp)
  const tmpClone = fs.mkdtempSync(path.join(os.tmpdir(), 's17b-f4-clone-'));
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

    generateSeatFiles({ repoRoot: tmpClone, anchorRoot: tmpClone, quiet: true });
    const tmpRootSettings = JSON.parse(fs.readFileSync(path.join(tmpClone, '.claude', 'settings.json'), 'utf8'));
    const realTmpPrefix = fs.realpathSync(tmpClone).replace(/^\/+/, '');
    assert.ok(
      tmpRootSettings.permissions.deny.includes(`Edit(//${realTmpPrefix}/projects/**/inputs/**)`),
      `Clone in /tmp must anchor deny rule to //${realTmpPrefix}/projects/**/inputs/**`
    );
    assert.ok(
      tmpRootSettings.permissions.deny.includes(`Edit(//${realTmpPrefix}/operations/data/**)`),
      `Clone in /tmp must anchor deny rule to //${realTmpPrefix}/operations/data/**`
    );
  } finally {
    fs.rmSync(tmpClone, { recursive: true, force: true });
  }
});

test('S17-4 & F3: Hook 2.1 blocks 8 PCN cases + 5 F3a bypass cases, enforces F3b test-mode guard & env whitelist, and F3c keeps block_secret_leak independent', () => {
  const hookPath = path.join(REPO_ROOT, 'operations', 'hooks', 'block_public_publish.py');
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

    // Counter-proof: AIBOSS_DISABLE_HOOK_2_1=1 + AIBOSS_TEST_MODE=1 + NODE_ENV=test allows the 8 cases through
    const counterRes = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1', AIBOSS_TEST_MODE: '1', NODE_ENV: 'test' },
    });
    assert.equal(counterRes.status, 0, `Counter-proof: case ${c.id} must exit 0 when AIBOSS_DISABLE_HOOK_2_1=1 and AIBOSS_TEST_MODE=1`);
  }

  // F3a: 5 bypass cases (env URL, string concat, redirector host, bash script file, >200KB script file) + 1 positive control
  const tmpScriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 's17b-f3a-'));
  try {
    const smallScript = path.join(tmpScriptDir, 'post.sh');
    fs.writeFileSync(smallScript, '#!/bin/sh\ncurl -s -X POST "https://graph.facebook.com/v25.0/me/feed" -d "message=bypass"\n', 'utf8');
    const bigScript = path.join(tmpScriptDir, 'big.sh');
    fs.writeFileSync(bigScript, '#!/bin/sh\n' + '# padding\n'.repeat(25000), 'utf8');

    const f3aBlockCases = [
      { name: 'env-url', cmd: 'GRAPH_URL="https://graph.facebook.com/v25.0/me/feed"; curl -s -X POST "$GRAPH_URL" -d "message=hi"' },
      { name: 'python-concat', cmd: "python3 -c \"import requests; requests.post('https://graph.' + 'facebook.com/v25.0/me/feed', data={'message':'hi'})\"" },
      { name: 'redirector-host', cmd: 'curl -L -X POST "https://my-redirector.example.com/publish" -d "message=hi"' },
      { name: 'bash-script-file', cmd: `bash "${smallScript}"` },
      { name: 'oversized-script-file', cmd: `bash "${bigScript}"` },
    ];

    for (const bc of f3aBlockCases) {
      const r = spawnSync('/usr/bin/python3', [hookPath], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: bc.cmd }, cwd: REPO_ROOT }),
        encoding: 'utf8',
      });
      assert.equal(r.status, 2, `F3a case ${bc.name} must be blocked (exit 2), got ${r.status}`);
    }

    // Positive control: read-only GET curl and local 127.0.0.1 POST
    for (const allowCmd of [
      'curl -s "https://graph.facebook.com/v25.0/me?fields=id,name"',
      'curl -s -X POST "http://127.0.0.1:4330/api/danh-thuc" -d "{}"',
    ]) {
      const r = spawnSync('/usr/bin/python3', [hookPath], {
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: allowCmd }, cwd: REPO_ROOT }),
        encoding: 'utf8',
      });
      assert.equal(r.status, 0, `F3a positive control (${allowCmd}) must be allowed (exit 0), stderr: ${r.stderr}`);
    }
  } finally {
    fs.rmSync(tmpScriptDir, { recursive: true, force: true });
  }

  // F3b: Child process env whitelist strips AIBOSS_DISABLE_HOOK_2_1, AIBOSS_TEST_MODE, and arbitrary secrets
  const filteredEnv = buildClaudeSeatEnv({
    PATH: '/usr/bin:/bin',
    HOME: '/Users/test',
    AIBOSS_DISABLE_HOOK_2_1: '1',
    AIBOSS_TEST_MODE: '1',
    UNLISTED_SECRET_TOKEN: 'secret123',
    AIBOSS_DATA_DIR: '/tmp/data',
  });
  assert.equal(filteredEnv.AIBOSS_DISABLE_HOOK_2_1, undefined, 'F3b: AIBOSS_DISABLE_HOOK_2_1 must be stripped');
  assert.equal(filteredEnv.AIBOSS_TEST_MODE, undefined, 'F3b: AIBOSS_TEST_MODE must be stripped');
  assert.equal(filteredEnv.UNLISTED_SECRET_TOKEN, undefined, 'F3b: unlisted env vars must be stripped');
  assert.equal(filteredEnv.AIBOSS_DATA_DIR, '/tmp/data');
  assert.ok(!CLAUDE_SEAT_ENV_WHITELIST.includes('AIBOSS_DISABLE_HOOK_2_1'));

  // F3c: block_secret_leak.py has no reference to AIBOSS_DISABLE_HOOK_2_1
  const secretLeakPath = path.join(REPO_ROOT, 'operations', 'hooks', 'block_secret_leak.py');
  const secretLeakSrc = fs.readFileSync(secretLeakPath, 'utf8');
  assert.ok(!secretLeakSrc.includes('AIBOSS_DISABLE_HOOK_2_1'), 'F3c: block_secret_leak.py must not reference AIBOSS_DISABLE_HOOK_2_1');
});

test('F5: lock_raw_inputs.py blocks heredoc writes and dynamic variable redirects in office repo and allows /tmp/ok.txt', () => {
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
  ];

  for (const bc of blockCases) {
    const r = spawnSync('/usr/bin/python3', [lockHookPath], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: bc.cmd }, cwd: REPO_ROOT }),
      encoding: 'utf8',
    });
    assert.equal(r.status, 2, `F5 case ${bc.name} must be blocked (exit 2), got ${r.status}`);
    if (bc.expectMsg) {
      assert.ok(r.stderr.includes(bc.expectMsg), `F5 case ${bc.name} stderr must include "${bc.expectMsg}", got: ${r.stderr}`);
    }
  }

  // Positive control: printf x > /tmp/ok.txt is allowed
  const okRes = spawnSync('/usr/bin/python3', [lockHookPath], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'printf x > /tmp/ok.txt' }, cwd: REPO_ROOT }),
    encoding: 'utf8',
  });
  assert.equal(okRes.status, 0, `F5 positive control (printf x > /tmp/ok.txt) must exit 0, stderr: ${okRes.stderr}`);
});

