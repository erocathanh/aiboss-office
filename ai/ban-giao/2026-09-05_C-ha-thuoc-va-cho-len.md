# 🅒 OWNER QUYẾT 05/09/2026 18:30 BST — HẠ THƯỚC XUỐNG MỨC BÁO-CÁO, RỒI CHO GIAO DIỆN LÊN

> 👤 Owner chọn 🅒 sau khi nghe verdict FAIL vòng 3/3 của việc ㉑.
> 🔴 Đây là Owner **cố ý gỡ cổng dựng ② của chính mình cho MỘT lần này** — có ghi sổ, KHÔNG phải
> luật mới. Lần sau vẫn cần verdict ĐẠT.
> ⚠️ Loại trừ `/Volumes/*`. Số trong tệp này đo lúc soạn, cây SỐNG — tự đo lại.

## 🧭 VÌ SAO 🅒 CHỨ KHÔNG PHẢI «CHO LÊN LUÔN»

Người soi bác vì cái **thước** `bai-thu/soi-ket-qua.mjs`, KHÔNG phải vì mã app. Nhưng thước đó
sai **cả hai chiều** — trong đó có ca **tệp vỡ cú pháp mà nó vẫn trả bảng XANH**.

📌 Một cổng mù thì tệ hơn không có cổng: cả nhà tin rằng chỗ đó đang được canh.
🔑 Nên 🅒 tách đôi: **giao diện được lên**, còn cái thước bị **gỡ mác «đã canh»** để KHÔNG ai
đọc nhầm màu xanh của nó thành bằng chứng. Sửa tử tế ở việc ㉒.

## 🎯 MỤC TIÊU — hai việc, ĐÚNG THỨ TỰ NÀY

### VIỆC 1 — hạ thước (chạm `bai-thu/` thôi, KHÔNG chạm `src/`)

Phần **phân loại bằng cây cú pháp** phải thôi làm cổng. Kết quả của nó thành **thông tin tham
khảo**, KHÔNG được làm bộ chạy đỏ hay xanh. Cách làm là của bạn.

🔴 **Ba thứ PHẢI GIỮ NGUYÊN làm cổng cứng** — người soi đã xác nhận chúng ĐẠT:
```
· BẢNG đầy đủ «từng hàm × từng cách xử lý»
· NĂM phép phá cũ
· phép «MỌI lối ra của datNguoi phải TRẢ VỀ giá trị và đi qua MỘT cửa báo hỏng»
```

🔴 **Và phải DÁN NHÃN TO, đây là nửa quan trọng nhất của 🅒:** ở đầu
`bai-thu/soi-ket-qua.mjs` và chỗ nhập nó trong `dong-bang-ket-qua-khong-roi.test.mts`,
ghi rõ bằng chữ — KHÔNG dùng ký hiệu — đại ý:

> thước này ĐANG HỎNG, đã bị bác ở verdict `20260905_173533_d01eab` ngày 05/09/2026.
> Nó báo đỏ oan mã đúng, và báo XANH cho tệp vỡ cú pháp. **KHÔNG được coi màu xanh của nó
> là bằng chứng.** Việc sửa nằm ở ㉒, đề bài ở `ai/ban-giao/2026-09-05_thuoc-ast-ba-trang-thai.md`.

### VIỆC 2 — cho giao diện lên bản thật

⑲ + ⑳ + ㉑ đã đo bằng trình duyệt thật ở cổng 4320. Nay dựng và commit vào bản chính.
```
· CÓ chạm src/  ⇒ cổng dựng ④ áp dụng ĐẦY ĐỦ: next build phải in 'Compiled successfully'
  và PHẢI lọc qua iconv -c trước khi grep. Không xanh thì DỪNG, đừng commit.
· lệnh đúng: export PATH="/opt/homebrew/bin:$PATH" && fnm exec --using=24.19.0 -- npx next build
· commit riêng hai việc: việc 1 (bai-thu/) một commit, việc 2 (src/) một commit
· thông điệp commit việc 2 phải ghi rõ: lên bản thật theo QUYẾT ĐỊNH 🅒 của Owner,
  KHÔNG có verdict ĐẠT, lỗ còn lại đã ghi ở MASTER-PLAN mục ㉒
```

## ✅ NGHIỆM THU — tự chạy, tự ghi số, KHÔNG nhận lời khai của ai
```
① bash bai-thu/chay.sh ⇒ ghi tổng phép TRƯỚC và SAU việc 1. Số đứng yên có thể là
   «thay chứ không thêm» — tự khai ra (SO-BAY-DO 88).
② gài lại từng phép trong NĂM phép phá ⇒ vẫn ĐỎ. Đây là chứng cứ «thước còn biết đỏ».
③ chứng minh phần phân loại KHÔNG còn làm cổng: cố tình cho nó ra kết quả sai
   ⇒ bộ chạy vẫn XANH và vẫn in cảnh báo. Thiếu vế này thì «đã hạ» là lời khai.
④ next build ⇒ dán nguyên dòng kết quả, kèm giờ
⑤ sau khi khởi động lại: mở app thật, xác nhận thanh tiêu đề một hàng và năm kiểu bố cục
   còn nguyên như đã đo ở 4320
```

## ⏱ KHỞI ĐỘNG LẠI MÁY CHỦ — Owner đang dùng app, làm cho đúng
```
KHÔNG gọi khởi động lại ngay trong lượt của mình — tự giết tiến trình đang phục vụ.
Dùng: bash ~/Operations/scripts/hen-khoi-dong-lai-app.sh <mã ghế của bạn>
SÀN 2 PHÚT (luật Owner 30/08), rồi chờ tới khi ghế mình im 20 giây.
```

## 📂 BỐI CẢNH — tự đọc
```
ai/MASTER-PLAN.md  mục ㉒                          ← lỗ còn lại, đã ghi sổ
ai/ban-giao/2026-09-05_thuoc-ast-ba-trang-thai.md  ← đề bài sửa thước (KHÔNG phải việc của lượt này)
~/Operations/SO-BAY-DO.md  mục 88 · 90 · 91
~/idea/inbox/aiboss-app-noibo/doi-aiboss-app-chat.md  ← verdict nguyên văn, tin 05/09 18:0x
```

## 🔴 XONG THÌ GHI KÊNH NGAY VIỆC ĐÓ, đừng gom báo một lượt cuối.
