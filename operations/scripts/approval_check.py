#!/usr/bin/env python3
"""approval_check.py — CLI contract for H4 hook to verify (and optionally claim/consume) an approval.

Usage:
  python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex> [--consume] [--request-id <id>]

Behavior:
  - Acquires cross-process lock `<approvals_dir>/.approvals.lock` (O_CREAT | O_EXCL) across
    read -> validate -> optional claim append (F1).
  - Reads approval ledger files in `<AIBOSS_DATA_DIR>/approvals/` (or `<office_root>/operations/data/approvals/`).
  - Computes deterministic `requestId = sha256(ts + "|" + seat + "|" + tool + "|" + sha256)[:16]`.
  - Evaluates the NEWEST request for `(seat, tool, sha256)` ordered by parsed UTC epoch timestamp (F4),
    never falling back to an older approval when a newer request is pending, denied, expired, claimed, or executed.
  - Strictly validates ISO-8601 timestamps and fails closed on invalid timestamps (F5).
  - Requires `execution` and `claim` records to follow a valid `approved` decision with matching `seatId` and `digest` (F1, F2).
  - When `--consume` is passed and the newest request is active `approved` (unexpired, unclaimed, unexecuted),
    atomically appends a `claim` record with safe JSONL boundary handling (F3) and exits 0 with `claimId`.
  - In all other cases (pending, denied, expired, not_found, claimed, executed, failed, digest_mismatch),
    prints JSON `{"status": "<reason>", ...}` and exits 2.
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import errno
import hashlib
import json
import os
import re
import sys
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

ISO_STRICT_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$"
)
HEX16_RE = re.compile(r"^[0-9a-f]{16}$")
HEX_DIGEST_RE = re.compile(r"^[0-9a-f]{16,128}$")


def find_office_root(start_dir: Optional[str] = None) -> str:
    start = start_dir or os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    current = os.path.abspath(start)

    for _ in range(9):
        config_file = os.path.join(current, "config", "office.json")
        if os.path.isfile(config_file):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    env_root = os.environ.get("AIBOSS_OFFICE_ROOT")
    if env_root:
        env_config = os.path.join(env_root, "config", "office.json")
        if os.path.isfile(env_config):
            return os.path.abspath(env_root)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidate = os.path.abspath(os.path.join(script_dir, "..", ".."))
    if os.path.isfile(os.path.join(candidate, "config", "office.json")):
        return candidate

    sys.stderr.write(
        f"[approval_check] Could not locate AIBOSS Office root from '{start}'\n"
    )
    sys.exit(2)


def get_approvals_dir() -> str:
    env_data_dir = os.environ.get("AIBOSS_DATA_DIR")
    if env_data_dir and env_data_dir.strip():
        return os.path.join(os.path.abspath(env_data_dir.strip()), "approvals")
    root = find_office_root()
    return os.path.join(root, "operations", "data", "approvals")


def compute_request_id(ts: str, seat: str, tool: str, sha256_hex: str) -> str:
    payload = f"{ts}|{seat}|{tool}|{sha256_hex}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:16]


def parse_strict_iso_utc(iso_str: Any) -> Optional[datetime]:
    """Strictly parse an ISO-8601 UTC/offset timestamp. Returns None on any malformed value (F5)."""
    if not iso_str or not isinstance(iso_str, str):
        return None
    s = iso_str.strip()
    m = ISO_STRICT_RE.match(s)
    if not m:
        return None
    date_part, time_part, frac_part, tz_part = m.groups()
    tz_norm = "+00:00" if tz_part == "Z" else tz_part
    if frac_part:
        frac6 = (frac_part + "000000")[:6]
        norm = f"{date_part}T{time_part}.{frac6}{tz_norm}"
    else:
        norm = f"{date_part}T{time_part}{tz_norm}"
    try:
        dt = datetime.fromisoformat(norm)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def is_pid_alive(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False


def is_lock_disabled_for_test() -> bool:
    return (
        os.environ.get("NODE_ENV") != "production"
        and os.environ.get("AIBOSS_TEST_DISABLE_APPROVAL_LOCK") == "1"
    )


@contextmanager
def with_approval_lock(approvals_dir: str, timeout_sec: float = 5.0) -> Iterator[None]:
    """Cross-process atomic lock on `<approvals_dir>/.approvals.lock` using O_CREAT | O_EXCL (F1)."""
    if is_lock_disabled_for_test():
        yield
        return

    os.makedirs(approvals_dir, exist_ok=True)
    lock_path = os.path.join(approvals_dir, ".approvals.lock")
    token = f"{os.getpid()}-{int(time.time() * 1000)}-{os.urandom(4).hex()}"
    deadline = time.monotonic() + timeout_sec
    fd: Optional[int] = None

    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o644)
            payload = json.dumps(
                {
                    "pid": os.getpid(),
                    "token": token,
                    "createdAt": int(time.time() * 1000),
                }
            ).encode("utf-8")
            os.write(fd, payload)
            os.fsync(fd)
            break
        except OSError as exc:
            if exc.errno != errno.EEXIST:
                raise
            try:
                with open(lock_path, "r", encoding="utf-8") as fh:
                    raw = fh.read().strip()
                if raw:
                    parsed = json.loads(raw)
                    holder_pid = parsed.get("pid")
                    created_at = parsed.get("createdAt", 0)
                    age_ms = int(time.time() * 1000) - int(created_at or 0)
                    if (isinstance(holder_pid, int) and not is_pid_alive(holder_pid)) or age_ms > 30000:
                        try:
                            os.unlink(lock_path)
                            continue
                        except OSError:
                            pass
                else:
                    st = os.stat(lock_path)
                    if time.time() - st.st_mtime > 5.0:
                        try:
                            os.unlink(lock_path)
                            continue
                        except OSError:
                            pass
            except Exception:
                pass

            if time.monotonic() >= deadline:
                sys.stderr.write(
                    f"[approval_check] Timed out acquiring lock {lock_path}\n"
                )
                sys.exit(2)
            time.sleep(0.01)

    try:
        yield
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            with open(lock_path, "r", encoding="utf-8") as fh:
                current_raw = fh.read().strip()
            if current_raw:
                current_obj = json.loads(current_raw)
                if current_obj.get("token") == token:
                    os.unlink(lock_path)
        except Exception:
            pass


def append_jsonl_safely(file_path: str, record: Dict[str, Any]) -> None:
    """Ensure trailing newline before appending a JSONL record under lock (F3)."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    fd = os.open(file_path, os.O_CREAT | os.O_RDWR, 0o644)
    try:
        st = os.fstat(fd)
        prefix = ""
        if st.st_size > 0:
            os.lseek(fd, st.st_size - 1, os.SEEK_SET)
            last_byte = os.read(fd, 1)
            if last_byte != b"\n":
                prefix = "\n"
        os.lseek(fd, 0, os.SEEK_END)
        line_bytes = (prefix + json.dumps(record, ensure_ascii=False) + "\n").encode(
            "utf-8"
        )
        os.write(fd, line_bytes)
        os.fsync(fd)
    finally:
        os.close(fd)


def resolve_target_file(
    approvals_dir: str, source_file: Optional[str], now_utc: datetime
) -> str:
    os.makedirs(approvals_dir, exist_ok=True)
    today_str = now_utc.strftime("%Y-%m-%d")
    yesterday_str = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d")
    today_path = os.path.join(approvals_dir, f"{today_str}.jsonl")

    if source_file:
        base = os.path.splitext(os.path.basename(source_file))[0]
        if (
            base != today_str
            and base != yesterday_str
            and not os.path.exists(today_path)
        ):
            return source_file
    return today_path


def list_ledger_files(approvals_dir: str, now_utc: datetime) -> List[str]:
    if not os.path.isdir(approvals_dir):
        return []
    today_name = now_utc.strftime("%Y-%m-%d") + ".jsonl"
    yesterday_name = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d") + ".jsonl"

    all_jsonl = sorted(
        f for f in os.listdir(approvals_dir) if f.endswith(".jsonl")
    )
    ordered: List[str] = [os.path.join(approvals_dir, f) for f in all_jsonl]

    for priority_name in (yesterday_name, today_name):
        p = os.path.join(approvals_dir, priority_name)
        if os.path.isfile(p) and p not in ordered:
            ordered.append(p)
    return ordered


def load_folded_ledger(
    approvals_dir: str, now_utc: datetime
) -> Dict[str, Dict[str, Any]]:
    """Fold approval ledger with unified transition validation matching TypeScript `foldApprovalLedger` (F1, F2, F5)."""
    files = list_ledger_files(approvals_dir, now_utc)
    entries: Dict[str, Dict[str, Any]] = {}
    order_counter = 0

    for file_path in files:
        try:
            with open(file_path, "r", encoding="utf-8") as fh:
                for raw_line in fh:
                    order_counter += 1
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        # F3: Skip corrupted/partial JSONL fragment without altering historical lines
                        continue
                    if not isinstance(obj, dict):
                        continue

                    rec_type = obj.get("type")
                    if rec_type is None or rec_type == "request":
                        ts = str(obj.get("ts") or "").strip()
                        seat = str(obj.get("seat") or "").strip()
                        tool = str(obj.get("tool") or "").strip()
                        sha256_val = str(obj.get("sha256") or "").strip().lower()
                        if (
                            not ts
                            or not seat
                            or not tool
                            or not HEX_DIGEST_RE.match(sha256_val)
                        ):
                            continue
                        ts_dt = parse_strict_iso_utc(ts)
                        if ts_dt is None:
                            continue
                        req_id = compute_request_id(ts, seat, tool, sha256_val)
                        if req_id not in entries:
                            entries[req_id] = {
                                "requestId": req_id,
                                "ts": ts,
                                "ts_dt": ts_dt,
                                "order_index": order_counter,
                                "seat": seat,
                                "tool": tool,
                                "sha256": sha256_val,
                                "source_file": file_path,
                                "decision": None,
                                "claim": None,
                                "execution": None,
                            }
                    elif rec_type == "decision":
                        req_id = str(obj.get("requestId") or "").strip().lower()
                        dec_val = obj.get("decision")
                        by_val = obj.get("by")
                        at_val = str(obj.get("at") or "").strip()
                        exp_val = str(obj.get("expiresAt") or "").strip()
                        note_val = obj.get("note")
                        if not HEX16_RE.match(req_id) or req_id not in entries:
                            continue
                        if entries[req_id]["decision"] is not None:
                            continue
                        if dec_val not in ("approved", "denied") or by_val not in (
                            "owner",
                            "localhost",
                        ):
                            continue
                        if note_val is not None:
                            if not isinstance(note_val, str) or len(note_val.strip()) > 200 or len(note_val) > 200:
                                continue
                        at_dt = parse_strict_iso_utc(at_val)
                        exp_dt = parse_strict_iso_utc(exp_val)
                        if at_dt is None or exp_dt is None:
                            continue
                        entries[req_id]["decision"] = {
                            "decision": dec_val,
                            "by": by_val,
                            "at": at_val,
                            "at_dt": at_dt,
                            "expiresAt": exp_val,
                            "exp_dt": exp_dt,
                        }
                    elif rec_type == "claim":
                        req_id = str(obj.get("requestId") or "").strip().lower()
                        claim_id = str(obj.get("claimId") or "").strip()
                        seat_id = str(obj.get("seatId") or "").strip()
                        tool_val = str(obj.get("tool") or "").strip()
                        digest_val = str(obj.get("digest") or "").strip().lower()
                        at_val = str(obj.get("at") or "").strip()
                        if (
                            not HEX16_RE.match(req_id)
                            or req_id not in entries
                            or not claim_id
                        ):
                            continue
                        entry = entries[req_id]
                        dec = entry["decision"]
                        if (
                            dec is None
                            or dec["decision"] != "approved"
                            or entry["claim"] is not None
                            or entry["execution"] is not None
                        ):
                            continue
                        if seat_id and seat_id != entry["seat"]:
                            continue
                        if tool_val and tool_val != entry["tool"]:
                            continue
                        if digest_val and (
                            not HEX_DIGEST_RE.match(digest_val)
                            or digest_val != entry["sha256"]
                        ):
                            continue
                        claim_dt = parse_strict_iso_utc(at_val)
                        if (
                            claim_dt is None
                            or claim_dt < dec["at_dt"]
                            or claim_dt >= dec["exp_dt"]
                        ):
                            continue
                        entry["claim"] = {
                            "claimId": claim_id,
                            "seatId": seat_id or entry["seat"],
                            "tool": tool_val or entry["tool"],
                            "digest": digest_val or entry["sha256"],
                            "at": at_val,
                            "at_dt": claim_dt,
                        }
                    elif rec_type == "execution":
                        req_id = str(obj.get("requestId") or "").strip().lower()
                        res_val = obj.get("result")
                        seat_id = str(obj.get("seatId") or "").strip()
                        digest_val = str(obj.get("digest") or "").strip().lower()
                        at_val = str(obj.get("at") or "").strip()
                        claim_id_val = (
                            str(obj.get("claimId")).strip()
                            if isinstance(obj.get("claimId"), str)
                            and str(obj.get("claimId")).strip()
                            else None
                        )
                        if (
                            not HEX16_RE.match(req_id)
                            or req_id not in entries
                            or not seat_id
                            or not HEX_DIGEST_RE.match(digest_val)
                            or res_val not in ("executed", "failed", "expired")
                        ):
                            continue
                        entry = entries[req_id]
                        if entry["execution"] is not None:
                            continue
                        dec = entry["decision"]
                        # F1 & F2: Execution is only valid after an `approved` decision
                        if dec is None or dec["decision"] != "approved":
                            continue
                        # F2: Must match request seat and sha256 digest
                        if seat_id != entry["seat"] or digest_val != entry["sha256"]:
                            continue
                        exec_dt = parse_strict_iso_utc(at_val)
                        if exec_dt is None or exec_dt < dec["at_dt"]:
                            continue
                        if res_val in ("executed", "failed"):
                            if entry["claim"] is not None:
                                if claim_id_val != entry["claim"]["claimId"]:
                                    continue
                            elif exec_dt >= dec["exp_dt"]:
                                continue
                        entry["execution"] = {
                            "result": res_val,
                            "seatId": seat_id,
                            "at": at_val,
                            "at_dt": exec_dt,
                            "digest": digest_val,
                            "claimId": claim_id_val,
                        }
        except OSError:
            continue

    return entries


def is_entry_active_approved(entry: Dict[str, Any], now_utc: datetime) -> bool:
    dec = entry.get("decision")
    claim = entry.get("claim")
    exe = entry.get("execution")
    if not dec or dec.get("decision") != "approved":
        return False
    if exe is not None or claim is not None:
        return False
    exp_dt = dec.get("exp_dt")
    at_dt = dec.get("at_dt")
    # F5: Fail-closed on missing or invalid timestamps
    if exp_dt is None or at_dt is None or now_utc >= exp_dt:
        return False
    return True


def derive_non_active_status(
    entry: Dict[str, Any], now_utc: datetime
) -> Tuple[str, Optional[str], Optional[str]]:
    dec = entry.get("decision")
    claim = entry.get("claim")
    exe = entry.get("execution")
    if dec is None:
        return ("pending", None, None)
    if dec.get("decision") == "denied":
        return ("denied", dec.get("expiresAt"), None)
    exp_dt = dec.get("exp_dt")
    at_dt = dec.get("at_dt")
    if exp_dt is None or at_dt is None:
        return ("expired", dec.get("expiresAt"), None)
    if exe is not None:
        return (
            str(exe.get("result") or "executed"),
            dec.get("expiresAt"),
            exe.get("claimId"),
        )
    if claim is not None:
        return ("claimed", dec.get("expiresAt"), claim.get("claimId"))
    if now_utc >= exp_dt:
        return ("expired", dec.get("expiresAt"), None)
    return ("approved", dec.get("expiresAt"), None)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check if an action has a valid, unexpired, unexecuted approval with matching sha256."
    )
    parser.add_argument("--seat", required=True, help="Seat slug")
    parser.add_argument("--tool", required=True, help="Tool name")
    parser.add_argument("--sha256", required=True, help="SHA-256 hex digest of tool_input")
    parser.add_argument(
        "--consume",
        action="store_true",
        help="Atomically claim/consume the approval under lock before executing the action",
    )
    parser.add_argument(
        "--request-id",
        required=False,
        help="Optional explicit 16-hex requestId to check",
    )
    args = parser.parse_args()

    seat = args.seat.strip()
    tool = args.tool.strip()
    sha256_arg = args.sha256.strip().lower()
    req_id_filter = (
        args.request_id.strip().lower()
        if args.request_id and args.request_id.strip()
        else None
    )

    approvals_dir = get_approvals_dir()

    with with_approval_lock(approvals_dir):
        now_utc = datetime.now(timezone.utc)
        entries = load_folded_ledger(approvals_dir, now_utc)

        seat_tool_entries = [
            e
            for e in entries.values()
            if e["seat"] == seat
            and e["tool"] == tool
            and (req_id_filter is None or e["requestId"] == req_id_filter)
        ]
        if not seat_tool_entries:
            print(json.dumps({"status": "not_found"}))
            sys.exit(2)

        # F4: Sort by parsed UTC epoch timestamp and ledger order index (never string order)
        seat_tool_entries.sort(
            key=lambda e: (e["ts_dt"].timestamp(), e["order_index"])
        )

        # F4: Select the NEWEST request for (seat, tool, sha256) first; never fallback to older approval
        exact_matches = [
            e for e in seat_tool_entries if e["sha256"] == sha256_arg
        ]
        candidate = exact_matches[-1] if exact_matches else seat_tool_entries[-1]

        # SHA-256 digest comparison (positive control target 4.4b)
        if candidate["sha256"] != sha256_arg:
            print(
                json.dumps(
                    {
                        "requestId": candidate["requestId"],
                        "status": "digest_mismatch",
                    }
                )
            )
            sys.exit(2)

        if not is_entry_active_approved(candidate, now_utc):
            status, exp_at, claim_id = derive_non_active_status(candidate, now_utc)
            out: Dict[str, Any] = {
                "requestId": candidate["requestId"],
                "status": status,
            }
            if exp_at:
                out["expiresAt"] = exp_at
            if claim_id:
                out["claimId"] = claim_id
            print(json.dumps(out))
            sys.exit(2)

        dec = candidate["decision"]
        if args.consume:
            if is_lock_disabled_for_test():
                # Widens race window when lock is disabled for F1 positive control
                time.sleep(0.05)
            at_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            claim_id = hashlib.sha256(
                f"{candidate['requestId']}|{os.getpid()}|{at_iso}|{os.urandom(8).hex()}".encode(
                    "utf-8"
                )
            ).hexdigest()[:16]
            claim_record = {
                "type": "claim",
                "requestId": candidate["requestId"],
                "claimId": claim_id,
                "seatId": seat,
                "tool": tool,
                "digest": sha256_arg,
                "at": at_iso,
            }
            target_file = resolve_target_file(
                approvals_dir, candidate.get("source_file"), now_utc
            )
            append_jsonl_safely(target_file, claim_record)
            print(
                json.dumps(
                    {
                        "requestId": candidate["requestId"],
                        "status": "approved",
                        "expiresAt": dec["expiresAt"],
                        "claimId": claim_id,
                    }
                )
            )
            sys.exit(0)

        print(
            json.dumps(
                {
                    "requestId": candidate["requestId"],
                    "status": "approved",
                    "expiresAt": dec["expiresAt"],
                }
            )
        )
        sys.exit(0)


if __name__ == "__main__":
    main()
