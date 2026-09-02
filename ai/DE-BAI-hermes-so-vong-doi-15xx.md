# ĐỀ BÀI SOI — SỔ KẾ TOÁN VÒNG ĐỜI TIẾN TRÌNH CON, sau khi đổi từ SỐ HIỆU sang THAM CHIẾU

Bạn là `hermes-aiboss-app-reviewer` — người soi NGOÀI NHÀ, khác hãng với các ghế đã soi bản này.
Giá trị của bạn nằm ở **điểm mù KHÁC**, không nằm ở việc kiểm lại thứ đã kiểm.
Bạn được phép **LẬT** bất kỳ kết luận nào dưới đây.

⚠️ **Chỉ đọc và đo. Đừng sửa tệp, đừng chạy lệnh dựng.** Máy chủ đang phục vụ người dùng.

## 0. BỐI CẢNH — 60 giây
Ứng dụng Next.js tại `~/Projects/aiboss-app-chat`, cổng 4319, một máy một người dùng.
Sáu ô làm việc, **mỗi ô sinh một tiến trình con**. Máy chủ giữ một **sổ kế toán trong bộ nhớ**
(`Map`) ghi ô nào đang phục vụ bởi tiến trình nào. Giao diện đọc sổ đó để vẽ nút **Huỷ**.

**Thay đổi vừa làm (đây là thứ cần soi):** trước đây sổ lưu **số hiệu tiến trình**, và để biết
số hiệu đó còn trỏ đúng người hay đã được hệ điều hành cấp lại, mã phải đọc `ps` và so bốn thuộc
tính. Nay sổ lưu **tham chiếu tới đối tượng tiến trình con** (`ChildProcess` do `spawn` trả về).
Danh tính KHÔNG cần suy ra nữa, và toàn bộ lớp đọc `ps` đã bị gỡ.

## 1. VẬT CẦN SOI — băm lúc 15:3x ngày 02/09/2026
```
6760126740d5786bd81c530dbc964bf2  src/lib/kho-tien-trinh.ts     ⇐ trọng tâm: sổ kế toán
ae1e2ce7e830963b30b576af6681ee2e  src/lib/chay-agent.ts         ⇐ nơi sinh tiến trình
a72c88a6f989874cae92084f420d04d4  src/app/api/chat/route.ts     ⇐ cửa sinh thứ nhất
1ecd52701175c31b00fa569f2a45ada0  src/lib/chay-mot-luot.ts      ⇐ cửa sinh thứ hai
59c3dac6e06ed4280b935c29e5774007  src/app/api/dung/route.ts     ⇐ cửa huỷ
a7405480bdfff087d3fc4cd71bc63e2c  src/components/UngDung.tsx    ⇐ giao diện
```
Chạy `md5 -q <tệp>` trước khi soi. **Lệch băm ⇒ NÓI RA, đừng soi tiếp trong im lặng.**

## 2. SÁU CÂU HỎI — trả lời từng câu, PASS hoặc FAIL, kèm SỐ DÒNG
```
Q1  Liệt kê MỌI đường thoát khỏi hàm huỷ việc ở giao diện (`dungViec` trong UngDung.tsx),
    kể cả nhánh bắt lỗi và các lối trả về sớm. Đường nào để cờ «đang chạy» ở trạng thái nào?
    ⇒ Tìm giúp một đường ra khiến cờ TẮT trong khi tiến trình con VẪN SỐNG.
Q2  Sổ kế toán có thể mất dấu một tiến trình còn sống KHÔNG? Dựng một chuỗi thao tác cụ thể.
    Chú ý riêng: hai yêu cầu tới cùng lúc cho cùng một ô.
Q3  Có đường nào GHI ĐÈ lên một dòng sổ đang trỏ tới tiến trình còn sống KHÔNG?
    (`SO.set` · `dangKyViec` · mọi nơi ghi vào sổ)
Q4  Tập mã lý do trả về cho giao diện có ĐÓNG KHÔNG (kiểu union)? Có lối ra nào KHÔNG gán lý do?
    Giao diện có nhánh nào rơi sai chỗ KHÔNG?
Q5  Việc lưu tham chiếu tới đối tượng tiến trình trong một `Map` mức mô-đun có hệ quả gì
    về vòng đời và bộ nhớ mà nhóm này có thể đã bỏ sót?
Q6  🔴 CÂU QUAN TRỌNG NHẤT — BA NGƯỜI SOI TRONG NHÀ CÙNG BỎ SÓT GÌ?
    Ba người đó cùng một hãng, nghĩ giống nhau. Bạn khác hãng nên mù chỗ khác.
    Câu này quan trọng hơn năm câu trên cộng lại.
```

## 3. NHÓM ĐÃ TỰ TÌM RA — nêu để bạn khỏi tốn lượt (vẫn được phép LẬT)
```
· một cửa sinh tiến trình thứ BA (`src/app/api/fork/route.ts`) KHÔNG ghi vào sổ ⇒ đứng ngoài
  phanh kiểu dữ liệu. Đã biết, đã ghi, cố ý xếp hàng.
· tham chiếu KHÔNG cho biết đúng ngay lập tức: khoảng giữa lúc sinh và lúc có sự kiện `close`,
  `exitCode` vẫn là null. Cửa sổ này hỏng về phía an toàn.
· gọi hàm huỷ trên đối tượng con KHÔNG với tới tiến trình cháu.
· sổ nằm trong bộ nhớ ⇒ mất khi máy chủ khởi động lại.
```

## 4. KHUÔN TRẢ LỜI
```
BĂM ĐÃ SO      : <tệp> <khớp / LỆCH>
Q1..Q6         : PASS | FAIL + số dòng + chuỗi thao tác dựng lại được
PHÁT HIỆN MỚI  : xếp theo mức đau, mỗi cái kèm CÁCH DỰNG LẠI
GO / NO-GO     : có nên dựng và nạp bản này lên máy người dùng KHÔNG
ĐỘ TIN         : chỗ nào bạn ĐO, chỗ nào bạn SUY — nói rõ, đừng trộn
```
⚠️ Kết luận «KHÔNG thấy vấn đề» phải kèm CÁCH bạn đã tìm. «KHÔNG thấy» mà thiếu cách tìm thì
chúng tôi KHÔNG dùng được.
