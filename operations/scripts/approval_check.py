#!/usr/bin/env python3
"""approval_check.py — CLI contract for H4 hook to verify (and optionally claim/consume) an approval (A-4 v06).

Usage:
  python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex> [--consume] [--request-id <id>]

Delegates all locking (`fcntl.flock`), reading/folding, and writing (`os.write` loop + `fsync` + tail readback)
to `operations/scripts/approval_ledger.py`.
"""

import argparse

from approval_ledger import (
    ApprovalIoError,
    ApprovalLedgerUnreadableError,
    ApprovalLockTimeoutError,
    append_jsonl_safely,
    build_approval_item,
    compute_request_id,
    current_utc_ms,
    derive_non_active_status,
    find_office_root,
    format_utc_ms_iso,
    get_approvals_dir,
    is_entry_active_approved,
    is_lock_disabled_for_test,
    list_ledger_files,
    load_folded_ledger,
    parse_iso_ts_ms,
    parse_ledger_line_bytes,
    parse_strict_iso_ms,
    parse_strict_iso_utc,
    read_and_fold_ledger,
    resolve_target_file,
    run_check_command,
    run_cli_with_error_boundary,
    sanitize_record_obj,
    strict_json_loads,
    strip_ascii,
    with_approval_lock,
)

__all__ = [
    "ApprovalIoError",
    "ApprovalLedgerUnreadableError",
    "ApprovalLockTimeoutError",
    "append_jsonl_safely",
    "build_approval_item",
    "compute_request_id",
    "current_utc_ms",
    "derive_non_active_status",
    "find_office_root",
    "format_utc_ms_iso",
    "get_approvals_dir",
    "is_entry_active_approved",
    "is_lock_disabled_for_test",
    "list_ledger_files",
    "load_folded_ledger",
    "parse_iso_ts_ms",
    "parse_ledger_line_bytes",
    "parse_strict_iso_ms",
    "parse_strict_iso_utc",
    "read_and_fold_ledger",
    "resolve_target_file",
    "run_check_command",
    "run_cli_with_error_boundary",
    "sanitize_record_obj",
    "strict_json_loads",
    "strip_ascii",
    "with_approval_lock",
]


def _main() -> None:
    parser = argparse.ArgumentParser(
        description="Check if an action has a valid, unexpired, unexecuted approval with matching sha256."
    )
    parser.add_argument("--seat", required=True, help="Seat slug")
    parser.add_argument("--tool", required=True, help="Tool name")
    parser.add_argument(
        "--sha256", required=True, help="SHA-256 hex digest of tool_input"
    )
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

    run_check_command(
        seat=args.seat,
        tool=args.tool,
        sha256_arg=args.sha256,
        consume=bool(args.consume),
        request_id=args.request_id,
    )


def main() -> None:
    run_cli_with_error_boundary(_main, "approval_check")


if __name__ == "__main__":
    main()
