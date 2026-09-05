# BÀN GIAO → hermes-build-app · SỬA BỘ PHÁ `--ca-hai` (PM chốt ⓑ, 04/09)

> Từ `claude-aiboss-app-exe`. Tôi **KHÔNG** làm việc này — tôi là người ĐANG BỊ chính thước đó đo.
> Đây là **CHẨN ĐOÁN**, KHÔNG phải bản vá. Tôi đã TRẢ `doi-chung-am-mo-dun.sh` về nguyên trạng
> (md5 khớp bản commit) để bạn bắt đầu từ một cây sạch, KHÔNG phải gỡ bản sửa dở của người khác.

## 🔴 TRIỆU CHỨNG
```
bash bai-thu/chay.sh --ca-hai   ⇒ EXIT=1
  ⇒ 0/12 phép thử ĐƯỢC CHỨNG MINH LÀ BIẾT ĐỎ
  🏷 12 phép KHAI SAI LỚP
bộ đo MỘT CHIỀU vẫn XANH (0 phép đỏ) ⇒ **hỏng này IM LẶNG**
```
🔑 Hệ quả: mọi lời khai «thước biết đỏ» của cả đội hiện **KHÔNG có hiệu lực**.

## 📏 GỐC — đã đo, KHÔNG phải suy
```
bai-thu/doi-chung-am-mo-dun.sh:17   GOC=src/components/UngDung.tsx
nhưng 23 khai báo cấp mô-đun ĐÃ DỜI sang src/components/ung-dung/hang-so.ts (commit 9bd9812)
⇒ bộ phá đang phá một tệp KHÔNG còn chứa thứ cần phá
```
⚠️ PM đo thêm: **nó hỏng NGAY TẠI `9bd9812`** (`git show 9bd9812:bai-thu/doi-chung-am-mo-dun.sh`),
tức việc ③ đã commit nó hỏng. **KHÔNG phải nợ của việc ④.**

## 🧭 TÔI ĐÃ THỬ GÌ, VÀ DỪNG Ở ĐÂU (để bạn khỏi đi lại)
```
① đổi GOC → hang-so.ts                         ⇒ vài neo khớp trở lại
② truyền CẢ BA tệp qua NGUON_THU="$t,$PHU"      ⇒ bộ đo nạp được
③ đổi tệp tạm .tsx → .ts cho khớp nguồn         ⇒ CHƯA rõ có đúng không
④ đổi 6 neo sang dòng trong SO_BO_GHE           ⇒ vẫn còn neo hụt
KẾT: vẫn 0/12, và thêm «12 phép KHAI SAI LỚP»
```
🔴 **Tôi dừng ở đây** vì bước kế là sửa `bai-thu/lop-phep-pha.mjs` — **chính cổng chấm phép phá**.
Sửa nó trong lượt đang dùng nó để nghiệm thu bài mình là tự chấm bài mình.

## 🧩 NEO ĐÃ CŨ — chúng trỏ vào mã KHÔNG còn tồn tại
```
BO_QUAN_LY_CU.map((m) => m.ten),        ← mảng cũ trong LA_BO_DUNG_SAN, ĐÃ THAY bằng SO_BO_GHE
BO_QUAN_LY_TRUONG.map((m) => m.ten),    ← nt
BO_CONG_NGHE.map((m) => m.ten),         ← nt
].some((bo) => bo.every((x, i) => ten[i] === x));   ← nt
```
Mã thay thế nay là (hang-so.ts):
```ts
const SO_BO_GHE: BoGheDungSan[] = [
  { ma: 'marketing', ten: 'Phòng Marketing', ghe: chuoiThanhGhe(BO_MARKETING), icon: 'vuong-mien' },
  … 4 dòng nữa …
];
const LA_BO_DUNG_SAN = (ten) => SO_BO_GHE.some((bo) => bo.ghe.map((g) => g.ten).every((x, i) => ten[i] === x));
```
⇒ Phép phá tương đương nay là **GỠ MỘT DÒNG khỏi `SO_BO_GHE`**.

## ✅ NGHIỆM THU ĐỀ NGHỊ (bạn tự quyết cách làm)
```
① `bash bai-thu/chay.sh --ca-hai` ⇒ EXIT=0 · 12/12 «biết ĐỎ» · 0 «khai sai lớp»
② ĐỐI CHỨNG: cây `src/` KHÔNG bị chạm — script đã tự đo bằng md5 (dòng 79), giữ nguyên chốt đó
③ ĐỐI CHỨNG ÂM: cố ý để một phép thử KHÔNG canh gì ⇒ bộ phá phải BÁO nó vẫn xanh
```

## 🚫 CHỖ TÔI KHÔNG BIẾT
```
· «12 phép KHAI SAI LỚP» đến từ `lop-phep-pha.mjs`. Tôi CHƯA đọc kỹ nó — dừng trước khi đọc.
  Có thể do đổi đuôi tệp tạm, có thể do nó giả định tệp là component. Đây là CHỖ ĐOÁN, đừng tin.
· Tôi KHÔNG biết bộ phá còn neo nào cũ ngoài 4 cái liệt kê trên.
```
