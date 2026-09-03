# Báo cáo LÀN-B-SO-DIFF-R4.2 — siết hợp đồng dời-thuần

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID dùng trong báo cáo: `LÀN-B-SO-DIFF-R4.2`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-03T01:12:00Z · 08:12 giờ máy`.
- Thực hiện: `2026-09-03T07:09:21Z · 08:09:21 BST` theo đồng hồ máy lúc đo.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- Commit nền/HEAD lúc bàn giao: `c01ff29cc2bdea10edbda43ede5680f41c4b1809`.
- Phạm vi giữ đúng: chỉ sửa `ai/so-diff.py`, `ai/test_so_diff.py`, tạo báo cáo này và append kênh đội. Không sửa `src/`, không sửa `bai-thu/`, không mở worktree, không chạy `next build`.

## 2. Hợp đồng mới đã công bố trước khi viết mã

Đã append hợp đồng lúc `2026-09-03T07:06:12Z · 08:06 London`, trước patch implementation:

1. Dòng phải khớp nguyên văn, gồm thụt lề đầu dòng, khoảng trắng cuối dòng, dòng trắng và trạng thái có/không có ký tự xuống dòng cuối tệp. Không còn `lstrip`.
2. Mã 0 chỉ khi có ít nhất một dòng bị xoá để so, mọi dòng xoá quay lại đúng phạm vi, và không có dòng thêm dư.
3. Mặc định provenance theo tệp. Dời chéo tệp phải khai rõ từng phạm vi nguồn→đích bằng `--move`.
4. Dòng import/export bắt buộc thêm phải được cho phép bằng đúng tệp + nguyên văn qua `--allow-added`; mỗi lần khai chỉ cấp một bản sao.
5. Giữ ba chiều cũ: dời-thuần hợp lệ ⇒ 0 và im; sửa một ký tự ⇒ 1 và chỉ đúng dòng cũ bị sửa; không có dòng xoá để so ⇒ 2 và từ chối.

Đánh đổi đã nói rõ trên kênh: các lượt trước đây được coi hợp lệ chỉ nhờ đổi thụt lề, bỏ dòng trắng hoặc đổi newline cuối tệp nay sẽ báo đỏ. Đây là thay đổi bảo thủ có chủ đích của chữ “nguyên văn”.

## 3. Cơ chế trước và sau

### Trước

- `lstrip(" \t")` làm mất khác biệt thụt lề.
- Bỏ dòng rỗng vì chỉ thêm vào Counter khi khoá có giá trị truthy.
- Bỏ dấu `No newline at end of file`.
- Chỉ kiểm “mọi dòng xoá có đâu đó trong toàn bộ phần thêm”; dòng thêm tuỳ ý không bị kiểm.
- Một `Counter` gộp toàn kho làm dòng cùng chữ ở tệp không liên quan có thể bù cho nhau.

### Sau

- `DongThayDoi` giữ `tep`, `so_dong`, `noi_dung`, `co_xuong_dong`; khoá so là `(nguyên văn, trạng thái newline)`.
- Giữ cả dòng trắng; dấu cuối tệp cập nhật chính bản ghi `+`/`-` ngay trước nó.
- Ghép từng bản sao bằng chỉ số đã dùng, không còn Counter nội dung toàn kho.
- Mặc định chỉ ghép trong cùng tệp; `--move NGUỒN:ĐÍCH` mở đúng phạm vi được khai.
- Sau khi ghép mọi dòng xoá, phần thêm còn dư làm mã 1.
- `--allow-added TỆP::NGUYÊN_VĂN` cấp đúng một dòng thêm ở đúng tệp; lặp tham số nếu cần nhiều bản sao. Không dùng regex rộng.
- Nếu chỉ có thêm mà không có dòng xoá, vẫn trả 2 theo chiều cũ “không có gì để so”.

Cách gọi cho lượt tách kiểu dự kiến:

```text
python3 ai/so-diff.py --repo <kho> \
  --move src/components/UngDung.tsx:src/components/ung-dung/kieu.ts \
  --allow-added 'src/components/UngDung.tsx::import type { ... } from "./ung-dung/kieu";' \
  --allow-added 'src/components/ung-dung/kieu.ts::export { ... };' \
  <tree-ish-cũ> <tree-ish-mới>
```

Nếu chọn thêm `export` trực tiếp vào đầu chính dòng khai báo đã dời, dòng đó không còn nguyên văn; phải tách phần biến đổi ấy ra soi riêng hoặc biểu diễn export bằng dòng riêng được cho phép.

## 4. Đối chứng đỏ trước implementation

Chạy `python3 -m unittest ai/test_so_diff.py -v` sau khi thêm ca nhưng trước khi sửa `so-diff.py`:

```text
Ran 11 tests in 1.381s
FAILED (failures=7)
```

Sáu ca siết thất bại đúng khe cũ:

- đổi thụt lề: công cụ cũ trả 0, ca mới đòi 1;
- bớt dòng trắng: công cụ cũ trả 0, ca mới đòi 1;
- đổi newline cuối tệp: công cụ cũ trả 0, ca mới đòi 1;
- dời kèm dòng mới tuỳ ý: công cụ cũ trả 0, ca mới đòi 1;
- import chưa được cho phép: công cụ cũ trả 0, ca mới đòi 1;
- đổi dòng giống nhau chéo hai tệp: Counter toàn kho cũ trả 0, ca provenance mới đòi 1.

Failure thứ bảy là kỳ vọng tổng `DÒNG_XÓA` của ca sửa ký tự đổi từ 3 lên 4 sau khi dòng trắng được tính; vị trí lỗi vẫn duy nhất là `ma.ts:2`.

## 5. Phép xanh sau implementation

```text
python3 -m unittest ai/test_so_diff.py -v
Ran 11 tests in 1.374s
OK

python3 -m py_compile ai/so-diff.py ai/test_so_diff.py
rc=0

git diff --check -- ai/so-diff.py ai/test_so_diff.py
rc=0 · stdout rỗng
```

Mười một ca phủ:

- ba chiều nền: 0/im; 1/đúng một dòng; 2/từ chối rỗng;
- đa tập cùng tệp;
- không lstrip;
- không bỏ dòng trắng;
- không bỏ trạng thái newline cuối tệp;
- không cho dòng thêm tuỳ ý;
- import chỉ xanh khi đúng tệp + đúng nguyên văn trong allowlist;
- provenance mặc định theo tệp báo đỏ, khai đúng hai phạm vi chéo tệp mới xanh.

Không chạy lint Next hoặc build vì task cấm build và thay đổi chỉ là Python độc lập.

## 6. File, hash và trạng thái Git

```text
ai/so-diff.py       254 dòng · MD5 6b8022dab3163ad1f7fcee9a159f6efb
ai/test_so_diff.py  227 dòng · MD5 396a667e67644d39becfa6ba86bde502
```

Hai tệp vẫn là untracked như lúc nhận LÀN B; không commit, không push, không deploy. Không stage bất kỳ tệp nào. Worktree bẩn sẵn và phần `bai-thu/` của LÀN A được giữ nguyên.

## 7. Rủi ro và giới hạn

- Đây vẫn là thước theo dòng, không chứng minh thứ tự AST hoặc hành vi runtime.
- `--move` là phạm vi có hướng; khai nguồn→đích không tự mở chiều ngược lại.
- Allowlist là exact text và exact target file, có số lượng. Một dòng `export type ...` thay cho `type ...` không phải dời nguyên văn, nên không thể được che chỉ bằng cho phép dòng thêm.
- Mã 0 im theo hợp đồng cũ; muốn audit phần import/export, reviewer phải đọc chính đối số `--allow-added` hoặc soi delta riêng.
- Tôi là người viết bản vá và không tự chấm công cụ đủ làm cổng M1a.

## 8. Tài liệu SoT và bước tiếp theo

- Không sửa `ai/MASTER-PLAN.md`; thay đổi đang có trong đó thuộc người khác.
- PM/reviewer cần neo verdict vào hai hash trên theo `ai/PROTOCOL-review-hash.md`, soi câu hẹp: hợp đồng này có đủ làm cổng cho M1a dời 126 dòng kiểu thuần hay chưa.
- Nếu reviewer yêu cầu cú pháp khác cho phần `export type`, nên chốt rõ đó là biến đổi được allowlist theo cặp cũ→mới hay bắt buộc dùng export statement riêng; implementation hiện chọn phương án chặt hơn là không che biến đổi dòng đã dời.
