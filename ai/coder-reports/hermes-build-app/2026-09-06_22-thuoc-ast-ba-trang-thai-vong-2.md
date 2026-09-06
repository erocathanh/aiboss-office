# Bàn giao việc ㉒ — thước AST ba trạng thái, vòng 2/3

FROM: hermes-build-app / TO: claude-aiboss-app-pm

- Task: ㉒, vòng 2/3
- PM giao: `claude-aiboss-app-pm`
- Người soi kế tiếp: `hermes-aiboss-app-reviewer`
- Thời điểm chốt số: 2026-09-06T07:34:17Z · 08:34 BST
- Repo chính: `/Users/erocathanh/Projects/aiboss-app-chat`
- Worktree: `/Users/erocathanh/Projects/wt-22-thuoc-ba-trang-thai-hermes`
- Nhánh: `viec/22-thuoc-ba-trang-thai-hermes`
- Neo bản vòng 1 bị bác: `d39a16f2a9c27d87cd84c5ffc945d976521a2208`
- Commit vòng 2: `8ee248a552f2bb231b5df19c3c40670565fdb8f0`

## 1. Mục tiêu và phạm vi

Sửa đúng sáu phản ví dụ do người soi đo được, không neo vào chẩn đoán cũ:

1. `consume(box.value=f())` bị đỏ oan.
2. `let answer=f(); answer=answer+1; consume(answer)` bị đỏ oan.
3. `box.value=f(); box={value:9}; consume(box.value)` xanh sai.
4. `f(); getBox().value=f()` làm mất lỗi chắc chắn của lời gọi đầu.
5. Nguồn `.ts` có generic arrow bị ép thành TSX; thông tin tên tệp mất qua `soiChoGoi`.
6. Form feed hợp lệ bị coi là nhị phân.

Owned files trong commit chỉ gồm:

- `bai-thu/soi-ket-qua.mjs`
- `bai-thu/dong-bang-ket-qua-khong-roi.test.mts`

Không sửa `src/`, `bai-thu/chay.sh`, `bai-thu/cong-worktree.sh`, bảng 27 hoặc các cổng cũ. Không chạy `next build`, không merge main, không push và không deploy.

## 2. Cơ chế trước và sau

### Trước — commit bị bác `d39a16f...`

- Chỉ xét việc đích gán có được đọc về sau; bỏ quên chính giá trị biểu thức gán có thể đang được `consume`.
- Duyệt AST theo thứ tự chữ khiến vế trái của phép gán được coi là ghi đè trước khi vế phải đọc giá trị cũ.
- Khóa nơi lưu là một chuỗi nguyên khối; ghi đè `box` không được nhận là ghi đè cha của `box.value`.
- Một đích lưu không theo dõi được ném lỗi cho toàn nguồn, xóa luôn kết quả `BO-QUA` đã xác định ở lời gọi khác.
- `chamNguon` parse đúng tên tệp rồi truyền `src.text` vào `soiChoGoi`; `soiChoGoi` parse lại bằng mặc định TSX.
- Bộ lọc ký tự điều khiển xếp U+000C form feed vào dữ liệu nhị phân dù ECMAScript cho phép nó làm khoảng trắng.

### Sau — commit `8ee248a...`

- Giá trị của phép gán có hai đường: được cất vào đích và được mang ra ngoài như giá trị biểu thức. Hai đường được hợp nhất; chỉ cần một đường đọc được là `DUNG`.
- Sự kiện ghi của phép gán đơn được đặt sau khi vế phải đã được duyệt, nên `answer=answer+1` nhận lần đọc trước lần ghi.
- Khóa nơi lưu được tách thành các đoạn; phép ghi vào khóa cha làm mất mọi khóa con đang theo dõi.
- `KHONG-DO-DUOC` được giữ theo từng lời gọi. Ở cấp nguồn, `BO-QUA` chắc chắn thắng phần chưa đo; vì vậy lỗi đã biết không bị trạng thái thứ ba nuốt mất.
- Tên tệp đi xuyên qua `soiChoGoi`; `docNguon` chọn `ScriptKind` theo phần mở rộng và chỉ dùng TSX khi phần mở rộng không xác định.
- Bộ lọc nhị phân giữ lại toàn bộ khoảng trắng ECMAScript C0 hợp lệ: TAB, LF, VT, FF và CR.

## 3. RED trước sửa và GREEN sau sửa

### 3.1. Sáu hồi quy, mỗi phép có đối chứng lành và hỏng

Mỗi test vòng 2 tự chạy:

- đối chứng lành `consume(f())` hoặc cùng cú pháp nền tương ứng: exit 0, `ĐẠT`;
- đối chứng hỏng `f()` hoặc cùng cú pháp nền tương ứng: exit 1, `KHÔNG ĐẠT`;
- khẳng định hai kết quả khác nhau trước khi chấm phản ví dụ.

Đo trực tiếp CLI sau sửa:

| Ca | Đối chứng lành | Đối chứng hỏng | Phản ví dụ sau sửa |
|---|---:|---:|---|
| 1 — giá trị phép gán được consume | exit 0 | exit 1 | exit 0, `ĐẠT · 1 lời gọi`, `[f] DUNG` |
| 2 — vế phải đọc trước ghi | exit 0 | exit 1 | exit 0, `ĐẠT · 1 lời gọi`, `[f] DUNG` |
| 3 — ghi đè đối tượng cha | exit 0 | exit 1 | exit 1, `KHÔNG ĐẠT · 1 lời gọi`, `[f] BO-QUA` |
| 4 — lỗi biết trước + đích chưa đo | exit 0 | exit 1 | exit 1, `KHÔNG ĐẠT · 2 lời gọi`, lần lượt `BO-QUA`, `KHONG-DO-DUOC` |
| 5 — generic arrow trong `.ts` | exit 0 | exit 1 | exit 1, `KHÔNG ĐẠT · 1 lời gọi`, không rơi vào `KHÔNG ĐO ĐƯỢC` |
| 6 — form feed hợp lệ | exit 0 | exit 1 | exit 1, `KHÔNG ĐẠT · 1 lời gọi`, không bị gọi là nhị phân |

### 3.2. Gỡ riêng từng vá trên artifact đúng commit

Dùng clone độc lập checkout đúng `8ee248a...`. Mỗi lần chỉ gỡ một cơ chế, chạy đúng test mang tên ca đó, rồi khôi phục tệp. Kết quả:

| Bản gỡ | Exit | Pass/fail | Đúng phép đỏ |
|---|---:|---:|---|
| `GO_VA_CA_1_GAN_DUOC_CONSUME` | 1 | 0/1 | `🔴 VÒNG 2 CA 1 — consume nhận giá trị của phép gán thuộc tính ⇒ ĐẠT` |
| `GO_VA_CA_2_THU_TU_DOC_TRUOC_GHI` | 1 | 0/1 | `🔴 VÒNG 2 CA 2 — vế phải đọc giá trị cũ trước khi vế trái ghi lại ⇒ ĐẠT` |
| `GO_VA_CA_3_GHI_DE_CHA` | 1 | 0/1 | `🔴 VÒNG 2 CA 3 — ghi đè đối tượng cha làm rơi giá trị thuộc tính ⇒ KHÔNG ĐẠT` |
| `GO_VA_CA_4_LOI_BIET_TRUOC_THANG_CHUA_DO` | 1 | 0/1 | `🔴 VÒNG 2 CA 4 — đích chưa theo dõi được không được xoá lỗi BO-QUA đã biết` |
| `GO_VA_CA_5_GIU_SCRIPT_KIND_TS` | 1 | 0/1 | `🔴 VÒNG 2 CA 5 — nguồn .ts giữ ScriptKind.TS qua soiChoGoi và generic arrow vẫn đo được` |
| `GO_VA_CA_6_FORM_FEED_HOP_LE` | 1 | 0/1 | `🔴 VÒNG 2 CA 6 — form feed là khoảng trắng hợp lệ, không phải dữ liệu nhị phân` |

Lắp đủ vá, test tập trung: exit 0, 17 test, 17 pass, 0 fail.

Kết luận giới hạn của phép này: từng hồi quy thực sự biết đỏ khi mất đúng cơ chế nó canh; màu xanh lắp đủ không phải do cả tệp lành và hỏng cùng rơi vào `KHÔNG ĐO ĐƯỢC`.

## 4. Bộ đầy đủ và cổng cũ

### 4.1. `bash bai-thu/chay.sh`

Chạy trực tiếp trong linked worktree bị chốt từ chối trước khi đo:

- Exit 1.
- Lý do thật: cây chính có tệp ngoài scope chưa commit `ai/ban-giao/2026-09-06_14-bat-cong-lint.md`.
- Không dùng bất kỳ con số nào từ lượt bị chặn.
- Không sửa chốt worktree và không đụng tệp của việc khác.

Để đo đúng artifact mà không sửa cây chính, tạo clone độc lập, checkout chính xác commit và dùng `node_modules` của kho chính chỉ để nạp công cụ.

Commit nền bị bác `d39a16f...`, clone sạch:

- Exit 0.
- Tests/suites: 117/29.
- Pass/fail: 117/0.
- Cancelled/skipped/todo: 0/0/0.

Commit vòng 2 `8ee248a...`, clone sạch:

- Exit 0.
- Tests/suites: 123/29.
- Pass/fail: 123/0.
- Cancelled/skipped/todo: 0/0/0.

Tổng tăng `117 → 123`, đúng sáu test hồi quy mới. Không phải trường hợp tổng đứng yên do thay test.

### 4.2. `bash bai-thu/chay.sh --ca-hai` trên đúng commit

- Exit 0.
- Bộ xanh: 123/123, fail 0.
- `biết ĐỎ (phép phá CŨ): CÓ`.
- `biết ĐỎ (thứ tự móc): CÓ`.
- `biết ĐỎ (12 phép mô-đun): CÓ`.

Bộ vẫn tự in `22/95` kèm cảnh báo số đã cũ vì bộ đo đã đổi. Tôi không dùng số này làm bằng chứng.

### 4.3. Năm phép phá cũ, đúng tên phép đỏ

Gài độc lập trên clone đúng commit; mỗi lượt chỉ chạy cổng bảng:

| Phép phá | Exit | Pass/fail | Đúng phép đỏ |
|---|---:|---:|---|
| Nền không phá | 0 | 1/0 | Không có |
| `VOID_EMPTY` | 1 | 0/1 | `🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ` |
| `VOID_FOCUS` | 1 | 0/1 | `🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ` |
| `VOID_CLOSE` | 1 | 0/1 | `🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ` |
| `DELETE_WRITE` | 1 | 0/1 | `🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ` |
| `PAREN_DISCARD` | 1 | 0/1 | `🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ` |

Sau mọi mutation, nguồn được khôi phục; `git diff --exit-code` trên clone trả 0.

## 5. Bảng 27 không dịch

So trực tiếp thước ở `d39a16f...` và `8ee248a...` trên cùng `src/components/UngDung.tsx`:

- Tổng trước: 27.
- Tổng sau: 27.
- `BANG_Y_HET_TRUOC=true`.

Bảng cả hai phía:

- `BO-QUA`: `ghiO=2`, `napDsPhien=4`, `napLichSu=1`.
- `DUNG`: `datNguoi=3`, `docLichSu=4`, `dongO=1`, `ghiO=7`, `napDsPhien=1`, `napLichSu=4`.

Không ô nào lệch; **MỐC KHÔNG DỊCH** trong phép đo này.

## 6. Ba đầu vào không đo được và đối chứng lành

Cùng CLI, cùng tên hàm `f`:

| Đầu vào | Đối chứng lành | Đầu vào cần chặn |
|---|---|---|
| Vỡ cú pháp | exit 0, `ĐẠT · 1 lời gọi` | exit 2, `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |
| Rỗng | exit 0, `ĐẠT · 1 lời gọi` | exit 2, `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |
| Nhị phân | exit 0, `ĐẠT · 1 lời gọi` | exit 2, `KHÔNG ĐO ĐƯỢC · 0 lời gọi` |

Form feed không nằm trong hàng nhị phân: tệp `f();` có form feed đo được và trả `KHÔNG ĐẠT`, exit 1.

## 7. TypeScript, cú pháp, diff và an toàn

Kiểm TypeScript được chạy trong clone có `node_modules` thật của kho chính, qua Node 24.19.0:

- `tsc --noEmit`: exit 0.
- `iconv`: exit 0.
- Số dòng `error TS`: 0.
- Đối chứng dương cố ý sai kiểu: `tsc` exit 2, `iconv` exit 0, đúng 1 dòng `error TS`.

Một lần gọi `npx tsc` trực tiếp từ linked worktree không có `node_modules` đã chạy nhầm gói placeholder và trả banner “This is not the tsc command you are looking for”; lượt đó bị loại, không được khai là 0 lỗi. Phép đo clone phía trên mới là số dùng để kết luận.

Kiểm khác:

- `node --check bai-thu/soi-ket-qua.mjs`: exit 0.
- `git diff --cached --check`: exit 0.
- Byte điều khiển ngoài tab/newline/carriage-return trong hai tệp commit: 0.
- Staged diff đúng hai owned files; không có unstaged diff lúc commit.
- Quét 167 added lines: 0 hardcoded secret, 0 private key, 0 `eval/exec`, 0 `shell=true`, 0 truy cập môi trường.

## 8. Commit, push và deploy

- Commit: `8ee248a552f2bb231b5df19c3c40670565fdb8f0`.
- Parent: `d39a16f2a9c27d87cd84c5ffc945d976521a2208`.
- Message: `test: sửa sáu phản ví dụ thước AST`.
- Commit chỉ chứa đúng hai tệp trong `bai-thu/`.
- Worktree sạch sau commit.
- Nhánh không có upstream; không push.
- Không merge main.
- Không build hoặc deploy.

## 9. CHƯA CHỨNG MINH ĐƯỢC

- **CHƯA ĐO** bằng verdict độc lập của `hermes-aiboss-app-reviewer` cho commit `8ee248a...`.
- Chỉ số mutation tổng `22/95` là số cũ; **CHƯA ĐO LẠI**, nên không dùng nó để nói độ bao phủ hiện tại.
- `bash bai-thu/chay.sh` **CHƯA chạy trực tiếp thành công trong linked worktree** vì tệp `ai/ban-giao/2026-09-06_14-bat-cong-lint.md` của việc khác đang làm cây chính bẩn. Đã đo đúng commit bằng clone sạch; chưa tự sửa hoặc lách chốt trong worktree.
- Thước vẫn là phân tích AST không TypeChecker: **CHƯA CHỨNG MINH** được bí danh, cùng tên khác scope hoặc định danh xuyên mô-đun.
- Thước chưa phân tích điều khiển/xuyên hàm: **CHƯA CHỨNG MINH** được mọi nhánh runtime có thật sự đọc giá trị.
- Không chạy `next build` và không mở app thật; thay đổi chỉ ở bộ đo `bai-thu/`, đồng thời task cấm build.
- Kết quả 123/123 và các mutation chỉ chứng minh các hợp đồng được mã hóa; không thay thế review đối kháng độc lập.

## 10. Tài liệu nguồn sự thật

Không cập nhật `MASTER-PLAN.md`, `TASK_BOARD.md` hoặc `src/`: PM chưa giao quyền đổi trạng thái dự án, và verdict độc lập chưa có. Báo cáo này là bằng chứng bàn giao, không thay thế nguồn trạng thái.

## 11. Hành động tiếp theo dành cho PM

1. Giao đúng commit `8ee248a552f2bb231b5df19c3c40670565fdb8f0` cho `hermes-aiboss-app-reviewer` soi vòng 2/3.
2. Chưa merge main trước verdict.
3. Nếu cần chạy trực tiếp trong linked worktree, trước hết người sở hữu việc ⑭ phải xử lý tệp ngoài-git của họ; không giao việc đó cho delta AST này.
4. Nếu reviewer bác vòng 2, dừng theo quy ước và trình Owner; không tự mở vòng bốn.
