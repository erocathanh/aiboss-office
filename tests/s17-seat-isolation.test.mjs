import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { GIONG_TERMINAL, CONG_CU_CAM, SEAT_ISOLATION_SETTINGS_JSON, resolveSeatMcpConfig } from '../src/lib/chay-agent.ts';

const REPO_ROOT = process.cwd();

test('S17-1: GIONG_TERMINAL is false by default, CONG_CU_CAM is empty on local machine, and SEAT_ISOLATION_SETTINGS_JSON excludes parent CLAUDE.md', () => {
  assert.equal(GIONG_TERMINAL, false, 'GIONG_TERMINAL must default to false for isolated seat context');
  assert.deepEqual(CONG_CU_CAM, [], 'CONG_CU_CAM must be empty on local server / CLI runner');
  const parsedSettings = JSON.parse(SEAT_ISOLATION_SETTINGS_JSON);
  assert.equal(parsedSettings.autoMemoryEnabled, false);
  assert.ok(Array.isArray(parsedSettings.claudeMdExcludes));
  assert.ok(parsedSettings.claudeMdExcludes.includes('/*/*/CLAUDE.md'));
  assert.ok(parsedSettings.claudeMdExcludes.includes('/*/*/*/CLAUDE.md'));
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

test('S17-3 & S17-5: root and per-seat .claude/settings.json include 4 machine deny rules, root-anchored project folder deny rules, S17 hooks, and per-seat permissions', () => {
  const rootSettings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
  const requiredDeny = [
    'Bash(sudo:*)',
    'Bash(git push --force:*)',
    'Bash(git reset --hard:*)',
    'Bash(chmod 777:*)',
    'Edit(projects/**/inputs/**)',
    'Edit(//Users/**/projects/**/inputs/**)',
    'Edit(//Users/**/projects/**/references/**)',
    'Edit(//Users/**/projects/**/templates/**)',
    'Edit(operations/data/**)',
    'Edit(//Users/**/operations/data/**)',
  ];
  for (const rule of requiredDeny) {
    assert.ok(rootSettings.permissions.deny.includes(rule), `Root settings.json must include ${rule}`);
  }

  const rootCommands = rootSettings.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((h) => h.command)).join('\n');
  assert.ok(rootCommands.includes('block_ollama.py'), 'Root settings.json must register block_ollama.py');
  assert.ok(rootCommands.includes('block_ad_account_write.py'), 'Root settings.json must register block_ad_account_write.py');
  assert.ok(rootCommands.includes('block_public_publish.py'), 'Root settings.json must register block_public_publish.py');

  for (const restrictedSeat of ['paid-media', 'social-community']) {
    const seatSettingsPath = path.join(REPO_ROOT, 'departments', 'marketing', 'seats', restrictedSeat, '.claude', 'settings.json');
    const seatSettings = JSON.parse(fs.readFileSync(seatSettingsPath, 'utf8'));
    assert.ok(seatSettings.permissions.deny.includes('Read(~/.meta-token-fanpage)'));
    assert.ok(seatSettings.permissions.deny.includes('Read(~/.fb-user-token-long)'));
    assert.ok(seatSettings.permissions.deny.includes('Bash(python3 ~/.claude/skills/doc-comment-fanpage/*)'));
    assert.ok(seatSettings.permissions.deny.includes('Bash(python3 ~/.claude/skills/tra-loi-inbox-fanpage/*)'));
    assert.ok(seatSettings.permissions.deny.includes('Edit(//Users/**/projects/**/inputs/**)'));
    assert.ok(seatSettings.permissions.deny.includes('Edit(//Users/**/operations/data/**)'));
  }
});

test('S17-4: Hook 2.1 blocks all 8 PCN cases and passes counter-proof when disabled', () => {
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
    assert.ok(res.stderr.includes('[opc-harness:block_public_publish]'), `Case ${c.id} stderr must carry opc-harness prefix`);

    // Counter-proof: disabling Hook 2.1 allows the 8 cases through
    const counterRes = spawnSync('/usr/bin/python3', [hookPath], {
      input: JSON.stringify(c.payload),
      encoding: 'utf8',
      env: { ...process.env, AIBOSS_DISABLE_HOOK_2_1: '1' },
    });
    assert.equal(counterRes.status, 0, `Counter-proof: case ${c.id} must exit 0 when AIBOSS_DISABLE_HOOK_2_1=1`);
  }
});
