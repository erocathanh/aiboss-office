# BÀN GIAO ㉒ — THƯỚC `soi-ket-qua.mjs` PHẢI CÓ **BA TRẠNG THÁI**

> 📅 Soạn 05/09/2026 18:05 BST bởi `claude-aiboss-app-pm`
> 🔴 **MỌI SỐ TRONG TỆP NÀY HẾT HẠN NHANH — cây SỐNG. Tự đo lại trước khi tin.**
> ⚠️ Loại trừ `/Volumes/*` khỏi mọi lệnh tìm. Ghim gốc quét vào `~/Projects/aiboss-app-chat`.

## 🎯 MỤC TIÊU (của Owner, qua PM) — KHÔNG phải bản thiết kế

Bộ đo canh việc «kết quả ghi sổ thất bại có tới màn hình không» đã bị người soi bác **ba vòng
liên tiếp**. Phần **BẢNG** và **NĂM PHÉP PHÁ** thì đạt, người soi xác nhận còn nguyên —
**đừng làm lại phần đó**. Chỉ phần **PHÂN LOẠI** hỏng.

**Việc của bạn: làm cho cái thước nói thật.** Cách làm là của bạn, không phải của tôi.

## 🧾 VERDICT NGUYÊN VĂN — đây là DỮ KIỆN, không phải chẩn đoán của PM

Phiên `20260905_173533_d01eab`, 05/09 17:42:
```
VERDICT: FAIL — Bảng và năm phép phá cũ được giữ, nhưng thước AST mới vẫn
đỏ oan, sập ở dấu phẩy và xanh sai với kết quả bị ghi đè hoặc nguồn lỗi cú pháp.

Thiếu chính xác:
 · Phân loại đúng gán thuộc tính có đọc            — soi-ket-qua.mjs:87-88
 · Không đệ quy nguyên nút ở dấu phẩy              — :80-82
 · Không trả bảng xanh khi parseDiagnostics có lỗi — :25-26, :93-106
 · Không coi kết quả bị ghi đè trước khi đọc là đã dùng — :54-70, :84-88
 · Đối chứng hồi quy cho những ca trên; bộ mẫu hiện tại ở
   dong-bang-ket-qua-khong-roi.test.mts:24-47 chưa canh được chúng
```

## 🔑 CHỖ ĐÁNG NGHĨ NHẤT — và là lý do việc này KHÔNG phải «vá bốn dòng»

Ba đời thước trước hỏng vì **hỏi sai câu** (soi tên hàm ⇒ soi ký tự đứng trước ⇒ soi tên biến).
Đời này **hỏi đúng câu** — đọc cây cú pháp, hỏi «giá trị này có ai ĐỌC không». Nhưng nó
**KHÔNG kiểm xem mình có nghe được câu trả lời không**: tệp vỡ cú pháp thì nó trả bảng XANH.

📌 Thước hai trạng thái (ĐẠT / KHÔNG ĐẠT) luôn phải nhét «không đo được» vào một trong hai —
và nó luôn rơi vào ĐẠT, vì ĐẠT là mặc định của im lặng.
⇒ **Ba trạng thái: ĐẠT · KHÔNG ĐẠT · KHÔNG ĐO ĐƯỢC.** Cái thứ ba phải làm cổng ĐỎ.
Chi tiết + ca thật: `~/Operations/SO-BAY-DO.md` mục 91 (và mục 90 cho ba đời trước).

## 🔒 RÀNG BUỘC CỨNG
```
· CHỈ chạm bai-thu/ — KHÔNG chạm src/. Thước không đi vào bản dựng.
· KHÔNG sửa BẢNG «từng hàm × từng cách xử lý» và KHÔNG gỡ năm phép phá — chúng đã ĐẠT.
· KHÔNG hạ ngưỡng, KHÔNG bỏ ca khó để lấy màu xanh. Bốn đời trước đời nào cũng xanh lúc nộp.
· làm trong worktree riêng, KHÔNG commit vào nhánh chính khi chưa có verdict
```

## ✅ NGHIỆM THU — bạn phải TỰ chạy được, không nhận lời khai của ai
```
① đưa thước một tệp VỠ CÚ PHÁP  ⇒ phải ra «KHÔNG ĐO ĐƯỢC» và cổng ĐỎ. Nói «sạch» là hỏng.
② đưa tệp RỖNG và tệp NHỊ PHÂN ⇒ như trên
③ bốn ca phân loại trong verdict ⇒ mỗi ca một vật thử trong bộ mẫu, gỡ vá ra là ĐỎ,
   lắp vào là XANH. Thiếu vế «gỡ ra ĐỎ» thì màu xanh vô nghĩa.
④ năm phép phá cũ ⇒ gài lại từng cái, vẫn ĐỎ đúng như trước
⑤ bảng đếm ⇒ Y HỆT trước khi sửa. Lệch một ô là MỐC ĐÃ DỊCH, mọi so sánh với vòng trước
   thành vô nghĩa — phải nói ra, đừng im.
⑥ bash bai-thu/chay.sh ⇒ ghi rõ tổng phép TRƯỚC và SAU. Số đứng yên có thể là
   «thay chứ không thêm» — tự khai ra, PM sẽ hỏi (SO-BAY-DO 88).
```

## 📂 TỆP BỐI CẢNH — tự đọc, đừng hỏi PM tóm tắt
```
bai-thu/soi-ket-qua.mjs                              ← tệp phải sửa
bai-thu/dong-bang-ket-qua-khong-roi.test.mts         ← nơi nhập thước, và nơi thiếu vật thử
bai-thu/chay.sh                                      ← bộ chạy
~/Operations/SO-BAY-DO.md  mục 88 · 90 · 91          ← ba bẫy đã cắn thật trên ĐÚNG việc này
~/Projects/aiboss-app-chat/ai/MASTER-PLAN.md  mục ㉒
```

## 🚧 TRẠNG THÁI: **CHƯA GIAO.** Owner đang chọn ba đường (cho lên luôn / sửa trước / hạ thước
xuống mức chỉ-báo-cáo). Đề này soạn sẵn vì cả ba đường đều dẫn tới đây.
