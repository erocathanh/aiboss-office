#!/usr/bin/env bash
# ==============================================================================
# setup.sh - AIBOSS Office workspace bootstrap & health check (doctor)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FAILED=0

check_pass() {
  printf "[doctor: OK]   %s\n" "$1"
}

check_fail() {
  printf "[doctor: FAIL] %s\n" "$1"
  FAILED=1
}

echo "=== AIBOSS Office Workspace Bootstrap & Doctor ==="

# 1. Ensure required runtime data directories exist
DATA_DIRS=(
  "operations/data/channels"
  "operations/data/mailbox"
  "operations/data/seats"
  "operations/data/progress"
  "operations/data/timesheet"
  "operations/data/approvals"
  "operations/data/memory"
)

for dir in "${DATA_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    touch "$dir/.gitkeep"
    echo "Created runtime data directory: $dir"
  fi
done
check_pass "Runtime data directories (operations/data/*) initialized"

# 2. Ensure packs and structural directories exist
STRUCT_DIRS=(
  "packs/core"
  "packs/company-facts"
  "packs/methods"
  "packs/connectors"
  "packs/funnel-method"
  "packs/connector-map"
  "packs/measurement-budget"
  "operations/hooks"
  "operations/scripts"
  "operations/templates"
  "departments/marketing/seats"
  "projects"
  "data"
  "config"
)

for dir in "${STRUCT_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "Created structural directory: $dir"
  fi
done
check_pass "Workspace structural directories verified"

# 2b. Ensure 8 marketing seat directories exist under departments/marketing/seats
MARKETING_SEATS=(
  "marketing-lead"
  "content-writer"
  "social-community"
  "email-crm"
  "paid-media"
  "video-creative"
  "funnel-offer"
  "reviewer"
)

SEATS_OK=1
for seat in "${MARKETING_SEATS[@]}"; do
  if [ ! -d "departments/marketing/seats/$seat" ]; then
    check_fail "Seat directory departments/marketing/seats/$seat missing"
    SEATS_OK=0
  fi
done
if [ "$SEATS_OK" -eq 1 ]; then
  check_pass "All 8 marketing seat directories verified under departments/marketing/seats"
fi

# 3. Check configuration & data JSON readability and syntax
JSON_FILES=(
  "config/office.json"
  "departments/marketing/department.json"
  "data/seats.json"
  "data/departments.json"
)

for file in "${JSON_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    check_fail "File $file missing"
  elif ! node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" 2>/dev/null; then
    check_fail "File $file has invalid JSON syntax"
  else
    check_pass "JSON configuration $file is valid"
  fi
done

# 4. Check Node.js and package manager
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  check_pass "Node.js installed ($NODE_VER)"
else
  check_fail "Node.js not found in PATH"
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_VER="$(pnpm -v)"
  check_pass "pnpm installed ($PNPM_VER)"
else
  check_fail "pnpm not found in PATH"
fi

# 5. Check dependencies installation
if [ -d "node_modules" ]; then
  check_pass "Dependencies installed (node_modules present)"
else
  printf "[doctor: WARN] node_modules not present, running pnpm install...\n"
  if pnpm install; then
    check_pass "pnpm install succeeded"
  else
    check_fail "pnpm install failed"
  fi
fi

# 6. Check Basic Auth environment variables (PHONGBAN_USER / PHONGBAN_PASS)
set +u
AUTH_U="${PHONGBAN_USER:-}"
AUTH_P="${PHONGBAN_PASS:-}"

if [ -z "$AUTH_U" ] || [ -z "$AUTH_P" ]; then
  if [ -f ".env" ]; then
    AUTH_U="$(grep -E '^PHONGBAN_USER=' .env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '\r\n\"'\'' ')"
    AUTH_P="$(grep -E '^PHONGBAN_PASS=' .env 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '\r\n\"'\'' ')"
  fi
fi

if [ -z "$AUTH_U" ] || [ -z "$AUTH_P" ]; then
  if [ -f "$HOME/.bos-funnel-basic-auth" ]; then
    AUTH_U="$(sed -n '1p' "$HOME/.bos-funnel-basic-auth" 2>/dev/null | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')"
    AUTH_P="$(sed -n '2p' "$HOME/.bos-funnel-basic-auth" 2>/dev/null | sed -E 's/^[^:]*:[[:space:]]*//' | tr -d '\r\n')"
  fi
fi

if [ -n "$AUTH_U" ] && [ -n "$AUTH_P" ]; then
  check_pass "Authentication variables configured (PHONGBAN_USER / PHONGBAN_PASS detected)"
else
  check_fail "Authentication variables missing: PHONGBAN_USER and/or PHONGBAN_PASS not set (add to .env)"
fi
set -u

# Summary
echo "=================================================="
if [ "$FAILED" -eq 0 ]; then
  echo "Result: All doctor checks PASSED. AIBOSS Office is healthy."
  exit 0
else
  echo "Result: Doctor checks FAILED. Please review issues above."
  exit 1
fi
