# Sổ Ngân Sách Giữ Chỗ, Sổ Duyệt Hành Động & Phục Hồi Lượt Chạy — AIBOSS Office

> Tài liệu kỹ thuật & vận hành cho đội ngũ AIBOSS Office.  
> Triển khai theo đề A-3, A-4, A-5 (học từ Paperclip MIT `2b8da4a` và OpenShell Apache-2.0).

---

## 1. A-3 — Ngân Sách Giữ Chỗ Trước Khi Chạy (Budget Hold) & Trần Chi (Daily Cap)

### 1.1. Mục đích & Nguyên lý
Nhằm ngăn chặn tình trạng một ghế AI hoặc toàn thể văn phòng tiêu tốn ngân sách ngoài tầm kiểm soát, hệ thống áp dụng cơ chế **giữ chỗ trước khi chạy (budget hold)**:
- **Ước lượng trước lượt (Pre-run estimate)**:
  - Tính trung bình `costNanodollars` của tối đa 5 lượt chạy gần nhất đã định giá (`priced: true`) của ghế đó trong vòng 7 ngày qua. Quét giới hạn theo ngày (không quét toàn bộ lịch sử).
  - Nếu ghế chưa có lượt chạy nào trong 7 ngày, sử dụng giá trị mặc định cấu hình tại `config/office.json` (`defaultRunEstimateNanodollars`, mặc định `"700000000"` = 0.70 USD).
- **So sánh trần chi (Cap check)**:
  - Tổng cam kết = `spentToday` (đã tiêu hôm nay) + `unpricedEstimate` (ước lượng lượt chưa có giá) + `holdsActive` (các lượt đang chạy giữ chỗ) + `estimate` (lượt sắp chạy).
  - Hợp nhất (fold) receipt theo cặp `(runId, model)` giống `costs-ledger.ts`, giữ lượt chạy ở trạng thái `unpriced` khi có bất kỳ model nào chưa có giá để bảo toàn phần dự phòng chi phí.
  - So sánh lần lượt với trần ghế (`seats.<slug>.dailyCapNanodollars`) và trần văn phòng (`office.dailyCapNanodollars`).
  - Nếu thiếu trần (`null` hoặc không cấu hình): coi là **không giới hạn (`unlimited`)**, không chặn và giao diện hiển thị «No cap set».
  - Xác thực nghiêm ngặt giá trị cấu hình: chỉ chấp nhận chuỗi số nguyên không âm (`/^[0-9]+$/`), phân biệt rõ `null` với dữ liệu rác. Dữ liệu rác tự động rơi về fallback an toàn.
  - Nếu vượt trần và `hardStop: true`: yêu cầu chuyển sang trạng thái `skipped` với lý do `budget_exceeded` (thông qua `boYeuCau` được ánh xạ tường minh sang `skipped`, không bị gán nhầm thành `expired`), ghi một dòng `reject` vào sổ ngân sách và không kích hoạt chạy.
  - Nếu vượt trần và `hardStop: false` (soft stop): vẫn cho phép chạy nhưng đánh dấu `overBudget: true` trên bản ghi hold và hiển thị cảnh báo.

---

### 1.2. Khóa Liên Tiến Trình & Giao Dịch Giữ Chỗ Nguyên Tử

Nhằm bảo đảm tính toàn vẹn khi nhiều tiến trình runner cùng hoạt động:
- **Khóa liên tiến trình (`withBudgetLock`)**: Sử dụng cơ chế tạo thư mục nguyên tử `operations/data/budget/.budget.lock` ở cấp hệ điều hành, hỗ trợ re-entrancy trong cùng tiến trình và tự động dọn dẹp khóa cũ (stale lock) nếu tiến trình nắm giữ gặp sự cố.
- **Giao dịch kiểm trần + tạo hold nguyên tử (`checkAdmissionAndRecordHold`)**:
  Việc kiểm tra hạn mức ngân sách và ghi dòng `hold` được thực hiện trọn vẹn trong một phiên khóa chung. Hai tiến trình runner đồng thời không thể cùng vượt trần do cùng thấy số dư cũ.
- **Phục hồi sự cố claim (F1)**:
  Lệnh `checkAdmissionAndRecordHold` được đặt bên trong khối phục hồi `try / catch` của runner. Nếu ghi hold thất bại hoặc phát sinh lỗi khởi tạo, ghế lập tức được dọn sạch khỏi `activeSeats` và yêu cầu được trả về hàng đợi an toàn (`traVeHangDoi`), triệt tiêu rủi ro kẹt ghế (`seat_busy`).

---

### 1.3. Cấu trúc Sổ Ngân Sách: `operations/data/budget/<YYYY-MM-DD>.jsonl`

Tệp được lưu trữ dạng JSON Lines nối đuôi (append-only), phân vùng theo ngày UTC.
**Nguyên tắc Whitelist Schema**: Mọi bản ghi trước khi ghi xuống đĩa đều được dựng lại tường minh theo whitelist schema tương ứng, tuyệt đối không spread object và không rò rỉ prompt, result hoặc PII.

#### 1. Bản ghi Giữ chỗ (`hold`):
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
*Lưu ý*: `priced` chỉ mang giá trị `true` khi toàn bộ receipts của lượt chạy đã được định giá và có `costNanodollars` hợp lệ; nếu còn receipt unpriced, `priced` được ghi nhận là `false`. Mỗi `holdId` chỉ được settle hoặc release đúng một lần (idempotent dưới khóa liên tiến trình).

#### 3. Bản ghi Giải phóng (`release`):
Ghi khi lượt chạy bị lỗi không sinh receipt (`failed_no_receipt`), lượt bị mồ côi (`orphaned`), hoặc yêu cầu giữ chỗ quá hạn không có lượt chạy tương ứng (`expired`).
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
  "reason": "budget_exceeded",
  "ts": "2026-10-13T18:30:00.050Z"
}
```

---

### 1.4. Đối Soát Vòng Đời Giữ Chỗ Mở (`reconcileOpenHolds`)
Quy trình đối soát vòng đời hold mở được tích hợp tự động vào chu kỳ dọn dẹp runner (`startOfficeRunner`, `recoverOrphanedRuns`, `reconcilePendingCosts`):
1. **Lượt chạy đã hoàn tất (finished) có receipt**: Tự động settle hold với chi phí thực tế và trạng thái định giá chính xác, tách rời khỏi cờ `costStatus: pending`.
2. **Lượt chạy thất bại hoặc kết thúc không có receipt**: Tự động giải phóng hold với lý do `failed_no_receipt`.
3. **Lượt chạy mồ côi (orphaned)**: Giải phóng hold với lý do `orphaned`.
4. **Hold mở quá thời hạn (mặc định 10 phút) không có lượt chạy**: Tự động giải phóng với lý do `expired`.

---

### 1.5. Giao diện Lập trình API: `GET /api/budget`

- **Endpoint**: `GET /api/budget?seat=<slug>`
  - Nếu truyền `seat=<slug>`: Kiểm tra danh mục ghế hợp lệ trong văn phòng (`data/seats.json` và `config.budget.seats`). Nếu ghế không tồn tại, trả về HTTP 404 `{ error: "unknown_seat", seat }`.
  - Nếu không truyền tham số: Trả về trạng thái ngân sách tổng hợp toàn bộ văn phòng (`office`).
- **Phản hồi mẫu**:
```json
{
  "seat": "marketing-lead",
  "capNanodollars": "10000000000",
  "spentNanodollars": "1450000000",
  "heldNanodollars": "700000000",
  "unpricedRuns": 1,
  "unpricedEstimateNanodollars": "700000000",
  "committedNanodollars": "2850000000",
  "remainingNanodollars": "7150000000",
  "state": "ok",
  "hardStop": true
}
```
- **Các trạng thái (`state`)**:
  - `unlimited`: Không cấu hình trần chi (`capNanodollars: null`).
  - `ok`: Tổng cam kết $\le 80\%$ trần chi.
  - `warning`: Tổng cam kết $> 80\%$ trần chi (biên nghiêm ngặt $>80\%$).
  - `exceeded`: Tổng cam kết $> 100\%$ trần chi.

---

### 1.6. Giao diện Quản trị: Khối «Budget Today» trên `/settings`
- Khối hiển thị tại trang `/settings` bao gồm:
  - Banner tổng hợp trần văn phòng và số dư còn lại (`Office Total Capacity`), có số chi tiêu (`Spent`), giữ chỗ (`Held`), và ước lượng đang chờ (`Pending`).
  - Mỗi ghế một dòng hiển thị thanh phần trăm và số đo đồng bộ với `committedNanodollars` từ API (`Spent` · `Held` · `Pending` / `Cap`).
  - Khi ghế hoặc văn phòng ở trạng thái `exceeded`, thanh tiến trình và nhãn được tô đỏ cảnh báo rõ ràng.
- Giao diện 100% tiếng Anh, tuân thủ nghiêm ngặt quy định không dùng từ cấm và không chứa chữ tiếng Việt trên HTML phục vụ.
