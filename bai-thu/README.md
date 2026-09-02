# 🧊 BỘ ĐÓNG BĂNG HÀNH VI — `bai-thu/`

> 👤 `claude-aiboss-app-exe` · 📅 02/09/2026 · làn A của giai đoạn S0

## Dùng thế nào
```bash
bash bai-thu/chay.sh            # bộ đo — phải XANH
bash bai-thu/chay.sh --ca-hai   # kèm ĐỐI CHỨNG ÂM — phá thì phải ĐỎ
```

## Bộ chạy thử: `node --test` — **KHÔNG thêm một phụ thuộc nào**
Gói hiện có 4 phụ thuộc phát triển (`typescript` + 3 gói `@types`) và **chưa có bộ chạy thử**.
Chọn `node --test` (có sẵn từ Node 18, dự án ghim 24.19.0) thay vì `vitest`/`jest` vì:
```
· 0 gói mới · 0 tệp cấu hình · 0 bề mặt nguồn cung mới
· Node 24 tự bóc kiểu TypeScript (--experimental-strip-types) ⇒ chạy thẳng .mts
· thêm một bộ chạy thử là thêm một thứ phải bảo trì, mà ta chưa có nhu cầu nào nó giải được
```

## Phủ được gì — **64 phép thử, 4 tầng** (bản v2, vá theo NO-GO 22:35)
```
① dong-bang-ungdung.test.mts  26 phép · 21 khai báo CẤP MÔ-ĐUN của UngDung.tsx
     LA_BO_DUNG_SAN · 5 bộ ghế (nội dung + mã phiên) · chenRanh · boDau · maOCua · datMa
     · O_TRONG · 4 khoá localStorage · các hằng ngưỡng
② dong-bang-cong.test.mts     10 phép · hợp đồng JSON của 8 cửa trong src/app/api
     6 khoá của /api/dung · khoá hạn giờ của /api/danh-thuc · luật «lỗi luôn mang khoá loi»
③ dong-bang-lib.test.mts      11 phép · 3 mô-đun THUẦN trong src/lib
     han-gio-fork · so-o (ca 21/08 tin mất im lặng) · dung-markdown
④ dong-bang-than.test.mts      9 phép · HÌNH DẠNG thân component (86% còn lại)
     70 móc theo THỨ TỰ · 38 mảng phụ thuộc · 35 trạng thái + giá trị khởi tạo
     · 242 nút JSX kèm lớp CSS tĩnh · 23 hàm con
```

## ⚠️ TẦNG ④ LÀ ĐÓNG BĂNG **HÌNH DẠNG**, KHÔNG PHẢI **HÀNH VI** — đọc kỹ khác biệt
```
BẮT ĐƯỢC   thứ bị MẤT · bị ĐỔI THỨ TỰ (React phụ thuộc thứ tự móc)
           · mảng phụ thuộc ĐỔI · lớp CSS / thuộc tính tĩnh ĐỔI
KHÔNG BẮT  cùng hình dạng mà CHẠY RA KẾT QUẢ KHÁC
           vd: đổi `>` thành `>=` bên trong một hàm con ⇒ ký hiệu y hệt ⇒ bộ đo XANH
```
🔑 Chọn tầng này vì kiểu hỏng của một lần CHIA là «dời mà rơi mất / dời mà đổi chỗ», chứ không phải
«viết sai logic». Muốn bắt kiểu sau thì phải CHẠY, mà chạy thì phải giả lập mạng + DOM — và
**giả lập sai chính là chỗ đẻ ra bộ đo xanh giả.** Tôi chọn KHÔNG giả lập.

## 🔴 KHÔNG phủ được gì — đọc kỹ phần này hơn phần trên
```
· THÂN component `UngDung` — 2855/3337 dòng = 86% tệp.
  18 useState · 17 useRef · 19 useCallback · 9 useEffect · 4 useMemo · 967 dòng JSX
  ⇒ cần bộ dựng DOM (jsdom + thư viện thử React) = thêm phụ thuộc, và vẫn phải giả lập
    mọi lời gọi mạng. Tôi KHÔNG dựng nó trong lượt này.
· 6 khai báo cấp mô-đun nằm ngoài tầm, có lý do từng cái:
    dungTruocKhiVe · mocDayDu · BongBong · gioBayGio  (dính DOM / đồng hồ / móc React)
    ICON_SO_O                                          (trỏ vào biểu tượng nhập từ ngoài)
    UngDung                                            (chính là thân component)
· mô-đun src/lib có chạm đĩa hoặc sinh tiến trình: kho-tien-trinh · kho-phien · doc-phien
  · kho-danh-thuc · chay-agent … ⇒ KHÔNG đưa vào đây, vì thử chúng đúng cách cần tiến trình con
    thật (dùng `sleep`, KHÔNG dùng `claude`) và nó thuộc một bộ đo khác.
· hành vi TRÌNH DUYỆT: bấm nút · cuộn · phím tắt · localStorage thật.
```
⚠️ **Nói thẳng:** bộ này đóng băng được **cái vỏ và các mảnh rời**, KHÔNG đóng băng được **thân
component** — mà thân đó chiếm 86% tệp. Sau khi chia tệp, nó chứng minh được «các mảnh rời KHÔNG
đổi giá trị và hợp đồng cổng còn nguyên», nó **KHÔNG** chứng minh được «giao diện cư xử y như cũ».

## Ràng buộc đã giữ
```
· KHÔNG chạm phiên thật của Owner · KHÔNG sinh một tiến trình `claude` nào
· KHÔNG gọi mạng · KHÔNG dựng máy chủ · KHÔNG sửa một byte trong src/
  (đối chứng âm phá trên BẢN CHÉP ở /tmp, và script tự kiểm md5 src/ trước-sau)
```

## Đối chứng âm — 6 phép, mỗi phép dựng lại một ca THẬT
```
gỡ BO_CONG_NGHE khỏi LA_BO_DUNG_SAN     ca 20/08: đè mất đội thật của Owner
xoá một mã phiên trong BO_CONG_NGHE     ô mở ra TRỐNG
đổi nhịp thăm dò 5s → 60s               ngưỡng lặng lẽ trôi
bật hienMau mặc định                    ca 17/08: Owner thấy nguyên dấu sao
gỡ nhánh bỏ-dấu chữ `đ` thường          ⇐ phép này TÌM RA LỖ TRONG CHÍNH BÀI THỬ, xem chú thích tại chỗ
bỏ khoá `giay_tu_ep` khỏi /api/dung      ca 02/09: hai đầu trôi mỗi bên một kiểu
```

## Sau khi chia tệp thì làm gì
### 🔴 KHÔNG PHẢI CHỤP LẠI — đây là chỗ bản v1 sai và v2 sửa
Bản v1 buộc phải chụp lại bản hình dạng sau khi chia — mà chụp lại là **so mã đã chia với chính nó**.
Bản v2 đóng băng **TẬP HỢP GỘP**, dựa trên một tính chất đo được:
```
một lần CHIA giữ nguyên TẬP HỢP, chỉ đổi cách chia tập hợp ấy ra các tệp
⇒ dời một móc sang tệp khác: tổng KHÔNG đổi   ·   làm rơi một móc: tổng ĐỔI
```
Tính chất ấy **được chứng minh bằng vật thử**, không phải bằng lời hứa — xem `bai-thu/vat-thu/`:
một component tách thành hai, ký hiệu gộp **giống hệt**; tách mà làm rơi, ký hiệu **khác**.

⇒ Sau khi chia, chỉ cần **trỏ `NGUON_THU` sang danh sách tệp mới** (ngăn bằng dấu phẩy).
   **KHÔNG chụp lại.** Nếu ký hiệu đổi thì đó là thứ CẦN đọc, không phải thứ cần chụp đè.

⚠️ Ký hiệu gộp **KHÔNG canh thứ tự móc GIỮA các component** — thứ tự chỉ có nghĩa trong phạm vi
một component, và trong từng component thì vẫn canh (`thuTuTrongTungHam`).
