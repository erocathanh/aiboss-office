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
     1. **Dừng máy chủ:** Dừng tiến trình `office-runner` (hoặc server web) để đảm bảo không có giao dịch admission hay writer nào đang cạnh tranh.
     2. **Kiểm tra hold đang kẹt:** Chạy lệnh kiểm tra qua đúng đường logic của hệ thống:
        ```bash
        node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --check
        ```
        Lệnh sẽ replay SST và liệt kê các hold đang mở kèm `holdId`, `seatId`, `amountNanodollars`.
     3. **Giải phóng hold bằng lệnh hợp lệ:** Chạy lệnh giải phóng đi qua đúng đường ghi có khoá của hệ thống (`releaseHold`), sử dụng giá trị `reason` hợp lệ thuộc enum hiện hành (`'expired'`, `'orphaned'`, hoặc `'failed_no_receipt'`):
        ```bash
        node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --release <holdId> --reason expired
        ```
     4. **Xác nhận hold đã biến mất:** Chạy lại lệnh `--check`:
        ```bash
        node --import ./tests/register.mjs operations/scripts/budget-reconcile.mjs --check
        ```
        Xác nhận hold đã được gỡ bỏ khỏi checkpoint `open-holds.json` sau khi replay từ SST.
     5. **Khởi động lại máy chủ:** Khởi động lại `office-runner`.

---

---

## 3. Khóa Khởi Động Đơn Instance Dạng Tệp Nguyên Tử (File-Based Atomic Instance Lock)

- Để bảo vệ tính toàn vẹn dữ liệu trong môi trường một máy chủ, hệ thống sử dụng tệp khoá khởi động `.instance.lock` (dạng **tệp duy nhất**, không dùng thư mục) trong thư mục dữ liệu (`AIBOSS_DATA_DIR`).
- **Khởi tạo nguyên tử qua `open(O_EXCL)`:** Khi khởi động, tiến trình tạo tệp khoá bằng cờ `O_CREAT | O_EXCL`. Nếu tệp đã tồn tại, kernel trả về `EEXIST` ngay lập tức, ngăn chặn hoàn toàn việc ghi đè hoặc xung đột khởi động ban đầu.
- **Fail-Closed khi không xác minh được thời gian tiến trình:** Khi tiến trình máy chủ khởi động, hệ thống truy vấn `processStartedAt` của chính nó từ hệ điều hành (`ps -p <pid> -o lstart=`). Nếu hệ điều hành không trả về được thời gian bắt đầu thực tế, lock sẽ từ chối cấp phát ngay lập tức (fail-closed) thay vì ước tính bằng `Date.now()`.
- **Phát hiện xung đột & Từ chối máy chủ thứ hai:** Nếu một tiến trình máy chủ khác đang chạy trên cùng thư mục dữ liệu (`liveness === 'alive'`), tiến trình mới sẽ bị từ chối khởi động với thông báo lỗi rõ ràng:
  `Another office runner instance (PID <pid>) is already running on AIBOSS_DATA_DIR. Running multiple server instances against the same data directory is not supported.`
- **Từ chối khởi động khi chủ khoá chưa xác minh (`unverified`):** Nếu khoá đang được giữ bởi một PID mà OS query trả về `unverified`, tiến trình mới từ chối khởi động để tránh xung đột dữ liệu với một máy chủ có thể đang chạy.
- **Khe ① — Hàng rào sau mất quyền dính vĩnh viễn suốt đời tiến trình & Chặn MỌI đường ghi (Sticky Fencing & Universal Writer Barring):**
  + **Dính suốt đời tiến trình:** Khi phát hiện token trên tệp khoá bị mất hoặc bị thay thế bởi instance khác, cờ `isInstanceFenced = true` được kích hoạt và giữ trạng thái dính vĩnh viễn (sticky). Hàm `acquireInstanceLock` tuyệt đối không bao giờ hạ cờ `isInstanceFenced = false`. Nếu tiến trình đã bị fenced mà gọi `acquireInstanceLock` lại, hệ thống từ chối ngay lập tức và ném lỗi rõ ràng (`[budget-ledger] Instance is fenced. Acquiring instance lock is permanently barred.`). Cờ fenced chỉ có thể hạ trong kiểm thử thông qua `resetFencingForTest()`.
  + **Phòng thủ chiều sâu chặn MỌI đường ghi:**
    * *Tại tầng Runner (`office-runner.ts`):* Cửa kiểm tra `isFenced()` được đặt ngay tại đầu `flushInFlightTurns` (dọn dẹp in-flight map và huỷ bỏ toàn bộ write), đầu `tickRunner`, callback khi sinh tiến trình (`khiSinh`), và ngay đầu callback hoàn tất lượt muộn (`chayMotLuot` success path trước `recordCostReceipts` / `settleHold`, và catch error path trước fallback receipt / `updateRun`).
    * *Tại cửa ghi từng Ledger (`runs-ledger.ts`, `costs-ledger.ts`, `budget-ledger.ts`):* Mọi hàm ghi đĩa (`recordWake`, `updateWake`, `recordRun`, `updateRun`, `appendRecord`, `recordCostReceipt`, và `withBudgetLock`) đều kiểm tra `isFenced()` và ném lỗi từ chối ghi. Nhờ đó, ngay cả khi có bất kỳ asynchronous callback muộn nào gọi vào ledger, toàn bộ tệp `runs/*.jsonl` và `costs/*.jsonl` vẫn giữ nguyên từng byte (MD5 trước và sau hoàn toàn trùng khớp).
- **Khe ② — Thu hồi khoá mồ côi do crash khởi động giữa `open` và `write`:** Khi khởi tạo tệp khoá mới, nếu tiến trình bị sập ngay sau `open(O_EXCL)` trước khi kịp ghi metadata:
  + Tệp rỗng / không parse được có tuổi đời dưới 10 giây (`< UNINITIALIZED_LOCK_TIMEOUT_MS = 10s`) sẽ khiến tiến trình sau từ chối khởi động (`fail-closed`), dành thời gian cho tiến trình tạo khoá hoàn tất ghi.
  + Tệp rỗng / không parse được có tuổi đời từ 10 giây trở lên sẽ được xác định là khoá mồ côi do crash khởi động. Tiến trình mới ghi metadata ứng viên hoàn chỉnh vào candidate file trước khi thực hiện `rename` đè nguyên tử, giải phóng trạng thái kẹt khởi động mà không bao giờ để lại tệp rỗng mới.
- **Khe ③ — Bảo vệ an toàn cho máy chủ v07 dạng thư mục cũ:** Khi phát hiện `.instance.lock` là thư mục từ các phiên bản v06/v07 cũ, tiến trình không `rmSync` mù quáng. Hệ thống đọc `info.json` bên trong; nếu chủ cũ còn sống (`liveness === 'alive'` hoặc `unverified`), tiến trình mới từ chối khởi động và giữ nguyên thư mục cùng tệp `info.json` của phiên bản cũ. Chỉ khi chủ cũ đã chết thật sự (`liveness === 'dead'`), thư mục cũ mới được dọn dẹp để nâng cấp lên tệp đơn lẻ.
- **Khe ④ — Cơ chế loại trừ thống nhất acquire / reclaim / renew / release qua Mutex ngắn:**
  + **Mutex ngắn cho mọi chuyển trạng thái (`.instance.lock.mutex`):** Tất cả 4 thao tác chuyển đổi trạng thái khoá (`acquire`, `reclaim`, `renew`, `release`) đều bắt buộc chạy bên trong một khoá tệp loại trừ nguyên tử `O_EXCL` (`withInstanceMutex`). Mutex có giới hạn chờ tối đa 3 giây và tự động thu hồi mutex mồ côi nếu tuổi đời vượt quá 5 giây.
  + **Tái kiểm tra quyền sở hữu bên trong Mutex trước khi Rename / Unlink:** Bên trong critical section của mutex, tiến trình luôn đọc lại tệp `.instance.lock` trên đĩa và so khớp chính xác với trạng thái đã kiểm tra trước đó:
    * *Reclaim:* Đọc lại tệp khoá; nếu token trên đĩa đã đổi khác token chủ chết ban đầu (do một contender khác đã kịp chiếm khoá trước), reclaimer lập tức huỷ bỏ ứng viên, không thực hiện `rename`, và trả về thất bại (`acquired: false`).
    * *Renew:* Đọc lại tệp khoá; nếu token trên đĩa không còn khớp `activeInstanceToken`, renew lập tức huỷ candidate, kích hoạt `fenceInstance()`, và dừng ghi, giữ nguyên vẹn tệp khoá của chủ mới.
    * *Release:* Chỉ thực hiện `unlinkSync` bên trong mutex sau khi đọc lại tệp khoá và xác nhận token trên đĩa vẫn thuộc về chính `tokenToRelease`. Nếu quyền sở hữu đã đổi sang người khác, release tuyệt đối không xoá nhầm tệp khoá của chủ mới.
  + **Ràng buộc thời hạn Lease:** Thao tác reclaim chỉ được phép diễn ra khi đồng thời thoả mãn: tiến trình chủ cũ đã chết thật sự (`liveness === 'dead'`) VÀ thời hạn lease đã hết (`now >= leaseExpiresAt`).
  + **Thu hồi nguyên tử qua POSIX `rename` đè tệp:** Tuyệt đối không bao giờ xoá tệp khoá trước khi ghi mới, bảo đảm đường dẫn `.instance.lock` không bao giờ bị gián đoạn hay để hở khoảng trống TOCTOU cho bên thứ ba.
