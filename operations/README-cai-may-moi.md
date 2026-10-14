# Hướng Dẫn Cài Đặt và Vận Hành aiboss-office Trên Máy Mac Mới

Tài liệu này hướng dẫn chi tiết từng bước cho Owner (anh Thanh) khi tải mã nguồn `aiboss-office` về một máy Mac mới tinh để chạy thử nghiệm và vận hành mà không gặp bất kỳ lỗi thiếu môi trường hay mất nhật ký phiên nào.

---

## 1. Yêu Cầu Môi Trường (Prerequisites)

Trước khi tải mã nguồn, máy Mac mới cần cài đặt đầy đủ các công cụ nền tảng sau:

### 1.1. Node.js và pnpm
Dự án yêu cầu phiên bản Node.js hiện đại để hỗ trợ đầy đủ các tính năng runtime và xử lý tiến trình (Next.js 15 yêu cầu `>= 18.18.0`; dự án khuyến nghị Node.js 22 LTS trở lên):
- **Node.js**: Phiên bản `>= 22.0.0` (khuyên dùng Node.js 22 LTS qua `nvm` hoặc `fnm`, cung cấp đầy đủ native WebSocket, fetch, crypto, test runner và khớp với `@types/node: 22.10.2`).
  ```bash
  node -v
  # Kết quả phải trả về v22.0.0 trở lên
  ```
- **pnpm**: Phiên bản `>= 10.32.1`.
  ```bash
  pnpm -v
  # Nếu chưa có pnpm:
  corepack enable
  corepack prepare pnpm@10.32.1 --activate
  # Hoặc cài qua npm:
  npm install -g pnpm@10.32.1
  ```

### 1.2. Claude Code CLI (`claude`)
Ứng dụng sử dụng tiến trình Claude Code nền để thực thi nhiệm vụ cho các ghế agent:
- Kiểm tra lệnh `claude` đã được cài đặt trên máy chưa:
  ```bash
  claude --version
  ```
  Nếu chưa cài đặt:
  ```bash
  npm install -g @anthropic-ai/claude-code
  ```
- **Đăng nhập xác thực OAuth vào Claude**:
  Mở terminal và gõ lệnh:
  ```bash
  claude
  ```
  Làm theo hướng dẫn trên màn hình để đăng nhập tài khoản Anthropic (Claude Pro / Max).
  > **Lưu ý quan trọng**: Xác thực này sẽ được macOS lưu trữ an toàn trong macOS Keychain (`Claude Code`). Nhờ đó, ứng dụng `aiboss-office` có thể gọi Claude CLI mà không cần phải truyền khoá API thủ công. Bạn bắt buộc phải chạy lệnh `claude` và đăng nhập thành công ít nhất một lần trên terminal trước khi khởi động ứng dụng.

---

## 2. Tải Mã Nguồn và Neo Sàn An Toàn Theo Thư Mục Kho (Clone & Seat Files)

Clone kho mã nguồn chính thức từ GitHub về máy:

```bash
git clone https://github.com/erocathanh/aiboss-office.git
cd aiboss-office
```

*Ghi chú về nhánh*:
- Nhánh mặc định phục vụ vận hành: `mvp/marketing` (hoặc nhánh release được thông báo từ đội phát triển).
- Nếu cần chuyển nhánh:
  ```bash
  git checkout mvp/marketing
  ```

*Neo quy tắc `deny` tự động và tin cậy thư mục kho mới (S17c F7 & S17d F14–F18)*:
1. **Tự động neo quy tắc `deny` theo đường dẫn thực của kho (không cần bước chạy tay)**:
   - Khi chạy `pnpm start`, `pnpm test` hoặc dịch vụ LaunchAgent, bước `prestart` tự động thực thi `node operations/scripts/gen-seat-files.mjs` (đã tích hợp sẵn bước sinh `CLAUDE.md` nên không cần gọi riêng `gen-seat-claude-md.mjs`; idempotent — chạy nhiều lần không đổi nội dung nếu gốc kho giữ nguyên) để neo các quy tắc `Edit(//<REPO_ROOT>/projects/**/{references,templates,inputs}/**)` và `Edit(//<REPO_ROOT>/operations/data/**)` trong `.claude/settings.json` theo đúng đường dẫn thực của kho hiện tại (dùng chung một hàm escape ký tự glob `* ? [ ] { }` giữa bộ sinh và bộ kiểm).
   - Đồng thời, trước mỗi lượt gọi ghế (`spawnClaudeSeatProcess`), hệ thống tự động kiểm tra mọi quy tắc `deny` tuyệt đối trong cả `.claude/settings.json` của ghế và `.claude/settings.json` ở gốc kho phải khớp với `//<REPO_ROOT thật>/`; nếu lệch sẽ tự sinh lại tại chỗ và kiểm tra lại, nếu vẫn lệch (ví dụ thiếu quyền ghi) sẽ từ chối lượt chạy với lỗi `seat_settings_root_mismatch` kèm `stderr` của bộ sinh (cắt tối đa 2 KB) và hướng dẫn kiểm tra quyền ghi (fail-closed, tuyệt đối không chạy ghế với `deny` neo sai đường dẫn).
   - Nếu muốn kiểm tra thủ công trạng thái neo hiện tại mà không ghi tệp:
     ```bash
     node operations/scripts/gen-seat-files.mjs --check
     ```
   - *Lưu ý về trạng thái Git (`git status` bẩn) trên bản clone/worktree khác đường dẫn chuẩn (F17)*: Vì các tệp `.claude/settings.json` được theo dõi trong Git với đường dẫn chuẩn của kho chính, ở **lần chạy `pnpm start` hoặc `pnpm test` đầu tiên** trên một bản clone hoặc worktree đặt ở đường dẫn khác (ví dụ `/tmp/...` hoặc thư mục người dùng khác), `gen-seat-files.mjs` sẽ cập nhật lại các tệp `.claude/settings.json` theo đường dẫn cục bộ. Việc `git status` báo các tệp `.claude/settings.json` có thay đổi (`M`) trên bản clone khác đường dẫn là **hoàn toàn bình thường — không commit các thay đổi đường dẫn cục bộ này lên nhánh chung**.
   - *Nguyên tắc phân tích tĩnh đường dẫn trong bộ hook (`operations/SAN-AN-TOAN-GHE.md`, F16)*: Mọi biểu thức hoặc chuỗi literal đường dẫn không thể giải mã tĩnh một cách chắc chắn (bao gồm biến môi trường, chuỗi nối động, lời gọi hàm lồng, hoặc chuỗi có ký tự escape ngôn ngữ không giải được) **không bao giờ được coi là đường dẫn tĩnh an toàn** mà luôn bị xếp vào nhóm đích ghi động (`$DYNAMIC_WRITE`) và bị chặn fail-closed khi `cwd` nằm trong kho dự án.
2. **Chấp nhận hộp thoại tin cậy kho (Workspace Trust)**: Mở terminal tại thư mục gốc `aiboss-office` vừa clone và chạy lệnh `claude` tương tác một lần để bấm đồng ý tin cậy thư mục dự án (*Yes, I trust this folder*), sau đó gõ `/exit`. Bước này giúp Claude Code nạp đầy đủ các quy tắc `permissions.allow` và `hooks` trong `.claude/settings.json` của từng ghế.

---

## 3. Cài Đặt Gói Phụ Thuộc (Install Dependencies)

Chạy lệnh cài đặt toàn bộ gói phụ thuộc:

```bash
pnpm install
```

Kiểm tra đảm bảo không có cảnh báo lỗi cài đặt gói thư viện.

---

## 4. Cấu Hình Môi Trường (.env & config)

### 4.1. Tệp biến môi trường `.env` và Danh Sách Trắng Môi Trường Tiến Trình Con
Tạo tệp `.env` tại thư mục gốc của dự án nếu cần đặt tài khoản xác thực cho giao diện web:

```bash
cat << 'EOF' > .env
# Tài khoản đăng nhập giao diện web (Basic Auth)
PHONGBAN_USER=erocathanh
PHONGBAN_PASS=mat_khau_quan_tri_cua_ban

# Đường dẫn thư mục dữ liệu (tuỳ chọn - mặc định lưu tại operations/data)
# AIBOSS_DATA_DIR=$HOME/Projects/aiboss-office/operations/data

# Chế độ ngữ cảnh ghế (mặc định tắt để cô lập ngữ cảnh ghế với --setting-sources project
# và --strict-mcp-config --mcp-config <tệp .mcp.json theo ghế>; chỉ đặt AIBOSS_SEAT_TERMINAL_MODE=1
# khi cần gỡ lỗi với toàn bộ CLAUDE.md và MCP cấp máy như terminal)
# AIBOSS_SEAT_TERMINAL_MODE=1
EOF
```

*Danh sách trắng biến môi trường truyền xuống tiến trình con Claude (`CLAUDE_SEAT_ENV_WHITELIST` — S17b F3b & S17c F13)*:
- Khi ứng dụng sinh tiến trình `claude` (ở cả runner, `/api/chat` và `/api/fork`), hệ thống **không** truyền nguyên `process.env` mà chỉ lọc qua danh sách trắng gồm:
  - Biến hệ thống cốt lõi: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TMPDIR`, `LANG`, `LC_*`, `TERM`, `TZ`, `NODE_ENV`, `XDG_*`, `SSH_AUTH_SOCK`, `SECURITYSESSIONID`, `__CF_USER_TEXT_ENCODING`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_EXTRA_CA_CERTS`, `CLAUDE_CONFIG_DIR`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`.
  - Biến mạng proxy tiêu chuẩn (hỗ trợ máy chạy qua proxy): `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `ALL_PROXY`, `http_proxy`, `https_proxy`, `no_proxy`, `all_proxy`.
  - Biến vận hành `AIBOSS_*` hợp lệ: `AIBOSS_DATA_DIR`, `AIBOSS_CONFIG_DIR`, `AIBOSS_OFFICE_CONFIG_PATH`, `AIBOSS_OFFICE_ROOT`, `AIBOSS_AGENT_BROKER_MCP_SCRIPT`, `AIBOSS_SEAT_TERMINAL_MODE`.
- Các biến thử nghiệm nội bộ (`AIBOSS_DISABLE_HOOK_2_1`, `AIBOSS_TEST_MODE`) **tuyệt đối không** nằm trong danh sách trắng truyền xuống tiến trình ghế, và cờ tắt Hook 2.1 trong bộ đo kiểm thử chỉ hoạt động khi đồng thời có `AIBOSS_TEST_MODE=1` và `NODE_ENV != "production"`.

*Lưu ý an toàn*: Không bao giờ commit tệp `.env` lên git repository.

### 4.2. Cấu hình trần ngân sách và ngôn ngữ ghế (`config/office.json`)
Mở tệp `config/office.json` để kiểm tra và điều chỉnh ngân sách chạy hằng ngày cũng như ngôn ngữ phản hồi của các ghế trong văn phòng:

```json
{
  "office_id": "marketing",
  "office_name": "Phòng Marketing AI",
  "currency": "USD",
  "language": "auto",
  "budget": {
    "daily_limit_usd": 10.0,
    "warning_threshold_ratio": 0.8,
    "soft_stop": false
  }
}
```
- `language`: Ngôn ngữ trả lời của các ghế agent (`"auto"` mặc định trả lời theo ngôn ngữ câu hỏi của Owner, hoặc ghim cố định `"vi"` / `"en"`). Khi đổi trường `language`, thay đổi có hiệu lực ở lần chạy `pnpm start` kế tiếp (bước `prestart` tự động chạy `node operations/scripts/gen-seat-files.mjs` một cách idempotent để cập nhật cả `.claude/settings.json`, `.mcp.json` và `CLAUDE.md` khi nội dung đổi mà không chạm `SOUL.md`). Nếu chạy trực tiếp qua `pnpm exec next start -p 4330 -H 127.0.0.1`, chạy `node operations/scripts/gen-seat-files.mjs` trước khi khởi động lại dịch vụ.
- `daily_limit_usd`: Trần chi tiêu tối đa mỗi ngày tính bằng USD (ví dụ 10.0 USD). Khi chi phí đạt trần cứng, hệ thống sẽ tự động chặn mọi lượt gọi tiếp theo để bảo vệ tài khoản của bạn.
- `warning_threshold_ratio`: Mức cảnh báo (0.8 tương đương 80% ngân sách ngày).

---

## 5. Biên Dịch và Khởi Động Ứng Dụng (Build & Start)

### 5.1. Biên dịch ứng dụng (Production Build)
```bash
pnpm build
```
Quá trình build Next.js sẽ kiểm tra toàn bộ kiểu dữ liệu TypeScript và tối ưu hoá giao diện.

### 5.2. Chạy ứng dụng (Production Server)
Khởi động máy chủ chính thức trên cổng **4330**:

```bash
pnpm start
```

Máy chủ sẽ lắng nghe tại:
👉 **`http://127.0.0.1:4330`**

*(Lưu ý: Tuyệt đối không dùng các cổng 4319 hoặc 4320 vì đó là các cổng dành riêng cho dịch vụ khác).*

### 5.3. Tuỳ chọn: Chạy nền dạng dịch vụ hệ thống (macOS LaunchAgent)
Nếu muốn ứng dụng luôn chạy nền và tự khởi động lại khi khởi động máy Mac:
```bash
./operations/scripts/service-install.sh
./operations/scripts/service-status.sh
```
Khi muốn gỡ bỏ dịch vụ nền:
```bash
./operations/scripts/service-uninstall.sh
```

---

## 6. Kiểm Tra Sức Khoẻ Hệ Thống (Health Check)

Sau khi ứng dụng khởi động, bạn có thể mở một cửa sổ terminal mới để kiểm tra các cổng API cốt lõi:

1. **Kiểm tra API Ngân sách**:
   ```bash
   curl -s http://127.0.0.1:4330/api/budget | jq .
   ```
   *Yêu cầu*: Trả về mã trạng thái HTTP 200 kèm cấu trúc ngân sách (`daily_limit_usd`, `total_cost_nanodollars`, `cap_status: "ok"`).

2. **Kiểm tra Danh sách Ô & Ghế**:
   ```bash
   curl -s http://127.0.0.1:4330/api/o | jq .
   ```
   *Yêu cầu*: Trả về danh sách các ô làm việc và trạng thái ghế hiện tại.

3. **Kiểm tra Runner nền**:
   ```bash
   curl -s http://127.0.0.1:4330/api/danh-thuc | jq .
   ```
   *Yêu cầu*: Trả về HTTP 200 kèm trạng thái hàng đợi `hang_doi`.

---

## 7. Kiểm Tra Session History & Nhật Ký Chạy

Trên bản clone sạch, sau một lượt chat, Session History hiển thị phiên làm việc kèm toàn văn hội thoại (cả câu hỏi của người dùng và câu trả lời của trợ lý Claude Code) và kích thước bản ghi (`size_bytes > 0`). Cơ chế xử lý bao gồm:
- Bản ghi phiên Claude Code thực tế tại `~/.claude/projects/` (được tìm kiếm chính xác theo mã phiên UUID và xác minh quyền sở hữu qua `cwd` để bảo đảm cách ly, không rò rỉ chéo giữa các bản clone hay khách trên cùng máy).
- Metadata bền vững tại thư mục cục bộ `operations/data/sessions/<mã_ghế>/` (phân quyền hạn chế: thư mục 0700, tệp 0600) và sổ nhật ký chạy `operations/data/runs/<YYYY-MM-DD>.jsonl`. Khi tệp transcript chưa xuất hiện hoặc bị thiếu trên máy mới, metadata vẫn giữ mã phiên, câu hỏi mở đầu và đánh dấu `transcript: 'missing'`.

### Các bước kiểm tra thực tế:
1. Mở trình duyệt truy cập `http://127.0.0.1:4330`.
2. Chọn một ghế nhân sự (ví dụ: `content-writer` hoặc `copy-writer`).
3. Gửi một câu lệnh thử nghiệm từ ô trò chuyện (ví dụ: *"Chào bạn, hãy giới thiệu ngắn về vai trò của bạn"*).
4. Quan sát câu trả lời hiển thị trực tiếp theo luồng.
5. Sau khi lượt chạy hoàn tất, bấm vào nút **Session History** (hoặc biểu tượng lịch sử phiên) trên thanh công cụ của ghế:
   - Danh sách phiên hiển thị ngay phiên làm việc vừa thực hiện.
   - Hiển thị đầy đủ câu hỏi mở đầu (`tin_cuoi`), mốc thời gian thực hiện, số lượt trao đổi (`so_luot >= 1`), kích thước bản ghi (`size_bytes > 0`).
   - Bấm vào phiên sẽ hiển thị toàn bộ nội dung lịch sử trò chuyện chi tiết (cả câu hỏi và câu trả lời).
6. Mọi lượt chạy đều được tự động ghi nhận vào sổ nhật ký tại `operations/data/runs/` với trạng thái chuẩn xác (`finished` chỉ khi exit 0, `failed` khi có lỗi/exception/exit khác 0).

---

## 8. Dừng Ứng Dụng Sạch Sẽ (Shutdown Procedure)

- Nếu bạn chạy ứng dụng trực tiếp bằng `pnpm start` trong terminal:
  Nhấn tổ hợp phím **`Ctrl + C`** để dừng ứng dụng.
- Nếu ứng dụng đang chạy nền và bạn muốn giải phóng cổng 4330:
  ```bash
  # Tìm PID đang giữ cổng 4330
  lsof -ti :4330
  # Dừng tiến trình
  kill $(lsof -ti :4330)
  ```
- Nếu cài đặt dưới dạng macOS LaunchAgent:
  ```bash
  ./operations/scripts/service-uninstall.sh
  ```

---

## 9. Chạy Bộ Kiểm Thử Tự Động (Automated Test Suite)

Để kiểm chứng toàn bộ logic hệ thống (bao gồm trần ngân sách, ghi nhận chi phí token, phát hiện phiên và lịch sử hội thoại):

```bash
pnpm test
```

Tất cả các bộ kiểm thử đều phải vượt qua 100%:
- `tests/money.test.mjs`: Tính toán đơn vị tiền tệ nanodollars.
- `tests/usage-receipt.test.mjs`: Biên lai sử dụng token.
- `tests/runs-ledger.test.mjs`: Sổ ghi nhận lượt chạy và yêu cầu đánh thức.
- `tests/costs-ledger.test.mjs`: Sổ chi phí mô hình và tính giá.
- `tests/danh-thuc-route.test.mjs`: Luồng đánh thức và cách ly môi trường.
- `tests/session-history.test.mjs`: Phát hiện phiên bền vững, dự phòng tệp lớn và đa kho lưu trữ.
- `tests/budget.test.mjs`: 30 trường hợp kiểm thử nghiêm ngặt về trần ngân sách và khôi phục khi gặp sự cố.
- `tests/s17-seat-isolation.test.mjs` & `pnpm test:hooks`: Kiểm thử cô lập ngữ cảnh ghế (`--setting-sources project`, `.mcp.json` theo ghế), sàn an toàn cấp ghế và Hook 2.1 chặn đăng công khai.
