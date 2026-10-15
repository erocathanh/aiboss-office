#!/usr/bin/env node

/**
 * Generates CLAUDE.md for each marketing seat in its seat directory
 * using data/seats.json and departments/marketing/department.json.
 * Idempotent: only writes a seat's CLAUDE.md when its content has changed.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveSeatLanguageRule(rawLanguage) {
  const normalized = typeof rawLanguage === 'string' ? rawLanguage.trim().toLowerCase() : 'auto';
  if (normalized === 'vi') {
    return 'answer in Vietnamese, keep code and identifiers in English';
  }
  if (normalized === 'en') {
    return 'answer in English';
  }
  return 'answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English';
}

export function buildDepartmentRosterBlock(dept, seats) {
  const marketingSeats = (Array.isArray(seats) ? seats : []).filter(
    (s) => s && s.department === 'marketing'
  );
  const deptGates = Array.isArray(dept?.gates) ? dept.gates : [];
  const leadId = typeof dept?.lead === 'string' && dept.lead ? dept.lead : 'marketing-lead';
  const reviewerSeat =
    marketingSeats.find((s) => s.seat_id === dept?.reviewer) ||
    marketingSeats.find((s) => s.seat_id === 'reviewer');
  const reviewerId = reviewerSeat ? reviewerSeat.seat_id : 'reviewer';

  const seatLines = marketingSeats.map((s) => {
    const seatGates = Array.isArray(s.gates) && s.gates.length > 0 ? s.gates : deptGates;
    const gatesDisplay = seatGates.map((g) => `\`${g}\``).join(', ');
    const folder = (s.dir || `departments/marketing/seats/${s.seat_id}`).replace(/\/+$/, '') + '/';
    return `- \`${s.seat_id}\` · **${s.name}** · role: ${s.role} · gates: ${gatesDisplay} · folder \`${folder}\``;
  });

  const rosterBody = [
    '## Department roster',
    `lead: \`${leadId}\``,
    `reviewer: \`${reviewerId}\``,
    ...seatLines,
    'Handoff to another seat: append a timestamped note to the project `CHANNEL.md` (`projects/<PROJECT>/CHANNEL.md`) and send an MCP `agent-broker` message via `gui_tin` to `<id>` (`nguoi_gui`, `nguoi_nhan`, `tieu_de`, `noi_dung`).',
  ].join('\n');

  const rosterMd5 = crypto.createHash('md5').update(rosterBody, 'utf-8').digest('hex');
  return {
    rosterBody,
    rosterMd5,
    rosterBlock: `<!-- BEGIN department-roster md5:${rosterMd5} -->\n${rosterBody}\n<!-- END department-roster -->`,
  };
}

export function generateSeatClaudeMd({
  repoRoot = process.cwd(),
  configPath,
  quiet = false,
  checkOnly = false,
} = {}) {
  const seatsPath = path.join(repoRoot, 'data', 'seats.json');
  const deptCandidate = path.join(repoRoot, 'departments', 'marketing', 'department.json');
  const deptPath = fs.existsSync(deptCandidate)
    ? deptCandidate
    : path.join(process.cwd(), 'departments', 'marketing', 'department.json');

  const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf-8'));
  const dept = JSON.parse(fs.readFileSync(deptPath, 'utf-8'));

  const gatesList = dept.gates || [];
  const gatesStr = gatesList.map((g) => `\`${g}\``).join(', ');

  const officeConfigPath =
    configPath ??
    process.env.AIBOSS_OFFICE_CONFIG_PATH ??
    path.join(repoRoot, 'config', 'office.json');

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

  const workingRulesCandidate = path.join(repoRoot, 'packs', 'core', 'WORKING-RULES.md');
  const workingRulesPath = fs.existsSync(workingRulesCandidate)
    ? workingRulesCandidate
    : path.join(process.cwd(), 'packs', 'core', 'WORKING-RULES.md');
  const workingRulesRaw = fs.readFileSync(workingRulesPath, 'utf-8');
  const workingRulesMd5 = crypto.createHash('md5').update(workingRulesRaw, 'utf-8').digest('hex');
  const workingRulesBody = workingRulesRaw.replace(/\n+$/, '');

  const { rosterBlock, rosterMd5 } = buildDepartmentRosterBlock(dept, seats);

  let updatedCount = 0;
  let totalCount = 0;
  const mismatchedFiles = [];

  for (const seat of seats) {
    if (seat.department !== 'marketing') continue;
    totalCount++;

    const targetDir = path.join(repoRoot, seat.dir);
    if (!checkOnly && !fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const content = `# ${seat.name} — seat \`${seat.seat_id}\` of the Marketing department, AIBOSS Office
<!-- BEGIN packs/core/WORKING-RULES.md md5:${workingRulesMd5} -->
${workingRulesBody}
<!-- END packs/core/WORKING-RULES.md -->

You are the **${seat.name}** seat of AIBOSS Office (seat id \`${seat.seat_id}\`, department \`marketing\`). Your role: ${seat.role}

@SOUL.md

Act strictly within \`SOUL.md\` above: identity, mission, duties with their "done when" tests, boundaries, daily rhythm, quality bar and escalation.

Rules that never change: the human owner decides — these gates always wait for the owner's yes: ${gatesStr}; never act through a gate alone, prepare the draft and ask · ${langRule} · when asked who you are, what you can do, or how seats in this department differ, answer directly from SOUL.md and the Department roster already loaded in your context without calling Bash or Read: role, duties, what you never do alone, what you need from the owner to start · measure before you claim done.

${rosterBlock}
`;

    const claudePath = path.join(targetDir, 'CLAUDE.md');
    const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf-8') : null;
    if (existing !== content) {
      mismatchedFiles.push(claudePath);
      if (!checkOnly) {
        fs.writeFileSync(claudePath, content, 'utf-8');
        updatedCount++;
        if (!quiet) console.log(`Updated ${claudePath}`);
      }
    }
  }

  if (!quiet && !checkOnly) {
    console.log(
      `Checked ${totalCount} marketing seat CLAUDE.md files (${updatedCount} updated).`
    );
  }

  return { totalCount, updatedCount, mismatchedFiles, langRule, rosterMd5 };
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
  const res = generateSeatClaudeMd({ checkOnly });
  if (checkOnly && res.mismatchedFiles.length > 0) {
    process.exit(1);
  }
}
