# Sổ Lượt Chạy (Wake → Run → Receipt) & Sổ Chi Phí Theo Ghế — AIBOSS Office

> Tài liệu kỹ thuật & vận hành cho đội ngũ AIBOSS Office.  
> Triển khai theo đề A-1 & A-2 (Pha 5A), tham chiếu kiến trúc Paperclip (MIT, commit `2b8da4a`).

---

## 1. Bốn khái niệm tách bạch (Cốt lõi tài chính AI)

Trong hệ thống AIBOSS Office, chi phí không được gộp chung hay suy diễn mập mờ mà được phân định rõ thành 4 lớp:

| Khái niệm | Định nghĩa | Đơn vị lưu trữ & Nguồn | Quyền hạn & Tính chất |
|---|---|---|---|
| **1. Usage (Mức dùng)** | Số lượng token thật mà model đã tiêu thụ trong một lượt (`input`, `cached-read`, `cache-creation`, `output`). | Token (số nguyên). Lấy trực tiếp từ sự kiện stream-json của Claude Code. | Khách quan, đo đếm được tuyệt đối từ máy chủ Anthropic. |
| **2. Chi phí ước tính (Estimated Cost)** | Giá trị quy đổi từ usage hoặc trường `total_cost_usd` của provider ở thời điểm chạy. | **Số nguyên nanodollar** (`10^9` units per USD, scale `10^7` per cent). Trích từ receipt hoặc null. | Chỉ để theo dõi nội bộ, tuyệt đối không dùng số thực float, không tự bịa giá khi provider thiếu báo giá (`priced: false`). |
| **3. Hoá đơn provider (Provider Bill)** | Hoá đơn thanh toán thực tế cuối tháng từ Anthropic / AWS Bedrock / GCP Vertex. | USD thực tế trên thẻ / tài khoản thanh toán. | Có thể chênh lệch nhẹ so với ước tính do chính sách chiết khấu, batching, hoặc tier giá theo tháng. |
| **4. Giá bán C5 (Commercial Pricing)** | Giá gói dịch vụ hoặc credit tính cho khách hàng sử dụng dịch vụ AIBOSS Office. | VND / USD theo hợp đồng hoặc bảng giá sản phẩm C5. | Do ban giám đốc & kinh doanh quyết định, đã gồm biên lợi nhuận, chi phí máy chủ, hạ tầng vận hành. |

---

## 2. Cấu trúc và cách đọc hai sổ (`operations/data/`)

Dữ liệu được tổ chức dưới dạng **JSON Lines (append-only)**, mỗi ngày một tệp, không bao giờ sửa đè dòng cũ.

### 2.1. Sổ lượt chạy: `operations/data/runs/<YYYY-MM-DD>.jsonl`

Theo dõi toàn bộ vòng đời từ lúc nhận yêu cầu (wake) tới lúc hoàn tất lượt chạy (run).

#### Bản ghi loại `wake`:
```json
{
  "type": "wake",
  "wakeId": "wake-20261013-071200-a1b2c3",
  "seatId": "marketing-lead",
  "source": "bell",
  "requestedAt": "2026-10-13T07:12:00.123Z",
  "idempotencyKey": "9f83...32hex",
  "status": "claimed",
  "claimedAt": "2026-10-13T07:12:01.456Z",
  "runId": "run-20261013-071201-d4e5f6"
}
```
- `status`:
  - `queued`: Đã tiếp nhận vào hàng đợi.
  - `claimed`: Động cơ máy chủ (`office-runner`) đã nhận xử lý và gắn `runId`.
  - `skipped`: Bỏ qua do trùng lặp idempotency trong 60 giây, ghế bận, hoặc không tìm thấy ghế.
  - `expired`: Yêu cầu nằm trong hàng đợi quá 10 phút chưa được xử lý.

#### Bản ghi loại `run`:
```json
{
  "type": "run",
  "runId": "run-20261013-071201-d4e5f6",
  "wakeId": "wake-20261013-071200-a1b2c3",
  "seatId": "marketing-lead",
  "sessionId": "session-uuid",
  "startedAt": "2026-10-13T07:12:01.456Z",
  "finishedAt": "2026-10-13T07:12:07.856Z",
  "status": "finished",
  "exitCode": 0,
  "attempt": 1
}
```
- `status`:
  - `running`: Tiến trình đang chạy.
  - `finished`: Hoàn tất thành công (exitCode 0).
  - `failed`: Lỗi khi chạy (exitCode != 0 hoặc có lỗi).
  - `killed`: Bị huỷ do server tắt hoặc dừng khẩn cấp.
  - `orphaned`: Trạng thái đặc biệt khi server restart phát hiện run còn dở dang mà tiến trình đã chết.

---

### 2.2. Sổ chi phí: `operations/data/costs/<YYYY-MM-DD>.jsonl`

Theo dõi chi tiết usage token và chi phí theo từng model của mỗi lượt chạy:

```json
{
  "ts": "2026-10-13T07:12:07.856Z",
  "seatId": "marketing-lead",
  "runId": "run-20261013-071201-d4e5f6",
  "model": "claude-3-7-sonnet-20250219",
  "inputTokens": 1400,
  "cachedInputTokens": 200,
  "cacheCreationTokens": 400,
  "outputTokens": 150,
  "costNanodollars": "680000000",
  "priced": true,
  "source": "claude-stream-json"
}
```

#### Quy tắc kế toán & Lưu trữ:
1. **Idempotency**: Khoá `(runId, model)` là duy nhất. Khi ghi lại cùng receipt, hệ thống không bao giờ ghi trùng hay cộng dồn hai lần.
2. **Quy tắc gom token Paperclip**:
   - `inputTokens` = `prompt_tokens` + `cache_creation_input_tokens` (đúng bản chất tính phí của Anthropic).
   - `cachedInputTokens` = `cache_read_input_tokens` (được cách ly riêng).
   - `outputTokens` = `output_tokens`.
   - `totalTokens` = `inputTokens` + `cachedInputTokens` + `outputTokens` (không cộng lặp `cacheCreationTokens`).
3. **Số học Nanodollar & Chuỗi số nguyên**:
   - `costNanodollars` được lưu và trả qua API dưới dạng chuỗi số nguyên (`string`) để bảo toàn chính xác tuyệt đối, không bị giới hạn bởi `Number.MAX_SAFE_INTEGER` ($2^{53}-1$).
   - Phép cộng dồn dùng `BigInt` xuyên suốt.
4. **Lượt thiếu giá**: Nếu provider không trả về `total_cost_usd`, trường `costNanodollars: null` và `priced: false`. Bảng thống kê hiển thị `Unpriced runs: N`, tuyệt đối không ước lượng giá bịa.

---

## 3. Các API tra cứu & Vận hành

### 3.1. `GET /api/runs`
- Tham số: `seat=<slug>`, `from=<ISO>`, `to=<ISO>`, `limit=50`.
- Kết quả: Danh sách lượt chạy mới nhất, tự động gộp (merge) thông tin `wake` tương ứng.

### 3.2. `GET /api/wakes/<wakeId>`
- Kiểm tra trạng thái của một yêu cầu đánh thức. Trả về `200` kèm `{ wake: { ... } }` nếu tìm thấy, `404` (`{ error: "Wake not found", wakeId }`) nếu không tồn tại.

### 3.3. `GET /api/costs`
- Tham số: `seat=<slug>`, `from=<ISO>`, `to=<ISO>`.
- Kết quả: Tổng hợp token, chi phí nanodollar, định dạng USD theo ghế và theo ngày, số lượt unpriced.

---

## 4. Cách xoá và reset sổ khi thử nghiệm (Testing cleanup)

Thư mục dữ liệu `operations/data/` nằm trong `.gitignore` để tránh đưa dữ liệu chạy thử vào git:

### Xoá sổ chạy (runs ledger):
```bash
rm -rf operations/data/runs/*.jsonl
```

### Xoá sổ chi phí (costs ledger):
```bash
rm -rf operations/data/costs/*.jsonl
```

### Xoá toàn bộ dữ liệu tạm & hàng đợi đánh thức:
```bash
rm -rf operations/data/runner.log.jsonl
rm -rf .trang-thai/danh-thuc.json
```

Sau khi xoá, hệ thống tự động khởi tạo lại tệp mới khi có lượt chạy tiếp theo.
