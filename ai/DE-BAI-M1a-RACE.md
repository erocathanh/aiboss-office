# ĐỀ BÀI M1a — DỜI 6 KHAI BÁO KIỂU · CHẾ ĐỘ CHẠY ĐUA

Hai thợ nhận ĐỀ GIỐNG HỆT, NỀN GIỐNG HỆT, làm ở HAI WORKTREE RIÊNG, KHÔNG đọc bài nhau.
Ai đóng băng trước thì được người soi soi trước. Chỉ MỘT bản được nhập.

## 🔒 NỀN — bước 1 đã đạt, PM đo lúc 14:1x
```
COMMIT_NEN = 3ab4f5b756251f8f0ba69415048aec1caa1f7bb8
git status dưới ai/ và bai-thu/ ⇒ 0 mục · worktree đang mở ⇒ 1 (cây chính)
```

## 🎯 VIỆC — ĐÚNG một việc, không hơn
Dời **6 khai báo kiểu** từ `src/components/UngDung.tsx` sang `src/components/ung-dung/kieu.ts`:
```
PhongBan · NhanSu · TomTatPhien · Tin · CapGheDungSan · OChat      tổng thân = 126 dòng
```
🔑 Kiểu TypeScript bị XOÁ khi biên dịch ⇒ hành vi lúc chạy KHÔNG THỂ đổi. Đó là tính chất của
ngôn ngữ, KHÔNG phải lời hứa của ai. Vì thế bước này KHÔNG cần browser/DOM/mạng/next build.

## ⛳ CÔNG THỨC — PM đã CHẠY THỬ trên kho tạm, dán vào mà làm
```
① dời theo TÊN, KHÔNG theo mẫu grep. Giữ NGUYÊN VĂN TỪNG DÒNG, kể cả dòng `interface X {`
② KHÔNG viết `export interface`. Xuất bằng CÂU LỆNH RIÊNG cuối tệp: `export type { … };`
   (viết `export` vào dòng khai báo ⇒ so-diff báo DÒNG_KHÔNG_QUAY_LẠI, PM đã đo)
③ HAI KHỐI CHÚ THÍCH Ở LẠI `UngDung.tsx`:  dòng 17  ·  dòng 216-254
   ⚠️ KHÔNG cắt từ chú thích xuống, DÙ ĐÓ LÀ PHẢN XẠ ĐÚNG ở mọi lượt khác.
   Khối 216-254 nhắc `CapGheDungSan` 0 lần, nhắc `thu_muc` 3 · `nhan-su.json` 3 ⇒ nó là
   NHÃN CẢNH BÁO của bộ ghế dựng sẵn, và cái nó cảnh báo Ở LẠI trong tệp.
④ `CapGhe` (kiểu nằm TRONG hàm, dòng 539): ĐỂ NGUYÊN. Mang sang là ngoài phạm vi.
⑤ 6 kiểu là TẬP KHÉP KÍN ⇒ `kieu.ts` KHÔNG cần nhập gì · TỔNG dòng THÊM của cả M1a = ĐÚNG 2
⑥ Tin báo lên kênh PHẢI CHÉP NGUYÊN VĂN hai dòng THÊM. Không chép ⇒ coi như CHƯA NỘP,
   dù cổng có xanh. Lý do: `so-diff` ĐẠT thì in ra MÀN HÌNH TRỐNG — người soi sẽ KHÔNG thấy hai dòng đó.
```

## 📜 ACCEPTANCE — CHÍN BƯỚC, do người soi ngoài nhà viết. Đây là LUẬT, không phải gợi ý
```
1 khoá nền        COMMIT_NEN + ứng viên · git status SẠCH dưới ai/ bai-thu/
                  KHÔNG nhận số từ worktree liên kết nếu cây chính còn tệp chưa commit
2 khoá danh sách  git diff --name-only NỀN...ỨNG_VIÊN chỉ được ĐÚNG HAI tệp
                  src/components/UngDung.tsx · src/components/ung-dung/kieu.ts
                  Có tệp thứ ba ⇒ DỪNG, KHÔNG dùng so-diff để hợp thức hoá
3 khoá allowlist  công bố TRƯỚC từng dòng thêm · KHÔNG wildcard
4 so-diff         MỘT hướng · mã 0 và stdout/stderr RỖNG
                  + đối chứng dương trên BẢN SAO: đổi một ký tự trong một declaration ⇒ phải ĐỎ đúng dòng
5 kiểm AST        6 tên · 126 dòng · biến khỏi nguồn · mỗi tên ở đích ĐÚNG MỘT lần
                  parent trực tiếp là SourceFile · ĐÚNG THỨ TỰ trên
                  hash từng declaration trước/sau BẰNG NHAU · kieu.ts KHÔNG có runtime statement
6 ĐỌC DIFF BẰNG MẮT   không chỉ đọc thống kê · xác nhận KHÔNG hoán vị cùng tệp kể cả chú thích
                  và dòng trắng · hai khối chú thích và CapGhe còn ĐÚNG CHỖ
7 typecheck       fnm exec --using=24.19.0 -- npx tsc --noEmit
                  BẮT MÃ THOÁT TRỰC TIẾP, KHÔNG đọc $? sau đường ống · phải 0
8 sanity guard    chạy bộ đóng băng + hai hộp đối chứng âm trên ĐÚNG commit ứng viên
                  báo số TÁCH BẠCH: xanh N/N · biết-đỏ M/N · 13 kịch bản (12 qua cổng lớp) · 5 thứ tự móc
                  ⛔ KHÔNG ghi «13/13 qua cả hai cổng»
9 đóng dấu        ghi nền · ứng viên · md5 các cổng · TOÀN BỘ lệnh và mã thoát
                  sửa MỘT BYTE sau đó ⇒ verdict HẾT HIỆU LỰC
```
🔴 **Bước 6 KHÔNG có máy nào làm hộ.** Người soi nói thẳng: chạy bốn công cụ rồi tin mã xanh ⇒ NO-GO.

## 🏁 LUẬT CHẠY ĐUA
```
· worktree riêng, nhánh riêng: git worktree add ../wt-m1a-<tên-bạn> -b viec/m1a-<tên-bạn> COMMIT_NEN
· KHÔNG đọc / KHÔNG chờ / KHÔNG lấy mẩu bản của người kia. Hai lời giải ĐỘC LẬP mới so được.
· xong thì ĐÓNG BĂNG: công bố md5 hai tệp + COMMIT ứng viên, rồi BÁO KÊNH. Ai băng trước, soi trước
· bản thua GIỮ làm đối chứng, KHÔNG trộn mẩu vào bản thắng
· chốt worktree ĐANG SỐNG: cây chính bẩn dưới ai/ hoặc bai-thu/ thì bạn KHÔNG lấy được số ở worktree
· KHÔNG next build · KHÔNG sửa gì ngoài HAI tệp ở bước 2
```
📌 Ghi SỐ VÒNG vào tin kênh nếu phải làm lại (luật bộ đếm vòng: bác 3 vòng ⇒ DỪNG, báo Owner).

## 🔗 NEO LÀ `COMMIT_NEN`, KHÔNG PHẢI `HEAD` — thêm 14:4x sau khi @exe cảnh báo
```
HEAD của main CÓ THỂ ĐỔI trong lúc hai thợ làm — `hermes-web-noibo` đang sửa `chon-mau/`,
họ commit là HEAD nhích, và 3ab4f5b thành «commit cũ».
⇒ ĐIỀU ĐÓ KHÔNG SAO. Worktree của bạn neo vào COMMIT_NEN, không neo vào HEAD.
⇒ ĐỪNG rebase. ĐỪNG lấy HEAD mới. Hai thợ phải xuất phát từ CÙNG MỘT nền thì mới so được.
⇒ Bước 2 so `git diff --name-only COMMIT_NEN...ỨNG_VIÊN` — vẫn đúng dù HEAD đã đi tiếp.
```
📌 `chon-mau/` nằm NGOÀI thư mục cổng (`ai` · `bai-thu`) nên nó KHÔNG chặn M1a — @exe đã đo.
