#!/usr/bin/env bash
# seat-release.sh: Release a claimed seat
# Schema v01 per PCN specification KHUON-TRUONG-SEAT-ACTIVE_v01_20261012.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SEAT="${1:-}"
REASON="${2:-released}"

if [[ -z "$SEAT" ]]; then
  echo "Usage: $0 <seat> [reason]" >&2
  exit 2
fi

SEAT_DIR=""
if [[ -d "$REPO_ROOT/departments/marketing/seats/$SEAT" ]]; then
  SEAT_DIR="$REPO_ROOT/departments/marketing/seats/$SEAT"
elif [[ -d "$REPO_ROOT/operations/data/seats/$SEAT" ]]; then
  SEAT_DIR="$REPO_ROOT/operations/data/seats/$SEAT"
else
  SEAT_DIR="$REPO_ROOT/departments/marketing/seats/$SEAT"
fi

OPS_DIR="$REPO_ROOT/operations/data/seats/$SEAT"
ACTIVE_FILE="$SEAT_DIR/seat-active.json"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S%z")

if [[ -f "$ACTIVE_FILE" ]]; then
  PREV_RECORD=$(cat "$ACTIVE_FILE")
  LOG_ENTRY=$(echo "$PREV_RECORD" | jq -c --arg end "$NOW_ISO" --arg reason "$REASON" '. + {ended_at: $end, reason: $reason}')
  echo "$LOG_ENTRY" >> "$SEAT_DIR/seat-log.jsonl"
  if [[ -d "$OPS_DIR" && "$SEAT_DIR" != "$OPS_DIR" ]]; then
    echo "$LOG_ENTRY" >> "$OPS_DIR/seat-log.jsonl" 2>/dev/null || true
  fi
  rm -f "$ACTIVE_FILE"
fi

if [[ -f "$OPS_DIR/seat-active.json" && "$SEAT_DIR" != "$OPS_DIR" ]]; then
  rm -f "$OPS_DIR/seat-active.json"
fi

echo "Seat '$SEAT' released (reason: $REASON)"
exit 0
