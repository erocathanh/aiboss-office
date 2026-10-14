#!/usr/bin/env python3
"""approval_check.py — CLI contract for H4 hook to verify (and optionally claim/consume) an approval.

Usage:
  python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex> [--consume] [--request-id <id>]
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

ISO_ASCII_RE = re.compile(
    r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$"
)
HEX16_RE = re.compile(r"^[0-9a-f]{16}$")
HEX_DIGEST_RE = re.compile(r"^[0-9a-f]{16,128}$")
STALE_UNMEASURABLE_LOCK_MS = 30000


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


def days_in_utc_month(year: int, month: int) -> int:
    if month == 2:
        is_leap = (year % 4 == 0) and (year % 100 != 0 or year % 400 == 0)
        return 29 if is_leap else 28
    if month in (4, 6, 9, 11):
        return 30
    return 31


def parse_strict_iso_ms(iso_str: Any) -> Optional[int]:
    """Strictly parse an ISO-8601 timestamp using ASCII digits and truncate to milliseconds (F2c, F5)."""
    if not isinstance(iso_str, str):
        return None
    s = iso_str.strip()
    if not s:
        return None
    m = ISO_ASCII_RE.match(s)
    if not m:
        return None

    year = int(m.group(1))
    month = int(m.group(2))
    day = int(m.group(3))
    hour = int(m.group(4))
    minute = int(m.group(5))
    second = int(m.group(6))
    frac_str = m.group(7) or ""
    tz_full = m.group(8)
    tz_sign = m.group(9)
    tz_hour_str = m.group(10)
    tz_min_str = m.group(11)

    if year < 1 or year > 9999:
        return None
    if month < 1 or month > 12:
        return None
    max_day = days_in_utc_month(year, month)
    if day < 1 or day > max_day:
        return None
    if hour < 0 or hour > 23:
        return None
    if minute < 0 or minute > 59:
        return None
    if second < 0 or second > 59:
        return None

    ms = int((frac_str + "000")[:3]) if frac_str else 0

    offset_minutes = 0
    if tz_full != "Z":
        off_hour = int(tz_hour_str)
        off_min = int(tz_min_str)
        if off_hour < 0 or off_hour > 23 or off_min < 0 or off_min > 59:
            return None
        offset_minutes = (1 if tz_sign == "+" else -1) * (off_hour * 60 + off_min)

    try:
        tz_obj = (
            timezone.utc
            if tz_full == "Z"
            else timezone(timedelta(minutes=offset_minutes))
        )
        dt = datetime(
            year, month, day, hour, minute, second, ms * 1000, tzinfo=tz_obj
        ).astimezone(timezone.utc)
        epoch_sec = int(
            (
                dt.replace(microsecond=0)
                - datetime(1970, 1, 1, tzinfo=timezone.utc)
            ).total_seconds()
        )
        return epoch_sec * 1000 + (dt.microsecond // 1000)
    except ValueError:
        return None


def parse_strict_iso_utc(iso_str: Any) -> Optional[datetime]:
    ms = parse_strict_iso_ms(iso_str)
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)


parse_iso_ts_ms = parse_strict_iso_ms


def current_utc_ms(now_utc: Optional[datetime] = None) -> int:
    if now_utc is not None:
        return int(now_utc.timestamp() * 1000)
    return int(time.time() * 1000)


def is_pid_alive(pid: int) -> bool:
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
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
        and bool((os.environ.get("AIBOSS_DATA_DIR") or "").strip())
    )


def inspect_lock_staleness(lock_path: str, now_ms: int) -> Optional[Dict[str, Any]]:
    """Unified stale lock inspection matching TypeScript `inspectLockStaleness` (F1b)."""
    try:
        st = os.stat(lock_path)
        with open(lock_path, "r", encoding="utf-8") as fh:
            raw = fh.read()
        trimmed = raw.strip()
        if trimmed:
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, dict):
                    holder_pid = parsed.get("pid")
                    if (
                        isinstance(holder_pid, int)
                        and not isinstance(holder_pid, bool)
                        and holder_pid > 0
                    ):
                        return {
                            "is_stale": not is_pid_alive(holder_pid),
                            "ino": st.st_ino,
                            "raw": raw,
                        }
            except Exception:
                pass
        age_ms = now_ms - int(st.st_mtime * 1000)
        return {
            "is_stale": age_ms > STALE_UNMEASURABLE_LOCK_MS,
            "ino": st.st_ino,
            "raw": raw,
        }
    except OSError:
        return None


def is_lock_file_stale(lock_path: str, now_ms: Optional[int] = None) -> bool:
    info = inspect_lock_staleness(
        lock_path, now_ms if now_ms is not None else current_utc_ms()
    )
    return bool(info and info.get("is_stale"))


def try_reclaim_stale_lock(
    approvals_dir: str, lock_path: str, observed: Dict[str, Any]
) -> None:
    """Safely reclaim an orphan lock file using atomic `rename` under `.approvals.reclaim.lock` (F1b)."""
    reclaim_guard_path = os.path.join(approvals_dir, ".approvals.reclaim.lock")
    guard_tmp = os.path.join(
        approvals_dir,
        f".approvals.reclaim.tmp-{os.getpid()}-{time.time_ns()}",
    )
    guard_acquired = False

    try:
        fd = os.open(guard_tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        try:
            os.write(
                fd,
                json.dumps(
                    {"pid": os.getpid(), "createdAt": current_utc_ms()}
                ).encode("utf-8"),
            )
        finally:
            os.close(fd)

        try:
            os.link(guard_tmp, reclaim_guard_path)
            guard_acquired = True
        except OSError:
            guard_check = inspect_lock_staleness(reclaim_guard_path, current_utc_ms())
            if guard_check and guard_check["is_stale"]:
                stale_guard = f"{reclaim_guard_path}.stale-{os.getpid()}-{time.time_ns()}"
                try:
                    os.rename(reclaim_guard_path, stale_guard)
                    os.unlink(stale_guard)
                except OSError:
                    pass
            return

        recheck = inspect_lock_staleness(lock_path, current_utc_ms())
        if (
            not recheck
            or not recheck["is_stale"]
            or recheck["ino"] != observed["ino"]
            or recheck["raw"] != observed["raw"]
        ):
            return

        stale_target = f"{lock_path}.stale-{os.getpid()}-{time.time_ns()}"
        try:
            os.rename(lock_path, stale_target)
            try:
                os.unlink(stale_target)
            except OSError:
                pass
        except OSError:
            pass
    finally:
        try:
            os.unlink(guard_tmp)
        except OSError:
            pass
        if guard_acquired:
            try:
                os.unlink(reclaim_guard_path)
            except OSError:
                pass


@contextmanager
def with_approval_lock(approvals_dir: str, timeout_sec: float = 5.0) -> Iterator[None]:
    """Cross-process atomic lock on `<approvals_dir>/.approvals.lock` (F1b)."""
    if is_lock_disabled_for_test():
        yield
        return

    os.makedirs(approvals_dir, exist_ok=True)
    lock_path = os.path.join(approvals_dir, ".approvals.lock")
    token = f"{os.getpid()}-{current_utc_ms()}-{os.urandom(6).hex()}"
    tmp_path = f"{lock_path}.tmp-{os.getpid()}-{token}"
    deadline = time.monotonic() + timeout_sec

    payload = json.dumps(
        {
            "pid": os.getpid(),
            "token": token,
            "createdAt": current_utc_ms(),
        }
    ).encode("utf-8")
    tmp_fd = os.open(tmp_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.write(tmp_fd, payload)
        os.fsync(tmp_fd)
    finally:
        os.close(tmp_fd)

    acquired = False
    try:
        while True:
            try:
                os.link(tmp_path, lock_path)
                acquired = True
                break
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise
                inspection = inspect_lock_staleness(lock_path, current_utc_ms())
                if inspection and inspection["is_stale"]:
                    try_reclaim_stale_lock(approvals_dir, lock_path, inspection)
                    continue
                if time.monotonic() >= deadline:
                    sys.stderr.write(
                        f"[approval_check] Timed out acquiring lock {lock_path}\n"
                    )
                    sys.exit(2)
                time.sleep(0.01)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    try:
        yield
    finally:
        if acquired:
            try:
                with open(lock_path, "r", encoding="utf-8") as fh:
                    current_raw = fh.read().strip()
                if current_raw:
                    current_obj = json.loads(current_raw)
                    if isinstance(current_obj, dict) and current_obj.get("token") == token:
                        rel_path = f"{lock_path}.rel-{os.getpid()}-{token}"
                        try:
                            os.rename(lock_path, rel_path)
                            os.unlink(rel_path)
                        except OSError:
                            pass
            except Exception:
                pass


def append_jsonl_safely(file_path: str, record: Dict[str, Any]) -> None:
    """Atomic O_APPEND write with newline boundary check under lock (F3, F10)."""
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    fd = os.open(file_path, os.O_CREAT | os.O_RDWR | os.O_APPEND, 0o644)
    try:
        st = os.fstat(fd)
        prefix = ""
        if st.st_size > 0:
            last_byte = os.pread(fd, 1, st.st_size - 1)
            if last_byte != b"\n":
                prefix = "\n"
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
    """Fold approval ledger with unified transition and strict type validation matching TypeScript `foldApprovalLedger` (F1, F2, F5, F11)."""
    files = list_ledger_files(approvals_dir, now_utc)
    entries: Dict[str, Dict[str, Any]] = {}
    order_counter = 0

    for file_path in files:
        try:
            with open(file_path, "r", encoding="utf-8") as fh:
                for raw_line in fh:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if not isinstance(obj, dict):
                        continue

                    rec_type = obj.get("type")
                    if rec_type is None or rec_type == "request":
                        raw_ts = obj.get("ts")
                        raw_seat = obj.get("seat")
                        raw_tool = obj.get("tool")
                        raw_sha = obj.get("sha256")
                        if (
                            not isinstance(raw_ts, str)
                            or not isinstance(raw_seat, str)
                            or not isinstance(raw_tool, str)
                            or not isinstance(raw_sha, str)
                        ):
                            continue
                        ts = raw_ts.strip()
                        seat = raw_seat.strip()
                        tool = raw_tool.strip()
                        sha256_val = raw_sha.strip().lower()
                        if (
                            not ts
                            or not seat
                            or not tool
                            or not HEX_DIGEST_RE.match(sha256_val)
                        ):
                            continue
                        ts_ms = parse_strict_iso_ms(ts)
                        if ts_ms is None:
                            continue
                        order_counter += 1
                        req_id = compute_request_id(ts, seat, tool, sha256_val)
                        if req_id not in entries:
                            entries[req_id] = {
                                "requestId": req_id,
                                "ts": ts,
                                "ts_ms": ts_ms,
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
                        raw_req_id = obj.get("requestId")
                        dec_val = obj.get("decision")
                        by_val = obj.get("by")
                        raw_at = obj.get("at")
                        raw_exp = obj.get("expiresAt")
                        if (
                            not isinstance(raw_req_id, str)
                            or not isinstance(raw_at, str)
                            or not isinstance(raw_exp, str)
                        ):
                            continue
                        req_id = raw_req_id.strip().lower()
                        at_val = raw_at.strip()
                        exp_val = raw_exp.strip()
                        if (
                            not HEX16_RE.match(req_id)
                            or dec_val not in ("approved", "denied")
                            or by_val not in ("owner", "localhost")
                        ):
                            continue
                        if "note" in obj:
                            note_val = obj.get("note")
                            if not isinstance(note_val, str) or len(note_val) > 200:
                                continue
                        at_ms = parse_strict_iso_ms(at_val)
                        exp_ms = parse_strict_iso_ms(exp_val)
                        if at_ms is None or exp_ms is None:
                            continue
                        order_counter += 1
                        if req_id not in entries or entries[req_id]["decision"] is not None:
                            continue
                        entries[req_id]["decision"] = {
                            "decision": dec_val,
                            "by": by_val,
                            "at": at_val,
                            "at_ms": at_ms,
                            "expiresAt": exp_val,
                            "exp_ms": exp_ms,
                        }
                    elif rec_type == "claim":
                        raw_req_id = obj.get("requestId")
                        raw_claim_id = obj.get("claimId")
                        raw_at = obj.get("at")
                        if (
                            not isinstance(raw_req_id, str)
                            or not isinstance(raw_claim_id, str)
                            or not isinstance(raw_at, str)
                        ):
                            continue
                        if "seatId" in obj and not isinstance(obj.get("seatId"), str):
                            continue
                        if "tool" in obj and not isinstance(obj.get("tool"), str):
                            continue
                        if "digest" in obj and not isinstance(obj.get("digest"), str):
                            continue
                        req_id = raw_req_id.strip().lower()
                        claim_id = raw_claim_id.strip()
                        seat_id = (
                            obj["seatId"].strip()
                            if isinstance(obj.get("seatId"), str)
                            else ""
                        )
                        tool_val = (
                            obj["tool"].strip()
                            if isinstance(obj.get("tool"), str)
                            else ""
                        )
                        digest_val = (
                            obj["digest"].strip().lower()
                            if isinstance(obj.get("digest"), str)
                            else ""
                        )
                        at_val = raw_at.strip()
                        claim_ms = parse_strict_iso_ms(at_val)
                        if (
                            not HEX16_RE.match(req_id)
                            or not claim_id
                            or claim_ms is None
                            or (digest_val != "" and not HEX_DIGEST_RE.match(digest_val))
                        ):
                            continue
                        order_counter += 1
                        if req_id not in entries:
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
                        if digest_val and digest_val != entry["sha256"]:
                            continue
                        if claim_ms < dec["at_ms"] or claim_ms >= dec["exp_ms"]:
                            continue
                        entry["claim"] = {
                            "claimId": claim_id,
                            "seatId": seat_id or entry["seat"],
                            "tool": tool_val or entry["tool"],
                            "digest": digest_val or entry["sha256"],
                            "at": at_val,
                            "at_ms": claim_ms,
                        }
                    elif rec_type == "execution":
                        raw_req_id = obj.get("requestId")
                        res_val = obj.get("result")
                        raw_seat_id = obj.get("seatId")
                        raw_digest = obj.get("digest")
                        raw_at = obj.get("at")
                        if (
                            not isinstance(raw_req_id, str)
                            or not isinstance(raw_seat_id, str)
                            or not isinstance(raw_digest, str)
                            or not isinstance(raw_at, str)
                        ):
                            continue
                        if "claimId" in obj and not isinstance(obj.get("claimId"), str):
                            continue
                        if "runId" in obj and not isinstance(obj.get("runId"), str):
                            continue
                        req_id = raw_req_id.strip().lower()
                        seat_id = raw_seat_id.strip()
                        digest_val = raw_digest.strip().lower()
                        at_val = raw_at.strip()
                        exec_ms = parse_strict_iso_ms(at_val)
                        claim_id_val = (
                            obj["claimId"].strip()
                            if isinstance(obj.get("claimId"), str)
                            and obj["claimId"].strip()
                            else None
                        )
                        if (
                            not HEX16_RE.match(req_id)
                            or not seat_id
                            or exec_ms is None
                            or res_val not in ("executed", "failed")
                            or not HEX_DIGEST_RE.match(digest_val)
                        ):
                            continue
                        order_counter += 1
                        if req_id not in entries:
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
                        if exec_ms < dec["at_ms"]:
                            continue
                        if entry["claim"] is not None:
                            if claim_id_val != entry["claim"]["claimId"]:
                                continue
                        elif exec_ms >= dec["exp_ms"]:
                            continue
                        entry["execution"] = {
                            "result": res_val,
                            "seatId": seat_id,
                            "at": at_val,
                            "at_ms": exec_ms,
                            "digest": digest_val,
                            "claimId": claim_id_val,
                        }
        except OSError:
            continue

    return entries


def is_entry_active_approved(entry: Dict[str, Any], now_ms: int) -> bool:
    dec = entry.get("decision")
    claim = entry.get("claim")
    exe = entry.get("execution")
    if not dec or dec.get("decision") != "approved":
        return False
    if exe is not None or claim is not None:
        return False
    exp_ms = dec.get("exp_ms")
    at_ms = dec.get("at_ms")
    # F5 & F11: Fail-closed on invalid timestamps, future `at`, or expired `expiresAt`
    if exp_ms is None or at_ms is None or now_ms < at_ms or now_ms >= exp_ms:
        return False
    return True


def derive_non_active_status(
    entry: Dict[str, Any], now_ms: int
) -> Tuple[str, Optional[str], Optional[str]]:
    dec = entry.get("decision")
    claim = entry.get("claim")
    exe = entry.get("execution")
    if dec is None:
        return ("pending", None, None)
    if dec.get("decision") == "denied":
        return ("denied", dec.get("expiresAt"), None)
    exp_ms = dec.get("exp_ms")
    at_ms = dec.get("at_ms")
    if exp_ms is None or at_ms is None:
        return ("expired", dec.get("expiresAt"), None)
    if exe is not None:
        return (
            str(exe.get("result") or "executed"),
            dec.get("expiresAt"),
            exe.get("claimId"),
        )
    if claim is not None:
        return ("claimed", dec.get("expiresAt"), claim.get("claimId"))
    if now_ms < at_ms:
        return ("not_yet_valid", dec.get("expiresAt"), None)
    if now_ms >= exp_ms:
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
        help="Optional explicit 16-hex requestId to confirm against newest request",
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
        now_ms = current_utc_ms()
        now_utc = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc)
        entries = load_folded_ledger(approvals_dir, now_utc)

        seat_tool_entries = [
            e
            for e in entries.values()
            if e["seat"] == seat and e["tool"] == tool
        ]
        if not seat_tool_entries:
            out_nf: Dict[str, Any] = {"status": "not_found"}
            if req_id_filter:
                out_nf["requestId"] = req_id_filter
            print(json.dumps(out_nf))
            sys.exit(2)

        # F4: Sort by parsed UTC millisecond epoch and ledger order index
        seat_tool_entries.sort(key=lambda e: (e["ts_ms"], e["order_index"]))

        # F4: Select the NEWEST request for (seat, tool, sha256) FIRST
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

        # F4: Confirm --request-id (if provided) matches the newest request; never consume an older superseded request
        if req_id_filter is not None and candidate["requestId"] != req_id_filter:
            matched_old = any(
                e["requestId"] == req_id_filter for e in seat_tool_entries
            )
            if matched_old:
                print(
                    json.dumps(
                        {
                            "requestId": req_id_filter,
                            "latestRequestId": candidate["requestId"],
                            "status": "superseded",
                        }
                    )
                )
            else:
                print(
                    json.dumps(
                        {
                            "requestId": req_id_filter,
                            "status": "not_found",
                        }
                    )
                )
            sys.exit(2)

        if not is_entry_active_approved(candidate, now_ms):
            status, exp_at, claim_id = derive_non_active_status(candidate, now_ms)
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
