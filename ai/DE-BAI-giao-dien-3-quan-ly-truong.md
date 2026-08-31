# ĐỀ BÀI — Giao diện số 3 «QUẢN LÝ TRƯỜNG»

> 📅 30/08/2026 · soạn `claude-aiboss-app-pm` theo lệnh Owner · làm: `claude-aiboss-app-exe`
> ⚠️ Mọi số dưới đây ĐO lúc 10:2x–10:3x ngày 30/08. Quá một ngày thì ĐO LẠI.

## ① OWNER MUỐN GÌ
Một mục mới trong menu «Giao diện» (đang có «Ghế hiện tại» · «Marketing» · «Vận hành»), tên **Quản Lý Trường**, nạp 5 ghế:
| Ô | Vai | Mã phiên Owner đưa | cwd Owner đưa |
|---|---|---|---|
| 2 | Hiệu Trưởng | `e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b` | `/Users/erocathanh` |
| 3 | Phòng Đào Tạo | `5956cd23-1533-4565-a7fc-0050769887dc` | `/Users/erocathanh` |
| 4 | Phòng Công Nghệ | `7911258a-2109-4d48-8a53-5286836daef6` | `/Users/erocathanh` |
| 5 | Phòng Tài Chính | `823ce356-1bb7-4174-991f-8ccee76582fd` | `/Users/erocathanh` |
| 6 | Phòng Hành Chính | `1f08afd0-73d8-45e9-86b5-0a06417bf7e1` | `/Users/erocathanh` |
(Ô 1 giữ `claude-eroca-boss` — `datNguoi` vốn chặn đổi ô 1, giống hai bộ đang có.)

## ② ĐÃ ĐO — phần AN TOÀN
```
5 mã phiên CÓ THẬT cả 5 · đều ở kho -Users-erocathanh
  Hiệu Trưởng 103.897 dòng · Đào Tạo 55.352 · Công Nghệ 66.986 · Tài Chính 27.034 · Hành Chính 26.820
  ĐỐI CHỨNG ÂM: mã bịa → 0 kết quả ⇒ thước phân biệt được
cả 5 ĐỀU IM 22–53 phút ⇒ ⛔ phiên nào đang chạy ⇒ nối vào ghế ⛔ sợ hai tiến trình cùng ghi
5 tên ghế dự định đều TRỐNG trong nhan-su.json (220 ghế)
  ĐỐI CHỨNG DƯƠNG: 'claude-eroca-boss' tra ra True ⇒ thước ⛔ câm
  ⚠️ lần đầu tôi quét NHẦM danh sách (7 phòng ban thay vì 220 ghế) — chính đối chứng dương bắt được
```

## ③ 🔴 CHỖ GÃY — việc này ⛔ PHẢI «thêm 5 ghế + 1 bộ là xong»
```
doc-phien.ts:28  thuMucAgent(ma) = path.join(CAU_HINH.thuMucLamViec, ma)
cau-hinh.ts:45   thuMucLamViec  = process.env.THU_MUC_AGENT ?? os.homedir()
chay-lan.sh      ⛔ đặt THU_MUC_AGENT  ⇒ thực tế dùng os.homedir() = /Users/erocathanh
BẰNG CHỨNG TRỰC TIẾP: ghế đang chạy nằm ở /Users/erocathanh/claude-aiboss-app-pm · …-exe
```
⇒ Ghế mới `claude-hieu-truong` sẽ đứng ở **`/Users/erocathanh/claude-hieu-truong`**
⇒ kho phiên của nó là **`-Users-erocathanh-claude-hieu-truong`**
🔴 **Nhưng 5 phiên Owner đưa nằm ở `-Users-erocathanh`** (thư mục NHÀ, ⛔ phải thư mục con).
**⇒ Thêm ghế + bộ ghế theo nếp cũ sẽ mở 5 phiên TRỐNG MỚI, ⛔ phải 5 cuộc nói chuyện Owner muốn.**
Và `nhan-su.json` hiện **⛔ có khoá nào ghim mã phiên** (khoá: ten·phong·vai·viet_tat·nhan·ghim·soul).

## ④ BA ĐƯỜNG — exe chọn, tôi ⛔ chốt hộ vì đây là mã
```
A  thêm khoá TUỲ CHỌN `thu_muc` vào hồ sơ ghế → đặt "/Users/erocathanh" cho 5 ghế này
   ✅ cwd khớp ⇒ --resume tìm đúng kho
   ⚠️ 5 ghế DÙNG CHUNG một cwd ⇒ mọi phiên mới của chúng đổ chung một kho ⇒ logic
      «phiên nào của ghế nào» ⛔ còn suy được từ cwd
B  thêm khoá TUỲ CHỌN `ma_phien` vào hồ sơ ghế → app nối THẲNG vào phiên đó
   ✅ đúng ý Owner nhất: «đúng CUỘC NÓI CHUYỆN này vào ghế này»
   ⚠️ phải xử ca phiên đã bị xoá / đang chạy nơi khác
C  A + B cùng lúc  ← tôi NGHIÊNG về đây: cwd đúng để resume tìm ra, id đúng để ⛔ lẫn 5 phiên
```

## ⑤ BẪY BẮT BUỘC ĐỌC TRƯỚC KHI SỬA
```
🪤 src/lib/nhan-su.ts:1  import duLieu from '../../du-lieu/nhan-su.json'  ← NHẬP TĨNH lúc DỰNG
   ⇒ sửa JSON mà ⛔ `next build` thì ghế mới KHÔNG xuất hiện, và bạn tưởng mình sửa hỏng.
🪤 có BA bản nhan-su.json trên đĩa. Bản THẬT là `du-lieu/nhan-su.json` (đo bằng dòng import trên).
   ⛔ sửa nhầm `chon-mau/du-lieu/nhan-su.json`.
🪤 phiên đang CHẠY thì ⛔ nối vào ghế — hai tiến trình cùng ghi một bản ghi.
   Đo lại NGAY TRƯỚC khi nạp: cả 5 phải im. (Nay im 22–53 phút, nhưng số này HẾT HẠN nhanh — bẫy ⑩.)
```

## ⑥ NGHIỆM THU — mỗi phép kèm đối chứng
```
T1 menu «Giao diện» có mục thứ 4 «Quản Lý Trường»
   ĐC âm: mục bịa ⛔ xuất hiện
T2 bấm vào ⇒ ô 2..6 mang ĐÚNG 5 vai, ô 1 vẫn claude-eroca-boss
T3 🔴 QUAN TRỌNG NHẤT — mở ô 2, phải thấy LỊCH SỬ CŨ của phiên e888d879 (103.897 dòng),
   ⛔ phải ô trống. Neo vào một chuỗi CÓ THẬT trong phiên đó.
   ĐC âm: ô của một ghế MỚI TOANH phải TRỐNG ⇒ chứng minh T3 đo đúng thứ
T4 gõ một câu vào ô 3 ⇒ bản ghi ghi vào ĐÚNG tệp 5956cd23…jsonl (đo mtime + số dòng trước/sau)
   ĐC âm: 4 tệp phiên kia ⛔ đổi
T5 sổ ô .trang-thai/o-phien.json ghi đúng ma_nhan_su ↔ ma_phien cho cả 5
```

---

## ⑦ 🔴 ĐO THÊM 30/08 10:3x — NĂM PHIÊN ĐÓ MANG **DANH TÍNH KHÁC**

Tôi bóc câu NGƯỜI gõ đầu tiên của mỗi phiên (để làm NEO cho T3). Kết quả lộ ra một thứ lớn hơn:

| Owner gọi | Mã | Phiên đó THẬT RA là ai |
|---|---|---|
| Hiệu Trưởng | `e888d879` | **`claude-bos-funnel-pm-r2`** — PM phễu aiboss |
| Phòng Đào Tạo | `5956cd23` | phiên gỡ rối **đăng nhập email** (có địa chỉ thư của Owner — ⛔ chép ra) |
| Phòng Công Nghệ | `7911258a` | **`claude-web-funnel`** — Phòng Web Marketing phễu bos-funnel |
| Phòng Tài Chính | `823ce356` | **`claude-email-funnel-pm-296`** — PM phễu email Resend + CRM |
| Phòng Hành Chính | `1f08afd0` | **`claude-bridge-finance`** — PM cầu nối tài chính |

🔴 **Hai điều phải nói với Owner TRƯỚC khi exe gõ dòng nào:**
```
① Nạp phiên vào ghế ⛔ đổi được DANH TÍNH bên trong nó.
   Phiên e888d879 vẫn tự nhận là `claude-bos-funnel-pm-r2` và vẫn hành xử như PM phễu,
   dù nhãn ô ghi «Hiệu Trưởng». Nhãn ở ngoài, linh hồn ở trong — hai thứ khác nhau.
② Ánh xạ trông như BỊ CHÉO: thứ dính tài chính (`claude-bridge-finance`) lại vào «Hành Chính»,
   còn «Tài Chính» thì nhận một PM phễu EMAIL.
⇒ Có thể Owner CỐ Ý tái dùng phiên cũ, cũng có thể dán nhầm mã. **PHẢI HỎI, ⛔ đoán.**
```

## ⑧ NEO CHO T3 — chuỗi CÓ THẬT, exe dùng cái này thay vì tự nghĩ
```
ô 2 Hiệu Trưởng      neo: "claude-bos-funnel-pm-r2"
ô 4 Phòng Công Nghệ  neo: "claude-web-funnel"
ô 5 Phòng Tài Chính  neo: "claude-email-funnel-pm-296"
ô 6 Phòng Hành Chính neo: "claude-bridge-finance"
ô 3 Phòng Đào Tạo    ⛔ dùng neo dạng chữ — phiên đó chứa địa chỉ thư của Owner.
                     Neo bằng SỐ DÒNG thay thế: tệp phải có 55.352 dòng (±ghi thêm khi chạy).
ĐỐI CHỨNG ÂM cho cả 5: nạp một ghế MỚI TOANH ⇒ ô phải TRỐNG, ⛔ tìm thấy neo nào.
```

---

## ⑨ 🔴 SỬA T3 — PHÉP NGHIỆM THU CŨ CỦA TÔI SAI (đo 30/08 10:5x)

Tôi viết T3: *«mở ô 2 phải thấy lịch sử cũ của phiên e888d879, **103.897 dòng**»*. **SAI.**
```
api/fork/route.ts:73-80   spawn(claude, ['--resume', maPhien, '--fork-session', …], { cwd: thuMuc })
⇒ ① --fork-session ⇒ Claude cấp MÃ MỚI ⇒ tệp MỚI
⇒ ② cwd = thuMucAgent(ghế) ⇒ tệp mới nằm ở kho CỦA GHẾ, ⛔ phải kho gốc
⇒ ③ nên phiên gốc (terminal của Owner) ⛔ hề bị đụng — ĐÚNG như Owner nghĩ
⇒ ④ NHƯNG bản fork ⛔ mang trọn lịch sử ⇒ ô sẽ ⛔ BAO GIỜ có đủ 103.897 dòng
```
⚠️ **Tỉ lệ mang sang là bao nhiêu thì tôi ⛔ đo được hôm nay**, và phải nói thẳng:
```
thử đo bằng «dòng tệp con / mốc cắt ở cha» trên 3 sổ gốc tích thật:
   chat-channels 30,7%  ·  zalo-bot 9,4%  ·  slide-studio 1645%  ← VÔ LÝ ⇒ PHÉP ĐO HỎNG
lý do hỏng: số dòng tệp CON gồm CẢ phần mang sang LẪN phần ghế gõ THÊM sau fork.
⇒ nó trả lời «tệp con nay to bằng nào», ⛔ trả lời «fork mang theo bao nhiêu». Hai câu KHÁC NHAU.
```
📌 Số 6,5% / 8,4% trong hồ sơ ghế đo ngày 20/08 **ngay sau khi fork** (con chưa kịp gõ thêm)
nên sạch hơn — nhưng nó **10 ngày tuổi**, và ⛔ ai đo lại.

### ✅ T3 VIẾT LẠI — neo vào NỘI DUNG, ⛔ neo vào SỐ DÒNG
```
T3  mở ô 2 ⇒ phải TÌM THẤY chuỗi "claude-bos-funnel-pm-r2" trong lịch sử ô đó
    (⛔ đòi 103.897 dòng — fork ⛔ mang đủ)
    ĐỐI CHỨNG ÂM: nạp một ghế MỚI TOANH ⇒ ⛔ tìm thấy chuỗi đó ⇒ chứng minh T3 đo đúng thứ
T3b ĐO LẠI TỈ LỆ FORK cho đàng hoàng: NGAY SAU khi fork xong, TRƯỚC khi gõ câu nào,
    đếm dòng tệp con ⇒ chia cho mốc cắt. Đó mới là con số thật.
    ⇒ Ghi kết quả vào DECISION_LOG — nhà đang thiếu số này, và số cũ đã 10 ngày.
```

---

## ⑩ OWNER CHỐT 30/08 — thu hẹp phạm vi, và trả lời câu tôi hỏi ở ⑦

> *«Cho tôi giao diện mới có đủ 5 ghế Trường Học mà tôi nói ở trên trước đi, làm từng bước.»*

```
✅ CHỐT: dùng ĐÚNG 5 mã phiên Owner đã đưa. Tôi đã nêu chuyện danh tính cũ (mục ⑦),
   Owner nghe rồi và vẫn bảo làm ⇒ đó là QUYẾT ĐỊNH CỦA OWNER, ⛔ nêu lại nữa.
🚧 PHẠM VI BƯỚC 1 = **CHỈ** menu «Quản Lý Trường» + 5 ghế + nối phiên. ⛔ làm gì thêm.
🕓 HOÃN sang bước 2 (G3b, Owner: «phần này làm sau»):
      bấm «information» ở ghế ⇒ hiện CLAUDE.md của ghế đó
      trong đó có nút «chỉnh sửa» ⇒ mở cửa sổ soạn CLAUDE.md của ghế
   ⇒ đã ghi thành hàng G3b trên bảng việc để ⛔ rơi.
```
📌 Ghi lại lý do thu hẹp: **làm từng bước thì mỗi bước còn nghiệm thu được.** Gộp cả hai
thì T3 hỏng ⛔ biết tại phần nào.
