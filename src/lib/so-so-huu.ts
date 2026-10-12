import fs from 'node:fs';
import path from 'node:path';

// Round 26: only explicit Owner events bind a session to a seat's technical name.
// This is application-level precedence, not authentication against local file editors.
interface OwnershipEvent {
  ma_phien: string;
  ma_nhan_su: string | null;
  moc: number;
  kind: 'proposal' | 'owner';
  proposed_seat?: string | null;
}

export interface OwnershipState {
  owner: string | null;
  proposal: string | null;
}

export function ownershipPath(): string {
  return path.join(process.cwd(), '.trang-thai', 'so-so-huu.jsonl');
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value);
}

export function readOwnership(file = ownershipPath()): Map<string, OwnershipState> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw new Error('Cannot read ownership ledger.');
  }
  // Never append onto a torn final record or silently lose a damaged Owner event.
  if (text && !text.endsWith('\n')) throw new Error('Incomplete ownership ledger.');
  const states = new Map<string, OwnershipState>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { throw new Error('Invalid ownership ledger.'); }
    if (!event || !validIdentifier(event.ma_phien)) throw new Error('Invalid ownership event.');
    const state = states.get(event.ma_phien) ?? { owner: null, proposal: null };
    if (event.kind === 'owner') {
      if (!validIdentifier(event.ma_nhan_su)) throw new Error('Invalid Owner event.');
      state.owner = event.ma_nhan_su;
      state.proposal = null;
    } else if (state.owner === null) {
      // Untagged historical observations are suggestions, never confirmations.
      const candidate = event.kind === 'proposal' ? event.proposed_seat : event.ma_nhan_su;
      state.proposal = validIdentifier(candidate) ? candidate : null;
    }
    states.set(event.ma_phien, state);
  }
  return states;
}

function appendEvent(event: OwnershipEvent, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flush: true });
}

export function confirmOwnership(
  sessionId: string, seatName: string, seatNames: readonly string[], file = ownershipPath(),
): void {
  if (!validIdentifier(sessionId) || !validIdentifier(seatName) || !seatNames.includes(seatName)) {
    throw new Error('Invalid session ID or unknown seat name.');
  }
  readOwnership(file);
  // No automatic repair: an explicit later Owner confirmation is the only correction.
  appendEvent({ ma_phien: sessionId, ma_nhan_su: seatName, kind: 'owner', moc: Date.now() }, file);
}

export function recordProposal(sessionId: string, seatName?: string | null): boolean {
  try {
    if (!validIdentifier(sessionId)) return false;
    const file = ownershipPath();
    if (readOwnership(file).get(sessionId)?.owner) return false;
    // A concurrent Owner write may occur after this check. The reducer still ignores
    // this proposal regardless of append order: proposals cannot clear an Owner event.
    appendEvent({
      ma_phien: sessionId,
      ma_nhan_su: null,
      proposed_seat: validIdentifier(seatName) ? seatName : null,
      kind: 'proposal',
      moc: Date.now(),
    }, file);
    return true;
  } catch {
    // Automatic observations must not abort an agent turn. Owner writes throw instead.
    return false;
  }
}

// Compatibility names for existing callers; new implementation names are English.
export { ownershipPath as duongSoSoHuu, recordProposal as ghiSoHuu };
