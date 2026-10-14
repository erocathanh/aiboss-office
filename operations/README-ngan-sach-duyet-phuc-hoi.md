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
  + **Phòng thủ chiều sâu chặn MỌI đường ghi & vòng lặp:**
    * *Tại tầng Runner (`office-runner.ts`):*
      - Cửa kiểm tra `isFenced()` được đặt ngay tại đầu `flushInFlightTurns` (dọn dẹp in-flight map và huỷ bỏ toàn bộ write), đầu `logRunnerEvent` (chặn ghi `runner.log.jsonl`), callback khi sinh tiến trình (`khiSinh`), và ngay đầu callback hoàn tất lượt muộn (`chayMotLuot` success path trước `recordCostReceipts` / `settleHold`, và catch error path trước fallback receipt / `updateRun`).
      - *Vòng lặp polling `tickRunner`:* Kiểm tra `isFenced()` trước MỖI mục trong vòng lặp và ngay tại đầu khối `catch` khởi tạo turn. Khi phát hiện fenced giữa lúc khởi tạo turn (ví dụ mất quyền trong `withBudgetLock` khi kiểm tra admission), runner lập tức xoá ghế khỏi `activeSeats`, gọi `stopOfficeRunner()` và `break` dừng toàn bộ tick mà tuyệt đối không gọi `traVeHangDoi` hay `releaseHold`.
      - *Callback ghi mốc kết thúc `ghiLai`:* Kiểm tra `isFenced()` trước khi gọi ghi trạng thái phiên sang kho phiên.
    * *Tại kho đánh thức (`kho-danh-thuc.ts`):* Hàm `traVeHangDoi` tự kiểm tra `isFenced() && !isFenceGuardDisabledForTest()` ở cửa vào và lập tức trả về `false` mà không sửa đổi đĩa, bảo đảm hai lớp phòng thủ chiều sâu giữ nguyên từng byte của hàng đợi `danh-thuc.json` khi tiến trình đã mất quyền.
    * *Tại kho phiên (`kho-phien.ts`):* Hàm `ghiMocKetThuc` tự kiểm tra `isFenced()` ở cửa vào, chặn hoàn toàn mọi cập nhật mốc phiên vào `o-phien.json` một khi tiến trình đã bị fenced.
    * *Tại cửa ghi từng Ledger (`runs-ledger.ts`, `costs-ledger.ts`, `budget-ledger.ts`):* Mọi hàm ghi đĩa (`recordWake`, `updateWake`, `recordRun`, `updateRun`, `appendRecord`, `recordCostReceipt`, và `withBudgetLock`) đều kiểm tra `isFenced()` và ném lỗi từ chối ghi. Nhờ đó, ngay cả khi có bất kỳ asynchronous callback muộn nào gọi vào ledger, toàn bộ tệp `runs/*.jsonl` và `costs/*.jsonl` vẫn giữ nguyên từng byte (MD5 trước và sau hoàn toàn trùng khớp).
  + **Vô hiệu hoá công tắc thử ngoài môi trường test:** Mọi công tắc bypass (`__testHooks.disableFenceGuard`, `AIBOSS_TEST_DISABLE_FENCE_GUARD`) đều được bao bọc qua hàm kiểm tra `isFenceGuardDisabledForTest()`. Nếu `process.env.NODE_ENV === 'production'`, hàm luôn trả về `false` vô điều kiện, đảm bảo tuyệt đối không có lỗ hổng rò rỉ công tắc thử ra môi trường vận hành thực tế.
- **Khe ② — Thu hồi khoá mồ côi do crash khởi động giữa `open` và `write` (rỗng hoặc JSON hỏng không rỗng):**
  + Tệp rỗng hoặc chứa đoạn JSON dở dang (ví dụ `{"pid":123,"tok` do crash khi đang ghi) có tuổi đời dưới 10 giây (`< UNINITIALIZED_LOCK_TIMEOUT_MS = 10s`) sẽ khiến tiến trình sau từ chối khởi động (`fail-closed`), dành thời gian cho tiến trình tạo khoá hoàn tất ghi.
  + Tệp rỗng hoặc chứa JSON hỏng có tuổi đời từ 10 giây trở lên sẽ được xác định là khoá mồ côi do crash khởi động.
  + *Cơ chế tái kiểm tra nguyên vẹn xác khoá hỏng bên trong Mutex:* Trước khi thực hiện `renameSync` ứng viên đè lên tệp khoá hỏng, tiến trình đọc lại đĩa bên trong mutex và so sánh `currentContent === initialContent && currentStat.mtimeMs === initialMtimeMs`. Nếu byte và mtime giống hệt (vẫn là xác khoá hỏng cũ chưa ai động vào), tiến trình an toàn thu hồi và thay thế nguyên tử. Nếu nội dung hoặc mtime đã đổi (có contender khác can thiệp), tiến trình lập tức từ chối thu hồi (`fail-closed`) để bảo vệ dữ liệu.
- **Khe ③ — Bảo vệ an toàn cho máy chủ v07 dạng thư mục cũ:** Khi phát hiện `.instance.lock` là thư mục từ các phiên bản v06/v07 cũ, tiến trình không `rmSync` mù quáng. Hệ thống đọc `info.json` bên trong; nếu chủ cũ còn sống (`liveness === 'alive'` hoặc `unverified`), tiến trình mới từ chối khởi động và giữ nguyên thư mục cùng tệp `info.json` của phiên bản cũ. Chỉ khi chủ cũ đã chết thật sự (`liveness === 'dead'`), thư mục cũ mới được dọn dẹp để nâng cấp lên tệp đơn lẻ.
- **Khe ④ — Cơ chế loại trừ thống nhất qua Mutex ngắn có chủ, thu hồi nguyên tử sang bia mộ, phục hồi crash & không giả lập danh tính:**
  + **Mutex có chủ (`.instance.lock.mutex`):** Tất cả 4 thao tác chuyển đổi trạng thái khoá (`acquire`, `reclaim`, `renew`, `release`) đều bắt buộc chạy bên trong một khoá tệp loại trừ nguyên tử `O_EXCL` (`withInstanceMutex`). Ngay khi `openSync` thành công, metadata chủ `{ pid, processStartedAt, token, createdAt }` được ghi trực tiếp vào cùng fd bằng `writeSync`.
  + **Khe ④A — Thu hồi bằng POSIX Atomic Rename sang Bia Mộ (Tombstone):**
    * Thay vì dùng `unlinkSync` trực tiếp theo đường dẫn (dẫn tới nguy cơ đua TOCTOU khi hai reclaimer cùng đọc thấy chủ chết và một bên bị tạm dừng), reclaimer thực hiện `fs.renameSync(mutexPath, tombstonePath)` sang bia mộ cá nhân `.instance.lock.mutex.tombstone-<myToken>`.
    * POSIX `rename` là nguyên tử ở tầng filesystem: chỉ duy nhất MỘT reclaimer thành công; reclaimer thua nhận `ENOENT` và rút lui.
    * Reclaimer thắng đọc tệp bia mộ của mình để đối soát: nếu token trong bia mộ khớp đúng token chủ chết đã đọc, tiến trình xoá bia mộ và tạo mutex mới qua `open(O_EXCL)`. Nếu token bị thay thế bởi chủ mới trong tích tắc, tiến trình lập tức hoàn trả tệp (`fs.renameSync(tombstonePath, mutexPath)`) và từ chối thu hồi.
    * Khối `finally` cũng áp dụng atomic rename sang bia mộ cá nhân trước khi unlink, tuyệt đối không bao giờ unlink trực tiếp đường dẫn mutex.
  + **Khe ④B — Phục hồi Mutex hỏng/rỗng do crash giữa `open` và `write` (`>= 10s`):**
    * Khi crash xảy ra giữa `open(O_EXCL)` và `writeSync`, tệp mutex bị bỏ lại rỗng (0 bytes) hoặc không parse được JSON.
    * Ngưỡng `UNPARSEABLE_MUTEX_TIMEOUT_MS = 10000` (10 giây):
      - Nếu tệp rỗng/hỏng có tuổi `< 10s`: coi là tiến trình chủ đang ghi (in-flight write), tiếp tục chờ và thử lại.
      - Nếu tệp rỗng/hỏng có tuổi `>= 10s`: vì thao tác ghi metadata diễn ra ngay trong mili-giây sau khi mở tệp, sự tồn tại kéo dài $\ge 10\text{s}$ là bằng chứng đủ rằng tiến trình tạo đã chết. Hệ thống tự động thu hồi bằng atomic rename sang bia mộ theo đúng cơ chế ④A, giải phóng bế tắc khởi động máy chủ.
  + **Khe ④C — Không giả lập danh tính thời gian khởi động (No Start Time Fabrication):**
    * Khi OS query `ps -p <pid> -o lstart=` thất bại, hệ thống ghi nhận trung thực `processStartedAt: null`, tuyệt đối không bao giờ dùng `new Date().toISOString()` làm fallback danh tính.
    * Hàm `checkProcessLiveness(pid, null)` khi nhận start time `null` luôn trả về `'unverified'`, không bao giờ trả về `'dead'`. Do đó, các contender cạnh tranh mutex không bao giờ nhìn thấy timestamp lệch để suy đoán sai thành `dead`, loại bỏ hoàn toàn nguy cơ chiếm đoạt mutex của chủ còn sống.
  + **Thời gian chờ Mutex 5000ms (5 giây):**
    * Các thao tác trong mutex rất ngắn (vài ms đến vài chục ms để đọc/ghi tệp và gọi `ps` kiểm tra liveness). Thời hạn 5000ms là đủ rộng rãi để hai tiến trình cùng lúc khởi động hoặc cạnh tranh nhau có thể hoàn thành việc kiểm tra mà không bị timeout nhầm, ngay cả khi CPU đang tải cao; đồng thời đủ ngắn để khi gặp sự cố crash ngoài ý muốn, lần thử kế tiếp không bị treo lâu.
  + **Tách bạch 4 công tắc thử nghiệm cô lập (đều vô hiệu hoá hoàn toàn khi `NODE_ENV === 'production'`):**
    * `disableInstanceMutex` (`AIBOSS_TEST_DISABLE_INSTANCE_MUTEX=1`): Chỉ tắt việc acquire mutex trong `withInstanceMutex`.
    * `disableMutexRecheck` (`AIBOSS_TEST_DISABLE_MUTEX_RECHECK=1`): Giữ mutex nhưng tắt nhánh re-read đối soát đĩa trước khi thay thế.
    * `useUnlinkForMutex` (`AIBOSS_TEST_USE_UNLINK_FOR_MUTEX=1`): Dùng cho đối chứng dương Khe ④A: chuyển từ atomic rename sang `unlinkSync` trực tiếp để chứng minh tranh chấp TOCTOU giữa 2 reclaimer.
    * `disableCorruptMutexRecovery` (`AIBOSS_TEST_DISABLE_CORRUPT_MUTEX_RECOVERY=1`): Dùng cho đối chứng dương Khe ④B: tắt nhánh thu hồi mutex rỗng $\ge 10\text{s}$ để chứng minh timeout.
    * `fallbackStartTimeForTest` (`AIBOSS_TEST_FALLBACK_START_TIME=1`): Dùng cho đối chứng dương Khe ④C: khôi phục fallback `|| now` để chứng minh chủ sống bị chiếm đoạt mutex.
  + **Ràng buộc thời hạn Lease:** Thao tác reclaim chỉ được phép diễn ra khi đồng thời thoả mãn: tiến trình chủ cũ đã chết thật sự (`liveness === 'dead'`) VÀ thời hạn lease đã hết (`now >= leaseExpiresAt`).
  + **Thu hồi nguyên tử qua POSIX `rename` đè tệp:** Tuyệt đối không bao giờ xoá tệp khoá trước khi ghi mới, bảo đảm đường dẫn `.instance.lock` không bao giờ bị gián đoạn hay để hở khoảng trống TOCTOU cho bên thứ ba.
