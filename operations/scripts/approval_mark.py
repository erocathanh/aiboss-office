#!/usr/bin/env python3
"""approval_mark.py — CLI contract for H4 hook to record execution of an approved request.

Usage:
  python3 operations/scripts/approval_mark.py --request-id <id> --result <executed|failed> [--run-id <runId>]

Behavior:
  - Appends an `execution` record to the approvals ledger:
    {"type": "execution", "requestId": "<id>", "runId": "<runId>", "seatId": "<seat>",
     "at": "<ISO>", "result": "<executed|failed>", "digest": "<sha256>"}
  - Idempotent: if `requestId` already has an execution record in the ledger, exits 0 without writing a duplicate line.
"""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import sys
from typing import Any, Dict, List, Optional


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
        f"[approval_mark] Could not locate AIBOSS Office root from '{start}'\n"
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mark an approval request as executed or failed in the ledger."
    )
    parser.add_argument("--request-id", required=True, help="16-hex requestId")
    parser.add_argument(
        "--result",
        required=True,
        choices=["executed", "failed"],
        help="Execution result (executed or failed)",
    )
    parser.add_argument("--run-id", required=False, help="Optional runId")
    args = parser.parse_args()

    req_id_target = args.request_id.strip().lower()
    result_arg = args.result.strip()
    run_id_arg = args.run_id.strip() if args.run_id and args.run_id.strip() else None

    now_utc = datetime.now(timezone.utc)
    approvals_dir = get_approvals_dir()
    files = list_ledger_files(approvals_dir, now_utc)

    found_request: Optional[Dict[str, Any]] = None
    source_file: Optional[str] = None
    existing_execution: Optional[Dict[str, Any]] = None

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
                        cid = compute_request_id(ts, seat, tool, sha256_val)
                        if cid == req_id_target and found_request is None:
                            found_request = {
                                "requestId": cid,
                                "ts": ts,
                                "seat": seat,
                                "tool": tool,
                                "sha256": sha256_val,
                            }
                            source_file = file_path
                    elif rec_type == "execution":
                        cid = str(obj.get("requestId") or "").strip().lower()
                        res_val = obj.get("result")
                        if (
                            cid == req_id_target
                            and existing_execution is None
                            and res_val in ("executed", "failed", "expired")
                        ):
                            existing_execution = obj
        except OSError:
            continue

    if found_request is None:
        print(
            json.dumps(
                {"requestId": req_id_target, "status": "not_found"}
            )
        )
        sys.exit(2)

    if existing_execution is not None:
        print(
            json.dumps(
                {
                    "requestId": req_id_target,
                    "status": existing_execution.get("result", "executed"),
                    "idempotent": True,
                }
            )
        )
        sys.exit(0)

    at_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    record: Dict[str, Any] = {
        "type": "execution",
        "requestId": req_id_target,
    }
    if run_id_arg:
        record["runId"] = run_id_arg
    record["seatId"] = found_request["seat"]
    record["at"] = at_iso
    record["result"] = result_arg
    record["digest"] = found_request["sha256"]

    target_file = resolve_target_file(approvals_dir, source_file, now_utc)
    with open(target_file, "a", encoding="utf-8") as out_fh:
        out_fh.write(json.dumps(record, ensure_ascii=False) + "\n")

    print(
        json.dumps(
            {
                "requestId": req_id_target,
                "status": result_arg,
                "idempotent": False,
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
