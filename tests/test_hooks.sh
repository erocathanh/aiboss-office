#!/bin/bash
# tests/test_hooks.sh — Bộ kiểm tra tự động 8 hook an toàn của AIBOSS Office
set -u

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="/usr/bin/python3"
if [ ! -x "$PYTHON" ]; then
    PYTHON="python3"
fi

TOTAL=0
PASSED=0
FAILED=0

# Dựng hộp cát thử nghiệm trong logs/test-sandbox
SANDBOX="$REPO_ROOT/logs/test-sandbox"
rm -rf "$SANDBOX"

# 1. Khởi tạo cấu trúc AIBOSS Office
mkdir -p "$SANDBOX/config"
echo '{"name": "test-office-sandbox"}' > "$SANDBOX/config/office.json"

mkdir -p "$SANDBOX/projects/THU-SU-THAT/outputs"
mkdir -p "$SANDBOX/projects/THU-SU-THAT/wip"
mkdir -p "$SANDBOX/projects/THU-SU-THAT/inputs/tin-nhan-khach"
mkdir -p "$SANDBOX/projects/_sample-ground-truth/wip"
mkdir -p "$SANDBOX/projects/_sample-ground-truth-2/wip"
mkdir -p "$SANDBOX/tai-lieu/inputs"
mkdir -p "$SANDBOX/fixtures"
mkdir -p "$SANDBOX/tools/inbox-reader"
mkdir -p "$SANDBOX/operations/hooks"
mkdir -p "$SANDBOX/operations/data/approvals"

# Sao chép hook và pii_patterns vào hộp cát
cp -Rp "$REPO_ROOT/operations/hooks/"* "$SANDBOX/operations/hooks/"

echo "chot" > "$SANDBOX/projects/THU-SU-THAT/outputs/da-chot_final.md"
echo "chot" > "$SANDBOX/projects/THU-SU-THAT/outputs/su-that-van-hanh_final.md"
echo "nhap" > "$SANDBOX/projects/THU-SU-THAT/wip/su-that-van-hanh_v01_20260930.md"
echo "nhap" > "$SANDBOX/projects/THU-SU-THAT/wip/a.md"
echo "mau" > "$SANDBOX/projects/_sample-ground-truth/wip/a.md"
echo "raw" > "$SANDBOX/projects/THU-SU-THAT/inputs/a.md"
echo "# Nhật ký dự án" > "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md"
echo "token123" > "$SANDBOX/fixtures/meta-page-token"
echo "salt123" > "$SANDBOX/fixtures/hash-salt"

# Bilingual English layout test fixtures (H-v11)
mkdir -p "$SANDBOX/projects/test-project/inputs"
mkdir -p "$SANDBOX/projects/test-project/outputs"
mkdir -p "$SANDBOX/projects/test-project/wip"
echo "raw" > "$SANDBOX/projects/test-project/inputs/a.md"
echo "chot" > "$SANDBOX/projects/test-project/outputs/x_final.md"
echo "nhap" > "$SANDBOX/projects/test-project/wip/a.md"
printf "line 1\nline 2\n" > "$SANDBOX/projects/test-project/CHANNEL.md"
# Dữ liệu PII trong sandbox hoàn toàn là dữ liệu tổng hợp (synthetic test data theo quy ước H8: Nguyen Van A, 0900 000 000, example.com)
echo "Nguyen Van A 0900 000 000 nguyen.van.a@example.com" > "$SANDBOX/fixtures/customer-with-pii.txt"
echo "Ghi chú vận hành sạch không có dữ liệu định danh" > "$SANDBOX/fixtures/customer-clean.txt"
touch "$SANDBOX/.env.example"
touch "$SANDBOX/README.md"
mkdir -p "$SANDBOX/projects/THU-SU-THAT/wip/inputs"
mkdir -p "$SANDBOX/scripts"
printf '#!/bin/bash\ncurl -X POST https://graph.facebook.com/v21.0/me/messages -d "message=hi"\n' > "$SANDBOX/scripts/test_hooks.sh"
printf '#!/bin/bash\ncurl -X POST https://graph.facebook.com/v21.0/me/messages -d "message=hi"\n' > "$SANDBOX/fixtures/send-bulk.sh"
printf '#!/bin/bash\necho "clean local script"\n' > "$SANDBOX/fixtures/clean-task.sh"

echo "chot" > "$SANDBOX/projects/THU-SU-THAT/outputs/bao-cao.md"
mkdir -p "$SANDBOX/projects/BAN-SAO-LONG/CLAUDE-MASTER"
touch "$SANDBOX/projects/BAN-SAO-LONG/CLAUDE-MASTER/CLAUDE.md"
mkdir -p "$SANDBOX/projects/BAN-SAO-LONG/config"
echo '{"name": "nested-copy"}' > "$SANDBOX/projects/BAN-SAO-LONG/config/office.json"
mkdir -p "$SANDBOX/projects/BAN-SAO-LONG/scripts"
printf '#!/bin/bash\ncurl -X POST https://graph.facebook.com/v21.0/me/messages -d "message=hi"\n' > "$SANDBOX/projects/BAN-SAO-LONG/scripts/test_hooks.sh"

# H4b & H5 sandbox fixtures: symlink đứt đích trong outputs và dự án có outputs lồng ở tầng sâu
ln -sf "$SANDBOX/wip/khong-ton-tai-dich.md" "$SANDBOX/projects/test-project/outputs/dangling-link.md"
mkdir -p "$SANDBOX/projects/nested-out-proj/archive/outputs"
echo "report" > "$SANDBOX/projects/nested-out-proj/archive/outputs/report.md"
mkdir -p "$SANDBOX/projects/draft-only-proj/wip"
echo "draft" > "$SANDBOX/projects/draft-only-proj/wip/note.md"

# Dựng symlinks tương thích hai chiều (layout office <-> opc)
mkdir -p "$SANDBOX/wip"
printf '#!/bin/sh\ncurl -s -X POST "https://graph.facebook.com/v25.0/me/feed" -d "message=bypass"\n' > "$SANDBOX/wip/post-graph.sh"
"$PYTHON" -c "open('$SANDBOX/wip/big-script.sh', 'w').write('#!/bin/sh\n' + '# padding\n' * 25000)"
ln -sf "$SANDBOX/projects/THU-SU-THAT/outputs/da-chot_final.md" "$SANDBOX/wip/lien-ket-chot.md"
ln -sf "$SANDBOX/projects/THU-SU-THAT/inputs" "$SANDBOX/wip/raw-link"

# Tương thích ngược tên thư mục OPC nếu ca test chưa đổi hết
ln -sf "$SANDBOX/projects" "$SANDBOX/CAC-DU-AN"
ln -sf "$SANDBOX/wip" "$SANDBOX/DANG-LAM"
ln -sf "$SANDBOX/projects/THU-SU-THAT/outputs" "$SANDBOX/projects/THU-SU-THAT/DAU-RA"
ln -sf "$SANDBOX/projects/THU-SU-THAT/wip" "$SANDBOX/projects/THU-SU-THAT/DANG-LAM"
ln -sf "$SANDBOX/projects/THU-SU-THAT/inputs" "$SANDBOX/projects/THU-SU-THAT/DAU-VAO"
ln -sf "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md" "$SANDBOX/projects/THU-SU-THAT/nhat-ky.md"
ln -sf "$SANDBOX/projects/_sample-ground-truth" "$SANDBOX/projects/DU-AN-MAU-SU-THAT"
ln -sf "$SANDBOX/projects/_sample-ground-truth-2" "$SANDBOX/projects/DU-AN-MAU-SU-THAT-2"

export CLAUDE_PROJECT_DIR="$SANDBOX"

record_pass() {
    local name="$1"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
    echo "  [PASS] $name"
}

record_fail() {
    local name="$1"
    local reason="$2"
    TOTAL=$((TOTAL + 1))
    FAILED=$((FAILED + 1))
    echo "  [FAIL] $name: $reason"
}

run_hook_test() {
    local hook_script="$1"
    local hook_name="$2"
    local test_file="$3"
    local filename="$(basename "$test_file")"

    # Đọc input
    local input_data
    input_data="$(cat "$test_file")"

    if [[ "$input_data" == *"__SANDBOX__"* ]]; then
        input_data="${input_data//__SANDBOX__/$SANDBOX}"
    fi

    # Xử lý mở rộng chìa ghép động lúc chạy nếu có placeholder
    if [[ "$input_data" == *"<KEY:"* ]]; then
        input_data="$(echo "$input_data" | "$PYTHON" -c '
import sys, re
s = sys.stdin.read()
s = re.sub(r"<KEY:([^:]+):(\d+)>", lambda m: m.group(1) + "a" * int(m.group(2)), s)
sys.stdout.write(s)
')"
    fi

    local run_cwd="$SANDBOX"
    local run_proj_dir="$SANDBOX"
    if [[ "$input_data" == *"\"cwd\""* || "$input_data" == *"\"claude_project_dir\""* || "$input_data" == *"<SANDBOX>"* ]]; then
        input_data="$("$PYTHON" - "$SANDBOX" "$input_data" <<'PYEOF'
import json, os, sys
sandbox = sys.argv[1]
raw = sys.argv[2].replace("<SANDBOX>", sandbox)
try:
    data = json.loads(raw)
    if isinstance(data, dict):
        if "cwd" in data and isinstance(data["cwd"], str) and data["cwd"]:
            if not os.path.isabs(data["cwd"]):
                data["cwd"] = os.path.normpath(os.path.join(sandbox, data["cwd"]))
        if "claude_project_dir" in data and isinstance(data["claude_project_dir"], str) and data["claude_project_dir"]:
            if not os.path.isabs(data["claude_project_dir"]):
                data["claude_project_dir"] = os.path.normpath(os.path.join(sandbox, data["claude_project_dir"]))
        raw = json.dumps(data, ensure_ascii=False)
except Exception:
    pass
sys.stdout.write(raw)
PYEOF
)"
        run_cwd="$("$PYTHON" - "$SANDBOX" "$input_data" <<'PYEOF'
import json, sys
sandbox = sys.argv[1]
try:
    d = json.loads(sys.argv[2])
    c = d.get("cwd") if isinstance(d, dict) else None
    sys.stdout.write(c if isinstance(c, str) and c else sandbox)
except Exception:
    sys.stdout.write(sandbox)
PYEOF
)"
        run_proj_dir="$("$PYTHON" - "$SANDBOX" "$input_data" <<'PYEOF'
import json, sys
sandbox = sys.argv[1]
try:
    d = json.loads(sys.argv[2])
    p = d.get("claude_project_dir") if isinstance(d, dict) else None
    sys.stdout.write(p if isinstance(p, str) and p else sandbox)
except Exception:
    sys.stdout.write(sandbox)
PYEOF
)"
    fi

    # Xử lý ca đặc biệt H114: kiểm tra CHANNEL.md / nhat-ky đọc lỗi I/O
    local is_h114=0
    if [[ "$filename" == *"H114"* ]]; then
        is_h114=1
        chmod 000 "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md" 2>/dev/null || true
    fi

    # Xử lý ca đặc biệt S17-16: kiểm tra thư mục approvals chỉ đọc vs ghi được
    local is_s17_16_ro=0
    local is_s17_16_rw=0
    local approvals_lines_before=0
    if [[ "$filename" == *"s17-16-readonly-approvals"* ]]; then
        is_s17_16_ro=1
        chmod 0400 "$SANDBOX/operations/data/approvals/"*.jsonl 2>/dev/null || true
        chmod 0500 "$SANDBOX/operations/data/approvals" 2>/dev/null || true
    elif [[ "$filename" == *"s17-16-writable-approvals"* ]]; then
        is_s17_16_rw=1
        approvals_lines_before=$(cat "$SANDBOX/operations/data/approvals/"*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    fi

    local stdout_file stderr_file
    stdout_file="$(mktemp)"
    stderr_file="$(mktemp)"

    # Chạy hook bằng lệnh chuẩn như trong settings.json có || exit 2
    local hook_cmd
    if [ "${HOOKS_DISABLED:-0}" -eq 1 ]; then
        hook_cmd="/usr/bin/true"
    elif [ "$hook_name" == "remind_cross_check" ]; then
        hook_cmd="\"$PYTHON\" \"$hook_script\""
    else
        hook_cmd="\"$PYTHON\" \"$hook_script\" || exit 2"
    fi

    ( cd "$run_cwd" && echo "$input_data" | CLAUDE_PROJECT_DIR="$run_proj_dir" /bin/bash -c "$hook_cmd" >"$stdout_file" 2>"$stderr_file" )
    local exit_code=$?

    if [ "$is_h114" -eq 1 ]; then
        chmod 0644 "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md" 2>/dev/null || true
    fi
    if [ "$is_s17_16_ro" -eq 1 ]; then
        chmod 0755 "$SANDBOX/operations/data/approvals" 2>/dev/null || true
        chmod 0644 "$SANDBOX/operations/data/approvals/"*.jsonl 2>/dev/null || true
    fi
    local approvals_lines_after=0
    if [ "$is_s17_16_rw" -eq 1 ]; then
        approvals_lines_after=$(cat "$SANDBOX/operations/data/approvals/"*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    fi

    local out_content err_content
    out_content="$(cat "$stdout_file")"
    err_content="$(cat "$stderr_file")"
    rm -f "$stdout_file" "$stderr_file"

    local expected_decision=""
    if grep -qE '"(expected|ky_vong)"[[:space:]]*:[[:space:]]*"allow"' "$test_file" 2>/dev/null; then
        expected_decision="allow"
    elif grep -qE '"(expected|ky_vong)"[[:space:]]*:[[:space:]]*"block"' "$test_file" 2>/dev/null; then
        expected_decision="block"
    elif [[ "$filename" == block-* || "$filename" == "broken-input.txt" || "$filename" == positive-control-* ]]; then
        expected_decision="block"
    elif [[ "$filename" == allow-* ]]; then
        expected_decision="allow"
    elif [[ "$filename" == ask-* ]]; then
        expected_decision="ask"
    elif [[ "$filename" == remind-* ]]; then
        expected_decision="remind"
    fi

    if [ "$expected_decision" == "block" ]; then
        if [ "$exit_code" -eq 2 ]; then
            if [[ "$err_content" == "[opc-harness:$hook_name]"* ]]; then
                if [ "$is_s17_16_ro" -eq 1 ] && [[ "$err_content" != *"approval request NOT recorded:"* ]]; then
                    record_fail "$hook_name / $filename" "Mã 2 nhưng thiếu 'approval request NOT recorded:' trên stderr khi approvals chỉ đọc: $err_content"
                elif [ "$is_s17_16_rw" -eq 1 ] && [[ "$err_content" == *"approval request NOT recorded:"* ]]; then
                    record_fail "$hook_name / $filename" "Thư mục approvals ghi được nhưng stderr lại báo NOT recorded: $err_content"
                elif [ "$is_s17_16_rw" -eq 1 ] && [ "$approvals_lines_after" -le "$approvals_lines_before" ]; then
                    record_fail "$hook_name / $filename" "Thư mục approvals ghi được nhưng số dòng không tăng ($approvals_lines_before -> $approvals_lines_after)"
                else
                    record_pass "$hook_name / $filename (chặn đúng mã 2 và đúng tiền tố stderr)"
                fi
            else
                record_fail "$hook_name / $filename" "Mã 2 nhưng stderr không bắt đầu bằng [opc-harness:$hook_name]: $err_content"
            fi
        else
            record_fail "$hook_name / $filename" "Kỳ vọng chặn mã 2, nhưng nhận mã $exit_code"
        fi
    elif [ "$expected_decision" == "allow" ]; then
        if [ "$exit_code" -eq 0 ]; then
            if [ -z "$out_content" ]; then
                record_pass "$hook_name / $filename (cho qua mã 0, stdout rỗng)"
            else
                record_fail "$hook_name / $filename" "Mã 0 nhưng stdout không rỗng: $out_content"
            fi
        else
            record_fail "$hook_name / $filename" "Kỳ vọng cho qua mã 0, nhưng nhận mã $exit_code. Stderr: $err_content"
        fi
    elif [[ "$filename" == ask-* ]]; then
        if [ "$exit_code" -eq 0 ]; then
            if [[ "$out_content" == *"\"permissionDecision\": \"ask\""* || "$out_content" == *"\"permissionDecision\":\"ask\""* ]]; then
                record_pass "$hook_name / $filename (hỏi duyệt đúng cấu trúc)"
            else
                record_fail "$hook_name / $filename" "Mã 0 nhưng không chứa permissionDecision ask: $out_content"
            fi
        else
            record_fail "$hook_name / $filename" "Kỳ vọng mã 0, nhưng nhận mã $exit_code"
        fi
    elif [[ "$filename" == remind-* ]]; then
        if [ "$exit_code" -eq 0 ]; then
            if [[ "$out_content" == *"Ba chi tiết đã lược bỏ"* || "$out_content" == *"Nhắc nhở"* ]]; then
                record_pass "$hook_name / $filename (nhắc nhở đúng nội dung)"
            else
                record_fail "$hook_name / $filename" "Mã 0 nhưng stdout thiếu nhắc nhở 'Ba chi tiết đã lược bỏ': $out_content"
            fi
        else
            record_fail "$hook_name / $filename" "Kỳ vọng mã 0, nhưng nhận mã $exit_code"
        fi
    fi
}

echo "=== BẮT ĐẦU KIỂM TRA 11 HOOK AN TOÀN AIBOSS OFFICE ==="

HOOKS=(
    "block_mass_delete"
    "block_secret_leak"
    "block_external_scan"
    "protect_final_outputs"
    "guard_customer_pii"
    "guard_bulk_send"
    "lock_raw_inputs"
    "remind_cross_check"
    "block_ollama"
    "block_ad_account_write"
    "block_public_publish"
)

for hook in "${HOOKS[@]}"; do
    echo "--- Kiểm tra hook: $hook ---"
    hook_script="$REPO_ROOT/operations/hooks/${hook}.py"
    test_dir="$REPO_ROOT/tests/hooks/${hook}"

    if [ ! -f "$hook_script" ]; then
        echo "LỖI: Không tìm thấy script hook tại $hook_script" >&2
        exit 1
    fi

    if [ ! -d "$test_dir" ]; then
        echo "CẢNH BÁO: Không có thư mục kiểm thử cho $hook tại $test_dir"
        continue
    fi

    # Lấy danh sách ca kiểm thử và sắp xếp
    tests=($(find "$test_dir" -maxdepth 1 -type f \( -name "*.json" -o -name "*.txt" \) | sort))

    for t in "${tests[@]}"; do
        run_hook_test "$hook_script" "$hook" "$t"
    done
done

# Kiểm tra đối chứng dương: khi TẮT hook (thay bằng no-op true), các ca block-* (gồm cả F15/F16/F19/F20)
# trả mã thoát 0 nên qua runner PHẢI báo FAIL. Nếu runner báo FAIL khi hook bị câm/tắt, thì đối chứng dương ĐẠT.
echo "--- Kiểm tra đối chứng dương (Positive Control: HOOKS_DISABLED=1) ---"
POS_CONTROL_CASES=(
    "block_mass_delete:positive-control-rm-rf.json"
    "block_public_publish:block-f15-xargs-curl-post.json"
    "block_public_publish:block-f19a-caffeinate-curl-post.json"
    "block_public_publish:block-f19a-script-curl-post.json"
    "block_public_publish:block-f19b-node-fetch-new-url-post.json"
    "block_public_publish:block-f19b-python-urllib-request-post.json"
    "block_public_publish:block-S17f-F26-fetch-options-var-post.json"
    "block_public_publish:block-S17f-F26-axios-config-var-post.json"
    "block_public_publish:block-pm-node-axios-post.json"
    "block_public_publish:block-S17f-F31-urllib3-poolmanager-request.json"
    "block_public_publish:block-S17g-F32-fetch-quoted-method-post.json"
    "block_public_publish:block-S17g-F32-fetch-shadowed-opts-param.json"
    "block_public_publish:block-S17g-F35-require-axios-delete.json"
    "block_public_publish:block-S17g-F35-axios-client-var-delete.json"
    "block_public_publish:block-S17h-F39-map-reassigned-axios-delete.json"
    "block_public_publish:block-S17h-F39-comma-axios-create-delete-var-url.json"
    "block_public_publish:block-S17h-F41-method-shorthand-shadowed-opts.json"
    "lock_raw_inputs:block-f16-node-cpSync-dst-approvals.json"
    "lock_raw_inputs:block-f16-python-open-hex-escape.json"
    "lock_raw_inputs:block-f16-python-path-join-write-text.json"
    "lock_raw_inputs:block-f20a-python-path-div-write-text.json"
    "lock_raw_inputs:block-f20a-python-path-var-write-text.json"
    "lock_raw_inputs:block-f20b-python-shutil-move-from-inputs.json"
    "lock_raw_inputs:block-f20c-node-path-join-leading-slash-inputs.json"
    "lock_raw_inputs:block-S17f-F27-shutil-copytree-inputs.json"
    "lock_raw_inputs:block-S17f-F27-path-rename-from-inputs.json"
    "lock_raw_inputs:block-S17f-F28-os-unlink-inputs.json"
    "lock_raw_inputs:block-S17g-F33-path-var-named-path-write-text.json"
    "lock_raw_inputs:block-S17g-F33-pathlib-qualified-ctor-write-text.json"
    "lock_raw_inputs:block-S17g-F34-path-replace-inputs.json"
    "lock_raw_inputs:block-S17h-F38-path-rename-then-rebind-str.json"
    "lock_raw_inputs:block-S17h-F38-path-replace-then-rebind-str.json"
    "protect_final_outputs:block-S17f-F27-path-rename-from-outputs.json"
    "protect_final_outputs:block-S17h-F38-path-rename-then-rebind-str.json"
    "protect_final_outputs:block-S17h-F38-path-replace-then-rebind-str.json"
    "lock_raw_inputs:block-S17i-F42-path-replace-chain-into-inputs.json"
    "lock_raw_inputs:block-S17i-F42-path-rename-chain-into-inputs.json"
    "lock_raw_inputs:block-S17i-F43-str-then-rebind-path-replace-inputs.json"
    "block_public_publish:block-S17i-F44-collection-then-axios-rebind-delete.json"
    "lock_raw_inputs:block-pm-f42-path-replace-chain-into-inputs.json"
    "lock_raw_inputs:block-pm-f42b-hermes-exact-wip-a-projects-x-inputs.json"
    "lock_raw_inputs:block-pm-f42ctl-path-replace-direct-into-inputs.json"
    "block_public_publish:block-pm-f44ctl-axios-delete-url.json"
    "lock_raw_inputs:block-F45-reuse-path-var-inputs-first.json"
    "lock_raw_inputs:block-F45-reuse-path-var-inputs-last.json"
    "lock_raw_inputs:block-F45-mode-var-write-inputs.json"
    "lock_raw_inputs:block-F45-node-let-reassign-fs-write-inputs.json"
    "lock_raw_inputs:block-F45-shutil-dst-var-inputs.json"
    "block_public_publish:block-F47-destructured-axios-delete.json"
    "block_public_publish:block-F47-destructured-client-obj-delete.json"
    "lock_raw_inputs:block-F48-loop-rebind-open-inputs.json"
    "lock_raw_inputs:block-F48d-while-rebind-open-inputs.json"
    "lock_raw_inputs:block-F48f-node-loop-rebind-writeFile-inputs.json"
    "block_secret_leak:block-bash-cat-envrc.json"
    "block_secret_leak:block-bash-cat-env-prod.json"
    "block_secret_leak:block-bash-cat-env-backup.json"
    "block_secret_leak:block-bash-cat-prod-env.json"
    "block_secret_leak:block-bash-cat-mixedcase-env-local.json"
    "block_secret_leak:block-heredoc-interpreter-python-env.json"
    "block_external_scan:block-H2-glob-mid-root-wildcard.json"
    "block_external_scan:block-H2-glob-mid-users-wildcard.json"
    "protect_final_outputs:block-H3-multiedit-journal-non-sequential.json"
    "protect_final_outputs:block-H3-edit-journal-empty-old-string.json"
    "protect_final_outputs:block-H4a-ln-into-outputs-new-target.json"
    "protect_final_outputs:block-H4b-write-dangling-symlink-in-outputs.json"
    "protect_final_outputs:block-H5-mv-project-with-nested-outputs.json"
    "protect_final_outputs:block-H15-sponge-overwrite-channel.json"
    "lock_raw_inputs:block-H9-rm-inputs-file.json"
    "lock_raw_inputs:block-H9-rm-f-abs-inputs-file.json"
    "lock_raw_inputs:block-H9-rm-r-inputs-subdir.json"
    "lock_raw_inputs:block-H9-rm-operations-data-file.json"
    "lock_raw_inputs:block-H15-clobber-inputs.json"
    "lock_raw_inputs:block-H15-exec-fd-inputs.json"
    "lock_raw_inputs:block-H15-sponge-inputs.json"
    "guard_customer_pii:block-H14-echo-pii-into-wip.json"
    "guard_customer_pii:block-H15-exec-fd-pii-into-wip.json"
    "guard_customer_pii:block-H15-sponge-pii-into-wip.json"
    "guard_customer_pii:block-H15-clobber-pii-into-wip.json"
    "guard_bulk_send:block-nested-copy-cwd-test-hooks.json"
    "guard_customer_pii:block-bash-cp-customer-file-dang-lam-with-rm-temp.json"
    "guard_customer_pii:block-bash-exec-fd-write-phone-dang-lam.json"
    "guard_customer_pii:block-bash-write-phone-dang-lam-with-rm-temp.json"
    "lock_raw_inputs:block-bash-noclobber-write-dau-vao.json"
    "lock_raw_inputs:block-git-rm-inputs-en.json"
    "lock_raw_inputs:block-nested-copy-cwd-write-dau-vao.json"
    "lock_raw_inputs:block-rm-dau-vao-vi.json"
    "protect_final_outputs:block-bash-exec-fd-overwrite-nhat-ky.json"
    "protect_final_outputs:block-bash-sed-inplace-channel-en.json"
    "protect_final_outputs:block-bash-sponge-overwrite-nhat-ky.json"
    "protect_final_outputs:block-bash-tee-overwrite-nhat-ky-vi.json"
    "protect_final_outputs:block-git-rm-outputs-en.json"
    "protect_final_outputs:block-nested-copy-cwd-overwrite-dau-ra.json"
    "protect_final_outputs:block-rm-dau-ra-vi.json"
)

saved_total=$TOTAL
saved_passed=$PASSED
saved_failed=$FAILED

pos_control_ok=1
for entry in "${POS_CONTROL_CASES[@]}"; do
    pc_hook="${entry%%:*}"
    pc_file="${entry#*:}"
    pc_script="$REPO_ROOT/operations/hooks/${pc_hook}.py"
    pc_path="$REPO_ROOT/tests/hooks/${pc_hook}/${pc_file}"
    control_out=$(HOOKS_DISABLED=1 run_hook_test "$pc_script" "$pc_hook" "$pc_path" 2>&1)
    if [[ "$control_out" != *"[FAIL]"* || "$control_out" != *"nhận mã 0"* ]]; then
        echo "  [FAIL] Ca đối chứng dương ($pc_hook/$pc_file): khi HOOKS_DISABLED=1, không phát hiện nhận mã 0: $control_out"
        pos_control_ok=0
    fi
done

TOTAL=$saved_total
PASSED=$saved_passed
FAILED=$saved_failed

if [ "$pos_control_ok" -eq 1 ]; then
    echo "  [PASS] Ca đối chứng dương (${#POS_CONTROL_CASES[@]} ca gồm H-v11/F15/F16/F19/F20/F26/F27/F28/F31/F32/F33/F34/F35/F38/F39/F41): khi HOOKS_DISABLED=1 (trả mã 0), runner phát hiện và báo FAIL. Bộ test không mù!"
else
    FAILED=$((FAILED + 1))
fi


echo ""
echo "=== KẾT QUẢ KIỂM THỬ ==="
echo "Tổng số ca: $TOTAL"
echo "Thành công:  $PASSED"
echo "Thất bại:    $FAILED"

if [ "$FAILED" -eq 0 ]; then
    echo ">>> TẤT CẢ CÁC CA KIỂM THỬ ĐÃ ĐẬU ($PASSED/$TOTAL) <<<"
    exit 0
else
    echo ">>> CÓ $FAILED CA KIỂM THỬ THẤT BẠI <<<"
    exit 1
fi
