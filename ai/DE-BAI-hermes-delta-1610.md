# ĐỀ BÀI SOI DELTA — sau phán quyết KHÔNG-ĐẠT lúc 15:32

Bạn là `hermes-aiboss-app-reviewer`. Lượt trước bạn ra **NO-GO** cho sổ kế toán vòng đời tiến
trình, với một P0 bạn ĐO được: mã gửi tín hiệu dừng rồi **xoá bản ghi ngay**, nên
«đã gửi tín hiệu» bị coi là «tiến trình đã thoát», và tham chiếu bị vứt trước khi biết kết quả.

**Lượt này chỉ soi PHẦN ĐÃ ĐỔI.** Đừng soi lại thứ bạn đã soi — trừ khi bạn thấy kết luận cũ sai.

## Đã đổi gì (theo lời người viết — bạn ĐỪNG tin, hãy đo)
```
① bản ghi KHÔNG còn bị xoá ngay khi gửi tín hiệu; có trạng thái trung gian và một bộ hẹn
   nâng lên tín hiệu cứng, bộ hẹn bám vào THAM CHIẾU chứ không bám số hiệu
② điều kiện leo thang dựa trên exitCode của tham chiếu, KHÔNG dựa vào giá trị hàm dừng trả về
③ một phép gán từng bị khối chú thích nuốt nay đã sống lại (cây cú pháp xác nhận là nút thật)
④ người viết CỐ Ý KHÔNG chép thứ tự của một sản phẩm khác (xoá bản ghi ngay), vì làm thế thì
   lần bấm thứ hai mất nút dừng — tức trượt chính phép nghiệm thu đặt ra cho bản vá này
```

## Vật cần soi — băm ĐO NGAY TRƯỚC KHI GỬI
```
31189f8270303e1a7276771717027c82  src/lib/kho-tien-trinh.ts
96ada0680997745cd847ccea741eb53d  src/components/UngDung.tsx
303040462dbb28c49d25129fa87efb65  src/app/api/chat/route.ts
ae1e2ce7e830963b30b576af6681ee2e  src/lib/chay-agent.ts
1ecd52701175c31b00fa569f2a45ada0  src/lib/chay-mot-luot.ts
59c3dac6e06ed4280b935c29e5774007  src/app/api/dung/route.ts
```

## Bốn câu — trả lời từng câu, ĐẠT hoặc KHÔNG ĐẠT, kèm số dòng
```
Q1  P0 bạn nêu đã hết chưa? Dựng một chuỗi thao tác trong đó tiến trình con BỎ QUA tín hiệu mềm.
    ⇒ bản ghi còn không · nút dừng còn không · lần bấm thứ hai có leo thang được không
Q2  Bộ hẹn nâng cấp có rò không? Nếu tiến trình thoát bình thường thì bộ hẹn đi đâu?
    Nếu bản ghi bị thay giữa chừng thì bộ hẹn cũ có bắn vào tham chiếu cũ không?
Q3  Còn đường nào mà giao diện khai «đã dừng» trong khi tiến trình vẫn chạy không?
Q4  🔴 Bản này so với bản ĐANG CHẠY trên máy người dùng (`git show 1ea4b92:src/lib/kho-tien-trinh.ts`)
    — có chỗ nào bản MỚI TỆ HƠN bản cũ không?
    ⚠️ Đây là câu tôi thiếu ở đề lần trước. Phán quyết «không đạt» của bạn đúng cho hiện vật, nhưng
       việc nạp là THAY một thứ cũng đang hỏng. Xin bạn so trực tiếp hai bản.
```

## Khuôn trả lời
```
BĂM ĐÃ SO   : <tệp> <khớp / LỆCH>
Q1..Q4      : ĐẠT | KHÔNG ĐẠT + số dòng + chuỗi thao tác dựng lại được
NÊN NẠP     : có / không — và nếu không thì nêu rõ ĐIỀU KIỆN TỐI THIỂU để thành có
ĐỘ TIN      : chỗ nào bạn ĐO, chỗ nào bạn SUY
```
⚠️ Chỉ đọc và đo. Đừng sửa tệp, đừng chạy lệnh dựng. Máy chủ đang phục vụ người dùng.
