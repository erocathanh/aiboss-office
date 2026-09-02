# ĐỀ BÀI ĐỐI KHÁNG — soi bản vá P0 «sổ tiến trình + nút Dừng» TRƯỚC KHI DỰNG

Bạn là `hermes-aiboss-app-reviewer`. Bạn là người soi NGOÀI NHÀ, khác hãng với ba ghế Claude đã
soi bản này. **Giá trị của bạn nằm ở ĐIỂM MÙ KHÁC, không nằm ở việc kiểm lại thứ đã kiểm.**

⚠️ **Bạn được phép LẬT bất kỳ kết luận nào dưới đây.** Phần «đã soi» chỉ để bạn khỏi tốn lượt, KHÔNG
phải để khoanh vùng cấm. Nếu bạn thấy một kết luận của chúng tôi sai, đó là phát hiện có giá nhất.

---

## 0. BỐI CẢNH — 60 giây

App `aiboss-app-chat`: máy chủ Next.js tại `~/Projects/aiboss-app-chat`, cổng 4319, một máy một
người dùng (Owner). Sáu ô chat, **mỗi ô sinh một tiến trình `claude` con**. Máy chủ giữ một cuốn
sổ trong bộ nhớ (`Map`) ghi ô nào đang chạy pid nào. Giao diện đọc sổ đó để vẽ **nút Dừng**.

**Bệnh đang chữa (gọi là «câu ⑥»):**
```
api/chat/route.ts  cancel() CỐ Ý KHÔNG giết tiến trình con khi trình duyệt rời đường xem SSE
                   nhưng `finally` gọi xoaViec() VÔ ĐIỀU KIỆN
⇒ trình duyệt rời (Owner khoá màn / đổi tab) ⇒ SỔ BỊ XOÁ trong khi TIẾN TRÌNH VẪN CHẠY
⇒ /api/dung báo ô RẢNH ⇒ NÚT DỪNG BIẾN MẤT ⇒ ghế chạy tiếp, tiêu tiền, Owner không dừng được
```
Và chiều ngược lại: sổ giữ dòng của tiến trình đã chết ⇒ nút Dừng bắn `SIGTERM` vào **pid đã được
hệ điều hành cấp lại cho một tiến trình khác của Owner**. Đây là ca DUY NHẤT trong bài thoát ra
khỏi app và chạm vào máy thật.

**Máy chủ ĐANG CHẠY là bản CŨ** (pid 8909, khởi 08:43:44) — chưa mang bản vá. Đã đo:
`POST /api/dung` hiện KHÔNG có khoá `vi_sao`. Nên mọi phép đo trên máy chủ sống là đo BẢN CŨ.

---

## 1. VẬT CẦN SOI — băm lúc 13:2x ngày 02/09/2026

```
2a93dd45855f2629e1cb4877d896677f  src/lib/kho-tien-trinh.ts        ⇐ trọng tâm
4882858891777e0ad755466dbd5e6153  src/components/UngDung.tsx       ⇐ trọng tâm (hàm dungViec)
d36793f62b03220b24090bc6d4ef88b4  src/app/api/dung/route.ts
181e7233f8520dce0d519fce51df91ec  src/app/api/chat/route.ts
724d28806097c22707be7c375a51cd21  src/lib/chay-agent.ts
e7ae64414f26bd6f6a495bc8ec5320ba  src/lib/chay-mot-luot.ts
1e458ccff7e8ba04239a1aa8172da931  ~/Operations/scripts/do-ca-3-nut-dung.sh
0a25b4c1191f32a7dd93135e07c19e27  ~/Operations/scripts/do-so-vs-that.sh
```
**Chạy `md5 -q <tệp>` trước khi soi.** Lệch băm ⇒ mã đã đổi sau khi đề bài này viết ⇒ NÓI RA,
đừng soi tiếp trong im lặng.

---

## 2. BẢN VÁ LÀM GÌ — sáu điều, mỗi điều một CÂU KHẲNG ĐỊNH để bạn công

**K1.** Sổ chỉ bị xoá khi **tiến trình con thật sự chết** (sự kiện `close` của tiến trình con),
KHÔNG còn xoá khi đường xem SSE đứt. `finally` trong `chat/route.ts` KHÔNG còn gọi `xoaViec`.

**K2.** `quetRac()` nằm TRONG `layViec` · `dsViec` · `gietViec` — phanh đặt TẠI CHỖ BẮN, không phụ
thuộc người gọi có quét trước hay không.

**K3.** Trước khi bắn `SIGTERM`, `gietViec` so **bốn dấu vân** giữa pid trong sổ và tiến trình thật:
`ppid` · không ô khác giữ pid đó · `comm` (tên lệnh) · `etime` (tuổi, lệch cho phép 5 giây).
Thiếu bằng chứng ⇒ **KHÔNG BẮN** (chọn mất một lần dừng, thay vì bắn nhầm tiến trình lạ).

**K4.** Kết quả trả về mang `vi_sao` ∈ 4 giá trị (`khong_co_viec` · `dong_rac` ·
`khong_doc_duoc_dau_van` · `da_giet`), khai bằng KIỂU (không có `?`) nên `tsc` chặn mọi lối ra
thiếu nó. Máy khách `import type` đúng kiểu đó và có chốt vét `const chuaXu: never`.

**K5.** Máy khách hạ cờ `dangChay` LẠC QUAN ngay đầu hàm `dungViec`, và **chỉ giữ cờ hạ khi có
bằng chứng dương là tiến trình đã chết**. Mọi đường khác — lý do lạ, phản hồi không đọc được,
`j` null, mất mạng — phải **trả cờ về BẬT** để nút Dừng còn đó.

**K6.** Hai bộ đo (`do-so-vs-that.sh` so sổ với sự thật; `do-ca-3-nut-dung.sh` đo ca «không xác
minh được») là CỔNG NGHIỆM THU sau khi nạp.

---

## 3. SÁU CÂU HỎI — trả lời từng câu, PASS hoặc FAIL, kèm SỐ DÒNG

```
Q1  K5 có thật KHÔNG? Liệt kê MỌI đường thoát khỏi hàm dungViec (kể cả throw, kể cả return sớm,
    kể cả nhánh catch) và cho biết đường nào để cờ dangChay ở trạng thái nào.
    ⇒ Tìm dùm chúng tôi một đường ra để cờ TẮT mà tiến trình còn sống.
Q2  K3: bốn dấu vân có đủ chặn ca pid-được-cấp-lại KHÔNG? Dựng một ca cụ thể LỌT được cả bốn.
    Chú ý riêng: khe 5 giây quanh lúc sinh — chỗ Owner hay bấm Dừng nhất.
Q3  K1: còn đường nào xoá sổ khi tiến trình VẪN SỐNG KHÔNG? (grep mọi nơi gọi xoaViec/SO.delete)
Q4  K4: `vi_sao` có lối ra nào KHÔNG gán KHÔNG? Và máy khách có lý do nào rơi vào nhánh sai KHÔNG?
Q5  K6: hai bộ đo có thể in XANH trên một hệ ĐANG HỎNG KHÔNG? Nêu đầu vào cụ thể.
Q6  🔴 CÂU QUAN TRỌNG NHẤT — BA GHẾ TRONG NHÀ CÙNG BỎ SÓT GÌ?
    Ba ghế Claude đã soi bản này nhiều vòng. Chúng đều nghĩ giống nhau về một số chuyện.
    Bạn khác hãng ⇒ bạn có điểm mù KHÁC. Câu này quan trọng hơn năm câu trên cộng lại.
```

---

## 4. ĐÃ SOI RỒI — để bạn khỏi tốn lượt (nhưng được phép LẬT)

```
· `etime` phân tích 4 dạng thật đúng · 6 mẫu rác ra null · đã thử phá bộ phân tích ⇒ nó biết đỏ
· timeout của lời gọi `ps` = 1000 ms; đo thật 1,9 ms
· chốt vét `never`: thêm lý do thứ 5 ở máy chủ ⇒ tsc CHẶN máy khách
· `vi_sao` bỏ ở từng lối ra ⇒ tsc chặn 4/4
· ba ghế đã bắt: nhánh default không bật lại cờ · `dong_rac` bị lần quét rác thứ nhất nuốt ·
  bộ đo có nhánh ĐẠT là mã chết · verdict dán lên bản đã đổi
```

## 5. KHUÔN TRẢ LỜI — xin theo đúng khuôn này
```
BĂM ĐÃ SO      : <tệp> <khớp / LỆCH>
Q1..Q6         : PASS | FAIL + số dòng + ca dựng lại được
PHÁT HIỆN MỚI  : xếp theo mức đau, mỗi cái kèm CÁCH DỰNG LẠI
GO / NO-GO     : có nên DỰNG và NẠP bản này lên máy Owner KHÔNG
ĐỘ TIN         : chỗ nào bạn ĐO, chỗ nào bạn SUY — nói rõ, đừng trộn
```
⚠️ Nếu bạn kết luận «KHÔNG thấy vấn đề» ở câu nào, nói rõ bạn đã tìm bằng cách nào — «không thấy»
mà không kèm cách tìm thì chúng tôi KHÔNG dùng được.
⚠️ **Đừng sửa mã. Đừng dựng. Đừng chạy `next build`.** Chỉ đọc và đo. Máy chủ đang phục vụ Owner.
