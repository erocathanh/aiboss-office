# Quản Lý Ngân Sách, Giữ Chỗ & Vòng Đời Tiến Trình (Budget Holds & Worker Lifecycle) — A-3

Tài liệu kỹ thuật giải pháp A-3 (Budget Hold & Daily Caps) cho hệ thống `aiboss-office`.

> **GIỚI HẠN ĐÃ BIẾT:** Chỉ MỘT tiến trình máy chủ được ghi sổ budget; chạy hai máy chủ cùng thư mục dữ liệu là ngoài hỗ trợ. Hệ thống thực thi cơ chế khoá startup đơn instance (`.instance.lock`) để từ chối khởi động máy chủ thứ hai trên cùng `AIBOSS_DATA_DIR`.

---

## 1. Nguyên Lý Nguồn Sự Thật & Chỉ Mục Điểm Kiểm (SST & Checkpoint Index)

- **JSONL là Nguồn Sự Thật duy nhất (Single Source of Truth):** Toàn bộ giao dịch ngân sách (`hold`, `settle`, `release`, `reject`) được ghi append-only vào `operations/data/budget/<YYYY-MM-DD>.jsonl`.
- **Chỉ mục Checkpoint (`open-holds.json`):** Lưu trữ tập hợp các hold đang mở kèm bản đồ vị trí phục hồi theo từng phân vùng ngày (`filePositions: Record<string, number>`). Checkpoint theo dõi vị trí dòng đã đọc của từng tệp log độc lập, đảm bảo các thao tác settle ghi vào phân vùng ngày cũ vẫn được phát hiện và nạp đầy đủ.
- **Tiền điều kiện bắt buộc trong giao dịch Admission:** Trước khi kiểm tra giới hạn chi phí và trước khi tạo hold, giao dịch admission bắt buộc phải replay toàn bộ các dòng nhật ký JSONL chưa được phản ánh vào checkpoint (`replayAndGetCheckpoint()`). Nếu checkpoint chưa sẵn sàng hoặc replay lỗi, admission từ chối ngay lập tức (fail-closed) và không bao giờ dispatch turn.
- **Thứ tự Ghi SST:** Thao tác append JSONL luôn thực hiện trước việc lưu checkpoint. Nếu tiến trình bị crash ngay sau khi ghi JSONL, lần giao dịch admission hoặc khởi động máy chủ kế tiếp sẽ tự động phát hiện và bù đắp các dòng chưa index từ Single Source of Truth.
- **Truy vấn GET An toàn & Thuần Đọc:** Endpoint `GET /api/budget` chỉ đọc trực tiếp snapshot từ `open-holds.json`. Nếu thư mục budget hoặc checkpoint chưa tồn tại, API trả về HTTP 503 (`snapshot_not_ready`) mà không tự ý tạo thư mục hay sửa đổi đĩa.

---

## 2. Danh Tính Worker & Chính Sách Hết Hạn Hữu Hạn (Worker Identity & Finite Expiry)

1. **Phân định rõ Runner và Worker:**
   - Khi tạo hold trước khi dispatch, hold chưa gắn danh tính worker (`worker: undefined`).
   - Khi worker được sinh ra (`khiSinh(pid)`), danh tính worker gồm `{ pid, processStartedAt, instanceId }` được lấy từ hệ điều hành (`ps -p <pid> -o lstart=`) và lưu vào bản ghi run.
2. **Kiểm tra sống thực tế & Chống tái dùng PID:**
   - Hàm `checkProcessLiveness(pid, expectedStartedAt)` kết hợp kiểm tra tín hiệu kernel (`kill(pid, 0)`) và thời điểm khởi động thực tế từ OS (`ps -p <pid> -o lstart=`).
   - Phân biệt ba trạng thái:
     - `alive`: Tiến trình tồn tại và thời điểm khởi động khớp chính xác.
     - `dead`: Tiến trình không tồn tại (`ESRCH`) hoặc số PID đã bị tái dùng cho tiến trình khác (start time không khớp).
     - `unverified`: Lỗi tạm thời khi truy vấn hệ điều hành; không tự ý kết luận tiến trình đã chết.
3. **Chính sách Hết hạn Hữu hạn & Giữ Chỗ Khi Chưa Xác Minh (Hold Expiration & Unverified Worker Policy):**
   - **Worker đang chạy (`running`):** Nếu worker được xác nhận `alive`, hold được bảo vệ liên tục và **không bao giờ bị hết hạn**. Nếu worker đã `dead` (ESRCH hoặc start time lệch do PID bị tái dùng), sau khi tuổi hold vượt quá `maxAgeMs` (mặc định 10 phút), hold sẽ được giải phóng tự động với lý do `expired`.
   - **Worker chưa xác minh danh tính (`liveness === 'unverified'` hoặc thiếu PID):** Hệ thống **tiếp tục GIỮ hold vô thời hạn và KHÔNG bao giờ tự động hết hạn theo tuổi** (`continue`).
     - *Lý do bảo vệ trần chi phí:* Nếu tự ý giải phóng hold khi OS query thất bại tạm thời hoặc worker mất kết nối, dung lượng ngân sách sẽ mở ra cho các turn mới, gây nguy cơ over-admission và vượt trần chi phí thực tế.
   - **Run đang chờ thanh toán (`costStatus === 'pending'`):** Áp dụng cho **mọi trạng thái terminal thực tế** (`finished`, `failed`, `killed`, `timeout`). Khi `costStatus === 'pending'`, hệ thống tiếp tục giữ hold và **tuyệt đối không giải phóng hay thanh toán dở dang theo tuổi của hold**.

4. **Quy trình Người Vận Hành Dọn Dẹp Thủ Công (Operator Manual Cleanup Procedure):**
   - Khi một worker bị treo hoặc unverified kéo dài và operator đã kiểm tra chắc chắn tiến trình worker không còn chạy trên máy chủ:
     1. **Kiểm tra hold đang kẹt:** Đọc tệp chỉ mục `operations/data/budget/open-holds.json` hoặc gọi `GET /api/budget` để xác định `holdId`, `runId`, số tiền `amountUsd` đang bị giữ.
     2. **Kiểm tra tiến trình trên OS:** Chạy lệnh `ps -ef | grep <pid>` để đảm bảo không còn tiến trình con nào của worker đang tiêu thụ tài nguyên.
     3. **Ghi bản ghi giải phóng vào SST:** Để bảo toàn nguyên lý append-only của Single Source of Truth, operator thêm trực tiếp một bản ghi giải phóng (release record) vào cuối tệp log ngày hiện tại `operations/data/budget/<YYYY-MM-DD>.jsonl`:
        ```json
        {"type":"release","holdId":"<holdId>","runId":"<runId>","amountUsd":0,"reason":"operator_manual_cleanup","ts":"<ISO_TIMESTAMP>"}
        ```
     4. **Cập nhật Checkpoint:** Ngay khi có giao dịch admission tiếp theo hoặc khi khởi động lại server, hệ thống sẽ replay dòng giải phóng trên từ SST và tự động xoá hold khỏi `open-holds.json`, phục hồi dung lượng ngân sách an toàn.

---

## 3. Khóa Khởi Động Đơn Instance (Single-Instance Startup Lock)

- Để bảo vệ tính toàn vẹn dữ liệu trong môi trường một máy chủ, `startOfficeRunner()` tạo tệp khoá khởi động `.instance.lock` trong thư mục dữ liệu (`AIBOSS_DATA_DIR`).
- **Fail-Closed khi không xác minh được thời gian tiến trình:** Khi tiến trình máy chủ khởi động, hệ thống truy vấn `processStartedAt` của chính nó từ hệ điều hành (`ps -p <pid> -o lstart=`). Nếu hệ điều hành không trả về được thời gian bắt đầu thực tế, lock sẽ từ chối cấp phát ngay lập tức (fail-closed) thay vì ước tính bằng `Date.now()`.
- **Phát hiện xung đột & Từ chối máy chủ thứ hai:** Nếu một tiến trình máy chủ khác đang chạy trên cùng thư mục dữ liệu (`liveness === 'alive'`), tiến trình mới sẽ bị từ chối khởi động với thông báo lỗi rõ ràng:
  `Another office runner instance (PID <pid>) is already running on AIBOSS_DATA_DIR. Running multiple server instances against the same data directory is not supported.`
- **Từ chối khởi động khi chủ khoá chưa xác minh (`unverified`):** Nếu khoá đang được giữ bởi một PID mà OS query trả về `unverified`, tiến trình mới từ chối khởi động để tránh xung đột dữ liệu với một máy chủ có thể đang chạy.
- **Thu hồi khoá nguyên tử & Xác minh sở hữu sau Rename (Atomic Reclaim with Post-Rename Verification):**
  - Khi khoá cũ thuộc về một PID đã chết (`liveness === 'dead'`), tiến trình mới di chuyển `.instance.lock` sang thư mục tạm `.instance-reclaim-<token>-...` bằng `fs.renameSync`.
  - **Kiểm tra hậu rename (Post-rename ownership check):** Sau khi rename thành công, tiến trình đọc lại `info.json` từ thư mục tạm và đối chiếu `token`, `pid`, `processStartedAt` với thông tin dead owner đã phát hiện trước đó.
  - **Phòng chống TOCTOU Race:** Nếu thông tin không khớp (ví dụ một tiến trình sống khác đã tranh chấp hoặc cập nhật khoá ngay trước thời điểm rename), tiến trình sẽ rollback bằng cách rename trả lại thư mục khoá về `.instance.lock` và từ chối khởi động (`acquired: false`), không xoá đè dữ liệu khoá của tiến trình sống.
- **Giải phóng khoá nghiêm ngặt (Strict Token Release):** Khi dừng server, `releaseInstanceLock()` chỉ giải phóng khoá nếu `held.token === activeInstanceToken`. Không sử dụng số PID làm fallback lỏng lẻo và không `rmSync` mù quáng nếu khoá đã thuộc về một instance khác.
