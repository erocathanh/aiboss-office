#!/usr/bin/env node

/**
 * gen-seat-files.mjs — Sinh tự động CLAUDE.md và .claude/settings.json cho từng ghế
 * và cả .claude/settings.json ở gốc kho từ data/seats.json và departments/marketing/department.json.
 *
 * Mở rộng từ gen-seat-claude-md.mjs theo yêu cầu đề PHA H1 (mục H1-3 và v02).
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveSeatLanguageRule } from './gen-seat-claude-md.mjs';

const REPO_ROOT = process.cwd();
const seatsPath = path.join(REPO_ROOT, 'data', 'seats.json');
const deptPath = path.join(REPO_ROOT, 'departments', 'marketing', 'department.json');

const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf-8'));
const dept = JSON.parse(fs.readFileSync(deptPath, 'utf-8'));

// Kiểm tra ghế trên đĩa: quét departments/*/seats/*
const marketingSeatsDir = path.join(REPO_ROOT, 'departments', 'marketing', 'seats');
if (fs.existsSync(marketingSeatsDir)) {
  const diskSeats = fs.readdirSync(marketingSeatsDir).filter((name) => {
    return fs.statSync(path.join(marketingSeatsDir, name)).isDirectory();
  });
  const knownSeatIds = new Set(seats.map((s) => s.seat_id));
  const unlistedSeats = diskSeats.filter((s) => !knownSeatIds.has(s));

  if (unlistedSeats.length > 0) {
    if (process.argv.includes('--strict') || process.env.STRICT_SEATS === '1') {
      console.error(`[gen-seat-files: ERROR] Ghế trên đĩa không có trong data/seats.json: ${unlistedSeats.join(', ')}`);
      process.exit(1);
    } else {
      console.warn(`[gen-seat-files: WARN] Ghế trên đĩa không có trong data/seats.json: ${unlistedSeats.join(', ')} (chạy với --strict để dừng báo lỗi)`);
    }
  }
}

const gatesList = dept.gates || [];
const gatesStr = gatesList.map((g) => `\`${g}\``).join(', ');

const officeConfigPath = path.join(REPO_ROOT, 'config', 'office.json');
let rawOfficeLang = 'auto';
if (fs.existsSync(officeConfigPath)) {
  try {
    const officeCfg = JSON.parse(fs.readFileSync(officeConfigPath, 'utf-8'));
    if (officeCfg && typeof officeCfg === 'object') rawOfficeLang = officeCfg.language;
  } catch {}
}

const langRule = resolveSeatLanguageRule(rawOfficeLang);

const DENY_RULES = [
  'Bash(sudo:*)',
  'Bash(git push --force:*)',
  'Bash(git reset --hard:*)',
  'Bash(chmod 777:*)',
  'Edit(projects/**/references/**)',
  'Edit(projects/**/templates/**)',
  'Edit(projects/**/inputs/**)',
  'Edit(//Users/**/projects/**/references/**)',
  'Edit(//Users/**/projects/**/templates/**)',
  'Edit(//Users/**/projects/**/inputs/**)',
  'Edit(//home/**/projects/**/references/**)',
  'Edit(//home/**/projects/**/templates/**)',
  'Edit(//home/**/projects/**/inputs/**)',
  'Edit(operations/data/**)',
  'Edit(//Users/**/operations/data/**)',
  'Edit(//home/**/operations/data/**)',
  'Bash(rm:*)',
  'Read(./.env)',
  'Read(./.env.*)',
  'Read(~/.config/aiboss-office/**)',
  'Bash(python3 tools/inbox-reader/save_token.py *)',
  'Bash(/usr/bin/python3 tools/inbox-reader/save_token.py *)',
  'Bash(python3 tools/inbox-reader/fetch_page_messages.py *)',
  'Bash(/usr/bin/python3 tools/inbox-reader/fetch_page_messages.py *)',
];

const KNOWN_MCP_SERVERS = {
  'agent-broker': {
    type: 'stdio',
    command: 'sh',
    args: [
      '-c',
      'exec node "${AIBOSS_AGENT_BROKER_MCP_SCRIPT:-$HOME/Development/agent-broker-mcp/index.js}"',
    ],
  },
};

function buildMcpJson(mcpList) {
  const servers = {};
  const names = Array.isArray(mcpList) ? mcpList : ['agent-broker'];
  for (const name of names) {
    if (KNOWN_MCP_SERVERS[name]) {
      servers[name] = KNOWN_MCP_SERVERS[name];
    }
  }
  return { mcpServers: servers };
}

function buildSettingsJson(hooksBasePath, seatPermissions = null) {
  const extraDeny = Array.isArray(seatPermissions?.deny)
    ? seatPermissions.deny
    : Array.isArray(seatPermissions?.deny_extra)
      ? seatPermissions.deny_extra
      : [];
  const mergedDeny = Array.from(new Set([...DENY_RULES, ...extraDeny]));
  const allowList = Array.isArray(seatPermissions?.allow) ? seatPermissions.allow : [];

  const permissions = {
    ...(allowList.length > 0 ? { allow: allowList } : {}),
    deny: mergedDeny,
  };

  return {
    _comment_pcn_v3: 'PCN seat frame v3 hooks merge placeholder (reserved until 17/10)',
    permissions,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_mass_delete.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_secret_leak.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Read|Grep|Glob',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_external_scan.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/protect_final_outputs.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/guard_customer_pii.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|mcp__.*',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/guard_bulk_send.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Edit|Write|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/lock_raw_inputs.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_ollama.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|mcp__.*',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_ad_account_write.py" || exit 2`,
            },
          ],
        },
        {
          matcher: 'Bash|Read|Edit|Write|MultiEdit|NotebookEdit|Grep|Glob',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/block_public_publish.py" || exit 2`,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: `/usr/bin/python3 "${hooksBasePath}/remind_cross_check.py"`,
            },
          ],
        },
      ],
    },
  };
}

let claudeCount = 0;
let seatSettingsCount = 0;
let seatMcpCount = 0;

for (const seat of seats) {
  if (seat.department !== 'marketing') continue;

  const targetDir = path.join(REPO_ROOT, seat.dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Generate CLAUDE.md
  const claudeContent = `# ${seat.name} — seat \`${seat.seat_id}\` of the Marketing department, AIBOSS Office

You are the **${seat.name}** seat of AIBOSS Office (seat id \`${seat.seat_id}\`, department \`marketing\`). Your role: ${seat.role}

Read \`SOUL.md\` in this folder first and act strictly within it: identity, mission, duties with their "done when" tests, boundaries, daily rhythm, quality bar and escalation.

Rules that never change: the human owner decides — these gates always wait for the owner's yes: ${gatesStr}; never act through a gate alone, prepare the draft and ask · ${langRule} · when asked who you are or what you can do, answer from SOUL.md: role, duties, what you never do alone, what you need from the owner to start · measure before you claim done.
`;
  const claudePath = path.join(targetDir, 'CLAUDE.md');
  fs.writeFileSync(claudePath, claudeContent, 'utf-8');
  claudeCount++;

  // 2. Generate .claude/settings.json per seat (merging seat.permissions)
  const claudeDir = path.join(targetDir, '.claude');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  const seatHooksPath = '$CLAUDE_PROJECT_DIR/../../../../operations/hooks';
  const seatSettings = buildSettingsJson(seatHooksPath, seat.permissions);
  const seatSettingsPath = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(seatSettingsPath, JSON.stringify(seatSettings, null, 2) + '\n', 'utf-8');
  seatSettingsCount++;

  // 3. Generate .mcp.json per seat
  const mcpList = Array.isArray(seat.mcp)
    ? seat.mcp
    : Array.isArray(seat.permissions?.mcp_servers)
      ? seat.permissions.mcp_servers
      : ['agent-broker'];
  const mcpConfig = buildMcpJson(mcpList);
  const mcpPath = path.join(targetDir, '.mcp.json');
  fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf-8');
  seatMcpCount++;
}

// 4. Generate .claude/settings.json at repo root
const rootClaudeDir = path.join(REPO_ROOT, '.claude');
if (!fs.existsSync(rootClaudeDir)) {
  fs.mkdirSync(rootClaudeDir, { recursive: true });
}
const rootHooksPath = '$CLAUDE_PROJECT_DIR/operations/hooks';
const rootSettings = buildSettingsJson(rootHooksPath, null);
const rootSettingsPath = path.join(rootClaudeDir, 'settings.json');
fs.writeFileSync(rootSettingsPath, JSON.stringify(rootSettings, null, 2) + '\n', 'utf-8');

console.log(`[gen-seat-files] Generated ${claudeCount} CLAUDE.md files`);
console.log(`[gen-seat-files] Generated ${seatSettingsCount} seat .claude/settings.json files`);
console.log(`[gen-seat-files] Generated ${seatMcpCount} seat .mcp.json files`);
console.log(`[gen-seat-files] Generated 1 root .claude/settings.json file: ${rootSettingsPath}`);

