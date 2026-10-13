# Tài Liệu Vận Hành AIBOSS Office (Operations)

Tài liệu hướng dẫn vận hành dịch vụ thường trú, bộ lập lịch máy chủ (runner) và hệ thống sổ ghế cho đội ngũ kỹ thuật.

---

## 1. Dịch Vụ Thường Trú (LaunchAgent Service)

AIBOSS Office được thiết kế để chạy như một daemon nền thường trú trên macOS qua `launchd`, đảm bảo máy chủ luôn sẵn sàng phục vụ và tự phục hồi khi gặp sự cố.

### Cấu trúc và tệp tin
- **Khuôn mẫu plist:** `operations/launchd/com.aiboss.office.plist`
- **Mục tiêu cài đặt:** `~/Library/LaunchAgents/com.aiboss.office.plist` (hoặc `com.aiboss.office.dev.plist` cho bản thử nghiệm).
- **Thư mục nhật ký:** `operations/data/logs/office-service.out.log` và `office-service.err.log`.

### Các lệnh vận hành
1. **Cài đặt và khởi chạy dịch vụ production:**
   ```bash
   ./operations/scripts/service-install.sh
   ```
   *Mặc định sử dụng cổng được khai báo trong `config/office.json` (`service.port: 4330`).*

2. **Cài đặt chế độ thử nghiệm (dev):**
   ```bash
   ./operations/scripts/service-install.sh --dev --port 4331
   ```
   *Sử dụng nhãn `com.aiboss.office.dev` trên cổng 4331, không ảnh hưởng đến bản 4330.*

3. **Kiểm tra trạng thái dịch vụ:**
   ```bash
   ./operations/scripts/service-status.sh
   # hoặc cho bản dev:
   ./operations/scripts/service-status.sh --dev
   ```

4. **Gỡ bỏ dịch vụ:**
   ```bash
   ./operations/scripts/service-uninstall.sh
   # hoặc cho bản dev:
   ./operations/scripts/service-uninstall.sh --dev
   ```

### Đặc tính kỹ thuật
- `RunAtLoad: true`: Tự động khởi động cùng người dùng.
- `KeepAlive: true`: Tự động khởi động lại tiến trình trong vòng $\le 10$ giây nếu bị tắt bất ngờ hoặc crash.
- `PATH`: Tự động nhận diện và thiết lập đường dẫn đến Node.js và pnpm của môi trường hiện tại.

---

## 2. Bộ Lập Lịch Máy Chủ (Server Runner)

Bộ lập lịch máy chủ `src/lib/office-runner.ts` giúp hệ thống tự động kiểm tra hàng đợi đánh thức (`kho-danh-thuc`) và kích hoạt các lượt chạy của ghế mà **không phụ thuộc vào trình duyệt của người dùng**.

### Kiến trúc một động cơ duy nhất (Single Engine Architecture)
Hệ thống tuân thủ nguyên tắc: **one engine: office-runner; may-chay-nen (inherited from app-chat) stays disabled**.
- Toàn bộ cơ chế rút mẩu hàng đợi chuông do `src/lib/office-runner.ts` đảm nhiệm độc quyền.
- Bộ chạy nền cũ kế thừa từ app-chat (`src/lib/may-chay-nen.ts`) được vô hiệu hóa hoàn toàn để chống xung đột chạy trùng mẩu giữa hai động cơ.
- Cấu hình LaunchAgent (`com.aiboss.office.plist`) và script cài đặt (`service-install.sh`) tuyệt đối không đặt cờ `CHAY_NEN`.
- Nếu cờ `CHAY_NEN=1` được đặt thủ công trong môi trường, máy chủ sẽ in dòng cảnh báo: `[chay-nen] CHAY_NEN ignored: office-runner is the single engine` và bỏ qua.

### Nguyên lý hoạt động
- Khởi chạy một lần duy nhất lúc máy chủ nạp qua `src/instrumentation.ts` (Next.js Node runtime) và được bảo hiểm bổ sung tại `src/lib/khoi-dong-nen.ts`.
- Định kỳ mỗi `runner.interval_s` (mặc định 5 giây), runner quét các yêu cầu chuông có trạng thái `cho` và còn hạn.
- Với mỗi yêu cầu hợp lệ:
  1. Kiểm tra giới hạn song song `max_parallel` (mặc định 2).
  2. Kiểm tra xung đột ghế: một ghế chỉ chạy tối đa 1 lượt tại một thời điểm.
  3. Kiểm tra khóa terminal: nếu ghế đang mở trong terminal (`isSeatHeldByTerminal`), runner sẽ ghi log `skipped: terminal` và nhường quyền.
  4. Tiếp nhận atomic qua `nhanYeuCau` và xác nhận bàn giao `xacNhanDaGiao`.
  5. Gọi lõi `chayMotLuot` trong nền. Kết quả câu trả lời được ghi trực tiếp vào tệp phiên `.jsonl` của Claude Code.
  6. Tự động ghi nhận mốc kết thúc (`ghiMocKetThuc`) để đồng bộ trạng thái bận/rảnh.

### Cấu hình (`config/office.json`)
```json
{
  "runner": {
    "enabled": true,
    "interval_s": 5,
    "max_parallel": 2
  }
}
```

### Công tắc tắt khẩn cấp (Kill-Switch)
- Tạo tệp rỗng `operations/data/runner.off` để tạm dừng runner ngay lập tức:
  ```bash
  touch operations/data/runner.off
  ```
- Xóa tệp để runner hoạt động trở lại:
  ```bash
  rm -f operations/data/runner.off
  ```
- Hoặc đặt `"enabled": false` trong `config/office.json`.

### Nhật ký hoạt động
Toàn bộ chu kỳ chạy và sự kiện bỏ qua được ghi nhận tại `operations/data/runner.log.jsonl`:
```json
{"timestamp":"2026-10-12T13:10:48.089Z","seat":"marketing-lead","bell_id":"8a2914e9...","event":"start","start":"2026-10-12T13:10:48.089Z"}
{"timestamp":"2026-10-12T13:10:55.270Z","seat":"marketing-lead","bell_id":"8a2914e9...","event":"end","duration_ms":7181,"exit":0,"session_id":"a6551711..."}
{"timestamp":"2026-10-12T13:11:22.142Z","seat":"marketing-lead","bell_id":"c42bc8fc...","event":"skipped","skipped_reason":"terminal"}
```

---

## 3. Sổ Ghế & Chống Xung Đột (Seat Ledger)

Tuân thủ chuẩn khuôn trường chính thức của PCN (`KHUON-TRUONG-SEAT-ACTIVE_v01_20261012.md`), hệ thống duy trì sổ ghế thời gian thực nhằm chống xung đột ghi đè giữa ứng dụng giao diện, dịch vụ nền và phiên terminal.

### Cấu trúc dữ liệu
- **Tệp sổ ghế:** `departments/<phong>/seats/<seat>/seat-active.json` (và đồng bộ mirror tại `operations/data/seats/<seat>/seat-active.json`).
- **Nhật ký ca làm:** `seat-log.jsonl` (lưu trữ lịch sử các phiên, PID và thời điểm kết thúc).
- Cả hai tệp trên đều thuộc runtime state và được cấu hình trong `.gitignore`.

### Định dạng `seat-active.json` (Schema v1)
```json
{
  "schema": 1,
  "seat": "marketing-lead",
  "tool": "terminal",
  "app": "aiboss-office",
  "session_id": "a6551711-33ff-49d9-9195-fe90d61c5251",
  "pid": 65639,
  "cwd": "/Users/erocathanh/Projects/aiboss-office/departments/marketing/seats/marketing-lead",
  "host": "Mac",
  "started_at": "2026-10-12T14:00:00.000Z",
  "last_write": "2026-10-12T14:05:00.000Z",
  "resume_cmd": "cd '/Users/erocathanh/Projects/aiboss-office/departments/marketing/seats/marketing-lead' && claude --resume a6551711-33ff-49d9-9195-fe90d61c5251"
}
```

### Công cụ CLI quản lý ghế
1. **Dùng Bash Script:**
   ```bash
   # Chiếm giữ ghế
   ./operations/scripts/seat-claim.sh <seat> [tool] [session_id] [pid]

   # Giải phóng ghế
   ./operations/scripts/seat-release.sh <seat> [session_id]
   ```
2. **Dùng Python CLI:**
   ```bash
   # Chiếm giữ ghế
   python3 operations/scripts/seat.py claim <seat> --tool terminal --session <session_id> [--pid <pid>]

   # Giải phóng ghế
   python3 operations/scripts/seat.py release <seat>

   # Xem trạng thái ghế
   python3 operations/scripts/seat.py show <seat>
   ```

### Quy ước mã thoát (Exit Codes)
- `0`: Thành công.
- `2`: Sai tham số dòng lệnh.
- `3`: **Xung đột** — Ghế đang bị chiếm giữ bởi một tiến trình còn sống (`kill -0 pid`) với mã phiên khác.
- `4`: Trạng thái không đo lường được (lỗi I/O, tệp hỏng).

### Cơ chế chống xung đột
- Tuyệt đối không cho phép 2 tiến trình cùng ghi vào một phiên của một ghế.
- Khi người dùng hoặc script mở ghế trong terminal:
  - API `/api/chat` và runner tự động kiểm tra `isSeatHeldByTerminal(seat)`.
  - Nếu PID còn sống, API trả về HTTP `409 Conflict` (`skipped: terminal`), ngăn chặn ghi đè.
  - Giao diện web hiển thị huy hiệu amber «Seat open in terminal».
  - Người dùng có thể bấm nút «Resume in terminal» ở header thẻ hoặc dropdown menu để sao chép lệnh mở lại phiên trong terminal.
