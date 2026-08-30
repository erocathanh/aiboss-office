# Phòng ban AI — vòng 1

Nói chuyện **thật** với trợ lý AI qua trình duyệt. Mỗi ô là **khung chat** (⛔ không phải màn hình dòng lệnh thô).
Vòng này chạy **một ô, một agent thật**. Chia 2–4 ô để vòng sau.

---

## Chạy

```bash
cd /Users/erocathanh/Projects/aiboss-app-chat
pnpm install
pnpm dev            # http://localhost:4319
```

> **Node:** thư mục có `.node-version` = `24.19.0`, fnm tự đổi bản khi `cd` vào.
> ⛔ **KHÔNG** chạy `fnm default` / đổi PATH toàn máy — node mặc định v22.23.1 đang nuôi Hermes + openclaw (cổng 18789).
> **Điều kiện tiên quyết:** máy đã cài + **đã đăng nhập** Claude Code (`claude --version` chạy được).

---

## Kiến trúc — chọn gì, vì sao

```
Trình duyệt (Next.js App Router)
   │  POST /api/chat   → nhận lại LUỒNG SSE (chảy từng chữ)
   │  GET  /api/phien  → danh sách phiên thật + lịch sử thật
   │  GET/POST /api/o  → ô nào đang mở phiên nào
   ▼
Máy chủ Node (route handler)
   │  chặn mức dùng → kiểm bản ghi phiên → spawn
   ▼
claude -p --output-format stream-json --include-partial-messages …
   cwd = /Users/Shared/phong-ban-ai-ws/<tên-agent>     ← vùng cách ly
```

### Vì sao SSE (⛔ không phải WebSocket)

| Lý do | Chi tiết |
|---|---|
| Luồng **một chiều** | Câu hỏi đi lên bằng POST thường; chỉ câu trả lời cần chảy về. WebSocket là kênh hai chiều — trả giá cho chiều không dùng. |
| Hợp Next.js | Route handler + `ReadableStream` là đường có ví dụ chính chủ. **Route handler ⛔ KHÔNG nhận WebSocket** → phải dựng custom server, mất một phần tối ưu `next start`. |
| Qua proxy dễ | SSE đi trên HTTP thường, ⛔ không cần nâng cấp giao thức. |

Có sẵn **nhịp giữ sống 20 giây** (`: nhip`) + `X-Accel-Buffering: no` — Cloudflare cắt kết nối rảnh ở 125 giây.

> 📌 Vòng sau (2–4 ô) **phải đổi sang MỘT luồng SSE gộp tất cả các ô** (khung có nhãn `paneId`),
> vì HTTP/1.1 chỉ cho **6 kết nối/trình duyệt/tên miền** và `next dev` là HTTP/1.1.
> Vòng này 1 ô nên chưa đụng trần. Chi tiết: `KIEN-TRUC-SAU.md §②`.

### Bộ cờ gọi Claude Code — mỗi cờ đều đã ĐO THẬT

| Cờ | Vì sao |
|---|---|
| `--output-format stream-json` + `--verbose` | Mỗi dòng stdout là một JSON. Thiếu `--verbose` là bị chặn. |
| `--include-partial-messages` | Cho ra `text_delta` ⇒ chảy từng chữ, ⛔ không đợi xong mới trả một cục. |
| `--setting-sources project` | ⛔ không nạp hook + settings của cả máy Owner. |
| `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` | 🔴 **Cắt sạch 13 máy chủ MCP của Owner.** Thiếu hai cờ này: **180.746 token** nạp thừa, một lượt tầm phào tốn **1,08 USD**. |
| `--permission-mode dontAsk` + `--disallowedTools …` | Vòng này agent **thuần trò chuyện**, ⛔ không tay chân. |
| `--max-budget-usd` | Chốt chặn tiền ngay tầng tiến trình (đã đo: nó **cắt thật**). |
| `--resume <mã>` | Nối mạch hội thoại. ⛔ **KHÔNG** dùng `--fork-session` (đẻ id mới ⇒ lần sau resume không thấy). |

⛔ **KHÔNG dùng `--bare`:** nó tuyên bố *"OAuth and keychain are never read"* ⇒ bắt buộc có `ANTHROPIC_API_KEY`.
Máy Owner đăng nhập bằng thuê bao (`apiKeySource: "none"`) nên `--bare` sẽ **làm hỏng xác thực**.

### 🔴 Vùng cách ly phải nằm NGOÀI `$HOME`

Ban đầu để `agent-ws/` ngay trong dự án (dưới `~/Development/…`). Tiến trình con **dò ngược lên cây thư mục**
và nuốt trọn `~/CLAUDE.md` của Owner ⇒ agent mở miệng là `FROM: … / TO: Eroca Thanh`, đọc luật trí nhớ 4-loại,
⛔ không chịu đóng vai nhân sự phòng ban; tiền lượt vọt **0,067 → 0,249 USD**.

⚠️ `--setting-sources project` chặn được settings/hook nhưng **⛔ KHÔNG chặn được việc dò ngược CLAUDE.md** — chỉ **đổi chỗ đứng** mới chặn được.
⇒ Vùng cách ly nay ở `/Users/Shared/phong-ban-ai-ws/<tên-agent>` (ngoài mọi `$HOME`, vẫn bền qua khởi động lại).

---

## Nhãn dễ hiểu — tên kỹ thuật xuống dòng phụ

Dòng **chính** = nhãn tiếng Việt sinh từ slug bằng bảng tra 224 từ khoá có thật.
Dòng **phụ** = tên kỹ thuật (nhỏ, mờ, chữ đều nét) — vẫn là **mã định danh thật** để nối phiên.

```
Web phễu bán hàng                     ← claude-web-funnel
Trưởng phòng AI thương mại điện tử    ← claude-ai-tmdt-pm
Kỹ năng quảng cáo dựng #17            ← claude-adskill-build-17
```

Đo được: **0 nhãn trùng trong cùng phòng** · **0 trùng trên toàn 211** · dài nhất 43 ký tự.
Tìm kiếm ra **cả hai đường**: gõ `marketing` → 41 người · gõ `web-funnel` → đúng 1 người.
⛔ Từ không dịch được (tên riêng như `BCLS`) **giữ nguyên**, ⛔ không bịa nghĩa.

---

## Nối lại phiên thật

- Đọc thẳng `~/.claude/projects/<đường-dẫn-mã-hoá>/<uuid>.jsonl` (quy tắc mã hoá đo tại máy: `/` → `-` **và** `.` → `-`).
- Mỗi nhân sự có **thư mục làm việc riêng** ⇒ phiên của ai nằm gọn kho người đó.
- Bản đồ `ô → phiên` ghi **xuống đĩa** (`.trang-thai/o-phien.json`) ⇒ tắt trình duyệt / khởi động lại máy chủ vẫn về đúng phiên cũ.
- 🪤 **Trước khi `--resume` phải KIỂM bản ghi phiên còn đọc được không.** Thiếu mà cứ resume mù → Claude Code âm thầm mở **phiên trắng** trong khi giao diện vẫn hiện lịch sử cũ ⇒ mất ngữ cảnh mà không ai biết. Ở đây: thiếu bản ghi thì **xoá liên kết + báo thẳng ra màn hình**.
- ⛔ **KHÔNG nối vào phiên đang chạy nơi khác** (hai tiến trình ghi một tệp = hỏng bản ghi). Ngưỡng 5 phút, lấy đúng ngưỡng sổ phiên của Owner.
  - 🪤 Chỉ nhìn `mtime` là **tự chặn chính mình** (gửi xong câu 1 thì câu 2 bị coi là "đang chạy nơi khác"). Đã cắn thật. Chữa bằng cách ghi lại **mốc kết thúc lượt của ta** rồi so sánh.

---

## Ràng buộc an toàn

| Việc | Trạng thái |
|---|---|
| Khoá/bí mật **chỉ ở máy chủ** | ✅ ⛔ không có biến `NEXT_PUBLIC_*`; đã soi HTML + 5 tệp JS (8,4 MB): **0 vết** khoá/token |
| Chặn mức dùng | ✅ `SO_LUOT_MOI_PHUT` (mặc định 6) + `TRAN_DONG_THOI` (3) — chặn **trước khi spawn** |
| Trần tiền mỗi lượt | ✅ `--max-budget-usd` (mặc định 0,5) |
| Hạn giờ | ✅ 120 giây rồi `SIGTERM` |
| Agent ⛔ không tay chân | ✅ 26 công cụ bị cấm tường minh + `dontAsk` |
| Chèn lệnh | ✅ `spawn` ⛔ không qua shell; câu hỏi đi bằng **stdin** |
| noindex | ✅ `X-Robots-Tag` + meta robots |

### Biến môi trường (đều **không** bắt buộc)

```
DUONG_DAN_CLAUDE    mặc định "claude"
THU_MUC_AGENT       mặc định /Users/Shared/phong-ban-ai-ws
MO_HINH_CLAUDE      mặc định "sonnet"   (⛔ đừng để opus — hạn mức riêng, đắt hơn nhiều)
TRAN_TIEN_MOI_LUOT_USD   0.5
SO_LUOT_MOI_PHUT         6
TRAN_DONG_THOI           3
HAN_GIO_MS               120000
```

---

## ⛔ CHƯA LÀM (cố ý, để vòng sau)

| # | Việc | Ghi chú |
|---|---|---|
| 1 | **Chia 2–4 ô** | Vòng này cố định 1 ô (`o-1`). |
| 2 | 🔴 **Giữ tiến trình `claude` sống** | Hiện **spawn mỗi lượt**. Đo được: mỗi lượt ~15.000 token khởi động lại. Mô hình đúng (openclaw `claude-stdio`) là giữ tiến trình sống + gửi lượt sau qua stdin. **Đây là việc số 1 của vòng sau** — với 4 ô thì đây là chỗ cháy hạn mức lớn nhất. |
| 3 | **Một luồng SSE gộp N ô** | Cần trước khi lên 2–4 ô (trần 6 kết nối HTTP/1.1). |
| 4 | Nối lại giữa chừng (`Last-Event-ID`) | Rớt mạng giữa lượt là mất phần đang chảy. |
| 5 | **Deploy** | ⛔ Chưa. Vòng này chỉ tick tại máy. Ra Internet phải bật **Cloudflare Access trước** — trang này = quyền chạy agent trên máy Owner. |
| 6 | Đăng nhập / phân quyền | Chưa có. Đang chỉ nghe `localhost`. |
| 7 | Cộng dồn token theo phiên/ngày | Hiện chỉ hiện token **của lượt vừa chạy**. |
| 8 | Nhiều máy chủ | Chặn mức dùng + sổ ô đang ở bộ nhớ/đĩa **một máy**. |

---

## Đã đo được (không phải phỏng đoán)

| Phép đo | Kết quả |
|---|---|
| Đối chứng dương AI thật | `6197 × 83 = 514.351` ✅ · `4181 + 2029 = 6210` ✅ |
| Nối phiên qua **khởi động lại máy chủ** | Đưa mã `NEO-8823-XYZ` → giết máy chủ → bật lại → hỏi lại → trả **đúng mã** ✅ |
| Nhãn trùng trong cùng phòng | **0** / 211 |
| Khoá lọt ra trình duyệt | **0** vết trên 8,4 MB JS + HTML (có đối chứng dương) |
| Chặn mức dùng | Trần 1 lượt/phút → yêu cầu 2 & 3 trả **429 trước khi spawn** (⛔ không tốn tiền) |
| Cắt MCP | 180.746 → ~15.000 token mỗi lượt |
| Cách ly khỏi `~/CLAUDE.md` | 0,249 → 0,067 USD lượt nguội |
