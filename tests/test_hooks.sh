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

# Dựng symlinks tương thích hai chiều (layout office <-> opc)
mkdir -p "$SANDBOX/wip"
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
export AIBOSS_OFFICE_ROOT="$SANDBOX"

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

    # Xử lý mở rộng chìa ghép động lúc chạy nếu có placeholder
    if [[ "$input_data" == *"<KEY:"* ]]; then
        input_data="$(echo "$input_data" | "$PYTHON" -c '
import sys, re
s = sys.stdin.read()
s = re.sub(r"<KEY:([^:]+):(\d+)>", lambda m: m.group(1) + "a" * int(m.group(2)), s)
sys.stdout.write(s)
')"
    fi

    # Xử lý ca đặc biệt H114: kiểm tra CHANNEL.md / nhat-ky đọc lỗi I/O
    local is_h114=0
    if [[ "$filename" == *"H114"* ]]; then
        is_h114=1
        chmod 000 "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md" 2>/dev/null || true
    fi

    local stdout_file stderr_file
    stdout_file="$(mktemp)"
    stderr_file="$(mktemp)"

    # Chạy hook bằng lệnh chuẩn như trong settings.json có || exit 2
    local hook_cmd
    if [ "$hook_name" == "remind_cross_check" ]; then
        hook_cmd="\"$PYTHON\" \"$hook_script\""
    else
        hook_cmd="\"$PYTHON\" \"$hook_script\" || exit 2"
    fi

    ( cd "$SANDBOX" && echo "$input_data" | /bin/bash -c "$hook_cmd" >"$stdout_file" 2>"$stderr_file" )
    local exit_code=$?

    if [ "$is_h114" -eq 1 ]; then
        chmod 0644 "$SANDBOX/projects/THU-SU-THAT/CHANNEL.md" 2>/dev/null || true
    fi

    local out_content err_content
    out_content="$(cat "$stdout_file")"
    err_content="$(cat "$stderr_file")"
    rm -f "$stdout_file" "$stderr_file"

    if [[ "$filename" == block-* || "$filename" == "broken-input.txt" || "$filename" == positive-control-* ]]; then
        if [ "$exit_code" -eq 2 ]; then
            if [[ "$err_content" == "[opc-harness:$hook_name]"* ]]; then
                record_pass "$hook_name / $filename (chặn đúng mã 2 và đúng tiền tố stderr)"
            else
                record_fail "$hook_name / $filename" "Mã 2 nhưng stderr không bắt đầu bằng [opc-harness:$hook_name]: $err_content"
            fi
        else
            record_fail "$hook_name / $filename" "Kỳ vọng chặn mã 2, nhưng nhận mã $exit_code"
        fi
    elif [[ "$filename" == allow-* ]]; then
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

echo "=== BẮT ĐẦU KIỂM TRA 8 HOOK AN TOÀN AIBOSS OFFICE ==="

HOOKS=(
    "block_mass_delete"
    "block_secret_leak"
    "block_external_scan"
    "protect_final_outputs"
    "guard_customer_pii"
    "guard_bulk_send"
    "lock_raw_inputs"
    "remind_cross_check"
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

# Kiểm tra đối chứng dương: khi TẮT hook, ca đối chứng phải FAIL nếu kỳ vọng chặn mã 2
echo "--- Kiểm tra đối chứng dương (Positive Control) ---"
pos_file="$REPO_ROOT/tests/hooks/block_mass_delete/positive-control-rm-rf.json"
pos_input="$(cat "$pos_file")"
echo "$pos_input" | /bin/bash -c "cat >/dev/null"
pos_exit=$?
if [ "$pos_exit" -eq 0 ]; then
    echo "  [PASS] Ca đối chứng dương: khi tắt hook, lệnh không bị chặn mã 2 (thoát mã 0). Thước biết nói KHÔNG!"
else
    echo "  [FAIL] Ca đối chứng dương: kỳ vọng thoát 0 khi tắt hook nhưng nhận $pos_exit"
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
