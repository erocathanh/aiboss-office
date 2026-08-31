# ĐỀ BÀI — P1-8 · TAB CŨ PHẢI TỰ LỘ RA LÀ NÓ CŨ

> 📅 31/08/2026 · soạn `claude-aiboss-app-pm` theo đích do `claude-eroca-boss` (ô 1) nêu · làm: `claude-aiboss-app-exe`
> ⚠️ Mọi số dưới đây ĐO lúc 15:5x ngày 31/08. Quá một ngày thì ĐO LẠI.

## ① VÌ SAO CÓ VIỆC NÀY
Owner chốt 31/08: *«tuần này tập trung cải thiện app nên sẽ khởi động lại nhiều, có thể 30-40 lần, ⛔ giới hạn»*.
Ô 1 nêu đích, ⛔ nêu cách:
> **tab cũ phải TỰ LỘ RA là nó cũ, thay vì im lặng chờ người phát hiện.**

Ở 5 lần/ngày, «nhắc Owner tải lại trang» là dặn dò được. Ở 30-40 lần/tuần nó thành **chỗ chắc chắn hỏng**:
quên MỘT lần là Owner nhìn app im mà ⛔ có dấu hiệu nào chỉ ra vì sao.

## ② 🔴 TÔI PHẢI NÓI RÕ: **CƠ CHẾ HỎNG CỤ THỂ CHƯA AI ĐO ĐƯỢC**
Tôi đã định viết «tab cũ xin bó JS cũ ⇒ 404». **ĐO RA LÀ SAI:**
```
trang đang phục vụ trỏ  : static/chunks/app/page-fdeb465ab3c8b19d.js
tệp đó trên đĩa BẢN MỚI : CÒN NGUYÊN        ⇒ ⛔ có 404
ĐỐI CHỨNG DƯƠNG: tệp của bản mới (page-2a864396d6b66c5a.js) cũng CÓ ⇒ lệnh ls ⛔ mù
```
Next giữ lại bó cũ qua các lần dựng ⇒ **giả thuyết 404 của tôi BỊ BÁC.**
⇒ Câu *«tab cũ ⛔ nhận lời gọi nào»* hiện là **lời kể, ⛔ phải số đo**. Tôi ⛔ chuyển nó thành tiên đề.

📌 **NHƯNG việc này vẫn đáng làm, và ⛔ cần biết cơ chế hỏng:**
cách vá dưới đây ⛔ đoán tab hỏng KIỂU GÌ — nó chỉ nói **«mã của anh CŨ HƠN mã của tôi»**.
Đúng dù nguyên nhân là gì, và vẫn đúng khi nguyên nhân đổi ở lần dựng sau.
🔑 Vá theo TRIỆU CHỨNG thì mỗi lần bệnh đổi kiểu là vá lại. Vá theo **sự thật kiểm được** thì ⛔.

## ③ ĐÃ ĐO — phần AN TOÀN
```
máy chủ ĐỌC ĐƯỢC bản dựng của chính nó lúc chạy:
   node -e "fs.readFileSync('.next/BUILD_ID')" → iksVzaJERrPeAtsZE1Fyq   ✅
⇒ 🎉 ⛔ CẦN ĐỤNG `next.config.mjs` — đúng tệp đã hạ cả app ngày 18/08.
⇒ ⛔ cần biến môi trường, ⛔ cần nhét lúc dựng.

cửa trình duyệt gọi LIÊN TỤC: POST /api/danh-thuc/nhan   (UngDung.tsx:1690)
⇒ chỗ RẺ NHẤT để chở dấu vân bản: thêm ĐÚNG MỘT trường vào thân trả về.
⇒ ⛔ cửa mới · ⛔ đồng hồ mới · ⛔ vòng thăm dò mới.
```

## ④ CÁCH LÀM — ⛔ nhét lúc dựng, so LÚC CHẠY
```
MÁY CHỦ  /api/danh-thuc/nhan trả thêm:  ban_dung: <đọc .next/BUILD_ID>
         ⚠️ đọc MỘT LẦN lúc nạp mô-đun rồi giữ trong biến — ⛔ đọc đĩa mỗi lời gọi.

TRÌNH DUYỆT
  · lần trả lời ĐẦU TIÊN sau khi tải trang ⇒ NHỚ giá trị đó (banDungDauTien.current)
  · mỗi lần sau: khác giá trị đã nhớ ⇒ **BẢN ĐÃ ĐỔI** ⇒ hiện băng
  · GIỐNG ⇒ im. Máy chủ nạp lại mà CÙNG bản dựng ⇒ mã tab vẫn đúng ⇒ ⛔ làm phiền.
```
🔑 Vì sao ⛔ nhét lúc dựng: tab cũ **⛔ cần biết mã của chính nó**. Nó chỉ cần thấy con số
phía máy chủ **ĐỔI trong lúc tab còn mở**. Đó là thứ tab cũ tự quan sát được, ⛔ cần ai cấp.

## ⑤ 🔴 BẪY LỚN NHẤT — CHỖ TRẢ VỀ SỚM
```
UngDung.tsx:1686   if (dsHoi.length === 0 && dsBan.length === 0) return;
```
Tab ⛔ có ghế nào ⇒ **⛔ gọi cửa** ⇒ ⛔ bao giờ biết mình cũ.
⇒ Phép so bản dựng phải chạy được **⛔ phụ thuộc có ghế hay ⛔**.
Hoặc: nới điều kiện trả về sớm, hoặc: gửi một lời gọi rỗng theo nhịp thưa.
📌 Đây đúng họ lỗi ta cắn cả ngày: **một chốt chặn nằm SAU cửa thoát thì nó ⛔ chặn gì.**

## ⑥ BĂNG BÁO — nói gì, và ⛔ nói gì
```
✅ NÊN   «Bản mới đã lên máy chủ. Trang này đang chạy mã CŨ.»  + nút [Tải lại]
         · băng DÍNH, ⛔ tự tắt sau vài giây — đây là chỗ hỏng, ⛔ phải lời chào
         · ⛔ CHẶN Owner thao tác: anh ấy có thể đang đọc dở, phải để anh ấy chọn lúc
⛔ ĐỪNG  tự động tải lại trang. Owner đang gõ dở một câu là mất trắng.
⛔ ĐỪNG  đoán hộ «vì thế nên app im» — ta CHƯA đo được cơ chế hỏng (mục ②).
         Nói đúng thứ biết chắc: **mã cũ hơn máy chủ**.
```
⚠️ Ô gõ ≥16px — băng ⛔ được đẩy ô gõ hay nút Gửi ra khỏi màn điện thoại.

## ⑦ NGHIỆM THU — mỗi phép kèm đối chứng, ⛔ nhận báo cáo suông
```
① mở tab · dựng lại · nạp lại máy chủ ⇒ băng HIỆN trong ≤1 nhịp thăm dò
   ĐỐI CHỨNG ÂM: nạp lại máy chủ mà **⛔ dựng lại** (cùng BUILD_ID) ⇒ băng **⛔ ĐƯỢC HIỆN**
                 ⇒ đây là phép chứng minh nó so BẢN DỰNG chứ ⛔ phải so «máy chủ có khởi lại ⛔»
② tab MỚI mở sau khi nạp ⇒ ⛔ có băng (⛔ báo động giả)
③ tab ⛔ có ghế nào ⇒ VẪN hiện được băng   ← cổng cho bẫy ⑤
④ bấm [Tải lại] ⇒ trang lên bản mới, dấu vân trang khớp .next/BUILD_ID
⑤ đếm dòng 'error TS' — ⛔ dùng `tsc | head && echo sạch`, câu đó in «sạch» DÙ CÓ LỖI
⑥ bố cục 4 ô + điện thoại: băng ⛔ che ô gõ, ⛔ đẩy nút Gửi khỏi màn
```
🔑 Cổng ① mà thiếu đối chứng âm thì một băng **luôn hiện** cũng qua được — và ta lại có
thêm một phép kiểm chết.

## ⑧ SAU KHI XONG
Ghi một dòng lên kênh NGAY việc đó, và cập nhật `SO-TRI-THUC.md` trong **CÙNG lần commit** (luật ③).
Mục sổ nên ghi kèm: **giả thuyết 404 đã bị BÁC bằng số** — để người sau ⛔ đi lại đường đó.
