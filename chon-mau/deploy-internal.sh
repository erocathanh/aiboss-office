#!/usr/bin/env bash
set -euo pipefail

# Deploy this static subtree from a clean directory outside the parent Git worktree.
# Deploying directly from chon-mau/ leaks parent Git-author metadata to Vercel and
# can leave a BLOCKED deployment whose placeholder returns HTTP 200 for every path.

readonly SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly GLOBAL_CONFIG="${HOME}/.vercel-noibo3"
readonly SCOPE="erocathanh-coms-projects"
readonly EXPECTED_PROJECT_ID="prj_6NaPVz1zgYHs3sLgqcKLqwT88XDp"
readonly EXPECTED_ORG_ID="team_92voUTYnnFFYMvpX5hVk38OC"
readonly PROJECT_FILE="${SOURCE_DIR}/.vercel/project.json"

if [[ ! -f "${PROJECT_FILE}" ]]; then
  printf 'LOI: thieu %s\n' "${PROJECT_FILE}" >&2
  exit 1
fi

python3 - "${PROJECT_FILE}" "${EXPECTED_PROJECT_ID}" "${EXPECTED_ORG_ID}" <<'PY'
import json
import pathlib
import sys

project_file = pathlib.Path(sys.argv[1])
expected_project_id = sys.argv[2]
expected_org_id = sys.argv[3]
data = json.loads(project_file.read_text(encoding="utf-8"))
if data.get("projectId") != expected_project_id or data.get("orgId") != expected_org_id:
    raise SystemExit("LOI: project.json khong khop project/org da khoa")
print("PROJECT_LINK=KHOP")
PY

npx vercel whoami \
  --global-config "${GLOBAL_CONFIG}" \
  --scope "${SCOPE}" >/dev/null
printf '%s\n' 'VERCEL_AUTH=CO'

stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/phong-ban-ai-mockup-stage.XXXXXX")"
cleanup() {
  case "${stage_dir}" in
    "${TMPDIR:-/tmp}"/phong-ban-ai-mockup-stage.*)
      rm -rf -- "${stage_dir}"
      ;;
    *)
      printf 'CANH BAO: khong don duong dan tam bat thuong: %s\n' "${stage_dir}" >&2
      ;;
  esac
}
trap cleanup EXIT

rsync -a --delete \
  --exclude '.git/' \
  --exclude '.vercel/' \
  --exclude 'node_modules/' \
  --exclude '.DS_Store' \
  --exclude 'deploy-internal.sh' \
  "${SOURCE_DIR}/" "${stage_dir}/"

mkdir -p "${stage_dir}/.vercel"
cp "${PROJECT_FILE}" "${stage_dir}/.vercel/project.json"

if [[ -e "${stage_dir}/.git" ]]; then
  printf '%s\n' 'LOI: staging con .git' >&2
  exit 1
fi

python3 - "${SOURCE_DIR}" "${stage_dir}" <<'PY'
import hashlib
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
stage = pathlib.Path(sys.argv[2])
required = ["index.html", "round-2.html", "vercel.json", "du-lieu/nhan-su.json"]
for relative in required:
    source_file = source / relative
    stage_file = stage / relative
    if not source_file.is_file() or not stage_file.is_file():
        raise SystemExit(f"LOI: staging thieu {relative}")
    source_md5 = hashlib.md5(source_file.read_bytes()).hexdigest()
    stage_md5 = hashlib.md5(stage_file.read_bytes()).hexdigest()
    if source_md5 != stage_md5:
        raise SystemExit(f"LOI: staging lech byte {relative}")
print("STAGING=KHOP")
PY

cd "${stage_dir}"
npx vercel deploy --prod --yes --no-color \
  --global-config "${GLOBAL_CONFIG}" \
  --scope "${SCOPE}"
