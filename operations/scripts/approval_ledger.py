#!/usr/bin/env python3
"""approval_ledger.py — Single source of truth for approval ledger locking, reading/folding, and writing (A-4 v06).

Design (A-4 v06):
  1. OS-level exclusive lock: `fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)` on `<approvals_dir>/.approvals.lock`
     (file descriptor kept open across the critical section; OS kernel automatically releases the lock on crash/SIGKILL).
     Monotonic 5s deadline -> `lock_timeout` (exit 2). Zero orphan lock reclaim, inode checks, bootId/hostname, or tmp/stale sweep.
  2. Single Python writer (`append_jsonl_safely`): loops `os.write` until all bytes are written (F20), calls `os.fsync(fd)`,
     and reads back the tail of `fd` to verify the written line ends with LF and parses cleanly via `strict_json_loads`.
     Any short write, parse failure, or I/O error raises `ApprovalIoError` (`io_error`, exit 2, never returns approved).
  3. Single Python reader/folder (`read_and_fold_ledger` & `dump --json`): reads `.jsonl` files in binary mode,
     splits strictly on `b"\\n"` (bare CR is never a line separator), skips lines with invalid UTF-8, leading UTF-8 BOM,
     or non-standard JSON (`NaN`/`Infinity`), and raises `ApprovalLedgerUnreadableError` (`ledger_unreadable`, exit 2) on any file read error (F17).
  4. CLI subcommands for TypeScript thin client and H4 hooks:
     - `dump [--status ...] [--seat ...] [--request-id ...] [--limit ...] [--now-ms ...] [--records] --json`
     - `decide --request-id <id> --decision <approved|denied> --by <owner|localhost> [--note <str>] [--at <iso>] [--ttl-minutes <n>] [--now-ms <ms>]`
     - `check --seat <slug> --tool <tool> --sha256 <hex> [--consume] [--request-id <id>]`
     - `mark --request-id <id> --result <executed|failed> [--claim-id <id>] [--run-id <id>] [--digest <hex>] [--at <iso>] [--now-ms <ms>] [--no-idempotent] [--include-item]`
"""

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import errno
import fcntl
import hashlib
import json
import math
import os
import re
import sys
import time
from typing import Any, Dict, Iterator, List, Optional, Tuple

ASCII_WS = " \t\r\n"

ISO_ASCII_RE = re.compile(
    r"^(19[7-9][0-9]|[2-9][0-9]{3})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$"
)
HEX16_RE = re.compile(r"^[0-9a-f]{16}$")
HEX_DIGEST_RE = re.compile(r"^[0-9a-f]{16,128}$")

MIN_VALID_UTC_MS = 0
MAX_VALID_UTC_MS = 253402300799999

H1_VIETNAMESE_REASON_RULES: List[Tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"công cụ mcp|mcp.*gửi dữ liệu ra bên ngoài", re.IGNORECASE),
        "mcp_external_send",
    ),
    (
        re.compile(r"tệp cấu hình\s*\(-k/--config\)|-k/--config", re.IGNORECASE),
        "curl_config_flag",
    ),
    (
        re.compile(
            r"fetch_page_messages\.py|truy xuất tin nhắn hộp thư", re.IGNORECASE
        ),
        "inbox_message_fetch",
    ),
    (
        re.compile(
            r"graph\.facebook\.com.*/messages|gửi tin nhắn\s*\(/messages\)",
            re.IGNORECASE,
        ),
        "facebook_graph_messages",
    ),
    (
        re.compile(r"batch request.*graph\.facebook\.com", re.IGNORECASE),
        "facebook_graph_batch",
    ),
    (
        re.compile(
            r"lệnh post gửi tin nhắn/email|post gửi tin nhắn", re.IGNORECASE
        ),
        "external_post_send",
    ),
    (
        re.compile(
            r"kết nối gửi tin/email ra dịch vụ bên ngoài", re.IGNORECASE
        ),
        "external_endpoint_send",
    ),
]

_ACTIVE_REQUEST_ID: Optional[str] = None


class ApprovalLockTimeoutError(Exception):
    def __init__(self, lock_path: str, request_id: Optional[str] = None) -> None:
        super().__init__(f"Timed out acquiring approval lock {lock_path}")
        self.code = "lock_timeout"
        self.status = "lock_timeout"
        self.lock_path = lock_path
        self.request_id = request_id


class ApprovalLedgerUnreadableError(Exception):
    def __init__(
        self,
        file_path: str,
        reason: str = "EIO",
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(f"Approval ledger unreadable: {file_path} ({reason})")
        self.code = "ledger_unreadable"
        self.status = "ledger_unreadable"
        self.file = os.path.basename(file_path) or file_path
        self.file_path = file_path
        self.reason = reason
        self.request_id = request_id


class ApprovalIoError(Exception):
    def __init__(
        self,
        reason: str = "EIO",
        request_id: Optional[str] = None,
        detail: str = "",
    ) -> None:
        super().__init__(
            f"Approval I/O error ({reason}){': ' + detail if detail else ''}"
        )
        self.code = "io_error"
        self.status = "io_error"
        self.reason = reason
        self.request_id = request_id


def _errno_name(exc: BaseException) -> str:
    if isinstance(exc, OSError) and exc.errno is not None:
        return errno.errorcode.get(exc.errno, str(exc.errno))
    if isinstance(exc, PermissionError):
        return "EACCES"
    if isinstance(exc, FileNotFoundError):
        return "ENOENT"
    return "EIO"


def _reject_json_constant(val: str) -> Any:
    raise ValueError(f"Non-standard JSON constant rejected: {val}")


def strict_json_loads(s: str) -> Any:
    """Parse JSON strictly according to RFC 8259, rejecting NaN/Infinity/-Infinity (F2)."""
    return json.loads(s, parse_constant=_reject_json_constant)


def strip_ascii(s: str) -> str:
    """Strip ONLY ASCII whitespace `[ \\t\\r\\n]`, preserving U+FEFF and non-ASCII characters (F2)."""
    return s.strip(ASCII_WS)


def normalize_approval_reason(raw_reason: Any) -> str:
    """Normalize legacy Vietnamese H1 reason strings to clean ASCII codes (F9)."""
    s = strip_ascii(raw_reason) if isinstance(raw_reason, str) else ""
    if not s:
        return "guarded_external_action"
    for pattern, code in H1_VIETNAMESE_REASON_RULES:
        if pattern.search(s):
            return code
    if any(ord(ch) > 0x7F for ch in s):
        return "guarded_external_action"
    return s[:200]


def sanitize_head60_ascii(raw_head60: Any) -> str:
    """Ensure `head60` is strictly printable ASCII and capped at 60 characters."""
    s = raw_head60[:60] if isinstance(raw_head60, str) else ""
    if not s:
        return ""
    if any(ord(ch) > 0x7F for ch in s):
        return "".join(ch if 0x20 <= ord(ch) <= 0x7E else "?" for ch in s)
    return s


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

    raise ApprovalIoError(
        "ENOENT",
        _ACTIVE_REQUEST_ID,
        f"Could not locate AIBOSS Office root from '{start}'",
    )


def get_approvals_dir() -> str:
    env_data_dir = os.environ.get("AIBOSS_DATA_DIR")
    if env_data_dir and strip_ascii(env_data_dir):
        return os.path.join(os.path.abspath(strip_ascii(env_data_dir)), "approvals")
    root = find_office_root()
    return os.path.join(root, "operations", "data", "approvals")


def get_default_ttl_minutes() -> float:
    try:
        root = find_office_root()
        cfg_path = os.path.join(root, "config", "office.json")
        with open(cfg_path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
        ttl = cfg.get("approvals", {}).get("ttlMinutes")
        if (
            isinstance(ttl, (int, float))
            and not isinstance(ttl, bool)
            and math.isfinite(ttl)
            and ttl > 0
        ):
            return float(ttl)
    except Exception:
        pass
    return 60.0


def compute_request_id(ts: str, seat: str, tool: str, sha256_hex: str) -> str:
    payload = (
        f"{strip_ascii(ts)}|{strip_ascii(seat)}|{strip_ascii(tool)}|{strip_ascii(sha256_hex).lower()}".encode(
            "utf-8"
        )
    )
    return hashlib.sha256(payload).hexdigest()[:16]


def days_in_utc_month(year: int, month: int) -> int:
    if month == 2:
        is_leap = (year % 4 == 0) and (year % 100 != 0 or year % 400 == 0)
        return 29 if is_leap else 28
    if month in (4, 6, 9, 11):
        return 30
    return 31


def parse_strict_iso_ms(iso_str: Any) -> Optional[int]:
    """Strictly parse an ISO-8601 timestamp in 1970-9999 using ASCII digits and truncate to milliseconds (F2c, F5)."""
    if not isinstance(iso_str, str):
        return None
    s = strip_ascii(iso_str)
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

    if year < 1970 or year > 9999:
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
        if dt.year < 1970 or dt.year > 9999:
            return None
        epoch_sec = int(
            (
                dt.replace(microsecond=0)
                - datetime(1970, 1, 1, tzinfo=timezone.utc)
            ).total_seconds()
        )
        epoch_ms = epoch_sec * 1000 + (dt.microsecond // 1000)
        if epoch_ms < MIN_VALID_UTC_MS or epoch_ms > MAX_VALID_UTC_MS:
            return None
        return epoch_ms
    except (ValueError, OverflowError):
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


def format_utc_ms_iso(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def is_lock_disabled_for_test() -> bool:
    """Single positive-control test switch (Case 15); affects only Python locking."""
    return (
        os.environ.get("NODE_ENV") != "production"
        and os.environ.get("AIBOSS_TEST_DISABLE_APPROVAL_LOCK") == "1"
        and bool(strip_ascii(os.environ.get("AIBOSS_DATA_DIR") or ""))
    )


@contextmanager
def with_approval_lock(
    approvals_dir: str,
    timeout_sec: float = 5.0,
    request_id: Optional[str] = None,
) -> Iterator[None]:
    """OS-level exclusive lock via `fcntl.flock(fd, LOCK_EX | LOCK_NB)` on `<approvals_dir>/.approvals.lock` (A-4 v06 Item 1).

    - Keeps `fd` open across the entire critical section (`yield`); never unlinks or renames `.approvals.lock`.
    - When a lock holder process crashes or receives `SIGKILL` (`kill -9`), the OS kernel immediately closes `fd`
      and releases the lock without any stale-lock recovery code.
    - Enforces a monotonic deadline (`timeout_sec`, default 5.0s) and raises `ApprovalLockTimeoutError` (`lock_timeout`).
    """
    global _ACTIVE_REQUEST_ID
    if is_lock_disabled_for_test():
        yield
        return

    prev_req_id = _ACTIVE_REQUEST_ID
    if request_id is not None:
        _ACTIVE_REQUEST_ID = request_id

    lock_path = os.path.join(approvals_dir, ".approvals.lock")
    try:
        os.makedirs(approvals_dir, exist_ok=True)
        if not os.access(approvals_dir, os.W_OK | os.X_OK):
            raise PermissionError(
                errno.EACCES, os.strerror(errno.EACCES), approvals_dir
            )
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    except OSError as exc:
        _ACTIVE_REQUEST_ID = prev_req_id
        raise ApprovalIoError(_errno_name(exc), request_id, str(exc)) from exc

    deadline = time.monotonic() + timeout_sec
    acquired = False
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
                break
            except OSError as exc:
                if exc.errno not in (
                    errno.EACCES,
                    errno.EAGAIN,
                    errno.EWOULDBLOCK,
                ):
                    raise ApprovalIoError(
                        _errno_name(exc), request_id, str(exc)
                    ) from exc
                rem = deadline - time.monotonic()
                if rem <= 0:
                    raise ApprovalLockTimeoutError(lock_path, request_id) from exc
                time.sleep(min(0.02, max(0.001, rem)))
                if time.monotonic() >= deadline:
                    raise ApprovalLockTimeoutError(lock_path, request_id) from exc
        yield
    finally:
        _ACTIVE_REQUEST_ID = prev_req_id
        if acquired:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
        try:
            os.close(fd)
        except OSError:
            pass


def append_jsonl_safely(file_path: str, record: Dict[str, Any]) -> None:
    """Single safe JSONL writer (A-4 v06 Item 2, F3, F10, F18, F20):

    - Opens `file_path` with `O_CREAT | O_RDWR | O_APPEND`.
    - Repairs a partial tail lacking a trailing LF by prepending `b"\\n"`.
    - Loops `os.write` until all bytes are written; aborts with `ApprovalIoError` if `os.write` returns `<= 0`
      or fails to complete on retry (F20).
    - Calls `os.fsync(fd)` and reads back the tail of `fd` to verify that the written line is complete on disk,
      ends with `b"\\n"`, and parses via `strict_json_loads` to match `record` (F20).
    """
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        fd = os.open(file_path, os.O_CREAT | os.O_RDWR | os.O_APPEND, 0o644)
    except OSError as exc:
        raise ApprovalIoError(
            _errno_name(exc), _ACTIVE_REQUEST_ID, str(exc)
        ) from exc

    try:
        try:
            st_before = os.fstat(fd)
            prefix = b""
            if st_before.st_size > 0:
                last_byte = os.pread(fd, 1, st_before.st_size - 1)
                if last_byte != b"\n":
                    prefix = b"\n"
            record_line_bytes = (
                json.dumps(record, ensure_ascii=False) + "\n"
            ).encode("utf-8")
            line_bytes = prefix + record_line_bytes

            total_len = len(line_bytes)
            written = 0
            attempts = 0
            while written < total_len:
                attempts += 1
                n = os.write(fd, line_bytes[written:])
                if not isinstance(n, int) or n <= 0:
                    raise ApprovalIoError(
                        "EIO",
                        _ACTIVE_REQUEST_ID,
                        f"Short write on {os.path.basename(file_path)}: wrote {written}/{total_len} bytes",
                    )
                if attempts > 1 and (written + n) < total_len:
                    raise ApprovalIoError(
                        "EIO",
                        _ACTIVE_REQUEST_ID,
                        f"Persistent short write on {os.path.basename(file_path)}: wrote {written + n}/{total_len} bytes",
                    )
                written += n

            os.fsync(fd)

            st_after = os.fstat(fd)
            expected_tail_len = len(record_line_bytes)
            if st_after.st_size < expected_tail_len:
                raise ApprovalIoError(
                    "EIO",
                    _ACTIVE_REQUEST_ID,
                    f"Tail readback size {st_after.st_size} < expected {expected_tail_len}",
                )
            tail_bytes = os.pread(
                fd, expected_tail_len, st_after.st_size - expected_tail_len
            )
            if not tail_bytes.endswith(b"\n"):
                raise ApprovalIoError(
                    "EIO",
                    _ACTIVE_REQUEST_ID,
                    "Tail readback missing trailing newline",
                )
            try:
                tail_str = tail_bytes[:-1].decode("utf-8", errors="strict")
                if tail_str.startswith("\ufeff") or strip_ascii(
                    tail_str
                ).startswith("\ufeff"):
                    raise ValueError("Unexpected BOM in written tail")
                parsed_tail = strict_json_loads(tail_str)
            except Exception as parse_exc:
                raise ApprovalIoError(
                    "EIO",
                    _ACTIVE_REQUEST_ID,
                    f"Tail readback failed JSON parse: {parse_exc}",
                ) from parse_exc
            if not isinstance(parsed_tail, dict) or parsed_tail != record:
                raise ApprovalIoError(
                    "EIO",
                    _ACTIVE_REQUEST_ID,
                    "Tail readback record mismatch",
                )
        except ApprovalIoError:
            raise
        except OSError as exc:
            raise ApprovalIoError(
                _errno_name(exc), _ACTIVE_REQUEST_ID, str(exc)
            ) from exc
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


def resolve_target_file(
    approvals_dir: str, source_file: Optional[str], now_utc: datetime
) -> str:
    try:
        os.makedirs(approvals_dir, exist_ok=True)
    except OSError as exc:
        raise ApprovalIoError(
            _errno_name(exc), _ACTIVE_REQUEST_ID, str(exc)
        ) from exc
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


def list_ledger_files(
    approvals_dir: str, now_utc: Optional[datetime] = None
) -> List[str]:
    """List `.jsonl` ledger files in `approvals_dir`; fail-closed on any directory read error other than ENOENT (F17)."""
    try:
        dir_entries = os.listdir(approvals_dir)
    except FileNotFoundError:
        return []
    except OSError as exc:
        raise ApprovalLedgerUnreadableError(
            approvals_dir, _errno_name(exc), _ACTIVE_REQUEST_ID
        ) from exc

    all_jsonl = sorted(f for f in dir_entries if f.endswith(".jsonl"))
    return [os.path.join(approvals_dir, f) for f in all_jsonl]


def parse_ledger_line_bytes(raw_line_bytes: bytes) -> Optional[Dict[str, Any]]:
    """Parse a single `b"\\n"`-delimited binary line according to A-4 v06 Item 3 (F2):
    - Rejects empty lines.
    - Rejects lines starting with UTF-8 BOM (`\\xef\\xbb\\xbf` / `U+FEFF`).
    - Rejects invalid UTF-8 byte sequences.
    - Rejects non-standard JSON (`NaN`, `Infinity`, `-Infinity`) or bare-CR-concatenated objects.
    """
    if not raw_line_bytes:
        return None
    if raw_line_bytes.startswith(b"\xef\xbb\xbf"):
        return None
    try:
        raw_line = raw_line_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return None
    if raw_line.startswith("\ufeff"):
        return None
    line = strip_ascii(raw_line)
    if not line or line.startswith("\ufeff"):
        return None
    try:
        obj = strict_json_loads(line)
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    return obj


def sanitize_record_obj(obj: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Validate and normalize a parsed JSON dictionary into a canonical ledger record (F1, F2, F5, F6, F9)."""
    has_type_key = "type" in obj
    rec_type = obj.get("type")

    if (not has_type_key) or rec_type == "request":
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
            return None
        ts = strip_ascii(raw_ts)
        seat = strip_ascii(raw_seat)
        tool = strip_ascii(raw_tool)
        sha256_val = strip_ascii(raw_sha).lower()
        if (
            not ts
            or not seat
            or not tool
            or not HEX_DIGEST_RE.match(sha256_val)
        ):
            return None
        ts_ms = parse_strict_iso_ms(ts)
        if ts_ms is None:
            return None
        raw_host = obj.get("host")
        host = (
            strip_ascii(raw_host)
            if isinstance(raw_host, str) and strip_ascii(raw_host)
            else "-"
        )
        raw_len = obj.get("len")
        length = (
            int(math.floor(raw_len))
            if isinstance(raw_len, (int, float))
            and not isinstance(raw_len, bool)
            and math.isfinite(raw_len)
            and raw_len >= 0
            else 0
        )
        head60 = sanitize_head60_ascii(obj.get("head60"))
        reason = normalize_approval_reason(obj.get("reason"))
        req_id = compute_request_id(ts, seat, tool, sha256_val)
        return {
            "type": "request",
            "requestId": req_id,
            "ts": ts,
            "ts_ms": ts_ms,
            "seat": seat,
            "tool": tool,
            "host": host,
            "len": length,
            "sha256": sha256_val,
            "head60": head60,
            "reason": reason,
        }

    if rec_type == "decision":
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
            return None
        req_id = strip_ascii(raw_req_id).lower()
        at_val = strip_ascii(raw_at)
        exp_val = strip_ascii(raw_exp)
        if (
            not HEX16_RE.match(req_id)
            or dec_val not in ("approved", "denied")
            or by_val not in ("owner", "localhost")
        ):
            return None
        note_clean: Optional[str] = None
        if "note" in obj:
            note_val = obj.get("note")
            if not isinstance(note_val, str) or len(note_val) > 200:
                return None
            trimmed_note = strip_ascii(note_val)
            if trimmed_note:
                note_clean = trimmed_note
        at_ms = parse_strict_iso_ms(at_val)
        exp_ms = parse_strict_iso_ms(exp_val)
        if at_ms is None or exp_ms is None:
            return None
        res_dec: Dict[str, Any] = {
            "type": "decision",
            "requestId": req_id,
            "decision": dec_val,
            "by": by_val,
            "at": at_val,
            "at_ms": at_ms,
            "expiresAt": exp_val,
            "exp_ms": exp_ms,
        }
        if note_clean is not None:
            res_dec["note"] = note_clean
        return res_dec

    if rec_type == "claim":
        raw_req_id = obj.get("requestId")
        raw_claim_id = obj.get("claimId")
        raw_at = obj.get("at")
        if (
            not isinstance(raw_req_id, str)
            or not isinstance(raw_claim_id, str)
            or not isinstance(raw_at, str)
        ):
            return None
        if "seatId" in obj and not isinstance(obj.get("seatId"), str):
            return None
        if "tool" in obj and not isinstance(obj.get("tool"), str):
            return None
        if "digest" in obj and not isinstance(obj.get("digest"), str):
            return None
        req_id = strip_ascii(raw_req_id).lower()
        claim_id = strip_ascii(raw_claim_id)
        seat_id = (
            strip_ascii(obj["seatId"])
            if isinstance(obj.get("seatId"), str)
            else ""
        )
        tool_val = (
            strip_ascii(obj["tool"])
            if isinstance(obj.get("tool"), str)
            else ""
        )
        digest_val = (
            strip_ascii(obj["digest"]).lower()
            if isinstance(obj.get("digest"), str)
            else ""
        )
        at_val = strip_ascii(raw_at)
        claim_ms = parse_strict_iso_ms(at_val)
        if (
            not HEX16_RE.match(req_id)
            or not claim_id
            or claim_ms is None
            or (digest_val != "" and not HEX_DIGEST_RE.match(digest_val))
        ):
            return None
        return {
            "type": "claim",
            "requestId": req_id,
            "claimId": claim_id,
            "seatId": seat_id,
            "tool": tool_val,
            "digest": digest_val,
            "at": at_val,
            "at_ms": claim_ms,
        }

    if rec_type == "execution":
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
            return None
        if "claimId" in obj and not isinstance(obj.get("claimId"), str):
            return None
        if "runId" in obj and not isinstance(obj.get("runId"), str):
            return None
        req_id = strip_ascii(raw_req_id).lower()
        seat_id = strip_ascii(raw_seat_id)
        digest_val = strip_ascii(raw_digest).lower()
        at_val = strip_ascii(raw_at)
        exec_ms = parse_strict_iso_ms(at_val)
        claim_id_val = (
            strip_ascii(obj["claimId"])
            if isinstance(obj.get("claimId"), str)
            and strip_ascii(obj["claimId"])
            else None
        )
        run_id_val = (
            strip_ascii(obj["runId"])
            if isinstance(obj.get("runId"), str) and strip_ascii(obj["runId"])
            else None
        )
        if (
            not HEX16_RE.match(req_id)
            or not seat_id
            or exec_ms is None
            or res_val not in ("executed", "failed")
            or not HEX_DIGEST_RE.match(digest_val)
        ):
            return None
        res_exe: Dict[str, Any] = {
            "type": "execution",
            "requestId": req_id,
            "seatId": seat_id,
            "at": at_val,
            "at_ms": exec_ms,
            "result": res_val,
            "digest": digest_val,
            "claimId": claim_id_val,
            "runId": run_id_val,
        }
        return res_exe

    return None


def to_public_record(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Strip internal `_ms` fields to produce clean `ApprovalLedgerRecord` objects."""
    rtype = rec["type"]
    if rtype == "request":
        return {
            "type": "request",
            "requestId": rec["requestId"],
            "ts": rec["ts"],
            "seat": rec["seat"],
            "tool": rec["tool"],
            "host": rec["host"],
            "len": rec["len"],
            "sha256": rec["sha256"],
            "head60": rec["head60"],
            "reason": rec["reason"],
        }
    if rtype == "decision":
        out_d: Dict[str, Any] = {
            "type": "decision",
            "requestId": rec["requestId"],
            "decision": rec["decision"],
            "by": rec["by"],
            "at": rec["at"],
            "expiresAt": rec["expiresAt"],
        }
        if rec.get("note"):
            out_d["note"] = rec["note"]
        return out_d
    if rtype == "claim":
        return {
            "type": "claim",
            "requestId": rec["requestId"],
            "claimId": rec["claimId"],
            "seatId": rec["seatId"],
            "tool": rec["tool"],
            "digest": rec["digest"],
            "at": rec["at"],
        }
    out_e: Dict[str, Any] = {
        "type": "execution",
        "requestId": rec["requestId"],
        "seatId": rec["seatId"],
        "at": rec["at"],
        "result": rec["result"],
        "digest": rec["digest"],
    }
    if rec.get("claimId"):
        out_e["claimId"] = rec["claimId"]
    if rec.get("runId"):
        out_e["runId"] = rec["runId"]
    return out_e


def read_and_fold_ledger(
    approvals_dir: str, now_utc: Optional[datetime] = None
) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    """Single unified reader and state machine folder for the approval ledger (A-4 v06 Item 3, F1, F2, F5, F11, F17)."""
    files = list_ledger_files(approvals_dir, now_utc)
    entries: Dict[str, Dict[str, Any]] = {}
    records: List[Dict[str, Any]] = []
    order_counter = 0

    for file_path in files:
        try:
            with open(file_path, "rb") as fh:
                raw_bytes = fh.read()
        except OSError as exc:
            raise ApprovalLedgerUnreadableError(
                file_path, _errno_name(exc), _ACTIVE_REQUEST_ID
            ) from exc

        for raw_line_bytes in raw_bytes.split(b"\n"):
            obj = parse_ledger_line_bytes(raw_line_bytes)
            if obj is None:
                continue
            rec = sanitize_record_obj(obj)
            if rec is None:
                continue

            records.append(to_public_record(rec))
            order_counter += 1
            rtype = rec["type"]

            if rtype == "request":
                req_id = rec["requestId"]
                if req_id not in entries:
                    entries[req_id] = {
                        "requestId": req_id,
                        "ts": rec["ts"],
                        "ts_ms": rec["ts_ms"],
                        "order_index": order_counter,
                        "seat": rec["seat"],
                        "tool": rec["tool"],
                        "host": rec["host"],
                        "len": rec["len"],
                        "sha256": rec["sha256"],
                        "head60": rec["head60"],
                        "reason": rec["reason"],
                        "source_file": file_path,
                        "decision": None,
                        "claim": None,
                        "execution": None,
                    }
            elif rtype == "decision":
                req_id = rec["requestId"]
                if req_id not in entries or entries[req_id]["decision"] is not None:
                    continue
                entries[req_id]["decision"] = rec
            elif rtype == "claim":
                req_id = rec["requestId"]
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
                seat_id = rec["seatId"]
                tool_val = rec["tool"]
                digest_val = rec["digest"]
                claim_ms = rec["at_ms"]
                if seat_id and seat_id != entry["seat"]:
                    continue
                if tool_val and tool_val != entry["tool"]:
                    continue
                if digest_val and digest_val != entry["sha256"]:
                    continue
                if claim_ms < dec["at_ms"] or claim_ms >= dec["exp_ms"]:
                    continue
                entry["claim"] = {
                    "claimId": rec["claimId"],
                    "seatId": seat_id or entry["seat"],
                    "tool": tool_val or entry["tool"],
                    "digest": digest_val or entry["sha256"],
                    "at": rec["at"],
                    "at_ms": claim_ms,
                }
            elif rtype == "execution":
                req_id = rec["requestId"]
                if req_id not in entries:
                    continue
                entry = entries[req_id]
                if entry["execution"] is not None:
                    continue
                dec = entry["decision"]
                if dec is None or dec["decision"] != "approved":
                    continue
                if (
                    rec["seatId"] != entry["seat"]
                    or rec["digest"] != entry["sha256"]
                ):
                    continue
                exec_ms = rec["at_ms"]
                if exec_ms < dec["at_ms"]:
                    continue
                if entry["claim"] is not None:
                    if rec["claimId"] != entry["claim"]["claimId"]:
                        continue
                elif exec_ms >= dec["exp_ms"]:
                    continue
                entry["execution"] = rec

    return entries, records


def load_folded_ledger(
    approvals_dir: str, now_utc: Optional[datetime] = None
) -> Dict[str, Dict[str, Any]]:
    entries, _ = read_and_fold_ledger(approvals_dir, now_utc)
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


def build_approval_item(entry: Dict[str, Any], now_ms: int) -> Dict[str, Any]:
    """Derive a sanitized `ApprovalItem` dictionary from a folded ledger entry."""
    dec = entry.get("decision")
    claim = entry.get("claim")
    exe = entry.get("execution")

    state = "requested"
    status = "pending"
    if dec is None:
        state = "requested"
        status = "pending"
    elif dec.get("decision") == "denied":
        state = "denied"
        status = "denied"
    elif dec.get("decision") == "approved":
        exp_ms = dec.get("exp_ms")
        at_ms = dec.get("at_ms")
        if exp_ms is None or at_ms is None:
            state = "expired"
            status = "expired"
        elif exe is not None:
            if exe.get("result") == "executed":
                state = "executed"
                status = "executed"
            else:
                state = "failed"
                status = "failed"
        elif now_ms < at_ms:
            state = "not_yet_valid"
            status = "pending"
        elif now_ms >= exp_ms and claim is None:
            state = "expired"
            status = "expired"
        else:
            state = "approved"
            status = "approved"

    decision_obj: Optional[Dict[str, Any]] = None
    if dec is not None:
        decision_obj = {
            "decision": dec["decision"],
            "by": dec["by"],
            "at": dec["at"],
            "expiresAt": dec["expiresAt"],
        }
        if dec.get("note"):
            decision_obj["note"] = dec["note"]

    claim_obj: Optional[Dict[str, Any]] = None
    if claim is not None:
        claim_obj = {
            "claimId": claim["claimId"],
            "at": claim["at"],
            "seatId": claim["seatId"],
            "tool": claim["tool"],
            "digest": claim["digest"],
        }

    execution_obj: Optional[Dict[str, Any]] = None
    if exe is not None:
        execution_obj = {
            "result": exe["result"],
            "at": exe["at"],
            "digest": exe["digest"],
            "seatId": exe["seatId"],
        }
        if exe.get("claimId"):
            execution_obj["claimId"] = exe["claimId"]
        if exe.get("runId"):
            execution_obj["runId"] = exe["runId"]

    item: Dict[str, Any] = {
        "requestId": entry["requestId"],
        "status": status,
        "state": state,
        "ts": entry["ts"],
        "seat": entry["seat"],
        "tool": entry["tool"],
        "host": entry["host"],
        "len": entry["len"],
        "sha256": entry["sha256"],
        "head60": sanitize_head60_ascii(entry["head60"]),
        "reason": normalize_approval_reason(entry["reason"]),
        "decision": decision_obj,
        "execution": execution_obj,
    }
    if claim_obj is not None:
        item["claim"] = claim_obj
    if decision_obj is not None:
        item["decidedBy"] = decision_obj["by"]
        item["decidedAt"] = decision_obj["at"]
        item["expiresAt"] = decision_obj["expiresAt"]
        if "note" in decision_obj:
            item["note"] = decision_obj["note"]
    if claim_obj is not None:
        item["claimId"] = claim_obj["claimId"]
        item["claimedAt"] = claim_obj["at"]
    if execution_obj is not None:
        item["executedAt"] = execution_obj["at"]
        item["executionResult"] = execution_obj["result"]
        item["executionDigest"] = execution_obj["digest"]
        if "runId" in execution_obj:
            item["runId"] = execution_obj["runId"]
    return item


def run_cli_with_error_boundary(
    fn: Any, script_name: str = "approval_ledger"
) -> None:
    """Outer CLI boundary catching lock/ledger/I/O errors and outputting structured JSON on exit 2 (F17, F18)."""
    try:
        fn()
    except SystemExit:
        raise
    except ApprovalLockTimeoutError as exc:
        out_to: Dict[str, Any] = {"status": "lock_timeout"}
        req_id = exc.request_id or _ACTIVE_REQUEST_ID
        if req_id:
            out_to["requestId"] = req_id
        print(json.dumps(out_to), flush=True)
        sys.stderr.write(f"[{script_name}] {exc}\n")
        sys.exit(2)
    except ApprovalLedgerUnreadableError as exc:
        out_unr: Dict[str, Any] = {
            "status": "ledger_unreadable",
            "file": exc.file,
            "reason": exc.reason,
        }
        req_id = exc.request_id or _ACTIVE_REQUEST_ID
        if req_id:
            out_unr["requestId"] = req_id
        print(json.dumps(out_unr), flush=True)
        sys.stderr.write(f"[{script_name}] {exc}\n")
        sys.exit(2)
    except ApprovalIoError as exc:
        out_io: Dict[str, Any] = {
            "status": "io_error",
            "reason": exc.reason,
        }
        req_id = exc.request_id or _ACTIVE_REQUEST_ID
        if req_id:
            out_io["requestId"] = req_id
        print(json.dumps(out_io), flush=True)
        sys.stderr.write(f"[{script_name}] {exc}\n")
        sys.exit(2)
    except OSError as exc:
        out_os: Dict[str, Any] = {
            "status": "io_error",
            "reason": _errno_name(exc),
        }
        if _ACTIVE_REQUEST_ID:
            out_os["requestId"] = _ACTIVE_REQUEST_ID
        print(json.dumps(out_os), flush=True)
        sys.stderr.write(f"[{script_name}] I/O error: {exc}\n")
        sys.exit(2)
    except Exception as exc:
        out_err: Dict[str, Any] = {
            "status": "io_error",
            "reason": "EIO",
        }
        if _ACTIVE_REQUEST_ID:
            out_err["requestId"] = _ACTIVE_REQUEST_ID
        print(json.dumps(out_err), flush=True)
        sys.stderr.write(f"[{script_name}] Unexpected error: {exc}\n")
        sys.exit(2)


def run_check_command(
    seat: str,
    tool: str,
    sha256_arg: str,
    consume: bool = False,
    request_id: Optional[str] = None,
) -> None:
    """Execute `approval_check.py` logic under `with_approval_lock`."""
    global _ACTIVE_REQUEST_ID
    seat_clean = strip_ascii(seat)
    tool_clean = strip_ascii(tool)
    sha_clean = strip_ascii(sha256_arg).lower()
    req_id_filter = (
        strip_ascii(request_id).lower()
        if request_id and strip_ascii(request_id)
        else None
    )
    _ACTIVE_REQUEST_ID = req_id_filter

    approvals_dir = get_approvals_dir()

    with with_approval_lock(approvals_dir, request_id=req_id_filter):
        now_ms = current_utc_ms()
        now_utc = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc)
        entries = load_folded_ledger(approvals_dir, now_utc)

        seat_tool_entries = [
            e
            for e in entries.values()
            if e["seat"] == seat_clean and e["tool"] == tool_clean
        ]
        if not seat_tool_entries:
            out_nf: Dict[str, Any] = {"status": "not_found"}
            if req_id_filter:
                out_nf["requestId"] = req_id_filter
            print(json.dumps(out_nf))
            sys.exit(2)

        seat_tool_entries.sort(key=lambda e: (e["ts_ms"], e["order_index"]))

        exact_matches = [
            e for e in seat_tool_entries if e["sha256"] == sha_clean
        ]
        candidate = exact_matches[-1] if exact_matches else seat_tool_entries[-1]

        if candidate["sha256"] != sha_clean:
            print(
                json.dumps(
                    {
                        "requestId": candidate["requestId"],
                        "status": "digest_mismatch",
                    }
                )
            )
            sys.exit(2)

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
        if consume:
            if is_lock_disabled_for_test():
                time.sleep(0.05)
            at_iso = format_utc_ms_iso(now_ms)
            claim_id = hashlib.sha256(
                f"{candidate['requestId']}|{os.getpid()}|{at_iso}|{os.urandom(8).hex()}".encode(
                    "utf-8"
                )
            ).hexdigest()[:16]
            claim_record = {
                "type": "claim",
                "requestId": candidate["requestId"],
                "claimId": claim_id,
                "seatId": seat_clean,
                "tool": tool_clean,
                "digest": sha_clean,
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


def run_mark_command(
    request_id: str,
    result: str,
    claim_id: Optional[str] = None,
    run_id: Optional[str] = None,
    digest: Optional[str] = None,
    at_override: Optional[str] = None,
    now_ms_override: Optional[int] = None,
    idempotent: bool = True,
    include_item: bool = False,
) -> None:
    """Execute `approval_mark.py` / `recordApprovalExecution` logic under `with_approval_lock`."""
    global _ACTIVE_REQUEST_ID
    req_id_target = strip_ascii(request_id).lower()
    result_arg = strip_ascii(result)
    claim_id_arg = (
        strip_ascii(claim_id) if claim_id and strip_ascii(claim_id) else None
    )
    run_id_arg = strip_ascii(run_id) if run_id and strip_ascii(run_id) else None
    digest_arg = (
        strip_ascii(digest).lower() if digest and strip_ascii(digest) else None
    )
    _ACTIVE_REQUEST_ID = req_id_target

    approvals_dir = get_approvals_dir()

    with with_approval_lock(approvals_dir, request_id=req_id_target):
        now_ms = (
            now_ms_override if now_ms_override is not None else current_utc_ms()
        )
        now_utc = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc)
        entries = load_folded_ledger(approvals_dir, now_utc)
        entry = entries.get(req_id_target)

        def fail_out(status_code: str, msg: str) -> None:
            payload: Dict[str, Any] = {
                "ok": False,
                "requestId": req_id_target,
                "status": status_code,
                "message": msg,
            }
            if include_item and entry is not None:
                payload["item"] = build_approval_item(entry, now_ms)
            print(json.dumps(payload))
            sys.exit(2)

        if entry is None:
            fail_out("not_found", f'Approval request "{req_id_target}" not found.')

        assert entry is not None
        at_iso = (
            strip_ascii(at_override)
            if at_override and strip_ascii(at_override)
            else format_utc_ms_iso(now_ms)
        )
        at_ms = parse_strict_iso_ms(at_iso)
        if at_ms is None:
            fail_out("expired", "Invalid execution timestamp.")
        assert at_ms is not None

        existing_execution = entry.get("execution")
        if existing_execution is not None:
            existing_res = existing_execution.get("result")
            existing_claim = existing_execution.get("claimId")
            if (
                idempotent
                and existing_res == result_arg
                and ((existing_claim or None) == (claim_id_arg or None))
                and (digest_arg is None or digest_arg == entry["sha256"])
            ):
                out_idem: Dict[str, Any] = {
                    "ok": True,
                    "requestId": req_id_target,
                    "status": existing_res,
                    "idempotent": True,
                }
                if existing_claim:
                    out_idem["claimId"] = existing_claim
                if include_item:
                    out_idem["executionRecord"] = to_public_record(
                        existing_execution
                    )
                    out_idem["item"] = build_approval_item(entry, now_ms)
                print(json.dumps(out_idem))
                sys.exit(0)
            conflict_status = (
                "digest_mismatch" if include_item else "already_executed"
            )
            fail_out(
                conflict_status,
                f'Approval request "{req_id_target}" was already used once.',
            )

        dec = entry.get("decision")
        if dec is None:
            fail_out(
                "pending",
                f'Approval request "{req_id_target}" is still pending decision.',
            )
        assert dec is not None

        if dec.get("decision") == "denied":
            fail_out("denied", f'Approval request "{req_id_target}" was denied.')

        exp_ms = dec.get("exp_ms")
        dec_at_ms = dec.get("at_ms")
        if exp_ms is None or dec_at_ms is None:
            fail_out(
                "expired",
                f'Approval request "{req_id_target}" has invalid decision timestamps.',
            )
        assert exp_ms is not None and dec_at_ms is not None

        if now_ms < dec_at_ms or at_ms < dec_at_ms:
            fail_out(
                "not_yet_valid",
                f'Approval request "{req_id_target}" decision timestamp is in the future.',
            )

        claim = entry.get("claim")
        effective_claim_id: Optional[str] = None
        if claim is not None:
            if not claim_id_arg or claim_id_arg != claim.get("claimId"):
                fail_out(
                    "claim_mismatch",
                    f'Claim ID mismatch for approval request "{req_id_target}".',
                )
            effective_claim_id = claim.get("claimId")
        else:
            if claim_id_arg is not None:
                fail_out(
                    "claim_mismatch",
                    f'No active claim exists for approval request "{req_id_target}".',
                )
            if now_ms >= exp_ms or at_ms >= exp_ms:
                fail_out(
                    "expired",
                    f'Approval request "{req_id_target}" has expired.',
                )

        if digest_arg is not None and digest_arg != entry["sha256"]:
            fail_out(
                "digest_mismatch",
                f'Digest mismatch for approval request "{req_id_target}".',
            )

        if is_lock_disabled_for_test():
            time.sleep(0.05)

        record: Dict[str, Any] = {
            "type": "execution",
            "requestId": req_id_target,
        }
        if effective_claim_id:
            record["claimId"] = effective_claim_id
        if run_id_arg:
            record["runId"] = run_id_arg
        record["seatId"] = entry["seat"]
        record["at"] = at_iso
        record["result"] = result_arg
        record["digest"] = entry["sha256"]

        target_dt = datetime.fromtimestamp(at_ms / 1000.0, tz=timezone.utc)
        target_file = resolve_target_file(
            approvals_dir, entry.get("source_file"), target_dt
        )
        append_jsonl_safely(target_file, record)

        entry["execution"] = sanitize_record_obj(record)
        out: Dict[str, Any] = {
            "ok": True,
            "requestId": req_id_target,
            "status": result_arg,
            "idempotent": False,
        }
        if effective_claim_id:
            out["claimId"] = effective_claim_id
        if include_item:
            out["executionRecord"] = record
            out["item"] = build_approval_item(entry, now_ms)
        print(json.dumps(out))
        sys.exit(0)


def run_decide_command(
    request_id: str,
    decision: str,
    by: str,
    note: Optional[str] = None,
    at_override: Optional[str] = None,
    ttl_minutes_override: Optional[float] = None,
    now_ms_override: Optional[int] = None,
) -> None:
    """Record an approval decision (`approved` | `denied`) under `with_approval_lock` (A-4 v06 Item 2)."""
    global _ACTIVE_REQUEST_ID
    req_id_target = strip_ascii(request_id or "").lower()
    _ACTIVE_REQUEST_ID = req_id_target or None

    if not req_id_target:
        print(
            json.dumps(
                {
                    "ok": False,
                    "status": "invalid_input",
                    "httpStatus": 400,
                    "code": "invalid_input",
                    "message": "Missing requestId.",
                }
            )
        )
        sys.exit(2)

    if decision not in ("approved", "denied"):
        print(
            json.dumps(
                {
                    "ok": False,
                    "status": "invalid_input",
                    "httpStatus": 400,
                    "code": "invalid_input",
                    "message": 'Decision must be "approved" or "denied".',
                }
            )
        )
        sys.exit(2)

    if by not in ("owner", "localhost"):
        print(
            json.dumps(
                {
                    "ok": False,
                    "status": "invalid_input",
                    "httpStatus": 400,
                    "code": "invalid_input",
                    "message": 'Invalid actor `by`; must be "owner" or "localhost".',
                }
            )
        )
        sys.exit(2)

    note_clean: Optional[str] = None
    if note is not None:
        if len(note) > 200:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "status": "invalid_input",
                        "httpStatus": 400,
                        "code": "invalid_input",
                        "message": "Field `note` must not exceed 200 characters.",
                    }
                )
            )
            sys.exit(2)
        trimmed_note = strip_ascii(note)
        if trimmed_note:
            note_clean = trimmed_note

    approvals_dir = get_approvals_dir()

    with with_approval_lock(approvals_dir, request_id=req_id_target):
        now_ms = (
            now_ms_override if now_ms_override is not None else current_utc_ms()
        )
        now_utc = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc)
        entries = load_folded_ledger(approvals_dir, now_utc)
        existing = entries.get(req_id_target)

        if existing is None:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "status": "not_found",
                        "httpStatus": 404,
                        "code": "not_found",
                        "message": f'Approval request "{req_id_target}" not found.',
                    }
                )
            )
            sys.exit(2)

        if existing["decision"] is not None:
            dec_val = existing["decision"]["decision"]
            print(
                json.dumps(
                    {
                        "ok": False,
                        "status": "already_decided",
                        "httpStatus": 409,
                        "code": "already_decided",
                        "message": f'Approval request "{req_id_target}" has already been decided ({dec_val}).',
                        "item": build_approval_item(existing, now_ms),
                    }
                )
            )
            sys.exit(2)

        at_iso = (
            strip_ascii(at_override)
            if at_override and strip_ascii(at_override)
            else format_utc_ms_iso(now_ms)
        )
        at_ms = parse_strict_iso_ms(at_iso)
        if at_ms is None:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "status": "invalid_input",
                        "httpStatus": 400,
                        "code": "invalid_input",
                        "message": "Invalid ISO timestamp `at`.",
                    }
                )
            )
            sys.exit(2)

        ttl_minutes = (
            ttl_minutes_override
            if ttl_minutes_override is not None
            else get_default_ttl_minutes()
        )
        exp_ms = int(round(at_ms + ttl_minutes * 60000.0))
        expires_at_iso = format_utc_ms_iso(exp_ms)

        decision_record: Dict[str, Any] = {
            "type": "decision",
            "requestId": req_id_target,
            "decision": decision,
            "by": by,
            "at": at_iso,
        }
        if note_clean is not None:
            decision_record["note"] = note_clean
        decision_record["expiresAt"] = expires_at_iso

        target_dt = datetime.fromtimestamp(at_ms / 1000.0, tz=timezone.utc)
        target_file = resolve_target_file(
            approvals_dir, existing.get("source_file"), target_dt
        )
        append_jsonl_safely(target_file, decision_record)

        existing["decision"] = sanitize_record_obj(decision_record)
        updated_item = build_approval_item(existing, now_ms)

        print(
            json.dumps(
                {
                    "ok": True,
                    "status": decision,
                    "httpStatus": 200,
                    "decisionRecord": decision_record,
                    "item": updated_item,
                }
            )
        )
        sys.exit(0)


def run_dump_command(
    status: Optional[str] = None,
    seat: Optional[str] = None,
    request_id: Optional[str] = None,
    limit: int = 50,
    now_ms_override: Optional[int] = None,
    include_records: bool = False,
) -> None:
    """Dump folded approval items (and optional raw sanitized records) as JSON (A-4 v06 Item 3)."""
    global _ACTIVE_REQUEST_ID
    req_id_filter = (
        strip_ascii(request_id).lower()
        if request_id and strip_ascii(request_id)
        else None
    )
    _ACTIVE_REQUEST_ID = req_id_filter

    now_ms = (
        now_ms_override if now_ms_override is not None else current_utc_ms()
    )
    now_utc = datetime.fromtimestamp(now_ms / 1000.0, tz=timezone.utc)
    approvals_dir = get_approvals_dir()

    entries, records = read_and_fold_ledger(approvals_dir, now_utc)

    if req_id_filter is not None:
        entry = entries.get(req_id_filter)
        item = build_approval_item(entry, now_ms) if entry is not None else None
        out_single: Dict[str, Any] = {
            "status": "ok",
            "item": item,
            "approvals": [item] if item is not None else [],
            "total": 1 if item is not None else 0,
        }
        if include_records:
            out_single["records"] = records
        print(json.dumps(out_single))
        sys.exit(0)

    sorted_entries = sorted(
        entries.values(),
        key=lambda e: (e["ts_ms"], e["order_index"]),
        reverse=True,
    )
    all_items = [build_approval_item(e, now_ms) for e in sorted_entries]

    status_filter = (
        strip_ascii(status).lower() if status and strip_ascii(status) else None
    )
    seat_filter = strip_ascii(seat) if seat and strip_ascii(seat) else None

    filtered: List[Dict[str, Any]] = []
    for item in all_items:
        if seat_filter and item["seat"] != seat_filter:
            continue
        if not status_filter or status_filter == "all":
            filtered.append(item)
        elif status_filter in ("pending", "requested"):
            if item["status"] == "pending" or item["state"] == "requested":
                filtered.append(item)
        elif item["status"] == status_filter or item["state"] == status_filter:
            filtered.append(item)

    clamped_limit = max(1, min(limit, 500))
    out_dump: Dict[str, Any] = {
        "status": "ok",
        "approvals": filtered[:clamped_limit],
        "total": len(filtered),
    }
    if include_records:
        out_dump["records"] = records
    print(json.dumps(out_dump))
    sys.exit(0)


def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Unified AIBOSS Office approval ledger CLI (dump, decide, check, mark)."
    )
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # dump
    p_dump = subparsers.add_parser("dump", help="Dump folded ledger state as JSON")
    p_dump.add_argument("--status", required=False, help="Filter by status")
    p_dump.add_argument("--seat", required=False, help="Filter by seat")
    p_dump.add_argument("--request-id", required=False, help="Filter by requestId")
    p_dump.add_argument("--limit", type=int, default=50, help="Max items to return")
    p_dump.add_argument("--now-ms", type=int, required=False, help="Override current UTC ms")
    p_dump.add_argument("--records", action="store_true", help="Include sanitized ledger records")
    p_dump.add_argument("--json", action="store_true", help="Output JSON")

    # decide
    p_decide = subparsers.add_parser("decide", help="Record an approval decision under flock")
    p_decide.add_argument("--request-id", required=True, help="16-hex requestId")
    p_decide.add_argument("--decision", required=True, choices=["approved", "denied"])
    p_decide.add_argument("--by", required=True, choices=["owner", "localhost"])
    p_decide.add_argument("--note", required=False, help="Optional decision note (<= 200 code points)")
    p_decide.add_argument("--at", required=False, help="Optional explicit ISO timestamp")
    p_decide.add_argument("--ttl-minutes", type=float, required=False, help="Optional TTL minutes")
    p_decide.add_argument("--now-ms", type=int, required=False, help="Override current UTC ms")

    # check
    p_check = subparsers.add_parser("check", help="Check (and optionally consume) an approval")
    p_check.add_argument("--seat", required=True)
    p_check.add_argument("--tool", required=True)
    p_check.add_argument("--sha256", required=True)
    p_check.add_argument("--consume", action="store_true")
    p_check.add_argument("--request-id", required=False)

    # mark
    p_mark = subparsers.add_parser("mark", help="Mark an approved request as executed or failed")
    p_mark.add_argument("--request-id", required=True)
    p_mark.add_argument("--result", required=True, choices=["executed", "failed"])
    p_mark.add_argument("--claim-id", required=False)
    p_mark.add_argument("--run-id", required=False)
    p_mark.add_argument("--digest", required=False)
    p_mark.add_argument("--at", required=False)
    p_mark.add_argument("--now-ms", type=int, required=False)
    p_mark.add_argument("--no-idempotent", action="store_true")
    p_mark.add_argument("--include-item", action="store_true")

    args = parser.parse_args()

    if args.subcommand == "dump":
        run_dump_command(
            status=args.status,
            seat=args.seat,
            request_id=args.request_id,
            limit=args.limit,
            now_ms_override=args.now_ms,
            include_records=args.records,
        )
    elif args.subcommand == "decide":
        run_decide_command(
            request_id=args.request_id,
            decision=args.decision,
            by=args.by,
            note=args.note,
            at_override=args.at,
            ttl_minutes_override=args.ttl_minutes,
            now_ms_override=args.now_ms,
        )
    elif args.subcommand == "check":
        run_check_command(
            seat=args.seat,
            tool=args.tool,
            sha256_arg=args.sha256,
            consume=args.consume,
            request_id=args.request_id,
        )
    elif args.subcommand == "mark":
        run_mark_command(
            request_id=args.request_id,
            result=args.result,
            claim_id=args.claim_id,
            run_id=args.run_id,
            digest=args.digest,
            at_override=args.at,
            now_ms_override=args.now_ms,
            idempotent=not args.no_idempotent,
            include_item=args.include_item,
        )


def main() -> None:
    run_cli_with_error_boundary(_main, "approval_ledger")


if __name__ == "__main__":
    main()
