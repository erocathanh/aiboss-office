#!/usr/bin/env python3
"""approval_mark.py — CLI contract for H4 hook to record execution of an approved request.

Usage:
  python3 operations/scripts/approval_mark.py --request-id <id> --result <executed|failed> [--claim-id <claimId>] [--run-id <runId>]

Behavior:
  - Acquires cross-process lock `<approvals_dir>/.approvals.lock` (O_CREAT | O_EXCL via atomic link)
    across read -> validate -> append (F1b).
  - Uses the unified fold and transition rules from `approval_check.py` / `approvals-ledger.ts` (F1, F2, F5).
  - Refuses to record execution (exits 2, 0 lines written) unless `requestId` has a valid `approved`
    decision with `at <= now` (F11) and `now < expiresAt` (F1a) (or has an active matching claim).
  - When `--claim-id` is provided, verifies it matches the active `claim` on `requestId` (exits 2 on mismatch).
  - Uses `O_APPEND` for atomic single-write append and repairs partial tail line boundaries (F3, F10).
  - Idempotent when called again for the same already-executed request with matching result/claimId (exits 0 without duplicate append).
"""

import argparse
from datetime import datetime, timezone
import json
import sys
import time
from typing import Any, Dict, Optional

from approval_check import (
    append_jsonl_safely,
    current_utc_ms,
    get_approvals_dir,
    is_lock_disabled_for_test,
    load_folded_ledger,
    resolve_target_file,
    with_approval_lock,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mark an approved request as executed or failed in the ledger."
    )
    parser.add_argument("--request-id", required=True, help="16-hex requestId")
    parser.add_argument(
        "--result",
        required=True,
        choices=["executed", "failed"],
        help="Execution result (executed or failed)",
    )
    parser.add_argument(
        "--claim-id",
        required=False,
        help="Optional claimId returned by approval_check.py --consume",
    )
    parser.add_argument("--run-id", required=False, help="Optional runId")
    args = parser.parse_args()

    req_id_target = args.request_id.strip().lower()
    result_arg = args.result.strip()
    claim_id_arg = (
        args.claim_id.strip() if args.claim_id and args.claim_id.strip() else None
    )
    run_id_arg = args.run_id.strip() if args.run_id and args.run_id.strip() else None

    approvals_dir = get_approvals_dir()

    with with_approval_lock(approvals_dir):
        now_utc = datetime.now(timezone.utc)
        now_ms = current_utc_ms(now_utc)
        entries = load_folded_ledger(approvals_dir, now_utc)
        entry = entries.get(req_id_target)

        if entry is None:
            print(
                json.dumps(
                    {"requestId": req_id_target, "status": "not_found"}
                )
            )
            sys.exit(2)

        existing_execution = entry.get("execution")
        if existing_execution is not None:
            existing_res = existing_execution.get("result")
            existing_claim = existing_execution.get("claimId")
            if existing_res == result_arg and (
                (existing_claim or None) == (claim_id_arg or None)
            ):
                out_idem: Dict[str, Any] = {
                    "requestId": req_id_target,
                    "status": existing_res,
                    "idempotent": True,
                }
                if existing_claim:
                    out_idem["claimId"] = existing_claim
                print(json.dumps(out_idem))
                sys.exit(0)
            print(
                json.dumps(
                    {
                        "requestId": req_id_target,
                        "status": "already_executed",
                    }
                )
            )
            sys.exit(2)

        dec = entry.get("decision")
        if dec is None:
            print(
                json.dumps(
                    {"requestId": req_id_target, "status": "pending"}
                )
            )
            sys.exit(2)

        if dec.get("decision") == "denied":
            print(
                json.dumps(
                    {"requestId": req_id_target, "status": "denied"}
                )
            )
            sys.exit(2)

        exp_ms = dec.get("exp_ms")
        at_ms = dec.get("at_ms")
        if exp_ms is None or at_ms is None:
            print(
                json.dumps(
                    {"requestId": req_id_target, "status": "expired"}
                )
            )
            sys.exit(2)

        # F11: Future decision.at -> not_yet_valid, exit 2, 0 lines written
        if now_ms < at_ms:
            print(
                json.dumps(
                    {"requestId": req_id_target, "status": "not_yet_valid"}
                )
            )
            sys.exit(2)

        claim = entry.get("claim")
        effective_claim_id: Optional[str] = None
        if claim is not None:
            if not claim_id_arg or claim_id_arg != claim.get("claimId"):
                print(
                    json.dumps(
                        {
                            "requestId": req_id_target,
                            "status": "claim_mismatch",
                        }
                    )
                )
                sys.exit(2)
            effective_claim_id = claim.get("claimId")
        else:
            if claim_id_arg is not None:
                print(
                    json.dumps(
                        {
                            "requestId": req_id_target,
                            "status": "claim_mismatch",
                        }
                    )
                )
                sys.exit(2)
            # F1a: Expired -> exit 2, 0 lines written
            if now_ms >= exp_ms:
                print(
                    json.dumps(
                        {
                            "requestId": req_id_target,
                            "status": "expired",
                        }
                    )
                )
                sys.exit(2)

        if is_lock_disabled_for_test():
            time.sleep(0.05)

        at_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
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

        target_file = resolve_target_file(
            approvals_dir, entry.get("source_file"), now_utc
        )
        append_jsonl_safely(target_file, record)

        out: Dict[str, Any] = {
            "requestId": req_id_target,
            "status": result_arg,
            "idempotent": False,
        }
        if effective_claim_id:
            out["claimId"] = effective_claim_id
        print(json.dumps(out))
        sys.exit(0)


if __name__ == "__main__":
    main()
