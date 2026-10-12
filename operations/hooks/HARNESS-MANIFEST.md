# HARNESS-MANIFEST — Sổ theo dõi bản chụp và đồng bộ harness OPC vào AIBOSS Office

- **Kho nguồn:** `/Users/erocathanh/Development/opc-business-harness` (CHỈ ĐỌC)
- **Commit nguồn:** `5f2148a2b7556c2d75b66b185433cce024342b2d`
- **Ngày chép:** 12/10/2026
- **Người thực hiện:** `antigravity-aiboss-office-backend` (Backend Architect)
- **Cơ chế đồng bộ:** Đề xuất Ⓒ hai nhịp (Pha H1 lớp chặn máy, Pha H4 đưa ngược về OPC)
- **Kịch bản kiểm tra:** `operations/scripts/sync-harness.sh --check`

---

## 1. Quyền bổ sung từ tác giả (ADDITIONAL-PERMISSIONS.md dòng 3)

> Ngoài giấy phép CC BY-NC 4.0 trong tệp LICENSE, Eroca Thanh cho phép mỗi người dùng sao chép, sửa và chạy bộ khung này để vận hành nội bộ chính doanh nghiệp của mình, kể cả doanh nghiệp có thu tiền. Quyền bổ sung này KHÔNG bao gồm: bán lại bộ khung, phân phối bản đã sửa để thu tiền, hay đưa bộ khung vào khoá học, dịch vụ hoặc sản phẩm thu tiền — những việc đó vẫn cần tác giả cho phép bằng văn bản.

---

## 2. Bảng mã băm MD5 kiểm định (Snapshot Checksums)

| Tên tệp | MD5 nguồn (5f2148a) | MD5 AIBOSS Office | Trạng thái | Ghi chú điều chỉnh |
|---|---|---|---|---|
| `bash_parser.py` | `06b93823afc06fc47ea2c762462fb05c` | `fed7274ca012cc4ada39f817dd19799e` | Khớp quy ước | Nhập `layout.py` thay vì ghim cứng tên tiếng Việt |
| `block_external_scan.py` | `51789bf06057701df01207a06dabfd74` | `51789bf06057701df01207a06dabfd74` | Giống 100% | Nguyên văn từ kho nguồn |
| `block_mass_delete.py` | `32bc25c2412c5154d699d5d7b7c92a5f` | `8031c849bab81de4bb622a82ab92b769` | Khớp quy ước | Nhập `layout.py` để kiểm tra tệp nhật ký / `CHANNEL.md` |
| `block_secret_leak.py` | `ea45309715d01ed3a90f0d4cd6cb174b` | `ea45309715d01ed3a90f0d4cd6cb174b` | Giống 100% | Nguyên văn từ kho nguồn |
| `guard_bulk_send.py` | `211c4297cc7bc81898da3da3bed4e71c` | `c5ec6aede8ebbb15ae79f57bff7f47c4` | Khớp quy ước | Thêm ghi nhật ký duyệt `operations/data/approvals/<YYYY-MM-DD>.jsonl` |
| `guard_customer_pii.py` | `8b6c98631b6ccba2ff0290288029e94f` | `394cff5313b0e24cc9f24dc8e16d77ab` | Khớp quy ước | Nhập `layout.py`, `office_root.py`, nạp `pii_patterns` từ thư mục cục bộ |
| `lock_raw_inputs.py` | `477f62ac7c9d57e275aa7eeb487a97b4` | `0505305584cfbaed9b53d7c8beb2c4fb` | Khớp quy ước | Nhập `layout.py`, tìm gốc kho qua `office_root.find_office_root` |
| `protect_final_outputs.py` | `6921b0d5923176e71286f490a11b29ab` | `a95692895d4444045fa1e42a3a9e9d47` | Khớp quy ước | Nhập `layout.py`, `office_root.py`, hỗ trợ `CHANNEL.md` append-only |
| `remind_cross_check.py` | `890cb368900689ab582837e78859fd89` | `086ba7c3b09cc99c6de91f7038d23e0f` | Khớp quy ước | Nhập `layout.py` kiểm tra `/wip/` và `/outputs/` |
| `pii_patterns.py` | `696d233bd31de62fcccb7e66f641bcce` | `696d233bd31de62fcccb7e66f641bcce` | Giống 100% | Chép từ references của wiki OPC |

---

## 3. Hai tệp mới được thêm vào (Đưa ngược về OPC ở Pha H4)

### 3.1. `operations/hooks/layout.py` (`79ab406a03d3369e809f19b86877daaa`)
- **Mục đích:** Bảng tên thư mục tập trung duy nhất, tách lớp tên khỏi logic kiểm soát an toàn.
- **Ánh xạ chuẩn:**
  - `CAC-DU-AN` ➔ `projects`
  - `DAU-VAO` ➔ `inputs`
  - `DANG-LAM` ➔ `wip`
  - `DAU-RA` ➔ `outputs`
  - `THAM-KHAO` ➔ `references`
  - `BAN-MAU` ➔ `templates`
  - `DU-AN-MAU-SU-THAT` ➔ `_sample-ground-truth`
  - `nhat-ky.md` ➔ `CHANNEL.md`
  - `BANG-DIEU-KHIEN.md` ➔ `PROGRESS.md`
  - Hậu tố `_final` giữ nguyên.
- **Lý do:** Giúp hook chạy tương thích cả trong kho AIBOSS Office (chuẩn tiếng Anh cho máy) và kho OPC (chuẩn tiếng Việt cho học viên) mà không cần rải mã sửa tay khắp 8 hook.

### 3.2. `operations/hooks/office_root.py` (`114eb8be2332f36b5dd186352c7de154`)
- **Mục đích:** Tìm thư mục gốc kho AIBOSS Office một cách đáng tin cậy.
- **Thuật toán:**
  1. Bắt đầu từ thư mục hiện hành hoặc `CLAUDE_PROJECT_DIR`.
  2. Đi ngược lên tối đa 8 tầng cha để tìm thư mục có `config/office.json`.
  3. Nếu không thấy, kiểm tra biến môi trường `AIBOSS_OFFICE_ROOT` (phải có `config/office.json`).
  4. Nếu vẫn không thấy, dừng an toàn mã `2` và in thông báo rõ ra stderr.
- **Đồng bộ:** Được cài đặt song song với bản TypeScript `src/lib/office-root.ts` và kiểm thử tự động tại `tests/office-root.test.mjs`.

---

## 4. Chi tiết các dòng tinh chỉnh trên từng Hook

1. **`bash_parser.py`:**
   - Thay thế các hàm nhận diện đường dẫn ghim cứng tiếng Việt (`is_in_project_dau_vao`, `is_in_du_an_mau`, `is_dau_ra_or_final`) bằng cách gọi hàm kiểm tra từ `layout.py`.
2. **`block_mass_delete.py`:**
   - Nhập `layout.py`. Kiểm tra chuyển hướng ghi đè `>` vào tệp nhật ký thông qua `layout.is_channel_file`.
3. **`guard_bulk_send.py`:**
   - Nhập `office_root.py`, `datetime`. Khi phát hiện hành vi cần duyệt (`ask_reason`), tự động ghi một dòng JSON vào `operations/data/approvals/<YYYY-MM-DD>.jsonl` với cấu trúc `{ts, seat, tool, input, reason}`.
4. **`guard_customer_pii.py`:**
   - Nhập `layout.py` và `office_root.py`.
   - Nạp `pii_patterns` từ thư mục `operations/hooks/` thay vì đường dẫn sâu của wiki OPC.
   - Hàm `is_dau_vao_path` kiểm tra `layout.is_projects_root` và `layout.is_inputs_dir`.
   - `main()` xác định `project_dir` qua `office_root.find_office_root(cwd)`.
5. **`lock_raw_inputs.py`:**
   - Nhập `layout.py` và `office_root.py`.
   - `main()` xác định `project_dir` qua `office_root.find_office_root(cwd)`.
6. **`protect_final_outputs.py`:**
   - Nhập `layout.py` và `office_root.py`.
   - Kiểm tra tệp nhật ký `CHANNEL.md` / `nhat-ky.md` bằng `layout.is_channel_file`.
   - `main()` xác định `project_dir` qua `office_root.find_office_root(cwd)`.
7. **`remind_cross_check.py`:**
   - Nhập `layout.py`.
   - Nhận diện thư mục đang làm (`layout.WIP_DIR` / `layout.OPC_WIP_DIR`) và thư mục đầu ra (`layout.OUTPUTS_DIR` / `layout.OPC_OUTPUTS_DIR`).
