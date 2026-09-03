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

---

## 🪝 v3 — THƯỚC THỨ TỰ MÓC (LÀN B, 03/09/2026)

> 🔄 **Bỏ MÔ HÌNH GỘP PHẲNG của v2, giữ nguyên bộ đo.** v2 mua tính «sống qua một lần chia»
> bằng cách SẮP mọi thứ vào một rổ phẳng, và bán đi toàn bộ QUAN HỆ. v3 mua đúng tính bất biến
> ấy bằng **KHOÁ THEO TÊN COMPONENT** — rẻ hơn, và không phải bán gì.
>
> 📌 **Tính bất biến mua bằng KHOÁ thì giữ được quan hệ. Mua bằng SẮP XẾP thì phải bán quan hệ đi.**

### 🕳 Cớ sinh ra nó — một con số, không phải một lo xa
Bản v2 đứng trước một phép **hoán vị THẬT** (đảo chỗ hai dòng `useState` liền nhau; tập hợp dòng
y hệt) và trả về **15/15 XANH**. Nó lọt vì hai lớp cùng mù một chỗ:
- rổ phẳng có `.sort()` ⇒ hoán vị không đổi rổ;
- `thuTuTrongTungHam` chỉ ghi **LOẠI** móc (`useState`) ⇒ đảo hai `useState` cho ra dãy y hệt.

Và nó chưa từng bị phát hiện, vì phép phá ② tên là «ĐỔI THỨ TỰ móc» nhưng **lệnh sed của nó là XOÁ**.
📌 **Cái tên của một phép phá KHÔNG phải bằng chứng nó đo cái đó. Phải đọc lệnh.**

### Thước mới đo gì
| Tệp | Việc |
|---|---|
| `thu-tu-moc.mjs` | dãy móc **theo thứ tự, theo từng component**; giải bí danh; gỡ phẳng móc tự viết; phán quyết `soSanhDay` |
| `dong-bang-thu-tu-moc.test.mts` | 14 phép — đóng băng dãy thật + 6 vật thử + chốt bí danh + chốt từ-chối |
| `chup-thu-tu-moc.mjs` · `chup-hinh-dang-than.mjs` | script SINH bản đóng băng (v1/v2 không có ⇒ ai cũng chụp tay một kiểu) |
| `doi-chung-am-thu-tu-moc.sh` | 5 phép phá mới, tách tệp cố ý |

**Danh tính một móc** neo vào `móc-React-đã-giải # tên-được-gán # mảng-phụ-thuộc-THEO-THỨ-TỰ #
vân-tay-đối-số # chuỗi-hàm-bao`. Đo trên tệp thật: **72 móc, KHÔNG cặp nào trùng danh tính**
⇒ hoán vị BẤT KỲ cặp nào cũng bị bắt.

**Bốn phán quyết phân biệt được, không gộp thành «khác»:**
`DOI-TEP-THUAN` (dời tệp / bóc ra móc tự viết — React cũng gỡ phẳng đúng thế) ·
`DOI-THU-TU` (nêu component nào) · `CHUYEN-CHU` (nêu *móc nào từ đâu sang đâu*) ·
`MAT-HOAC-THEM` (nêu đích danh móc bị rơi).

### 🔴 Ba lỗi ĐO ĐƯỢC của bản cũ, sửa trong lượt này
1. `useRef([])` bị đếm thành «có mảng phụ thuộc» ⇒ con số **38 từng khai là SAI, thật ra 35**.
   `useRef` làm gì có mảng phụ thuộc; ba cái kia là GIÁ TRỊ KHỞI TẠO đọc nhầm.
2. `import { useEffect as chayXong }` — bộ dò cũ **mất trắng** móc đó (component khai 1 thay vì 2).
   Cùng một lỗ bí danh, dạng khác; bản vá đêm qua chỉ bịt đúng dạng đã cắn.
   ⇒ nay **MỘT bảng bí danh dùng chung** cho cả hai thước, 5 lối dò (nhập · nhập-đổi-tên ·
   khai-báo · bắc-cầu · `React.useX`).
3. `.sort()` trên mảng phụ thuộc và trên thuộc tính JSX. Một lần dời-thuần KHÔNG BAO GIỜ đảo
   thứ tự chúng ⇒ sắp lại KHÔNG mua được gì, chỉ mất sức bắt lỗi. Với `{...props}` thì sắp lại
   còn **xoá mất một sự thật** (thứ tự quyết định cái nào thắng).
   📌 Chuẩn hoá là để nuốt cái KHÁC BIỆT VÔ HẠI. Chuẩn hoá thứ vốn đã ổn định thì chỉ còn làm mù.

### ⚠️ Thước này KHÔNG nói được gì về — bảng đầy đủ theo hiểu biết hôm nay
- **hành vi**: nó đọc cây cú pháp, KHÔNG chạy. Cùng hình dạng mà chạy ra kết quả khác thì nó im.
- **móc gọi có ĐIỀU KIỆN** (`if (x) useEffect(...)`): ghi theo thứ tự VĂN BẢN, React chạy theo
  thứ tự THẬT. Mã đúng luật React thì hai cái trùng; mã sai luật thì `eslint-plugin-react-hooks`
  mới bắt, KHÔNG phải thước này.
- **móc tự viết nhập từ gói NGOÀI**: không đọc được thân ⇒ KHÔNG gỡ phẳng, chỉ ghi tên gọi.
- **dời-thuần từng dòng**: đó là LÀN A, thước khác, người khác.
- **`CHUYEN-CHU` không phải lời chúc lành**: nó nói «không rơi mất gì», KHÔNG nói «cư xử như cũ».
  Bóc một phần thân sang component con là đổi ngữ nghĩa React thật — người soi PHẢI đọc.

### Cổng nghiệm thu — số đo 03/09
| Phép | Bản v2 (HEAD) | Bản v3 |
|---|---|---|
| 11 phép phá CŨ (`doi-chung-am.sh`, tệp **KHÔNG bị sửa**, md5 `0a4544e1…`) | 11/11 | **11/11** |
| bộ đo trên mã hiện tại | 56/56 | **78/78** |
| 5 phép phá MỚI (hoán vị thật · đổi danh tính móc · đảo phụ thuộc) | **1/5** | **5/5** |

---

## 🏷 v4 — SỬA LẠI HỘP DỤNG CỤ (03/09/2026, sau NO-GO lần ba)

> 🔴 **NỀN SỐ MỚI. KHÔNG so trực tiếp được với con số «11/11» của v3.**
> Không phải vì thước đổi, mà vì **HỘP DỤNG CỤ đổi**: 3 phép phá bị đổi tên cho khớp việc chúng
> thật sự làm, và 2 phép phá THẬT được thêm vào. Hai con số khác gốc, đừng đặt cạnh nhau như thể
> cùng một thước.

| | v3 (đêm 02/09) | v4 |
|---|---|---|
| phép phá hộp CŨ | 11, **3 trong đó dán nhãn sai** | **13**, mọi phép qua cổng LỚP |
| phép phá hộp THỨ TỰ MÓC | 5 | 5, nay cũng qua cổng LỚP |
| bài thử | 78 | **91** |
| `tsc --noEmit` | 0 | 0 |

### 🕳 Vì sao phải làm lại — và vì sao KHÔNG chỉ vá ba chỗ
Reviewer R0 tìm ra 3/16 phép phá **làm việc khác với tên chúng mang**:

| dòng | tên nó mang | việc nó thật sự làm |
|---|---|---|
| 50-52 | «MẤT một nhánh JSX» | chỉ xoá TRỐNG `className`; nhánh còn nguyên ở `UngDung.tsx:3025-3029` |
| 53-55 | «ĐỔI THỨ TỰ móc» | **XOÁ** một móc |
| 59-61 | «BỎ SÓT móc gọi qua BÍ DANH» | **THÊM SAI** một phần tử vào mảng phụ thuộc của nó |

Cả ba vẫn **ĐỎ đều đặn** — chỉ là đỏ vì lý do khác. Cái đỏ ấy trông y hệt một cái cổng đang canh,
nên suốt hai vòng soi KHÔNG ai đi đọc lệnh.
📌 **Một phép đo sai nhãn nguy hơn một phép đo hỏng: phép đo hỏng thì IM, phép đo sai nhãn thì
TRẢ LỜI — và trả lời đúng thứ mình muốn nghe.**

Vá ba chỗ thì chỗ thứ tư lại quên. Nên v4 dựng **cổng**: `lop-phep-pha.mjs`.

### 🏷 Cổng LỚP — mỗi phép phá phải KHAI LỚP, máy đo delta THẬT rồi đối chiếu
9 lớp, mỗi lớp là một VỊ TRÍ trong không gian delta (đo bằng cây cú pháp), KHÔNG phải một lời mô tả:
`xoa-nut-jsx` · `doi-thuoc-tinh-jsx` · `doi-chu-jsx` · `xoa-moc` · `hoan-vi-moc` ·
`doi-phu-thuoc` · `doi-danh-tinh-moc` · `doi-doi-so-moc` · `doi-mo-dun`.
Lớp lạ ⇒ TỪ CHỐI. Neo trượt (tệp KHÔNG đổi) ⇒ TỪ CHỐI.
`dong-bang-lop-phep-pha.test.mts` (13 phép) giữ cho chính cổng ấy khỏi mục — **một phép kiểm chỉ
chạy đúng một lần, vào ngày người ta hào hứng nhất, là một giai thoại chứ không phải một cái cổng.**

### ➕ Hai phép phá THẬT còn thiếu — thứ mà hai cái tên sai vẫn đang HỨA
- ⑥ `xoa-nut-jsx` — xoá HẲN khối `{o.loiDan && <div className="dan-ket-qua">…}` (242→241 nút)
- ⑦ `xoa-moc` — xoá HẲN trọn khối `dungTruocKhiVe(… }, [maCu]);` (72→71 móc)

### 🔴 Lỗi thứ tư, tự tìm ra trong lúc dựng cổng — và nó là số TÔI đã khai sai
Bộ bóc chữ chui vào **JSX LỒNG bên trong biểu thức** và nhặt luôn **TÊN LỚP CSS** làm «chữ hiển thị».
```
«nút mang chữ» khai đêm qua : 106
đo lại sau khi vá           :  83     ⇒ 23 nút KHÔNG mang một chữ nào, con số bị thổi 28%
```
Hệ quả nặng hơn con số: đổi `className` làm trục CHỮ đổi theo ⇒ hai lớp `doi-thuoc-tinh-jsx` và
`doi-chu-jsx` **KHÔNG phân biệt được**. Nhìn từ chiều thuận thì vẫn thấy «đúng».
📌 **Nới một phép đo để nó bắt thêm thì nó cũng bắt nhầm thêm.** Hai bản vá trước đều vá đúng chiều
mà nới quá tay, và chỉ chiều NGƯỢC mới lộ ra.

### ⚠️ Cổng LỚP KHÔNG làm được gì
- Nó kiểm «delta có thuộc lớp đã khai không». Nó **KHÔNG** kiểm «lớp đã khai có phải thứ ta CẦN đo
  không» — chọn sai lớp ngay từ đầu thì nó vẫn cho qua. Đó vẫn là việc của người soi.
- Phép phá `bỏ khoá giay_tu_ep` đụng tệp NGOÀI `UngDung.tsx` ⇒ **KHÔNG được soi lớp**. Khai thẳng,
  để nó đừng trốn trong cùng một con số với các phép đã soi.
