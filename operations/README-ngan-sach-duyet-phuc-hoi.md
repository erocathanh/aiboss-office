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
- **Khe ④ — Cơ chế loại trừ thống nhất qua Mutex ngắn có chủ, giao thức Claim-File nguyên tử, chủ kiểm inode sau khi ghi metadata, không rename mutex sống, không rollback & không giả lập danh tính:**
  + **Mutex có chủ (`.instance.lock.mutex`):** Tất cả 4 thao tác chuyển đổi trạng thái khoá (`acquire`, `reclaim`, `renew`, `release`) đều bắt buộc chạy bên trong một khoá tệp loại trừ nguyên tử `O_EXCL` (`withInstanceMutex`). Ngay khi `openSync` thành công, metadata chủ `{ pid, processStartedAt, token, createdAt }` được ghi trực tiếp vào cùng fd bằng `writeSync`.
  + **Bước 1 — Tạo mutex (chủ) & Kiểm tra sở hữu hậu ghi (Owner Post-Write Inode Check):**
    * Chủ gọi `open(mutexPath, O_CREAT | O_EXCL | O_RDWR)` -> `writeSync(fd, metadata {pid, processStartedAt, token, createdAt})` -> `fsyncSync(fd)`.
    * **Kiểm tra sở hữu hậu ghi bắt buộc:** Chủ thực hiện `fstat(fd).ino === stat(mutexPath).ino` VÀ đọc lại nội dung tệp tại `mutexPath` phải khớp đúng `token` và `pid` của mình.
    * Nếu xảy ra lệch (do chủ bị tạm dừng giữa `open` và `write` quá 10 giây và tệp rỗng đã bị reclaimer thu hồi/thay thế), chủ lập tức đóng fd, **TUYỆT ĐỐI KHÔNG** vào `fn()`, và quay lại vòng lặp thử lại. Đây là chốt chặn đóng triệt để Khe ④B từ phía chủ: chủ tỉnh lại sau tạm dừng không bao giờ bước vào critical section bằng một fd mồ côi đã bị unlink.
  + **Bước 2 — Thu hồi (reclaimer) — Không chạm mutex khi chưa thắng tệp Claim:**
    * Reclaimer đọc `mutexPath`:
      - *(a) Parse được JSON:* Gọi `checkProcessLiveness(pid, processStartedAt)`. Chỉ khi liveness là `dead` mới được phép đi tiếp; nếu `alive` hoặc `unverified` thì tiếp tục chờ. Danh tính xác = `token`.
      - *(b) Tệp rỗng hoặc JSON hỏng:* Chỉ đi tiếp khi `mtime` đã quá ngưỡng `UNPARSEABLE_MUTEX_TIMEOUT_MS = 10000` (10 giây). Danh tính xác = `ino` (inode của tệp hỏng trên đĩa).
    * Reclaimer tạo **tệp claim nguyên tử** `mutexPath + '.reclaim-' + <token|ino>` qua `open(O_CREAT | O_EXCL | O_RDWR)` ghi `{ pid, processStartedAt, createdAt }` của mình.
    * **Chỉ duy nhất MỘT reclaimer thắng claim:** Reclaimer thua nhận `EEXIST` -> đọc tệp claim: nếu chủ claim đã `dead`, reclaimer an toàn dọn dẹp claim mồ côi bằng `unlinkSync` rồi thử lại; nếu chủ claim `alive` hoặc `unverified` thì chờ. Reclaimer không bao giờ rename hay unlink mutex khi chưa thắng claim.
  + **Bước 3 — Xác minh lại sau khi thắng Claim rồi mới Unlink:**
    * Sau khi thắng tệp claim, reclaimer đọc lại `mutexPath`:
      - Nếu `targetMode === 'token'`: token trên đĩa VẪN khớp đúng `targetIdentity` đã claim.
      - Nếu `targetMode === 'ino'`: inode trên đĩa VẪN khớp đúng `targetIdentity` và tệp vẫn rỗng/hỏng (nếu chủ tỉnh lại ghi xong metadata thì reclaimer phát hiện có pid hợp lệ và lập tức huỷ bỏ).
    * Khi và chỉ khi xác minh thành công (`canUnlink === true`), reclaimer mới gọi `unlinkSync(mutexPath)`.
    * Nếu không khớp, reclaimer huỷ bỏ, xoá tệp claim của mình và quay lại chờ.
    * Sau khi unlink mutex cũ, reclaimer tạo mutex mới của mình theo Bước 1, rồi xoá tệp claim của mình.
  + **Bước 4 — Giải phóng (finally) không Rename, không Rollback:**
    * Khi rời khỏi `withInstanceMutex`, khối `finally` đọc lại `mutexPath`: nếu token trên đĩa khớp đúng `myToken` và `process.pid` của mình thì mới gọi `unlinkSync(mutexPath)`; nếu không khớp (đã bị người khác thay thế), tiến trình không làm gì. Fd mở ở Bước 1 luôn được đóng an toàn tại đây.
    * Tuyệt đối không còn bia mộ (tombstone), 0 lệnh `renameSync(mutexPath`, và không có bất kỳ cơ chế rollback nào có thể ghi đè contender.
  + **Bước 5 — Fail-Closed ở mọi bước:**
    * Mọi lỗi đọc đĩa, parse JSON, hoặc kiểm tra quyền ở bất kỳ bước nào đều fail-closed (coi là chưa thắng, không unlink mutex), không bao giờ mặc định thắng.
  + **Khe ④C — Không giả lập danh tính thời gian khởi động (No Start Time Fabrication):**
    * Khi OS query `ps -p <pid> -o lstart=` thất bại, hệ thống ghi nhận trung thực `processStartedAt: null`, tuyệt đối không bao giờ dùng `new Date().toISOString()` làm fallback danh tính.
    * Hàm `checkProcessLiveness(pid, null)` khi nhận start time `null` luôn trả về `'unverified'`, không bao giờ trả về `'dead'`. Do đó, các contender cạnh tranh mutex không bao giờ nhìn thấy timestamp lệch để suy đoán sai thành `dead`, loại bỏ hoàn toàn nguy cơ chiếm đoạt mutex của chủ còn sống.
  + **Thời gian chờ Mutex 5000ms (5 giây):**
    * Các thao tác trong mutex rất ngắn (vài ms đến vài chục ms). Thời hạn 5000ms là đủ rộng rãi để bảo đảm không timeout nhầm khi hệ thống chịu tải cao, đồng thời giải phóng nhanh chóng khi có crash.
  + **Tách bạch 6 công tắc thử nghiệm cô lập (đều vô hiệu hoá hoàn toàn khi `NODE_ENV === 'production'`):**
    * `disableInstanceMutex` (`AIBOSS_TEST_DISABLE_INSTANCE_MUTEX=1`): Tắt toàn bộ mutex trong `withInstanceMutex`.
    * `disableMutexRecheck` (`AIBOSS_TEST_DISABLE_MUTEX_RECHECK=1`): Tắt kiểm tra đối soát token bên trong `.instance.lock`.
    * `disableOwnerInodeCheck` (`AIBOSS_TEST_DISABLE_OWNER_INODE_CHECK=1`): Dùng cho đối chứng dương Khe ④B-1: tắt kiểm tra inode hậu ghi của chủ, chứng minh chủ dùng fd mồ côi gây va chạm đồng thời.
    * `disableReclaimerRecheck` (`AIBOSS_TEST_DISABLE_RECLAIMER_RECHECK=1`): Dùng cho đối chứng dương Khe ④A-1 và ④B-2: tắt bước 3 xác minh lại trước khi unlink của reclaimer, chứng minh việc xoá nhầm mutex sống.
    * `disableCorruptMutexRecovery` (`AIBOSS_TEST_DISABLE_CORRUPT_MUTEX_RECOVERY=1`): Dùng cho đối chứng dương Khe ④B: tắt nhánh thu hồi mutex rỗng $\ge 10\text{s}$ để chứng minh timeout.
    * `fallbackStartTimeForTest` (`AIBOSS_TEST_FALLBACK_START_TIME=1`): Dùng cho đối chứng dương Khe ④C: khôi phục fallback `|| now` để chứng minh chủ sống bị chiếm đoạt mutex.
  + **Ràng buộc thời hạn Lease:** Thao tác reclaim chỉ được phép diễn ra khi đồng thời thoả mãn: tiến trình chủ cũ đã chết thật sự (`liveness === 'dead'`) VÀ thời hạn lease đã hết (`now >= leaseExpiresAt`).
  + **Thu hồi nguyên tử qua POSIX `rename` đè tệp:** Tuyệt đối không bao giờ xoá tệp khoá trước khi ghi mới, bảo đảm đường dẫn `.instance.lock` không bao giờ bị gián đoạn hay để hở khoảng trống TOCTOU cho bên thứ ba.

---

## 4. Khởi Động Lại Sau Crash & Chờ Hết Hạn Lease (Crash Restart & Finite Lease Wait) — A-3 v14

Trong môi trường quản lý tiến trình tự động (như `launchd` trên macOS hoặc `systemd` trên Linux), khi một tiến trình máy chủ bị crash hoặc tắt đột ngột (ví dụ qua `SIGKILL` hoặc khởi động lại dịch vụ), máy chủ mới có thể được khởi động lại ngay lập tức (trong vòng 1–2 giây) trên cùng thư mục dữ liệu (`AIBOSS_DATA_DIR`).

Tại thời điểm máy chủ mới khởi động:
- Tệp khoá `.instance.lock` của máy chủ cũ vẫn còn trên đĩa.
- Chủ khoá cũ đã chết thực tế (`checkProcessLiveness` trả về `'dead'`).
- Nhưng thời hạn thuê khoá (`leaseExpiresAt`) của chủ cũ có thể vẫn còn hiệu lực trong vài giây tiếp theo (`DEFAULT_INSTANCE_LEASE_MS = 6000` ms, tức 6 giây).

### 4.1. Phân loại lý do từ chối khoá (`AcquireInstanceLockResult.reason`)
Hàm `acquireInstanceLock(dataDir)` trả về kết quả cấu trúc kèm `reason` và `retryAfterMs`:
1. `'alive'`: Chủ khoá cũ đang chạy thực tế trên máy chủ (`checkProcessLiveness` trả về `alive`).
   - *Hành vi:* Ném lỗi ngay lập tức trong vòng $\le 1$ giây, tuyệt đối không chờ. Điều này bảo đảm việc chạy hai máy chủ thật đồng thời trên cùng thư mục dữ liệu bị chặn đứng ngay lập tức với thông báo lỗi to.
2. `'lease_pending'`: Chủ khoá cũ đã chết (`dead`), nhưng thời hạn lease chưa kết thúc (`now < leaseExpiresAt`).
   - *Hành vi:* Đi kèm `retryAfterMs = leaseExpiresAt - now`. Đây là trạng thái an toàn để tiến trình mới chờ và thu hồi khoá sau khi lease kết thúc.
3. `'unverified'`: Trạng thái tạm thời khi truy vấn hệ điều hành (`ps`) chưa xác định được thời gian tiến trình.
   - *Hành vi:* Chờ và thử lại ngắn hạn.
4. `'contended'`: Tranh chấp lock hoặc mutex tạm thời giữa các tiến trình đang khởi động.
   - *Hành vi:* Chờ và thử lại ngắn hạn.
5. `'config_error'`: Tiến trình mới không thể xác định thời điểm bắt đầu của chính mình từ hệ điều hành.
   - *Hành vi:* Từ chối khởi động ngay lập tức (fail-closed).

### 4.2. Cơ chế chờ có giới hạn trong `startOfficeRunner` (`INSTANCE_LOCK_STARTUP_WAIT_MS = 16000`)
- **Vấn đề trên Next.js:** Khi Next.js chạy hook khởi động `register()` trong `src/instrumentation.ts`, nếu hook ném ngoại lệ không xử lý, Next.js đánh dấu chuẩn bị máy chủ thất bại và phục vụ HTTP 500 cho mọi yêu cầu kế tiếp mà không tự hồi phục.
- **Giải pháp:** `startOfficeRunner` thực hiện vòng lặp chờ và thử lại mỗi 500ms:
  - Nếu gặp `lease_pending`, `contended`, hoặc `unverified`, tiến trình chờ cho đến khi lease của chủ cũ hết hạn hoặc tối đa `INSTANCE_LOCK_STARTUP_WAIT_MS = 16000` ms (16 giây = 6 giây lease tối đa + 10 giây dự phòng cho độ trễ hệ thống và I/O).
  - Ngay khi lease hết hạn, thao tác reclaim nguyên tử thu hồi quyền sở hữu khoá cho tiến trình mới và máy chủ khởi động thành công.
  - Nếu gặp `alive` hoặc `config_error`, hàm ném lỗi ngay lập tức mà không chờ.
  - Nếu sau 16 giây vẫn không cấp được khoá, hàm ném lỗi fatal như cũ (ngăn chặn treo tiến trình vô hạn).

### 4.3. Bảo vệ API trong giai đoạn chờ khởi động: HTTP 503 `runner_starting`
- Trong thời gian `startOfficeRunner` đang chờ thu hồi khoá khởi động, hàm `getIsRunnerStarting()` trả về `true`.
- Các route API chính của hệ thống (`GET /api/budget`, `GET /api/danh-thuc`, `POST /api/danh-thuc`) kiểm tra `getIsRunnerStarting()` ở đầu hàm và trả về HTTP 503:
  ```json
  {
    "error": "runner_starting",
    "message": "Office runner is starting up and waiting for startup lock."
  }
  ```
- Cơ chế này thay thế hoàn toàn lỗi HTTP 500 fatal bằng phản hồi 503 tạm thời chuẩn HTTP, báo cho client và hệ thống giám sát biết máy chủ đang trong quá trình chuyển tiếp khởi động an toàn.

### 4.4. Công tắc đối chứng dương và an toàn môi trường Production
- Để kiểm thử và đối chứng tự động, hệ thống cung cấp công tắc `__testHooks.disableStartupWait` và biến môi trường `AIBOSS_TEST_DISABLE_STARTUP_WAIT=1`.
- Khi kích hoạt công tắc này trong kiểm thử (`NODE_ENV === 'test'`), tiến trình mới sẽ không chờ mà ném lỗi ngay khi gặp `lease_pending`, chứng minh rõ ràng sự cần thiết của cơ chế chờ.
- **Bảo vệ Production:** Hàm `isStartupWaitDisabledForTest()` luôn trả về `false` vô điều kiện khi `process.env.NODE_ENV === 'production'`, bảo đảm công tắc kiểm thử hoàn toàn bất hoạt trong môi trường vận hành thực tế.

---

## 5. Sổ Duyệt Hành Động Dạng Máy Trạng Thái (Approval Ledger State Machine) — A-4 (v07)

Giải pháp A-4 biến sổ duyệt `operations/data/approvals/<YYYY-MM-DD>.jsonl` thành một máy trạng thái tất định nối trực tiếp từ yêu cầu của hook (`request`) → mã băm nội dung (`digest`) → quyết định của người duyệt (`decision`) → thực thi đơn lần (`execution`).

### 5.1. Định dạng Dữ liệu & Công thức `requestId` Tất định
Toàn bộ dữ liệu nằm chung trong tệp nhật ký theo ngày UTC `operations/data/approvals/<YYYY-MM-DD>.jsonl` (hoặc `<AIBOSS_DATA_DIR>/approvals/<YYYY-MM-DD>.jsonl` khi chạy kiểm thử cô lập), chỉ nối thêm (append-only), không bao giờ sửa đè dòng cũ:

1. **Dòng `request` (do hook `operations/hooks/guard_bulk_send.py` ghi):**
   - Các dòng do hook hiện hành ghi không có trường `type`:
     ```json
     {"ts":"2026-10-14T10:00:00Z","seat":"email-crm","tool":"Bash","host":"api.sendgrid.com","len":248,"sha256":"a1b2...","head60":"curl -X POST ...","reason":"external_host"}
     ```
   - Khi đọc sổ, hệ thống **chỉ** coi một dòng là `request` khi khoá `"type"` vắng mặt (`"type" not in obj`) **HOẶC** `obj["type"] == "request"`. Nếu `"type": null` có mặt trong JSON thì dòng đó bị từ chối (F2).
   - **Công thức tính `requestId` tất định (dùng chung giữa máy chủ TypeScript và hook H4 của PCN):**
     ```text
     requestId = sha256_hex(ts + "|" + seat + "|" + tool + "|" + sha256)[0..15]
     ```
     Cụ thể: ghép chuỗi UTF-8 gồm 4 trường `ts`, `seat`, `tool`, `sha256` (chữ thường, đã cắt khoảng trắng ASCII `[ \t\r\n]`) phân cách bởi ký tự `|`, băm SHA-256 và lấy **16 ký tự hex chữ thường đầu tiên**.
     - Trong Python 3:
       ```python
       hashlib.sha256(f"{ts}|{seat}|{tool}|{sha256}".encode("utf-8")).hexdigest()[:16]
       ```
     - Trong Node.js / TypeScript:
       ```ts
       crypto.createHash('sha256').update(`${ts}|${seat}|${tool}|${sha256}`, 'utf8').digest('hex').slice(0, 16)
       ```

2. **Dòng `decision` (do máy chủ ghi khi người dùng bấm Approve / Deny):**
   ```json
   {"type":"decision","requestId":"48b80909c1a4222b","decision":"approved","by":"owner","at":"2026-10-14T10:02:00.000Z","note":"Approved for newsletter","expiresAt":"2026-10-14T11:02:00.000Z"}
   ```
   - `decision`: `"approved"` hoặc `"denied"`.
   - `by`: `"owner"` hoặc `"localhost"` (xem quy tắc xác thực F7/F13 tại mục 5.4).
   - `note`: Tuỳ chọn; nếu có mặt trong payload (kể cả `note: null`), bắt buộc phải là kiểu `string` và có độ dài nguyên bản (trước khi cắt khoảng trắng ASCII, đếm theo số điểm mã Unicode `Array.from(note).length` trong TS / `len(note)` trong Python) $\le 200$ ký tự. Nếu `note: null`, không phải chuỗi, hoặc vượt 200 điểm mã Unicode, API trả HTTP `400` ngay và ghi `0` byte vào sổ (F2b, F6).
   - `expiresAt`: Do máy chủ tự tính bằng `at + approvals.ttlMinutes` (60 phút trong `config/office.json`); API công khai không nhận `expiresAt` từ phía client (F8).
   - Mỗi `requestId` chỉ được quyết định đúng một lần; gọi quyết định lần thứ hai cho cùng `requestId` trả về HTTP `409 Conflict`.

3. **Dòng `claim` (tiêu thụ chỉ qua `approval_check.py --consume` của hook H4, ghi nguyên tử dưới khoá trước khi thực thi hành động):**
   ```json
   {"type":"claim","requestId":"48b80909c1a4222b","claimId":"c9f1a2b3d4e5f601","seatId":"email-crm","tool":"Bash","digest":"a1b2...","at":"2026-10-14T10:02:30.000Z"}
   ```
   - Giữ chỗ sử dụng duy nhất (single-use reservation) cho `requestId` ngay trước khi cho phép lệnh chạy. Tiêu thụ chỉ thực hiện qua `python3 operations/scripts/approval_check.py --consume` (hook H4). Khi đã có `claim`, mọi tiến trình `approval_check.py --consume` chạy song song hoặc chạy sau đều nhận trạng thái `"claimed"` và thoát mã `2` (0 dòng ghi thêm).

4. **Dòng `execution` (do `approval_mark.py` hoặc `recordApprovalExecution` ghi sau khi thực thi):**
   ```json
   {"type":"execution","requestId":"48b80909c1a4222b","claimId":"c9f1a2b3d4e5f601","runId":"run-20261014-0001","seatId":"email-crm","at":"2026-10-14T10:03:00.000Z","result":"executed","digest":"a1b2..."}
   ```
   - `result`: `"executed"` | `"failed"`.
   - **Không bao giờ ghi bản ghi khi từ chối thực thi (F1a):** Khi yêu cầu chưa được duyệt (`pending`), đã từ chối (`denied`), chưa tới thời điểm hiệu lực (`not_yet_valid`), đã hết hạn (`expired`), sai `claimId` (`claim_mismatch`), hoặc đã thực thi trước đó (`already_executed` / `digest_mismatch`), cả `recordApprovalExecution` (TS) và `approval_mark.py` (Python) đều từ chối ngay và **ghi `0` dòng vào sổ** (kích thước tệp `.jsonl` không đổi từng byte).
   - Mọi bản ghi khi đọc/ghi và trả qua API đều đi qua bộ lọc whitelist trường nghiêm ngặt (`sanitizeApprovalRequestRecord`, `sanitizeApprovalDecisionRecord`, `sanitizeApprovalClaimRecord`, `sanitizeApprovalExecutionRecord`, `sanitizeApprovalItem`), đồng thời ánh xạ tự động cả 7 chuỗi `reason` tiếng Việt của hook H1 sang mã tiếng Anh chuẩn (`mcp_external_send`, `curl_config_flag`, `inbox_message_fetch`, `facebook_graph_messages`, `facebook_graph_batch`, `external_post_send`, `external_endpoint_send`).

### 5.2. Kiến Trúc Một Bản Cài Duy Nhất (Python + `fcntl.flock`, TS Máy Khách Mỏng — A-4 v06/v07)
Toàn bộ việc khoá, đọc/gấp (fold) và ghi sổ duyệt đều hội tụ về **một mô-đun Python duy nhất** tại `operations/scripts/approval_ledger.py` (dùng chung cho `approval_check.py`, `approval_mark.py`, và hai lệnh CLI `dump` / `decide` phục vụ API). Mô-đun TypeScript `src/lib/approvals-ledger.ts` chỉ là máy khách mỏng gọi CLI Python qua `child_process.spawnSync` với danh sách trắng biến môi trường (`buildPythonCliEnv`) và đối số dạng `--flag=<value>` (F21, F23), kiểm tra đầu vào (`note`, Basic Auth / localhost) và lọc whitelist trường trả ra (`sanitizeApprovalItem`).

- `requested` (hiển thị là `pending` trên bộ lọc API) → `approved` | `denied` → (`claim` nguyên tử) → `executed` | `failed` | `expired`.
- **Luật đọc/gấp sổ, khoá hệ điều hành & ghi kiểm tra đuôi (A-4 v06/v07):**
  1. **Một bộ đọc và gấp sổ duy nhất (`read_and_fold_ledger` & `approval_ledger.py dump --json` — F2, F17):**
     - Đọc từng tệp `.jsonl` ở chế độ nhị phân (`open(file_path, "rb")`), tách dòng **duy nhất theo byte `b"\n"` (`0x0a`)** (ký tự `CR` đơn `0x0d` không bao giờ là ranh giới dòng).
     - Bỏ qua mọi dòng không giải mã được UTF-8 hợp lệ (`decode("utf-8", errors="strict")`), **bắt đầu bằng BOM** (`b"\xef\xbb\xbf"` / `U+FEFF` cả trước và sau khoảng trắng ASCII), hoặc chứa hằng JSON không chuẩn (`NaN`, `Infinity`, `-Infinity` bị chặn qua `parse_constant=_reject_json_constant`).
     - Một dòng chỉ là `request` khi khoá `"type"` vắng mặt hoặc `type == "request"`; `"type": null` bị loại bỏ. Toàn bộ các trường định danh và thời gian bắt buộc đúng kiểu chuỗi, và `strip_ascii` chỉ cắt 4 ký tự khoảng trắng ASCII `[ \t\r\n]`.
     - Chỉ khi thư mục `approvals` chưa tồn tại (`FileNotFoundError`), hệ thống mới coi sổ đang trống (`[]`). Mọi lỗi liệt kê thư mục hoặc lỗi đọc bất kỳ tệp `.jsonl` nào (`EACCES`, `EPERM`, `EIO`, v.v.) đều **lập tức dừng gấp sổ và fail-closed** (`ApprovalLedgerUnreadableError` → `status: "ledger_unreadable"`, thoát mã `2` ở CLI / trả HTTP `503` ở API, ghi `0` byte).
  2. **Chuẩn thời gian ISO-8601 miền năm `1970–9999`, từ chối `not_yet_valid` (F5, F11) & chọn yêu cầu mới nhất trước khi đối chiếu `--request-id` (F4):**
     - Biểu thức chính quy chỉ nhận chữ số ASCII `[0-9]` trong miền năm `1970–9999`, kiểm tra ngày dương lịch hợp lệ (kể cả năm nhuận) và miền UTC `[0, 253402300799999]` ms, cắt phần lẻ về số nguyên mili-giây UTC.
     - Khi `now_ms < decision.at_ms` (dung sai `0`), yêu cầu trả về `status: "not_yet_valid"`, thoát mã `2` và ghi `0` dòng (F11).
     - `approval_check.py` luôn tìm yêu cầu mới nhất của `(seat, tool, sha256)` trước tiên; nếu `--request-id` trỏ tới yêu cầu cũ hơn của cùng `(seat, tool)` thì trả về `status: "superseded"`, thoát mã `2` (F4).
  3. **Khoá hệ điều hành `fcntl.flock(fd, LOCK_EX)` và ghi lặp đủ byte + kiểm tra đuôi (`with_approval_lock` & `append_jsonl_safely` — Mục 1 & 2 v06, F1b, F15, F18, F20):**
     - Mọi thao tác kiểm tra/tiêu thụ (`check`), ghi quyết định (`decide`) và đánh dấu thực thi (`mark`) đều lấy khoá độc quyền của nhân hệ điều hành bằng `fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)` trên tệp `<approvals_dir>/.approvals.lock`. Tệp khoá được giữ mở suốt vùng tới hạn và chỉ nhả ở khối `finally` (`LOCK_UN` + `os.close(fd)`), không bao giờ `unlink` hay `rename` tệp khoá; nếu tiến trình giữ khoá chết đột ngột (`SIGKILL` / `kill -9`), nhân hệ điều hành tự động đóng `fd` và nhả khoá ngay lập tức mà không cần bất kỳ logic thu hồi khoá mồ côi, kiểm tra inode, `bootId`/`hostname`, hay quét dọn tệp tạm nào. Khi chờ khoá quá hạn đơn điệu `5s` (`time.monotonic()`), hệ thống ném `ApprovalLockTimeoutError` (`status: "lock_timeout"`, thoát mã `2` / HTTP `503`). Khi ghi vào sổ, `append_jsonl_safely` mở tệp `.jsonl` với `O_CREAT | O_RDWR | O_APPEND`, kiểm tra byte cuối để thêm `b"\n"` nếu dòng trước bị cụt, lặp `os.write` cho tới khi ghi đủ toàn bộ số byte của dòng JSON, gọi `os.fsync(fd)`, rồi đọc lại đuôi tệp bằng `os.pread` để xác nhận dòng vừa ghi kết thúc bằng `\n` và parse được JSON khớp bản ghi; nếu thiếu byte hoặc không parse được thì lập tức báo `io_error` và thoát mã `2` (không bao giờ trả `approved`).

### 5.3. Hợp Đồng CLI Python (`approval_ledger.py`, `approval_check.py`, `approval_mark.py` — F23, F24)
Mọi lệnh CLI đều chạy dưới lớp bắt lỗi ngoài cùng `run_cli_with_error_boundary`: mọi lỗi khoá (`lock_timeout`), lỗi đọc sổ (`ledger_unreadable`), hoặc lỗi I/O (`io_error`) đều in một dòng JSON hợp lệ ra `stdout` và thoát mã `2` (không bao giờ in traceback thô hay thoát mã `1` vì lỗi I/O). Để tránh `argparse` hiểu nhầm giá trị bắt đầu bằng dấu gạch (`--review`, `-x`) thành cờ tuỳ chọn, máy khách TypeScript truyền toàn bộ đối số giá trị theo cú pháp `--flag=<value>` (F23):

1. **Đọc/gấp sổ và ghi quyết định cho API (`operations/scripts/approval_ledger.py`):**
   ```bash
   python3 operations/scripts/approval_ledger.py dump [--status=<status>] [--seat=<seat>] [--request-id=<id>] [--limit=<n>] --json
   python3 operations/scripts/approval_ledger.py decide --request-id=<id> --decision=<approved|denied> --by=<owner|localhost> [--note=<str>]
   ```
2. **Kiểm tra và giữ chỗ nguyên tử trước khi thực thi (`operations/scripts/approval_check.py` — Hook H4):**
   ```bash
   python3 operations/scripts/approval_check.py --seat=<slug> --tool=<tool> --sha256=<hex> [--request-id=<id>] [--consume]
   ```
   - **Hợp đồng khoá JSON stdout của `approval_check.py` (giữ nguyên 100% các khoá v05, kê chi tiết theo từng nhánh — F24, F28):**
     - Thành công (`exit 0`, không `--consume`): `{"requestId": "<16-hex>", "status": "approved", "expiresAt": "<ISO>"}`.
     - Thành công (`exit 0`, có `--consume`): `{"requestId": "<16-hex>", "status": "approved", "expiresAt": "<ISO>", "claimId": "<16-hex>"}`.
     - Từ chối nghiệp vụ (`exit 2`, không ghi vào sổ):
       - `not_found`: `{"status": "not_found"}` (khi không truyền `--request-id`) hoặc `{"requestId": "<16-hex>", "status": "not_found"}` (khi truyền `--request-id`).
       - `superseded`: `{"requestId": "<16-hex>", "latestRequestId": "<16-hex>", "status": "superseded"}`.
       - `digest_mismatch`: `{"requestId": "<16-hex>", "status": "digest_mismatch"}`.
       - `pending`: `{"requestId": "<16-hex>", "status": "pending"}`.
       - `denied` / `expired` / `not_yet_valid`: `{"requestId": "<16-hex>", "status": "denied" | "expired" | "not_yet_valid", "expiresAt": "<ISO>"}` (trường `"expiresAt"` có mặt khi bản ghi `decision` có `expiresAt` khác rỗng).
       - `claimed`: `{"requestId": "<16-hex>", "status": "claimed", "expiresAt": "<ISO>", "claimId": "<16-hex>"}`.
       - `executed` / `failed`: `{"requestId": "<16-hex>", "status": "executed" | "failed", "expiresAt": "<ISO>"}` (kèm `"claimId": "<16-hex>"` nếu lần thực thi đó gắn với `claimId`).
     - Lỗi hạ tầng (`exit 2`):
       - `lock_timeout` (trước khi ghi, `0` byte ghi): `{"status": "lock_timeout"}` (kèm `"requestId": "<16-hex>"` nếu truyền `--request-id`).
       - `ledger_unreadable` (trước khi ghi, `0` byte ghi): `{"status": "ledger_unreadable", "file": "<basename>", "reason": "<ERRNO>"}` (kèm `"requestId": "<16-hex>"` nếu truyền `--request-id`).
       - `io_error`: `{"status": "io_error", "reason": "<ERRNO>"}` (kèm `"requestId": "<16-hex>"` nếu truyền `--request-id`). Nếu lỗi I/O xảy ra trước khi mở/ghi tệp (`EACCES`, `EROFS`), `0` byte được ghi; nếu lỗi xảy ra **sau khi đã bắt đầu ghi** trong `append_jsonl_safely` (xem chi tiết tại **§5.5**), có đúng **3 trường hợp hậu quả trên đĩa**:
         1. **JSON chưa đủ (mảnh dòng cụt giữa chừng):** bộ đọc `read_and_fold_ledger` tự bỏ qua mảnh không phải JSON hợp lệ, trạng thái sổ không đổi, và lần ghi hợp lệ kế tiếp tự chèn byte `\n` để sửa đuôi tệp.
         2. **JSON đủ nội dung nhưng thiếu byte `\n` cuối:** bộ đọc `read_and_fold_ledger` vẫn parse và fold bản ghi cuối này (ví dụ `claim` chuyển trạng thái sang `"claimed"` để chặn tiêu thụ hai lần), và lần ghi hợp lệ kế tiếp tự chèn byte `\n` trước khi nối dòng mới (xem **§5.5 — F22**).
         3. **Bản ghi đã ghi đủ (kể cả byte `\n`) nhưng lỗi ở bước đồng bộ đĩa (`os.fsync`) hoặc đọc kiểm tra lại (`readback`):** bản ghi hoàn chỉnh đã nằm trên đĩa nên các lần đọc tiếp theo vẫn fold bản ghi đó thành trạng thái mới (`claimed` / `executed` / `decision`).
3. **Đánh dấu kết quả sau khi thực thi (`operations/scripts/approval_mark.py` — Hook H4, Hợp đồng Schema Cộng Thêm F24, F28, F30):**
   ```bash
   python3 operations/scripts/approval_mark.py --request-id=<id> --result=<executed|failed> [--claim-id=<claimId>] [--run-id=<runId>]
   ```
   - **Hợp đồng khoá JSON stdout của `approval_mark.py` (schema cộng thêm — chỉ thêm khoá, không bỏ, không đổi nghĩa bất kỳ khoá v05 nào; hook H4 đọc theo tên trường):**
     - Thành công (`exit 0`):
       - Các khoá gốc từ v05 (bắt buộc giữ nguyên tên, kiểu và nghĩa): `"requestId": "<16-hex>"`, `"status": "executed" | "failed"`, `"idempotent": true | false`, và `"claimId": "<16-hex>"` (có mặt ở cả lần ghi đầu `idempotent: false` và các lần gọi lặp `idempotent: true` khi bản ghi có `claimId`).
       - Khoá cộng thêm từ v06/v07: `"ok": true`.
     - Từ chối nghiệp vụ (`exit 2`, ghi `0` byte):
       - Các khoá gốc từ v05 (bắt buộc giữ nguyên tên, kiểu và nghĩa): `"requestId": "<16-hex>"`, `"status": "not_found" | "pending" | "denied" | "expired" | "not_yet_valid" | "claim_mismatch" | "already_executed" | "digest_mismatch"`.
       - Các khoá cộng thêm từ v06/v07: `"ok": false`, `"message": "<mô tả lỗi>"`.
     - Lỗi hạ tầng (`exit 2`):
       - `lock_timeout`: `{"status": "lock_timeout", "requestId": "<16-hex>"}` (trước khi ghi, `0` byte ghi).
       - `ledger_unreadable`: `{"status": "ledger_unreadable", "file": "<basename>", "reason": "<ERRNO>", "requestId": "<16-hex>"}` (trước khi ghi, `0` byte ghi).
       - `io_error`: `{"status": "io_error", "reason": "<ERRNO>", "requestId": "<16-hex>"}` (`0` byte nếu lỗi trước khi ghi; nếu lỗi xảy ra sau khi đã bắt đầu ghi thì theo đúng **3 trường hợp hậu quả trên đĩa** như mục `approval_check.py` ở trên và **§5.5**: JSON chưa đủ thì bị bỏ qua và lần ghi kế tiếp sửa đuôi `\n`; JSON đủ nhưng thiếu `\n` hoặc bản ghi đã đủ nhưng lỗi ở `os.fsync`/readback thì bản ghi `execution` vẫn được bộ đọc fold thành `"executed"`/`"failed"`).

### 5.4. API, Quy Tắc Xác Thực (F13) & Giao Diện `/settings`
- `GET /api/approvals?status=pending|approved|denied|executed|expired&limit=50`: gọi `approval_ledger.py dump --json`, lọc qua `sanitizeApprovalItem` và trả danh sách yêu cầu kèm `total`. Nếu gặp `lock_timeout`, `ledger_unreadable` hoặc `io_error`, trả về HTTP `503` với thông điệp chung an toàn (không lộ đường dẫn tệp nội bộ).
- `POST /api/approvals/<requestId>/decision`:
  - **Quy tắc xác thực (F7, F13):** Khi `PHONGBAN_USER` và `PHONGBAN_PASS` đã được cấu hình, bắt buộc HTTP Basic Auth trên mọi yêu cầu (kể cả từ `localhost` / `127.0.0.1`), đối chiếu thời gian hằng qua `crypto.timingSafeEqual` trên SHA-256 digest (`by: "owner"`). Chỉ khi chưa cấu hình `PHONGBAN_USER`/`PHONGBAN_PASS`, yêu cầu từ loopback thực sự (`localhost`, `127.0.0.1`, `[::1]`) mới được chấp nhận với `by: "localhost"`, còn ngoài localhost trả về HTTP `503`.
  - Kiểm tra `decision` và `note` (kiểu chuỗi, $\le 200$ điểm mã Unicode, từ chối `note: null`) tại TS trước khi gọi `approval_ledger.py decide`; trả `400` (0 byte ghi) nếu đầu vào không hợp lệ, `404` nếu không tìm thấy, `409` nếu đã quyết định trước đó, và `503` (`lock_timeout`, `ledger_unreadable`, `io_error`) với thông điệp chung an toàn.

### 5.5. Công Tắc Đối Chứng Dương Cô Lập (F21, F26), Rủi Ro Tồn Dư Đuôi Thiếu `\n` (F22) & Cách Dọn Sổ Thử Nghiệm
- **Công tắc đối chứng dương cô lập 4 điều kiện (`is_lock_disabled_for_test` — F21, F26):**
  - Công tắc bỏ `fcntl.flock` trong `operations/scripts/approval_ledger.py` chỉ dùng duy nhất cho ca đối chứng dương (Ca 15) và chỉ kích hoạt khi **đồng thời thoả đủ 4 điều kiện**:
    1. `AIBOSS_TEST_MODE == "1"` (cờ chế độ thử thống nhất của toàn kho, dùng chung với hook 2.1 trong S17);
    2. `AIBOSS_TEST_DISABLE_APPROVAL_LOCK == "1"`;
    3. `NODE_ENV != "production"`;
    4. `AIBOSS_DATA_DIR` được đặt tường minh và **tồn tại tệp đánh dấu `<AIBOSS_DATA_DIR>/approvals/.test-ledger` là tệp thường thật sự tại chính đường dẫn đó**, được kiểm bằng `os.lstat(marker_path)` + `stat.S_ISREG(st_link.st_mode)` kết hợp `os.open(marker_path, os.O_RDONLY | os.O_NOFOLLOW)` + `os.fstat(fd)` (mọi symlink đều bị từ chối và coi như không có tệp đánh dấu — F26).
  - Ngoài ra, ở tầng TypeScript (`src/lib/approvals-ledger.ts`), hàm `buildPythonCliEnv()` dựng môi trường theo danh sách trắng (`PATH`, `HOME`, `LANG`, `LC_*`, `TZ`, `NODE_ENV`, `AIBOSS_DATA_DIR`, `AIBOSS_OFFICE_ROOT`, `PYTHON*`) và **loại bỏ mọi biến `AIBOSS_TEST_*`** trừ khi `NODE_ENV === "test"`. Nhờ 2 tầng bảo vệ độc lập này (danh sách trắng env ở TS + tệp thường `.test-ledger` kiểm bằng `lstat`/`O_NOFOLLOW` ở Python), đường API thật và hook H4 trên sổ thật (`operations/data/approvals`) luôn giữ khoá `fcntl.flock` ngay cả khi môi trường máy chủ đặt `NODE_ENV=development` và rò các biến `AIBOSS_TEST_*`.
- **Rủi ro tồn dư khi bản ghi JSON cuối tệp đủ nội dung nhưng thiếu đúng 1 byte `\n` (F22):**
  - Bộ ghi `append_jsonl_safely` đòi hỏi bản ghi trên đĩa phải kết thúc bằng byte `b"\n"` (nếu thiếu byte `b"\n"` do lỗi I/O giữa chừng thì trả `status: "io_error"`, thoát mã `2`). Trong khi đó, bộ đọc `read_and_fold_ledger` tách theo `b"\n"` nên vẫn chấp nhận đoạn cuối tệp nếu bản thân đoạn đó đã là một đối tượng JSON hợp lệ trọn vẹn dù thiếu byte `\n` kết thúc.
  - **Hệ quả an toàn:** Nếu một lệnh `--consume` bị lỗi I/O đúng ở byte `\n` cuối cùng sau khi toàn bộ thân JSON của `claim` đã ghi xuống đĩa, caller nhận `io_error` (chưa nhận được `claimId`), và các lần `--consume` tiếp theo sẽ thấy trạng thái `"claimed"` (`exit 2`) chứ **tuyệt đối không bao giờ tiêu thụ hai lần (`approved` hai lần)**. Lần ghi hợp lệ tiếp theo vào sổ sẽ tự động điền `b"\n"` trước khi nối dòng mới nên cấu trúc tệp JSONL tự hồi phục.
  - **Cách xử lý vận hành:** Nếu một lượt `--consume` hiếm hoi gặp `io_error` đúng vào byte `\n` cuối khiến yêu cầu chuyển sang `claimed` mà tác nhân chưa kịp nhận `claimId`, người vận hành chỉ cần thực hiện lại yêu cầu mới và bấm duyệt lại (`Approve`) cho yêu cầu mới đó trên `/settings`.
- **Cách xoá sổ thử nghiệm:** Các ca kiểm thử luôn đặt `AIBOSS_DATA_DIR` trỏ vào thư mục tạm trong `/tmp/aiboss-test-approvals-*` (kèm tệp thường `.test-ledger`) và tự dọn sạch bằng `fs.rmSync(testDataDir, { recursive: true, force: true })` trong khối `finally`.

