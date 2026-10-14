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

## 5. Sổ Duyệt Hành Động Dạng Máy Trạng Thái (Approval Ledger State Machine) — A-4 (v03)

Giải pháp A-4 biến sổ duyệt `operations/data/approvals/<YYYY-MM-DD>.jsonl` thành một máy trạng thái tất định nối trực tiếp từ yêu cầu của hook (`request`) → mã băm nội dung (`digest`) → quyết định của người duyệt (`decision`) → thực thi đơn lần (`execution`).

### 5.1. Định dạng Dữ liệu & Công thức `requestId` Tất định
Toàn bộ dữ liệu nằm chung trong tệp nhật ký theo ngày UTC `operations/data/approvals/<YYYY-MM-DD>.jsonl` (hoặc `<AIBOSS_DATA_DIR>/approvals/<YYYY-MM-DD>.jsonl` khi chạy kiểm thử cô lập), chỉ nối thêm (append-only), không bao giờ sửa đè dòng cũ:

1. **Dòng `request` (do hook `operations/hooks/guard_bulk_send.py` ghi):**
   - Các dòng do hook hiện hành ghi không có trường `type`:
     ```json
     {"ts":"2026-10-14T10:00:00Z","seat":"email-crm","tool":"Bash","host":"api.sendgrid.com","len":248,"sha256":"a1b2...","head60":"curl -X POST ...","reason":"external_host"}
     ```
   - Khi đọc sổ, mọi dòng không có `type` (hoặc có `type: "request"`) đều được chuẩn hoá thành bản ghi `type: "request"`.
   - **Công thức tính `requestId` tất định (dùng chung giữa máy chủ TypeScript và hook H4 của PCN):**
     ```text
     requestId = sha256_hex(ts + "|" + seat + "|" + tool + "|" + sha256)[0..15]
     ```
     Cụ thể: ghép chuỗi UTF-8 gồm 4 trường `ts`, `seat`, `tool`, `sha256` (chữ thường) phân cách bởi ký tự `|`, băm SHA-256 và lấy **16 ký tự hex chữ thường đầu tiên**.
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
   - `by`: `"owner"` hoặc `"localhost"` (xem quy tắc xác thực F7/F13 tại mục 5.4: khi `PHONGBAN_USER` và `PHONGBAN_PASS` đã được cấu hình, Basic Auth bắt buộc cả trên `localhost` / `127.0.0.1` và chỉ khớp mới ghi `by: "owner"`; chỉ khi biến môi trường xác thực chưa cấu hình thì loopback mới được miễn với `by: "localhost"`).
   - `note`: Tuỳ chọn; nếu có mặt trong payload (kể cả `note: null`), bắt buộc phải là kiểu `string` và có độ dài nguyên bản (trước khi `trim()`, đếm theo số điểm mã Unicode `Array.from(note).length` trong TS / `len(note)` trong Python) $\le 200$ ký tự. Nếu `note: null`, không phải chuỗi, hoặc vượt 200 điểm mã Unicode, API trả HTTP `400` ngay và ghi `0` byte vào sổ (F2b, F6).
   - `expiresAt`: Do máy chủ tự tính bằng `at + approvals.ttlMinutes` (60 phút trong `config/office.json`); API công khai không nhận `expiresAt` từ phía client (F8).
   - Mỗi `requestId` chỉ được quyết định đúng một lần; gọi quyết định lần thứ hai cho cùng `requestId` trả về HTTP `409 Conflict`.

3. **Dòng `claim` (do `approval_check.py --consume` hoặc hàm TypeScript `checkAndConsumeApproval` ghi nguyên tử dưới khoá trước khi thực thi hành động):**
   ```json
   {"type":"claim","requestId":"48b80909c1a4222b","claimId":"c9f1a2b3d4e5f601","seatId":"email-crm","tool":"Bash","digest":"a1b2...","at":"2026-10-14T10:02:30.000Z"}
   ```
   - Giữ chỗ sử dụng duy nhất (single-use reservation) cho `requestId` ngay trước khi cho phép lệnh chạy. Khi đã có `claim`, mọi tiến trình `approval_check.py --consume` hoặc `checkAndConsumeApproval` chạy song song hoặc chạy sau đều nhận trạng thái `"claimed"` và thoát mã `2` (0 dòng ghi thêm).

4. **Dòng `execution` (do `approval_mark.py` hoặc `recordApprovalExecution` ghi sau khi thực thi):**
   ```json
   {"type":"execution","requestId":"48b80909c1a4222b","claimId":"c9f1a2b3d4e5f601","runId":"run-20261014-0001","seatId":"email-crm","at":"2026-10-14T10:03:00.000Z","result":"executed","digest":"a1b2..."}
   ```
   - `result`: `"executed"` | `"failed"` | `"digest_mismatch"` | `"expired"`.
   - **Không bao giờ ghi bản ghi khi từ chối thực thi (F1a):** Khi yêu cầu chưa được duyệt (`pending`), đã từ chối (`denied`), chưa tới thời điểm hiệu lực (`not_yet_valid`), đã hết hạn (`expired`), sai `claimId` (`claim_mismatch`), hoặc đã thực thi trước đó (`already_executed` / `digest_mismatch`), cả `recordApprovalExecution` (TS) và `approval_mark.py` (Python) đều từ chối ngay và **ghi `0` dòng vào sổ** (kích thước tệp `.jsonl` không đổi từng byte).
   - Mọi bản ghi khi đọc/ghi và trả qua API đều đi qua bộ lọc whitelist trường nghiêm ngặt (`sanitizeApprovalRequestRecord`, `sanitizeApprovalDecisionRecord`, `sanitizeApprovalClaimRecord`, `sanitizeApprovalExecutionRecord`, `sanitizeApprovalItem`), đồng thời ánh xạ tự động cả 7 chuỗi `reason` tiếng Việt của hook H1 sang mã tiếng Anh chuẩn (`mcp_external_send`, `curl_config_flag`, `inbox_message_fetch`, `facebook_graph_messages`, `facebook_graph_batch`, `external_post_send`, `external_endpoint_send`).

### 5.2. Máy Trạng Thái Suy Ra Từ Sổ, Quy Tắc Đồng Nhất TS/Python & Khoá Nguyên Tử (Derived State Machine)
Trạng thái của mỗi yêu cầu được suy ra trực tiếp khi gấp (fold) các dòng trong sổ theo quy tắc đồng nhất tuyệt đối giữa TypeScript (`src/lib/approvals-ledger.ts`) và Python (`operations/scripts/approval_check.py`, `operations/scripts/approval_mark.py`):
- `requested` (hiển thị là `pending` trên bộ lọc API) → `approved` | `denied` → (`claim` nguyên tử) → `executed` | `failed` | `expired`.
- **Luật chuyển trạng thái & đồng nhất bộ gấp sổ (F2, F4, F5, F10, F11):**
  1. **Kiểm tra kiểu chuỗi nghiêm ngặt (`typeof === 'string'` / `isinstance(..., str)`) (F2a):** Toàn bộ các trường định danh và thời gian (`ts`, `seat`, `tool`, `sha256`, `requestId`, `seatId`, `digest`, `at`, `expiresAt`, `claimId`, `runId`, `note`) đều bắt buộc kiểm tra đúng kiểu chuỗi trước khi xử lý; tuyệt đối không ép kiểu ngầm (`str(...)`) từ số hay boolean.
  2. **Chuẩn thời gian ISO-8601 chỉ nhận chữ số ASCII & cắt phần nguyên mili-giây (F2c, F5):**
     - Cả TS và Python cùng dùng biểu thức chính quy chỉ nhận chữ số ASCII `[0-9]`:
       `^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$`
     - Từ chối hoàn toàn chữ số Unicode (ví dụ `٢٠٢٦`), giờ `24:00:00`, hoặc ngày không tồn tại trên lịch (`2026-02-30`).
     - Mọi mốc thời gian hợp lệ đều được cắt phần lẻ dưới mili-giây về **số nguyên mili-giây UTC** (`(us // 1000) * 1000`) trước mọi phép so sánh hay sắp xếp, và dùng bộ đếm thứ tự dòng hợp lệ (`order_counter`) đồng nhất giữa TS và Python.
  3. **Từ chối quyết định có `decision.at` ở tương lai (`not_yet_valid`, dung sai 0) (F11):**
     - Khi `nowMs < decision.atMs` (dung sai `0`), quyết định `approved` chưa có hiệu lực: `approval_check.py` (cả có và không có `--consume`), `approval_mark.py`, và các hàm TS (`checkAndConsumeApproval`, `findActiveApprovalForAction`, `recordApprovalExecution`) đều trả về `status: "not_yet_valid"`, thoát mã `2` và ghi `0` dòng vào sổ.
  4. **Chọn yêu cầu mới nhất của `(seat, tool, sha256)` TRƯỚC KHI đối chiếu `--request-id` (F4):**
     - Khi kiểm tra quyền cho hành động `(seat, tool, sha256)`, cả TS và Python đều tìm yêu cầu mới nhất của bộ ba `(seat, tool, sha256)` trước tiên.
     - Nếu người gọi truyền `--request-id <id>` (hoặc `requestId` trong `checkAndConsumeApproval`):
       + Nếu `<id>` trùng với yêu cầu mới nhất: tiếp tục kiểm tra trạng thái của yêu cầu đó.
       + Nếu `<id>` thuộc về một yêu cầu cũ hơn của cùng `(seat, tool)` (đã có yêu cầu mới hơn trên sổ): từ chối với `status: "superseded"`, thoát mã `2` và ghi `0` dòng.
       + Nếu `<id>` thuộc về yêu cầu mới nhất của `(seat, tool)` nhưng có `sha256` khác: từ chối với `status: "digest_mismatch"`, thoát mã `2`.
  5. **Khoá xuyên tiến trình và thu hồi khoá mồ côi nguyên tử qua `rename` (F1b):**
     - Khi tạo khoá `<approvals_dir>/.approvals.lock`, tiến trình ghi đầy đủ JSON `{ pid, createdAt }` vào tệp tạm `.approvals.lock.tmp-<pid>-<ns>` rồi xuất bản nguyên tử qua `link(tmpPath, lockPath)` (`O_EXCL`), bảo đảm `.approvals.lock` trên đĩa không bao giờ rỗng.
     - **Quy tắc xác định khoá mồ côi đồng nhất giữa TS và Python:**
       + Nếu đọc được `pid` nguyên dương trong `.approvals.lock`: khoá chỉ bị coi là mồ côi khi `!isPidAlive(pid)`. **Tuyệt đối không bao giờ thu hồi khoá của một PID đang sống (`isPidAlive(pid) === true`), kể cả khi đã giữ khoá quá 30 giây.**
       + Chỉ khi không đọc được `pid` hợp lệ (tệp hỏng): khoá mới được coi là mồ côi khi tuổi `mtime` vượt quá `30_000` ms (30 giây).
     - **Giao thức thu hồi nguyên tử:** Tiến trình thu hồi phải giữ khoá phụ `.approvals.reclaim.lock`, kiểm tra lại `.approvals.lock` (cùng `ino`, cùng nội dung, vẫn mồ côi), rồi thực hiện `rename(.approvals.lock -> .approvals.lock.stale-<pid>-<ns>)` trước khi xoá tệp stale. Nhờ đó hai tiến trình thu hồi cạnh tranh không bao giờ xoá nhầm khoá mới của tiến trình vừa thắng.
  6. **Ghi nối nguyên tử `O_APPEND` bảo vệ dòng của hook H1 (F3, F10):**
     - Cả `appendJsonlLineSafely` (TS) và `append_jsonl_safely` (Python) đều mở tệp `.jsonl` với cờ `O_CREAT | O_RDWR | O_APPEND`.
     - Nếu byte cuối hiện tại của tệp khác `\n` (`0x0a`), bộ ghi ghép `"\n"` vào đầu chuỗi JSON mới và thực hiện **đúng một lệnh `write` duy nhất không truyền offset** kèm `fsync`. Nhờ cờ `O_APPEND` ở tầng nhân hệ điều hành, ngay cả khi hook H1 (`guard_bulk_send.py`) nối thêm dòng `request` đồng thời mà không giữ `.approvals.lock`, dòng của TS/Python luôn được nối vào cuối tệp thật sự và không bao giờ ghi đè lên dòng của H1.

### 5.3. Hợp Đồng CLI Python & Hàm TypeScript Cho Hook H4/H5
Hai script CLI Python 3 chuẩn (`operations/scripts/`) và hàm TypeScript xuất khẩu từ `src/lib/approvals-ledger.ts` dùng chung khoá `.approvals.lock` và quy tắc gấp sổ:

1. **Kiểm tra và giữ chỗ nguyên tử trước khi thực thi (`operations/scripts/approval_check.py` & `checkAndConsumeApproval`):**
   ```bash
   # Giữ chỗ nguyên tử trước khi chạy lệnh (khuyến nghị cho H4):
   python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex> [--request-id <id>] --consume

   # Hoặc kiểm tra trạng thái không tiêu thụ:
   python3 operations/scripts/approval_check.py --seat <slug> --tool <tool> --sha256 <hex> [--request-id <id>]
   ```
   - Trong TypeScript (`src/lib/approvals-ledger.ts`):
     ```ts
     const res = checkAndConsumeApproval({ seat: 'email-crm', tool: 'Bash', sha256: '...', requestId: '...' });
     ```
   - Khi yêu cầu mới nhất của `(seat, tool, sha256)` đang `approved`, đã tới giờ hiệu lực (`now >= decision.at`), còn hạn (`now < decision.expiresAt`), chưa có `claim` và chưa có `execution`:
     - Nếu có `--consume` (hoặc gọi `checkAndConsumeApproval`): ghi nguyên tử dòng `claim` dưới khoá `.approvals.lock`, trả về `{"requestId": "<id>", "status": "approved", "expiresAt": "<ISO>", "claimId": "<claimId>"}` và thoát mã `0`. Khi hai tiến trình chạy song song, **chỉ đúng một tiến trình thoát `0`**, tiến trình còn lại nhận `status: "claimed"` và thoát mã `2`.
     - Nếu không có `--consume`: in ra `{"requestId": "<id>", "status": "approved", "expiresAt": "<ISO>"}` và thoát mã `0`.
   - Nếu `--request-id` trỏ tới yêu cầu cũ hơn của cùng `(seat, tool)`: trả `{"requestId": "<id>", "status": "superseded"}` và thoát mã `2` (0 dòng ghi).
   - Nếu `now < decision.at`: trả `{"requestId": "<id>", "status": "not_yet_valid"}` và thoát mã `2` (0 dòng ghi).
   - Nếu mã băm `--sha256` không khớp với yêu cầu: trả `{"requestId": "<id>", "status": "digest_mismatch"}` và thoát mã `2` (0 dòng ghi).
   - Mọi trường hợp khác (`pending`, `denied`, `expired`, `claimed`, `executed`, `failed`, `not_found`): in ra JSON `{"status": "<lý do>", ...}` và thoát mã `2`.

2. **Đánh dấu kết quả sau khi thực thi (`operations/scripts/approval_mark.py` & `recordApprovalExecution`):**
   ```bash
   python3 operations/scripts/approval_mark.py --request-id <id> --result <executed|failed> [--claim-id <claimId>] [--run-id <runId>]
   ```
   - Chỉ ghi dòng `execution` khi `requestId` có `decision: "approved"` hợp lệ, `now >= decision.at` và chưa hết hạn (hoặc có `claim` hợp lệ khớp `--claim-id`).
   - Nếu yêu cầu đang `pending`, `denied`, `not_yet_valid`, `expired`, `already_executed`, hoặc `claim_mismatch`, script thoát mã `2` (hoặc ném `Error` khi gọi `recordApprovalExecution({ ..., throwOnError: true })` trong TS) và **ghi `0` byte vào sổ**.
   - **Idempotent:** Nếu gọi lại với cùng `requestId`, cùng `result` và khớp `claimId`, script trả về `{"requestId": "<id>", "status": "<result>", "idempotent": true}` và thoát mã `0` mà không ghi trùng dòng thứ hai.

### 5.4. API, Quy Tắc Xác Thực (F13) & Giao Diện `/settings`
- `GET /api/approvals?status=pending|approved|denied|executed|expired&limit=50`: trả danh sách yêu cầu đã qua whitelist kèm tổng số bản ghi khớp.
- `POST /api/approvals/<requestId>/decision`:
  - **Quy tắc xác thực (F7, F13):**
    + Khi `PHONGBAN_USER` và `PHONGBAN_PASS` đã được cấu hình trên máy chủ: **bắt buộc xác thực HTTP Basic Auth trên mọi yêu cầu, kể cả khi `Host` là `localhost` hoặc `127.0.0.1`**. Thiếu header `Authorization` hoặc sai thông tin đăng nhập đều trả về HTTP `401 Unauthorized`; khi khớp thông tin đăng nhập thì ghi nhận `by: "owner"`.
    + Chỉ khi `PHONGBAN_USER` / `PHONGBAN_PASS` **chưa được cấu hình** (môi trường phát triển nội bộ): yêu cầu từ loopback thực sự (`localhost`, `127.0.0.1`, `[::1]`) mới được chấp nhận với `by: "localhost"` (không bao giờ là `"owner"`), còn yêu cầu từ tên miền khác (kể cả `localhost.example.com`) bị từ chối với HTTP `503`.
  - Chỉ nhận `{"decision": "approved" | "denied", "note"?: string}`; trả `400` (0 dòng ghi sổ) nếu `decision` sai, `note: null`, `note` không phải chuỗi, hoặc `note` vượt quá 200 điểm mã Unicode; trả `404` nếu `requestId` không tồn tại; trả `409` nếu `requestId` đã được quyết định trước đó.
- Giao diện `/settings` hiển thị thẻ **Approvals** hoàn toàn bằng tiếng Anh gồm hai khu vực: **Pending Requests** (hiển thị `seat`, `tool`, `host`, `head60`, `reason` đã ánh xạ sang tiếng Anh, tuổi, nút `Approve` / `Deny`) và **Decided Ledger** (hiển thị trạng thái thật suy từ sổ kèm `requestId`).

### 5.5. Công Tắc Đối Chứng Dương, Giới Hạn Đã Biết & Cách Dọn Sổ Thử Nghiệm
- **Công tắc đối chứng dương (`AIBOSS_TEST_DISABLE_APPROVAL_LOCK=1`):** Dùng để chứng minh hiệu lực của khoá `.approvals.lock` trong Ca 15 (khi bật biến này ở môi trường test, hai tiến trình `approval_check.py --consume` chạy song song sẽ cùng thoát `0` và làm Ca 15 ĐỎ; khi để mặc định thì đúng 1 tiến trình thoát `0`, 1 tiến trình thoát `2` và Ca 15 XANH). Công tắc này luôn bị vô hiệu hoá hoàn toàn khi `NODE_ENV === 'production'`.
- **Giới hạn cách ly người dùng hệ điều hành:** Các ghế hiện chạy dưới cùng tài khoản người dùng hệ điều hành với máy chủ, nên tệp JSONL trên đĩa chưa tách quyền ghi ở tầng OS kernel; việc chặn ghế tự ghi trực tiếp vào thư mục sổ thuộc phạm vi các hook bảo vệ của PCN (H4/H5). Ở tầng ứng dụng, sổ tuân thủ nghiêm ngặt cơ chế khoá `.approvals.lock`, ghi nối nguyên tử `O_APPEND`, kiểm tra ranh giới dòng JSONL và whitelist trường.
- **Cách xoá sổ thử nghiệm:** Các ca kiểm thử luôn đặt biến môi trường `AIBOSS_DATA_DIR` trỏ vào thư mục tạm trong `/tmp/aiboss-test-approvals-*` và tự dọn sạch bằng `fs.rmSync(testDataDir, { recursive: true, force: true })` trong khối `finally`. Không bao giờ xoá hoặc ghi thử vào `operations/data/approvals/` của máy chủ đang vận hành.




