#!/usr/bin/env bash
# ==============================================================================
# service-install.sh — Install and start AIBOSS Office LaunchAgent daemon
# Usage: ./service-install.sh [--dev] [--port <PORT>]
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DEV_MODE=false
CUSTOM_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)
      DEV_MODE=true
      shift
      ;;
    --port)
      CUSTOM_PORT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--dev] [--port <PORT>]"
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
  PORT="${CUSTOM_PORT:-4331}"
else
  LABEL="com.aiboss.office"
  if [[ -n "$CUSTOM_PORT" ]]; then
    PORT="$CUSTOM_PORT"
  elif [[ -f "$REPO_ROOT/config/office.json" ]]; then
    PORT=$(jq -r '.service.port // 4330' "$REPO_ROOT/config/office.json" 2>/dev/null || echo "4330")
  else
    PORT="4330"
  fi
fi

TARGET_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
TEMPLATE_PLIST="$REPO_ROOT/operations/launchd/com.aiboss.office.plist"
LOG_DIR="$REPO_ROOT/operations/data/logs"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

if [[ ! -f "$TEMPLATE_PLIST" ]]; then
  echo "Template plist not found at: $TEMPLATE_PLIST" >&2
  exit 1
fi

# Detect node/pnpm directory
NODE_DIR="$(dirname "$(which node 2>/dev/null || echo '/usr/local/bin')")"
PNPM_DIR="$(dirname "$(which pnpm 2>/dev/null || echo "$NODE_DIR")")"
PATH_ENV="$NODE_DIR:$PNPM_DIR:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Generate plist with substitutions
sed \
  -e "s|__LABEL__|$LABEL|g" \
  -e "s|__PORT__|$PORT|g" \
  -e "s|__REPO_DIR__|$REPO_ROOT|g" \
  -e "s|__PATH__|$PATH_ENV|g" \
  "$TEMPLATE_PLIST" > "$TARGET_PLIST"

echo "Generated LaunchAgent: $TARGET_PLIST"
echo "  Label: $LABEL"
echo "  Port:  $PORT"
echo "  Repo:  $REPO_ROOT"

# Unload previous service if active
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM" "$TARGET_PLIST" 2>/dev/null || launchctl unload "$TARGET_PLIST" 2>/dev/null || true
sleep 0.5

# Bootstrap / load service
if launchctl bootstrap "gui/$UID_NUM" "$TARGET_PLIST" 2>/dev/null; then
  echo "Service successfully bootstrapped via launchctl bootstrap."
elif launchctl load "$TARGET_PLIST" 2>/dev/null; then
  echo "Service successfully loaded via launchctl load."
else
  echo "Warning: launchctl load/bootstrap returned non-zero. Check launchctl list." >&2
fi

echo "Verifying service status..."
sleep 1.5
launchctl list | grep "$LABEL" || echo "Note: label $LABEL not yet in launchctl list."
echo "Install complete."
