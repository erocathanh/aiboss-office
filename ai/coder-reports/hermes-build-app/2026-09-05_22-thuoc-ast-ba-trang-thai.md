# Bàn giao việc ㉒ — thước AST ba trạng thái

FROM: hermes-build-app / TO: claude-aiboss-app-pm

- Task: ㉒, vòng 1/3 của lần làm lại hiện hành
- PM giao: `claude-aiboss-app-pm`
- Người soi kế tiếp: `hermes-aiboss-app-reviewer`
- Thời điểm chốt: 2026-09-05T20:16:39Z · 21:16 BST
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`
- Worktree: `/Users/erocathanh/Projects/wt-22-thuoc-ba-trang-thai-hermes`
- Nhánh: `viec/22-thuoc-ba-trang-thai-hermes`
- Commit nền: `0b3071973e8469c03ad76cdcae8c327a0cbf47ea`
- Commit bàn giao: `d39a16f2a9c27d87cd84c5ffc945d976521a2208`

## 1. Mục tiêu và phạm vi

Làm cho `bai-thu/soi-ket-qua.mjs` phân biệt ba trạng thái `ĐẠT`, `KHÔNG ĐẠT`, `KHÔNG ĐO ĐƯỢC`; sửa bốn ca trong verdict `20260905_173533_d01eab`; giữ nguyên bảng đóng băng và khả năng đỏ của năm phép phá cũ.

Owned files đã commit, chỉ gồm:

- `bai-thu/soi-ket-qua.mjs`
- `bai-thu/dong-bang-ket-qua-khong-roi.test.mts`

Không sửa `src/`, không sửa `next.config.mjs`, không chạy `next build`, không merge main, không push và không deploy.

## 2. Cơ chế trước và sau

Trước:

- Nguồn rỗng, nhị phân hoặc có `parseDiagnostics` chưa làm cổng dừng đáng tin cậy.
- Gán kết quả vào thuộc tính chỉ theo được định danh đơn.
- Vế phải của biểu thức dấu phẩy đệ quy lại chính lời gọi và có thể tràn ngăn xếp.
- Việc tìm một lần đọc ở bất kỳ chỗ nào có thể bỏ lọt trường hợp giá trị đã bị ghi đè trước lần đọc.
- Phép phân loại trong test đã bị hạ xuống mức tự báo cáo, không làm suite đỏ.

Sau:

- API/CLI có ba trạng thái; mã thoát lần lượt là 0, 1 và 2.
- Đọc byte bằng UTF-8 nghiêm ngặt; nguồn rỗng, có byte điều khiển nhị phân hoặc lỗi cú pháp thành `KHÔNG ĐO ĐƯỢC`.
- Chuẩn hoá đích lưu cho định danh, `o.kq`, `o['kq']` và phần tử; xét lần truy cập đầu sau lời gọi.
- Lần truy cập đầu là đọc thì `DUNG`; là ghi đè thì `BO-QUA`.
- Vế phải dấu phẩy chuyển phân loại lên nút dấu phẩy, không quay lại lời gọi.
- Khôi phục phép phân loại thành cổng cứng và thêm vật thử hồi quy.

Commit có 241 dòng thêm, 84 dòng bỏ trong đúng hai tệp owned.

## 3. Kiểm chứng đo lại lúc bàn giao

### 3.1. Toàn bộ `bash bai-thu/chay.sh`

Lần đầu chạy trực tiếp trong worktree bị cổng từ chối đúng cơ chế vì cây chính còn ba mục chưa commit dưới `ai/`; mã 1 và không dùng số từ lần đó.

Sau khi cây chính sạch, chạy lại đúng lệnh trong chính worktree:

- Exit: 0
- Tests: 117
- Suites: 29
- Pass: 117
- Fail: 0
- Cancelled/skipped/todo: 0/0/0

Đối chiếu tươi trên commit nền `0b307197...` bằng cùng `bash bai-thu/chay.sh` trong clone sạch:

- Exit: 0
- Tests: 110
- Pass: 110
- Fail: 0

Tổng tăng `110 → 117`: thêm bảy test, không phải số đứng yên do thay test. Ngoài ra, một test cũ được đổi từ “chỉ báo cáo” thành cổng cứng; thay đổi này không làm tăng số test.

Dòng cuối suite tự in `22/95` đồng thời tự ghi rõ đó là số cũ. Tôi không dùng số đó làm bằng chứng và chưa chạy lại phép đo M/N ấy vì nó không thuộc năm mục nghiệm thu được giao trong lượt bàn giao.

Sau commit, kiểm lại đúng artifact `d39a16f...` trong clone sạch bằng `bash bai-thu/chay.sh`: exit 0, 117/117 pass, 0 fail.

### 3.2. Bốn ca người soi chỉ: gỡ riêng từng vá phải đỏ, lắp đủ phải xanh

Nền lắp đủ vá:

- Exit 0; 11 test tập trung, pass 11, fail 0.

Gỡ riêng từng cơ chế trong bản sao tạm, giữ nguyên ba cơ chế còn lại:

| Ca | Exit | Pass/fail | Phép đỏ |
|---|---:|---:|---|
| Gỡ theo dõi gán thuộc tính có đọc | 1 | 9/2 | cổng mẫu tổng và hồi quy thuộc tính |
| Gỡ sửa dấu phẩy | 1 | 9/2 | cổng mẫu tổng và hồi quy dấu phẩy |
| Gỡ chặn `parseDiagnostics` | 1 | 10/1 | hồi quy tệp vỡ cú pháp |
| Gỡ chặn ghi đè trước đọc | 1 | 9/2 | cổng mẫu tổng và hồi quy ghi đè |

Kết luận phép đo: cả bốn bản gỡ đều đỏ; lắp đầy đủ xanh 11/11.

### 3.3. Ba đầu vào không đo được

Đưa trực tiếp từng tệp vào CLI:

| Đầu vào | Exit | Dòng trạng thái |
|---|---:|---|
| Vỡ cú pháp | 2 | `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |
| Rỗng | 2 | `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |
| Nhị phân | 2 | `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |

Cả ba đều làm cổng đỏ bằng mã 2, không rơi vào mặc định xanh.

### 3.4. Năm phép phá cũ

Nền: exit 0, 11/11 pass.

Gài độc lập từng phép trong bản sao tạm:

| Phép phá | Exit | Pass/fail | Phép đỏ |
|---|---:|---:|---|
| `VOID_EMPTY` | 1 | 10/1 | bảng chỗ gọi đầy đủ |
| `VOID_FOCUS` | 1 | 10/1 | bảng chỗ gọi đầy đủ |
| `VOID_CLOSE` | 1 | 10/1 | bảng chỗ gọi đầy đủ |
| `DELETE_WRITE` | 1 | 10/1 | bảng chỗ gọi đầy đủ |
| `PAREN_DISCARD` | 1 | 10/1 | bảng chỗ gọi đầy đủ |

Kết luận phép đo: 5/5 phép phá cũ vẫn đỏ.

### 3.5. Bảng đếm trước/sau

Kết quả so trực tiếp thước ở commit nền và thước sau sửa trên cùng nguồn:

- Tổng trước: 27
- Tổng sau: 27
- `BANG_Y_HET_TRUOC=true`

Bảng cả hai phía:

- `BO-QUA`: `ghiO=2`, `napDsPhien=4`, `napLichSu=1`
- `DUNG`: `datNguoi=3`, `docLichSu=4`, `dongO=1`, `ghiO=7`, `napDsPhien=1`, `napLichSu=4`

Không có ô nào lệch; mốc bảng không dịch.

### 3.6. Git và kiểm phạm vi

- `git diff --cached --check`: exit 0.
- Byte điều khiển ngoài tab/newline/carriage-return trong cả hai tệp: 0.
- Staged scope: đúng hai owned files.
- Quét added lines: 0 hardcoded secret, 0 private key, 0 `.env`, 0 `eval/exec`, 0 `shell=true`.
- `git show --stat` xác nhận commit đúng hai tệp.
- Worktree sạch sau commit.

## 4. `KHONG-DUOC-TIN-BO-DO.txt`

Đây là tệp cảnh báo tạm do cổng worktree tự sinh lúc worktree được tạo trong khi cây chính còn ba mục chưa commit dưới `ai/`. Nó không phải mã nguồn, không thuộc bản vá và không được stage/commit.

Khi cây chính sạch và tôi chạy lại `bash bai-thu/chay.sh`, cổng tự in rằng cảnh báo đã hết hiệu lực rồi tự gỡ tệp. Vì vậy không nên giữ hoặc merge tệp này. Cơ chế đúng là để cổng tự quản vòng đời cảnh báo, không xoá nó để giả vờ số đã đúng.

## 5. Commit, push và deploy

- Commit: `d39a16f2a9c27d87cd84c5ffc945d976521a2208`
- Nhánh: `viec/22-thuoc-ba-trang-thai-hermes`
- Push: không thực hiện.
- Merge main: không thực hiện.
- Build/deploy: không thực hiện.

## 6. Rủi ro và phần chưa chứng minh

- `hermes-aiboss-app-reviewer` chưa đưa verdict cho commit này: **CHƯA ĐO bằng người soi độc lập**.
- Thước là phân tích cây cú pháp, chưa dùng TypeChecker để giải bí danh hoặc định danh ký hiệu xuyên scope; test đã khai rõ giới hạn này.
- Chưa phân tích xuyên hàm để biết hàm nhận tham số có tự vứt giá trị hay không; truyền giá trị sang hàm khác hiện được tính là `DUNG`.
- Không chạy `next build` và không mở app thật vì thay đổi chỉ nằm trong `bai-thu/`, không đi vào artifact runtime, đồng thời vai này không có quyền chạy build.
- Chỉ số `22/95` mà suite tự in là số cũ và **CHƯA ĐO LẠI** trong lượt này; nó không được dùng để kết luận cho việc ㉒.

## 7. Tài liệu nguồn sự thật

Không cập nhật `MASTER-PLAN.md`, `TASK_BOARD.md` hoặc mã `src/` vì lượt này chỉ thi công và bàn giao thước trong phạm vi `bai-thu/`. Báo cáo này là bằng chứng bàn giao, không thay thế các nguồn trạng thái dự án.

## 8. Hành động tiếp theo dành cho PM

1. Giao `d39a16f2a9c27d87cd84c5ffc945d976521a2208` cho `hermes-aiboss-app-reviewer` soi độc lập.
2. Chưa merge vào main trước verdict.
3. Nếu reviewer cần tái hiện, dùng worktree nêu trên; `bash bai-thu/chay.sh` hiện chạy được trực tiếp vì cây chính đã sạch.
