# Sàn An Toàn Ghế AIBOSS Office — Mô Hình Đe Doạ và Sổ Rủi Ro Tồn Dư

> Tài liệu chuẩn hoá kiến trúc bảo vệ hai lớp cho các ghế nhân sự AI trong kho `aiboss-office` (thiết lập tại S17d).
> Dùng làm thước chuẩn cho các vòng rà soát an toàn tự động (Hermes) và kiểm toán vận hành.

---

## 1. Mô Hình Đe Doạ (Threat Model)

### 1.1. Bản chất tác nhân thực thi
- Mỗi ghế nhân sự trong văn phòng (ví dụ: `content-writer`, `copy-writer`, `paid-media`, `social-community`, ...) là một phiên mô hình ngôn ngữ lớn (LLM) được khởi chạy qua tiến trình con `claude -p` từ điểm gọi duy nhất `spawnClaudeSeatProcess()` (`src/lib/chay-agent.ts`).
- Trong chế độ vận hành cục bộ mặc định (`127.0.0.1:4330`), tiến trình ghế chạy với `--permission-mode bypassPermissions` để tự động thực hiện công việc chuyên môn mà không làm gián đoạn người điều hành ở từng thao tác đọc/ghi tệp thông thường. (Khi ứng dụng lắng nghe mạng ngoài, chế độ tự động hạ xuống `dontAsk` kèm danh sách `--disallowedTools`).

### 1.2. Rủi ro trong phạm vi cần chặn (In-Scope Threats)
Mục tiêu của sàn an toàn ghế là chặn **hành vi vô tình làm hỏng dữ liệu hoặc rò rỉ/đăng tải trái phép do LLM suy luận nhầm hoặc bị thao túng qua dữ liệu đầu vào (indirect prompt injection)**:
1. **Ghi đè hoặc sửa đổi vùng dữ liệu bất biến**:
   - Dữ liệu đầu vào thô và tài liệu chuẩn của dự án (`projects/**/{inputs,references,templates}/**`).
   - Sổ vận hành, biên lai chi phí, nhật ký lượt chạy và hồ sơ phê duyệt (`operations/data/**`).
   - Đầu ra chính thức (`projects/**/outputs/**` hoặc tệp `*_final.*`) khi chưa có phiếu duyệt hợp lệ trong sổ `operations/data/approvals/`.
2. **Đọc hoặc làm lộ thông tin xác thực nhạy cảm**:
   - Tệp biến môi trường `.env`, `.env.*`, khoá cấu hình `~/.config/aiboss-office/**`, khoá dịch vụ đám mây (`~/.cloudflare*`, `~/.vercel*`, `~/ai-agent/*/khoa/**`).
   - Tệp token Facebook/Meta (`~/.meta-token-fanpage`, `~/.fb-user-token-long`, `.config/aiboss-office/meta-*`, `meta-page-token`).
3. **Đăng bài công khai, trả lời khách hàng, hoặc gửi dữ liệu ra ngoài khi chưa được phép**:
   - Gọi kịch bản kỹ năng fanpage/inbox với cờ ghi (`--dong-y`, `--tra-loi`, `--gui`, `--dang-bai`, ...).
   - Thực hiện lệnh ghi HTTP (`POST`, `PUT`, `DELETE`, `PATCH`, hoặc truyền dữ liệu payload/form) qua `curl`, `wget`, `requests`, `httpx`, `urllib`, `fetch`, `axios` tới máy chủ ngoài danh sách trắng (`localhost`, `127.0.0.1`, `::1`, và `allowedWriteDomains` trong `config/office.json`).
4. **Phá huỷ cây thư mục hoặc làm treo máy trạm**:
   - Lệnh xoá đệ quy (`rm -rf`), `git reset --hard`, `git push --force`, `chmod 777`, quét ổ gắn ngoài `/Volumes/`, hoặc gọi dịch vụ Ollama cục bộ (`11434`).

### 1.3. Rủi ro ngoài phạm vi (Out-of-Scope Threats)
- Sàn an toàn ở tầng ứng dụng **không** nhằm chống lại một **kẻ tấn công chủ động đã có quyền thực thi shell cục bộ trên máy chủ** (local interactive attacker) cố tình viết mã che giấu đa tầng (multi-stage obfuscation), biên dịch nhị phân riêng, hoặc can thiệp trực tiếp vào tệp hệ thống ngoài tiến trình ghế.
- Phân tích tĩnh một ngôn ngữ Turing-complete (như Bash kết hợp Python và Node.js) về mặt lý thuyết không thể quyết định mọi chương trình bất kỳ (tính không khả quyết / Rice's theorem). Do đó, sàn an toàn được thiết kế theo **kiến trúc phòng thủ hai lớp** kết hợp rào quyền công cụ cứng và bộ lọc mẫu lệnh phổ biến.

---

## 2. Kiến Trúc Hai Lớp Bảo Vệ và Phạm Vi Từng Lớp

| Lớp bảo vệ | Cơ chế thực thi | Phạm vi bảo vệ chính | Điểm mạnh & Giới hạn |
|---|---|---|---|
| **Lớp 1: Cô lập tiến trình & Rào quyền công cụ (`permissions.deny`)** | - Tham số CLI trong `buildClaudeSeatArgv()`: `--setting-sources project`, `--settings`, `--strict-mcp-config --mcp-config <ghế/.mcp.json>`, `--disable-slash-commands`.<br>- Lọc biến môi trường qua `CLAUDE_SEAT_ENV_WHITELIST` (`buildClaudeSeatEnv()`).<br>- Quy tắc `permissions.deny` trong `.claude/settings.json` (cả cấp ghế và gốc kho) được sinh bởi `operations/scripts/gen-seat-files.mjs` và kiểm tra fail-closed bởi `ensureSeatSettingsAnchored()` trước mỗi lượt spawn. | - Chặn trực tiếp công cụ `Edit`, `Write`, `MultiEdit`, `Read` của Claude Code vào `//<REPO_ROOT>/projects/**/{references,templates,inputs}/**`, `//<REPO_ROOT>/operations/data/**`, `.env*`, và các tệp token nhạy cảm.<br>- Chặn tiền tố lệnh `Bash(rm:*)`, `Bash(sudo:*)`, `Bash(git reset --hard:*)`, `Bash(git push --force:*)`, và các lệnh gọi thẳng kịch bản fanpage/inbox bị cấm theo ghế.<br>- Cô lập hoàn toàn máy chủ MCP ngoài danh sách cho phép của ghế. | **Điểm mạnh**: Do chính runtime Claude Code cưỡng chế ở tầng gọi công cụ, **không phụ thuộc vào bộ phân tích cú pháp vỏ lệnh (shell parser)**.<br>**Giới hạn**: Với công cụ `Bash`, quy tắc `Bash(...)` của Claude Code chỉ so khớp theo mẫu tiền tố chuỗi lệnh, không phân tích ngữ nghĩa bên trong thân kịch bản phức tạp. |
| **Lớp 2: Bộ 11 Hook `PreToolUse` / `PostToolUse` (`operations/hooks/*.py`)** | - Chạy đồng bộ trước mỗi lần công cụ thực thi; trả mã thoát `2` (fail-closed) khi phát hiện vi phạm hoặc lỗi cú pháp/không đọc được kịch bản.<br>- Dùng chung bộ phân tích `operations/hooks/bash_parser.py` để tách chuỗi lệnh ghép (`;`, `&&`, `||`, `|`), command substitution `$(...)`, heredoc `<<EOF`, bóc tách các wrapper (`env`, `sudo`, `command`, `exec`, `builtin`, `nohup`, `nice`, `timeout`, `xargs`), và kiểm tra đệ quy tệp kịch bản được gọi (tối đa 200 KB, độ sâu 4). | - Chặn các mẫu lệnh `Bash` và mã nội tuyến (`python -c`, `node -e`, heredoc) ghi vào `inputs/`, `references/`, `templates/`, `operations/data/`, hoặc `outputs/` chưa duyệt (`lock_raw_inputs.py`, `protect_final_outputs.py`).<br>- Chặn đọc/in chìa khoá bí mật và token Meta (`block_secret_leak.py`).<br>- Chặn mọi lệnh ghi HTTP (`curl`, `wget`, `requests`, `httpx`, `urllib`, `fetch`, `axios`) có đích không thuộc danh sách trắng hoặc đích động qua biến/`xargs` (`block_public_publish.py`).<br>- Chặn xoá hàng loạt, quét `/Volumes`, gọi Ollama, ghi tài khoản quảng cáo, gửi tin hàng loạt. | **Điểm mạnh**: Bắt được các thao tác ghi tệp, đọc khoá và gọi mạng phổ biến bên trong lệnh `Bash`, kể cả qua đường ống `| xargs`, heredoc, nối chuỗi tĩnh `'a' + 'b'`, `os.path.join(...)`, hoặc escape `\x2f`.<br>**Giới hạn**: Là bộ phân tích tĩnh nên không giải được các biểu thức sinh mã động nhiều tầng lúc chạy (`eval`, giải mã `base64`, nhị phân ngoài). |

### Nguyên tắc bất biến trong phân tích tĩnh (F16)
> **Nguyên tắc Fail-Closed đối với đường dẫn không giải được**: Trong bộ phân tích `bash_parser.py` và các hook bảo vệ tệp/mạng, mọi biểu thức đường dẫn hoặc URL không thể giải mã tĩnh thành chuỗi hằng an toàn (bao gồm biến shell `$VAR`, kết quả lệnh `$(...)`, tham số truyền qua `stdin`/`xargs`, lời gọi hàm động, hoặc chuỗi literal chứa ký tự escape ngôn ngữ không giải được) **không bao giờ được coi là đường dẫn tĩnh an toàn**. Chúng luôn bị xếp vào nhóm đích động (`$DYNAMIC_WRITE` hoặc URL động) và bị chặn ngay lập tức khi thực thi trong kho dự án.

---

## 3. Sổ Rủi Ro Tồn Dư (Residual Risk Register)

Bảng dưới đây ghi nhận các dạng lệnh vượt ngoài khả năng phân tích tĩnh của Lớp 2 (hook phân tích vỏ lệnh), các lớp bảo vệ còn đỡ trong hệ thống, và mức độ rủi ro được chấp nhận trong mô hình đe doạ:

| Mã | Dạng lệnh / Kỹ thuật vượt quá phân tích tĩnh của Hook | Vì sao phân tích tĩnh không phủ trọn | Lớp bảo vệ còn đỡ trong hệ thống | Mức rủi ro |
|---|---|---|---|---|
| **RR-01** | **Sinh mã động / Giải mã lúc chạy (`eval`, `exec`, `compile`, `base64 -d`, `codecs.decode`, `Buffer.from(..., 'hex')`)** trong Python, Node.js hoặc shell lồng nhiều tầng. | Chuỗi đường dẫn hoặc URL đích chỉ xuất hiện trong bộ nhớ tại thời điểm thông dịch sau khi giải mã, không tồn tại dưới dạng chuỗi hoặc biểu thức cú pháp tĩnh trên dòng lệnh. | 1. LLM không tự nhiên sinh mã mã hoá `base64`/hex để ghi tệp công việc; prompt injection yêu cầu mã hoá đa tầng dễ bị mô hình từ chối.<br>2. Mọi biến môi trường nhạy cảm đã bị cắt bởi `CLAUDE_SEAT_ENV_WHITELIST`.<br>3. Nhật ký phiên đầy đủ tại `operations/data/runs/` và transcript phiên phục vụ kiểm toán hậu kiểm. | **P2** (Ngoài mô hình đe doạ thông thường) |
| **RR-02** | **Gọi tệp thực thi nhị phân hoặc ngôn ngữ biên dịch/thông dịch ngoài danh sách (`perl`/`ruby`/`php`/`awk`/`sqlite3`/binary riêng)** để mở socket mạng hoặc ghi tệp trực tiếp mà không qua API chuẩn của Python/Node/curl/wget. | Bộ phân tích tĩnh chỉ kiểm tra sâu các ngôn ngữ và công cụ phổ biến trong quy trình văn phòng (`sh`/`bash`/`zsh`, `python`/`python3`, `node`, `curl`, `wget`, `cp`/`mv`/`tee`/`sed`/`dd`). | 1. Quy tắc `permissions.deny` (Lớp 1) chặn công cụ đọc/sửa trực tiếp.<br>2. Ghế chạy với `--strict-mcp-config` và không có quyền `sudo`.<br>3. Các thao tác xuất bản thật (Meta Graph API) đòi hỏi token nằm ngoài phạm vi biến môi trường của ghế và bị chặn đọc ở cả `block_secret_leak.py` lẫn `permissions.deny`. | **P2** (Ngoài mô hình đe doạ thông thường) |
| **RR-03** | **Ghi tệp gián tiếp qua hàm thư viện bậc cao hoặc bí danh đối tượng (aliasing)** trong kịch bản Python/Node phức tạp (ví dụ: gán `f = open; f(...)`, dùng `io.FileIO`, `pathlib` qua biến trung gian nhiều bước, hoặc `fs.promises` qua bí danh). | Hook phân tích biểu thức tại chỗ (`open(...)`, `Path(...).write_*`, `writeFileSync(...)`, `cpSync(...)`) và chặn biến động trực tiếp, nhưng không thực thi toàn bộ luồng dữ liệu (full dataflow/pointer analysis) của một chương trình Python/JS bất kỳ. | 1. Trong công việc bình thường, ghế được hướng dẫn dùng công cụ `Edit`/`Write` (bị Lớp 1 `permissions.deny` kiểm soát chặt theo đường dẫn `//<REPO_ROOT>/...`).<br>2. Nếu câu lệnh chứa biến đường dẫn trực tiếp trong lời gọi ghi chuẩn, quy tắc `$DYNAMIC_WRITE` (F5/F16) vẫn chặn khi `cwd` nằm trong kho.<br>3. Cổng duyệt chuông A-4 kiểm soát các hành động nhạy cảm. | **P2** (Theo dõi & bổ sung mẫu nếu xuất hiện trong thực tế) |
| **RR-04** | **Kết nối mạng cấp thấp (`socket`, `http.client`, `net.connect`, `tls.connect`, `WebSocket`)** thay vì dùng `curl`, `wget`, `requests`, `httpx`, `urllib.request`, `fetch`, `axios`. | Các thư viện socket mức thấp chia tách tên máy chủ, cổng và phương thức HTTP thành nhiều lời gọi rời rạc hoặc luồng byte thô. | 1. Ghế không có sẵn token dịch vụ ngoài trong `env` (`CLAUDE_SEAT_ENV_WHITELIST`).<br>2. Mọi truy cập tới tệp token Facebook/Meta trên đĩa đều bị chặn bởi cả `permissions.deny`, `block_secret_leak.py` và `block_public_publish.py` trước khi kịch bản có thể đọc token để gửi đi. | **P2** (Ngoài mô hình đe doạ thông thường) |
| **RR-05** | **Kịch bản tự sinh nằm ngoài kho dự án (ví dụ ghi ra `/tmp/...` rồi thực thi gián tiếp qua trình thông dịch hoặc tiến trình nền tách rời)** có chuỗi gọi lồng vượt quá độ sâu `MAX_SCRIPT_DEPTH = 4`. | Để tránh vòng lặp vô hạn, `block_public_publish.py` giới hạn độ sâu đệ quy kịch bản ở mức 4 (vượt quá mức 4 sẽ bị chặn fail-closed) và dung lượng 200 KB. Tuy nhiên, nếu kịch bản gọi công cụ ngoài danh sách trình thông dịch chuẩn thì nội dung tệp đích không được đọc đệ quy. | 1. Khi vượt quá độ sâu 4 hoặc > 200 KB hoặc đường dẫn kịch bản chứa biến động `$VAR`, `block_public_publish.py` **chặn fail-closed (exit 2)**.<br>2. Nhật ký `operations/data/runs/` ghi nhận toàn bộ lệnh ghế đã gọi. | **P2** (Đã fail-closed với kịch bản động / quá cỡ / quá sâu) |

### 3.2. Mục «Hỏi Oan» (False-Positive / Over-Blocking Khi Phát Lại Lệnh Thật Của 8 Ghế)

> **Quy trình & Kết quả đo (`tin-20261014-222240-1ecb` & `tin-20261014-222432-71ee`)**: Vì bộ phát lại lệnh thật đọc bản ghi phiên tại `~/.claude/projects/*/*.jsonl` (dữ liệu nhạy cảm), phép đo phát lại do **PM (`claude-aiboss-office-pm`) trực tiếp thực thi** bằng công cụ `DANG-LAM/NOP/s17-pm-do_20261014/replay_office_hooks.py` (md5 `ab0edb18`, thích nghi từ bản `opc` `4befc894`; danh sách lệnh đã che lưu tại `DANG-LAM/NOP/s17-pm-do_20261014/s17c-phat-lai-lenh-that-47-ca.txt`).
> - **Tóm tắt số đo**: **47 lệnh/2 ngày** (bỏ trùng, từ 110 tệp phiên của ghế `content-writer`/`marketing-lead`, so sánh bộ hook `359165a` → `7ac6376`): **MỚI CHẶN 7** (tất cả đều là lệnh thử cố ý của PM/backend), **NỚI 0**, **0 hỏi oan**; hạn chế: mẫu nhỏ (47 lệnh) và phần lớn là lệnh thử, chưa có khối lượng lớn lệnh việc thật của khách — **đo lại sau một tuần dùng thật bằng công cụ PM**.

| Nhóm lệnh qua phép đo phát lại (47 lệnh / 2 ngày) | Số lượng | Hook liên quan | Kết luận & Hướng xử lý |
|---|---|---|---|
| Lệnh thử cố ý ghi vào `operations/data/approvals/...` và `operations/...` (`echo ... >> .../operations/data/approvals/...`) | `4` (Mới chặn) | `lock_raw_inputs.py` | Chặn đúng theo yêu cầu bảo vệ sổ vận hành (`S17-10`). Không phải hỏi oan. |
| Lệnh thử cố ý gửi HTTP POST ra ngoài (`curl -X POST https://api.resend.com/emails -d ...`, `curl ... -X POST https://api.sendgrid.com/v3/mail/send -d ...`) | `2` (Mới chặn) | `block_public_publish.py` (`Hook 2.1`) | Chặn đúng theo cổng chặn xuất bản/gửi ra ngoài (`Hook 2.1`). Không phải hỏi oan. |
| Lệnh gọi `python3 tools/inbox-reader/fetch_page_messages.py --help` | `1` (Ghi sổ) | `guard_bulk_send.py` / `block_public_publish.py` | Trong bản `S17d` (`F15b`), `block_public_publish.py` đã miễn cho `<REPO_ROOT>/tools/inbox-reader/fetch_page_messages.py` khi gọi ở chế độ chỉ đọc (bao gồm `--help` / `-h`, không có cờ ghi) và thoả kiểm tra containment `realpath`; riêng `guard_bulk_send.py` vẫn giữ ghi nhận sổ duyệt cho `fetch_page_messages.py` theo thiết kế gốc (mức ảnh hưởng thấp, lưu ý khi đo lại sau 1 tuần). |
| Lệnh công việc thật bị hỏi oan / chặn oan (False-Positive) | **`0`** | — | **47 lệnh/2 ngày: 0 hỏi oan; đo lại sau một tuần dùng thật bằng công cụ PM.** |

---

## 4. Tiêu Chí Phân Loại Lỗi và Gộp Nhánh (Merge Criteria)

Từ phiên bản S17d, mọi kết quả rà soát an toàn (bao gồm các vòng soi của Hermes và kiểm thử nội bộ) áp dụng bộ tiêu chí phân loại thống nhất sau:

### 4.1. Lỗi mức `P1` — Chặn gộp nhánh (Merge Blocker)
Một phát hiện được xếp loại **P1 (chặn gộp)** khi và chỉ khi thuộc một trong các trường hợp nằm trong Mô hình đe doạ (Mục 1.2):
1. **Hở Lớp 1 (Cô lập ghế & Rào quyền công cụ)**:
   - Thiếu hoặc sai lệch quy tắc `permissions.deny` neo theo `//<REPO_ROOT thật>/` trong `.claude/settings.json` của ghế hoặc gốc kho.
   - Điểm khởi chạy `claude` bỏ qua `spawnClaudeSeatProcess()`, `ensureSeatSettingsAnchored()`, `buildClaudeSeatArgv()`, hoặc `buildClaudeSeatEnv()`.
   - Lọt biến môi trường nhạy cảm hoặc cờ tắt hook (`AIBOSS_DISABLE_HOOK_2_1`, `AIBOSS_TEST_MODE`) qua `buildClaudeSeatEnv()`.
2. **Hở Lớp 2 đối với các mẫu lệnh tự nhiên trong Mô hình đe doạ**:
   - Các lệnh shell, Python một dòng (`python3 -c`), Node một dòng (`node -e`), heredoc, hoặc đường ống (`| xargs`) phổ biến mà LLM tự sinh ra khi thao tác tệp/mạng hoặc khi bị prompt injection đơn giản từ dữ liệu đầu vào nhưng không bị hook chặn (ví dụ: `curl`/`wget` có cờ ghi mà không có URL tĩnh thuộc whitelist, `Path(os.path.join(...)).write_text(...)`, literal dùng escape `\x2f` trỏ vào vùng khoá, hoặc miễn nhầm kịch bản qua symlink).
3. **Lỗi hồi quy vận hành (Operational Regression)**:
   - Làm kho hợp lệ (kể cả kho đặt ở đường dẫn có khoảng trắng, ký tự `{}`, `[]`, hoặc qua symlink `/tmp` ↔ `/private/tmp`) không khởi động được hoặc bị từ chối nhầm sau khi đã chạy `prestart` / tự sinh lại.

### 4.2. Phát hiện mức `P2` — Ghi vào Sổ rủi ro tồn dư, không chặn gộp (Non-Blocking / Residual Risk)
- Các biến thể lách bộ phân tích tĩnh bằng kỹ thuật che giấu phức tạp ngoài mô hình đe doạ (như `RR-01` đến `RR-05` ở Mục 3: mã hoá `base64`/hex lúc chạy, `eval` đa tầng, aliasing hàm ghi qua nhiều bước, giao thức socket thô, trình biên dịch ngoài).
- Khi phát hiện biến thể thuộc nhóm này trong quá trình rà soát: **ghi nhận bổ sung vào bảng Sổ rủi ro tồn dư (Mục 3) hoặc lộ trình cải tiến tiếp theo, không dùng làm lý do chặn gộp nhánh hiện tại**.
