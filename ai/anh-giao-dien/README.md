# 📸 Ảnh giao diện — CHỨNG CỨ, không phải ảnh minh hoạ

**Luật một câu (Owner 05/09/2026): đội này hay thử giao diện — cần chụp màn hình thì dùng skill
`chup-trang-web`, và ảnh phải LƯU VÀO ĐÂY, trong kho dự án.**

## Vì sao ảnh phải nằm trong kho, không nằm ở Desktop

Bộ chụp mặc định lưu ra `~/Desktop/anh-trang/`. Đó là chỗ **tạm** — nó bị dọn, và nó KHÔNG đi
theo kho khi ai đó tra lịch sử. Việc của thư mục này là giữ **bản trước** để còn thứ mà so.

📌 **Một câu tả giao diện KHÔNG so được với một câu tả giao diện.** Hai tấm ảnh thì so được.
Mọi lần sửa giao diện đều sinh ra câu hỏi «trước nó thế nào», và câu đó chỉ trả lời được nếu
ảnh của bản CŨ đã được chụp TRƯỚC khi sửa.

## Cách chụp

```bash
zsh ~/Operations/scripts/chup-trang.sh <địa-chỉ> <tên-tệp>
```

| Nút vặn | Đặt TRƯỚC lệnh khi |
|---|---|
| `RONG=390` | xem khổ điện thoại (mặc định 1440 = khổ máy tính) |
| `NET=3` | cần nét hơn (mặc định 2). Ảnh nặng lên rõ rệt |
| `TOI=1` | chụp ở nền tối |
| `DOI=6000` | trang nạp chậm (mặc định chờ 2,5 giây) |

Ảnh ra `~/Desktop/anh-trang/` rồi **chép vào đây**, đặt tên theo khuôn:

```
YYYY-MM-DD_<việc>_<cũ|mới>_<khổ>.png
vd  2026-09-05_thanh-tieu-de_cu_1440.png
    2026-09-05_thanh-tieu-de_moi_390.png
```

## Ba điều bắt buộc, thiếu thì tấm ảnh KHÔNG dùng làm chứng cứ được

```
① CHỤP BẢN CŨ TRƯỚC KHI SỬA. Sửa xong mới nhớ ra thì bản cũ mất vĩnh viễn.
② Ghi rõ trong tên tệp đó là bản NÀO (cổng 4319 bản thật hay 4320 bản thử) và khổ nào.
   Hai tấm khác khổ đặt cạnh nhau trông như một thay đổi giao diện, mà thật ra không phải.
③ Kèm GIỜ CHỤP và BUILD_ID lúc chụp vào `ghi-chu.md` cùng thư mục.
   Ảnh KHÔNG tự khai nó chụp bản nào — mà kho thì đổi mỗi giờ.
```

⚠️ Ảnh có tên người thật trong danh bạ thì **soi lại trước khi commit**. Lộ thì DỪNG, đừng đẩy.
