#!/usr/bin/env bash
# ==============================================================================
# sync-harness.sh — Kiểm tra độ trôi và đồng bộ harness OPC với AIBOSS Office
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/operations/hooks"
MANIFEST_FILE="$HOOKS_DIR/HARNESS-MANIFEST.md"
SOURCE_REPO="${OPC_HARNESS_DIR:-/Users/erocathanh/Development/opc-business-harness}"

usage() {
    echo "Cách dùng:"
    echo "  $0 --check                                         Kiểm tra đối xứng MD5 nguồn (git show <commit>:<path>) và MD5 Office với manifest"
    echo "  $0 --pull <commit> [--force-overwrite-office-hooks] Trích xuất hook từ kho nguồn tại <commit> (mặc định chặn để bảo vệ lớp riêng Office)"
    exit 1
}

if [ $# -eq 0 ]; then
    usage
fi

ACTION="$1"

calc_md5_file() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "MISSING"
        return
    fi
    if command -v md5 >/dev/null 2>&1; then
        md5 -q "$file"
    else
        md5sum "$file" | awk '{print $1}'
    fi
}

calc_md5_stdin() {
    if command -v md5 >/dev/null 2>&1; then
        md5 -q
    else
        md5sum | awk '{print $1}'
    fi
}

source_rel_path_for() {
    local fname="$1"
    case "$fname" in
        pii_patterns.py)
            echo ".claude/skills/opc-wiki-source-of-truth/references/pii_patterns.py"
            ;;
        layout.py)
            echo ".claude/hooks/harness_layout.py"
            ;;
        office_root.py)
            echo ".claude/hooks/find_root.py"
            ;;
        *)
            echo ".claude/hooks/$fname"
            ;;
    esac
}

case "$ACTION" in
    --check)
        echo "=== Kiểm tra tính toàn vẹn đối xứng (2 chiều) Harness OPC & AIBOSS Office ==="
        echo "Thư mục hooks:    $HOOKS_DIR"
        echo "Tệp manifest:     $MANIFEST_FILE"
        echo "Kho nguồn OPC:    $SOURCE_REPO"

        if [ ! -f "$MANIFEST_FILE" ]; then
            echo "[sync-harness: LỖI] Không tìm thấy tệp manifest tại $MANIFEST_FILE" >&2
            exit 2
        fi

        if [ ! -d "$SOURCE_REPO/.git" ]; then
            echo "[sync-harness: LỖI] Không tìm thấy kho git nguồn OPC tại $SOURCE_REPO" >&2
            exit 2
        fi

        manifest_commit="$(grep -E "Commit nguồn:|HEAD tại commit" "$MANIFEST_FILE" 2>/dev/null | grep -o -E '[0-9a-f]{7,40}' | head -1 || true)"
        if [ -z "$manifest_commit" ]; then
            echo "[sync-harness: LỖI] Không đọc được mã commit nguồn từ $MANIFEST_FILE" >&2
            exit 2
        fi

        if ! git -C "$SOURCE_REPO" cat-file -e "${manifest_commit}^{commit}" 2>/dev/null; then
            echo "[sync-harness: LỖI] Commit nguồn '$manifest_commit' ghi trong manifest không tồn tại trong $SOURCE_REPO" >&2
            exit 2
        fi

        source_head_short="$(git -C "$SOURCE_REPO" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
        manifest_commit_full="$(git -C "$SOURCE_REPO" rev-parse "${manifest_commit}^{commit}" 2>/dev/null)"
        manifest_commit_short="${manifest_commit_full:0:7}"
        echo "Commit manifest:  $manifest_commit_short ($manifest_commit_full)"
        echo "HEAD nguồn OPC:   $source_head_short"
        if [ "$source_head_short" != "$manifest_commit_short" ]; then
            echo "[sync-harness: LƯU Ý] HEAD kho nguồn ($source_head_short) khác commit manifest ($manifest_commit_short); đối soát theo đúng blob tại $manifest_commit_short."
        else
            echo "[sync-harness: OK] HEAD kho nguồn khớp commit manifest ($manifest_commit_short)."
        fi
        echo ""

        FAILED=0
        DEVIATED_COUNT=0
        DIFF_FROM_SRC_COUNT=0
        SAME_AS_SRC_COUNT=0

        MANAGED_FILES=(
            "bash_parser.py"
            "block_external_scan.py"
            "block_mass_delete.py"
            "block_secret_leak.py"
            "guard_bulk_send.py"
            "guard_customer_pii.py"
            "lock_raw_inputs.py"
            "protect_final_outputs.py"
            "remind_cross_check.py"
            "pii_patterns.py"
            "layout.py"
            "office_root.py"
        )

        # Danh sách tường minh các tệp chỉ tồn tại ở Office (không có blob nguồn tương ứng ở OPC).
        # Hiện tại cả 12 tệp trong MANAGED_FILES đều có ánh xạ nguồn OPC bắt buộc.
        OFFICE_ONLY_FILES=()

        is_office_only_file() {
            local target="$1"
            local item
            for item in "${OFFICE_ONLY_FILES[@]+"${OFFICE_ONLY_FILES[@]}"}"; do
                if [ "$item" = "$target" ]; then
                    return 0
                fi
            done
            return 1
        }

        for fname in "${MANAGED_FILES[@]}"; do
            fpath="$HOOKS_DIR/$fname"
            if [ ! -f "$fpath" ]; then
                echo "[sync-harness: THIẾU] Tệp $fname không tồn tại trên đĩa!" >&2
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                continue
            fi

            current_office_hash="$(calc_md5_file "$fpath")"

            row="$(grep -E "\|\s*\`?$fname\`?\s*\|" "$MANIFEST_FILE" | head -1 || true)"
            expected_src_hash=""
            expected_office_hash=""
            if [ -n "$row" ]; then
                expected_src_hash="$(echo "$row" | awk -F'|' '{print $3}' | tr -d ' `' || true)"
                expected_office_hash="$(echo "$row" | awk -F'|' '{print $4}' | tr -d ' `' || true)"
            fi

            if [ -z "$expected_office_hash" ] || ! [[ "$expected_office_hash" =~ ^[0-9a-f]{32}$ ]]; then
                echo "[sync-harness: LỖI] Không tìm thấy hash MD5 AIBOSS Office hợp lệ (32 ký tự hex thường) của $fname trong manifest!" >&2
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                continue
            fi

            # 1. Kiểm chiều nguồn OPC (bắt buộc 32 ký tự hex thường cho mọi tệp không nằm trong OFFICE_ONLY_FILES — H10 fail-closed)
            src_status="N/A (tệp riêng Office)"
            if ! is_office_only_file "$fname"; then
                if [ -z "$expected_src_hash" ] || ! [[ "$expected_src_hash" =~ ^[0-9a-f]{32}$ ]]; then
                    echo "[sync-harness: LỖI] Không tìm thấy hash MD5 nguồn OPC hợp lệ (32 ký tự hex thường) của $fname trong manifest (nhận: '${expected_src_hash}')!" >&2
                    FAILED=1
                    DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                    continue
                fi
                src_rel="$(source_rel_path_for "$fname")"
                if ! git -C "$SOURCE_REPO" cat-file -e "${manifest_commit}:${src_rel}" 2>/dev/null; then
                    echo "[sync-harness: LỖI NGUỒN] Không tìm thấy blob ${manifest_commit}:${src_rel} trong kho nguồn!" >&2
                    FAILED=1
                    DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                    continue
                fi
                actual_src_hash="$(git -C "$SOURCE_REPO" show "${manifest_commit}:${src_rel}" | calc_md5_stdin)"
                if [ "$actual_src_hash" != "$expected_src_hash" ]; then
                    echo "[sync-harness: LỆCH NGUỒN] $fname (${manifest_commit_short}:${src_rel}): blob nguồn=$actual_src_hash != manifest cột 3=$expected_src_hash" >&2
                    FAILED=1
                    DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                    continue
                fi
                src_status="nguồn=$actual_src_hash"
                if [ "$actual_src_hash" = "$current_office_hash" ]; then
                    SAME_AS_SRC_COUNT=$((SAME_AS_SRC_COUNT + 1))
                else
                    DIFF_FROM_SRC_COUNT=$((DIFF_FROM_SRC_COUNT + 1))
                fi
            fi

            # 2. Kiểm chiều AIBOSS Office (tệp thật trên đĩa so với cột 4)
            if [ "$current_office_hash" != "$expected_office_hash" ]; then
                echo "[sync-harness: LỆCH OFFICE] $fname: đĩa=$current_office_hash != manifest=$expected_office_hash" >&2
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
            else
                echo "[sync-harness: OK]   $fname: office=$current_office_hash ($src_status)"
            fi
        done

        echo ""
        if [ "$FAILED" -ne 0 ]; then
            echo "[sync-harness: THẤT BẠI] Có $DEVIATED_COUNT mục bị lệch hoặc thiếu so với manifest!" >&2
            exit 1
        else
            echo "[sync-harness: THÀNH CÔNG] Cả 2 chiều (blob nguồn tại $manifest_commit_short và ${#MANAGED_FILES[@]} tệp AIBOSS Office trên đĩa) khớp SỔ 100% — office KHÁC nguồn ở ${DIFF_FROM_SRC_COUNT}/${#MANAGED_FILES[@]} tệp (có chủ đích: lớp riêng office), trùng byte ${SAME_AS_SRC_COUNT}/${#MANAGED_FILES[@]}."
            exit 0
        fi
        ;;

    --pull)
        if [ $# -lt 2 ]; then
            echo "Lỗi: Cần truyền mã commit nguồn (ví dụ: $0 --pull b3cfaf5)" >&2
            exit 1
        fi
        TARGET_COMMIT="$2"
        FORCE_FLAG="${3:-}"

        echo "[sync-harness: CẢNH BÁO] Các hook trong AIBOSS Office là siêu tập (superset) của opc-business-harness (gồm F15–F41, F6, §6b, Hook 2.1/2.2)." >&2
        if [ "$FORCE_FLAG" != "--force-overwrite-office-hooks" ]; then
            echo "[sync-harness: CHẶN AN TOÀN] Từ chối ghi đè trực tiếp operations/hooks/*.py để không làm mất các bản vá riêng của Office." >&2
            echo "Nếu bạn thật sự muốn chép đè từ blob git tại commit '$TARGET_COMMIT', hãy truyền thêm cờ --force-overwrite-office-hooks rồi hoà tay lại các bản vá Office." >&2
            exit 2
        fi

        if [ ! -d "$SOURCE_REPO/.git" ]; then
            echo "Lỗi: Không tìm thấy kho git nguồn tại $SOURCE_REPO" >&2
            exit 2
        fi

        if ! git -C "$SOURCE_REPO" cat-file -e "${TARGET_COMMIT}^{commit}" 2>/dev/null; then
            echo "Lỗi: Commit '$TARGET_COMMIT' không tồn tại trong $SOURCE_REPO" >&2
            exit 2
        fi

        RESOLVED_COMMIT="$(git -C "$SOURCE_REPO" rev-parse "${TARGET_COMMIT}^{commit}")"
        echo "=== Đang trích xuất hook từ blob git tại commit $RESOLVED_COMMIT ==="
        UPSTREAM_HOOKS=(
            "bash_parser.py"
            "block_external_scan.py"
            "block_mass_delete.py"
            "block_secret_leak.py"
            "guard_bulk_send.py"
            "guard_customer_pii.py"
            "lock_raw_inputs.py"
            "protect_final_outputs.py"
            "remind_cross_check.py"
            "pii_patterns.py"
        )
        for fname in "${UPSTREAM_HOOKS[@]}"; do
            src_rel="$(source_rel_path_for "$fname")"
            git -C "$SOURCE_REPO" show "${RESOLVED_COMMIT}:${src_rel}" > "$HOOKS_DIR/$fname"
            chmod +x "$HOOKS_DIR/$fname" 2>/dev/null || true
        done

        echo "Đã trích xuất từ git show ${RESOLVED_COMMIT}. BẮT BUỘC phải hoà lại các bản vá AIBOSS Office và cập nhật HARNESS-MANIFEST.md trước khi commit!"
        exit 0
        ;;

    *)
        usage
        ;;
esac
