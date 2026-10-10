# DECISION LOG — `aiboss-app-chat`

> Ghi **NỐI ĐUÔI**. Không sửa mục cũ — sai thì ghi mục mới đính chính và trỏ về mục cũ.
> Mỗi mục phải có: chốt gì · **số đo lúc chốt** · ai chốt · điều kiện mở lại.

---

## Q-001 · 30/08/2026 06:28 · Tên dự án Vercel — GIỮ NGUYÊN
**Chốt:** giữ `phong-ban-ai-mockup`, không đổi theo tên kho.
**Số đo lúc chốt:**
```
phong-ban-ai-mockup.vercel.app     → 200 · 11.983 byte
aiboss-app-chat-mockup.vercel.app  → 404 ·    107 byte
đối chứng âm, một tên bịa          → 404 ·    107 byte   ⇒ hai vỏ 404 giống nhau ⇒ cái 200 là trang thật
```
**Lý do:** địa chỉ công khai **sinh ra từ tên dự án**, đổi tên là địa chỉ cũ chết và không có chuyển hướng.
Đây là trang mẫu, loại người ta hay gửi đi, và không ai biết hiện có ai đang giữ đường dẫn đó.
Đổi lại chỉ được «tên nhìn cho khớp mắt»: kho nối với dự án bằng MÃ, không bằng tên.
**Ai chốt:** `claude-aiboss-app-pm` · `claude-phong-ban-pm` · `claude-aiboss-app-exe` — 3/3.
Owner đã trao quyền quyết cho team app («họ đồng ý là tôi đồng ý»).
**Việc kèm theo:** thêm một dòng chú vào `~/Operations/ha-tang/VERCEL-BAN-DO.md` cạnh dòng 368.
**Mở lại khi:** có tên miền riêng che chắn phía trước, lúc đó đổi tên không giết địa chỉ nào.

---

## Q-002 · 30/08/2026 06:24 · Chuyển trạng thái sang SQLite — CHƯA
**Chốt:** giữ JSON, chưa chuyển `.trang-thai/` sang cơ sở dữ liệu.
**Số đo lúc chốt:**
```
kho-phien.ts:43-48  ghi tệp tạm rồi đổi tên  ⇒ ĐÃ ghi nguyên tử, có sẵn chú thích giải thích
8 bản o-phien.json (1 sống + 7 sao lưu tay)  ⇒ 8/8 hợp lệ · 0 tệp hỏng · 0 tệp rỗng
đếm chỗ có khoá                              ⇒ 0
```
**Lý do:** ghi đã nguyên tử; không có bằng chứng mất dữ liệu; và hai ca hỏng thật hôm nay
(máy chủ mồ côi ghim đường dẫn cũ · va số hiệu trong tệp `.md`) thì cơ sở dữ liệu đều **không ngăn được**
— ca thứ nhất vẫn thành hai cơ sở dữ liệu ở hai đường dẫn.
**Một tiền đề bị lật:** ban đầu tưởng 7 tệp `.truoc-*` là triệu chứng sợ ghi đè. Đọc tên chúng ra
(`truoc-doi-o2`, `truoc-tra-o2`, `truoc-xep-o`…) thì đó là **sao lưu trước khi sửa tay**, đúng luật nhà.
Là kỷ luật, không phải bệnh — và không phải bằng chứng cho bệnh đang bàn.
**Ai chốt:** `claude-aiboss-app-pm` (PM của app).
**Mở lại khi:** đo được ít nhất **một ca mất bản cập nhật thật** — một ô biến khỏi sổ mà không ai xoá.
Lúc đó đọc `~/Development/openclaw/src/infra/sqlite-wal.ts` (82 dòng, có bài kiểm) TRƯỚC khi gõ dòng nào.

---

## Q-003 · 30/08/2026 06:36 · Đưa việc đánh thức ra dịch vụ ngoài (Railway) — KHÔNG, cho bài này
**Chốt:** không dùng dịch vụ ngoài để chữa việc «đóng tab thì các ô ngừng nói chuyện».
**Số đo lúc chốt:**
```
chay-agent.ts:188  spawn(claude …)  · tệp không có 'use client'  ⇒ tiến trình chạy PHÍA MÁY CHỦ
api/danh-thuc:38   xepHang() rồi return                          ⇒ cổng chỉ xếp hàng, không gọi ai
UngDung.tsx:1147   setInterval 5 giây + lọc tab ẩn               ⇒ TRÌNH DUYỆT là thứ bấm nút hộ
```
**Lý do:** đường vào không nghẽn (cổng đang trả 200); việc chạy bắt buộc ở máy Owner nên dịch vụ ngoài
không chạy hộ được; và chỗ nghẽn là **một quyết định trong mã** (`UngDung.tsx:1115` — máy chủ cố ý
không tự chạy vì sợ hai nơi cùng gọi một phiên). Dịch vụ ngoài đưa tin tới cửa rồi máy chủ vẫn đứng im.
**Thay bằng:** P0-1 + P0-2 — cùng một cái khoá, giải cả hai bệnh.
**Vẫn đúng chỗ cho bài khác:** Owner ở ngoài nhà muốn ra lệnh cho ghế → P3-1, làm sau P0.

---

## Q-004 · 30/08/2026 · Nơi để tài liệu AI của dự án
**Chốt:** `~/Projects/aiboss-app-chat/ai/`, khuôn theo `claude-master-app/ai/` và `youtube-modeling/ai/`.
**Ai chốt:** Owner.

## [2026-08-30 09:3x] BỎ `navigator.locks` khỏi P0-2a — và vì sao vẫn ghi lại nó

**Chốt:** ⛔ dùng `navigator.locks` để chống hai tab cùng nhặt yêu cầu. Bỏ điều khoản ⑫ khỏi hợp đồng.
**Số đo lúc chốt:** `kho-danh-thuc.ts` 0 async/await thật (chữ `await` duy nhất nằm trong chú thích
dòng 17) · `nhan/route.ts` chỉ một `await` ở dòng 20 rồi đồng bộ tới hết · đúng MỘT tiến trình nghe
cổng 4319 (pid 16624) · 0 cấu hình cluster ⇒ hai tab ⛔ chen được vào nhau ⇒ bệnh ⛔ tồn tại.
**Ai chốt:** `claude-phong-ban-pm` tự rút đề bài của mình, `claude-aiboss-app-pm` đo lại và đồng ý.
**Điều kiện mở lại:** phép T3-doi-chung (hai tab, một yêu cầu, bản CHƯA SỬA) ra ĐỎ.

⚠️ **GIỮ LẠI CHO NGƯỜI SAU — lỗ của `navigator.locks`, kẻo ai đó lại chọn nó rồi vấp:**
```
navigator.locks ĐÒI SECURE CONTEXT.
chay-lan.sh:102  exec npx next start -H 0.0.0.0 -p 4319
  localhost:4319      → secure     ⇒ navigator.locks CÓ
  http://<IP-LAN>:4319 → ⛔ secure ⇒ navigator.locks = undefined  (đường Owner mở bằng điện thoại)
⇒ Cắm thẳng = trên Mac có khoá, trên điện thoại ÂM THẦM ⛔ khoá gì.
   Và phép thử chạy ở localhost sẽ XANH trong khi bệnh còn nguyên ở đường dùng hằng ngày.
⇒ Ai dùng nó: BẮT BUỘC phát hiện tính năng + lùi về BroadcastChannel (⛔ đòi secure context),
   và phép thử phải chạy CẢ localhost LẪN IP-LAN, in ra đang ở nhánh nào.
```

## [2026-08-30 09:1x] HOÃN v3 (lease/ack) · làm S1 S2 S3 trước · 🗓 HẸN ĐỌC SỐ 06/09/2026

**Chốt:** ⛔ viết v3 bây giờ. Làm ba lát nhỏ S1 S2 S3, chạy một tuần, **06/09/2026 đọc số rồi mới quyết**
v3 hay P0-2b lên trước.

**Số đo lúc chốt (30/08):**
```
lượt chạy thật, 3.541 lượt / 18 ghế : trung vị 20 GIÂY · >3 phút 1% · >8 phút 0%
   ⇒ hạn 3 phút hiện tại ĐÃ phủ 99% ⇒ «bận quá hạn» là bệnh HIẾM
ca chuông chết 08:00:17 (hết hạn 08:03:17): ô đích RẢNH 07:57:48→08:08:43 (655 giây)
   ⇒ ⛔ phải «bận quá hạn». Thủ phạm: ⛔ CÓ AI THĂM DÒ (trình duyệt đóng / tab ẩn)
   ⇒ thuộc cửa ①②, thứ v3 ⛔ chạm tới, CHỈ P0-2b chữa
ca mất tin ĐO ĐƯỢC tới nay: 1, và nó thuộc cửa ①②
sổ hàng đợi giữ 10 phút ⇒ ⛔ đếm được quá khứ ⇒ bộ đếm phải VỪA CHẠY VỪA ĐẾM
```
**Ai chốt:** `claude-aiboss-app-pm`, sau khi Owner nói *«cứ làm đi, sai thì sửa… việc đo lại sau 1 tuần
là việc đưa vào FILE của thư mục ai chứ ⛔ phải nói trên chat rồi lại quên»*.

**Điều kiện mở lại / cách quyết ngày 06/09:**
```
chạy:  bash ai/do-lai-06-09.sh
       (đã thử 3 đường: thiếu sổ → KÊU · sổ 40 ca → in bảng · sổ có dòng hỏng → BÁO)
đọc:   cửa ①② vs cửa ④⑤
       ①② > ④⑤ ⇒ P0-2b LÊN TRƯỚC       ④⑤ ≥ ①② ⇒ v3 LÊN TRƯỚC
       0 ca cả tuần ⇒ HOÃN CẢ HAI, làm việc khác
⚠️ Đối chứng bắt buộc: tổng cửa phải BẰNG tổng dòng sổ. Lệch ⇒ ⛔ tin tỉ lệ.
```
**Lật lại:** v3 đầy đủ nằm ở `ai/NGHIEN-CUU-heartbeat.md` mục «v3 — HỢP ĐỒNG BẰNG BẢNG TRƯỜNG + SỐ»
(600 dòng, đã qua 1 cửa gật + 1 cửa bác). ⛔ vứt gì cả — chỉ chờ số gọi tên.

🕳 **Vì sao có mục này:** 30/08 cả nhà soi SÁU VÒNG một cơ chế, hai cửa duyệt, mà **⛔ ai hỏi
«bệnh đó có phải bệnh đang giết ta ⛔»**. Chính tôi khai «lượt chạy 2–5 phút» để chốt con số
mà ⛔ hề đo — đo ra là 20 giây. Đừng lặp lại: **ĐỌC SỐ RỒI HÃY QUYẾT.**

## [2026-08-30 09:2x] 🔴 CHẶN: đồng hồ 1 tuần CHƯA chạy — máy chủ còn ở bản cũ

**Sự việc:** `claude-aiboss-app-exe` giao S1 S2 S3 xong, commit `31a3dbb`, build xanh. Nhưng:
```
máy chủ đang phục vụ : pid 16624 · khởi 29/08 20:55:11
commit 31a3dbb        : 30/08 09:18:42        ⇒ máy chủ GIÀ HƠN 12,5 GIỜ
.next dựng lúc        : 30/08 09:18:07        ⇒ bản dựng ĐÃ SẴN, chỉ chờ nạp
~/Operations/dem-cua-mat-tin.jsonl : CHƯA TỒN TẠI (0 dòng)
```
⇒ **S1 ⛔ chạy dòng nào. Tuần đo CHƯA bắt đầu.**
🔴 Tới 06/09 mà ⛔ ai khởi động lại ⇒ `do-lai-06-09.sh` in «⛔ có sổ đếm ⇒ S1 CHƯA chạy»
⇒ ta lại quyết bằng CẢM GIÁC — đúng thứ cả ngày 30/08 dựng ra để tránh.

**Ai phát hiện:** `claude-aiboss-app-exe` tự nêu trong báo cáo bàn giao, ⛔ giấu.
**Vì sao exe ⛔ tự restart:** cắt ngang lượt của ghế khác + luật đòi Owner xác nhận.
**Điều kiện gỡ chặn:** Owner đồng ý khởi động lại (kiểu hẹn-tách-rời để ⛔ cắt lượt đang chạy).
**Nghiệm thu sau khi gỡ:** `ps -o lstart -p <pid mới>` phải MỚI hơn 09:18:42 · cổng 4319 → 200
kèm đối chứng âm 404 · và ca mất tin đầu tiên phải sinh dòng trong sổ đếm.

## [2026-08-30 09:25:03] ✅ GỠ CHẶN S0 — đồng hồ 1 tuần BẮT ĐẦU CHẠY

**Owner cho phép:** *«tôi ⛔ giao việc ghế nào ngoài team build app lúc này, nên khởi động lần này
là phụ thuộc team em»*.
**Số đo, do script TỰ ĐO TỰ GHI (`/tmp/khoi-dong-lai-30-08.log`):**
```
kickstart          09:24:58
pid CŨ  16624 khởi 29/08 20:55:11   (bản CŨ, ⛔ có S1)
pid MỚI 51256 khởi 30/08 09:25:03   ⇒ SAU commit 31a3dbb (09:18:42) ⇒ ĐANG CHẠY BẢN CÓ S1 ✅
cổng 4319   200 · thân 168.297 byte
ĐỐI CHỨNG ÂM 404 · thân 6.244 byte  ⇒ vỏ KHÁC thân ⇒ cái 200 là trang THẬT
sổ ô còn đủ 6 ô                      ⇒ ⛔ mất liên kết ô↔phiên
sổ đếm S1: chưa có — ĐÚNG, nó chỉ sinh khi có ca mất tin ĐẦU TIÊN
```
🗓 **MỐC ĐỒNG HỒ: 30/08/2026 09:25:03 → đọc số 06/09/2026** bằng `bash ai/do-lai-06-09.sh`.

🕳 **BÀI HỌC VẬN HÀNH — khởi động lại giữa lượt thì ĐUÔI LƯỢT BIẾN MẤT KHỎI SỔ CHAT**
```
Owner thấy tin của tôi đứt ngang giữa câu sau khi F5, tưởng việc ⛔ chạy.
Sự thật: việc CHẠY ĐỦ. Máy chủ chết giữa lúc ghế đang ghi ⇒ phần đuôi ⛔ kịp vào bản ghi phiên.
⇒ VIỆC XONG mà DẤU VẾT MẤT — nguy hơn việc ⛔ xong, vì người đọc kết luận ngược.
✅ Cách chống (đã dùng ở đây, giữ làm nếp): mọi việc có thể GIẾT CHÍNH MÌNH thì phải
   để script TỰ ĐO TỰ GHI ra tệp NGOÀI lượt. Bằng chứng phải sống lâu hơn người tạo ra nó.
```

---

## Q-005 · 30/08/2026 09:37 · Đổi tên máy trong mạng riêng: `openclaw` → `aiboss`
**Chốt:** đổi. Owner ra lệnh, lý do: không muốn app của mình mang tên một dự án khác.

**Địa chỉ MỚI để vào app từ điện thoại:**
```
https://aiboss.tailcd520a.ts.net:8443/      ← app aiboss-app-chat (proxy về 127.0.0.1:4319)
https://aiboss.tailcd520a.ts.net/           ← openclaw            (proxy về 127.0.0.1:18789)
```

**Số đo TRƯỚC khi bấm (09:37:46):**
```
tên máy cũ  openclaw · DNS openclaw.tailcd520a.ts.net
tên «aiboss» có trùng máy nào trong 5 máy của tailnet: KHÔNG
31 tệp trên máy trỏ vào tên cũ (~/Operations 6 · aiboss-app-chat 1 · openclaw 4 · ~/.claude 20)
```

**Một chỗ SUÝT HỎNG, ghi lại vì nó sẽ lặp với bất kỳ ai đổi tên máy lần sau:**
```
Đổi tên xong: DNS tên mới phân giải ĐÚNG · app nội bộ 127.0.0.1:4319 vẫn 200
NHƯNG CẢ HAI CỬA VẪN CHẾT — vì cấu hình `tailscale serve` còn gắn CỨNG tên cũ.
   `tailscale serve status` sau khi đổi tên vẫn in «openclaw.tailcd520a.ts.net»
CHỮA: tailscale serve reset, rồi dựng lại ĐÚNG hai đường theo mốc đã ghi trước khi bấm:
   tailscale serve --bg --https=443  http://127.0.0.1:18789
   tailscale serve --bg --https=8443 http://127.0.0.1:4319
📌 Bài học: đổi tên máy KHÔNG tự kéo theo cấu hình phục vụ. Ghi mốc TRƯỚC khi bấm là thứ cứu được,
   vì nếu không có mốc thì sau khi reset sẽ không ai nhớ hai đường đó trỏ vào cổng nào.
```

**Nghiệm thu (09:39:27) — xoá tệp tạm trước MỖI lần gọi:**
```
aiboss.tailcd520a.ts.net:8443/        → 401 ·     12 byte   app, đúng lớp hỏi mật khẩu
aiboss.tailcd520a.ts.net/             → 200 · 14.406 byte   openclaw
openclaw.tailcd520a.ts.net:8443/      → 000                  tên cũ đã chết, đúng dự đoán
khong-co-may-nay...:8443/             → 000                  ĐỐI CHỨNG ÂM
⇒ 401 = máy thật trả lời · 000 = tên không phân giải ⇒ hai loại phân biệt được rõ
```

**Hai chỗ phép đo của tôi bị hở, sửa rồi mới lấy số:**
```
① không xoá tệp tạm giữa các lần gọi ⇒ dòng THẤT BẠI vẫn hiện «14.406 byte» của lần TRƯỚC
   ⇒ suýt thành bằng chứng giả cho một địa chỉ đã chết
② đối chứng âm SAI TẦNG: một đường dẫn bịa trên CÙNG máy cũng trả 401,
   vì lớp mật khẩu chặn trước khi tới trang ⇒ không phân biệt được gì.
   Phải đổi sang một TÊN MÁY không tồn tại thì mới phân biệt.
```

**Lùi lại:** `tailscale set --hostname=openclaw` rồi dựng lại serve y hệt hai dòng trên.
**Nhật ký đầy đủ:** `~/Operations/tra-cuu/2026-08-30_doi-ten-may-tailscale.log`
**Còn nợ:** rà 31 tệp trỏ tên cũ — đọc từng chỗ để tách cấu hình sống khỏi sổ sách, chưa làm.

(ghi 30/08/2026 09:46 London · claude-phong-ban-pm — Owner giao lưu sổ sau khi đổi tên xong)


---

## Q-006 · 10/10/2026 11:13 · Hai đội viết mã song song · đổi tên ghế Antigravity
**Chốt (anh nguyên văn, ô PM):** «em làm cái này đi tôi muốn đổi tên gemini-aiboss-app-exe thành antigravity-aiboss-office vì tên dự án này sắp tới sẽ đổi em thảo luận với pm-r3 sau đó tiến hành sớm đề nghị của em này».
Đề nghị được duyệt: **đội A** (đường đổi bản phục hồi) — `claude-aiboss-app-exe` viết, Hermes soát · **đội B** — cây git riêng, tránh bảy tệp của thiết kế vòng 1, hai việc đầu là sổ ghế đọc lúc chạy và VE-015; đầu ra đội B soát xong trước, chờ đường đổi bản có rồi lên app cùng lúc.
**Số đo lúc chốt:** exe đang làm thiết kế vòng 2 (bộ đếm 2/3) · ghế Antigravity ký tin lần cuối 12/09 (`~/Operations/kenh-mcp/da-doc.json`), tên mới 0 dòng · pm-r3 (`claude-bos-funnel-pm`) đồng ý 11:29.
**Việc kèm theo:** `AGENTS.md` (commit 427f303) và `GEMINI.md` (commit f93486f) đổi tên ghế, chưa đẩy · đề đội B gửi lại tên mới (tin-20261010-103054-5d46).
**Ai chốt:** anh Thanh.
**Mở lại khi:** anh đổi cách chia đội, hoặc đường đổi bản nhập kho và bảy tệp hết bị giữ.

## Q-007 · 10/10/2026 11:31 · Hermes chỉ soát · hai phiên soát song song cho hai đường
**Chốt (anh nguyên văn, ô PM):** «từ giờ hermes chỉ review nên khi cần review thì em nhớ session của hermes review của dự án này để đường A và đường B có 2 người review chạy song song không phải xếp hàng chờ. Em vẽ luôn sơ đồ tổ chức lưu file dự án đi nhé. lưu luôn DECISION của tôi.»
**PM hiểu thành việc (anh sửa nếu sai):**
- Hermes chỉ soát cho dự án app ⇒ `hermes-build-app` thôi viết mã (PM huỷ đường lui «đội B sang hermes-build-app» đã ghi 11:39) · trang round của app không lui sang `hermes-web-noibo` nữa: `antigravity-web-noibo` tắc thì PM tự dựng (đường lui cuối) và báo anh.
- Mỗi đường một phiên soát riêng của `hermes-aiboss-app-reviewer`, nhớ mã phiên, lần soát sau nối lại đúng phiên đó; hai phiên chạy song song.
**Số đo lúc chốt:** người soát gpt-6-astra (OpenAI Codex) · exe và PM claude-opus-5-5 · đường A = phiên `20261010_082735_6338e9` (soát vòng 1 thiết kế đổi bản, verdict d53f1b4c) · đường B chưa có phiên · script phóng người soát (27cd0e61) chưa nhận mã phiên nối · câu lệnh này nằm trong hàng chờ ô PM lúc 11:31:18 (ảnh `ai/anh-giao-dien/2026-10-10_nut-dung-len-tren_cu_4319-may-tinh-2584.png`).
**Việc kèm theo:** sổ phiên `/Users/erocathanh/idea/inbox/aiboss-app-noibo/SO-PHIEN-SOAT-HERMES.md` · sơ đồ `ai/SO-DO-TO-CHUC.md` + `ai/SO-DO-TO-CHUC.svg` · hồ sơ ghế PM cập nhật · giao exe thêm tham số nối phiên cho script phóng người soát.
**Ai chốt:** anh Thanh.
**Mở lại khi:** anh báo hạn mức Hermes tuần xuống mức một phiên một lúc (khi đó đường A đi trước), hoặc anh đổi vai Hermes.

(ghi 10/10/2026 11:51 London · claude-aiboss-app-pm)
