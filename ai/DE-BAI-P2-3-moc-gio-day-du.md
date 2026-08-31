# ĐỀ BÀI — P2-3 · MỐC GIỜ ĐẦY ĐỦ trong khung chat

> 📅 31/08/2026 · soạn `claude-aiboss-app-pm` theo lệnh Owner · làm: `claude-aiboss-app-exe`
> ⚠️ Mọi số dưới đây ĐO lúc 14:4x ngày 31/08. Quá một ngày thì ĐO LẠI trước khi tin.

## ① OWNER MUỐN GÌ — nguyên văn
> *«phần lịch sử chat có thêm hh:ss dd/mm/yyyy tôi chưa thấy làm cho vào master plan để làm em nhé»*

Chú ý hai chữ **«phần lịch sử chat»** — Owner nói về chỗ ĐỌC LẠI, ⛔ phải khung chat đang sống.

## ② ĐÃ ĐO — tin vui: **nửa việc này LÀM RỒI**
```
UngDung.tsx:83   luc?: number    ← MỐC THẬT (epoch ms), thêm 19/08 ở việc ②A
UngDung.tsx:81   chú thích ghi rõ: «bước này CHỈ thêm dữ liệu — giao diện ⛔ đổi một ly»
```
⇒ Dữ liệu đã nằm sẵn 12 ngày, chỉ chưa ai VẼ nó ra. Việc này là **nửa sau** của một việc cũ,
⛔ phải việc mới. `luc` được gán ở ba chỗ: `:1337` (tin mình gõ) · `:1348` (tin ghế trả) · `:1429` (tin lỗi).

## ③ 🔴 CHỖ GÃY ①: `gio` là CHUỖI HIỂN THỊ, ⛔ phải mốc thời gian
```
UngDung.tsx:78 (chú thích có sẵn)  «gio là chuỗi HIỂN THỊ "22:11" ⇒ ⛔ suy ra được NGÀY.
                                    Ca 23:59 → 00:01 hỏng chắc.»
UngDung.tsx:357 gioBayGio()        toLocaleTimeString(hour, minute)  ⇒ ⛔ có ngày
UngDung.tsx:2437                   <span className="gio">{t.gio}</span>   ← chỗ VẼ, dùng `gio`
```
⇒ **Vẽ ngày thì phải đọc `luc`, ⛔ được cộng ngày vào chuỗi `gio`.** Cộng vào là bịa.

## ④ 🔴 CHỖ GÃY ②: có **HAI** chỗ vẽ giờ, sửa một là hai bên nói khác nhau
```
UngDung.tsx:2437          khung chat ĐANG SỐNG   — đọc t.gio
doc-phien.ts:385-391      đường LỊCH SỬ          — hàm gioNgan(ts?: string) tự dựng chuỗi riêng
                          :386  if (!ts) return ''      ← đã chịu được thiếu, giữ nếp này
                          :390  toLocaleTimeString(hour, minute)
```
📌 Đây đúng luật đã có trong hồ sơ ghế: **«thêm đường ĐI thì phải thêm đường VỀ trong CÙNG một lượt»**.

## ⑤ 🔴 CHỖ GÃY ③ — **14% mẩu tin ⛔ CÓ MỐC**, và con số cũ đã LỖI THỜI
```
chú thích :79 ghi 11,5%  (đo 19/08)
ĐO LẠI 31/08 14:4x trên hai tệp phiên THẬT:
   claude-aiboss-app-pm  7.546 dòng · thiếu 1.065 ⇒ 14,1%
   claude-eroca-boss     4.639 dòng · thiếu   630 ⇒ 13,6%
   ĐỐI CHỨNG DƯƠNG: khoá 'type' có ở 7.548/7.548 dòng ⇒ thước ⛔ mù
```
⇒ **Con số trong chú thích đã cũ. Sửa luôn `:79` thành 14% kèm ngày đo.**
⇒ Và bong bóng CŨ đang nằm trong bộ nhớ trình duyệt cũng ⛔ có `luc` (chú thích `:80` nói rõ).

## ⑥ BA QUYẾT ĐỊNH TÔI CHỐT — ⛔ hỏi Owner, vì cả ba đều lật lại được trong một dòng
```
ⓐ DẠNG = «HH:mm dd/mm/yyyy»   ⛔ phải «hh:ss»
   Owner gõ «hh:ss». App đang hiện giờ:PHÚT, và giờ+GIÂY mà ⛔ có phút thì ⛔ đọc được.
   ⇒ đọc là lỡ tay. Lật lại: đổi đúng một đối tượng tuỳ chọn.
ⓑ THIẾU `luc` ⇒ HIỆN MỖI GIỜ, ⛔ BAO GIỜ bịa ngày
   ⛔ suy ngày từ tệp, ⛔ lấy hôm nay, ⛔ lấy mốc sửa tệp. 14% là nhiều — bịa một lần
   là Owner đọc sai lịch sử mà ⛔ có cách biết.
ⓒ PHẠM VI = ĐƯỜNG LỊCH SỬ hiện mốc ĐẦY ĐỦ. Khung chat sống GIỮ «HH:mm»,
   chỉ thêm mốc đầy đủ vào thuộc tính `title` (rê chuột thấy).
   Vì sao ⛔ hiện đầy đủ ở khung sống: hàng trăm bong bóng CÙNG một ngày ⇒ lặp vô ích,
   mà chữ chỉ có 10px (mau09.css:312) — 9,5px ở bố cục 4 ô (:383).
```
🔶 **⛔ THUỘC PHẠM VI (ghi ra để ⛔ ai tiện tay làm):** vạch ngăn NGÀY khi sang ngày mới trong
khung sống. Đó mới là thứ chữa hẳn ca «23:59 → 00:01» ở `:78`. Việc riêng, đề riêng.

## ⑦ BẪY BẮT BUỘC ĐỌC TRƯỚC KHI SỬA
```
· CSS ở HAI tệp: globals.css @import mau09.css ở dòng 2 ⇒ globals ĐÈ mau09.
  Trước khi nói «⛔ có luật cho .gio», grep CẢ HAI.
· ⛔ grep tên biến/hàm trong bản dựng để nghiệm thu — bản thật RÚT GỌN TÊN.
  Neo vào tên lớp `.gio` hoặc chuỗi hiển thị.
· ô gõ ≥16px — ⛔ đụng tới, dưới 16px là điện thoại tự phóng to.
· `luc?: number` là TUỲ CHỌN. Mọi chỗ đọc phải chịu được `undefined` — ⛔ dùng `!`.
```

## ⑧ NGHIỆM THU — mỗi phép kèm đối chứng, ⛔ nhận báo cáo suông
```
① mở một phiên CŨ trong đường lịch sử ⇒ thấy «HH:mm dd/mm/yyyy» trên mẩu CÓ mốc
   ĐỐI CHỨNG ÂM: tìm một mẩu THIẾU mốc (14% — chắc chắn có) ⇒ phải thấy MỖI GIỜ,
                 ⛔ thấy ngày nào cả. Thấy ngày ⇒ đang BỊA ⇒ HỎNG.
② khung chat sống ⇒ vẫn «HH:mm», rê chuột ra mốc đầy đủ
③ đếm dòng 'error TS' — ⛔ dùng `tsc | head && echo sạch`, câu đó in «sạch» DÙ CÓ LỖI
④ chú thích :79 đã đổi 11,5% → 14% kèm ngày đo 31/08
⑤ bố cục 4 ô ⇒ mốc ⛔ tràn dòng, ⛔ đẩy vỡ bong bóng
```

## ⑨ SAU KHI XONG
Ghi một dòng lên kênh NGAY việc đó (⛔ gom báo một lượt cuối), và cập nhật `SO-TRI-THUC.md`
trong **CÙNG một lần commit** — luật ③ của sổ: đổi mã thì đổi sổ cùng lúc.
