'use strict';

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

let spawnedChild = null;

/**
 * Probes whether the server at http://127.0.0.1:<port>/ is responding with HTTP 200.
 * @param {number} port
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<boolean>}
 */
function probeServer(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/',
        timeout: timeoutMs,
      },
      (res) => {
        // Any HTTP status between 200 and 499 indicates the server process is alive and responding
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Spawns the server process if not already running.
 * Priority:
 * 1. operations/scripts/service-start.sh (if backend service script exists)
 * 2. pnpm start -p <port> at root
 * @param {number} port
 * @param {string} repoRoot
 * @returns {import('node:child_process').ChildProcess}
 */
function spawnServer(port, repoRoot = path.resolve(__dirname, '..')) {
  if (spawnedChild && !spawnedChild.killed) {
    return spawnedChild;
  }

  const serviceScript = path.join(repoRoot, 'operations', 'scripts', 'service-start.sh');
  let cmd, args;

  if (fs.existsSync(serviceScript)) {
    cmd = 'bash';
    args = [serviceScript];
    console.log(`[AIBOSS Desktop] Spawning server via ${serviceScript} (PORT=${port})`);
  } else {
    cmd = 'pnpm';
    args = ['start', '-p', String(port)];
    console.log(`[AIBOSS Desktop] Spawning server via pnpm start -p ${port} in ${repoRoot}`);
  }

  const env = {
    ...process.env,
    PORT: String(port),
    AIBOSS_OFFICE_PORT: String(port),
  };

  spawnedChild = spawn(cmd, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    detached: false,
  });

  spawnedChild.on('exit', (code, signal) => {
    console.log(`[AIBOSS Desktop] Spawned server process exited with code ${code}, signal ${signal}`);
    spawnedChild = null;
  });

  return spawnedChild;
}

/**
 * Waits for the server to become responsive up to maxWaitMs.
 * @param {number} port
 * @param {Object} [options]
 * @param {number} [options.maxWaitMs=60000]
 * @param {number} [options.intervalMs=1000]
 * @param {string} [options.repoRoot]
 * @param {(elapsedMs: number) => void} [options.onProgress]
 * @returns {Promise<{ ok: boolean, elapsedMs: number, error?: string }>}
 */
async function ensureServerReady(port, options = {}) {
  const maxWaitMs = options.maxWaitMs || 60000;
  const intervalMs = options.intervalMs || 1000;
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');
  const onProgress = options.onProgress || (() => {});

  const startTime = Date.now();

  // Initial check
  const alreadyUp = await probeServer(port, 1500);
  if (alreadyUp) {
    return { ok: true, elapsedMs: Date.now() - startTime };
  }

  // Not up yet, attempt to spawn
  spawnServer(port, repoRoot);

  while (Date.now() - startTime < maxWaitMs) {
    const elapsed = Date.now() - startTime;
    onProgress(elapsed);

    await new Promise((r) => setTimeout(r, intervalMs));
    const isUp = await probeServer(port, 1000);
    if (isUp) {
      return { ok: true, elapsedMs: Date.now() - startTime };
    }
  }

  return {
    ok: false,
    elapsedMs: Date.now() - startTime,
    error: `Server on 127.0.0.1:${port} did not respond within ${maxWaitMs / 1000}s.`,
  };
}

/**
 * Stops any child process spawned by the desktop shell.
 */
function stopSpawnedServer() {
  if (spawnedChild && !spawnedChild.killed) {
    console.log('[AIBOSS Desktop] Stopping spawned server process...');
    try {
      spawnedChild.kill('SIGTERM');
    } catch (e) {
      // ignore
    }
    spawnedChild = null;
  }
}

module.exports = {
  probeServer,
  spawnServer,
  ensureServerReady,
  stopSpawnedServer,
};
