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
3. **Chính sách Hết hạn Hữu hạn (Finite Expiration Policy):**
   - **Worker đang chạy (`running`):** Nếu worker được xác nhận `alive`, hold được bảo vệ liên tục và **không bao giờ bị hết hạn**. Nếu worker đã `dead`, sau khi tuổi hold vượt quá `maxAgeMs` (mặc định 10 phút), hold sẽ được giải phóng với lý do `expired`.
   - **Run đang chờ thanh toán (`costStatus === 'pending'`):** Áp dụng cho **mọi trạng thái terminal thực tế** (`finished`, `failed`, `killed`, `timeout`). Khi `costStatus === 'pending'`, hệ thống tiếp tục giữ hold và **tuyệt đối không giải phóng hay thanh toán dở dang theo tuổi của hold**.

---

## 3. Khóa Khởi Động Đơn Instance (Single-Instance Startup Lock)

- Để bảo vệ tính toàn vẹn dữ liệu trong môi trường một máy chủ, `startOfficeRunner()` tạo tệp khoá khởi động `.instance.lock` trong thư mục dữ liệu (`AIBOSS_DATA_DIR`).
- Nếu một tiến trình máy chủ khác đang chạy trên cùng thư mục dữ liệu, tiến trình mới sẽ bị từ chối khởi động với thông báo lỗi rõ ràng:
  `Another office runner instance (PID <pid>) is already running on AIBOSS_DATA_DIR. Running multiple server instances against the same data directory is not supported.`
- Nếu tiến trình cũ đã chết không kịp dọn khoá (stale lock), tiến trình mới sẽ thu hồi khoá an toàn và tiếp tục khởi động.
