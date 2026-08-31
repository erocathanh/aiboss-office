# 📚 SỔ TRI THỨC · `aiboss-app-chat`

> **Vì sao có sổ này** — Owner 31/08: *«giờ ai cũng đoán và ai cũng đi kiểm từ đầu rồi phát hiện
> mình sai mình thiếu… sau này bảo thêm chức năng lại cắm mắt vào thêm mà KHÔNG hề có kho tri thức
> để biết có hay chưa và xác minh ở đâu»*.

## 🔑 LUẬT CỦA SỔ NÀY — đọc trước khi dùng, và trước khi thêm

```
① MỖI MỤC PHẢI CÓ LỆNH ĐO LẠI. Không có lệnh thì KHÔNG được ghi vào đây.
   Một câu tri thức KHÔNG kiểm được thì nó là TIN ĐỒN, dù người viết chắc chắn tới đâu.
② ĐỌC SỔ ⇒ CHẠY LỆNH. Sổ nói «có», bạn vẫn phải chạy lệnh trước khi dựa vào nó.
   Sổ cho bạn biết ĐO Ở ĐÂU — nó KHÔNG thay bạn đo.
③ SỬA MÃ ⇒ SỬA SỔ TRONG CÙNG COMMIT. Sổ lệch một ngày là sổ bắt đầu nói dối.
④ SỐ ĐO PHẢI KÈM MỐC GIỜ VÀ NGƯỜI ĐO. «Đúng» mà không có mốc thì KHÔNG biết đúng lúc nào.
⑤ MỌI CÂU «KHÔNG CÓ / BẰNG 0» PHẢI KÈM ĐỐI CHỨNG DƯƠNG trong chính lệnh đo.
```
🕳 **Ca sinh ra luật ⑤:** 31/08 đội này ba lần đọc một số 0 rồi kể một câu chuyện mà số đó
KHÔNG đỡ nổi. Số 0 KHÔNG phân biệt được «không có» với «thước hỏng».

---

## 🔔 KHU 1 · ĐÁNH THỨC GHẾ

### 1.1 CÓ HAI BỘ ĐẾM KHÁC NHAU — đừng nhầm chúng làm một
| | trần | đếm cái gì | nằm ở đâu |
|---|---|---|---|
| **mắt canh** | 12 / **1 giờ** | CHỈ tin «có N tin mới trên kênh» | `~/Operations/scripts/mat-canh-ghe.sh:28` |
| **máy chủ** | 6 / **1 phút** | **MỌI** lời gọi, kể cả gọi thẳng | `src/lib/kho-danh-thuc.ts:49` |

```bash
# ĐO LẠI:
grep -n 'TRAN=\|CUA_SO=' ~/Operations/scripts/mat-canh-ghe.sh | head -2
grep -n 'TRAN_MOI_PHUT' ~/Projects/aiboss-app-chat/src/lib/kho-danh-thuc.ts | head -2
# ĐỐI CHỨNG DƯƠNG: cả hai lệnh phải RA DÒNG. Ra rỗng ⇒ tệp đã đổi, ĐỪNG tin bảng trên.
```
📌 **Hệ quả hay bị hiểu sai:** ghế «điếc» (12/12) vẫn **nhận được lời gọi thẳng** —
nó chỉ KHÔNG được nhắc rằng kênh có bài mới. Owner gọi vẫn tới. Đồng đội gọi vẫn tới.
🗓 đo 31/08 13:0x · `claude-aiboss-app-pm` (đối chứng sống: gọi thẳng, bộ đếm đứng im ở 11)

### 1.2 Mẩu bị GIỮ khi ô bận — sống nhờ trình duyệt còn thăm dò
```bash
grep -n 'giuChoOBan\|giu_toi' ~/Projects/aiboss-app-chat/src/lib/kho-danh-thuc.ts | head -4
```
Mỗi nhịp thăm dò báo «ô này bận» ⇒ máy chủ **dời `giu_toi` lên**. ⇒ **Đóng tab / khoá máy
⇒ KHÔNG ai gia hạn ⇒ mẩu chết.** P0-2a chữa «ô bận», KHÔNG chữa «KHÔNG ai mở trình duyệt».
🗓 đo 31/08 · bằng chứng: mẩu chờ **477,6 giây** vẫn được giao (hạn cũ 180 giây) + T1 có đối chứng âm

### 1.3 🔴 Nhãn `qua-han` KHÔNG đáng tin
Mẩu **đã giao thành công trong 6 giây** vẫn bị đóng dấu `bo · qua-han`, vì lời xác nhận KHÔNG về.
```bash
grep -n 'BO_QUA_HAN\|traVeMauHetHan' ~/Projects/aiboss-app-chat/src/lib/kho-danh-thuc.ts | head -4
```
⇒ Điều tra bằng cột này là đi nhầm hướng. **Thước đúng: có `xu_luc` KHÔNG.**
🗓 đo 31/08 · `claude-phong-ban-pm`, hai nguồn độc lập (sổ + bản ghi phiên)

### 1.4 🔴 `da_xu` KHÔNG dùng làm khoá ĐẾM
`boMau()` đặt `da_xu = true` ⇒ mẩu **bị bỏ** cũng mang `da_xu = true`.
**Thước đúng:** `trang_thai === 'da_giao'`, hoặc đếm mẩu **CÓ `xu_luc`**.
```bash
grep -n "da_xu = tt" ~/Projects/aiboss-app-chat/src/lib/kho-danh-thuc.ts
```
🗓 đo 31/08 · `claude-aiboss-app-exe` (ranh giới sạch 0/3 → 1/7)

### 1.5 HAI ĐƯỜNG GIAO TIN — và chúng CHỈ bù nhau khi KHÔNG cùng tắc
```
đường A  gọi thẳng      vài giây      hỏng là MẤT LUÔN
đường B  bộ canh kênh   tới 90 giây   tự gọi lại nên KHÔNG mất
```
**Luật: GHI KÊNH TRƯỚC rồi mới gọi.** Chỉ gọi mà không ghi thì A hỏng là mất trắng.
🔴 Phản ví dụ thật 31/08: cả hai cùng tắc **58 phút** (ghế điếc + lời gọi chết).
🗓 đo 31/08 · `claude-phong-ban-pm`

---

### 1.6 🔑 CÓ **BA** LOẠI «RỖNG», ⛔ phải hai — loại thứ ba là **CỬA CŨ TRẢ 200**
```
① rỗng vì THẬT SỰ KHÔNG ai chạy    ⇒ hiện rảnh là ĐÚNG
② rỗng vì KHÔNG hỏi được cửa        ⇒ hiện rảnh là NÓI DỐI (mất nút Dừng)
③ rỗng vì CỬA CŨ — máy chủ chưa nạp bản mới nên KHÔNG có trường đó
   🔴 cửa cũ vẫn trả 200 ⇒ kiểm `rc.ok` KHÔNG bắt được nó
```
```bash
# ĐO LẠI: bên đọc phải đòi ĐỦ CẢ HAI trường mới coi là «hỏi được»
grep -n 'so_o_dang_chay' ~/Projects/aiboss-app-chat/src/components/UngDung.tsx
# ĐỐI CHỨNG DƯƠNG: phải ra ≥2 dòng. Ra 0 ⇒ bên đọc lại gộp ba loại rỗng làm một.
```
🕳 **Ca thật 31/08 14:0x, ⛔ phải giả thuyết:** trình duyệt đã ở bản mới trong khi máy chủ vẫn
là bản 11:43:46. Đúng cảnh đó đang diễn ra lúc mục này được viết.
📌 **Một cửa CŨ trả 200 là một loại «rỗng» RIÊNG.** Ai kiểm bằng `rc.ok` sẽ tưởng mình hỏi được.
🗓 31/08 · `claude-phong-ban-pm` nêu 2 loại · `claude-aiboss-app-exe` tìm ra loại thứ 3

## 🖥 KHU 2 · GIAO DIỆN

### 2.1 🔴 Sau F5, app KHÔNG biết ô nào đang chạy — CHƯA VÁ
```bash
grep -c 'dangChay' ~/Projects/aiboss-app-chat/src/app/api/phien/route.ts    # 0 = chưa có cờ
grep -c 'dangChay: false' ~/Projects/aiboss-app-chat/src/components/UngDung.tsx  # 3 chỗ
```
⇒ Owner **mất nút Dừng** sau mỗi lần tải lại trang. Đây là P0-7 + P1-7, **chưa ai làm**.
⚠️ Nếu lệnh trên ra khác 0 ⇒ đã có người vá ⇒ **sửa mục này ngay**.
🗓 đo 31/08 13:5x · `claude-aiboss-app-pm`

### 2.2 CSS nằm ở HAI tệp — `globals.css` nhập `mau09.css` ở dòng 2 ⇒ **globals ĐÈ mau09**
```bash
grep -n '@import' ~/Projects/aiboss-app-chat/src/app/globals.css
# ĐỐI CHỨNG DƯƠNG: phải ra ĐÚNG 1 dòng, và nó nhập mau09.css.
# Ra rỗng ⇒ cấu trúc CSS đã đổi ⇒ mục này LỖI THỜI, sửa ngay.
```
⇒ Nói «KHÔNG có luật cho X» mà mới grep một tệp là kết luận SAI.

### 2.3 Bản dựng RÚT GỌN TÊN — đừng grep tên biến/hàm để nghiệm thu
Bộ rút gọn còn **đổi HÌNH DẠNG câu lệnh**: `!==`→`===`, `if/continue`→chuỗi `&&`.
⇒ Neo vào **tên lớp CSS** hoặc **chuỗi hiển thị**. 🗓 31/08 · `claude-aiboss-app-exe`

### 2.4 Safari và Chrome KHÁC NHAU — đo một là kết luận sai
Ca thật: thu nhỏ ô phóng to ⇒ WebKit **10/10 ô** lệch đáy, Chromium **0/10**.
```bash
cd ~/Development/playwright-lab && node do-thu-nho-6o.mjs    # chạy CẢ HAI bộ máy
```
⚠️ Thước đo phải **chặn `/api/danh-thuc` và `/api/chat`** — nếu không, trình duyệt đo sẽ
**cướp lời gọi thật của Owner**. Bộ chặn: `chan-cua-nguy-hiem.mjs`. 🗓 30-31/08

---

## 🚦 KHU 3 · DỰNG VÀ NẠP

### 3.1 BA MỐC — cách DUY NHẤT nói một bản mã đã lên app
```
nguồn < BUILD_ID < giờ máy chủ khởi        ← mốc COMMIT KHÔNG tính
```
```bash
cd ~/Projects/aiboss-app-chat
stat -f '%Sm nguồn' -t '%H:%M:%S' src/components/UngDung.tsx
stat -f '%Sm BUILD_ID' -t '%H:%M:%S' .next/BUILD_ID
ps -o lstart= -p $(lsof -tiTCP:4319 -sTCP:LISTEN | head -1)
```
### 3.2 🔑 DẤU VÂN MẠNH HƠN BA MỐC
Ba mốc nói «tệp nào mới hơn». Dấu vân nói «**dữ liệu này do mã nào ĐẺ RA**».
Ví dụ: mẩu xếp sau khi nạp P0-2b **phải có** trường `trang_thai`.
```bash
python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/Projects/aiboss-app-chat/.trang-thai/danh-thuc.json')))
h=d.get('hang_doi',[])
print('có trang_thai:', sum(1 for x in h if 'trang_thai' in x), '/', len(h))"
```
🗓 31/08 · `claude-phong-ban-pm`

### 3.3 Bộ hẹn nạp phải canh **MỌI** ghế, và quá trần thì **BÁO chứ ĐỪNG nổ**
```bash
grep -n 'DS_GHE\|exit 3' ~/Operations/scripts/hen-khoi-dong-lai-app.sh | head -4
```
🕳 Ca sinh luật: bộ hẹn canh đúng MỘT ghế, nổ giữa lúc ghế khác đang nói ⇒ **cắt ngang câu của exe**.
🗓 31/08 · `claude-aiboss-app-pm` (chính tôi gây ra)

---

## ⛔ KHU 4 · CẤM ĐỘNG
```
src/middleware.ts:65              realm="phong-ban-ai"  ← đổi = mọi thiết bị Owner bị hỏi lại mật khẩu
src/components/UngDung.tsx:94-95  4 khoá localStorage phong-ban-ai.*  ← đổi = Owner mất bố cục
/Users/Shared/phong-ban-ai-ws/    vùng cách ly ĐANG SỐNG
~/Operations/scripts/mat-canh-ghe.sh  của Owner — sửa phải xin, và phải sao lưu + md5
```

---
## 📋 THÊM MỤC MỚI
Dán khuôn này, KHÔNG bỏ dòng nào:
```
### X.Y <câu sự thật, MỘT câu>
```bash
<lệnh đo lại — PHẢI chạy được, PHẢI có đối chứng dương nếu kết quả là 0>
```
⚠️ <nếu lệnh ra khác kỳ vọng thì phải làm gì>
🗓 đo <ngày giờ> · <ghế>
```
