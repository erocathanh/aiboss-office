/**
 * Shared pure-JavaScript glob-escaping helper and constants for seat & repo-root
 * `.claude/settings.json` anchored deny rules (S17d F14 / S17e F21).
 *
 * Pure ESM JavaScript (no TypeScript syntax) so `node operations/scripts/gen-seat-files.mjs`
 * runs across the entire declared Node >=22.0.0 range (including Node 22.0–22.17 where
 * `--experimental-strip-types` is off by default).
 */

export function escapeSeatSettingsGlobPath(rawPath) {
  return String(rawPath)
    .replace(/([*?[\]{}])/g, '\\$1')
    .replace(/^\/+/, '');
}

export const REQUIRED_ANCHORED_DENY_SUFFIXES = Object.freeze([
  'projects/**/references/**',
  'projects/**/templates/**',
  'projects/**/inputs/**',
  'operations/data/**',
]);
