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

# 2. Ensure packs and operations directories exist
STRUCT_DIRS=(
  "packs/core"
  "packs/company-facts"
  "packs/methods"
  "packs/connectors"
  "operations/hooks"
  "operations/scripts"
  "operations/templates"
  "agents"
  "departments/marketing"
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

# Summary
echo "=================================================="
if [ "$FAILED" -eq 0 ]; then
  echo "Result: All doctor checks PASSED. AIBOSS Office is healthy."
  exit 0
else
  echo "Result: Doctor checks FAILED. Please review issues above."
  exit 1
fi
