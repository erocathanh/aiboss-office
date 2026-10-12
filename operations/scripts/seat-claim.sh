#!/usr/bin/env bash
# seat-claim.sh: Claim a seat for tool (terminal | app | antigravity)
# Schema v01 per PCN specification KHUON-TRUONG-SEAT-ACTIVE_v01_20261012.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SEAT="${1:-}"
TOOL="${2:-terminal}"
SESSION_ID="${3:-}"
PID="${4:-$$}"
APP="${5:-aiboss-office}"

if [[ -z "$SEAT" || -z "$SESSION_ID" ]]; then
  echo "Usage: $0 <seat> <tool> <session_id> [pid] [app]" >&2
  exit 2
fi

# Locate seat directory
SEAT_DIR=""
if [[ -d "$REPO_ROOT/departments/marketing/seats/$SEAT" ]]; then
  SEAT_DIR="$REPO_ROOT/departments/marketing/seats/$SEAT"
elif [[ -d "$REPO_ROOT/operations/data/seats/$SEAT" ]]; then
  SEAT_DIR="$REPO_ROOT/operations/data/seats/$SEAT"
else
  SEAT_DIR="$REPO_ROOT/departments/marketing/seats/$SEAT"
  mkdir -p "$SEAT_DIR"
fi

OPS_DIR="$REPO_ROOT/operations/data/seats/$SEAT"
mkdir -p "$OPS_DIR"

ACTIVE_FILE="$SEAT_DIR/seat-active.json"
LOCK_DIR="$SEAT_DIR/.seat.lock"

# Acquire lock
for i in {1..20}; do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    break
  fi
  sleep 0.1
done
trap 'rm -rf "$LOCK_DIR"' EXIT

NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%S%z")
HOST=$(hostname -s)
CWD="$SEAT_DIR"
RESUME_CMD="cd '$CWD' && claude --resume $SESSION_ID"

# Check if existing session is held by a live process
if [[ -f "$ACTIVE_FILE" ]]; then
  PREV_PID=$(jq -r '.pid // empty' "$ACTIVE_FILE" 2>/dev/null || true)
  PREV_TOOL=$(jq -r '.tool // empty' "$ACTIVE_FILE" 2>/dev/null || true)
  PREV_SESSION=$(jq -r '.session_id // empty' "$ACTIVE_FILE" 2>/dev/null || true)

  if [[ -n "$PREV_PID" && "$PREV_PID" != "null" && "$PREV_PID" != "$PID" ]]; then
    if kill -0 "$PREV_PID" 2>/dev/null; then
      if [[ "$PREV_SESSION" != "$SESSION_ID" ]]; then
        echo "Seat '$SEAT' is held by live process PID $PREV_PID (tool: $PREV_TOOL, session: $PREV_SESSION)" >&2
        echo "Resume command: cd '$CWD' && claude --resume $PREV_SESSION" >&2
        exit 3
      fi
    fi
  fi

  # Log previous session if session_id changed
  if [[ -n "$PREV_SESSION" && "$PREV_SESSION" != "$SESSION_ID" ]]; then
    PREV_RECORD=$(cat "$ACTIVE_FILE")
    LOG_ENTRY=$(echo "$PREV_RECORD" | jq -c --arg end "$NOW_ISO" '. + {ended_at: $end, reason: "session_changed"}')
    echo "$LOG_ENTRY" >> "$SEAT_DIR/seat-log.jsonl"
    echo "$LOG_ENTRY" >> "$OPS_DIR/seat-log.jsonl" 2>/dev/null || true
  fi
fi

# Build new active record
RECORD=$(jq -n \
  --arg schema "1" \
  --arg seat "$SEAT" \
  --arg tool "$TOOL" \
  --arg app "$APP" \
  --arg session_id "$SESSION_ID" \
  --argjson pid "$PID" \
  --arg cwd "$CWD" \
  --arg host "$HOST" \
  --arg started_at "$NOW_ISO" \
  --arg last_write "$NOW_ISO" \
  --arg resume_cmd "$RESUME_CMD" \
  '{
    schema: ($schema | tonumber),
    seat: $seat,
    tool: $tool,
    app: $app,
    session_id: $session_id,
    pid: $pid,
    cwd: $cwd,
    host: $host,
    started_at: $started_at,
    last_write: $last_write,
    resume_cmd: $resume_cmd
  }')

TMP_FILE="$SEAT_DIR/.seat-active.json.tmp.$$"
echo "$RECORD" > "$TMP_FILE"
mv "$TMP_FILE" "$ACTIVE_FILE"

# Mirror to operations/data/seats
if [[ "$SEAT_DIR" != "$OPS_DIR" ]]; then
  echo "$RECORD" > "$OPS_DIR/seat-active.json"
fi

echo "Seat '$SEAT' successfully claimed by $TOOL (PID $PID, session $SESSION_ID)"
exit 0
