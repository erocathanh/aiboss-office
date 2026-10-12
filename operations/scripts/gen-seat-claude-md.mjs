#!/usr/bin/env node

/**
 * Generates CLAUDE.md for each marketing seat in its seat directory
 * using data/seats.json and departments/marketing/department.json.
 */

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const seatsPath = path.join(REPO_ROOT, 'data', 'seats.json');
const deptPath = path.join(REPO_ROOT, 'departments', 'marketing', 'department.json');

const seats = JSON.parse(fs.readFileSync(seatsPath, 'utf-8'));
const dept = JSON.parse(fs.readFileSync(deptPath, 'utf-8'));

const gatesList = dept.gates || [];
const gatesStr = gatesList.map((g) => `\`${g}\``).join(', ');

let createdCount = 0;

for (const seat of seats) {
  if (seat.department !== 'marketing') continue;

  const targetDir = path.join(REPO_ROOT, seat.dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const content = `# ${seat.name} — seat \`${seat.seat_id}\` of the Marketing department, AIBOSS Office

You are the **${seat.name}** seat of AIBOSS Office (seat id \`${seat.seat_id}\`, department \`marketing\`). Your role: ${seat.role}

Read \`SOUL.md\` in this folder first and act strictly within it: identity, mission, duties with their "done when" tests, boundaries, daily rhythm, quality bar and escalation.

Rules that never change: the human owner decides — these gates always wait for the owner's yes: ${gatesStr}; never act through a gate alone, prepare the draft and ask · answer in the language the owner writes in (Vietnamese or English), keep code and identifiers in English · when asked who you are or what you can do, answer from SOUL.md: role, duties, what you never do alone, what you need from the owner to start · measure before you claim done.
`;

  const claudePath = path.join(targetDir, 'CLAUDE.md');
  fs.writeFileSync(claudePath, content, 'utf-8');
  console.log(`Generated ${claudePath}`);
  createdCount++;
}

console.log(`Successfully generated ${createdCount} CLAUDE.md files.`);
