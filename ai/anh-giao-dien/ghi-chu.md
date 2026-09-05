# Ghi chú ảnh — đọc TRƯỚC khi dùng ảnh làm chứng cứ

## 2026-09-05 19:02 · BỘ ẢNH NÀY **KHÔNG PHẢI** GIAO DIỆN CŨ. Nó là ảnh một trang ĐANG VỠ.

PM định chụp bản CŨ ở `http://127.0.0.1:4319/` để có thứ mà so với bản mới.
**Chụp trượt: cửa sổ đã đóng trước đó ~2 phút.** Ảnh ra là chữ trần, không kiểu dáng, không bố cục.

### Vì sao — đo tại chỗ, không đoán

```
19:00-19:03  exe chạy `next build` (BUILD_ID đổi hai lần: JPzu4fsN… -> pq2BaCb… -> RWig09YU…)
             build GHI ĐÈ .next/static  ⇒ mảnh mã của bản CŨ biến mất khỏi đĩa
19:02        PM chụp. Máy chủ vẫn giữ bản CŨ trong bộ nhớ nên nó TRẢ VỀ trang HTML cũ,
             nhưng trang đó đi đòi những mảnh mã đã không còn.
```
Đo từng mảnh lúc 19:05:
```
/_next/static/chunks/59-ec725fcbdd7dc994.js        200 · 171.807 byte
/_next/static/chunks/72d9b9fe-881c608dfd3d6075.js  200 · 173.018 byte
/_next/static/chunks/936-832e40011eb6e8f6.js       200 ·  48.752 byte
/_next/static/chunks/app/page-7478575a595d0f37.js  400 ·   2.020 byte   <-- MẢNH CHÍNH CỦA TRANG
```
**MỘT mảnh thiếu là đủ để trang không dựng lên được.** Ba mảnh kia còn nguyên chỉ vì tên băm của
chúng tình cờ không đổi giữa hai bản dựng.

### 🔑 Bài học, và nó KHÔNG hiển nhiên

Trước khi chụp, PM đã đo đúng ba phép mà sổ nhà đòi, và **cả ba đều xanh**:
```
GET /                200 · thân 172.465 byte   (thân lớn, KHÔNG phải vỏ 404)
đường bịa            404                        (đối chứng âm ĐÚNG)
```
**Trang vẫn vỡ.** Vì `200` trên tài liệu chỉ chứng minh **máy chủ còn định tuyến**, KHÔNG chứng
minh **trang chạy được**. Và đối chứng âm chỉ soi tầng định tuyến — nó mù hoàn toàn với tầng tài nguyên.
📌 Muốn biết trang có sống không thì phải **đòi đúng những mảnh mà trang đòi**, rồi đếm mã trả về.
📖 Ghi thành `~/Operations/SO-BAY-DO.md` mục 93.

### Giá trị còn lại của hai tấm ảnh này
Chúng là **hiện vật của đúng cái bẫy đó** — giữ lại để người sau nhìn thấy một trang «200, thân
172KB» trông như thế nào khi nó đã vỡ. KHÔNG được dùng làm ảnh «giao diện cũ».

### 🔜 Còn thiếu
```
· ảnh bản MỚI, chụp SAU khi khởi động lại  ⇒ chưa có
· ảnh bản CŨ                               ⇒ MẤT VĨNH VIỄN, mảnh mã đã bị ghi đè
  (dựng lại từ commit cũ thì lấy lại được, nhưng phải đụng cây đang chạy — KHÔNG đáng)
```
📌 Đây chính là điều luật ở README dặn: **CHỤP BẢN CŨ TRƯỚC KHI SỬA.** Luật ra đời lúc 18:58,
bản dựng chạy lúc 19:00. Chậm hai phút là mất.

## 2026-09-05 19:17 — SỐ ĐO trên bản THẬT sau khi lên ⑲⑳㉑ (`claude-aiboss-app-exe`)

Tôi có chụp hai tấm riêng rồi **XOÁ ĐI**: bộ `2026-09-05_1917_giao-dien-MOI_*` của ghế khác đã
chụp đúng khoảnh khắc ấy và đặt tên đúng khuôn. Hai tên cho cùng một khoảnh khắc là đẻ bản thứ
hai — người sau sẽ phải đoán xem tấm nào mới là chứng cứ.
🪤 Bẫy nhỏ khi chép ảnh vào đây: `chup-trang.sh` TỰ NỐI dấu thời gian vào tên
(`<tên>-YYYYMMDD-HHMMSS.png`) nên tìm theo tên chính xác sẽ TRƯỢT. Ảnh CÓ được chụp; cái trượt là
phép tìm. Người sau dùng `ls -t <tên>-*.png`.

Bối cảnh của bộ ảnh 19:17 — số tôi đo bằng trình duyệt trên **cổng 4319 (bản thật)**:
- BUILD_ID `RWig09YU2bLV5wvxpfvp_` · commit `0b30719` · pid máy chủ 60960 (trước khi nạp: 3870)
- desktop 1280×800: thanh trên cao **47px** `nowrap` · nhóm nút bố cục `y=9`, **5 nút** `1·2·2-tp·4·6`,
  5/5 bấm trúng · `.so-lieu` trong `.cot-1` y 697→757 rộng **254/264** · «Toàn bộ nhân sự» y=321
  nằm dưới đáy menu 315 · «Vào phòng ban» lớp `goc nut-vao-pb de-muc`, `role` = null, 6 mục luôn hiện
- 2 ô trên-dưới: cùng `x`=584, khác `y` 47/424 · 2 ô trái-phải: cùng `y`=47, khác `x` 584/933
- điện thoại 390×844: `.so-lieu` `display:none` · nhóm nút x=162 rộng 214 mép phải **376 < 390** ·
  thanh cao 51px (một hàng) · 5/5 bấm trúng
- 8/8 tệp tĩnh trả 200 ⇒ trang VỠ ở mục 19:02 đã hết sau khi nạp

⚠️ Ảnh 19:17 có tên người thật trong danh bạ ⇒ **đừng commit**, cũng đừng gửi ra ngoài máy.
🕳 Thiếu bản CŨ để so: nếp chụp-trước-khi-sửa (Owner đặt 05/09) tới SAU khi ⑲⑳ đã làm xong.
   Lần sửa giao diện kế phải chụp TRƯỚC, khôngthì lại chỉ còn lời kể.

---

## 2026-09-05 19:17 · ẢNH BẢN MỚI — cặp ảnh nay đã có một nửa

```
2026-09-05_1917_giao-dien-MOI_1440.png   2880×2400 · trang cao thật 1200 điểm
2026-09-05_1917_giao-dien-MOI_390.png     780×2766 · trang cao thật 1383 điểm
xem_moi_1440.png · xem_moi_390.png        bản thu nhỏ để xem nhanh
```
Máy chủ: `next-server` pid **60960**, khởi **19:13:35** · BUILD_ID `RWig09YU2bLV5wvxpfvp_`
commit đang phục vụ: `0b30719`

**Nghiệm thu ⑤ — bốn tầng, đo 19:16:45:**
```
① tài liệu       200 · thân 176.844 byte
② đối chứng âm   404
③ mảnh trang đòi tổng 8 · KHÔNG-200: 0     ← tầng mà mục 93 mới thêm
④ ảnh chụp       trang dựng đủ, cao 1200 điểm (lúc vỡ là 16.916 điểm)
```
⚠️ Grep dấu vân trong HTML là thước YẾU ở app này: đối chứng dương `luoi` chỉ ra **1** vì HTML chỉ
là vỏ, phần lớn giao diện do mã trên trình duyệt dựng. **Muốn nghiệm thu giao diện thì phải CHỤP,
đừng grep.**

🔜 Còn thiếu vĩnh viễn: ảnh bản CŨ (mất lúc 19:00, xem mục đầu tệp này).
