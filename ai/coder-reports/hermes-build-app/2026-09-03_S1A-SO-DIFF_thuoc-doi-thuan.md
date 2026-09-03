# Báo cáo S1A-SO-DIFF — thước dời-thuần

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID: `S1A-SO-DIFF`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-03T00:12:00Z · 00:12 giờ máy`.
- Thực hiện: `2026-09-02T23:08:42Z · 00:08:42 BST` theo đồng hồ máy lúc đo.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- Commit nền: `c01ff29cc2bdea10edbda43ede5680f41c4b1809`.
- Ràng buộc đã giữ: không sửa `src/`, không sửa `bai-thu/` của LÀN B, không mở worktree, không chạy `next build`.

## 2. Mục tiêu và owned files

Cho hai Git commit/tree-ish, trả lời bằng mã thoát xem mọi dòng bị xoá có xuất hiện lại trong phần thêm hay không. Nếu không, in đúng các dòng xoá không có bản sao tương ứng.

Owned files:

- `ai/so-diff.py`
- `ai/test_so_diff.py`
- báo cáo này

## 3. Cơ chế

- So ở tầng dòng từ `git diff --no-renames --unified=0`.
- Chuẩn hoá duy nhất phần thụt lề đầu dòng: bỏ space/tab đầu dòng. Mọi ký tự còn lại, gồm khoảng trắng cuối dòng, phải khớp.
- Bỏ dòng rỗng hoặc chỉ có khoảng trắng khỏi phép đếm.
- Dùng đa tập `Counter`: một dòng bị xoá hai lần cần ít nhất hai bản sao trong phần thêm.
- Mã `0`: có ít nhất một dòng không rỗng bị xoá, mọi bản sao đều quay lại, stdout và stderr đều im.
- Mã `1`: có dòng không quay lại; stdout in `DỜI_THUẦN=0`, tổng dòng xoá, số dòng không quay lại, rồi `tệp:dòng` và nguyên văn dòng cũ.
- Mã `2`: đầu vào Git hỏng, hai cây giống nhau, hoặc không có dòng xoá để so. Nhánh chỉ-thêm cũng bị từ chối, không được xanh rỗng.

Cách gọi:

```text
python3 ai/so-diff.py --repo <kho> <tree-ish-cũ> <tree-ish-mới>
```

## 4. Kiểm chứng và đối chứng đỏ

Đối chứng đỏ trước khi có implementation:

```text
test_cay_di_chuyen_thuan_tra_0_va_im
rc=2
python3: can't open file 'ai/so-diff.py': No such file or directory
FAILED (failures=1)
```

Sau implementation:

```text
python3 -m py_compile ai/so-diff.py ai/test_so_diff.py      rc=0
python3 -m unittest ai/test_so_diff.py -v                  rc=0
Ran 6 tests in 0.895s
OK
```

Sáu ca đã đo:

```text
dời-thuần thật                    rc=0 · stdout=0 byte · stderr=0 byte
đổi đúng một ký tự 1 → 9          rc=1 · DÒNG_KHÔNG_QUAY_LẠI=1 · chỉ ra ma.ts:2 `return 1;`
hai tree-ish giống nhau           rc=2 · từ chối
chỉ thêm dòng, không có dòng xoá  rc=2 · từ chối
hai bản sao, chỉ một quay lại      rc=1 · DÒNG_KHÔNG_QUAY_LẠI=1
chỉ đổi vị trí + thụt lề           rc=0 · im
```

`pnpm run lint` đã chạy nhưng trả `1`: repo chưa có cấu hình ESLint nên `next lint` mở câu hỏi tương tác “How would you like to configure ESLint?”. Không tự tạo cấu hình vì ngoài LÀN A. Kết quả này không được khai là lint xanh.

Không chạy `pnpm run build` hoặc `next build` theo lệnh cấm của task.

## 5. Diff, hash, commit

- `ai/so-diff.py`: 145 dòng, MD5 `11c89070e0cf5c941df1bd4c0167fa3c`.
- `ai/test_so_diff.py`: 133 dòng, MD5 `9e365e54de69ea9209bf69dfaefd2ab6`.
- Chưa commit, chưa push, không deploy: task không cấp lệnh commit; hai tệp được để nguyên cho reviewer soi cây làm việc.
- Worktree đã bẩn sẵn và được bảo toàn: `ai/MASTER-PLAN.md` modified, `ai/README.md.pre-luat-hermes.bak` untracked. Tôi không sửa hai tệp đó.

## 6. Giới hạn đã khai

- Thước này không kiểm thứ tự dòng; LÀN B phụ trách thước thứ tự móc.
- Thước cố ý không xem thay đổi chỉ ở thụt lề là sửa; thay đổi khoảng trắng cuối dòng vẫn bị bắt.
- Dòng rỗng không được tính là mã.
- Phần chỉ-thêm không được đánh giá nội dung; import/export/chữ ký mới vẫn cần reviewer đọc.
- Thước không chứng minh hành vi browser, side-effect cấp mô-đun, hoặc quan hệ AST.
- Line-ending CRLF/LF được Python/Git đọc theo dòng và không được dùng làm tín hiệu sửa logic.

## 7. Tài liệu SoT

Không sửa tài liệu SoT. `ai/MASTER-PLAN.md` đang có thay đổi của người khác từ trước và được giữ nguyên.

## 8. Hành động tiếp theo cho PM

Giao reviewer soi đúng hai hash trên. Chỉ sau verdict mới quyết định commit hoặc mở cổng S1a; người dựng thước không tự chấm thước đạt.
