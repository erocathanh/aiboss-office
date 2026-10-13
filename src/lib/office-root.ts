/**
 * office-root.ts — Algorithm to find AIBOSS Office workspace root.
 * Matches operations/hooks/office_root.py.
 *
 * Algorithm:
 * 1. Start from startDir (defaults to process.env.CLAUDE_PROJECT_DIR or process.cwd()).
 * 2. Walk up at most 8 parent directories to find config/office.json.
 * 3. Fall back to process.env.AIBOSS_OFFICE_ROOT.
 * 4. Throw error if root cannot be located.
 */

import path from 'node:path';
import fs from 'node:fs';

export function findOfficeRoot(startDir?: string): string {
  const start = startDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let current = path.resolve(start);

  for (let i = 0; i <= 8; i++) {
    const configPath = path.join(current, 'config', 'office.json');
    if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  const envRoot = process.env.AIBOSS_OFFICE_ROOT;
  if (envRoot) {
    const configPath = path.join(envRoot, 'config', 'office.json');
    if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
      return path.resolve(envRoot);
    }
  }

  throw new Error(
    `[office-root] Could not locate AIBOSS Office root (missing config/office.json within 8 parent directories of '${start}' or via AIBOSS_OFFICE_ROOT)`
  );
}
