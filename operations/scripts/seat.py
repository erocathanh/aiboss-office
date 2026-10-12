#!/usr/bin/env python3
"""
seat.py: CLI tool for seat claim, release, and inspection.
Schema v01 per PCN specification KHUON-TRUONG-SEAT-ACTIVE_v01_20261012.md
"""

import sys
import os
import json
import socket
import argparse
from datetime import datetime, timezone

def get_repo_root():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(script_dir, "..", ".."))

def resolve_seat_dirs(seat_or_dir):
    repo_root = get_repo_root()
    if os.path.isdir(seat_or_dir):
        seat_dir = os.path.abspath(seat_or_dir)
        seat = os.path.basename(seat_dir)
    else:
        seat = seat_or_dir
        seat_dir = os.path.join(repo_root, "departments", "marketing", "seats", seat)
        if not os.path.isdir(seat_dir):
            seat_dir = os.path.join(repo_root, "operations", "data", "seats", seat)
    
    ops_dir = os.path.join(repo_root, "operations", "data", "seats", seat)
    os.makedirs(seat_dir, exist_ok=True)
    os.makedirs(ops_dir, exist_ok=True)
    return seat, seat_dir, ops_dir

def is_pid_alive(pid):
    if pid is None or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def cmd_claim(args):
    seat, seat_dir, ops_dir = resolve_seat_dirs(args.seat)
    active_path = os.path.join(seat_dir, "seat-active.json")
    
    # Check existing active record
    prev_record = None
    if os.path.exists(active_path):
        try:
            with open(active_path, "r", encoding="utf-8") as f:
                prev_record = json.load(f)
        except Exception:
            pass

    if prev_record and isinstance(prev_record, dict):
        prev_pid = prev_record.get("pid")
        prev_session = prev_record.get("session_id")
        prev_tool = prev_record.get("tool")
        
        if prev_pid and is_pid_alive(prev_pid) and prev_pid != args.pid:
            if prev_session != args.session:
                resume_cmd = prev_record.get("resume_cmd") or f"cd '{seat_dir}' && claude --resume {prev_session}"
                print(f"Seat '{seat}' is held by live process PID {prev_pid} (tool: {prev_tool}, session: {prev_session})", file=sys.stderr)
                print(f"Resume command: {resume_cmd}", file=sys.stderr)
                sys.exit(3)

    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    host = socket.gethostname().split(".")[0]
    resume_cmd = f"cd '{seat_dir}' && claude --resume {args.session}"
    
    record = {
        "schema": 1,
        "seat": seat,
        "tool": args.tool,
        "app": args.app,
        "session_id": args.session,
        "pid": args.pid,
        "cwd": seat_dir,
        "host": host,
        "started_at": prev_record.get("started_at") if (prev_record and prev_record.get("session_id") == args.session) else now_iso,
        "last_write": now_iso,
        "resume_cmd": resume_cmd,
    }

    # Log previous session if changed
    if prev_record and prev_record.get("session_id") and prev_record.get("session_id") != args.session:
        log_entry = dict(prev_record)
        log_entry["ended_at"] = now_iso
        log_entry["reason"] = "session_changed"
        log_line = json.dumps(log_entry, ensure_ascii=False) + "\n"
        with open(os.path.join(seat_dir, "seat-log.jsonl"), "a", encoding="utf-8") as f:
            f.write(log_line)
        if seat_dir != ops_dir:
            with open(os.path.join(ops_dir, "seat-log.jsonl"), "a", encoding="utf-8") as f:
                f.write(log_line)

    # Write atomic
    record_json = json.dumps(record, indent=2, ensure_ascii=False)
    for d in {seat_dir, ops_dir}:
        tmp_file = os.path.join(d, f".seat-active.json.tmp.{os.getpid()}")
        final_file = os.path.join(d, "seat-active.json")
        with open(tmp_file, "w", encoding="utf-8") as f:
            f.write(record_json)
        os.replace(tmp_file, final_file)

    print(f"Seat '{seat}' successfully claimed by {args.tool} (PID {args.pid}, session {args.session})")
    sys.exit(0)

def cmd_release(args):
    seat, seat_dir, ops_dir = resolve_seat_dirs(args.seat)
    now_iso = datetime.now(timezone.utc).astimezone().isoformat()
    
    for d in {seat_dir, ops_dir}:
        active_path = os.path.join(d, "seat-active.json")
        if os.path.exists(active_path):
            try:
                with open(active_path, "r", encoding="utf-8") as f:
                    rec = json.load(f)
                rec["ended_at"] = now_iso
                rec["reason"] = args.reason
                log_line = json.dumps(rec, ensure_ascii=False) + "\n"
                with open(os.path.join(d, "seat-log.jsonl"), "a", encoding="utf-8") as f:
                    f.write(log_line)
            except Exception:
                pass
            try:
                os.remove(active_path)
            except OSError:
                pass

    print(f"Seat '{seat}' released (reason: {args.reason})")
    sys.exit(0)

def cmd_show(args):
    seat, seat_dir, ops_dir = resolve_seat_dirs(args.seat)
    active_path = os.path.join(seat_dir, "seat-active.json")
    if not os.path.exists(active_path):
        active_path = os.path.join(ops_dir, "seat-active.json")

    if not os.path.exists(active_path):
        if args.json:
            print(json.dumps({"seat": seat, "status": "idle", "active": None}))
        else:
            print(f"Seat '{seat}' is empty / idle (no active session)")
        sys.exit(0)

    try:
        with open(active_path, "r", encoding="utf-8") as f:
            rec = json.load(f)
    except Exception as e:
        print(f"Warning: could not read {active_path}: {e}", file=sys.stderr)
        sys.exit(4)

    pid = rec.get("pid")
    alive = is_pid_alive(pid) if pid else False
    rec["pid_alive"] = alive

    if args.json:
        print(json.dumps(rec, indent=2, ensure_ascii=False))
    else:
        print(f"Seat: {rec.get('seat')}")
        print(f"Tool: {rec.get('tool')}")
        print(f"Session: {rec.get('session_id')}")
        print(f"PID: {rec.get('pid')} (alive: {alive})")
        print(f"Resume: {rec.get('resume_cmd')}")
    sys.exit(0)

def main():
    parser = argparse.ArgumentParser(description="Manage seat-active.json")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_claim = subparsers.add_parser("claim")
    p_claim.add_argument("seat", help="Seat identifier or directory")
    p_claim.add_argument("--tool", choices=["app", "terminal", "antigravity"], default="terminal")
    p_claim.add_argument("--session", required=True, help="Session UUID")
    p_claim.add_argument("--pid", type=int, default=os.getpid(), help="Process ID")
    p_claim.add_argument("--app", choices=["aiboss-office", "aiboss-app-chat"], default="aiboss-office")

    p_release = subparsers.add_parser("release")
    p_release.add_argument("seat", help="Seat identifier or directory")
    p_release.add_argument("--reason", choices=["released", "session_changed", "taken_over", "process_gone", "moved"], default="released")

    p_show = subparsers.add_parser("show")
    p_show.add_argument("seat", help="Seat identifier or directory")
    p_show.add_argument("--json", action="store_true", help="Print in JSON format")

    args = parser.parse_args()
    if args.command == "claim":
        cmd_claim(args)
    elif args.command == "release":
        cmd_release(args)
    elif args.command == "show":
        cmd_show(args)

if __name__ == "__main__":
    main()
