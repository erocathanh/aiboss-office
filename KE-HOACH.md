# 🗺 KẾ HOẠCH `aiboss-app-chat` — bản đo ngày 01/09/2026

> 👤 Dựng lại bởi `claude-aiboss-app-pm` · 📅 01/09/2026 14:2x London · 🔄 v1.0
> Thay bản cũ trong `~/Operations/agents/CLAUDE-PHONG-BAN-PM-BOOT.md` mục ⑥ (viết 14/08, cũ 18 ngày).

## 🔴 VÌ SAO CÓ TỆP NÀY — bản cũ chết già mà KHÔNG ai hay

Bản 14/08 ghi *«kho mới có ĐÚNG 1 commit, 7 tệp mã nằm ngoài git, máy hỏng là mất trắng»*.
Đo hôm nay: **118 commit · 0 tệp sửa dở**. Bản cũ cũng ghi «cổng đánh thức — ĐANG LÀM», mà nay
nó chạy thật, dùng mỗi ngày.

🔑 **Bản cũ hỏng KHÔNG phải vì viết ẩu — nó đúng vào ngày viết.** Nó hỏng vì **KHÔNG dòng nào
kèm cách kiểm lại**, nên KHÔNG ai biết dòng nào đã mục. Người đọc sau chỉ có hai lựa chọn tệ:
tin cả bản, hoặc bỏ cả bản.
⇒ Vì thế mỗi dòng dưới đây có cột **CÁCH ĐO LẠI** — một lệnh, chạy ra số. Bản này mục thì
người sau **biết được nó mục ở đâu**, KHÔNG phải đoán.

---

## ✅ ĐÃ XONG — có bằng chứng đo được (01/09)

| # | Việc | Bằng chứng | Cách đo lại |
|---|---|---|---|
| f① | Kho đã cam kết | 118 commit · 0 tệp sửa dở | `git rev-list --count HEAD` |
| b | Cổng đánh thức giữa các ô | `src/app/api/danh-thuc/route.ts` · dùng thật 4 lần ngày 01/09, đo được lời gọi tới nơi | `curl -X POST localhost:4319/api/danh-thuc` rồi đo `mtime` tệp `.jsonl` ghế kia |
| f③ | Mắt canh quét CẢ thư mục kênh | `mat-canh-ghe.sh:144` dùng `ls .../phong-ban-ai-boss/*.md` — bắt được tệp sinh sau | `grep -n 'phong-ban-ai-boss' ~/Operations/scripts/mat-canh-ghe.sh` |
| — | Chảy chữ ra dần (KHÔNG phải tiến trình sống) | `chay-agent.ts:149` `--output-format stream-json` | `grep -c -- '--output-format' src/lib/chay-agent.ts` |
| — | Đổi tên app: thư mục · kho · launchd | xong 29/08 | `ls -d ~/Projects/aiboss-app-chat` |
| — | **P0-2c — bộ chạy nền KHÔNG còn đầu độc bó edge** | `bc943f9` dựng XANH · 5 mô-đun `node:*` đều 0 trong bó edge · đã nạp 10:58:51 · nhật ký in `[chay-nen] TẮT` ⇒ `batMotLan()` CHẠY THẬT | `grep -c 'node:fs' .next/server/src/middleware.js` (phải 0) + đối chứng dương `grep -c PHONGBAN` (phải >0) |
| — | Bản vá màn hình fork | `'thu_muc'` có trong bó · đối chứng dương chuỗi cũ `Fork` → 2 mẩu | xem tin kênh 01/09 12:52 |

---

## 🔴 CHƯA XONG — xếp theo mức chặn

### ① VIỆC LỚN NHẤT, VẪN NGUYÊN SAU 18 NGÀY: giữ TIẾN TRÌNH SỐNG
```
ĐO 01/09:  '--input-format' trong src/  → 0 tệp
           'spawn(' trong chay-agent.ts → 1   ⇒ MỖI LƯỢT VẪN SINH TIẾN TRÌNH MỚI
```
⚠️ **Đừng nhầm với việc đã xong.** App CÓ `--output-format stream-json` (chữ chảy ra dần) nhưng
KHÔNG có `--input-format` — tức là vẫn một tiến trình một lượt rồi chết.
**Nối xong gỡ được ba thứ cùng lúc:** ghế canh kênh được (vì còn sống mà canh) · hết nạp lại từ đầu
mỗi lượt · ghế nói được khi Owner KHÔNG hỏi.
📌 Đây cũng là gốc của mục ② dưới — chừng nào chưa làm, mọi cách chữa «được đánh thức» đều là vá.
**Cách đo lại:** `grep -rc -- '--input-format' src/` phải ra >0.

### ② Cháy hạn mức — phụ thuộc ①
```
mỗi lượt sinh lại tiến trình ⇒ ~15.000 đơn vị chỉ để khởi động (đo 14/08: 15.309 cho câu 1 dòng)
6 ô song song ⇒ đây là chỗ tốn LỚN NHẤT
```
⚠️ Con số 15.309 là **đo ngày 14/08**, chưa đo lại. Ai dùng lại phải đo mới.

### ③ Bộ chạy nền đang TẮT trên app đang chạy
```
nhật ký: «[chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.»
```
Mã đã thông (dòng này chứng minh `batMotLan()` chạy tới cuối). **Bật hay KHÔNG bật là một quyết
định triển khai chưa ai ra** — cần Owner chốt, vì bật nghĩa là có việc chạy ngầm ngoài lượt.
**Cách đo lại:** `grep 'chay-nen' ~/Operations/logs/phong-ban-lan.log | tail -1`

### ④ Hermes CHƯA nối vào app
```
ĐO 01/09: số dòng GỌI THẬT hermes trong src/ (spawn/exec) → 0
          12 tệp có chữ 'hermes' đều là NHÃN hiển thị, vd dat-nhan.ts:93  hermes: 'Hermes'
```
⚠️ Ghế gọi Hermes qua dòng lệnh thì được (tôi làm cả ngày nay), nhưng **app KHÔNG gọi được**.
**Cách đo lại:** `grep -rn 'hermes' src/ | grep -cE "spawn\(|execFile"` phải >0.

### ⑤ Ba hồ sơ ghế còn khối «CHẾ ĐỘ KỊCH BẢN» chưa gỡ
```
ĐO 01/09: 3 / 12 tệp ~/claude-*/CLAUDE.md còn khối đó
```
**Cách đo lại:** `grep -rl 'CHẾ ĐỘ KỊCH BẢN' ~/claude-*/CLAUDE.md | wc -l` phải ra 0.

### 🔴 ⑤b SỔ «Ô ĐANG CHẠY» SAI ĐƯỢC CẢ HAI CHIỀU — và BA chỗ đang tựa vào nó để QUYẾT ĐỊNH
> Nêu bởi `claude-phong-ban-pm` (kênh 01/09), Owner giao đưa vào kế hoạch. Tôi đo lại từng vế.

**Cuốn sổ:** `src/lib/kho-tien-trinh.ts:25` — `const SO = new Map<string, ViecDangChay>()`,
nằm trong BỘ NHỚ tiến trình máy chủ.

```
CHIỀU A · BÁO THỪA  (đã chứng minh bằng ĐỌC MÃ, chắc chắn)
  dsViec() chỉ đổ Map ra, KHÔNG kiểm pid còn sống
  ⇒ tiến trình chết mà chưa ai gọi xoaViec ⇒ đèn sáng MÃI MÃI
  đo: `grep -cE 'kill\(' src/lib/kho-tien-trinh.ts` → 1 (chỉ ở gietViec, KHÔNG ở dsViec)

CHIỀU B · BÁO THIẾU  ⇒ 🔴 GIẢ THUYẾT «MÁY CHỦ KHỞI LẠI» **ĐÃ BỊ BÁC** — xem mục ⑤c
  Owner nói rõ 01/09: ca chụp màn hình 31/08 **KHÔNG có khởi lại, KHÔNG có nạp lại** — hệ thống
  bình thường. Owner để trình duyệt NGỦ rồi quay lại.
  ⇒ bệnh nằm ở phía TRÌNH DUYỆT, KHÔNG ở cuốn sổ này.
```
📌 Ba ghế đã bàn HAI VÒNG về «máy chủ khởi lại thì sổ trống» — **bàn về một ca chưa từng xảy ra.**
🔑 **Chúng tôi có ẢNH của hiện tượng mà KHÔNG hỏi người chụp bối cảnh.** Rồi mỗi người mang một
giả thuyết hợp lý tới ghép vào, và ghép rất khớp. **Một giả thuyết khớp với hiện tượng KHÔNG chứng
minh được nó là nguyên nhân** — nhất là khi chưa ai hỏi «lúc đó máy đang làm gì».
⚠️ Chiều A (báo thừa) vẫn ĐÚNG và vẫn đáng vá — nó chứng minh bằng đọc mã, KHÔNG dựa vào ca ảnh.

#### 🔑 VẾ ĐÁNG VÀO KẾ HOẠCH KHÔNG PHẢI CÁI ĐÈN — mà là BA CHỖ TỰA VÀO CÙNG CUỐN SỔ ĐỂ QUYẾT ĐỊNH
```
① may-chay-nen.ts            4 chỗ dùng sổ  ⇒ tưởng ghế RẢNH ⇒ CHẠY CHỒNG lên lượt đang chạy
② UngDung.tsx (`dangChay`)  37 chỗ dùng sổ  ⇒ lọc ô nhận đánh thức ⇒ lời gọi RƠI IM LẶNG
```
📌 **Cái đèn chỉ là chỗ Owner NHÌN THẤY ĐƯỢC.** Hai chỗ trên hỏng LẶNG.

##### ✂️ ĐÃ GẠCH khỏi danh sách: `hen-khoi-dong-lai-app.sh` — `claude-aiboss-app-exe` bác, tôi đọc mã và nhận
Tôi từng xếp nó vào đây với ca «sổ trống ⇒ tưởng sáu ô rảnh ⇒ nạp giữa lúc ghế đang làm». **Sai.**
```
so_o_dang_chay > 0  ⇒ CHỜ, quá trần thì `exit 3`  (sổ nói bận thì tin ngay)
so_o_dang_chay = 0  ⇒ RƠI XUỐNG phép đo mtime; chỉ mtime mới có quyền CHO NỔ
⇒ sổ chỉ có quyền BẮT CHỜ, KHÔNG có quyền CHO NỔ ⇒ sổ sai chỉ hỏng về phía AN TOÀN
```
🔑 **Gốc lỗi khoanh sai của tôi: tôi thấy nó ĐỌC sổ rồi kết luận nó QUYẾT theo sổ, mà KHÔNG hỏi
sổ có quyền tới đâu.** «Có đọc một nguồn sai» KHÔNG đủ để kết luận «sẽ quyết định sai».

##### 🔴 NHƯNG LỚP CHẶN THAY NÓ LÀ MTIME, VÀ BIÊN RẤT MỎNG — rủi ro THAY THẾ, đừng coi là đã hết
```
hiện vật lần nạp 01/09: «MỌI ghế im ≥75s (ghế bận nhất 78s) ⇒ RẢNH, nổ»
⇒ lúc nổ, ghế bận nhất chỉ hơn ngưỡng ĐÚNG 3 GIÂY
```
Ngưỡng 75s giả định **ghế đang chạy thì ghi liên tục**. Ghế nghĩ lâu, hoặc chờ một lệnh dài, thì im
mà vẫn bận ⇒ mtime nói «rảnh» ⇒ NỔ giữa lượt. Đây KHÔNG phải lỗ của sổ, mà là lỗ của **tiếng nói cuối**.

##### 🕳 CHỖ CẢ BA CHÚNG TÔI CHƯA ĐO ĐƯỢC — thiếu một dấu hiệu «đang chạy» ĐỘC LẬP
`claude-phong-ban-pm` thử đo «ghế bận mà im quá 75s» và **tự loại số của mình**: cách tách lượt dựa
vào dòng `type=user`, mà kết quả công cụ trả về CŨNG mang `type=user` ⇒ KHÔNG phân biệt được
«bận mà im» với «rảnh nên im».

✅ **Đề xuất một dấu hiệu độc lập — GIỜ CPU của chính tiến trình con** (`claude-aiboss-app-pm` thử 01/09):
```
ps -o time= -p <pid>   đo hai lần cách nhau vài giây
đo thật: 95:07.48 → 95:07.57 sau 8 giây ⇒ CPU CHẠY TIẾP ⇒ tiến trình ĐANG LÀM VIỆC
đối chứng âm: pid bịa → 0 dòng ⇒ thước phân biệt được
```
⚠️ **Nó là dấu hiệu MỘT CHIỀU, phải nói rõ kẻo lại dựng một thước nói dối:**
```
CPU chạy tiếp  ⇒ CHẮC CHẮN đang bận          (dùng để CHẶN nổ — an toàn)
CPU đứng yên   ⇒ CHƯA kết luận được          (ghế chờ mạng/chờ lệnh cũng đứng yên)
⇒ dùng nó để THÊM một lý do CHỜ, KHÔNG dùng nó để CHO NỔ.
```
📌 Nó độc lập với CẢ sổ lẫn bản ghi phiên — đúng thứ còn thiếu. Nhưng nó KHÔNG thay được mtime,
nó chỉ bịt được nửa nguy hiểm: ca «bận mà im».

#### ⚠️ HAI CHIỀU CẦN HAI CÁCH CHỮA KHÁC NHAU — đừng vá một chiều rồi tưởng xong
```
chiều A (thừa)  : kiểm pid còn sống trước khi trả về — chữa TẠI CHỖ ĐỌC, rẻ
chiều B (thiếu) : kiểm pid KHÔNG cứu được. Sổ trống thì KHÔNG có pid nào để mà kiểm.
                  Phải dựng lại được sổ sau khi khởi lại, hoặc lấy sự thật từ HỆ ĐIỀU HÀNH
                  thay vì từ một Map — tức là đổi NGUỒN SỰ THẬT, không phải thêm một phép kiểm.
```
🔑 **Một phép kiểm chỉ lọc được thứ ĐANG CÓ trong sổ; nó KHÔNG dựng lại được thứ đã mất khỏi sổ.**
Vá chiều A xong mà tưởng xong cả hai thì chiều B còn nguyên, và nó là chiều Owner nhìn thấy.

⚠️ **VÀ MỘT BẪY TRONG CHÍNH CÁCH CHỮA CHIỀU B** (`claude-aiboss-app-exe` nêu, tôi ghi lại):
> ghi sổ xuống đĩa rồi thì **phải đối chiếu pid lúc ĐỌC LÊN**, KHÔNG phải chỉ lúc ghi.

Sổ bền mà KHÔNG đối chiếu thì nó đổi từ «quên sạch sau khi khởi lại» thành **«nhớ dai những thứ đã
chết»** — tức là làm chiều A NẶNG THÊM, vì nay cái sai sống qua cả lần khởi lại.
🔑 **Chữa một chiều mà KHÔNG nhìn chiều kia thì đó là DỜI lỗi, KHÔNG phải VÁ lỗi.**

---

### ✅ ⑤d NGƯỠNG «RẢNH» CỦA BỘ HẸN NẠP — đã QUYẾT 01/09, chờ `claude-aiboss-app-exe` thi hành

**Vấn đề:** sau khi gạch cuốn sổ khỏi bộ hẹn (⑤b), `mtime` thành **tiếng nói cuối duy nhất**, ngưỡng 75s.
Hai phép đếm độc lập nói nó MỎNG:
```
claude-aiboss-app-exe   110 lần ghế ĐANG BẬN mà im >75s · trung vị 107-203s
claude-phong-ban-pm     504 lần                          · trung vị 196-214s · dài nhất 800-880s
lần nạp 01/09: ghế bận nhất 78s ⇒ hơn ngưỡng ĐÚNG 3 GIÂY
```
⚠️ Hai số lệch gần 5 lần và **chưa ai hợp nhất được**. Ghi cả hai — **lệch về CỠ, thuận về CHIỀU**,
nên đủ để quyết. Chọn lấy một số là giả vờ đã hợp nhất.

#### ✅ QUYẾT: hỏi thẳng HỆ ĐIỀU HÀNH, KHÔNG nâng ngưỡng, KHÔNG hỏi cuốn sổ
```
Bộ hẹn chỉ nổ khi CẢ HAI cùng nói rảnh:
   ① pgrep -P <pid máy chủ> → 0 con     (nguồn CHÍNH — hệ điều hành giữ, KHÔNG ai quên xoá được)
   ② mọi ghế im ≥75s theo mtime          (giữ nguyên, làm lớp thứ hai)
```
**Đo thật 01/09** (máy chủ pid 39808): `pgrep -P` ra ĐÚNG 2 con, cả hai là `claude -p --output-format
stream-json …` — đúng hai lượt đang chạy. Cháu là MCP + một `/bin/zsh -c` của chính lượt đang đo.
Đối chứng âm: `pgrep -P <pid bịa>` → 0. Đối chứng dương: tổng `claude` trên máy = 19 ⇒ thước lọc đúng.

🔑 **Vì sao hơn cả ba đường được đề xuất:** nó KHÔNG dùng chung điểm hỏng với thứ nào.
```
sổ trong bộ nhớ : hỏng khi khởi lại · hỏng khi quên xoaViec
mtime           : hỏng khi ghế BẬN MÀ IM
con của máy chủ : tiến trình PHẢI có mặt suốt lượt ⇒ KHÔNG báo thiếu được
```
📌 **Chỗ cả ba ghế đi vòng:** bộ hẹn KHÔNG cần biết **ô NÀO** bận — chỉ cần biết **có lượt nào đang
chạy KHÔNG**. Bàn hai vòng về một cuốn sổ ánh xạ ô↔ghế, trong khi câu hỏi thật KHÔNG cần ánh xạ đó.

⚠️ **GIỮ CẢ HAI LỚP.** Ca hở của ①: máy chủ vừa khởi lại thì con của máy chủ CŨ thành mồ côi,
`pgrep -P` mới KHÔNG thấy. Lúc đó mtime là lớp bắt. **Hai lớp hỏng ở HAI chỗ khác nhau — đó mới là
hai lớp thật.** (Áp đúng câu `claude-aiboss-app-exe` rút: *hai lớp cùng tựa vào một cuốn sổ thì
chúng KHÔNG còn là hai lớp*.)

**Ba đường bị loại, ghi lý do để KHÔNG ai dựng lại:**
```
nâng ngưỡng 75s→300s : chỉ đẩy lùi ranh giới. Đo dài nhất 800-880s ⇒ 300s VẪN trượt,
                       mà mỗi lần nạp phải chờ lâu hơn — trả giá mà KHÔNG hết bệnh.
hỏi `bat_dau`        : tựa vào ĐÚNG cuốn sổ đang hỏng.
giữ nguyên           : 110 (hoặc 504) hiện vật nói nó sẽ trượt, chỉ là chưa trúng lần nào.
```
**Cách đo lại:** `grep -c 'pgrep -P' ~/Operations/scripts/hen-khoi-dong-lai-app.sh` phải >0.

---

### 🔴 ⑤c TAB NGỦ RỒI TỈNH ⇒ MẤT LUỒNG, KHÔNG TỰ NỐI LẠI — đây mới là ca Owner chụp 31/08

**Bối cảnh THẬT, Owner kể 01/09:**
```
để trình duyệt NGỦ → quay lại → «load fail», KHÔNG đọc được tin cũ
F5 → đọc được tin cũ
NHƯNG ô đang nhả chữ thì KHÔNG nhả tiếp; phải chờ, F5 vài lần mới thấy tin
⇒ KHÔNG tự nạp lại được — khác hẳn lúc có đánh thức
```

**Đo tại nguồn (01/09) — hai chỗ, cả hai khớp mô tả:**
```
① 'visibilitychange' trong src/  → 0 tệp
   'addEventListener' trong src/ → 3 tệp   ⇐ ĐỐI CHỨNG DƯƠNG, thước KHÔNG mù
   mà `document.hidden` lại được dùng ở 2 chỗ (UngDung.tsx:1543 · :1845) để NGỦ
   ⇒ CÓ đường ĐI NGỦ, KHÔNG có đường TỈNH DẬY. Tab ẩn thì mọi vòng dừng;
     tab hiện lại thì KHÔNG có gì khởi động chúng lại.

② 'EventSource' → 0 tệp  ·  'getReader' → 1 tệp  (UngDung.tsx:1607 `r.body.getReader()`)
   ⇒ luồng chữ là FETCH-READER, KHÔNG phải EventSource.
   🔑 `EventSource` TỰ nối lại khi đứt. Fetch-reader thì KHÔNG — vòng `for(;;)` gặp `done`
      là **break, hết**. KHÔNG nhánh nối lại, KHÔNG cách bám lại vào lượt đang chạy.
```

#### 🔑 VÌ SAO F5 CHỮA NỬA NÀY MÀ KHÔNG CHỮA NỬA KIA
```
tin CŨ       : nằm trong .jsonl do chính `claude` ghi ⇒ tải lại trang là đọc lại được  ✅
chữ ĐANG nhả : chỉ sống trong luồng HTTP đang mở. Luồng đứt ⇒ chữ đó MẤT khỏi máy khách,
               và máy chủ KHÔNG giữ bản phát lại ⇒ F5 bao nhiêu lần cũng KHÔNG lấy lại  ❌
```
📌 Nên «F5 vài lần mới thấy» KHÔNG phải là F5 có tác dụng — mà là **phải chờ lượt đó KẾT THÚC**,
lúc ấy chữ mới vào `.jsonl` rồi F5 mới thấy. Owner đang chờ TIẾN TRÌNH, KHÔNG phải chờ trang.

#### ✅ HAI LỚP VÁ, ĐỘ KHÓ KHÁC HẲN — đừng gộp làm một
```
LỚP 1 (rẻ) — chữa «load fail + KHÔNG đọc được tin cũ»
   thêm listener `visibilitychange`: tab hiện lại ⇒ tải lại lịch sử + bật lại các vòng đã ngủ
   ⇒ Owner KHÔNG phải F5 nữa. KHÔNG đụng kiến trúc.

LỚP 2 (khó) — chữa «ô đang nhả chữ thì mất»
   phải có luồng BÁM LẠI ĐƯỢC: máy chủ giữ bản phát lại của lượt đang chạy, máy khách nối lại
   và xin từ mốc đã nhận. Đổi sang EventSource KHÔNG đủ: nó nối lại được, nhưng máy chủ
   vẫn KHÔNG có gì để phát lại.
```
⚠️ **LỚP 2 chung gốc với mục ① (giữ tiến trình sống)** — cả hai đều vì app KHÔNG có bản ghi bền của
một lượt ĐANG chạy. Ai làm ① thì cân nhắc làm luôn, đừng vá riêng rồi phải vá lại.

**Cách đo lại:** `grep -rc 'visibilitychange' src/` phải >0 (lớp 1) · và có đường xin phát lại từ một mốc (lớp 2).

---

### ⑥ Các mảnh hạ tầng còn lại
```
· gộp N ô vào MỘT luồng SSE (trần 6 kết nối HTTP/1.1) — bắt buộc trước khi tăng số ô
· nối lại giữa chừng khi rớt mạng
· cộng dồn mức dùng theo ngày   (có 1 tệp chạm tới, chưa đủ)
· CHƯA deploy app — Owner chốt chạy tại máy trước. Đây là CHỐT CỦA OWNER, KHÔNG phải việc tồn.
```

### ⑦ `chon-mau/` đẩy từ chỗ mới đang hỏng
Trạng thái 14/08: bản mới mọi trang đều 21,6 KB, trang bịa cũng 200 ⇒ là vỏ 404 của Next.
Bản CŨ vẫn phục vụ đúng. **Owner chốt 30/08 GIỮ tên dự án Vercel `phong-ban-ai-mockup`.**
⚠️ **Tôi CHƯA đo lại mục này hôm nay** — ghi ra để KHÔNG ai tưởng nó đã xong.

---

## 📌 CÁCH DÙNG TỆP NÀY
```
· Sửa gì trong danh sách thì SỬA TỆP NÀY, đừng sửa mục ⑥ của boot doc (mục đó nay là DẤU CŨ).
· Mỗi lần báo cáo trạng thái: CHẠY cột «cách đo lại», đừng chép lại dòng cũ.
· Dòng nào đo KHÔNG ra thì ghi «KHÔNG đo được», đừng để trống — trống đọc thành «xong».
```
