# SOI DELTA VÒNG HAI — sau bốn điều kiện tối thiểu bạn nêu lúc 16:0x

Bạn đã ra **NO-GO** hai lần cho sổ kế toán vòng đời tiến trình này, và lượt trước bạn nêu
**bốn điều kiện tối thiểu** để thành «nên nạp». Lượt này chỉ soi phần đổi từ đó tới nay.

## Người viết khai đã làm gì (ĐỪNG tin — hãy đo)
```
① bộ hẹn nâng cấp tự quản: kiểm trạng thái thoát trước khi ép · dọn khi tiến trình đóng
② mọi đường bỏ hoặc thay bản ghi đều dọn bộ hẹn
③ câu báo cho người dùng KHÔNG còn nói «đã được dừng lại» ngay sau khi mới gửi tín hiệu mềm
④ ba câu văn hiển thị từng gõ cứng con số nay đọc từ MỘT nguồn dùng chung
   (src/lib/han-gio-fork.ts — người viết đã đo: đổi hằng số thì cả ba câu đổi theo,
    kể cả đổi đơn vị từ phút sang giây)
```

## Vật cần soi — băm đo NGAY TRƯỚC KHI GỬI
```
0a21c12402c9148251e4f3d4a2a82569  src/lib/kho-tien-trinh.ts
d94e5070f3b03161630dea0a6b8f2d97  src/components/UngDung.tsx
2cf5999a1af6db66c99604a837fba8a5  src/lib/han-gio-fork.ts
fe6ab80286e0abef7559b2fd62c4db48  src/app/api/fork/route.ts
25c6210212617d20f580038e2986c88f  src/app/api/chat/route.ts
4ad5feb507e884aaadf388c887f87574  src/app/api/dung/route.ts
ae1e2ce7e830963b30b576af6681ee2e  src/lib/chay-agent.ts
1ecd52701175c31b00fa569f2a45ada0  src/lib/chay-mot-luot.ts
```

## Năm câu — ĐẠT hoặc KHÔNG ĐẠT, kèm số dòng
```
Q1  Bốn điều kiện tối thiểu bạn nêu: cái nào ĐẠT, cái nào chưa?
Q2  Bộ hẹn có RÒ không? Dựng ca: tiến trình đóng bình thường · bản ghi bị thay giữa chừng ·
    hai lần bấm liên tiếp. Bộ hẹn cũ có còn sống và bắn muộn không?
Q3  Nguồn dùng chung mới (`han-gio-fork.ts`) có tạo ra vòng phụ thuộc, hoặc kéo mã máy chủ
    vào gói máy khách không?
Q4  Còn đường nào giao diện khai một điều nó CHƯA BIẾT không?
Q5  🔴 So với bản ĐANG CHẠY (`git show 1ea4b92:src/lib/kho-tien-trinh.ts`) — nay còn chỗ nào
    bản mới TỆ HƠN không? Lượt trước bạn tìm được một chỗ (ép cứng ở giây thứ 10 trong khi
    bản cũ không bao giờ ép). Chỗ đó đã đổi chưa, và có chỗ mới nào không?
    ⚠️ Ngưỡng ép đang chờ chủ sở hữu quyết bằng một trang web riêng — nếu câu trả lời của bạn
       phụ thuộc con số ấy thì nói rõ nó phụ thuộc, đừng chọn hộ.
```

## Khuôn trả lời
```
BĂM ĐÃ SO   : <tệp> <khớp / LỆCH>
Q1..Q5      : ĐẠT | KHÔNG ĐẠT + số dòng + chuỗi thao tác dựng lại được
NÊN NẠP     : có / không — nếu không thì ĐIỀU KIỆN TỐI THIỂU còn lại là gì
ĐỘ TIN      : chỗ nào bạn ĐO, chỗ nào bạn SUY
```
⚠️ Chỉ đọc và đo. Đừng sửa tệp, đừng chạy lệnh dựng.
