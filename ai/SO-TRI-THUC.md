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

### 0.2b 🔴 `grep` CÒN nói dối một kiểu nữa: mẫu tìm chứa `{ }` ⇒ ra **0** mà KHÔNG báo lỗi
Cắn thật 31/08 21:2x, **ngay trong lúc tôi đi kiểm bản sửa của chính tôi**: tôi vừa ghi chuỗi
`"${C}:src/..."` vào sổ, rồi tìm lại nó để nghiệm thu.
```bash
grep  -c 'git cat-file -e "${C}:' ai/SO-TRI-THUC.md   # → 0   ← DỐI
grep -cF 'git cat-file -e "${C}:' ai/SO-TRI-THUC.md   # → 2   ← THẬT
```
`grep` của macOS đọc `{C}` là **khoảng lặp** của biểu thức, KHÔNG phải hai ký tự. Nó ra 0 và
**thoát mã 1 y như «tìm hết rồi, không có»** — KHÔNG có một chữ nào báo rằng mẫu tìm bị hiểu khác.
🔑 Khác mục 0.2: ở đó **tệp** làm grep câm. Ở đây **mẫu tìm** làm grep câm — và mẫu tìm là thứ
người đo tự gõ ra, nên KHÔNG ai nghĩ tới việc nghi nó.
⚠️ **Đi tìm một chuỗi mã thì dùng `grep -F`.** Chuỗi mã hay có `{ } [ ] ( ) . * + ? |` —
   mỗi ký tự đó là một cơ hội để số 0 nói dối.
⚠️ Và số 0 ấy suýt làm tôi **sửa lại một tệp vốn đã ĐÚNG**. Đó mới là cái giá thật.
🗓 31/08 21:2x · `claude-aiboss-app-pm`

### 0.3 🔑 Phép thử do người **BIẾT mình đang đo** dựng ra chỉ đi qua chỗ người đó NGHĨ TỚI
Ca thật 31/08: P1-8 qua **7/7 cổng nghiệm thu, có đối chứng âm đầy đủ**. Vẫn còn BỐN lớp
chưa ai chạm tới, và cả bốn chỉ lộ ra khi Owner mở máy lên rồi chụp một tấm ảnh:
```
① máy THẬT của người dùng      (phép thử chạy trên trình duyệt điều khiển)
② qua ĐƯỜNG HẦM Tailscale       (phép thử chạy trên 127.0.0.1)
③ tab mở SẴN từ trước           (phép thử mở tab mới rồi mới dựng lại ca)
④ người thử KHÔNG BIẾT mình đang là một phép thử   ← nặng nhất, và ta KHÔNG tự tạo được
```

```
# ĐO LẠI — trước khi nói «đã nghiệm thu xong», ĐẾM SỐ LỚP giữa bàn đo và người dùng thật:
#   máy      : máy mình / máy điều khiển / máy người dùng
#   đường    : localhost / mạng nhà / đường hầm / internet
#   trạng thái: dựng sẵn cho phép thử / trạng thái người dùng đang có
#   người bấm: mình (biết đang đo) / người khác (không cầm bản đồ)
# Mỗi lớp KHÔNG đi qua được ⇒ ghi ra tên nó, và ghi AI có thể đi qua hộ.
# ĐỐI CHỨNG: nếu danh sách «chưa phủ» của bạn RỖNG thì gần như chắc chắn bạn chưa nghĩ đủ —
#            7/7 cổng của @exe vẫn còn bốn lớp, và chính @exe là người khai ra lớp ①-③.
```
📌 **Cách dùng đúng: KHAI RA chỗ mình chưa phủ rồi XIN người khác nhìn hộ.** Đó là lý do
ngày 31/08 ta *biết* P1-8 chạy, thay vì chỉ *tin* là nó chạy.
🗓 31/08 · vế ④ do `claude-phong-ban-pm` nêu · ca thật do Owner chụp lúc 16:54

### 0.4 🔑 CẢ SỔ NÀY SOI **SỐ**. Thứ lọt tới tay Owner hôm nay là một **CÂU**.
Ngày 31/08 đội dựng đủ đồ nghề cho SỐ: đối chứng dương · đối chứng âm · lệnh tái tạo ·
đường dẫn bền · «rỗng KHÔNG phải là 0» · «số mở cổng soi kỹ hơn số mô tả» ·
«n=2 chứng minh phương sai, KHÔNG chứng minh tỉ lệ».
**Cho CÂU thì không có gì cả.** Một câu chỉ cần nghe xuôi là qua.

🕳 **Ba ca thật, trong MỘT giờ, ba người khác nhau:**
```
① claude-aiboss-app-pm  → Owner: «đội làm xong tối nay ⇒ cửa sổ tự đóng, anh KHÔNG cần làm gì»
② claude-eroca-boss     → chuyển nguyên câu đó đi, sau khi đo BỐN con số quanh nó (đúng cả bốn)
③ claude-phong-ban-pm   → Owner: «anh chỉ cần một câu tick là đủ»
```
Cả ba câu **đều KHÔNG chứa mệnh đề sai nào**. Chúng sai ở chỗ **NỐI**.

```
# PHÉP KIỂM CHO CÂU — rẻ ngang phép kiểm cho số:
#   Câu nào có dạng «làm X ⇒ được Y» thì hỏi lại đúng một câu:
#      «LIỆT KÊ MỌI ĐƯỜNG tới Y. Có đường nào KHÔNG cần một điều kiện tôi CHƯA nói ra không?»
#   Mọi đường đều cần một điều kiện mà câu không nhắc  ⇒  CÂU ĐÓ SAI, dù nghe xuôi.
#
# BIẾN THỂ cho câu «anh KHÔNG cần làm gì» (claude-eroca-boss đặt):
#      «KHÔNG làm gì thì việc này TỰ đóng không? Chỉ ra cơ chế tự đóng.»
#   Chỉ không ra  ⇒  câu đó SAI, dù MỌI SỐ quanh nó đều đúng.
```
✅ **Phép này bắt được ngay trong giờ nó ra đời:** `claude-phong-ban-pm` áp nó lên câu của
CHÍNH MÌNH và tìm ra chỗ thiếu — «tick là đủ» sót điều kiện *«và để trình duyệt mở thêm một lúc»*,
vì chỉ trình duyệt mới chạy được ghế (`/api/chat` gọi từ ĐÚNG 1 chỗ trong `UngDung.tsx`).
```
Owner tick VÀ để trình duyệt mở thêm  ⇒ cửa sổ ĐÓNG
Owner tick RỒI TẮT NGAY               ⇒ quyết định có, cửa sổ VẪN MỞ
Owner KHÔNG tick                      ⇒ cửa sổ mở
```
Ba lối, ba kết cục. Câu cũ gộp hai lối đầu làm một.

📌 **Vì sao loại lỗi này khó nhất:** một SỐ sai thì đối chứng bắt được. Một CÂU sai kiểu này
**không có mệnh đề nào sai để bắt** — nó chỉ thiếu một điều kiện ở chỗ nối, và chỗ nối
thường là một dấu phẩy.
🗓 31/08 · phép do `claude-aiboss-app-pm` đề · biến thể do `claude-eroca-boss` đề ·
   `claude-phong-ban-pm` là người đầu tiên bị chính nó đo, và nhận

### 0.5 🔑 TÁCH LÕI RA KHỎI VỎ ⇒ phải **ĐẾM LẠI CHỐT Ở CẢ HAI BÊN**, ⛔ soi theo danh sách
Ca thật 31/08: tôi tách lõi chạy lượt khỏi `api/chat/route.ts`. Hai người soi, **cả hai đều hụt**
cùng một chỗ; người thứ ba (ngoài Claude) bắt được ngay.
```
tôi (tác giả)  đưa ra một danh sách chốt để người soi kiểm
ghế soi        tự đặt thêm một danh sách của mình
⇒ CẢ HAI danh sách đều do người ĐANG NHÌN VÀO BẢN MỚI viết ra
⇒ ⛔ ai đi hỏi: «đường CŨ có gì mà đường MỚI thiếu?»
```
🕳 Thứ bị bỏ rơi: `coPhien` (kiểm bản ghi phiên còn sống trước khi `--resume`) và `dangChay`
(chặn ghế đang chạy ở cửa sổ dòng lệnh). Cả hai **chỉ còn nằm trong CHÚ THÍCH** của lõi mới —
0 lệnh gọi — trong khi đường cũ gọi thật 3 lần và 2 lần.
🔴 **Và chú thích ấy LIỆT KÊ chúng như thứ đã có.** Người đọc lướt thấy một danh sách chốt đầy đủ.
> **Khai một ranh giới ⛔ phải là đã giữ ranh giới đó.**

```bash
# ĐO LẠI — phép soi cho MỌI lần tách/đổi đường đi:
# ① liệt kê chốt của đường CŨ (đường đang chạy thật)
git grep -n -E 'coPhien|dangChay|xinLuot|timNhanSu' -- src/app/api/chat/route.ts
# ② liệt kê chốt của đường MỚI
git grep -n -E 'coPhien|dangChay|xinLuot|timNhanSu' -- src/lib/chay-mot-luot.ts src/lib/may-chay-nen.ts
# ③ TRỪ hai danh sách. Mỗi chốt CŨ mà MỚI ⛔ có ⇒ phải có LÝ DO viết ra, ⛔ phải im lặng.
# ĐỐI CHỨNG DƯƠNG BẮT BUỘC: đếm trên đường CŨ phải RA SỐ > 0.
#   Ra 0 cả hai bên nghĩa là mẫu grep sai, ⛔ phải «hai bên đều sạch».
# ⚠️ grep bắt CẢ chú thích. Thấy tên chốt thì phải MỞ RA NHÌN nó là LỆNH GỌI hay chỉ là chữ.
#   Đây đúng chỗ tôi qua mặt được hai người soi.
```

📌 **Vì sao người ngoài bắt được:** họ ⛔ mang theo danh sách của ai. Hermes tự dựng phép so
bản-mới-với-bản-cũ vì nó ⛔ được cho một danh sách để tin.
🔑 Nói cách khác: **một người soi được đưa danh sách sẽ soi ĐÚNG danh sách đó — và chỉ danh sách đó.**
Danh sách càng đầy đủ trông càng đáng tin, thì càng ít ai nghĩ tới việc đi tìm ngoài nó.
🗓 31/08 · `hermes-aiboss-app-review` bắt (FAIL ⑥) · `claude-phong-ban-pm` gọi tên phép soi còn thiếu
   · `claude-aiboss-app-pm` là tác giả chỗ hổng

### 0.6 🔑 Một LÝ DO đúng lúc viết sẽ ÂM THẦM SAI ĐI khi thứ nó dựa vào đổi — và KHÔNG có gì kêu lên

Ca thật 31/08 (P0-2d). Chú thích cũ trong `UngDung.tsx` tự biện hộ:
> *«thà chạy lại còn hơn mất câu»* ⇒ nên nó **chạy trước, xác nhận sau**.

Vế đó ĐÚNG **khi cửa xác nhận chưa biết từ chối**. P0-2d dạy cửa ấy biết từ chối
(`khac-trinh-duyet`) ⇒ vế đó **hết đúng**. Nhưng nó KHÔNG tự hết đúng: chú thích vẫn nằm
nguyên chỗ cũ, vẫn đọc rất thuyết phục, và vẫn sẽ thuyết phục người tới sau.

🔑 **Mã có phép thử báo khi nó sai. LÝ DO thì KHÔNG có gì báo cả.**
Chốt hỏng thì đỏ đèn. Lý do hết hạn thì im lặng, và tiếp tục được trích dẫn.

**Đo lại — dấu hiệu rẻ nhất là TUỔI: chú thích già hơn đoạn mã nó biện hộ thì đáng ngờ.**
```bash
cd ~/Projects/aiboss-app-chat
F=src/components/UngDung.tsx
git blame --date=short -- "$F" | grep -nE '(thà .*còn hơn|chấp nhận|đành |cố ý (KHÔNG|không))' | head
# ĐỐI CHỨNG DƯƠNG BẮT BUỘC — chứng minh blame ĐỌC ĐƯỢC tệp, số 0 ở trên mới có nghĩa:
git blame -- "$F" | grep -c '//'      # phải RA SỐ > 0
```
⚠️ Ra 0 mà đối chứng dương cũng 0 ⇒ **thước hỏng**, KHÔNG phải «sạch».
⚠️ Tuổi chỉ là dấu hiệu. Phép soi THẬT là: **đọc lý do → gọi tên ĐIỀU KIỆN nó dựa vào → đi kiểm
   điều kiện đó còn đúng KHÔNG.** Sửa xong một cửa thì phải đi tìm mọi lý do dựa vào cửa ấy.
🗓 31/08 21:2x · `claude-aiboss-app-exe` **nêu** · `claude-aiboss-app-pm` ghi sổ

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

### 2.3b 🔑 Thay vì tìm trong BẢN DỰNG, hãy hỏi COMMIT mà bản dựng sinh ra từ đó
Ca thật 31/08 21:17: `claude-phong-ban-pm` định kết luận «P0-2b KHÔNG lọt vào bản dựng» bằng
bốn phép tìm chuỗi trong `.next` — cả bốn ra 0. Ba trong bốn là **thước mù**: `may-chay-nen`,
`chay-mot-luot` là TÊN TỆP (bản dựng gộp tệp lại), `daNhanTrongVong` là TÊN BIẾN (bị rút gọn).
**Bản dựng biến đổi mã. Git thì KHÔNG.**
```bash
cd ~/Projects/aiboss-app-chat
C=218a918     # ← mã commit NGƯỜI DỰNG KHAI lúc dựng, KHÔNG phải HEAD hôm nay
git cat-file -e "${C}:src/lib/may-chay-nen.ts"  2>/dev/null && echo "CÓ"         || echo "KHÔNG có"
# ĐỐI CHỨNG DƯƠNG BẮT BUỘC — một tệp chắc chắn CÓ:
git cat-file -e "${C}:src/lib/kho-danh-thuc.ts" 2>/dev/null && echo "thước SỐNG" || echo "🔴 thước HỎNG"
```
⚠️ **Bắt buộc `${C}` có ngoặc nhọn.** Viết `"$C:src/..."` thì **zsh** đọc `:s` thành
   «modifier» và văng `bad substitution` — bash chạy được, zsh thì KHÔNG. Đo 31/08, cắn thật.
🔴 **Chỗ dễ ngã:** `HEAD` trả lời «commit mới nhất», KHÔNG phải «commit mà bản đang chạy sinh ra
từ đó». Commit thêm một cái sau khi dựng là hai thứ ấy tách nhau ngay.
⇒ Phải **ghim mã commit TẠI LÚC DỰNG** rồi hỏi git về chính mã đó. Nếu KHÔNG ai ghi lại mã ấy
thì git KHÔNG trả lời được câu này — lúc đó mới lui về dấu vân trong `.next` (mục 3.2).
🗓 31/08 21:17 · `claude-phong-ban-pm` **nêu** · `claude-aiboss-app-pm` thêm vế «ghim commit nào»

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

### 3.7 🔑 Muốn biết «bản mới đã lên chưa» thì **HỎI CỬA**, đừng bóc chú thích trang
Cách hiển nhiên nhất — so `.next/BUILD_ID` với mã trong chú thích HTML — **SAI hai lần**.

```bash
# ✅ CÁCH ĐÚNG — hỏi chính app xem NÓ nghĩ nó là bản nào:
curl -s -u "$U:$P" -X POST http://127.0.0.1:4319/api/danh-thuc/nhan \
  -H 'Content-Type: application/json' -d '{"ds_o":[],"ds_ban":[],"ma_trinh_duyet":"do"}' \
  | sed -n 's/.*"ban_dung":"\([^"]*\)".*/\1/p'
cat ~/Projects/aiboss-app-chat/.next/BUILD_ID
# KHỚP NGUYÊN VĂN thì mới là đã nạp. ĐỐI CHỨNG DƯƠNG: chuỗi rút ra phải dài >0 —
# rỗng nghĩa là máy chủ đang chạy bản TRƯỚC P1-8 (bản đó chưa có trường này), KHÔNG phải «chưa nạp».
```

🕳 **HAI BẪY của cách bóc chú thích, tôi cắn cả hai trong mười phút (31/08 16:3x):**
```
① Next ĐỔI «-» thành «_» khi nhúng mã bản dựng vào trang:
     đĩa   JLA2FZB444Ozc4tOCPd-H
     trang JLA2FZB444Ozc4tOCPd_H     ← lệch đúng 1 ký tự, vị trí 19
   🔴 Hai bản dựng TRƯỚC đó (EallAvplga6I5sc8PwYss · iksVzaJERrPeAtsZE1Fyq) KHÔNG có
      gạch ngang nào ⇒ phép so vẫn đúng suốt. Nó chỉ hỏng ĐÚNG LẦN ĐẦU gặp mã có gạch ngang.
   📌 Một phép đo đúng nhiều lần liền KHÔNG chứng minh nó đúng — có thể chỉ là chưa gặp ca xấu.

② `sed -n 's/.*<!--\(.*\)-->.*/\1/p'` THAM LAM: trang nặng 171KB có nhiều chú thích,
   `.*<!--` ăn tới cái CUỐI CÙNG ⇒ trả ra rác («/$»). Mã bản dựng nằm ở chú thích ĐẦU (byte 16).
   Lúc đo tay tôi có `head -c 200` nên KHÔNG lộ; cắm vào script mà quên nó là lộ ngay.
```
🔴 **Hậu quả nếu ai cắm bản bóc-chú-thích vào một bộ kiểm tự động:** nó báo «CHƯA NẠP»
**mãi mãi**. Và **một bộ báo động luôn kêu sai còn tệ hơn không có bộ báo động** —
người ta học cách bỏ qua nó, rồi bỏ qua luôn lần nó kêu đúng.
🗓 đo 31/08 16:3x · `claude-aiboss-app-pm` cắn · thước đúng do `claude-aiboss-app-exe` tìm ra

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

### 3.8 Tab cũ tự lộ ra là nó cũ (P1-8) — ba chỗ hở, và cái thứ ba làm nó im ĐÚNG lần nạp đầu
```bash
# máy chủ ĐANG PHỤC VỤ bản nào — hỏi thẳng, KHÔNG suy từ mốc tệp
curl -s -X POST localhost:4319/api/danh-thuc/nhan -H 'Content-Type: application/json' \
     -d '{"ds_o":[],"ds_ban":[]}' | python3 -m json.tool | grep ban_dung
# ĐỐI CHỨNG DƯƠNG: so với đĩa — hai số PHẢI khớp sau khi nạp
cat .next/BUILD_ID
```
🔴 **Giả thuyết 404 ĐÃ BỊ BÁC BẰNG SỐ — đừng ai đi lại đường này.**
Ai cũng đoán «nạp xong, tab cũ xin bó JS cũ ⇒ bó đổi tên ⇒ 404 ⇒ vỡ giao diện». Đo 31/08:
bó cũ `page-fdeb465ab3c8b19d.js` VẪN CÒN trên đĩa sau lần dựng mới (đối chứng dương: bó của
bản mới cũng có ⇒ lệnh `ls` KHÔNG mù). **Next GIỮ LẠI bó cũ qua các lần dựng.**
⇒ Cơ chế hỏng thật thì tới nay CHƯA AI ĐO ĐƯỢC. Nên bản vá KHÔNG đoán tab hỏng kiểu gì —
nó chỉ khai một sự thật kiểm được: **mã máy chủ hiện là bản nào.**

🕳 **CHỖ HỞ ③ — thứ đáng nhớ nhất, và suýt lọt:**
«lần đầu tiên thì nhớ, đừng báo» ngầm giả định lần đầu đó xảy ra NGAY SAU KHI TẢI TRANG.
Ở lần nạp ĐẦU TIÊN sau khi tính năng lên, máy chủ cũ chưa có khoá ⇒ tab nhận khoá lần đầu
là SAU khi nạp ⇒ bị coi là «lần đầu» ⇒ IM. **Cơ chế chỉ chạy đúng từ lần thứ HAI.**
```
CHỮA: gộp thành MỘT dấu vân, phân biệt ba trạng thái, KHÔNG gộp hai cái sau làm một:
   KHÔNG có khoá   → '(khong-co-khoa)'   máy chủ chưa có tính năng
   có khoá, rỗng   → ''                  next dev (KHÔNG sinh BUILD_ID)
   có khoá, có giá → mã bản dựng
   ô nhớ khởi tạo `null`, KHÔNG phải chuỗi rỗng — rỗng là một GIÁ TRỊ HỢP LỆ THẬT.
```
🔑 **Bài học phương pháp:** một cờ «đã thấy lần đầu chưa» mà dùng CHUỖI RỖNG làm mốc «chưa thấy»
là gộp «chưa đo» với «đo được rỗng». Cùng họ với «RỖNG khác 0» ở mục 0.2 — chỉ khác chỗ áp dụng.

📏 **ĐO chiều cao băng, ĐỪNG gõ số cứng** — số thật khác nhau theo máy:
```
màn 1440×900 → băng cao 49px      màn 390×844 (điện thoại) → 76px (xuống 2 dòng)
```
Định gõ «44px» thì SAI ở CẢ HAI. Dùng ResizeObserver ghi vào biến CSS, mặc định `0px`
⇒ khi KHÔNG có băng thì mọi phép `calc` là phép trừ 0, bố cục hiện tại KHÔNG đổi một ly.
⚠️ Và phải bọc đúng `@media` như mau09 — globals ĐÈ mau09, viết trần là giẫm nhánh màn hẹp.
⚠️ Băng phải `position:fixed` z-index **trên 60**: màn ≤1040px có `.cot-3.mo-khu{inset:0;z-index:60}`
phủ toàn màn, băng nằm trong dòng chảy sẽ bị che SẠCH đúng trên máy Owner đang dùng.

🔬 **Cổng nghiệm thu quan trọng nhất là ĐỐI CHỨNG ÂM:** nạp lại máy chủ mà KHÔNG dựng lại
(cùng BUILD_ID) ⇒ băng phải IM. Thiếu nó thì một cái băng **luôn hiện** cũng qua được phép kiểm,
và ta có thêm một phép kiểm chết. Nó chứng minh ta so BẢN DỰNG, KHÔNG phải so «máy chủ có khởi lại».
🗓 đo 31/08 16:2x · `claude-aiboss-app-exe` (chỗ hở ③ do `claude-phong-ban-pm` tìm ra) · 7/7 cổng đạt

### 3.9 Cửa hỏng PHẢI NÓI RA (P1-8b) — và ngưỡng báo động chọn thế nào cho khỏi bị bỏ qua
```bash
# ĐO khoảng chết mỗi lần nạp — quyết định ngưỡng phải dựa vào ca XẤU NHẤT, KHÔNG phải trung vị
bash ~/Operations/scripts/do-khoang-chet-nap.sh
# n=10 · nhỏ nhất 3s · trung vị 9s · LỚN NHẤT 9s   (đo 30-31/08, CHẶN TRÊN)
# ngưỡng đang dùng: 3 nhịp × 5s = 15s  ⇒ dư 6s so với ca xấu nhất
```
🕳 **Ca:** `if (!r.ok) return` bỏ qua lặng lẽ khi cửa lỗi. Nghe như chuyện nhỏ — «trễ một nhịp
rồi tự khỏi». Nhưng lời gọi lỗi **KHÔNG mang dữ liệu nào**, nên việc phải làm KHÔNG phải «thử lại»
mà là **cho cái hỏng LÊN TIẾNG**.
🔑 **Vế nâng nó từ «nhỏ» lên CAO:** cửa hỏng và mã cũ **hay đi cùng nhau**. Đúng lúc app trục trặc
là lúc người dùng cần biết nhất, mà lại là lúc app câm nhất.
📌 **Nếp rút ra:** xếp mức cho một chỗ hở thì phải xét cả những chỗ hở nó HAY ĐI KÈM.
Hai lỗi «nhỏ» xảy ra cùng lúc thì tổng của chúng KHÔNG nhỏ. (Ba người nhìn cùng một dòng,
hai người xếp nhẹ — người thứ ba nhìn ra chỗ hai lỗ gặp nhau.)

⏱ **CHỌN NGƯỠNG — vì sao 3 chứ KHÔNG phải 1:**
```
mỗi lần nạp lại máy chủ đều chết vài giây ⇒ ngưỡng 1 là băng NHẤP NHÁY MỖI LẦN NẠP
🔑 một băng kêu sai thì người ta học cách bỏ qua nó — và thế là mất luôn những lần nó kêu ĐÚNG
```
⚖️ **Con số 3 là số CHỌN theo lý, nhưng ĐÃ có 10 lần nạp thật đứng sau** (bảng trên).
Người sau muốn sửa thì biết mình đang sửa cái gì, và biết cả giới hạn: đó là **CHẶN TRÊN**,
khoảng chết thật còn ngắn hơn.

🔀 **MỘT băng cho hai trạng thái, ĐỪNG dựng băng thứ hai:** hai băng giành nhau đỉnh màn,
mà biến `--cao-bang` chỉ đo được MỘT cái ⇒ cái kia đẩy đáy ra ngoài (xem 3.8).
Thứ tự: cái Owner **LÀM ĐƯỢC** đứng trước cái anh ấy KHÔNG làm gì được.
⚠️ **Câu chữ chỉ nói thứ biết chắc:** «đã hỏi 3 lần liên tiếp mà chưa nhận được trả lời».
KHÔNG nói «app đang hỏng» — ta KHÔNG biết vì sao, và KHÔNG biết app còn chạy việc hay KHÔNG.

🪤 **HAI BẪY ĐO CẮN TRONG CHÍNH VIỆC NÀY — cả hai đều là thước ĐÚNG mà DÙNG SAI:**
```
① ĐO SAI LÚC. Phép thử đầu: cho cửa hỏng 4 nhịp rồi CHỜ 26 giây mới nhìn ⇒ ra 0
   ⇒ suýt kết luận «bản vá KHÔNG chạy». Sự thật: cửa hồi từ nhịp thứ 5, băng hiện RỒI TẮT
     trước lúc nhìn. Cứu được là nhờ phép thử in kèm BỐI CẢNH («gọi 8 · lỗi 4»), KHÔNG phải
     chỉ in đúng/sai.
   ⇒ NẾP: phép thử phải in cả bối cảnh. Rẻ hơn một vòng cả đội đi tìm lỗi ma.
② ĐỐI CHỨNG DƯƠNG CHỌN SAI MẪU. Kiểm sổ có mục P1-8b chưa, tôi lấy «bang-ma-cu» làm
   đối chứng dương ⇒ ra 0 ⇒ tưởng thước câm. Thật ra chuỗi đó CHƯA BAO GIỜ có trong sổ.
   ⇒ Số 0 nói về MẪU, KHÔNG nói về THƯỚC.
   🔑 Đối chứng dương chỉ có nghĩa khi mẫu là thứ **CHẮC CHẮN CÓ**. Lấy một thứ mình
     CHƯA KIỂM làm đối chứng thì đó là thêm một ẩn số, KHÔNG phải thêm một điểm tựa.
```
🗓 đo 31/08 17:2x · `claude-aiboss-app-exe` (mức CAO do `claude-aiboss-app-pm` nâng ·
bảng 10 lần nạp do `claude-aiboss-app-pm` rút, tôi chạy lại lệnh tái tạo và KHỚP nguyên văn)

---

### 3.10 🔑 CÓ **HAI** cách cho một ghế thấy phiên cũ — tài liệu trước nay chỉ kể MỘT
Ai đọc tài liệu cũ sẽ tưởng **fork** là đường duy nhất. Sai, và fork là đường ĐẮT hơn.

| | cách A · **FORK** | cách B · **ĐẶT CHỖ ĐỨNG** |
|---|---|---|
| làm gì | chép phiên về kho ghế, cấp mã MỚI | cho ghế đứng NGAY tại thư mục chứa phiên |
| giữ được | **6,5%** (đo 20/08: 19.305 → 1.257 dòng) | **100%** |
| khoá | (không có) | `thu_muc` trong hồ sơ ghế |
| dùng khi | phiên ở kho mà ghế KHÔNG thể đứng vào | phiên ở thư mục ghế đứng được |

```bash
# ĐO LẠI — ghế nào đang dùng cách B:
python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/Projects/aiboss-app-chat/du-lieu/nhan-su.json')))
g=d['nhan_su']; co=[x for x in g if x.get('thu_muc')]
print('ghe=%d · co thu_muc=%d' % (len(g),len(co)))
[print(' ',x['ten'],x['thu_muc']) for x in co]"
# 31/08: 225 ghế · 5 có thu_muc (trọn bộ «Quản Lý Trường»), đều trỏ /Users/erocathanh
# ĐỐI CHỨNG DƯƠNG: tra 'claude-eroca-boss' phải ra True · tra một tên bịa phải ra False
```

🔴 **BẪY ĐỌC TỆP NÀY — tôi cắn BA lần liền trong 5 phút:** `nhan-su.json` KHÔNG phải một danh sách.
Nó là `{phong_ban:[7], nhan_su:[225], tong:int}`. Tôi ĐOÁN hình dạng rồi `list(d.values())`
⇒ ra **3 ghế**, rồi ra **0 ghế**. Cả hai đều vô nghĩa mà **trông y như số đo**.
📌 **Ba lần ra ba con số khác nhau ⇒ lỗi ở PHÉP ĐỌC, đừng đổ cho dữ liệu.** Mở cấu trúc ra NHÌN
trước khi viết vòng lặp: `print(type(d), list(d.keys()))` — hai giây, chặn được cả ba lần sai.

🔴 **ĐÍNH CHÍNH 31/08 19:4x — tôi viết bảng trên như thể hai cách CẠNH TRANH nhau. SAI.**
```
chay-agent.ts:218   fs.mkdirSync(ts.thuMuc, { recursive: true })   ← chạy NGAY TRƯỚC MỖI lần spawn
⇒ thư mục ghế TỰ SINH mỗi lượt. KHÔNG cần fork, KHÔNG cần tạo tay.
```
⇒ **Fork KHÔNG phải đường để có chỗ đứng riêng.** Fork chỉ CHÉP PHIÊN. Hai việc khác nhau hẳn:
```
chỗ đứng  : tự sinh, miễn phí, mọi ghế đều có
phiên cũ  : muốn thấy thì HOẶC đặt `thu_muc` trỏ đúng kho, HOẶC fork (mất 93,5%)
```
📌 Cả đội bàn fork suốt một buổi chiều **như thể nó là đường tạo chỗ đứng**. Nó không phải.
Phát hiện của `claude-aiboss-app-exe`, tôi đo lại tại `:218` — đúng.

📏 **Và đây là lý do đúng 5 ghế đó hỏng, đo 31/08:**
```
5 ghế khai thu_muc = /Users/erocathanh (thư mục NHÀ)
⇒ ~/claude-hieu-truong · ~/claude-phong-dao-tao · … : KHÔNG cái nào tồn tại
   (đối chứng dương: ~/claude-aiboss-app-pm CÓ · đối chứng âm: thư mục bịa KHÔNG)
⇒ chúng KHÔNG có thư mục riêng ⇒ KHÔNG có chỗ đặt một CLAUDE.md khai vai riêng
⇒ cách «dặn ghế tự sửa CLAUDE.md của nó» áp được cho 220 ghế kia, KHÔNG áp được cho đúng 5 ghế này
```

🎯 **Vì sao cách B đúng cho bộ «Quản Lý Trường»** (chú thích thiết kế có sẵn `nhan-su.ts:22-28`):
kho phiên được SUY TỪ chỗ đứng. Năm phiên Owner muốn nối nằm ở kho `-Users-erocathanh`.
Không đặt chỗ đứng thì `--resume` đi tìm ở `-Users-erocathanh-claude-hieu-truong`
và **không bao giờ thấy** — ghế mở ra TRỐNG.
⇒ Người làm việc đó ngày 30/08 chọn ĐÚNG. **Tài liệu thiếu, không phải thiết kế sai.**

🔬 **VÀ MỘT SỐ ĐO CHẶN ĐƯỜNG, nay đã có** (31/08, phiên rác + hai lượt thật):
```
claude -p --append-system-prompt 'ten ban la ZORBAX'          → tạo phiên
claude -p --resume <mã> --append-system-prompt 'ten ban la QUIXNAR' + hỏi tên
   ⇒ trả lời: QUIXNAR        ⇒ ✅ HAI CỜ CHẠY CÙNG NHAU, lời dặn MỚI ĐƯỢC NẠP
```
Quan trọng vì `chay-agent.ts:179-183` dùng `else if`: **nối phiên cũ thì lời dặn KHÔNG bao giờ nạp**
⇒ ghế chạy bằng `--resume` chưa từng nghe câu «bạn là ghế X», nên nó tự xưng tên trong trí nhớ cũ.
Nó KHÔNG sai — **nó chưa từng được báo.**
⚠️ `else if` đó **không có chú thích nào**, trong khi MỌI cờ quanh nó (`:160-176`) đều có chú thích
giải thích lý do. Bằng chứng nghiêng về SÓT hơn là cố ý — nhưng đó là suy đoán, chưa phải kết luận.
🗓 31/08 · `claude-phong-ban-pm` phát hiện tài liệu kể một nửa + tìm ra `else if` · `claude-aiboss-app-pm` đo lại

### 3.11 🔴 Cái phanh của bộ hẹn NÓI «BÁO rồi THOÁT» mà có thể LÀM «NỔ» — một dòng xoá đè lên nó
`~/Operations/scripts/hen-khoi-dong-lai-app.sh`, đọc theo dòng:
```
:71   quá trần THEO LỜI APP ⇒ in «🛑 BÁO rồi THOÁT» ; BAN=" $AI"
:93   BAN=""                ← xoá VÔ ĐIỀU KIỆN, ngay sau đó
:100  BAN nạp lại từ mtime
:101  [ -z "$BAN" ] ⇒ «MỌI ghế im ⇒ RẢNH, nổ»
```
⇒ `BAN=" $AI"` ở `:71` là **gán chết** (đúng loại mục 0.1). Khi app nói BẬN mà mtime nói IM —
ca này CÓ thật, mục 3.4: ghế chờ công cụ thì tệp im mà lượt vẫn chạy — script **in ra câu hoãn
rồi khởi động lại luôn**, đúng thứ Owner cấm 31/08.
```bash
# chạy lại phép ĐẢO, KHÔNG đụng tệp thật:
bash -c 'CHO=700; TRAN=600; AI="ghe-x "
if [ "$CHO" -ge "$TRAN" ]; then echo "NÓI: 🛑 BÁO rồi THOÁT"; BAN=" $AI"; fi
BAN=""
[ -z "$BAN" ] && echo "LÀM: ⇒ RẢNH, NỔ"'
# ĐỐI CHỨNG DƯƠNG: bỏ dòng BAN="" đi thì câu thứ hai BIẾN MẤT ⇒ phép đảo do ĐÚNG dòng đó gây ra
```
📌 **Chưa cắn ai** (đo 31/08 21:2x): 6 nhật ký, **1** lần chạm trần — 15:38, 604s — và lần ấy
mtime CŨNG nói bận (18s · 1s · 14s) nên `BAN` được nạp lại và script thoát ĐÚNG.
🔑 Nó sống sót nhờ **hai thước tình cờ đồng ý**, KHÔNG phải nhờ mã đúng. Chính ca «hai thước lệch
nhau» mới là ca thiết kế hai thước sinh ra để lo — và đó đúng là ca nó hỏng.
⚠️ **KHÔNG sửa tệp này trong lúc có tiến trình đang chạy nó**: `bash` đọc script theo VỊ TRÍ BYTE,
sửa giữa chừng làm nó nhảy vào rác. Kiểm trước: `pgrep -f hen-khoi-dong-lai-app` phải RỖNG.
🗓 31/08 21:2x · `claude-aiboss-app-pm`

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
