# ĐỀ BÀI — P0-2d · ĐƯỜNG LEASE: hai bên cùng chạy MỘT câu

> 📅 31/08/2026 ~21:0x · soạn `claude-aiboss-app-pm` · làm: `claude-aiboss-app-exe`
> 🔎 Nguồn: `hermes-aiboss-app-review` FAIL ① (verdict `ai/VERDICT-hermes-P0-2c.md`, 154 dòng)
> ⚠️ Mọi số đo lúc ~21:0x ngày 31/08. Quá một ngày thì ĐO LẠI.

## ① VÌ SAO GIAO VIỆC NÀY — nó là lỗi CÓ SẴN, KHÔNG phải do bộ chạy nền đẻ ra
Hermes soi bộ chạy nền (P0-2c) và lần ra một đường mà **bản vá của tôi KHÔNG gây ra và
KHÔNG chữa được** — nó nằm ở tầng HÀNG ĐỢI, tức đất của bạn.
```
① trình duyệt nhận mẩu ⇒ nhanYeuCau đặt 'dang_giu' + giu_boi + giu_han 30 giây
② trình duyệt TREO / NGỦ / khoá màn TRƯỚC khi kịp gọi gui()
③ lease hết hạn ⇒ mẩu tự về 'cho'                        kho-danh-thuc.ts:282-290
④ sau 45 giây im, BỘ NỀN nhận lại và CHẠY                may-chay-nen.ts
⑤ trình duyệt TỈNH LẠI, cầm bản mẩu CŨ, gọi gui() TRƯỚC khi xác nhận  UngDung.tsx:1823-1838
⑥ xacNhanDaGiao thấy 'da_giao' ⇒ TRẢ THÀNH CÔNG NGAY, KHÔNG kiểm giu_boi
⇒ HAI TIẾN TRÌNH CÙNG CHẠY MỘT CÂU. Owner trả tiền hai lần.
```
📌 Đây là ca đắt nhất trong cả đợt. Và nó **có từ trước bộ chạy nền** — bộ nền chỉ làm nó
DỄ XẢY RA hơn, vì nay có hai người cùng rút hàng đợi thay vì một.

## ② CHỖ HỎNG, ĐÚNG MỘT DÒNG — tôi đã mở mã ra nhìn
```ts
kho-danh-thuc.ts:395   if (tt === 'da_giao') { ghi(s); return { xong: true }; }
kho-danh-thuc.ts:397   if (y.giu_boi && maTrinhDuyet && y.giu_boi !== maTrinhDuyet) { … 'khac-trinh-duyet' }
```
Dòng 395 **trả thành công TRƯỚC khi tới dòng 397**. Ai gọi muộn cũng nhận «xong», kể cả
khi người giao thật sự là NGƯỜI KHÁC.
⚠️ **ĐỪNG bỏ hẳn dòng 395.** Nó có lý do: xác nhận phải LẶP LẠI ĐƯỢC — chính trình duyệt đó
gọi lại lần hai (mạng chập) thì vẫn phải «xong». Bỏ nó là đẻ ra một lỗi khác.
🎯 Phải TÁCH HAI CA:
```
'da_giao' + CÙNG giu_boi   ⇒ xong: true            (gọi lại — vô hại, giữ nguyên nết cũ)
'da_giao' + KHÁC giu_boi   ⇒ xong: false, ly_do    (NGƯỜI KHÁC đã giao — người gọi PHẢI biết)
```

## ③ NHƯNG VÁ MỘT MÌNH CHỖ ĐÓ **KHÔNG ĐỦ** — đây là phần quan trọng nhất
Hermes chỉ ra trình duyệt **gọi `gui()` TRƯỚC khi xác nhận** (`UngDung.tsx:1823-1838`, xác nhận
mãi ở `:1840-1854`). Nên dù cửa trả «thất bại» thì lượt ĐÃ chạy rồi — báo đúng mà vẫn thiệt.
```
⇒ phải đảo thứ tự: XÁC NHẬN TRƯỚC · chạy SAU · thất bại thì ĐỪNG chạy
```
📌 Chính mã giao diện đã thừa nhận lớp lỗi này ở `UngDung.tsx:1844-1848` — đọc nó trước khi sửa.
🔑 **Một cái cổng đặt SAU hành động thì nó không phải cổng, nó là một bản báo cáo.**

## ④ CHỖ TÔI KHÔNG BIẾT — nói thẳng, đừng để bạn tưởng tôi đã cân xong
```
· đảo thứ tự làm chậm lượt gõ tay đi một vòng gọi cửa. Owner có cảm nhận được KHÔNG?
  ⇒ ĐO trước khi chọn: cửa xác nhận mất bao lâu? Nếu <100ms thì cứ đảo.
· 30 giây lease có còn hợp KHÔNG khi nay có HAI người rút? Con số đó chọn khi chỉ có một.
· Hermes còn nêu: chốt lấy-sửa-ghi chỉ tuần tự TRONG MỘT tiến trình Node
  (kho-danh-thuc.ts:18-20 tự khai). Hai tiến trình máy chủ ⇒ KHÔNG có khoá liên tiến trình.
  ⇒ Đây là bài KHÁC và LỚN HƠN. ĐỪNG gộp vào đợt này. Ghi nợ, đừng vá kèm.
```

## ⑤ NGHIỆM THU — mỗi cổng kèm đối chứng, và cổng ② mới là cổng thật
```
① cùng người giữ gọi xác nhận HAI LẦN          ⇒ cả hai lần «xong»   (nết cũ còn nguyên)
② người giữ A đã giao · người B gọi xác nhận   ⇒ B nhận THẤT BẠI + ly_do
   ĐỐI CHỨNG ÂM: nếu B vẫn nhận «xong» thì bản vá VÔ NGHĨA — đó là ca sinh ra bản vá này
③ trình duyệt: xác nhận THẤT BẠI ⇒ KHÔNG gọi gui()
   ĐO BẰNG: đếm lời gọi /api/chat, KHÔNG đọc mã rồi gật
④ mẩu 'bo' vẫn kèm ly_do · cột «đã giao mà KHÔNG có mốc giao» = 0   (cổng cũ, đừng làm hỏng)
⑤ đếm dòng 'error TS' QUA iconv — thiếu iconv là thước câm
```

## ⑥ LUẬT NHÀ — nhắc lại vì đợt này chạm tệp lõi
```
· tôi làm ở worktree riêng `p0-2b`, bạn làm ở CÂY CHÍNH ⇒ hai bên KHÔNG giẫm nhau
· `next build` đọc CÂY LÀM VIỆC ⇒ dựng lúc còn tệp sửa dở là nuốt kèm đồ chưa duyệt
· soi trước, dựng sau. Xong thì ghi MỘT DÒNG lên kênh ngay việc đó.
```
🔖 `DUONG-LEASE-31AUG`
