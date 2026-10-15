#!/usr/bin/env node

/**
 * gen-seat-files.mjs — Sinh tự động CLAUDE.md, .claude/settings.json và .mcp.json cho từng ghế
 * và cả .claude/settings.json ở gốc kho từ data/seats.json và departments/marketing/department.json.
 *
 * Mở rộng từ gen-seat-claude-md.mjs theo yêu cầu đề PHA H1 (mục H1-3 và v02), S17b (F4, mục 7) và C2-broker.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveSeatLanguageRule } from './gen-seat-claude-md.mjs';
import { generateSeatClaudeMd, buildDepartmentRosterBlock } from './gen-seat-claude-md.mjs';
import { escapeSeatSettingsGlobPath } from './seat-settings-anchor.mjs';

export const escapeGlobPath = escapeSeatSettingsGlobPath;
export { escapeSeatSettingsGlobPath, buildDepartmentRosterBlock };

export function resolveAnchorRealRoot(anchorRoot) {
  const resolvedRoot = path.resolve(anchorRoot);
  try {
    return fs.realpathSync(resolvedRoot);
  } catch {
    return resolvedRoot;
  }
}

export function buildRepoRootDenyRules(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  let realRoot = resolvedRoot;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
  } catch {}

  const rootPrefixes = Array.from(
    new Set([escapeSeatSettingsGlobPath(resolvedRoot), escapeSeatSettingsGlobPath(realRoot)])
  );

  const anchoredProjectRules = [];
  const anchoredOpsDataRules = [];
  for (const prefix of rootPrefixes) {
    anchoredProjectRules.push(
      `Edit(//${prefix}/projects/**/references/**)`,
      `Edit(//${prefix}/projects/**/templates/**)`,
      `Edit(//${prefix}/projects/**/inputs/**)`
    );
    anchoredOpsDataRules.push(`Edit(//${prefix}/operations/data/**)`);
  }

  return [
    'Bash(sudo:*)',
    'Bash(git push --force:*)',
    'Bash(git reset --hard:*)',
    'Bash(chmod 777:*)',
    'Edit(projects/**/references/**)',
    'Edit(projects/**/templates/**)',
    'Edit(projects/**/inputs/**)',
    ...anchoredProjectRules,
    'Edit(operations/data/**)',
    ...anchoredOpsDataRules,
    'Bash(rm:*)',
    'Read(./.env)',
    'Read(./.env.*)',
    'Read(~/.config/aiboss-office/**)',
    'Bash(python3 tools/inbox-reader/save_token.py *)',
    'Bash(/usr/bin/python3 tools/inbox-reader/save_token.py *)',
    'Bash(python3 tools/inbox-reader/fetch_page_messages.py *)',
    'Bash(/usr/bin/python3 tools/inbox-reader/fetch_page_messages.py *)',
  ];
}

const FORBIDDEN_MCP_ABSOLUTE_PREFIXES = ['/Users/', '/private/', '/tmp/'];

export function hasForbiddenAbsolutePathInMcpJson(rawContent) {
  if (typeof rawContent !== 'string') return true;
  for (const prefix of FORBIDDEN_MCP_ABSOLUTE_PREFIXES) {
    if (rawContent.includes(prefix)) return true;
  }
  return false;
}

export function buildMcpJson(mcpList, _anchorRoot) {
  const knownMcpServers = {
    'agent-broker': {
      type: 'stdio',
      command: 'node',
      args: ['../../../../operations/mcp/agent-broker/index.js'],
    },
  };

  const servers = {};
  const names = Array.isArray(mcpList) ? mcpList : ['agent-broker'];
  for (const name of names) {
    if (knownMcpServers[name]) {
      servers[name] = knownMcpServers[name];
    }
  }
  return { mcpServers: servers };
}

function buildSettingsJson(hooksBasePath, baseDenyRules, seatPermissions = null) {
  const extraDeny = Array.isArray(seatPermissions?.deny)
    ? seatPermissions.deny
    : Array.isArray(seatPermissions?.deny_extra)
      ? seatPermissions.deny_extra
      : [];
  const mergedDeny = Array.from(new Set([...baseDenyRules, ...extraDeny]));
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

function writeOrCheckFile(filePath, expectedContent, checkOnly, mismatchedFiles) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
  const isMcpFile = path.basename(filePath) === '.mcp.json';
  const hasForbiddenMcpAbs = isMcpFile && (existing === null || hasForbiddenAbsolutePathInMcpJson(existing));
  if (existing !== expectedContent || hasForbiddenMcpAbs) {
    mismatchedFiles.push(filePath);
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, expectedContent, 'utf-8');
      return true;
    }
  }
  return false;
}

export function generateSeatFiles({
  repoRoot = process.cwd(),
  anchorRoot = process.env.AIBOSS_REPO_ROOT || repoRoot,
  quiet = false,
  checkOnly = false,
} = {}) {
  const seatsPath = path.join(repoRoot, 'data', 'seats.json');
  const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf-8'));

  const officeConfigPath =
    process.env.AIBOSS_OFFICE_CONFIG_PATH ?? path.join(repoRoot, 'config', 'office.json');
  let rawLang = 'auto';
  if (fs.existsSync(officeConfigPath)) {
    try {
      const officeCfg = JSON.parse(fs.readFileSync(officeConfigPath, 'utf-8'));
      if (officeCfg && typeof officeCfg === 'object') {
        rawLang = officeCfg.language;
      }
    } catch {}
  }
  const langRule = resolveSeatLanguageRule(rawLang);

  // Ensure operations/data/mailbox exists on prestart / generation
  const mailboxDir = path.join(repoRoot, 'operations', 'data', 'mailbox');
  if (!checkOnly && !fs.existsSync(mailboxDir)) {
    fs.mkdirSync(mailboxDir, { recursive: true });
  }

  // Kiểm tra ghế trên đĩa: quét departments/*/seats/*
  const marketingSeatsDir = path.join(repoRoot, 'departments', 'marketing', 'seats');
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
      } else if (!quiet) {
        console.warn(`[gen-seat-files: WARN] Ghế trên đĩa không có trong data/seats.json: ${unlistedSeats.join(', ')} (chạy với --strict để dừng báo lỗi)`);
      }
    }
  }

  const mismatchedFiles = [];
  let claudeCount = 0;
  let updatedFilesCount = 0;

  // 1. Generate or check CLAUDE.md via shared generateSeatClaudeMd
  const claudeRes = generateSeatClaudeMd({ repoRoot, quiet: true, checkOnly });
  claudeCount = claudeRes.totalCount;
  updatedFilesCount += claudeRes.updatedCount;
  if (Array.isArray(claudeRes.mismatchedFiles)) {
    mismatchedFiles.push(...claudeRes.mismatchedFiles);
  }

  const baseDenyRules = buildRepoRootDenyRules(anchorRoot);
  let seatSettingsCount = 0;
  let seatMcpCount = 0;

  for (const seat of seats) {
    if (seat.department !== 'marketing') continue;

    const targetDir = path.join(repoRoot, seat.dir);
    if (!checkOnly && !fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 2. Generate .claude/settings.json per seat (merging seat.permissions)
    const claudeDir = path.join(targetDir, '.claude');
    const seatHooksPath = '$CLAUDE_PROJECT_DIR/../../../../operations/hooks';
    const seatSettings = buildSettingsJson(seatHooksPath, baseDenyRules, seat.permissions);
    const seatSettingsPath = path.join(claudeDir, 'settings.json');
    if (writeOrCheckFile(seatSettingsPath, JSON.stringify(seatSettings, null, 2) + '\n', checkOnly, mismatchedFiles)) {
      updatedFilesCount++;
    }
    seatSettingsCount++;

    // 3. Generate .mcp.json per seat (anchored to real anchorRoot)
    const mcpList = Array.isArray(seat.mcp)
      ? seat.mcp
      : Array.isArray(seat.permissions?.mcp_servers)
        ? seat.permissions.mcp_servers
        : ['agent-broker'];
    const mcpConfig = buildMcpJson(mcpList, anchorRoot);
    const mcpPath = path.join(targetDir, '.mcp.json');
    if (writeOrCheckFile(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', checkOnly, mismatchedFiles)) {
      updatedFilesCount++;
    }
    seatMcpCount++;
  }

  // 4. Generate .claude/settings.json at repo root
  const rootClaudeDir = path.join(repoRoot, '.claude');
  const rootHooksPath = '$CLAUDE_PROJECT_DIR/operations/hooks';
  const rootSettings = buildSettingsJson(rootHooksPath, baseDenyRules, null);
  const rootSettingsPath = path.join(rootClaudeDir, 'settings.json');
  if (writeOrCheckFile(rootSettingsPath, JSON.stringify(rootSettings, null, 2) + '\n', checkOnly, mismatchedFiles)) {
    updatedFilesCount++;
  }

  if (!quiet) {
    if (checkOnly) {
      if (mismatchedFiles.length === 0) {
        console.log(`[gen-seat-files: CHECK] OK — all seat & root settings match anchor root ${path.resolve(anchorRoot)}`);
      } else {
        console.error(`[gen-seat-files: CHECK] MISMATCH (${mismatchedFiles.length} file(s) out of sync with ${path.resolve(anchorRoot)}):`);
        for (const f of mismatchedFiles) console.error(`  - ${f}`);
      }
    } else {
      console.log(`[gen-seat-files] Checked ${claudeCount} CLAUDE.md, ${seatSettingsCount} seat settings, ${seatMcpCount} .mcp.json, 1 root settings (${updatedFilesCount} updated)`);
    }
  }

  return {
    claudeCount,
    seatSettingsCount,
    seatMcpCount,
    rootSettingsPath,
    updatedFilesCount,
    updatedCount: updatedFilesCount,
    mismatchedFiles,
    driftedCount: mismatchedFiles.length,
    langRule,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
let invokedRealPath = invokedPath;
try {
  if (invokedPath) invokedRealPath = fs.realpathSync(invokedPath);
} catch {}

if (
  invokedPath &&
  (import.meta.url === pathToFileURL(invokedPath).href ||
    import.meta.url === pathToFileURL(invokedRealPath).href)
) {
  const checkOnly = process.argv.includes('--check');
  const quiet = process.argv.includes('--quiet');
  const res = generateSeatFiles({ checkOnly, quiet });
  if (checkOnly && res.mismatchedFiles.length > 0) {
    process.exit(1);
  }
}
