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

## 🔬 KHU 0 · PHÉP ĐO DÙNG ĐƯỢC Ở MỌI KHU

### 0.1 🔑 Biến chỉ có chỗ GÁN mà ⛔ có chỗ ĐỌC — bắt bằng một phép đếm, 2 giây
Bệnh: viết ra một giá trị, tin là nó đang làm việc, mà **⛔ ai đọc nó**. Chốt chặn ⛔ chặn,
cửa trả số mà bên kia ⛔ dùng. Hỏng **IM LẶNG** — ⛔ báo lỗi, ⛔ sập, chỉ là ⛔ có tác dụng.

```bash
# ĐO LẠI trên một tệp shell bất kỳ:
F=~/Operations/scripts/ghi-kenh-an-toan.sh
grep -oE '^[[:space:]]*[A-Z_][A-Z0-9_]*=' "$F" | tr -d ' =' | sort -u | while read V; do
  N=$(grep -c "$V" "$F"); [ "$N" -eq 1 ] && echo "🚩 $V — chỉ GÁN, ⛔ ĐỌC"; done
# ĐỐI CHỨNG DƯƠNG (bắt buộc — «0 cờ» ⛔ nói gì nếu thước mù):
#   cp "$F" /tmp/t.sh; printf '\nBIEN_CHET=1\n' >> /tmp/t.sh
#   chạy lại vòng trên với F=/tmp/t.sh ⇒ PHẢI hiện 🚩 BIEN_CHET
```
| đo 31/08 14:4x | kết quả |
|---|---|
| kêu oan trên 43 biến thật (3 script nhà) | **0** ⇒ ⛔ nhiễu, dùng được |
| đối chứng dương (cấy 1 biến chết) | **bắt được** ⇒ thước ⛔ mù |
| bắt được ca thật hôm nay | **2** — `so_o_dang_chay` (13:59) · `MOI` (14:33) |

🔑 **⛔ CHỈ BIẾN MỚI CHẾT — CẢ MỘT PHÉP KIỂM CŨNG CHẾT ĐƯỢC.** Ca thật 31/08 14:43:
tôi viết chốt chặn trước khi đăng kênh; nó CHẠY, phát hiện ĐÚNG, in ra «🔴 DỪNG» — rồi phần
đăng bài **vẫn chạy tiếp**, đè lên tin người khác.
```bash
grep -q '<mốc>' && echo "an toàn" || echo "🔴 DỪNG"   # ← in ra, ⛔ nối vào quyết định nào
```
✅ **CÂU KIỂM CHO PHÉP KIỂM** (ghế soi đề 31/08 14:46) — hỏi trước khi tin bất kỳ chốt chặn nào:
> **«nếu phép kiểm này phán SAI, có gì DỪNG LẠI ⛔?»**
Trả lời được (`exit`, `return`, `if … else DỪNG`) thì nó sống. ⛔ trả lời được thì nó chỉ là
một dòng chữ đẹp. Đo được: `grep -n 'exit\|return\|fi' <tệp>` quanh chỗ phán quyết — ⛔ thấy gì
ngoài `echo` là dấu đỏ.

📌 **Cả hai ca đều xảy ra BÊN TRONG một bản vá đang chữa bệnh khác.** Lúc chăm chú nhất
là lúc dễ lọt nhất, vì mọi phép kiểm đều hướng về con bệnh đang đuổi.
⚠️ Giới hạn: tên biến xuất hiện trong CHÚ THÍCH cũng được đếm ⇒ đếm >1 mà vẫn có thể chết.
Phép này bắt được ca rõ, ⛔ thay được việc đọc.
🗓 đo 31/08 · phép do `claude-phong-ban-pm` nghĩ ra · `claude-aiboss-app-pm` đo tỉ lệ kêu oan

### 0.2 🔴 `grep` của vỏ lệnh **CÂM** trên tệp có byte hỏng — trả RỖNG mà ⛔ báo lỗi
Nhật ký bộ canh (`scripts/.mc-<ghế>/log`, 7.673 dòng) chứa byte ⛔ hợp lệ. Hậu quả:
```bash
grep -c '31/08' "$L"     # → RỖNG. ⛔ phải 0. ⛔ có thông báo lỗi nào.
LC_ALL=C grep -c ...     # → VẪN RỖNG (⛔ chữa được)
wc -l < "$L"             # → 7673   ⇒ tệp CÓ nội dung, ⛔ phải rỗng
```
🕳 Ca thật 31/08 16:0x: tôi đọc số RỖNG đó thành **«ghế này chưa bị gọi lần nào hôm nay»**.
Sai hoàn toàn — đo lại bằng Python ra **26 lần gọi**.
```python
# ĐO LẠI cho ĐÚNG — Python, mở với errors='replace':
for ln in open(p, encoding='utf-8', errors='replace'):
    if '31/08' in ln: ...
# ĐỐI CHỨNG DƯƠNG BẮT BUỘC: đếm TỔNG dòng phải > 0.
#   Ra 0 cả tổng ⇒ thước câm. Tổng > 0 mà lọc ra 0 ⇒ lúc đó mới là «⛔ có».
```
📌 **«Rỗng» ở đây là LOẠI RỖNG THỨ TƯ**: ⛔ phải «⛔ có», ⛔ phải «⛔ còn biết»,
⛔ phải «cửa cũ trả 200» — mà là **«thước ⛔ đọc nổi tờ giấy»**.
🔑 Nguy hơn cả ba loại kia vì nó **⛔ kèm bất kỳ dấu hiệu nào**: ⛔ lỗi, ⛔ mã thoát khác 0,
⛔ dòng cảnh báo. Chỉ là một khoảng trắng trông y hệt một câu trả lời.
🗓 đo 31/08 16:0x · `claude-aiboss-app-pm` (tự cắn khi chuẩn bị số cho cuộc bàn 01/09)

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

### 2.5 · «14% mẩu tin ⛔ có mốc giờ» — SAI ĐƠN VỊ. Đúng là 14% **DÒNG**, còn **MẨU thì 0%**

```
đề bài P2-3 và chú thích UngDung.tsx:79 đều ghi «14% mẩu tin ⛔ có timestamp»
ĐO 31/08 trên tệp phiên claude-aiboss-app-pm (7.630 dòng):
   DÒNG thiếu timestamp            1.081/7.630 = 14,2%   ← con số gốc, ĐÚNG
   MẨU user/assistant thiếu            0/3.774 =  0,0%   ← thứ THỰC SỰ thành bong bóng
   qua cổng /api/phien                   0/174 =  0,0%
14% kia là các dòng `attachment` · `last-prompt` · `queue-operation` · `mode` —
chúng ⛔ BAO GIỜ thành bong bóng.
```
🔴 **Hậu quả đã suýt xảy ra:** cổng nghiệm thu của P2-3 đòi *«tìm một mẩu THIẾU mốc — 14%,
chắc chắn có»*. Ca đó **⛔ TỒN TẠI** trong dữ liệu thật ⇒ đối chứng âm ra 0 ⇒ nó ⛔ chứng minh gì,
mà lại trông như đã kiểm.

```bash
# ĐO LẠI (đổi <tệp> thành một .jsonl bất kỳ trong ~/.claude/projects/):
python3 - <<'X'
import json,sys
d=t=0
for l in open("<tệp>",encoding="utf-8"):
    try: j=json.loads(l)
    except: continue
    if j.get("type") in ("user","assistant"):
        t+=1
        if not j.get("timestamp"): d+=1
print(f"mẩu thành bong bóng: {t} · thiếu mốc: {d}")
X
# ĐỐI CHỨNG DƯƠNG: `t` phải > 0. Ra 0 ⇒ đọc nhầm tệp, ⛔ kết luận gì cả.
```
🔑 **Nếp rút ra:** đối chứng âm phải kiểm được rằng **ca cần đo CÓ TỒN TẠI trong mẫu**.
⛔ có ca đó thì «⛔ thấy lỗi» ⛔ phải bằng chứng — nó chỉ là một chỗ trống.
⇒ Khi dữ liệu thật ⛔ chứa ca cần đo thì **DỰNG ra ca đó** (P2-3 làm bằng cách chặn giữa đường
và BÓC `luc` khỏi 716 mẩu ⇒ chúng hiện MỖI GIỜ, ⛔ mẩu nào bị bịa ngày).

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

### 3.4 🔑 «IM» ⛔ CÓ NGHĨA «XONG» — và ĐỪNG lấy TRUNG VỊ làm ngưỡng
```
phân bố khoảng lặng giữa lượt (đo 3.541 lượt):
   trung vị 20s   ·   phân vị 90 = 75s   ·   dài nhất 384s
```
🕳 **Ca thật 31/08 14:07:49:** bộ hẹn để `IM_CAN=20` — ĐÚNG BẰNG TRUNG VỊ — rồi nổ khi
«ghế bận nhất im đúng 20s». Nó **cắt ngang hai ô đang nói**. Lấy trung vị làm mốc «đã xong»
thì **~50% số lần nổ giữa lượt**.
📌 Ghế đang **chờ công cụ** im **y hệt** ghế đã trả lời xong. Tệp KHÔNG phân biệt hai thứ đó.
```bash
# ĐO LẠI: ngưỡng đường-lùi phải là phân vị 90, KHÔNG phải trung vị
grep -n 'IM_CAN=' ~/Operations/scripts/hen-khoi-dong-lai-app.sh
# ĐỐI CHỨNG: phải ra 75. Ra 20 ⇒ ai đó hạ lại về trung vị ⇒ sẽ cắt ngang người khác.
```
🗓 31/08 · Owner bắt bằng 2 ảnh · `claude-aiboss-app-pm` gây ra và tự đo lại

### 3.5 ✅ HỎI APP, ĐỪNG ĐOÁN — `GET /api/dung` là nguồn sự thật «ai đang chạy»
```bash
C=~/.bos-funnel-basic-auth
curl -s -u "$(sed -n 1p $C|sed -E 's/^[^:]*:[[:space:]]*//'):$(sed -n 2p $C|sed -E 's/^[^:]*:[[:space:]]*//')" \
  http://127.0.0.1:4319/api/dung
# ĐỐI CHỨNG DƯƠNG: thân phải chứa "so_o_dang_chay"
# ĐỐI CHỨNG ÂM   : /api/dung-bia phải ra 404
```
**Đo sống 31/08 14:1x:** cửa trả `so_o_dang_chay=2` (app-pm · app-exe) đúng lúc **cả hai đang
im ở tầng tệp** ⇒ thước-đoán-bằng-mtime sẽ coi chúng là rảnh và nổ.
🎁 Cửa này dựng ra để **trả lại nút Dừng sau F5**, nhưng nó chữa luôn bài **bộ hẹn nạp**.
📌 **Một nguồn sự thật thật thì trả lời được cả câu ta chưa nghĩ tới lúc dựng nó.**
Một phép đoán thì chỉ sai thêm ở mỗi câu mới.
🗓 31/08 · `claude-aiboss-app-exe` dựng cửa · `claude-aiboss-app-pm` dùng lại cho bộ hẹn

### 3.6 🔑 Tiến trình con **⛔ MỒ CÔI** khi nạp lại — chúng CÙNG NHÓM với máy chủ
Ai đọc `chay-agent.ts` thấy `spawn` ⛔ có `detached` rất dễ kết luận «giết máy chủ ⇒ con mồ côi,
chạy tiếp, tiêu tiền, nút Dừng ⛔ giết được». **SAI trên đường nạp lại THẬT.**

```bash
# ĐO LẠI ① — con có cùng NHÓM tiến trình với máy chủ ⛔:
ps -eo pid,ppid,pgid,command | grep -E '[n]ext-server|[c]laude -p --output-format' | awk '{print $3}' | sort -u
#   ra ĐÚNG MỘT số  ⇒ CÙNG nhóm ⇒ mục này còn đúng
#   ra NHIỀU số     ⇒ ĐÃ TÁCH NHÓM ⇒ 🔴 MỤC NÀY HẾT ĐÚNG, đọc lại từ đầu
#   ra RỖNG         ⇒ app chưa chạy hoặc ⛔ ghế nào đang chạy — CHƯA kết luận được gì

# ĐO LẠI ② — launchd có dọn cả nhóm ⛔ (⛔ đặt khoá ⇒ mặc định false ⇒ CÓ dọn):
grep -c 'AbandonProcessGroup' ~/Library/LaunchAgents/com.eroca.phong-ban-lan.plist   # mong 0
grep -c 'Label'               ~/Library/LaunchAgents/com.eroca.phong-ban-lan.plist   # đối chứng dương: ≥1

# ĐO LẠI ③ — đường nạp lại THẬT là gì:
grep -n 'kickstart\|pkill\|kill ' ~/Operations/scripts/hen-khoi-dong-lai-app.sh
#   thấy `launchctl kickstart -k` ⇒ hạ theo JOB, launchd dọn nhóm ⇒ con chết theo
#   nếu ai đó đổi sang `kill <pid>` ⇒ 🔴 lúc ĐÓ mới sinh mồ côi thật
```
⚖️ **Sức nặng từng mảnh — ⛔ gộp thành «đã chứng minh»:**
`pgid` + khoá plist = bằng chứng CƠ CHẾ (mạnh) · «0 tiến trình `claude -p` sót từ trước lần khởi»
= bằng chứng QUAN SÁT (khá, còn cách giải thích khác: bộ hẹn vốn ⛔ nổ lúc ghế chạy).
⛔ **DÙNG được** «Owner thấy ô bị cắt ngang câu» làm đối chứng — chữ ngừng hiện CŨNG xảy ra
khi trình duyệt rớt dòng mà con VẪN chạy. Hai ca cho CÙNG một triệu chứng.

🔴 **NHƯNG CÓ ĐƯỜNG THỨ HAI — và nó CÓ THẬT** (ghế soi nêu, tôi đo 31/08 14:4x):
đường trên nói về **nạp lại CÓ CHỦ Ý** qua launchd. Còn khi máy chủ **TỰ SẬP** (lỗi ⛔ bắt được,
hết bộ nhớ) thì **⛔ ai gửi tín hiệu cho cả nhóm** ⇒ con có mồ côi thật.

```bash
# ĐO LẠI — ⛔ cần dựng máy chủ tạm. POSIX thuần, 5 giây, 0 rủi ro, ⛔ đụng app Owner:
/bin/zsh -c 'sleep 300 & echo $! > /tmp/thu.con; sleep 300' & CHA=$!
sleep 1; CON=$(cat /tmp/thu.con); kill -9 $CHA; sleep 1     # kill -9 RIÊNG cha = mô phỏng SẬP
ps -o ppid= -p $CON        # ra 1  ⇒ con SỐNG, đã bị nhận nuôi ⇒ MỒ CÔI CÓ THẬT
kill -9 $CON; rm -f /tmp/thu.con
# ĐỐI CHỨNG: ps -p $CHA phải RỖNG (cha đã chết thật, ⛔ phải phép đo hỏng)
```
**Kết quả 31/08: con SỐNG, cha mới = 1 ⇒ nhánh tự-sập ĐẺ RA mồ côi thật.**

```bash
# NÓ ĐÃ NỔ TRÊN APP NÀY CHƯA — 🔴 ĐỌC KỸ PHẦN THƯỚC MÙ BÊN DƯỚI TRƯỚC KHI TIN SỐ NÀY:
L=~/Operations/logs/phong-ban-lan.log
grep -ci 'FATAL\|out of memory\|uncaughtException' $L   # 31/08: 0
grep -c  'Ready in' $L      # 67  ← lần khởi THÀNH CÔNG (dùng SỐ NÀY)
grep -c  '▲ Next.js' $L     # 83  ← lần TIẾN TRÌNH BẮT ĐẦU  ⇒ 83-67 = 16 lần khởi HỎNG
```
🔴 **THƯỚC NÀY MÙ VỚI ĐÚNG THỨ TA ĐANG TÌM** (ghế soi bắt 31/08 14:46 — nhận, ⛔ cãi):
`SIGKILL` và kẻ-giết-vì-hết-bộ-nhớ **⛔ chạy handler nào** ⇒ tiến trình ⛔ kịp ghi MỘT CHỮ.
Mà đó lại ĐÚNG loại sập đẻ ra mồ côi. Đo lại: `grep -c 'SIGKILL\|SIGTERM\|Killed\|signal'` → **0**
trên cả 52.172 dòng ⇒ log này **⛔ BAO GIỜ** ghi được cái chết đột ngột của chính nó.
📌 **Đây là tìm dấu vết của cái chết trong nhật ký do CHÍNH NGƯỜI CHẾT viết.**
⚠️ Và đối chứng dương của tôi (`'error'` → 6.388) chỉ chứng minh **tệp có nội dung** —
⛔ chứng minh thước bắt được **ĐÚNG LOẠI sự kiện đang tìm**. Hai chuyện KHÁC NHAU.

⇒ Câu đúng phải viết là: **«CÓ THẬT · CHƯA THẤY DẤU · và loại sập nguy nhất vốn ⛔ để lại dấu ở đây»**
— ⛔ được viết «chưa bao giờ xảy ra». Xếp sau UI/UX là đúng, nhưng ⛔ để câu chữ ru người sau ngủ quên.

### 🧾 NHÂN CHỨNG NGOÀI — vì log là lời khai của chính người chết
```bash
launchctl print gui/$(id -u)/com.eroca.phong-ban-lan | grep -E '^\s*(state|pid|runs) '
#   31/08: state=running · pid=74592 · runs=11
#   ĐỐI CHỨNG ÂM: hỏi một job BỊA ⇒ «Bad request» ⇒ thước phân biệt được, ⛔ gật bừa
```
⚠️ **Giới hạn phải nói kèm:** `runs` **RESET mỗi lần nạp lại plist** ⇒ ⛔ so được với số đếm
trong log. Nó làm chứng cho **giai đoạn hiện tại**, ⛔ cho cả đời job.
📌 Một nguồn im = im lặng. **Hai nguồn im (một trong-cuộc, một ngoài-cuộc), mỗi nguồn có giới hạn
ghi rõ** = mới bắt đầu nặng lời. Vẫn ⛔ đủ để viết «chưa bao giờ xảy ra».

### 🔴 CÒN MỘT TRẠNG THÁI THỨ BA MÀ CẢ HAI THƯỚC ĐỀU ⛔ THẤY
```
83 lần BẮT ĐẦU khởi  −  67 lần BÁO SẴN SÀNG  =  16 lần ⛔ bao giờ sẵn sàng
```
⛔ phải sập, cũng ⛔ phải khởi xong. Chưa ai truy 16 lần đó là gì (khớp với đống `EADDRINUSE`,
nhưng **khớp ⛔ phải là chứng minh**).

⚠️ **BÀI HỌC VỀ CON SỐ «150» TÔI TỪNG ĐƯA — và chẩn đoán đầu của tôi cũng SAI:**
```bash
grep -c 'Ready in\|ready started server\|▲ Next.js' $L    # → 150
grep -c 'Ready in.*▲ Next.js\|▲ Next.js.*Ready in' $L      # → 0  ⇒ ⛔ dòng nào khớp hai mẫu
```
Tôi nói đó là «đếm trùng» — **⛔ phải**. `grep -c` đếm DÒNG, ⛔ dòng nào khớp hai mẫu,
67+83+0=150 là **số học ĐÚNG**.
🔑 **Lỗi nằm ở CÁI TÊN, ⛔ ở phép tính:** tôi cộng HAI LOẠI SỰ KIỆN KHÁC NHAU
(thử-khởi 83 + khởi-xong 67) rồi dán lên tổng đó MỘT cái nhãn «số lần khởi».
📌 Nên mỗi con số trong sổ này phải đi kèm **LỆNH ĐẾM** — ⛔ có lệnh thì tháng sau
⛔ ai tra được nó đếm CÁI GÌ, và một cái nhãn sai sẽ sống mãi.
⚠️ Log còn **9.480 dòng `EADDRINUSE`** — máy chủ mới ⛔ chiếm được cổng vì bản cũ còn giữ.
Đó là bệnh KHÁC (launchd thử lại liên tục), và nó **⛔ đẻ mồ côi** — tiến trình chết lúc khởi,
chưa kịp sinh con nào. Ghi ra đây để người sau thấy số 9.480 thì ⛔ nối nhầm vào mục này.

📌 **Hệ quả:** ⛔ thêm `detached` để «chữa mồ côi». Chính việc cùng nhóm đang dọn hộ —
thêm cờ đó là **TỰ TAY ĐẺ RA** đúng thứ mồ côi mà nay ⛔ có.
🔑 **Bài học phương pháp:** mã cho biết **Ý ĐỊNH**, ⛔ cho biết **KẾT CỤC**. Ở đây một bên đo cách
**SINH** tiến trình rồi kết luận về cách **GIẾT** nó. Và: trước khi xin một phép thử PHÁ
(hạ máy chủ giữa lúc Owner đang dùng), hãy tìm phép đo **TĨNH** trả lời cùng câu hỏi —
`ps -o pgid` + đọc plist mất 5 giây, 0 rủi ro, thay trọn phép thử đó.
🗓 đo 31/08 14:33 · `claude-aiboss-app-pm` (đính chính kết luận của chính mình lúc 14:20)

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
