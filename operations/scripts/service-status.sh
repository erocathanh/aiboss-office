#!/usr/bin/env bash
# ==============================================================================
# service-status.sh — Check status of AIBOSS Office LaunchAgent daemon
# Usage: ./service-status.sh [--dev]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DEV_MODE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      DEV_MODE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [--dev]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "$DEV_MODE" == "true" ]]; then
  LABEL="com.aiboss.office.dev"
  PORT=4331
else
  LABEL="com.aiboss.office"
  if [[ -f "$REPO_ROOT/config/office.json" ]]; then
    PORT=$(jq -r '.service.port // 4330' "$REPO_ROOT/config/office.json" 2>/dev/null || echo "4330")
  else
    PORT=4330
  fi
fi

echo "=== AIBOSS Office Service Status ($LABEL) ==="
STATUS_LINE=$(launchctl list | grep "$LABEL" || true)

if [[ -z "$STATUS_LINE" ]]; then
  echo "Service is NOT registered with launchd."
  echo "Run ./service-install.sh to install."
  exit 1
fi

echo "launchctl entry: $STATUS_LINE"
PID=$(echo "$STATUS_LINE" | awk '{print $1}')
EXIT_STATUS=$(echo "$STATUS_LINE" | awk '{print $2}')

if [[ "$PID" == "-" || -z "$PID" ]]; then
  echo "Service process is NOT running (last exit code: $EXIT_STATUS)."
else
  echo "Process is RUNNING with PID: $PID"
fi

echo ""
echo "--- HTTP Port Check (127.0.0.1:$PORT) ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null || echo "OFFLINE")
echo "HTTP Status: $HTTP_CODE"

OUT_LOG="$REPO_ROOT/operations/data/logs/office-service.out.log"
ERR_LOG="$REPO_ROOT/operations/data/logs/office-service.err.log"

if [[ -f "$OUT_LOG" ]]; then
  echo ""
  echo "--- Last 5 lines of stdout ---"
  tail -n 5 "$OUT_LOG"
fi

if [[ -f "$ERR_LOG" ]]; then
  echo ""
  echo "--- Last 5 lines of stderr ---"
  tail -n 5 "$ERR_LOG"
fi
