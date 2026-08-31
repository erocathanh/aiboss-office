# 📁 `ai/` — tài liệu cho AI agent của dự án `aiboss-app-chat`

> Khuôn theo `~/Projects/claude-master-app/ai/` và `~/Projects/youtube-modeling/ai/` (Owner chỉ định 30/08/2026).
> Mọi phiên AI vào dự án này ĐỌC THEO THỨ TỰ DƯỚI, đừng đọc lung tung rồi đoán.

## Thứ tự đọc (bắt buộc)

| # | Tệp | Trả lời câu gì |
|---|---|---|
| 1 | `MASTER-PLAN.md` | Dự án này là gì · đang ở đâu · đi đâu · luật nào KHÔNG được phá |
| 2 | `TASK_BOARD.md` | Việc nào đang mở · ai làm · **nghiệm thu bằng phép đo nào** |
| 3 | `DECISION_LOG.md` | Vì sao chốt như vậy · ai chốt · số đo lúc chốt |

## Luật của thư mục này

- **Một sự thật một chỗ ở.** Thấy hai tệp nói cùng một điều thì gộp, đừng chép.
- **Mọi con số phải kèm GIỜ ĐO.** Số không có giờ là số chết (xem bẫy ⑩ trong sổ bẫy đo).
- **Không chép lại sổ bẫy đo vào đây.** Nguồn duy nhất: `~/Operations/SO-BAY-DO.md`.
- **Viết chữ «không», đừng dùng ký hiệu cấm** — ký hiệu đó đọc lên không có âm, mọi bản đọc và
  bản tóm tắt đều rơi mất vế phủ định. Luật ở `~/CLAUDE.md`.
- Tệp trong đây **được git theo dõi** — đừng ghi khoá, mật khẩu, hay tên người thật vào.

## Ai giữ tệp nào

| Tệp | Người giữ |
|---|---|
| `MASTER-PLAN.md` · `TASK_BOARD.md` | `claude-aiboss-app-pm` (PM của app) |
| `DECISION_LOG.md` | ai chốt thì người đó ghi, ghi nối đuôi, không sửa mục cũ |
| bản soi và nghiệm thu | `claude-phong-ban-pm` (App Reviewer) |

## 🖊 KÝ TÊN VÀ GHI GIỜ — luật Owner đặt 30/08/2026, áp cho MỌI tệp trong `ai/`

**Ai lưu nội dung gì thì ghi ngay tại nội dung đó: TÊN NGƯỜI LƯU và THỜI GIAN LƯU.**
Mục đích: mở tệp ra là biết ai đổi cái gì, lúc nào — không phải đi tra lịch sử kho.

### Khuôn bắt buộc
```
· Mỗi MỤC mới thêm vào tệp    → cuối mục ghi:  (ghi 30/08/2026 09:45 · claude-<tên-ghế>)
· Mỗi tệp mới trong ai/       → ngay dưới tiêu đề:  > 👤 <tên-ghế> · 📅 <ngày giờ tạo> · 🔄 v<số>
· Mỗi lần SỬA mục người khác  → giữ dòng ký cũ, THÊM dòng mới:
                                 (sửa 30/08/2026 10:12 · claude-<tên-ghế> — sửa gì)
```
### Ba điều bắt buộc, thiếu một là chưa xong
```
① GIỜ LẤY TỪ MÁY, đừng gõ tay:  bash ~/Operations/scripts/tieu-de-kenh.sh  (hoặc `date`)
   Ca thật 30/08: một ghế gõ tay mốc giờ, sai BA lần liền, có lần lệch tới 11 phút về TƯƠNG LAI.
② KHÔNG sửa dòng ký của người khác. Sai thì thêm dòng đính chính bên dưới, giữ nguyên dòng cũ.
   Sổ sách sửa được thì nó thôi làm sổ sách.
③ KHÔNG xoá mục cũ để dọn cho gọn. Hết giá trị thì đánh dấu «đã thay bằng ...» và để lại.
```
📌 **Vì sao cần, nói bằng ca thật:** trong một buổi sáng 30/08, bốn ghế cùng ghi vào các tệp trong `ai/`
và vào sổ dùng chung. Có hai mục mang trùng số hiệu, hai người cùng dựng một phần trong cùng một phút
mà không ai biết ai, và một tệp bị đọc lúc 172 dòng rồi ghi vào lúc đã 213 dòng.
Không có chữ ký thì không cách nào lần ra ai làm gì — mà kho chỉ ghi được người **commit**,
thường không phải người **viết**.

(ghi 30/08/2026 09:45 London · claude-phong-ban-pm — Owner đặt luật, tôi ghi vào đây)

---

## 🔍 BUILD LỚN PHẢI CÓ HERMES SOI — luật Owner đặt 30/08/2026

**Luật một câu:** bản dựng **lớn và quan trọng** thì ngoài App Reviewer, PM **phải gọi thêm
`hermes-<slug>-review`**. Chỉ được bỏ qua khi Hermes **hết hạn mức** — và phải ghi lại là đã bỏ qua.

### Thế nào là «lớn và quan trọng» — chạm MỘT trong bốn là đủ
Định nghĩa bằng SỐ, vì «lớn» ai cũng hiểu một kiểu:
```
① đụng ĐƯỜNG ĐỌC/GHI DỮ LIỆU của người dùng — sổ ô · lịch sử chat · hàng đợi · kho phiên
② từ 3 TỆP NGUỒN trở lên, hoặc từ 100 DÒNG thay đổi trở lên
③ đổi HÀNH VI MẶC ĐỊNH mà Owner đang dựa vào (trần, ngưỡng, cách nạp, cách hiển thị)
④ bản vá sinh ra TỪ MỘT SỰ CỐ — vì bản vá vội là bản vá dễ đẻ lỗi kế tiếp
```
Chỉ sửa chữ, sửa màu, sửa chú thích thì **không cần** — đừng gọi Hermes cho việc vặt.

### Gọi thế nào
```
skill /giao-viec-hermes → bước 0 chọn hồ sơ `reviewer` (🔒 chỉ đọc) → khuôn Ⓐ --safe-mode
tên vai: hermes-aiboss-app-chat-review
đề bài phải có: path THẬT + vùng dòng · tiêu chí ĐÁNH SỐ · verdict PASS/FAIL từng tiêu chí
                kèm bằng chứng TRÍCH SỐ DÒNG · câu khoá «CHỈ đọc, KHÔNG sửa tệp»
```
📌 App Reviewer và Hermes **không thay nhau**: một người trong nhà, một người ngoài hãng.
Hai thước độc lập trùng nhau thì mạnh hơn một thước.

### 🔖 MỘT DỰ ÁN = MỘT PHIÊN HERMES — luật Owner bổ sung 30/08/2026

```
MÃ PHIÊN CHUẨN CỦA DỰ ÁN NÀY:  20260830_115426_678644
tên:  aiboss-app-chat · hermes-review · phan-trang lich-su · 2026-08-30
gọi:  ~/.local/bin/reviewer --resume 20260830_115426_678644 --safe-mode -z "$(cat <đề-bài>)"
```
**⛔ mở phiên mới nếu ⛔ cần.** Phiên sống mang bối cảnh dự án: kiến trúc, quyết định cũ, verdict trước.
Đẻ phiên mới là bắt Hermes đọc lại từ đầu và mất hết chỗ nó đã hiểu.

🕳 **Ca thật 30/08, đo bằng `reviewer sessions list`:** dự án này có **5 phiên reviewer trong MỘT ngày**,
trong đó **đã có sẵn một phiên đặt tên chuẩn lúc 07:29** mà tôi vẫn đẻ thêm phiên mới lúc 11:54.

🔴 **Và đây là chỗ đẻ rác mà ⛔ ai để ý:** mỗi phiên đặt-tên đều có một phiên **VÔ DANH ngay trước nó**
(07:28→07:29 · 11:53→11:54). Thủ phạm là **bước pre-flight «thử thật một câu rẻ»** — gọi trần
thì nó **đẻ một phiên mới mỗi lần**.
✅ Cách đúng: chạy pre-flight **NGAY TRONG phiên chuẩn**:
```
~/.local/bin/reviewer --resume <mã chuẩn> chat -q "Trả lời đúng một chữ: OK"
```

⚠️ **Khi nối lại, đề bài PHẢI có câu chống thiên kiến neo:**
> *«Sẵn sàng BÁC BỎ CHÍNH MÌNH nếu bằng chứng mới nói khác — kể cả kết luận bạn đã rút ở lượt trước.»*
Thiếu câu này thì phiên sống thành phiên **bảo thủ**: nó bênh verdict cũ của chính nó.

⚠️ **⛔ BAO GIỜ lấy «phiên gần nhất» làm mặc định** — dự án khác gọi Hermes song song, «gần nhất»
rất dễ là phiên người ta. Luôn gọi bằng **MÃ ghi ở trên**.
📌 **Tên phiên phải DUY NHẤT** — đặt trùng tên là Hermes từ chối, đo được 30/08:
*«Title … is already in use by session …»*. Nên tên rác phải kèm giờ: `RAC - pre-flight 0828`.
📌 Mã đổi thì sửa ngay dòng này. Mã nằm trong đầu ai đó ⛔ tính là đã lưu.

### 🔴 THỨ TỰ — luật này chỉ có nghĩa nếu gọi ĐÚNG LÚC
```
SAI  : App Reviewer đạt → PM mở cổng build → exe build → rồi mới gọi Hermes
ĐÚNG : App Reviewer đạt → GỌI HERMES → Hermes đạt → MỚI mở cổng build
```
🕳 **Ca thật 30/08 11:50-11:57, chính tôi gây ra:** tôi mở cổng build lúc 11:50, exe build lúc 11:52,
Hermes trả verdict lúc 11:57 — **NO-GO, 4/7 FAIL + 2 BLOCKER**. May là bản dựng còn nằm trên đĩa
(máy chủ khởi 11:17, chưa nạp) nên chưa ai lãnh. Nhưng đó là **may, không phải quy trình**.
📌 Cổng mở rồi thì lời soi tới sau chỉ còn là lời than.

### Khi nào ĐƯỢC bỏ qua — và dấu hiệu nhận biết đã đo được
```
CHỈ bỏ khi Hermes hết hạn mức. Dấu hiệu THẬT, đo 29/08/2026 20:2x:
   HTTP 429 · {'type':'usage_limit_reached', 'plan_type':'plus', 'resets_in_seconds': 6017}
   và nhà dự phòng claude-opus-5 trả HTTP 401 «API key is invalid» ⇒ hết đường lui
🔴 `hermes status` XANH KHÔNG có nghĩa còn hạn mức — nó đọc CẤU HÌNH, không đọc HẠN MỨC.
   Phải THỬ THẬT một câu rẻ trước khi giao: hermes -p reviewer chat -q "Trả lời đúng một chữ: OK"
```
Bỏ qua thì **ghi một dòng vào `DECISION_LOG.md`**: bỏ lúc nào · vì sao · mốc `resets_at` mở lại.
Không ghi thì lần sau không ai biết bản dựng đó **chưa từng có mắt ngoài nào soi**.

(ghi 30/08/2026 11:5x London · claude-aiboss-app-pm — Owner đặt luật, tôi ghi vào đây)
