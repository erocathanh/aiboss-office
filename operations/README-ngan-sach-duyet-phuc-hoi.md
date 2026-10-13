# Sổ Ngân Sách Giữ Chỗ, Sổ Duyệt Hành Động & Phục Hồi Lượt Chạy — AIBOSS Office

> Tài liệu kỹ thuật & vận hành cho đội ngũ AIBOSS Office.  
> Triển khai theo đề A-3, A-4, A-5 (học từ Paperclip MIT `2b8da4a` và OpenShell Apache-2.0).

---

## 1. A-3 — Ngân Sách Giữ Chỗ Trước Khi Chạy (Budget Hold) & Trần Chi (Daily Cap)

### 1.1. Mục đích & Nguyên lý
Nhằm ngăn chặn tình trạng một ghế AI hoặc toàn thể văn phòng tiêu tốn ngân sách ngoài tầm kiểm soát, hệ thống áp dụng cơ chế **giữ chỗ trước khi chạy (budget hold)**:
- **Ước lượng trước lượt (Pre-run estimate)**:
  - Tính trung bình `costNanodollars` của tối đa 5 lượt chạy gần nhất đã định giá (`priced: true`) của ghế đó trong vòng 7 ngày qua.
  - Nếu ghế chưa có lượt chạy nào trong 7 ngày, sử dụng giá trị mặc định cấu hình tại `config/office.json` (`defaultRunEstimateNanodollars`, mặc định `"700000000"` = 0.70 USD).
- **So sánh trần chi (Cap check)**:
  - Tổng cam kết = `spentToday` (đã tiêu hôm nay) + `unpricedEstimate` (ước lượng lượt chưa có giá) + `holdsActive` (các lượt đang chạy giữ chỗ) + `estimate` (lượt sắp chạy).
  - So sánh lần lượt với trần ghế (`seats.<slug>.dailyCapNanodollars`) và trần văn phòng (`office.dailyCapNanodollars`).
  - Nếu thiếu trần (`null` hoặc không cấu hình): coi là **không giới hạn (`unlimited`)**, không chặn và giao diện hiển thị «No cap set».
  - Nếu vượt trần và `hardStop: true`: yêu cầu chuyển sang trạng thái `skipped` với lý do `budget_exceeded`, ghi một dòng `reject` vào sổ ngân sách và không kích hoạt chạy.
  - Nếu vượt trần và `hardStop: false` (soft stop): vẫn cho phép chạy nhưng đánh dấu `overBudget: true` trên bản ghi hold và hiển thị cảnh báo.

---

### 1.2. Cấu trúc Sổ Ngân Sách: `operations/data/budget/<YYYY-MM-DD>.jsonl`

Tệp được lưu trữ dạng JSON Lines nối đuôi (append-only), phân vùng theo ngày UTC. Gồm 4 loại bản ghi:

#### 1. Bản ghi Giữ chỗ (`hold`):
Ghi ngay khi runner nhận việc (claim) và chuẩn bị chạy.
```json
{
  "type": "hold",
  "holdId": "hold-20261013-183000-a1b2c3",
  "wakeId": "wake-20261013-182959-d4e5f6",
  "seatId": "marketing-lead",
  "amountNanodollars": "600000000",
  "basis": "estimate:last5",
  "overBudget": false,
  "ts": "2026-10-13T18:30:00.123Z"
}
```

#### 2. Bản ghi Quyết toán (`settle`):
Ghi khi lượt chạy hoàn tất và chi phí thực tế đã được xác định (hoặc được bù trong nhịp đối soát chi phí pending).
```json
{
  "type": "settle",
  "holdId": "hold-20261013-183000-a1b2c3",
  "runId": "run-20261013-183000-789abc",
  "actualNanodollars": "580000000",
  "priced": true,
  "ts": "2026-10-13T18:30:06.456Z"
}
```
*Lưu ý tính bất biến (Idempotency)*: Mỗi `holdId` chỉ được settle hoặc release đúng một lần. Gọi `settleHold` nhiều lần sẽ không sinh thêm dòng trên đĩa.

#### 3. Bản ghi Giải phóng (`release`):
Ghi khi một lượt chạy bị lỗi không sinh receipt, lượt bị mồ côi (`orphaned`), hoặc yêu cầu hết hạn trong hàng đợi (`expired`).
```json
{
  "type": "release",
  "holdId": "hold-20261013-183000-a1b2c3",
  "reason": "orphaned",
  "ts": "2026-10-13T18:35:00.000Z"
}
```

#### 4. Bản ghi Từ chối (`reject`):
Ghi khi lượt chạy bị từ chối do vượt trần ngân sách.
```json
{
  "type": "reject",
  "wakeId": "wake-20261013-182959-d4e5f6",
  "seatId": "marketing-lead",
  "scope": "seat",
  "capNanodollars": "500000000",
  "spentNanodollars": "450000000",
  "heldNanodollars": "0",
  "estimateNanodollars": "600000000",
  "ts": "2026-10-13T18:30:00.050Z"
}
```

---

### 1.3. Giao diện Lập trình API: `GET /api/budget`

- **Endpoint**: `GET /api/budget?seat=<slug>`
  - Nếu truyền `seat=<slug>`: Trả về trạng thái ngân sách của ghế tương ứng.
  - Nếu không truyền tham số: Trả về trạng thái ngân sách tổng hợp toàn bộ văn phòng (`office`).
- **Phản hồi mẫu**:
```json
{
  "seat": "marketing-lead",
  "capNanodollars": "10000000000",
  "spentNanodollars": "1450000000",
  "heldNanodollars": "700000000",
  "unpricedRuns": 0,
  "remainingNanodollars": "7850000000",
  "state": "ok",
  "hardStop": true
}
```
- **Các trạng thái (`state`)**:
  - `unlimited`: Không cấu hình trần chi (`capNanodollars: null`).
  - `ok`: Tổng cam kết $\le 80\%$ trần chi.
  - `warning`: Tổng cam kết $> 80\%$ trần chi.
  - `exceeded`: Tổng cam kết $> 100\%$ trần chi.

---

### 1.4. Giao diện Quản trị: Khối «Budget Today» trên `/settings`
- Khối hiển thị tại trang `/settings` bao gồm:
  - Banner tổng hợp trần văn phòng và số dư còn lại (`Office Total Capacity`).
  - Mỗi ghế một dòng hiển thị thanh phần trăm và số đo (`Spent` · `Held` / `Cap`).
  - Khi ghế hoặc văn phòng ở trạng thái `exceeded`, thanh tiến trình và nhãn được tô đỏ cảnh báo rõ ràng.
- Giao diện 100% tiếng Anh, tuân thủ nghiêm ngặt quy định không dùng từ cấm và không chứa chữ tiếng Việt trên HTML phục vụ.
