import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CANONICAL_LOOPBACK_HOST = '127.0.0.1';

export interface InstanceNonceRecord {
  port: number;
  nonce: string;
  startedAt: string;
}

interface GlobalNonceState {
  nonce: string;
  startedAt: string;
  initializedTargets: Map<string, InstanceNonceRecord & { filePath: string }>;
  cleanupRegistered: boolean;
}

const GLOBAL_KEY = '__aibossInstanceNonceStateV2';

function getGlobalState(): GlobalNonceState {
  const g = globalThis as unknown as Record<string, GlobalNonceState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      nonce: crypto.randomBytes(32).toString('hex'),
      startedAt: new Date().toISOString(),
      initializedTargets: new Map<string, InstanceNonceRecord & { filePath: string }>(),
      cleanupRegistered: false,
    };
  }
  return g[GLOBAL_KEY]!;
}

export function normalizeLoopbackHost(rawHost: string): string | null {
  const trimmed = String(rawHost || '').trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  let hostname = trimmed;
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx === -1) {
      return null;
    }
    hostname = trimmed.slice(0, closeIdx + 1);
  } else {
    const firstColon = trimmed.indexOf(':');
    const lastColon = trimmed.lastIndexOf(':');
    if (firstColon !== -1 && firstColon === lastColon) {
      hostname = trimmed.slice(0, firstColon);
    }
  }
  if (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  ) {
    return CANONICAL_LOOPBACK_HOST;
  }
  return null;
}

export function getInstanceConfigDir(): string {
  const envDir = process.env.AIBOSS_CONFIG_DIR;
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
    if (typeof argv[i] === 'string' && argv[i].startsWith('--port=')) {
      const val = Number.parseInt(argv[i].split('=')[1] || '', 10);
      if (Number.isInteger(val) && val > 0 && val <= 65535) {
        return val;
      }
    }
  }
  return null;
}

export function resolveConfiguredServerPort(): number {
  const cliPort = parseCliPort(process.argv);
  if (cliPort !== null) {
    return cliPort;
  }
  const envPort = Number.parseInt(
    process.env.AIBOSS_OFFICE_PORT || process.env.PORT || '',
    10,
  );
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

export function getInstanceNonceFilePath(
  port: number = resolveConfiguredServerPort(),
  configDir: string = getInstanceConfigDir(),
): string {
  return path.join(configDir, `instance-${port}.json`);
}

export function cleanupInstanceNonceFiles(): void {
  const state = getGlobalState();
  for (const [key, entry] of state.initializedTargets.entries()) {
    try {
      if (fs.existsSync(entry.filePath)) {
        const current = JSON.parse(fs.readFileSync(entry.filePath, 'utf8'));
        if (current && current.nonce === state.nonce) {
          fs.unlinkSync(entry.filePath);
        }
      }
    } catch {
      // Best-effort cleanup on shutdown
    }
    state.initializedTargets.delete(key);
  }
}

function registerShutdownCleanupOnce(): void {
  const state = getGlobalState();
  if (state.cleanupRegistered) {
    return;
  }
  state.cleanupRegistered = true;

  process.once('beforeExit', () => {
    cleanupInstanceNonceFiles();
  });
  process.once('exit', () => {
    cleanupInstanceNonceFiles();
  });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      cleanupInstanceNonceFiles();
      if (process.listenerCount(sig) === 0) {
        process.exit(0);
      }
    });
  }
}

function writeConfiguredInstanceNonceFile(): InstanceNonceRecord & { filePath: string } {
  const state = getGlobalState();
  const port = resolveConfiguredServerPort();
  const configDir = getInstanceConfigDir();

  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const dirModeInitial = fs.statSync(configDir).mode & 0o777;
  if (dirModeInitial !== 0o700) {
    try {
      fs.chmodSync(configDir, 0o700);
    } catch {
      console.error('[instance-nonce] Failed to chmod 0700 on config directory');
      throw new Error('config_dir_chmod_failed');
    }
    const dirModeAfter = fs.statSync(configDir).mode & 0o777;
    if (dirModeAfter !== 0o700) {
      console.error('[instance-nonce] Config directory permissions remained broader than 0700');
      throw new Error('config_dir_mode_invalid');
    }
  }

  const filePath = getInstanceNonceFilePath(port, configDir);
  const tmpPath = path.join(
    configDir,
    `.instance-${port}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  const record: InstanceNonceRecord = {
    port,
    nonce: state.nonce,
    startedAt: state.startedAt,
  };

  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  const fileModeInitial = fs.statSync(tmpPath).mode & 0o777;
  if (fileModeInitial !== 0o600) {
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore temp unlink failure
      }
      console.error('[instance-nonce] Failed to chmod 0600 on instance nonce file');
      throw new Error('nonce_file_chmod_failed');
    }
    const fileModeAfter = fs.statSync(tmpPath).mode & 0o777;
    if (fileModeAfter !== 0o600) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore temp unlink failure
      }
      console.error('[instance-nonce] Instance nonce file permissions remained broader than 0600');
      throw new Error('nonce_file_mode_invalid');
    }
  }

  fs.renameSync(tmpPath, filePath);
  const entry = { ...record, filePath };
  state.initializedTargets.set(`${configDir}:${port}`, entry);
  registerShutdownCleanupOnce();

  return entry;
}

/**
 * Initialize the server's instance-<port>.json file once at startup for the configured listener port.
 * Never accepts a request-supplied port (F42).
 * Returns null (and logs a single value-free line) if disk/permission enforcement fails (F45).
 */
export function initInstanceNonce(): (InstanceNonceRecord & { filePath: string }) | null {
  try {
    const state = getGlobalState();
    const port = resolveConfiguredServerPort();
    const configDir = getInstanceConfigDir();
    const targetKey = `${configDir}:${port}`;
    const existing = state.initializedTargets.get(targetKey);
    if (existing && fs.existsSync(existing.filePath)) {
      return existing;
    }
    return writeConfiguredInstanceNonceFile();
  } catch {
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
  const canonicalHost = normalizeLoopbackHost(host) || String(host || '').trim().toLowerCase();
  const msg = `${canonicalHost}:${port}:${realm}`;
  const digest = crypto.createHmac('sha256', nonce).update(msg, 'utf8').digest('hex');
  return `v1.${digest}`;
}

/**
 * Build the X-AIBOSS-Instance header strictly bound to the server's own listener port
 * and canonical loopback host ('127.0.0.1'). Request Host header NEVER participates in
 * the filename or HMAC message (F42). Returns null if the instance nonce file could not
 * be initialized (F45 fail-closed).
 */
export function buildInstanceProofHeader(realm: string): string | null {
  const record = initInstanceNonce();
  if (!record) {
    return null;
  }
  return computeInstanceProof(record.nonce, CANONICAL_LOOPBACK_HOST, record.port, realm);
}

initInstanceNonce();
