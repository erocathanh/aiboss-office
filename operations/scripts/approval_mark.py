#!/usr/bin/env python3
"""approval_mark.py — CLI contract for H4 hook to record execution of an approved request (A-4 v06).

Usage:
  python3 operations/scripts/approval_mark.py --request-id <id> --result <executed|failed> [--claim-id <claimId>] [--run-id <runId>]

Delegates all locking (`fcntl.flock`), reading/folding, and writing (`os.write` loop + `fsync` + tail readback)
to `operations/scripts/approval_ledger.py`.
"""

import argparse

from approval_ledger import (
    run_cli_with_error_boundary,
    run_mark_command,
)


def _main() -> None:
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

    run_mark_command(
        request_id=args.request_id,
        result=args.result,
        claim_id=args.claim_id,
        run_id=args.run_id,
        idempotent=True,
        include_item=False,
    )


def main() -> None:
    run_cli_with_error_boundary(_main, "approval_mark")


if __name__ == "__main__":
    main()
