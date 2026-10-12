#!/usr/bin/env bash
# ==============================================================================
# service-uninstall.sh — Unload and remove AIBOSS Office LaunchAgent daemon
# Usage: ./service-uninstall.sh [--dev]
# ==============================================================================
set -euo pipefail

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
else
  LABEL="com.aiboss.office"
fi

TARGET_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM="$(id -u)"

echo "Uninstalling LaunchAgent: $LABEL"

# Unload from launchd
launchctl bootout "gui/$UID_NUM" "$TARGET_PLIST" 2>/dev/null || launchctl unload "$TARGET_PLIST" 2>/dev/null || true

# Remove plist file
if [[ -f "$TARGET_PLIST" ]]; then
  rm -f "$TARGET_PLIST"
  echo "Removed plist: $TARGET_PLIST"
fi

sleep 1
if launchctl list | grep "$LABEL"; then
  echo "Warning: $LABEL is still listed in launchctl." >&2
  exit 1
else
  echo "Service $LABEL successfully unregistered and removed."
fi
