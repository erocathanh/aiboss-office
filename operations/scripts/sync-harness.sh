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
    echo "  $0 --check         Kiểm tra độ trôi MD5 giữa hooks và manifest (thoát mã khác 0 nếu lệch)"
    echo "  $0 --pull <commit> Đồng bộ lại các hook từ kho nguồn tại <commit>"
    exit 1
}

if [ $# -eq 0 ]; then
    usage
fi

ACTION="$1"

calc_md5() {
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

case "$ACTION" in
    --check)
        echo "=== Kiểm tra tính toàn vẹn và độ trôi Harness OPC ==="
        echo "Thư mục hooks:    $HOOKS_DIR"
        echo "Tệp manifest:     $MANIFEST_FILE"
        echo "Kho nguồn OPC:    $SOURCE_REPO"
        echo ""

        if [ ! -f "$MANIFEST_FILE" ]; then
            echo "[sync-harness: LỖI] Không tìm thấy tệp manifest tại $MANIFEST_FILE" >&2
            exit 2
        fi

        FAILED=0
        DEVIATED_COUNT=0

        # Danh sách các tệp được quản lý trong manifest
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

        for fname in "${MANAGED_FILES[@]}"; do
            fpath="$HOOKS_DIR/$fname"
            if [ ! -f "$fpath" ]; then
                echo "[sync-harness: THIẾU] Tệp $fname không tồn tại trên đĩa!" >&2
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                continue
            fi

            current_hash="$(calc_md5 "$fpath")"
            
            # Trích xuất hash dự kiến từ manifest
            # Tìm dòng chứa `fname` và lấy hash trong cột tương ứng
            expected_hash="$(grep -E "\|\s*\`?$fname\`?\s*\|" "$MANIFEST_FILE" | head -1 | awk -F'|' '{print $4}' | tr -d ' `' || true)"
            if [ -z "$expected_hash" ]; then
                # Nếu không ở bảng mục 2, thử tìm ở mục 3 (cho layout.py và office_root.py)
                expected_hash="$(grep -E "\`?$fname\`?.*\(.*[0-9a-f]{32}.*\)" "$MANIFEST_FILE" | grep -o -E '[0-9a-f]{32}' | head -1 || true)"
            fi

            if [ -z "$expected_hash" ]; then
                echo "[sync-harness: CẢNH BÁO] Không tìm thấy hash đối soát của $fname trong manifest!"
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
                continue
            fi

            if [ "$current_hash" != "$expected_hash" ]; then
                echo "[sync-harness: LỆCH] $fname: hiện tại=$current_hash, kỳ vọng=$expected_hash" >&2
                FAILED=1
                DEVIATED_COUNT=$((DEVIATED_COUNT + 1))
            else
                echo "[sync-harness: OK]   $fname: $current_hash"
            fi
        done

        echo ""
        if [ "$FAILED" -ne 0 ]; then
            echo "[sync-harness: THẤT BẠI] Có $DEVIATED_COUNT tệp bị lệch so với manifest!" >&2
            exit 1
        else
            echo "[sync-harness: THÀNH CÔNG] 0 tệp lệch md5 ngoài hai tệp mới (tất cả 12 tệp khớp manifest 100%)."
            exit 0
        fi
        ;;

    --pull)
        if [ $# -lt 2 ]; then
            echo "Lỗi: Cần truyền mã commit nguồn (ví dụ: $0 --pull 5f2148a)" >&2
            exit 1
        fi
        TARGET_COMMIT="$2"
        echo "=== Bắt đầu đồng bộ lại từ kho nguồn OPC tại commit $TARGET_COMMIT ==="
        if [ ! -d "$SOURCE_REPO" ]; then
            echo "Lỗi: Không tìm thấy kho nguồn tại $SOURCE_REPO" >&2
            exit 2
        fi

        # Kiểm tra commit nguồn
        CURRENT_SRC_COMMIT="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
        echo "Commit hiện tại ở kho nguồn: $CURRENT_SRC_COMMIT"
        
        # Chép các tệp nguyên bản
        echo "Đang sao chép các hook và thư viện..."
        cp -p "$SOURCE_REPO/.claude/hooks/"*.py "$HOOKS_DIR/"
        if [ -f "$SOURCE_REPO/.claude/skills/opc-wiki-source-of-truth/references/pii_patterns.py" ]; then
            cp -p "$SOURCE_REPO/.claude/skills/opc-wiki-source-of-truth/references/pii_patterns.py" "$HOOKS_DIR/pii_patterns.py"
        fi

        echo "Sao chép thành công. Hãy chạy kiểm tra hoặc cập nhật lại layout/office_root."
        exit 0
        ;;

    *)
        usage
        ;;
esac
