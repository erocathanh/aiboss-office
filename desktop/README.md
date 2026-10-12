# Vỏ Desktop Electron cho AIBOSS Office

Tài liệu kỹ thuật nội bộ dành cho đội ngũ phát triển và vận hành `aiboss-office`.

---

## 1. Giới thiệu tổng quan

Vỏ desktop Electron (`desktop/`) đóng vai trò là lớp vỏ bao bọc ứng dụng (desktop shell), mang lại trải nghiệm bản địa (native app) trên macOS:
- **Cửa sổ chuẩn:** Kích thước mặc định 1280×800, giới hạn thu nhỏ tối thiểu 900×600, nạp trực tiếp giao diện văn phòng từ máy chủ HTTP nội bộ.
- **Khoá một thể hiện (Single Instance Lock):** Ngăn chặn người dùng mở nhiều cửa sổ trùng lặp. Khi kích hoạt lần hai, ứng dụng tự động đưa cửa sổ hiện tại lên tiêu điểm (focus).
- **Màn hình chờ (Splash Screen):** Nếu máy chủ chưa sẵn sàng, ứng dụng hiển thị màn hình chờ màu Navy/Gold thương hiệu và tự động khởi động dịch vụ nền, chờ tối đa 60 giây.
- **Biểu tượng thanh trạng thái (System Tray):** Đóng cửa sổ sẽ ẩn vào khay thay vì tắt hẳn ứng dụng; cho phép bật/tắt khởi động cùng hệ thống (Start at login), xem trạng thái máy chủ và số ghế đang chạy lượt.
- **Chặn chế độ ngủ (Power Save Blocker):** Tự động kích hoạt cơ chế `prevent-app-suspension` của hệ điều hành khi có ít nhất một ghế đang chạy tác vụ, và giải phóng khi hệ thống chuyển về trạng thái nghỉ (idle).
- **An toàn giao diện:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, giao tiếp bảo mật qua `preload.cjs`.

---

## 2. Cách chạy và phát triển

### 2.1. Cài đặt phụ thuộc
Tại thư mục gốc của kho:
```bash
pnpm install
```
Hoặc cài đặt riêng cho gói desktop:
```bash
pnpm --dir desktop install
```

### 2.2. Chạy ứng dụng
- **Chạy trực tiếp từ gốc kho (kết nối cổng mặc định 4330 hoặc đọc từ `config/office.json`):**
  ```bash
  pnpm desktop
  ```
- **Chỉ định cổng cụ thể qua cờ dòng lệnh:**
  ```bash
  pnpm desktop -- --port 4331
  ```
- **Chế độ phát triển (bật phím tắt mở DevTools `Cmd+Option+I`):**
  ```bash
  pnpm desktop -- --dev
  ```
- **Chụp ảnh tự động (phục vụ kiểm thử giao diện tự động):**
  ```bash
  pnpm desktop -- --screenshot path/to/output.png
  ```

---

## 3. Cách chạy bộ kiểm thử (Tests)

Bộ kiểm thử được viết bằng bộ chạy kiểm thử tích hợp sẵn của Node.js (`node:test`), không phụ thuộc môi trường đồ họa, chạy nhanh trong vài chục mili-giây:
```bash
pnpm test:desktop
```
Hoặc chạy trực tiếp trong thư mục `desktop/`:
```bash
pnpm --dir desktop test
```
Bao gồm các ca kiểm thử:
1. `config.test.cjs`: Kiểm tra độ ưu tiên phân giải cổng (Cờ dòng lệnh > Biến môi trường > Cấu hình `config/office.json` > Mặc định 4330).
2. `main.test.cjs`: Kiểm tra khoá đơn thể hiện (`requestSingleInstanceLock`) và cấu hình cửa sổ an toàn.
3. `server-manager.test.cjs`: Kiểm tra cơ chế thăm dò cổng HTTP và xử lý quá thời gian chờ.
4. `power.test.cjs`: Kiểm tra việc kích hoạt và hủy bỏ lệnh chặn ngủ (`powerSaveBlocker`) tương ứng với số ghế đang chạy.

---

## 4. Cách dừng và gỡ bỏ

### 4.1. Dừng ứng dụng
- Bấm tổ hợp phím `Command + Q` khi cửa sổ đang mở.
- Hoặc bấm chuột phải vào biểu tượng ứng dụng trên khay hệ thống (System Tray) và chọn **Quit AIBOSS Office**.

### 4.2. Gỡ bỏ cài đặt
1. Tắt tính năng tự khởi động (Start at login) trong menu khay hoặc cài đặt hệ điều hành.
2. Xoá tệp cấu hình lưu cục bộ tại `~/Library/Application Support/aiboss-office-desktop/`.
3. Xoá thư mục gói hoặc ứng dụng đã biên dịch.

---

## 5. Giới hạn hiện tại

1. **Chưa đóng gói tệp cài đặt (.dmg):** Hiện tại ứng dụng chạy trực tiếp qua môi trường runtime Electron cục bộ.
2. **Không nhúng WebContentsView / Playwright trong pha này:** Trình duyệt nội bộ hoạt động theo mô hình BrowserWindow kết nối máy chủ cục bộ; việc nhúng view tự động hóa được đưa vào lộ trình kế tiếp.
3. **Thẻ Desktop trên `/settings`:** Là thẻ chỉ đọc (read-only), hiển thị trạng thái kết nối của vỏ Electron và cấu hình tự chạy lúc đăng nhập.

---

## 6. Việc sau (Lộ trình phát triển tiếp theo)

1. Đóng gói tệp cài đặt macOS `.dmg` và `.app` qua `electron-builder`.
2. Ký mã ứng dụng (code signing) và công chứng (notarization) với Apple Developer ID để tránh cảnh báo Gatekeeper.
3. Tích hợp cơ chế tự động cập nhật (auto-updater) qua GitHub Releases.
4. Nghiên cứu tích hợp `WebContentsView` để điều khiển nhiều phiên agent trực tiếp bên trong cửa sổ desktop nếu có chỉ đạo từ PM.
