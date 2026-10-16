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

export interface InstanceNonceEntry extends InstanceNonceRecord {
  filePath: string;
  ino: number;
  dev: number;
}

export interface InitInstanceNonceOptions {
  host?: string;
  port?: number;
  configDir?: string;
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

interface GlobalNonceState {
  nonce: string;
  startedAt: string;
  attemptedTargets: Map<string, InstanceNonceEntry | null>;
  initializedTargets: Map<string, InstanceNonceEntry>;
  activeEntry: InstanceNonceEntry | null;
  cleanupRegistered: boolean;
  shuttingDown: boolean;
  nonLoopbackLogged: boolean;
  runtimeMissingLogged: boolean;
}

const GLOBAL_KEY = '__aibossInstanceNonceStateV3';

function getGlobalState(): GlobalNonceState {
  const g = globalThis as unknown as Record<string, GlobalNonceState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      nonce: crypto.randomBytes(32).toString('hex'),
      startedAt: new Date().toISOString(),
      attemptedTargets: new Map<string, InstanceNonceEntry | null>(),
      initializedTargets: new Map<string, InstanceNonceEntry>(),
      activeEntry: null,
      cleanupRegistered: false,
      shuttingDown: false,
      nonLoopbackLogged: false,
      runtimeMissingLogged: false,
    };
  }
  return g[GLOBAL_KEY]!;
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
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') {
      const val = Number.parseInt(argv[i + 1] || '', 10);
      if (Number.isInteger(val) && val > 0 && val <= 65535) {
        return val;
      }
    }
    if (typeof argv[i] === 'string' && argv[i].startsWith('--port=') ) {
      const val = Number.parseInt(argv[i].split('=')[1] || '', 10);
      if (Number.isInteger(val) && val > 0 && val <= 65535) {
        return val;
      }
    }
  }
  return null;
}

function parseCliHost(argv: string[] = process.argv): string | null {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--hostname' || argv[i] === '-H') && typeof argv[i + 1] === 'string') {
      const val = argv[i + 1].trim();
      if (val.length > 0) {
        return val;
      }
    }
    if (typeof argv[i] === 'string' && argv[i].startsWith('--hostname=')) {
      const val = argv[i].slice('--hostname='.length).trim();
      if (val.length > 0) {
        return val;
      }
    }
  }
  return null;
}

interface ActiveServerHandleInfo {
  address: string;
  port: number;
  closeIdleConnections?: () => void;
}

function findListeningServerAddress(targetPort?: number): ActiveServerHandleInfo | null {
  try {
    const getHandles = (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles;
    if (typeof getHandles !== 'function') {
      return null;
    }
    const handles = getHandles.call(process);
    if (!Array.isArray(handles)) {
      return null;
    }
    for (const h of handles) {
      if (!h || typeof h !== 'object') continue;
      const srv = h as {
        listening?: boolean;
        address?: () => { address?: string; port?: number } | string | null;
        closeIdleConnections?: () => void;
      };
      if (srv.listening !== true || typeof srv.address !== 'function') continue;
      const addr = srv.address();
      if (addr && typeof addr === 'object' && typeof addr.address === 'string' && typeof addr.port === 'number') {
        if (targetPort === undefined || addr.port === targetPort) {
          return {
            address: addr.address,
            port: addr.port,
            closeIdleConnections:
              typeof srv.closeIdleConnections === 'function'
                ? () => srv.closeIdleConnections!()
                : undefined,
          };
        }
      }
    }
  } catch {
    // Ignore handle inspection errors
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

export function resolveConfiguredServerHost(
  port: number = resolveConfiguredServerPort(),
  options?: InitInstanceNonceOptions,
): string {
  if (typeof options?.host === 'string' && options.host.trim().length > 0) {
    return options.host.trim();
  }
  const liveSocket = findListeningServerAddress(port);
  if (liveSocket && liveSocket.address) {
    return liveSocket.address;
  }
  const argv = options?.argv ?? process.argv;
  const env = options?.env ?? process.env;
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
  try {
    const cfgPath = path.join(process.cwd(), 'config', 'office.json');
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const cfgHost = raw?.service?.host ?? raw?.server?.host;
    if (typeof cfgHost === 'string' && cfgHost.trim().length > 0) {
      return cfgHost.trim();
    }
  } catch {
    // Fallback to default 127.0.0.1
  }
  return IPV4_LOOPBACK_HOST;
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
      const liveSocket = findListeningServerAddress();
      if (liveSocket && typeof liveSocket.closeIdleConnections === 'function') {
        try {
          liveSocket.closeIdleConnections();
        } catch {
          // Ignore closeIdleConnections error
        }
      }
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

  const entry: InstanceNonceEntry = { ...record, filePath, ino, dev };
  const state = getGlobalState();
  state.initializedTargets.set(`${configDir}:${port}`, entry);
  registerShutdownCleanupOnce();

  return entry;
}

/**
 * Initialize the server's instance-<port>.json file once at startup for the actual bound
 * loopback host and port.
 * - Never accepts a request-supplied Host/port (F42).
 * - Signs only for numeric loopback bind addresses 127.0.0.1 or ::1; disables proof for
 *   wildcard (0.0.0.0, ::) or non-loopback binds (F46).
 * - Writes strictly once per startup configuration and logs at most one value-free line
 *   on error (F47, F49).
 */
export function initInstanceNonce(options?: InitInstanceNonceOptions): InstanceNonceEntry | null {
  const state = getGlobalState();
  if (state.shuttingDown && !options) {
    return null;
  }
  if (options) {
    state.shuttingDown = false;
  }
  const port = resolveConfiguredServerPort(options);
  const rawHost = resolveConfiguredServerHost(port, options);
  const configDir = options?.configDir
    ? path.resolve(options.configDir)
    : getInstanceConfigDir(options?.env ?? process.env);
  const targetKey = `${configDir}|${rawHost}|${port}`;

  if (state.attemptedTargets.has(targetKey)) {
    const prev = state.attemptedTargets.get(targetKey) ?? null;
    state.activeEntry = prev;
    return prev;
  }

  const bindHost = classifyLoopbackBindHost(rawHost);
  if (!bindHost) {
    state.attemptedTargets.set(targetKey, null);
    state.activeEntry = null;
    console.error('[instance-nonce] Non-loopback bind address; Basic Auth proof disabled');
    return null;
  }

  try {
    const isFirstTarget = state.attemptedTargets.size === 0;
    const targetNonce = isFirstTarget ? state.nonce : crypto.randomBytes(32).toString('hex');
    const targetStartedAt = isFirstTarget ? state.startedAt : new Date().toISOString();
    if (!isFirstTarget) {
      state.nonce = targetNonce;
      state.startedAt = targetStartedAt;
    }
    const entry = writeConfiguredInstanceNonceFile(
      bindHost,
      port,
      configDir,
      targetNonce,
      targetStartedAt,
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

export function getInstanceNonce(): string {
  return getGlobalState().nonce;
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
 * Build the X-AIBOSS-Instance header strictly bound to the server's actual bound loopback
 * address ('127.0.0.1' or '::1') and listener port.
 * - Never calls initInstanceNonce() again or rewrites missing files at runtime (F47).
 * - Returns null if the instance nonce file was not initialized at startup, was removed/replaced
 *   at runtime, or if the live listener is bound to a non-loopback/wildcard address (F45, F46, F47).
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

  const liveSocket = findListeningServerAddress(entry.port);
  if (liveSocket && liveSocket.address) {
    const liveBindHost = classifyLoopbackBindHost(liveSocket.address);
    if (!liveBindHost) {
      state.activeEntry = null;
      if (!state.nonLoopbackLogged) {
        state.nonLoopbackLogged = true;
        console.error('[instance-nonce] Non-loopback bind address; Basic Auth proof disabled');
      }
      return null;
    }
    entry.host = liveBindHost;
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

const isUnitTestRunner = process.argv.some(
  (arg) => typeof arg === 'string' && (arg.endsWith('.test.mjs') || arg.endsWith('.test.cjs') || arg.endsWith('-probe.cjs')),
);
if (!isUnitTestRunner) {
  initInstanceNonce();
}
