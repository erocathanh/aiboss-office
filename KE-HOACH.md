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

CHIỀU B · BÁO THIẾU  (CÒN TRANH CHẤP — chưa ai chứng minh)
  lời khai   : máy chủ khởi lại ⇒ sổ trống sạch ⇒ ô đang chảy chữ mà đèn tắt
  bằng chứng : Owner CHỤP MÀN HÌNH ca này ngày 31/08
  phản biện  : chú thích ngay trong kho-tien-trinh.ts cãi lại — «máy chủ khởi lại thì sổ rỗng,
               nhưng lúc đó mấy tiến trình con cũng chết theo, nên sổ rỗng là ĐÚNG SỰ THẬT»
  tôi đo 01/09: tiến trình claude có ppid=1 → 0   (đối chứng dương: tổng claude → 21)
  🔴 SỐ 0 ĐÓ KHÔNG PHÂN XỬ ĐƯỢC GÌ: tôi chụp một khoảnh khắc KHÔNG có lần khởi lại nào trong đó.
     Một ảnh chụp KHÔNG bác được một khoảnh khắc.
```
✅ **PHÉP THỬ PHẢI LÀM để phân xử chiều B** (chưa ai làm):
```
① cho một ô chạy một lượt DÀI   ② khởi lại máy chủ GIỮA lúc đó
③ đo ngay: tiến trình con còn sống KHÔNG (ps ppid) · và dsViec() trả về gì
con CHẾT theo  ⇒ chú thích đúng, chiều B là bệnh KHÁC (trình duyệt? SSE?) — phải đi tìm lại
con CÒN SỐNG  ⇒ sổ NÓI DỐI, và Owner đã nhìn thấy đúng
```

#### 🔑 VẾ ĐÁNG VÀO KẾ HOẠCH KHÔNG PHẢI CÁI ĐÈN — mà là BA CHỖ TỰA VÀO CÙNG CUỐN SỔ ĐỂ QUYẾT ĐỊNH
```
① may-chay-nen.ts            4 chỗ dùng sổ  ⇒ tưởng ghế RẢNH ⇒ CHẠY CHỒNG lên lượt đang chạy
② hen-khoi-dong-lai-app.sh   3 chỗ dùng sổ  ⇒ tưởng sáu ô rảnh ⇒ NẠP GIỮA LÚC ghế đang làm
③ UngDung.tsx (`dangChay`)  37 chỗ dùng sổ  ⇒ lọc ô nhận đánh thức ⇒ lời gọi RƠI IM LẶNG
```
📌 **Cái đèn chỉ là chỗ Owner NHÌN THẤY ĐƯỢC.** Ba chỗ trên hỏng lặng — và ② là chỗ đắt nhất:
nó nạp lại app, giết mọi ghế giữa lượt, đúng thứ nhà mình vừa dựng cả một bộ hẹn để tránh.

#### ⚠️ HAI CHIỀU CẦN HAI CÁCH CHỮA KHÁC NHAU — đừng vá một chiều rồi tưởng xong
```
chiều A (thừa)  : kiểm pid còn sống trước khi trả về — chữa TẠI CHỖ ĐỌC, rẻ
chiều B (thiếu) : kiểm pid KHÔNG cứu được. Sổ trống thì KHÔNG có pid nào để mà kiểm.
                  Phải dựng lại được sổ sau khi khởi lại, hoặc lấy sự thật từ HỆ ĐIỀU HÀNH
                  thay vì từ một Map — tức là đổi NGUỒN SỰ THẬT, không phải thêm một phép kiểm.
```
🔑 **Một phép kiểm chỉ lọc được thứ ĐANG CÓ trong sổ; nó KHÔNG dựng lại được thứ đã mất khỏi sổ.**
Vá chiều A xong mà tưởng xong cả hai thì chiều B còn nguyên, và nó là chiều Owner nhìn thấy.

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
