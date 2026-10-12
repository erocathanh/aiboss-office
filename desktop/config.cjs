'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Parses CLI arguments for port overrides (--port <number> or -p <number>)
 * @param {string[]} argv
 * @returns {number|null}
 */
function parseCliPort(argv = process.argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const val = parseInt(argv[i + 1], 10);
      if (!Number.isNaN(val) && val > 0 && val < 65536) {
        return val;
      }
    }
    if (argv[i].startsWith('--port=')) {
      const val = parseInt(argv[i].split('=')[1], 10);
      if (!Number.isNaN(val) && val > 0 && val < 65536) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Reads config/office.json service.port if available.
 * @param {string} repoRoot
 * @returns {number|null}
 */
function readConfigPort(repoRoot = path.resolve(__dirname, '..')) {
  try {
    const configPath = path.join(repoRoot, 'config', 'office.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const data = JSON.parse(content);
      if (data && data.service && typeof data.service.port === 'number') {
        return data.service.port;
      }
    }
  } catch (err) {
    // Fall back quietly
  }
  return null;
}

/**
 * Resolves the target port following priority:
 * 1. CLI arguments (--port / -p)
 * 2. Environment variable AIBOSS_OFFICE_PORT or PORT
 * 3. config/office.json -> service.port
 * 4. Default fallback: 4330
 * @param {Object} [options]
 * @param {string[]} [options.argv]
 * @param {Object} [options.env]
 * @param {string} [options.repoRoot]
 * @returns {number}
 */
function resolvePort(options = {}) {
  const argv = options.argv || process.argv;
  const env = options.env || process.env;
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');

  const cliPort = parseCliPort(argv);
  if (cliPort) return cliPort;

  const envPortStr = env.AIBOSS_OFFICE_PORT || env.PORT;
  if (envPortStr) {
    const parsed = parseInt(envPortStr, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }

  const configPort = readConfigPort(repoRoot);
  if (configPort) return configPort;

  return 4330;
}

module.exports = {
  parseCliPort,
  readConfigPort,
  resolvePort,
};
