#!/usr/bin/env bash
# ==============================================================================
# operations/scripts/setup.sh — AIBOSS Office setup & health check wrapper
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

exec "$REPO_ROOT/setup.sh" "$@"
