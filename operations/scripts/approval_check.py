#!/usr/bin/env python3
"""approval_check.py — CLI contract for H4 hook to verify an approval before executing a guarded action.

Usage:
  python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex>

Behavior:
  - Reads approval ledger files in <AIBOSS_DATA_DIR>/approvals/ (or <office_root>/operations/data/approvals/),
    prioritizing yesterday's and today's UTC <YYYY-MM-DD>.jsonl files (and any present .jsonl partitions).
  - Computes deterministic requestId = sha256(ts + "|" + seat + "|" + tool + "|" + sha256)[:16].
  - If there is an `approved` decision for (seat, tool) that is not expired, has no execution record yet,
    and its `sha256` matches `--sha256`:
      prints JSON {"requestId": "...", "status": "approved", "expiresAt": "..."} and exits 0.
  - In all other cases (pending, denied, expired, not_found, executed, failed, digest_mismatch):
      prints JSON {"status": "<reason>", ...} and exits 2.
"""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


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


def parse_iso_utc(iso_str: str) -> Optional[datetime]:
    if not iso_str or not isinstance(iso_str, str):
        return None
    s = iso_str.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def list_ledger_files(approvals_dir: str, now_utc: datetime) -> List[str]:
    if not os.path.isdir(approvals_dir):
        return []
    today_name = now_utc.strftime("%Y-%m-%d") + ".jsonl"
    yesterday_name = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d") + ".jsonl"

    all_jsonl = sorted(
        f for f in os.listdir(approvals_dir) if f.endswith(".jsonl")
    )
    ordered: List[str] = []
    for f in all_jsonl:
        ordered.append(os.path.join(approvals_dir, f))

    for priority_name in (yesterday_name, today_name):
        p = os.path.join(approvals_dir, priority_name)
        if os.path.isfile(p) and p not in ordered:
            ordered.append(p)
    return ordered


def load_folded_ledger(
    approvals_dir: str, now_utc: datetime
) -> Dict[str, Dict[str, Any]]:
    files = list_ledger_files(approvals_dir, now_utc)
    entries: Dict[str, Dict[str, Any]] = {}

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
                        ts = str(obj.get("ts") or "").strip()
                        seat = str(obj.get("seat") or "").strip()
                        tool = str(obj.get("tool") or "").strip()
                        sha256_val = str(obj.get("sha256") or "").strip().lower()
                        if not ts or not seat or not tool or not sha256_val:
                            continue
                        req_id = compute_request_id(ts, seat, tool, sha256_val)
                        if req_id not in entries:
                            entries[req_id] = {
                                "requestId": req_id,
                                "ts": ts,
                                "seat": seat,
                                "tool": tool,
                                "sha256": sha256_val,
                                "decision": None,
                                "execution": None,
                            }
                    elif rec_type == "decision":
                        req_id = str(obj.get("requestId") or "").strip().lower()
                        dec_val = obj.get("decision")
                        by_val = obj.get("by")
                        at_val = str(obj.get("at") or "").strip()
                        exp_val = str(obj.get("expiresAt") or "").strip()
                        if (
                            req_id in entries
                            and entries[req_id]["decision"] is None
                            and dec_val in ("approved", "denied")
                            and by_val in ("owner", "localhost")
                            and at_val
                            and exp_val
                        ):
                            entries[req_id]["decision"] = {
                                "decision": dec_val,
                                "by": by_val,
                                "at": at_val,
                                "expiresAt": exp_val,
                            }
                    elif rec_type == "execution":
                        req_id = str(obj.get("requestId") or "").strip().lower()
                        res_val = obj.get("result")
                        if (
                            req_id in entries
                            and entries[req_id]["execution"] is None
                            and res_val in ("executed", "failed", "expired")
                        ):
                            entries[req_id]["execution"] = {
                                "result": res_val,
                                "at": str(obj.get("at") or "").strip(),
                                "digest": str(obj.get("digest") or "").strip().lower(),
                            }
        except OSError:
            continue

    return entries


def is_entry_active_approved(entry: Dict[str, Any], now_utc: datetime) -> bool:
    dec = entry.get("decision")
    exe = entry.get("execution")
    if not dec or dec.get("decision") != "approved":
        return False
    if exe is not None:
        return False
    exp_dt = parse_iso_utc(dec.get("expiresAt", ""))
    if exp_dt is not None and now_utc >= exp_dt:
        return False
    return True


def derive_non_active_status(
    entry: Dict[str, Any], now_utc: datetime
) -> Tuple[str, Optional[str]]:
    dec = entry.get("decision")
    exe = entry.get("execution")
    if dec is None:
        return ("pending", None)
    if dec.get("decision") == "denied":
        return ("denied", dec.get("expiresAt"))
    if exe is not None:
        return (str(exe.get("result") or "executed"), dec.get("expiresAt"))
    exp_dt = parse_iso_utc(dec.get("expiresAt", ""))
    if exp_dt is not None and now_utc >= exp_dt:
        return ("expired", dec.get("expiresAt"))
    return ("approved", dec.get("expiresAt"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check if an action has a valid, unexpired, unexecuted approval with matching sha256."
    )
    parser.add_argument("--seat", required=True, help="Seat slug")
    parser.add_argument("--tool", required=True, help="Tool name")
    parser.add_argument("--sha256", required=True, help="SHA-256 hex digest of tool_input")
    args = parser.parse_args()

    seat = args.seat.strip()
    tool = args.tool.strip()
    sha256_arg = args.sha256.strip().lower()

    now_utc = datetime.now(timezone.utc)
    approvals_dir = get_approvals_dir()
    entries = load_folded_ledger(approvals_dir, now_utc)

    seat_tool_entries = [
        e for e in entries.values() if e["seat"] == seat and e["tool"] == tool
    ]
    if not seat_tool_entries:
        print(json.dumps({"status": "not_found"}))
        sys.exit(2)

    seat_tool_entries.sort(key=lambda e: e["ts"])

    active_approved = [
        e for e in seat_tool_entries if is_entry_active_approved(e, now_utc)
    ]
    if active_approved:
        exact_active = [
            e for e in active_approved if e["sha256"] == sha256_arg
        ]
        candidate = exact_active[-1] if exact_active else active_approved[-1]

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

        dec = candidate["decision"]
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

    exact_matches = [e for e in seat_tool_entries if e["sha256"] == sha256_arg]
    if exact_matches:
        latest = exact_matches[-1]
        status, exp_at = derive_non_active_status(latest, now_utc)
        out: Dict[str, Any] = {
            "requestId": latest["requestId"],
            "status": status,
        }
        if exp_at:
            out["expiresAt"] = exp_at
        print(json.dumps(out))
        sys.exit(2)

    latest_other = seat_tool_entries[-1]
    print(
        json.dumps(
            {
                "requestId": latest_other["requestId"],
                "status": "digest_mismatch",
            }
        )
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
