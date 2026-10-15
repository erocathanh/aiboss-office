import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export interface InstanceNonceRecord {
  port: number;
  nonce: string;
  startedAt: string;
}

interface GlobalNonceState {
  nonce: string;
  startedAt: string;
  initializedTargets: Set<string>;
}

const GLOBAL_KEY = '__aibossInstanceNonceState';

function getGlobalState(): GlobalNonceState {
  const g = globalThis as unknown as Record<string, GlobalNonceState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      nonce: crypto.randomBytes(32).toString('hex'),
      startedAt: new Date().toISOString(),
      initializedTargets: new Set<string>(),
    };
  }
  return g[GLOBAL_KEY]!;
}

export function getInstanceConfigDir(): string {
  const envDir = process.env.AIBOSS_CONFIG_DIR;
  if (typeof envDir === 'string' && envDir.trim().length > 0) {
    return path.resolve(envDir.trim());
  }
  return path.join(os.homedir(), '.config', 'aiboss-office');
}

export function resolveConfiguredServerPort(): number {
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

export function writeInstanceNonceFile(
  port: number = resolveConfiguredServerPort(),
  configDir: string = getInstanceConfigDir(),
): InstanceNonceRecord & { filePath: string } {
  const state = getGlobalState();
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(configDir, 0o700);
  } catch {
    // Best-effort directory chmod
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
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {
    // Best-effort file chmod
  }
  fs.renameSync(tmpPath, filePath);
  state.initializedTargets.add(`${configDir}:${port}`);

  return { ...record, filePath };
}

export function initInstanceNonce(
  port: number = resolveConfiguredServerPort(),
  configDir: string = getInstanceConfigDir(),
): InstanceNonceRecord & { filePath: string } {
  const state = getGlobalState();
  const targetKey = `${configDir}:${port}`;
  const filePath = getInstanceNonceFilePath(port, configDir);
  if (!state.initializedTargets.has(targetKey)) {
    return writeInstanceNonceFile(port, configDir);
  }
  return {
    port,
    nonce: state.nonce,
    startedAt: state.startedAt,
    filePath,
  };
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
  const normalizedHost = String(host || '')
    .trim()
    .toLowerCase();
  const msg = `${normalizedHost}:${port}:${realm}`;
  const digest = crypto.createHmac('sha256', nonce).update(msg, 'utf8').digest('hex');
  return `v1.${digest}`;
}

export function extractHostAndPortFromRequest(
  req: NextRequest,
  fallbackPort: number = resolveConfiguredServerPort(),
): { host: string; port: number } {
  const rawHostHeader = (req.headers.get('host') || '').trim().toLowerCase();
  if (rawHostHeader) {
    if (rawHostHeader.startsWith('[')) {
      const closeIdx = rawHostHeader.indexOf(']');
      if (closeIdx !== -1) {
        const ipv6Host = rawHostHeader.slice(0, closeIdx + 1);
        const rest = rawHostHeader.slice(closeIdx + 1);
        if (rest.startsWith(':')) {
          const parsedPort = Number.parseInt(rest.slice(1), 10);
          if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
            return { host: ipv6Host, port: parsedPort };
          }
        }
        return { host: ipv6Host, port: fallbackPort };
      }
    }
    const colonIdx = rawHostHeader.lastIndexOf(':');
    if (colonIdx > 0) {
      const hostPart = rawHostHeader.slice(0, colonIdx);
      const portPart = Number.parseInt(rawHostHeader.slice(colonIdx + 1), 10);
      if (Number.isInteger(portPart) && portPart > 0 && portPart <= 65535) {
        return { host: hostPart, port: portPart };
      }
    }
    return { host: rawHostHeader, port: fallbackPort };
  }

  const urlHost = (req.nextUrl?.hostname || '127.0.0.1').toLowerCase();
  const urlPort = Number.parseInt(req.nextUrl?.port || '', 10);
  return {
    host: urlHost,
    port: Number.isInteger(urlPort) && urlPort > 0 && urlPort <= 65535 ? urlPort : fallbackPort,
  };
}

export function buildInstanceProofHeader(req: NextRequest, realm: string): string {
  const { host, port } = extractHostAndPortFromRequest(req);
  const { nonce } = initInstanceNonce(port);
  return computeInstanceProof(nonce, host, port, realm);
}

try {
  initInstanceNonce();
} catch {
  // Ignore startup write error in restricted environments; will retry on demand
}
