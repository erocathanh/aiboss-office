#!/usr/bin/env node

/**
 * Generates CLAUDE.md for each marketing seat in its seat directory
 * using data/seats.json and departments/marketing/department.json.
 * Idempotent: only writes a seat's CLAUDE.md when its content has changed.
 */

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

export function generateSeatClaudeMd({
  repoRoot = process.cwd(),
  configPath,
  quiet = false,
} = {}) {
  const seatsPath = path.join(repoRoot, 'data', 'seats.json');
  const deptPath = path.join(repoRoot, 'departments', 'marketing', 'department.json');

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

  let updatedCount = 0;
  let totalCount = 0;

  for (const seat of seats) {
    if (seat.department !== 'marketing') continue;
    totalCount++;

    const targetDir = path.join(repoRoot, seat.dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const content = `# ${seat.name} — seat \`${seat.seat_id}\` of the Marketing department, AIBOSS Office

You are the **${seat.name}** seat of AIBOSS Office (seat id \`${seat.seat_id}\`, department \`marketing\`). Your role: ${seat.role}

@SOUL.md

Act strictly within \`SOUL.md\` above: identity, mission, duties with their "done when" tests, boundaries, daily rhythm, quality bar and escalation.

Rules that never change: the human owner decides — these gates always wait for the owner's yes: ${gatesStr}; never act through a gate alone, prepare the draft and ask · ${langRule} · when asked who you are or what you can do, answer directly from SOUL.md already loaded in your context without calling Bash or Read: role, duties, what you never do alone, what you need from the owner to start · measure before you claim done.
`;

    const claudePath = path.join(targetDir, 'CLAUDE.md');
    const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf-8') : null;
    if (existing !== content) {
      fs.writeFileSync(claudePath, content, 'utf-8');
      updatedCount++;
      if (!quiet) console.log(`Updated ${claudePath}`);
    }
  }

  if (!quiet) {
    console.log(
      `Checked ${totalCount} marketing seat CLAUDE.md files (${updatedCount} updated).`
    );
  }

  return { totalCount, updatedCount, langRule };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateSeatClaudeMd();
}

