# HARNESS-MANIFEST — Sổ theo dõi bản chụp và đồng bộ harness OPC vào AIBOSS Office

- **Kho nguồn:** `/Users/erocathanh/Development/opc-business-harness` (CHỈ ĐỌC)
- **Commit nguồn:** `253b8c493b81e3d958bcbad4f7b7448226cecc3e` (tag `harness-v11` = `253b8c4`, nâng từ `5f2148a`)
- **Ngày hợp lưu:** 15/10/2026
- **Người thực hiện:** `antigravity-aiboss-office-backend` (Backend Architect)
- **Cơ chế đồng bộ:** Hợp lưu 3 bên (`5f2148a` · `253b8c4` · bản AIBOSS Office sau S17h), giữ các lớp bảo vệ chặt hơn của Office
- **Kịch bản kiểm tra:** `operations/scripts/sync-harness.sh --check`

---

## 1. Quyền bổ sung từ tác giả (ADDITIONAL-PERMISSIONS.md dòng 3)

> Ngoài giấy phép CC BY-NC 4.0 trong tệp LICENSE, Eroca Thanh cho phép mỗi người dùng sao chép, sửa và chạy bộ khung này để vận hành nội bộ chính doanh nghiệp của mình, kể cả doanh nghiệp có thu tiền. Quyền bổ sung này KHÔNG bao gồm: bán lại bộ khung, phân phối bản đã sửa để thu tiền, hay đưa bộ khung vào khoá học, dịch vụ hoặc sản phẩm thu tiền — những việc đó vẫn cần tác giả cho phép bằng văn bản.

---

## 2. Bảng mã băm MD5 kiểm định (Snapshot Checksums tại `253b8c4`)

| Tên tệp | MD5 nguồn (253b8c4) | MD5 AIBOSS Office | Trạng thái | Ghi chú điều chỉnh (H-v11 + S17a..S17h) |
|---|---|---|---|---|
| `bash_parser.py` | `1ac6b7f7e5dae9ed626aa5aebbe292cc` | `435b541ff0164eb0fdd41a0549a55a06` | Siêu tập (2384 dòng) | Giữ trọn S17a..S17h (`operations/data`, wrapper `caffeinate`/`script`/`xargs`, `Path` `/`, receiver & đối số theo thứ tự tại `call_pos` F37–F38) + hợp lưu v09/v10/v11 (`logical_rel_path`, `ln`/`git mv`/`unlink`/`rmdir`/`ditto`/`install`, `split_heredocs_detailed`, `extract_executed_heredocs`, không phân biệt hoa thường cho thư mục khoá/hậu tố `_final`) |
| `block_external_scan.py` | `3409da14a0dbcf454b1e830800f94ba8` | `f8f47fc8b6a5493adb13193e60f6dd27` | Khớp quy ước (213 dòng) | Hợp lưu v09: kiểm tra công cụ `Glob` (`path` + đầu chuỗi `pattern`) và đối số đường dẫn lệnh tìm kiếm ngoài kho |
| `block_mass_delete.py` | `735e82b1937f2c20ef566f89a5ade8bd` | `4f632c98c12099c847134dbbc83c755b` | Khớp quy ước (179 dòng) | Hợp lưu v09: chặn `git branch -D`/`--delete --force` và `git push origin +refspec`; nhập `layout.py` cho `CHANNEL.md` |
| `block_secret_leak.py` | `bba0242c84b8ca2c6f189e11c3d15297` | `a9e02a71e619ca8869cf4e6f57fbef17` | Khớp quy ước (297 dòng) | Hợp lưu v11: tên tệp env không phân biệt hoa thường (`.env`, `.envrc`, `.env-*`, `.env_*`, `*.env`), miễn `.env.example`/`.env.sample` và `process.env`/`import.meta.env`, tách heredoc ghi tài liệu vs heredoc chảy vào trình thông dịch/ghi-rồi-chạy; giữ chặn `.config/aiboss-office/**` và `ai-agent/*/khoa/**` của Office |
| `guard_bulk_send.py` | `11af478f461544b54d61bf438c095713` | `50bce71c9e1e73ff12d898acc9ada2fb` | Khớp quy ước (518 dòng) | Hợp lưu v09+v10 (biến URL trong `curl` POST, đọc tệp kịch bản $\le 64$ KB, `smtplib` import/gọi thật, bỏ qua heredoc chỉ ghi tài liệu) + giữ chế độ **CHẶN mã 2** của Office (kèm ghi sổ `operations/data/approvals/<YYYY-MM-DD>.jsonl` đã che PII) và bắt `fetch_page_messages` |
| `guard_customer_pii.py` | `309b8ff31383fe55cca2335b352c0940` | `03676f73487e9d7aab2fe8c1ee47b7df` | Khớp quy ước (259 dòng) | Hợp lưu v09: chỉ miễn quét PII cho ngăn đầu vào trực tiếp (`projects/<p>/inputs/...`), quét tệp nguồn khi `cp`/`mv`/`rsync`/`shutil.copy*` sang ngoài `inputs/`; nhập `layout.py`, `office_root.py`, `pii_patterns.py` cục bộ |
| `lock_raw_inputs.py` | `0a3ccf4a73cd9a6fce3670f976675bc3` | `26e4e68471246e429d111b813b60a696` | Khớp quy ước (103 dòng) | Hợp lưu v09 (`logical_rel_path` + `canonical_path` + kiểm tra không phân biệt hoa thường trên macOS APFS) + giữ khoá `operations/data/**` (S17-10) |
| `protect_final_outputs.py` | `88538e0f92405b01aca93d2bfe38ad77` | `a7c0951eac25f21301a8882aef16fc82` | Khớp quy ước (275 dòng) | Hợp lưu v09 (kiểm tra `Edit`/`Write` tệp nhật ký chỉ được nối đuôi `append-only`, chặn `mv`/`rm` thư mục dự án chứa `outputs/` hoặc gốc `projects/`, chặn hardlink vào `outputs/`/`*_final.*`) + giữ kiểm tra phiếu duyệt `operations/data/approvals/` của Office |
| `remind_cross_check.py` | `d47f80a6b5e1cddfed24af0ba66f6298` | `086ba7c3b09cc99c6de91f7038d23e0f` | Khớp quy ước (115 dòng) | Nhập `layout.py` kiểm tra song ngữ `/wip/` (`/DANG-LAM/`) và `/outputs/` (`/DAU-RA/`) |
| `pii_patterns.py` | `696d233bd31de62fcccb7e66f641bcce` | `696d233bd31de62fcccb7e66f641bcce` | Giống 100% (325 dòng) | Nguyên văn từ references của wiki OPC |
| `layout.py` | `5390c78fc14a832da319f4a25bdaa956` | `a0beef374e1a33b088d921c6d0ba7cf2` | Tương đương `harness_layout.py` (89 dòng) | Mô-đun ánh xạ thư mục song ngữ không phân biệt hoa thường (`case-insensitive`) |
| `office_root.py` | `7155a99fb2e91024e0a31613ddc9666b` | `9d097c3bbdb52700aafccb32ecce3e09` | Tương đương `find_root.py` (96 dòng) | Tìm gốc kho `config/office.json` kèm bậc lùi dấu mốc `AGENTS.md`/`CLAUDE.md` |

*(Lưu ý: Office còn có thêm Hook 2.1 `operations/hooks/block_public_publish.py` — MD5 `2dc63e81f0c8f7239e20b354a04081d0`, 1387 dòng — chuyên trách chặn xuất bản công khai, đọc token Meta và HTTP write ra ngoài danh sách trắng).*

---

## 3. Hai mô-đun gốc/layout tương đương (`harness_layout.py` & `find_root.py` ở thượng nguồn)

Ở commit `253b8c4`, kho nguồn OPC đã nhận ngược phần H4 từ Office thành hai tệp `.claude/hooks/harness_layout.py` (`5390c78fc14a832da319f4a25bdaa956`) và `.claude/hooks/find_root.py` (`7155a99fb2e91024e0a31613ddc9666b`). Để tránh nhân đôi mô-đun trong Office, tất cả các hook của Office tiếp tục dùng hai tệp gốc của Office đã được bổ sung đầy đủ các hàm tương đương:

### 3.1. `operations/hooks/layout.py` (`a0beef374e1a33b088d921c6d0ba7cf2`) — tương đương `harness_layout.py`
- **Mục đích:** Bảng tên thư mục song ngữ tập trung duy nhất, tách lớp tên khỏi logic kiểm soát an toàn.
- **Cập nhật H-v11:** Toàn bộ các hàm `is_projects_root`, `is_inputs_dir`, `is_wip_dir`, `is_outputs_dir`, `is_references_dir`, `is_templates_dir`, `is_sample_ground_truth`, `is_channel_file`, `is_progress_file`, `has_final_suffix` so khớp **không phân biệt hoa thường** (`case-insensitive`) và bổ sung hằng số `CHANNEL_FILE_ALL`, `PROGRESS_FILE_ALL` tương đương `harness_layout.py`.

### 3.2. `operations/hooks/office_root.py` (`9d097c3bbdb52700aafccb32ecce3e09`) — tương đương `find_root.py`
- **Mục đích:** Tìm thư mục gốc kho AIBOSS Office (hoặc kho OPC khi chạy kiểm thử song ngữ) một cách đáng tin cậy.
- **Cập nhật H-v11:** Giữ ưu tiên `config/office.json` (tối đa 8 tầng cha và `AIBOSS_OFFICE_ROOT`), đồng thời bổ sung bậc lùi dấu mốc từ `find_root.py` thượng nguồn (`AGENTS.md` + `projects/` hoặc `CAC-DU-AN/`, `.claude/settings.json` + `CLAUDE.md`) và các hàm tiện ích `find_repo_root`, `resolve_project_dir`.

---

## 4. Chi tiết hợp lưu 3 bên trên `bash_parser.py` và các Fixture đổi kỳ vọng

### 4.1. Các mảnh thượng nguồn (`5f2148a → 253b8c4`) đã áp vào `operations/hooks/bash_parser.py`
1. **Áp dụng đầy đủ:**
   - Hàm `logical_rel_path(raw_path, cwd, project_dir)` để xét vị trí đích thật của symlink/hardlink mới tạo trước khi giải `realpath` trên basename cuối.
   - So khớp không phân biệt hoa thường (`case-insensitive`) trong `canonical_path`, `_seg_matches_protected`, `is_dau_ra_or_final`, và chặn đường dẫn leo ngược `..` giả danh trong `is_in_project_dau_vao`.
   - Mở rộng `extract_write_targets` cho `git mv`, `ln` (kiểm tra cả đích liên kết và nguồn khi tạo hardlink không có `-s`), `unlink`, `rmdir`, `ditto`, và bỏ qua cờ có đối số của `install` (`-m`, `-o`, `-g`, `-S`).
   - Bộ tách heredoc chi tiết từ v10/v11: `extract_heredoc_file_write_target`, `split_heredocs_detailed`, `get_executed_script_arg`, `find_heredoc_body_for_script`, `extract_executed_heredocs` (phục vụ `block_secret_leak.py` và `guard_bulk_send.py`).
2. **Giữ nguyên phần Siêu tập của Office (không ghi đè bằng bản rút gọn của thượng nguồn):**
   - Toàn bộ các hàm phục vụ Hook 2.1 (`block_public_publish.py`) và S17a..S17h: nhận diện `is_in_operations_data`, bóc wrapper `caffeinate`/`script` (kể cả tệp transcript), giải chuỗi tĩnh Python/Node, toán tử `/` của `Path`, phân tích thứ tự binding receiver/đối số tại `call_pos` (`F37`–`F38`), và tạo đích `$DYNAMIC_WRITE` fail-closed.

### 4.2. Danh sách 10 fixture trong `tests/hooks/guard_bulk_send/` chuyển kỳ vọng từ `ask` sang `block` (mã thoát `2`)
Trong kho OPC gốc, `guard_bulk_send.py` trả mã `0` kèm JSON `permissionDecision: "ask"`. Trong AIBOSS Office, theo kiến trúc cô lập ghế (các ghế chạy nền `claude -p`), `guard_bulk_send.py` được thiết kế **CHẶN cứng với mã thoát `2`** đồng thời ghi yêu cầu vào sổ `operations/data/approvals/<YYYY-MM-DD>.jsonl`. Do đó, khi chuyển 87 fixture mới qua `operations/scripts/convert-harness-tests.mjs`, 10 ca kiểm thử phát hiện gửi hàng loạt/ra ngoài của `guard_bulk_send` được chuyển tên từ `ask-*.json` sang `block-*.json` (kỳ vọng mã thoát `2`, không xoá bất kỳ ca nào):
1. `ask-bash-script-bulk-send.json` ➔ `block-bash-script-bulk-send.json`
2. `ask-curl-meta-comments-form.json` ➔ `block-curl-meta-comments-form.json`
3. `ask-curl-meta-delete.json` ➔ `block-curl-meta-delete.json`
4. `ask-curl-meta-feed-post.json` ➔ `block-curl-meta-feed-post.json`
5. `ask-curl-post-var-prefix-url.json` ➔ `block-curl-post-var-prefix-url.json`
6. `ask-curl-post-var-url.json` ➔ `block-curl-post-var-url.json`
7. `ask-heredoc-write-then-run-script.json` ➔ `block-heredoc-write-then-run-script.json`
8. `ask-python-heredoc-import-smtplib.json` ➔ `block-python-heredoc-import-smtplib.json`
9. `ask-python-requests-delete-meta.json` ➔ `block-python-requests-delete-meta.json`
10. `ask-run-custom-bulk-send-script.json` ➔ `block-run-custom-bulk-send-script.json`

---

## 5. Giới hạn đã biết (Known Limitations)

- Xem chi tiết đầy đủ tại `operations/SAN-AN-TOAN-GHE.md` (Mục 3 — Sổ rủi ro tồn dư `RR-01`..`RR-05`).


