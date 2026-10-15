# HARNESS-MANIFEST — Sổ theo dõi bản chụp và đồng bộ harness OPC vào AIBOSS Office

- **Kho nguồn:** `/Users/erocathanh/Development/opc-business-harness` (CHỈ ĐỌC)
- **Commit nguồn:** `b3cfaf57f5ac1ae7f6251b8465595ee2e514a3ad` (tag `harness-v15` = `b3cfaf5`, nâng từ `5f2148a` / `253b8c4`)
- **Ngày hợp lưu:** 15/10/2026
- **Người thực hiện:** `antigravity-aiboss-office-backend` (Backend Architect)
- **Cơ chế đồng bộ:** Hợp lưu 3 bên (`5f2148a` · `b3cfaf5` `harness-v15` · bản AIBOSS Office sau S17h), giữ các lớp bảo vệ chặt hơn của Office (H1–H9, §6, §6b, §6d–§6g)
- **Kịch bản kiểm tra:** `operations/scripts/sync-harness.sh --check` (kiểm đối xứng 2 chiều: `git show <manifest_commit>:<src_path>` ↔ cột MD5 nguồn, và tệp Office ↔ cột MD5 AIBOSS Office)

---

## 1. Quyền bổ sung từ tác giả (ADDITIONAL-PERMISSIONS.md dòng 3)

> Ngoài giấy phép CC BY-NC 4.0 trong tệp LICENSE, Eroca Thanh cho phép mỗi người dùng sao chép, sửa và chạy bộ khung này để vận hành nội bộ chính doanh nghiệp của mình, kể cả doanh nghiệp có thu tiền. Quyền bổ sung này không bao gồm: bán lại bộ khung, phân phối bản đã sửa để thu tiền, hay đưa bộ khung vào khoá học, dịch vụ hoặc sản phẩm thu tiền — những việc đó vẫn cần tác giả cho phép bằng văn bản.

---

## 2. Bảng mã băm MD5 kiểm định (Snapshot Checksums tại `b3cfaf5` — `harness-v15`)

| Tên tệp | MD5 nguồn (b3cfaf5) | MD5 AIBOSS Office | Trạng thái | Ghi chú điều chỉnh (H-v11 v02 + harness-v15 + S17a..S17h) |
|---|---|---|---|---|
| `bash_parser.py` | `882e5ed86efc7bc6e6ac26a57b1e1d80` | `5f5a187880d0e2f2008d5dc796c8919a` | Siêu tập (2484 dòng) | Giữ trọn S17a..S17h (`operations/data`, wrapper `caffeinate`/`script`/`xargs`, `Path` `/`, receiver & đối số theo thứ tự tại `call_pos` F37–F38) + hợp lưu v09..v15 (`logical_rel_path`, `ln`/`git mv`/`unlink`/`rmdir`/`ditto`/`install`, `rm` mọi cờ/wrapper & `git rm` trừ `--cached`, `>|`, `N>`/`N>>`/`N>|`, `sponge`/`sponge -a`, tách `tee append` vs `tee overwrite` và `node fs delete` vs `node fs write`, `split_heredocs_detailed`, `extract_executed_heredocs`, không phân biệt hoa thường) |
| `block_external_scan.py` | `3409da14a0dbcf454b1e830800f94ba8` | `9b6664410d3d90b6c01c4c60fec771bf` | Khớp quy ước (224 dòng) | Hợp lưu v09 + H2: kiểm tra công cụ `Glob` (`path` + trích xuất các thành phần thư mục tĩnh `extract_glob_pattern_root` dừng trước toàn bộ thành phần chứa wildcard) và đối số đường dẫn lệnh tìm kiếm ngoài kho |
| `block_mass_delete.py` | `735e82b1937f2c20ef566f89a5ade8bd` | `4f632c98c12099c847134dbbc83c755b` | Khớp quy ước (179 dòng) | Hợp lưu v09: chặn `git branch -D`/`--delete --force` và `git push origin +refspec`; nhập `layout.py` cho `CHANNEL.md` |
| `block_secret_leak.py` | `bba0242c84b8ca2c6f189e11c3d15297` | `a9e02a71e619ca8869cf4e6f57fbef17` | Khớp quy ước (297 dòng) | Hợp lưu v11: tên tệp env không phân biệt hoa thường (`.env`, `.envrc`, `.env-*`, `.env_*`, `*.env`), miễn `.env.example`/`.env.sample` và `process.env`/`import.meta.env`, tách heredoc ghi tài liệu vs heredoc chảy vào trình thông dịch/ghi-rồi-chạy; giữ chặn `.config/aiboss-office/**` và `ai-agent/*/khoa/**` của Office |
| `guard_bulk_send.py` | `2ca56b7902454cf9b858d7a5e0158763` | `fd37bb7b2e68e50d90bc49de1bf52afd` | Khớp quy ước (516 dòng) | Hợp lưu v09..v15 (dò gốc phiên qua `office_root.resolve_project_root`, biến URL trong `curl` POST, đọc tệp kịch bản `< 1 MB` / `< 1_000_000` bytes, `smtplib` import/gọi thật, bỏ qua heredoc chỉ ghi tài liệu) + giữ chế độ **CHẶN mã 2** của Office (kèm ghi sổ `operations/data/approvals/<YYYY-MM-DD>.jsonl` đã che PII) và bắt `fetch_page_messages` |
| `guard_customer_pii.py` | `7e12aa0441f103cf450ffef7eaeb68fa` | `0c515e5ff35e1505009699c6dbd34e5b` | Khớp quy ước (342 dòng) | Hợp lưu v09..v15 + H1/§6b/§6e/§6f: dò gốc phiên fail-closed qua `office_root.resolve_project_root(cwd)`, chỉ miễn quét PII cho ngăn `inputs/` trực tiếp dưới **gốc phiên** (`projects/<p>/inputs/...`, không miễn `inputs/` của bản sao lồng), loại đích chỉ-xoá/làm rỗng (`DELETE_OR_EMPTY_REASONS`: `rm`, `git rm`, `unlink`, `rmdir`, `truncate`, `touch`, `node fs delete`) khỏi nơi ghi PII nhưng giữ nguyên đường dò dự phòng bằng regex khi `bash_parser` không trả đích nào |
| `lock_raw_inputs.py` | `3929e9d11e0233959f2fd52223e75811` | `fd6b61518e972d2a106f4713aa435b4f` | Khớp quy ước (102 dòng) | Hợp lưu v09..v15 + H1/§6b/H9: dò gốc phiên fail-closed qua `office_root.resolve_project_root(cwd)`, áp luật hợp nhất §6b (`candidate_rel_paths_with_roots`: chặn khi đích thuộc `inputs/`/`references/`/`templates/`/`operations/data/` theo gốc phiên HOẶC theo dấu `config/office.json` gần nhất phía trên đích), chặn mọi dạng `rm`/`git rm` (trừ `--cached`)/`>|`/`exec N>`/`sponge` |
| `protect_final_outputs.py` | `2974e3e14f67f092dc4abdae4d3ae7ab` | `38c65818a6bc0c93dc78049198c0170b` | Khớp quy ước (351 dòng) | Hợp lưu v09..v15 + H1/H3/H4/H5/§6b: dò gốc phiên fail-closed qua `office_root.resolve_project_root(cwd)` và luật hợp nhất §6b; kiểm tra `Edit`/`Write`/`MultiEdit` tệp nhật ký nối đuôi tuần tự (`cur_content`, bác `old_string == ""`, không rstrip CR/LF) và chỉ cho phép ghi nhật ký qua Bash bằng `\d*>>`, `tee -a`, `sponge -a`; chặn mọi `ln` có đích thuộc `outputs/`, kiểm tra `os.path.lexists(abs_path)` cho symlink đứt đích trong `outputs/`, và dò đệ quy `layout.is_outputs_dir` khi `mv` dự án hoặc gốc `projects/` |
| `remind_cross_check.py` | `d47f80a6b5e1cddfed24af0ba66f6298` | `086ba7c3b09cc99c6de91f7038d23e0f` | Khớp quy ước (115 dòng) | Nhập `layout.py` kiểm tra song ngữ `/wip/` (`/DANG-LAM/`) và `/outputs/` (`/DAU-RA/`) |
| `pii_patterns.py` | `696d233bd31de62fcccb7e66f641bcce` | `696d233bd31de62fcccb7e66f641bcce` | Giống 100% (325 dòng) | Nguyên văn từ `.claude/skills/opc-wiki-source-of-truth/references/pii_patterns.py` của kho OPC |
| `layout.py` | `f0a0df9210b4f4eb97411111d352ad48` | `2e19042ca0c6072e2d58ea3dff9d9243` | Tương đương `harness_layout.py` (118 dòng) | Mô-đun ánh xạ thư mục song ngữ không phân biệt hoa thường (`case-insensitive`), kèm `resolve_project_root(cwd)` từ v12 và các hàm mở rộng riêng của Office (`is_references_dir`, `is_templates_dir`, `is_progress_file`, `has_final_suffix`, `CHANNEL_FILE_ALL`, `PROGRESS_FILE_ALL`) |
| `office_root.py` | `7155a99fb2e91024e0a31613ddc9666b` | `fb118967ecd438fd7401f7ca9483c301` | Tương đương `find_root.py` (180 dòng) | Dò gốc phiên fail-closed theo `config/office.json` (ưu tiên `CLAUDE_PROJECT_DIR` trước `cwd`, thoát mã `2` khi không thấy gốc Office) và cung cấp `candidate_rel_paths_with_roots` cho luật hợp nhất §6b |

*(Lưu ý: Office còn có thêm Hook 2.1 `operations/hooks/block_public_publish.py` — MD5 `e182ec9afe78306e09fe3fc72dae9c52`, 1388 dòng — chuyên trách chặn xuất bản công khai, đọc token Meta và HTTP write ra ngoài danh sách trắng, đã đồng bộ dùng `office_root.resolve_project_root(cwd)`).*

---

## 3. Hai mô-đun gốc/layout tương đương (`harness_layout.py` & `find_root.py` ở thượng nguồn)

Ở commit `b3cfaf5` (`harness-v15`), kho nguồn OPC có hai tệp `.claude/hooks/harness_layout.py` (`f0a0df9210b4f4eb97411111d352ad48`) và `.claude/hooks/find_root.py` (`7155a99fb2e91024e0a31613ddc9666b`). Để tránh nhân đôi mô-đun trong Office, tất cả các hook của Office dùng hai tệp gốc của Office đã được bổ sung đầy đủ các hàm tương đương kèm lớp bảo vệ riêng của Office:

### 3.1. `operations/hooks/layout.py` (`2e19042ca0c6072e2d58ea3dff9d9243`) — tương đương `harness_layout.py`
- **Mục đích:** Bảng tên thư mục song ngữ tập trung duy nhất, tách lớp tên khỏi logic kiểm soát an toàn.
- **Cập nhật H-v11 v02 (khớp mã 100%):**
  - Toàn bộ các hàm có trong `harness_layout.py` thượng nguồn (`is_projects_root`, `is_inputs_dir`, `is_wip_dir`, `is_outputs_dir`, `is_sample_ground_truth`, `is_channel_file`, `resolve_project_root`) đều có mặt và so khớp **không phân biệt hoa thường** (`case-insensitive`).
  - Các hàm và hằng số mở rộng riêng của Office (được cài đặt thật trong `operations/hooks/layout.py:39–104`): `CHANNEL_FILE_ALL`, `PROGRESS_FILE_ALL`, `is_references_dir`, `is_templates_dir`, `is_progress_file`, `has_final_suffix`, và tập `INPUTS_DIR_ALL` của Office bao gồm cả `references`/`THAM-KHAO`/`templates`/`BAN-MAU`.

### 3.2. `operations/hooks/office_root.py` (`fb118967ecd438fd7401f7ca9483c301`) — tương đương `find_root.py`
- **Mục đích:** Xác định gốc phiên AIBOSS Office theo hướng **fail-closed** (`exit 2` khi không tìm thấy `config/office.json`) và hỗ trợ luật hợp nhất §6b cho bản sao lồng.
- **Cập nhật H-v11 v02 (khớp mã 100%):**
  - `find_office_root(start_dir)` và `resolve_project_root(cwd)`: ưu tiên kiểm tra `AIBOSS_OFFICE_ROOT`, sau đó đi ngược tối đa 8 tầng cha từ `CLAUDE_PROJECT_DIR` (chỉ dùng `start_dir`/`cwd` khi `CLAUDE_PROJECT_DIR` trống) để tìm `config/office.json`. Nếu không tìm thấy `config/office.json`, hàm in thông báo `[opc-harness] không tìm thấy gốc office ...` ra `stderr` và thoát mã `2` (fail-closed, tuyệt đối không fallback âm thầm về `CLAUDE_PROJECT_DIR` hay `cwd`).
  - `nearest_office_root_for_target(raw_path, cwd)` và `candidate_rel_paths_with_roots(raw_path, cwd, session_root)`: triển khai luật hợp nhất §6b cho `lock_raw_inputs.py` và `protect_final_outputs.py` — xét đồng thời đường dẫn tương đối theo **gốc phiên** và theo **dấu `config/office.json` gần nhất phía trên tệp đích** (đi ngược tối đa 8 tầng cha từ thư mục chứa đích).
  - Các hàm tương thích `find_root`, `find_repo_root`, `resolve_project_dir`: mặc định uỷ quyền về `find_office_root` (fail-closed theo `config/office.json`); chế độ bậc lùi theo dấu mốc OPC (`AGENTS.md`, `.claude/settings.json` + `CLAUDE.md`) chỉ bật khi biến môi trường `OPC_ALLOW_NON_OFFICE_ROOT=1` được đặt tường minh kèm dòng cảnh báo trên `stderr`.

---

## 4. Chi tiết hợp lưu 3 bên trên `bash_parser.py` và các Fixture đổi kỳ vọng

### 4.1. Các mảnh thượng nguồn (`5f2148a → b3cfaf5` `harness-v15`) đã áp vào `operations/hooks/bash_parser.py`
1. **Áp dụng đầy đủ:**
   - Hàm `logical_rel_path(raw_path, cwd, project_dir)` để xét vị trí đích thật của symlink/hardlink mới tạo trước khi giải `realpath` trên basename cuối (vẫn `realpath` thư mục cha).
   - So khớp không phân biệt hoa thường (`case-insensitive`) trong `canonical_path`, `_seg_matches_protected`, `is_dau_ra_or_final`, và chặn đường dẫn leo ngược `..` giả danh trong `is_in_project_dau_vao`.
   - Mở rộng `extract_write_targets` từ v09..v15:
     - `git mv`, `ln` (kiểm tra cả đích liên kết và nguồn khi tạo hardlink không có `-s`), `unlink`, `rmdir`, `ditto`, và bỏ qua cờ có đối số của `install` (`-m`, `-o`, `-g`, `-S`).
     - Mọi dạng `rm` (`rm`, `/bin/rm`, `env rm`, `command rm`, `sudo rm` với mọi cờ `-f`, `-r`, `-rf`, `--force`, ...) và `git rm` (trừ `git rm --cached` chỉ bỏ theo dõi index, không xoá tệp trên đĩa — v13 / §6d).
     - Ba mẫu ghi/điều hướng từ v15 (§6f/§6g): toán tử ghi đè bỏ noclobber `>|`, điều hướng theo số hiệu file descriptor `N>`, `N>>`, `N>|` (kể cả `exec N>tệp`, bỏ qua `>&N` và `/dev/null`), và công cụ `sponge` (`sponge -a` tạo reason `sponge append target`, `sponge` không có `-a` tạo reason `sponge target`; `tee -a` tạo `tee append target`, `tee` thường tạo `tee overwrite target`).
     - Tách reason `node fs delete` (`unlink`, `unlinkSync`, `rm`, `rmSync`, `rmdir`, `rmdirSync`) khỏi `node fs write` để `guard_customer_pii.py` phân biệt thao tác chỉ-xoá với thao tác ghi nội dung (v14/v15).
   - Bộ tách heredoc chi tiết từ v10/v11: `extract_heredoc_file_write_target`, `split_heredocs_detailed`, `get_executed_script_arg`, `find_heredoc_body_for_script`, `extract_executed_heredocs` (phục vụ `block_secret_leak.py` và `guard_bulk_send.py`).
2. **Giữ nguyên phần Siêu tập của Office (không ghi đè bằng bản rút gọn của thượng nguồn):**
   - Toàn bộ các hàm phục vụ Hook 2.1 (`block_public_publish.py`) và S17a..S17h: nhận diện `is_in_operations_data`, bóc wrapper `caffeinate`/`script` (kể cả tệp transcript), giải chuỗi tĩnh Python/Node, toán tử `/` của `Path`, phân tích thứ tự binding receiver/đối số tại `call_pos` (`F37`–`F38`), và tạo đích `$DYNAMIC_WRITE` fail-closed.

### 4.2. Danh sách đầy đủ 16 fixture trong `tests/hooks/guard_bulk_send/` chuyển kỳ vọng từ `ask` sang `block` (mã thoát `2`)
Trong kho OPC gốc, `guard_bulk_send.py` trả mã `0` kèm JSON `permissionDecision: "ask"`. Trong AIBOSS Office, theo kiến trúc cô lập ghế (các ghế chạy nền `claude -p`), `guard_bulk_send.py` được thiết kế **CHẶN cứng với mã thoát `2`** đồng thời ghi yêu cầu vào sổ `operations/data/approvals/<YYYY-MM-DD>.jsonl`. Do đó, khi chuyển toàn bộ bộ fixture thượng nguồn qua `operations/scripts/convert-harness-tests.mjs:61–64`, tất cả **16** ca kiểm thử `ask-*.json` của `guard_bulk_send` (gồm 5 ca từ `v01..v08`, 10 ca từ `v09..v11`, và 1 ca từ `v12..v15`) được chuyển tên sang `block-*.json` (kỳ vọng mã thoát `2`, giữ nguyên nội dung lệnh):
1. `ask-bash-script-bulk-send.json` ➔ `block-bash-script-bulk-send.json` *(thêm ở v09..v11)*
2. `ask-curl-meta-comments-form.json` ➔ `block-curl-meta-comments-form.json` *(thêm ở v09..v11)*
3. `ask-curl-meta-delete.json` ➔ `block-curl-meta-delete.json` *(thêm ở v09..v11)*
4. `ask-curl-meta-feed-post.json` ➔ `block-curl-meta-feed-post.json` *(thêm ở v09..v11)*
5. `ask-curl-post-var-prefix-url.json` ➔ `block-curl-post-var-prefix-url.json` *(thêm ở v09..v11)*
6. `ask-curl-post-var-url.json` ➔ `block-curl-post-var-url.json` *(thêm ở v09..v11)*
7. `ask-heredoc-write-then-run-script.json` ➔ `block-heredoc-write-then-run-script.json` *(thêm ở v09..v11)*
8. `ask-nested-copy-cwd-test-hooks.json` ➔ `block-nested-copy-cwd-test-hooks.json` *(thêm ở v12..v15)*
9. `ask-node-send-dong-y.json` ➔ `block-node-send-dong-y.json` *(có từ v01..v08)*
10. `ask-python-heredoc-import-smtplib.json` ➔ `block-python-heredoc-import-smtplib.json` *(thêm ở v09..v11)*
11. `ask-python-page-comments-dong-y.json` ➔ `block-python-page-comments-dong-y.json` *(có từ v01..v08)*
12. `ask-python-page-inbox-dong-y.json` ➔ `block-python-page-inbox-dong-y.json` *(có từ v01..v08)*
13. `ask-python-page-post-dong-y.json` ➔ `block-python-page-post-dong-y.json` *(có từ v01..v08)*
14. `ask-python-requests-delete-meta.json` ➔ `block-python-requests-delete-meta.json` *(thêm ở v09..v11)*
15. `ask-python-smtplib-send.json` ➔ `block-python-smtplib-send.json` *(có từ v01..v08)*
16. `ask-run-custom-bulk-send-script.json` ➔ `block-run-custom-bulk-send-script.json` *(thêm ở v09..v11)*

---

## 5. Xuất xứ dữ liệu tổng hợp trong kiểm thử (Synthetic Test Data Provenance — H8) và Giới hạn đã biết

- **Xuất xứ dữ liệu tổng hợp (H8):** Toàn bộ thông tin cá nhân dùng trong kịch bản kiểm thử `tests/test_hooks.sh` và các tệp fixture dưới `tests/hooks/guard_customer_pii/` (bao gồm tên mẫu `Nguyen Van A`, số điện thoại mẫu `0900 000 000` hoặc dãy số tuần tự `0912345678`, và địa chỉ thư điện tử thuộc miền dành riêng cho ví dụ theo RFC 2606 `nguyen.van.a@example.com`) đều là **dữ liệu giả tổng hợp (synthetic test data)** phục vụ kiểm thử biểu thức chính quy PII, không thuộc về bất kỳ cá nhân hay khách hàng có thật nào. Bộ chuyển đổi `operations/scripts/convert-harness-tests.mjs` tự động ánh xạ chuỗi mẫu thượng nguồn sang chuỗi tổng hợp theo quy ước H8.
- **Giới hạn đã biết (Known Limitations):** Xem chi tiết đầy đủ tại `operations/SAN-AN-TOAN-GHE.md` (Mục 3 — Sổ rủi ro tồn dư `RR-01`..`RR-05` và Mục 3.3 — các mục `H1b`, `H9` đã đóng ở H-v11 v02).
