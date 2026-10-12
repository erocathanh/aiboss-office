# 🤖 AGENTS.md — CHỈ DẪN VẬN HÀNH & SỔ GHẾ DỰ ÁN AIBOSS-APP-CHAT

> 📌 **Tệp quy tắc tự động nạp (Auto-load Rulebook)** cho Antigravity (Gemini), Claude Code và các AI Agent làm việc trong kho mã `~/Projects/aiboss-app-chat/`.
> Mọi quy định tại đây được chắt lọc từ `CLAUDE.md` của các ghế tiền nhiệm, quy chuẩn sinh thái `~/Projects/CLAUDE.md`, và các bài học đo đạc thực tế có đối chứng.

---

## 1. 🎯 BỐI CẢNH VÀ MỤC TIÊU DỰ ÁN
- **Tên dự án:** `aiboss-app-chat` (trước đây là `phong-ban-ai`).
- **Bản chất:** Ứng dụng web chạy local tại máy, thay thế cho cửa sổ dòng lệnh (terminal). Cho phép Owner trò chuyện song song với nhiều trợ lý AI (chia 1 / 2 / 4 ô giao diện, mỗi ô nối thẳng với 1 session AI agent trên máy).
- **Cổng dịch vụ:** Chạy tại **`http://localhost:4319`**.
  - ⚠️ **LUẬT CỨNG:** Ứng dụng chạy TẠI MÁY, KHÔNG deploy công khai ra ngoài mạng. Không bao giờ chiếm dụng hoặc đổi cổng `4319`.
- **Chủ sở hữu (Owner):** Anh **Eroca Thanh** (xưng «em», gọi «anh»).

---

## 2. 🏷️ ĐỊNH DANH CÁC GHẾ HOẠT ĐỘNG (AGENT ROLES)
- **Tên ghế trong MCP broker của workspace này:** `antigravity-aiboss-app-chat`
  - Lịch sử tên: `gemini-aiboss-app-exe` (tới 10/10/2026) → `antigravity-aiboss-office` (10/10–12/10/2026; lúc 09:5x 12/10 anh Thanh chuyển ghế đó sang nhà dự án aiboss-office) → `antigravity-aiboss-app-chat` (12/10/2026, theo luật nhà: mỗi dự án MỘT ghế Antigravity, tên = `antigravity-<mã-dự-án>`). Tin cũ gửi tên cũ giữ nguyên làm dấu vết; tin mới dùng tên mới.
- **`antigravity-aiboss-app-chat`**: Ghế Gemini trên nền tảng Google Antigravity — người viết mã của **đội B** (anh Thanh duyệt 10/10/2026): làm ở một cây git riêng (worktree), tránh các tệp của đường đổi bản mà đội A (`claude-aiboss-app-exe`) đang sửa. Người giao việc duy nhất: `claude-aiboss-app-pm`. Người soát: `hermes-aiboss-app-reviewer` (khác mô hình).
- **`claude-aiboss-app-exe`**: Ghế Claude Code (ô 4) — chuyên trách viết mã nguồn trực tiếp cho ứng dụng.
- **`claude-aiboss-app-pm`**: Ghế PM điều phối tính năng, quản lý tiến độ và phạm vi dự án.
- **`hermes-aiboss-app-reviewer`**: Ghế soi mã độc lập, giữ cổng chất lượng và ra verdict trước khi build.
- **Quy ước mở đầu tin nhắn:** `FROM: [tên-ghế] / TO: [người-nhận]`.

---

## 3. 📬 PHỐI HỢP LIÊN AGENT QUA LOCAL MCP BROKER (`agent-broker`)
Toàn bộ AI agent giao tiếp qua hàng đợi tin nhắn chuẩn hóa Local MCP Broker:
- **Thư mục dữ liệu:** `~/Operations/kenh-mcp/`
  - `hop-thu.jsonl`: Nguồn sự thật (Append-only NDJSON chứa mọi tin nhắn).
  - `da-doc.json`: Sổ ký nhận (ACK) — chứng chỉ pháp lý xác nhận ai đã đọc tin nào.
  - `CANH-BAO-TIN-TREO.md`: Nhật ký tin nhắn > 15 phút chưa được ACK.
- **4 Công cụ MCP:**
  1. `nhan_tin(nguoi_nhan="<tên-ghế>", chi_tin_chua_doc=true)`
  2. `danh_dau_da_doc(ma_tin=..., nguoi_doc="<tên-ghế>")` (Bắt buộc ký ngay sau khi đọc)
  3. `gui_tin(nguoi_gui="<tên-ghế>", nguoi_nhan=..., tieu_de=..., noi_dung=...)`
  4. `soat_hop_thu(nguong_treo_phut=15)` (Gọi kiểm tra ngay sau mỗi lần gửi)
- **Kênh phối hợp chéo:** Nếu trao đổi với `claude-phong-ban-pm`, append song song bản tóm tắt vào:
  `~/idea/inbox/cross-channels/mcp-broker--phongbanpm-x-antigravity.md`
  *(Chỉ dùng `cat >>` để giữ nguyên inode, TUYỆT ĐỐI KHÔNG dùng `sed -i` hay ghi đè).*

---

## 4. ⚡ CƠ CHẾ ĐÁNH THỨC 0 LƯỢT MÔ HÌNH (REACTIVE WAKEUP)
- **TUYỆT ĐỐI KHÔNG polling bằng LLM:** Không dùng vòng lặp gọi model hay `schedule` lặp ngắn vì mỗi vòng đốt prompt token thật của Owner.
- **Cơ chế chuẩn ở tầng OS:**
  Khởi chạy tiến trình shell nền theo dõi hộp thư:
  ```bash
  /Users/erocathanh/Operations/scripts/cho-tin-moi.sh antigravity-aiboss-app-chat 900 5
  ```
  - Khi không có tin: Shell ngủ (`sleep 5s`), mô hình hoàn toàn ngủ (**0 token, 0 chi phí**).
  - Khi có tin mới gửi đến ghế: Shell thoát `exit 0`, hạ tầng Antigravity tự động kích hoạt phiên làm việc (Reactive Wakeup).
  - Sau 15 phút không có tin: Shell thoát an toàn `exit 2` để đánh thức định kỳ.

---

## 5. 🔴 CÁC LUẬT CỨNG BẢO VỆ HỆ THỐNG (HARD RULES)

### ① Tuyệt đối cấm cờ bypass quyền
- **CẤM:** Không dùng, không gợi ý và không đưa vào bất kỳ tài liệu nào cờ `--dangerously-skip-permissions` (Quyết định tối cao của Owner).

### ② Môi trường Node & Thực thi lệnh
- **Node mặc định của máy:** `v22.23.1` (dùng cho Hermes và OpenClaw cổng 18789). **TUYỆT ĐỐI KHÔNG ĐỔI**.
- **Node riêng của kho này:** Ghim `24.19.0` qua `.node-version`.
- **Lệnh build / test chuẩn:**
  ```bash
  export PATH="/opt/homebrew/bin:$PATH" && fnm exec --using=24.19.0 -- npx next build
  ```

### ③ Bảo mật bí mật & Chứng chỉ
- **KHÔNG** commit `.env*`, api key, secret, mật khẩu vào Git.
- Mọi token / secret chỉ được đọc từ dotfile tại Home (`~/.sb-new-key`, `~/.vercel-token`...), tuyệt đối không in giá trị ra màn hình chat.

### ④ Luật viết chữ «KHÔNG»
- Khi cần biểu thị phủ định, **bắt buộc gõ chữ «không» hoặc «KHÔNG»**.
- **CẤM** dùng ký hiệu vòng tròn gạch chéo thay cho chữ phủ định trong chat, trong commit và trong mã nguồn.

### ⑤ Luật Khởi động lại Server App (Cổng 4319)
- **Mặc định:** Còn ghế khác đang chạy => **KHÔNG** khởi động lại server.
- **Ngoại lệ:** Chỉ khởi động lại khi Owner xác nhận **2 LẦN LIÊN TIẾP** trong ô chat.
- **Cách khởi động:** Không gọi kickstart trực tiếp trong phiên chạy (tránh tự giết tiến trình đang gọi). Phải hẹn lệnh tách rời:
  ```bash
  nohup zsh -c 'sleep 30; launchctl kickstart -k gui/$(id -u)/com.eroca.phong-ban-lan' &
  ```

### ⑥ Cổng kiểm soát Build & Git Commit
- **Commit chạm `src/`, `du-lieu/`, `next.config.*`, `package.json`, `tsconfig.json`**: BẮT BUỘC phải build thành công trước khi commit:
  > 🔴 **`du-lieu/` thêm 06/09/2026.** `src/lib/nhan-su.ts:1` nhập TĨNH `du-lieu/nhan-su.json` ⇒ tệp đó
  > BỊ BIÊN DỊCH VÀO BẢN DỰNG. Sửa nó mà không dựng thì dữ liệu mới KHÔNG xuất hiện, và người sửa
  > tưởng mình sửa hỏng. Nó không phải `src/`, cũng không phải markdown — nên rơi vào khe giữa hai
  > dòng của mục này. **Câu hỏi đúng KHÔNG phải «tệp nằm ở thư mục nào» mà là «`next build` có
  > biên dịch nó không».**
  ```bash
  if npx next build 2>&1 | iconv -f utf-8 -t utf-8 -c | grep -q 'Compiled successfully'; then
    git commit -m "..." -- <pathspec>;
  else
    echo "BUILD THẤT BẠI - DỪNG COMMIT"; exit 1;
  fi
  ```
- **Commit chỉ chạm tài liệu / markdown** (và KHÔNG chạm tệp nào bị `next build` biên dịch): Không bắt buộc build.
- **Kiểm tra TypeScript:** Luôn kèm `iconv` để tránh mất byte lỗi:
  ```bash
  npx tsc --noEmit 2>&1 | iconv -f utf-8 -t utf-8 -c | grep -c 'error TS'
  ```

---

## 6. 🔬 KỶ LUẬT ĐO ĐẠC — ĐO THẬT, KHÔNG ĐOÁN
1. **Rỗng không phải là 0:** Kết quả trả về rỗng có thể do pipe bị câm hoặc lệnh gãy. Mọi kết luận «0 lỗi / sạch» phải đi kèm **đối chứng dương** (Positive Control) trên mẫu thử chắc chắn có.
2. **Kênh là chỗ để lại, không phải chỗ gọi:** `gui_tin` trả về `thanh_cong: true` chỉ có nghĩa là byte đã ghi xuống đĩa, KHÔNG có nghĩa bên kia đã đọc. Chỉ kết luận đối tác đã nhận khi thấy chữ ký ACK trong `da-doc.json`.
3. **Giữ nguyên inode tệp kênh:** Khi ghi vào các kênh trao đổi `.md`, chỉ dùng `cat >>` hoặc heredoc `>>`. Cấm dùng `sed -i` hay ghi đè tạo file mới làm đứt mắt canh `launchd` / `tail -f`.

## 📸 THỬ GIAO DIỆN THÌ CHỤP LẠI — skill `chup-trang-web` (Owner 05/09/2026)

**Luật một câu: đội này hay thử giao diện; cần ảnh thì dùng skill `chup-trang-web`, và ảnh lưu
vào `ai/anh-giao-dien/` trong kho — KHÔNG để nằm lại ở Desktop.**

```bash
zsh ~/Operations/scripts/chup-trang.sh <địa-chỉ> <tên-tệp>     # RONG=390 cho khổ điện thoại
```
🔴 **CHỤP BẢN CŨ TRƯỚC KHI SỬA.** Sửa xong mới nhớ thì bản cũ mất vĩnh viễn, và mọi câu
«trước nó thế nào» sau đó đều thành lời kể.
📖 Khuôn tên tệp + ba điều bắt buộc: `ai/anh-giao-dien/README.md`
