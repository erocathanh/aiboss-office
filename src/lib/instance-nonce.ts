import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const IPV4_LOOPBACK_HOST = '127.0.0.1';
export const IPV6_LOOPBACK_HOST = '::1';

export type LoopbackBindHost = typeof IPV4_LOOPBACK_HOST | typeof IPV6_LOOPBACK_HOST;

export interface InstanceNonceRecord {
  host: LoopbackBindHost;
  port: number;
  nonce: string;
  startedAt: string;
}

interface ActiveServerHandle {
  listening?: boolean;
  address?: () => { address?: string; family?: string; port?: number } | string | null;
  closeIdleConnections?: () => void;
}

export interface InstanceNonceEntry extends InstanceNonceRecord {
  filePath: string;
  ino: number;
  dev: number;
  handle?: ActiveServerHandle | null;
  isTestSeam?: boolean;
}

export interface InitInstanceNonceOptions {
  host?: string;
  port?: number;
  configDir?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

interface GlobalNonceState {
  nonce: string | null;
  startedAt: string | null;
  attemptedTargets: Map<string, InstanceNonceEntry | null>;
  initializedTargets: Map<string, InstanceNonceEntry>;
  activeEntry: InstanceNonceEntry | null;
  cleanupRegistered: boolean;
  shuttingDown: boolean;
  startupScheduled: boolean;
  startupSettled: boolean;
  startupTimer: ReturnType<typeof setInterval> | null;
  nonLoopbackLogged: boolean;
  ambiguousLogged: boolean;
  runtimeMissingLogged: boolean;
}

const GLOBAL_KEY = '__aibossInstanceNonceStateV4';

function getGlobalState(): GlobalNonceState {
  const g = globalThis as unknown as Record<string, GlobalNonceState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      nonce: null,
      startedAt: null,
      attemptedTargets: new Map<string, InstanceNonceEntry | null>(),
      initializedTargets: new Map<string, InstanceNonceEntry>(),
      activeEntry: null,
      cleanupRegistered: false,
      shuttingDown: false,
      startupScheduled: false,
      startupSettled: false,
      startupTimer: null,
      nonLoopbackLogged: false,
      ambiguousLogged: false,
      runtimeMissingLogged: false,
    };
  }
  return g[GLOBAL_KEY]!;
}

function isTestListenerSeamEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' && env.AIBOSS_NONCE_TEST_LISTENER === '1';
}

/**
 * Classify a bind host string into its exact numeric loopback family.
 * Does NOT merge IPv6 loopback (::1) or hostname aliases into 127.0.0.1 (F46).
 * Returns null for wildcard (0.0.0.0, ::) or non-loopback addresses.
 */
export function classifyLoopbackBindHost(rawHost: string | null | undefined): LoopbackBindHost | null {
  const trimmed = String(rawHost ?? '').trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed === IPV4_LOOPBACK_HOST || trimmed === '::ffff:127.0.0.1') {
    return IPV4_LOOPBACK_HOST;
  }
  if (trimmed === IPV6_LOOPBACK_HOST || trimmed === '[::1]') {
    return IPV6_LOOPBACK_HOST;
  }
  return null;
}

export function getInstanceConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const envDir = env.AIBOSS_CONFIG_DIR;
  if (typeof envDir === 'string' && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  return path.join(os.homedir(), '.config', 'aiboss-office');
}

function parseCliPort(argv: string[] = process.argv): number | null {
  let found: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const val = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isInteger(val) && val > 0 && val <= 65535) {
        found = val;
      }
    }
    if (typeof argv[i] === 'string' && argv[i].startsWith('--port=')) {
      const val = Number.parseInt(argv[i].split('=')[1] || '', 10);
      if (Number.isInteger(val) && val > 0 && val <= 65535) {
        found = val;
      }
    }
  }
  return found;
}

function parseCliHost(argv: string[] = process.argv): string | null {
  let found: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--hostname' || argv[i] === '-H') && typeof argv[i + 1] === 'string') {
      const val = argv[i + 1].trim();
      if (val.length > 0) {
        found = val;
      }
    }
    if (typeof argv[i] === 'string' && argv[i].startsWith('--hostname=')) {
      const val = argv[i].slice('--hostname='.length).trim();
      if (val.length > 0) {
        found = val;
      }
    }
  }
  return found;
}

type SocketInspectionResult =
  | {
      status: 'verified';
      handle: ActiveServerHandle;
      address: string;
      port: number;
    }
  | { status: 'none' }
  | { status: 'ambiguous'; count: number }
  | { status: 'inspection_error' };

/**
 * Inspect active libuv handles in the current process for listening TCP/HTTP servers
 * on `targetPort` (F50).
 * - Returns 'verified' ONLY when strictly ONE active listening server handle is bound to `targetPort`.
 * - Returns 'ambiguous' when >= 2 handles are listening on `targetPort` (e.g., IPv4 + IPv6).
 * - Returns 'none' when 0 handles are listening on `targetPort` (or handle is not listening yet).
 * - Returns 'inspection_error' if `_getActiveHandles` is unavailable or throws.
 */
function inspectListeningSocketForPort(targetPort: number): SocketInspectionResult {
  if (!Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) {
    return { status: 'none' };
  }
  let rawHandles: unknown;
  try {
    const getHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
    if (typeof getHandles !== 'function') {
      return { status: 'inspection_error' };
    }
    rawHandles = getHandles.call(process);
    if (!Array.isArray(rawHandles)) {
      return { status: 'inspection_error' };
    }
  } catch {
    return { status: 'inspection_error' };
  }

  const seen = new Set<object>();
  const matches: Array<{
    handle: ActiveServerHandle;
    address: string;
    port: number;
  }> = [];

  try {
    for (const h of rawHandles) {
      if (!h || typeof h !== 'object') continue;
      if (seen.has(h)) continue;
      seen.add(h);

      const srv = h as ActiveServerHandle;
      if (srv.listening !== true || typeof srv.address !== 'function') {
        continue;
      }
      const addr = srv.address();
      if (!addr || typeof addr !== 'object') {
        continue;
      }
      if (typeof addr.address !== 'string' || typeof addr.port !== 'number') {
        continue;
      }
      if (addr.port === targetPort) {
        matches.push({
          handle: srv,
          address: addr.address,
          port: addr.port,
        });
      }
    }
  } catch {
    return { status: 'inspection_error' };
  }

  if (matches.length === 0) {
    return { status: 'none' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', count: matches.length };
  }
  return {
    status: 'verified',
    handle: matches[0].handle,
    address: matches[0].address,
    port: matches[0].port,
  };
}

function closeAllListeningIdleConnections(): void {
  try {
    const getHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
    if (typeof getHandles !== 'function') return;
    const handles = getHandles.call(process);
    if (!Array.isArray(handles)) return;
    for (const h of handles) {
      if (!h || typeof h !== 'object') continue;
      const srv = h as ActiveServerHandle;
      if (srv.listening === true && typeof srv.closeIdleConnections === 'function') {
        try {
          srv.closeIdleConnections();
        } catch {
          // Ignore closeIdleConnections error
        }
      }
    }
  } catch {
    // Ignore handle inspection errors during shutdown
  }
}

function resolveExplicitConfiguredPort(options?: InitInstanceNonceOptions): number | null {
  const argv = options?.argv ?? process.argv;
  const env = options?.env ?? process.env;
  const cliPort = parseCliPort(argv);
  if (cliPort !== null) {
    return cliPort;
  }
  const envPort = Number.parseInt(env.AIBOSS_OFFICE_PORT || env.PORT || '', 10);
  if (Number.isInteger(envPort) && envPort > 0 && envPort <= 65535) {
    return envPort;
  }
  return null;
}

export function resolveConfiguredServerPort(options?: InitInstanceNonceOptions): number {
  if (
    typeof options?.port === 'number' &&
    Number.isInteger(options.port) &&
    options.port > 0 &&
    options.port <= 65535
  ) {
    return options.port;
  }
  const explicitPort = resolveExplicitConfiguredPort(options);
  if (explicitPort !== null) {
    return explicitPort;
  }
  try {
    const cfgPath = path.join(process.cwd(), 'config', 'office.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const cfgPort = Number(raw?.service?.port ?? raw?.server?.port);
    if (Number.isInteger(cfgPort) && cfgPort > 0 && cfgPort <= 65535) {
      return cfgPort;
    }
  } catch {
    // Fallback to default port 4330
  }
  return 4330;
}

/**
 * Resolve any explicitly configured server host from CLI flags (--hostname / -H)
 * or environment variables (AIBOSS_OFFICE_HOST, HOSTNAME).
 * Used strictly for cross-checking against a verified listening socket (F50).
 * Never returns a default '127.0.0.1' fallback and never replaces socket verification.
 */
export function resolveConfiguredServerHost(
  _port?: number,
  options?: InitInstanceNonceOptions,
): string | null {
  const argv = options?.argv ?? process.argv;
  const env = options?.env ?? process.env;
  if (isTestListenerSeamEnabled(env) && typeof options?.host === 'string' && options.host.trim().length > 0) {
    return options.host.trim();
  }
  const cliHost = parseCliHost(argv);
  if (cliHost !== null) {
    return cliHost;
  }
  if (typeof env.AIBOSS_OFFICE_HOST === 'string' && env.AIBOSS_OFFICE_HOST.trim().length > 0) {
    return env.AIBOSS_OFFICE_HOST.trim();
  }
  if (
    typeof env.HOSTNAME === 'string' &&
    env.HOSTNAME.trim().length > 0 &&
    env.HOSTNAME.trim() !== os.hostname()
  ) {
    return env.HOSTNAME.trim();
  }
  return null;
}

export function getInstanceNonceFilePath(
  port: number = resolveConfiguredServerPort(),
  configDir: string = getInstanceConfigDir(),
): string {
  return path.join(configDir, `instance-${port}.json`);
}

export function cleanupInstanceNonceFiles(): void {
  const state = getGlobalState();
  state.shuttingDown = true;
  if (state.startupTimer) {
    clearInterval(state.startupTimer);
    state.startupTimer = null;
  }
  for (const [key, entry] of state.initializedTargets.entries()) {
    let fd: number | null = null;
    try {
      fd = fs.openSync(entry.filePath, fs.constants.O_RDONLY);
      const openStat = fs.fstatSync(fd);
      if (openStat.ino === entry.ino && openStat.dev === entry.dev) {
        const raw = fs.readFileSync(fd, 'utf8');
        const current = JSON.parse(raw);
        if (current && current.nonce === entry.nonce) {
          const pathStat = fs.lstatSync(entry.filePath);
          if (pathStat.ino === openStat.ino && pathStat.dev === openStat.dev) {
            fs.unlinkSync(entry.filePath);
          }
        }
      }
    } catch {
      // Best-effort cleanup on shutdown
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // Ignore close error
        }
      }
    }
    state.initializedTargets.delete(key);
  }
  state.activeEntry = null;
}

function registerShutdownCleanupOnce(): void {
  const state = getGlobalState();
  if (state.cleanupRegistered) {
    return;
  }
  state.cleanupRegistered = true;

  process.on('beforeExit', () => {
    cleanupInstanceNonceFiles();
  });
  process.on('exit', () => {
    cleanupInstanceNonceFiles();
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      cleanupInstanceNonceFiles();
      closeAllListeningIdleConnections();
      if (process.listenerCount(sig) <= 1) {
        process.exit(0);
      }
    });
  }
}

function writeConfiguredInstanceNonceFile(
  bindHost: LoopbackBindHost,
  port: number,
  configDir: string,
  nonce: string,
  startedAt: string,
  handle: ActiveServerHandle | null,
  isTestSeam: boolean,
): InstanceNonceEntry {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const dirModeInitial = fs.statSync(configDir).mode & 0o777;
  if (dirModeInitial !== 0o700) {
    fs.chmodSync(configDir, 0o700);
    const dirModeAfter = fs.statSync(configDir).mode & 0o777;
    if (dirModeAfter !== 0o700) {
      throw new Error('config_dir_mode_invalid');
    }
  }

  const filePath = getInstanceNonceFilePath(port, configDir);
  const tmpPath = path.join(
    configDir,
    `.instance-${port}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  const record: InstanceNonceRecord = {
    host: bindHost,
    port,
    nonce,
    startedAt,
  };

  let fd: number | null = null;
  let ino = 0;
  let dev = 0;
  try {
    fd = fs.openSync(
      tmpPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    fs.writeFileSync(fd, JSON.stringify(record, null, 2) + '\n', {
      encoding: 'utf8',
    });
    const fileStatInitial = fs.fstatSync(fd);
    if ((fileStatInitial.mode & 0o777) !== 0o600) {
      fs.fchmodSync(fd, 0o600);
    }
    const fileStatAfter = fs.fstatSync(fd);
    if ((fileStatAfter.mode & 0o777) !== 0o600) {
      throw new Error('nonce_file_mode_invalid');
    }
    ino = fileStatAfter.ino;
    dev = fileStatAfter.dev;
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close failure
      }
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore temp unlink failure
    }
    throw err;
  }

  const entry: InstanceNonceEntry = {
    ...record,
    filePath,
    ino,
    dev,
    handle,
    isTestSeam,
  };
  const state = getGlobalState();
  state.initializedTargets.set(`${configDir}:${port}`, entry);
  registerShutdownCleanupOnce();

  return entry;
}

function verifyEntrySocketLive(entry: InstanceNonceEntry): boolean {
  if (entry.isTestSeam && isTestListenerSeamEnabled()) {
    return true;
  }
  const inspection = inspectListeningSocketForPort(entry.port);
  if (inspection.status === 'ambiguous') {
    const state = getGlobalState();
    if (!state.ambiguousLogged) {
      state.ambiguousLogged = true;
      console.error('[instance-nonce] Ambiguous multiple listeners on port; Basic Auth proof disabled');
    }
    return false;
  }
  if (inspection.status !== 'verified') {
    return false;
  }
  if (entry.handle && inspection.handle !== entry.handle) {
    return false;
  }
  const liveBindHost = classifyLoopbackBindHost(inspection.address);
  if (!liveBindHost || liveBindHost !== entry.host) {
    if (!liveBindHost) {
      const state = getGlobalState();
      if (!state.nonLoopbackLogged) {
        state.nonLoopbackLogged = true;
        console.error('[instance-nonce] Non-loopback bind address; Basic Auth proof disabled');
      }
    }
    return false;
  }
  return true;
}

/**
 * Initialize the server's instance-<port>.json file once at startup for a verified
 * bound loopback socket (F42, F46, F47, F49, F50).
 * - Requires a single verified listening socket on the target port (0 handles, not listening,
 *   inspection error, or >= 2 handles on the same port -> returns null without writing any file).
 * - Never falls back to CLI/env/default 127.0.0.1 when no verified socket exists (F50).
 * - Cross-checks against any explicitly configured host (CLI -H / env); mismatch -> null + 1 log line.
 * - Synthetic host/port hints for unit tests are ignored unless both NODE_ENV=test and
 *   AIBOSS_NONCE_TEST_LISTENER=1 are set.
 */
export function initInstanceNonce(options?: InitInstanceNonceOptions): InstanceNonceEntry | null {
  const state = getGlobalState();
  const env = options?.env ?? process.env;
  const allowTestSeam = isTestListenerSeamEnabled(env);

  if (state.shuttingDown && !options) {
    return null;
  }
  if (options) {
    state.shuttingDown = false;
  }

  const port = resolveConfiguredServerPort(options);
  const configDir = options?.configDir
    ? path.resolve(options.configDir)
    : getInstanceConfigDir(env);

  const explicitPort = resolveExplicitConfiguredPort(options);
  if (
    !allowTestSeam &&
    explicitPort !== null &&
    typeof options?.port === 'number' &&
    options.port !== explicitPort
  ) {
    const mismatchKey = `${configDir}|port_mismatch|${port}`;
    if (!state.attemptedTargets.has(mismatchKey)) {
      state.attemptedTargets.set(mismatchKey, null);
      console.error('[instance-nonce] Configured port does not match listening socket; Basic Auth proof disabled');
    }
    state.activeEntry = null;
    return null;
  }

  const inspection = inspectListeningSocketForPort(port);
  let rawSocketHost: string | null = null;
  let verifiedHandle: ActiveServerHandle | null = null;
  let usingTestSeam = false;

  if (inspection.status === 'verified') {
    rawSocketHost = inspection.address;
    verifiedHandle = inspection.handle;
  } else if (inspection.status === 'ambiguous') {
    const ambKey = `${configDir}|ambiguous|${port}`;
    if (!state.attemptedTargets.has(ambKey)) {
      state.attemptedTargets.set(ambKey, null);
      console.error('[instance-nonce] Ambiguous multiple listeners on port; Basic Auth proof disabled');
    }
    state.activeEntry = null;
    return null;
  } else if (inspection.status === 'inspection_error') {
    state.activeEntry = null;
    return null;
  } else {
    // inspection.status === 'none'
    if (allowTestSeam && typeof options?.host === 'string' && options.host.trim().length > 0) {
      rawSocketHost = options.host.trim();
      usingTestSeam = true;
    } else {
      state.activeEntry = null;
      return null;
    }
  }

  const bindHost = classifyLoopbackBindHost(rawSocketHost);
  if (!bindHost) {
    const nonLoopKey = `${configDir}|non_loopback|${rawSocketHost}|${port}`;
    if (!state.attemptedTargets.has(nonLoopKey)) {
      state.attemptedTargets.set(nonLoopKey, null);
      console.error('[instance-nonce] Non-loopback bind address; Basic Auth proof disabled');
    }
    state.activeEntry = null;
    return null;
  }

  const configuredHost = resolveConfiguredServerHost(port, options);
  if (configuredHost !== null) {
    const configuredBindHost = classifyLoopbackBindHost(configuredHost);
    if (!configuredBindHost || configuredBindHost !== bindHost) {
      const hostMismatchKey = `${configDir}|host_mismatch|${configuredHost}|${bindHost}|${port}`;
      if (!state.attemptedTargets.has(hostMismatchKey)) {
        state.attemptedTargets.set(hostMismatchKey, null);
        console.error('[instance-nonce] Configured host does not match listening socket; Basic Auth proof disabled');
      }
      state.activeEntry = null;
      return null;
    }
  }

  const targetKey = `${configDir}|${bindHost}|${port}`;
  if (state.attemptedTargets.has(targetKey)) {
    const prev = state.attemptedTargets.get(targetKey) ?? null;
    if (prev) {
      try {
        const st = fs.statSync(prev.filePath);
        if (st.ino === prev.ino && st.dev === prev.dev && (st.mode & 0o777) === 0o600 && verifyEntrySocketLive(prev)) {
          state.activeEntry = prev;
          return prev;
        }
      } catch {
        // File missing or replaced at runtime; do not rewrite (F47)
      }
    }
    state.activeEntry = null;
    return null;
  }

  try {
    const targetNonce = crypto.randomBytes(32).toString('hex');
    const targetStartedAt = new Date().toISOString();
    state.nonce = targetNonce;
    state.startedAt = targetStartedAt;

    const entry = writeConfiguredInstanceNonceFile(
      bindHost,
      port,
      configDir,
      targetNonce,
      targetStartedAt,
      verifiedHandle,
      usingTestSeam,
    );
    state.attemptedTargets.set(targetKey, entry);
    state.activeEntry = entry;
    state.runtimeMissingLogged = false;
    return entry;
  } catch {
    state.attemptedTargets.set(targetKey, null);
    state.activeEntry = null;
    console.error('[instance-nonce] Could not initialize instance nonce file; Basic Auth proof disabled');
    return null;
  }
}

/**
 * Schedule startup instance nonce initialization after the HTTP server socket finishes
 * binding (`listen`). Called from the server startup lifecycle (`instrumentation.ts` /
 * `khoi-dong-nen.ts`), never at module import time (F50).
 */
export function scheduleInstanceNonceStartup(): void {
  const state = getGlobalState();
  if (state.shuttingDown || state.startupSettled) {
    return;
  }

  const tryStartupInitOnce = (): boolean => {
    if (state.shuttingDown || state.startupSettled) {
      return true;
    }
    const port = resolveConfiguredServerPort();
    const inspection = inspectListeningSocketForPort(port);
    if (inspection.status === 'none') {
      return false;
    }
    state.startupSettled = true;
    if (state.startupTimer) {
      clearInterval(state.startupTimer);
      state.startupTimer = null;
    }
    initInstanceNonce();
    return true;
  };

  if (tryStartupInitOnce()) {
    return;
  }

  if (state.startupScheduled) {
    return;
  }
  state.startupScheduled = true;

  let attempts = 0;
  const maxAttempts = 200; // 200 * 25ms = 5s max wait for server.listen()
  const timer = setInterval(() => {
    attempts += 1;
    if (tryStartupInitOnce() || attempts >= maxAttempts) {
      if (state.startupTimer) {
        clearInterval(state.startupTimer);
        state.startupTimer = null;
      }
      state.startupScheduled = false;
    }
  }, 25);
  timer.unref?.();
  state.startupTimer = timer;
}

export function getInstanceNonce(): string {
  return getGlobalState().activeEntry?.nonce ?? '';
}

export function computeInstanceProof(
  nonce: string,
  host: string,
  port: number | string,
  realm: string,
): string {
  const strictHost = classifyLoopbackBindHost(host) ?? String(host || '').trim().toLowerCase();
  const msg = `${strictHost}:${port}:${realm}`;
  const digest = crypto.createHmac('sha256', nonce).update(msg, 'utf8').digest('hex');
  return `v1.${digest}`;
}

/**
 * Build the X-AIBOSS-Instance header strictly bound to the server's verified live
 * loopback socket ('127.0.0.1' or '::1') and listener port (F42, F46, F47, F50).
 * - Re-verifies the live listening socket on every call; if the socket is closed, missing,
 *   ambiguous (>= 2 listeners on the same port), or non-loopback, returns null immediately
 *   and never signs using stale file metadata (F50).
 * - Never calls initInstanceNonce() again or rewrites missing files at runtime (F47).
 */
export function buildInstanceProofHeader(realm: string): string | null {
  const state = getGlobalState();
  if (state.shuttingDown) {
    return null;
  }
  const entry = state.activeEntry;
  if (!entry) {
    return null;
  }

  if (!verifyEntrySocketLive(entry)) {
    state.activeEntry = null;
    return null;
  }

  try {
    const st = fs.statSync(entry.filePath);
    if (st.ino !== entry.ino || st.dev !== entry.dev || (st.mode & 0o777) !== 0o600) {
      throw new Error('nonce_file_replaced_or_mode_changed');
    }
  } catch {
    state.activeEntry = null;
    if (!state.runtimeMissingLogged) {
      state.runtimeMissingLogged = true;
      console.error(
        '[instance-nonce] Instance nonce file missing or replaced at runtime; Basic Auth proof disabled',
      );
    }
    return null;
  }

  return computeInstanceProof(entry.nonce, entry.host, entry.port, realm);
}
