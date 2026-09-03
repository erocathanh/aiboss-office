# Báo cáo SO-DIFF-XANH-GIA — vá parser, rà ba hàm, đưa cổng vào Git

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID dùng trong báo cáo: `SO-DIFF-XANH-GIA`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-03T03:25:00Z · 10:25 giờ máy` và đề bài trực tiếp của lượt này.
- Thực hiện tới `2026-09-03T07:56:10Z · 08:56:10 BST`.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- HEAD lúc bắt đầu: `aacc728fa359266b004d740f3af848743af62d48`.
- Trong lúc làm, commit `3c7063764924c1e292fc40801ac5f999ee790747` của làn `bai-thu/` đã vào `main`; commit của task này có commit đó làm cha. Tôi không sửa hoặc stage `bai-thu/`.
- Phạm vi đã giữ: `.gitignore`, `ai/so-diff.py`, `ai/test_so_diff.py`, báo cáo này và append kênh. Không sửa `src/`, không sửa `bai-thu/`, không chạy `next build`, không push hoặc deploy.

## 2. Gốc lỗi và bản vá

Trước bản vá, `tach_dong()` kiểm `startswith("--- ")` trước khi phân biệt đang ở trong hay ngoài một cụm diff. Một dòng bị xoá có nội dung bắt đầu `-- ` trở thành `--- ` trong diff, bị nhận nhầm là tiêu đề tệp và đặt `trong_cum = False`. Các dòng xoá còn lại của cụm vì thế bị bỏ qua.

Bản vá tại `ai/so-diff.py:73-85`:

- gặp `diff --git ` thì đóng cụm cũ;
- chỉ nhận `--- ` và `+++ ` là tiêu đề khi đang ở ngoài cụm;
- khi đang trong cụm, `--- ...` tiếp tục đi vào nhánh dòng xoá tại `ai/so-diff.py:97-100`.

Đây cùng cơ chế với bản thử `/tmp/so-diff-VA.py`, nhưng đã được đọc và áp tối thiểu vào tệp sở hữu, không chép nguyên tệp thử.

## 3. Đối chứng đỏ trước bản vá và phép xanh sau bản vá

Ca hồi quy nằm tại `ai/test_so_diff.py:225-260`.

Trước khi sửa production code:

```text
python3 -m unittest ai.test_so_diff.SoDiffTest.test_dong_xoa_mo_dau_hai_gach_khong_duoc_nuot_cac_dong_sau -v
AssertionError: 0 != 1
Ran 1 test
FAILED (failures=1)
```

Một phép dựng độc lập trước patch cũng cho:

```text
xanh_gia: rc=0 stdout_bytes=0 stderr_bytes=0
doi_thuan_that: rc=0 stdout_bytes=0 stderr_bytes=0
```

Sau patch, toàn bộ bộ thử:

```text
python3 -m unittest ai/test_so_diff.py -v
Ran 16 tests in 2.403s
OK

python3 -m py_compile ai/so-diff.py ai/test_so_diff.py
rc=0
```

Hai vế nghiệm thu chính:

- Ca dời hai dòng hợp lệ và làm mất ba dòng, trong đó dòng `-- ` đứng giữa: mã 1; `DÒNG_XÓA=5`; `DÒNG_KHÔNG_QUAY_LẠI=3`; in đúng `y.txt:2`, `y.txt:3`, `y.txt:4` và đúng ba dòng mất.
- Ca dời-thuần thật có dòng nội dung bắt đầu `-- `: mã 0; stdout và stderr đều rỗng. Ca này nằm tại `ai/test_so_diff.py:262-288`.

## 4. Rà ba hàm chưa ai soi

Kết luận rõ: cả ba hàm **LÀNH trong hợp đồng CLI đã công bố**. Không tìm thấy lỗ mới trong ba hàm này.

### `doc_pham_vi` — LÀNH

- Ca đúng nhiều đích cho cùng nguồn được gộp thành tập đích có hướng.
- Thiếu dấu `:`, thiếu nguồn, hoặc thiếu đích đều trả mã 2 và báo lỗi.
- Ca dời chéo hai tệp đã có chứng minh mặc định đỏ, khai đúng phạm vi mới xanh.
- Giới hạn cú pháp đã biết: tham số dùng `NGUỒN:ĐÍCH`, nên tên nguồn chứa chính dấu phân cách `:` không biểu diễn được. Đây là giới hạn của văn phạm CLI hiện tại, không phải đường xanh giả trong phạm vi M1a.

### `doc_danh_sach_cho_phep` — LÀNH

- Khoá là đúng `(tệp đích, (nguyên văn, có xuống dòng))`.
- Khai trùng làm tăng Counter đúng một đơn vị mỗi lần.
- Thiếu `::` hoặc thiếu tệp đích đều trả mã 2.
- Nội dung rỗng vẫn được giữ để có thể cấp một dòng trắng; nội dung chứa `::` vẫn được giữ vì chỉ tách một lần.
- Giới hạn cú pháp đã biết: tên tệp chứa chính chuỗi phân cách `::` không biểu diễn được. Không có đường xanh giả trong phạm vi M1a.

### `tim_dong_them_khong_cho_phep` — LÀNH

- Bỏ qua đúng các chỉ số `da_dung` mà bước ghép dòng xoá đã tiêu.
- Mỗi quota trong Counter chỉ tiêu một lần.
- Hai dòng thêm giống nhau nhưng chỉ khai một lần: mã 1, đúng một dòng thêm còn lại; khai hai lần: mã 0 và im.
- So vi sai ngẫu nhiên 20.000 ca với một implementation tham chiếu độc lập: không có lệch.

Lệnh rà bổ sung in:

```text
AUDIT_OK random_tim_added=20000 parser_boundaries=13
```

Lượt rà đầu bị lỗi ở chính harness `importlib` vì mô-đun chưa được đăng ký vào `sys.modules` trước khi nạp dataclass. Đã sửa harness rồi chạy lại; đây không phải lỗi của `so-diff.py` và không được tính là phép đỏ của sản phẩm.

## 5. Git và worktree mới

Commit code:

```text
26ae042630b6f79cb07ab4a8c64e4a2704bcbe7f
fix: chan xanh gia trong so-diff
```

Commit chứa đúng:

```text
M  .gitignore
A  ai/so-diff.py
A  ai/test_so_diff.py
```

`.gitignore` thêm `ai/__pycache__/`. `git diff --cached --check` trước commit trả mã 0. Hash nội dung đã commit:

```text
.gitignore               5e42421a9121c87472087f29a84984fe
ai/so-diff.py            b0d96e400c0f7c063ccb65eaa92c563d
ai/test_so_diff.py       a289b9e79c7cf286a692ff467686008b
```

Nghiệm thu trong worktree tách mới, detached tại chính commit trên:

```text
WORKTREE=/tmp/aiboss-so-diff-worktree.KmgDau
ai/so-diff.py tồn tại
python3 ai/so-diff.py --help: rc=0
python3 ai/test_so_diff.py: Ran 16 tests · OK
TEST_RC=0
status sau test: rỗng
```

Worktree tạm đã được gỡ bằng `git worktree remove` sau phép đo.

## 6. Trạng thái còn lại và hành động cho PM

- Không tự chấm cổng M1a đạt. Task này chỉ báo bản vá, phép đo và commit.
- Không push, không deploy.
- Worktree chính vẫn giữ nguyên tài sản ngoài scope: `ai/MASTER-PLAN.md` modified; tệp backup và hai báo cáo cũ untracked. `ai/__pycache__/` không còn hiện trong status.
- PM/reviewer có thể neo review vào hai hash code ở trên. Nếu sửa sau verdict, áp `ai/PROTOCOL-review-hash.md` cho delta.
