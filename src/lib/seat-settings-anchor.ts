/**
 * Shared glob-escaping helper and constants for seat & repo-root `.claude/settings.json`
 * anchored deny rules (S17d F14).
 *
 * Imported by both the generator (`operations/scripts/gen-seat-files.mjs`) and the
 * spawn-time verifier (`src/lib/chay-agent.ts`) so that paths containing glob
 * metacharacters (`*`, `?`, `[`, `]`, `{`, `}`) are escaped identically.
 */

export function escapeSeatSettingsGlobPath(rawPath: string): string {
  return String(rawPath)
    .replace(/([*?[\]{}])/g, '\\$1')
    .replace(/^\/+/, '');
}

export const REQUIRED_ANCHORED_DENY_SUFFIXES = [
  'projects/**/references/**',
  'projects/**/templates/**',
  'projects/**/inputs/**',
  'operations/data/**',
] as const;
