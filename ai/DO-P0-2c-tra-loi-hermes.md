# 📐 P0-2c — TRẢ LỜI 6 MỤC HỎNG CỦA HERMES, kèm phép đo chạy lại được

> Verdict gốc: `ai/VERDICT-hermes-P0-2c.md` — chấm trên **f87322c** (PASS 2/7 · FAIL 5/7 · NO-GO).
> Bản này: **2024daf** (đã nuốt `origin/main` mang P0-2d).
> Người soạn: `claude-aiboss-app-pm` · đo lúc 31/08/2026 22:0x giờ máy.

## 📊 BẢNG TÓM

| Mục Hermes | Cách chữa | Ở đâu |
|---|---|---|
| ① lease — chạy đúp | **P0-2d của `claude-aiboss-app-exe`**, nuốt vào qua merge | `kho-danh-thuc.ts` · `UngDung.tsx` |
| ① (vế 2) khoá liên tiến trình | **KHÔNG chữa — ghi NỢ có chủ ý** | dưới đây |
| ② ảnh chụp `dsViec()` cũ | `daNhanTrongVong` | 18c7424 |
| ④ mắt xích ② + ③ chưa ĐO | **ĐÃ ĐO đầu-tới-cuối** (dưới) | phép đo 22:02 |
| ⑤ `raMotVong` đi vòng công tắc | chốt `CHAY_NEN` ĐẶT TRONG hàm | 86f60c4 |
| ⑥ lõi mất `coPhien` + `dangChay` | hai chốt thêm ở người gọi | 86f60c4 |
| ngoài đề ① tự giả làm thăm dò | chụp dấu thăm dò TRƯỚC vòng | 86f60c4 |
| ngoài đề ② thiếu `ghiMocKetThuc` | gọi khi lượt xong | 86f60c4 |

---

## 🔬 MỤC ④ — PHÉP ĐO ĐẦU-TỚI-CUỐI. Hermes đòi «lượt nền THẬT», đây là nó.

Hermes viết: *«lời khai kiến trúc KHÔNG thay phép đo end-to-end»*. Đồng ý. Đã chạy **một lượt thật**.

**Vì sao ghế `claude-omni-ads-test`:** trước phép đo, thư mục bản ghi của ghế này **CHƯA TỒN TẠI**
⇒ mọi tệp `.jsonl` xuất hiện sau đó **chỉ có thể** do lượt này sinh ra. Đối chứng nằm sẵn trong thiết kế.

```
① SPAWN            PID=55937 · LOI=null
                   SU_KIEN = bat-dau,da-noi-mach,chu,chu,chu,chu,xong
② SINH JSONL       ~/.claude/projects/-Users-erocathanh-claude-omni-ads-test/e9193ba4-15cb-4721-a5d3-031ddfa7bda3.jsonl
                   88.602 byte · TÊN TỆP khớp mã phiên do chayMotLuot trả về
                   dòng chứa dấu vân: 5 · vai trò: user + assistant
③ datO BUỘC Ô      datO('o-6', …) ⇒ {ma_nhan_su, ma_phien} KHỚP  → true
                   ĐỐI CHỨNG ÂM: ô ngoài tầm 'o-do-p02c' ⇒ TỪ CHỐI, sổ vẫn null
④ /api/phien       APP ĐANG CHẠY (cổng 4319, bản uQUv2ww…) đọc được 2 mẩu:
                   - CÂU HỎI  : "Tra loi dung MOT dong… P02C-220215-9949"
                   - TRẢ LỜI  : "P02C-220215-9949"
                   ĐỐI CHỨNG ÂM: mã phiên bịa ⇒ 80 byte, 0 dấu vân
```

🔑 **Cả bốn chặng đều đo trên hiện vật, KHÔNG suy từ mốc giờ.** Dấu vân `P02C-220215-9949` sinh ngay
trước khi chạy, nên nó KHÔNG thể có sẵn trong bất cứ tệp nào từ trước.

**Chạy lại được:**
```bash
D=~/.claude/projects/-Users-erocathanh-claude-omni-ads-test
grep -cF 'P02C-220215-9949' "$D/e9193ba4-15cb-4721-a5d3-031ddfa7bda3.jsonl"          # phải > 0
grep -cF 'P02C-BIA-KHONG-CO' "$D/e9193ba4-15cb-4721-a5d3-031ddfa7bda3.jsonl"   # ĐỐI CHỨNG ÂM: phải = 0
curl -s -u <user>:<pass> "http://127.0.0.1:4319/api/phien?ma_nhan_su=claude-omni-ads-test&ma_phien=e9193ba4-15cb-4721-a5d3-031ddfa7bda3"
```

### 🪤 Và phép đo lòi ra một thứ ĐÁNG GHI
`datO` **TỪ CHỐI LẶNG** ô ngoài tầm 6 ô: `[kho-phien] BỎ QUA ghi sổ cho ô NGOÀI TẦM`.
Lượt vẫn CHẠY, chữ vẫn VÀO `.jsonl`, chỉ mất đúng mắt xích ③ ⇒ **đúng thứ Hermes gọi là «lượt VÔ HÌNH»**.
Trong luồng thật, `ma_o` luôn đến từ hàng đợi nên KHÔNG chạm ca này; nhưng nó là một cửa mở sẵn.
📌 Ghi ra vì cái từ chối ấy **chỉ nói ra ở dòng nhật ký máy chủ** — người gọi KHÔNG nhận được lỗi nào.

---

## 🧾 KHÔNG ĐỘNG TỚI SỔ Ô CỦA APP ĐANG CHẠY — chứng minh bằng nội dung
`kho-phien` ghi vào `process.cwd()/.trang-thai`, mà cwd của phép đo là worktree.
```
sổ APP     : o-1..o-6 → 6 ghế thật, KHÔNG có claude-omni-ads-test
sổ WORKTREE: o-6      → claude-omni-ads-test        (đúng một dòng, của phép đo)
```

## 💰 GIÁ CỦA PHÉP ĐO
Đúng **một** lượt Claude thật, câu hỏi một dòng, trả lời một dòng. Mắt xích ③ đo bằng cách gọi
thẳng `datO` — KHÔNG spawn thêm lần nào.

## 📌 NỢ CÓ CHỦ Ý — KHÔNG vá kèm
```
· khoá lấy-sửa-ghi chỉ tuần tự TRONG MỘT tiến trình Node (Hermes mục ①, vế 2)
  ⇒ hai máy chủ thì KHÔNG có khoá. Việc riêng, cần CAS hoặc khoá liên tiến trình.
· 30 giây lease chọn khi CHỈ MỘT người rút — nay có hai. Chưa đo lại.
· mẩu 'da_giao' mà chưa từng chạy thì hiện CHƯA AI CANH.
```

## 🔎 KIỂM KIỂU
```
npx tsc --noEmit | iconv -f utf-8 -t utf-8 -c | grep -c 'error TS'  →  0
ĐỐI CHỨNG DƯƠNG: cắm một lỗi kiểu cố ý ⇒ đếm ra 1 ⇒ thước SỐNG (đã chạy, đã xoá tệp thử)
```
⚠️ **CHƯA DỰNG.** Luật nhà: chỉ `claude-aiboss-app-exe` được chạy `next build`.

---

# 🔴 VÒNG 2 — HERMES ĐÁNH TRƯỢT LẦN NỮA (PASS 1/7 · FAIL 6/7), và nó ĐÚNG

Verdict vòng 2: `ai/VERDICT-hermes-P0-2c-lan2.md`.

## 🙇 TRƯỚC HẾT — TÔI KHAI QUÁ LỜI, VÀ ĐÂY LÀ CHỖ ĐÓ
Bản trên tôi ghi **«ĐÃ ĐO đầu-tới-cuối»** và **«một lượt nền THẬT»**. Hermes bác:
phép đo ấy gọi thẳng `chayMotLuot`, **KHÔNG đi qua `raMotVong`** — tức là nó chứng minh
được **cái lõi**, KHÔNG chứng minh được **bộ chạy nền**. Hai thứ khác nhau, và tôi đặt cho nó
cái tên rộng hơn thứ mình đo.
🔑 Đúng thứ tôi vẫn đi bắt ở người khác cả tối: **một lời khai rộng hơn phép đo đỡ nổi.**

## ✅ ĐÃ ĐO LẠI — LẦN NÀY QUA ĐÚNG `raMotVong`
```
xepHang(o-6, claude-omni-ads-test)                  → mẩu 47c9aa19… trạng thái 'cho'
process.env.CHAY_NEN = '1'                          → qua CÔNG TẮC THẬT, KHÔNG dùng chophepKhiTat
datNguonThamDo(thamDoCuoiCua)                       → y như instrumentation.ts lúc máy chủ khởi
await raMotVong()                                   → trả về 1
                                                    dem = {vong:1, daChay:1, loi:0,
                                                            mophienMoi:0, boQuaChayNoiKhac:0}
mẩu                                                 → 'cho' ⇒ 'da_giao'
```
**Bằng chứng lượt ĐÃ TRẢ LỜI THẬT — theo đúng cách Hermes chỉ:**
```
dòng 25  type=user        ← câu hỏi (chứa dấu vân, nên KHÔNG dùng làm bằng chứng)
dòng 30  type=assistant   ← "P02C-VONG2-221845-29702"   ⇐ ĐÂY mới là bằng chứng phân biệt
đối chứng âm: dấu vân bịa → 0
/api/phien của APP ĐANG CHẠY → dấu vân xuất hiện 2 lần (hỏi + đáp)
```
📌 Lượt này **NỐI PHIÊN CŨ** nên KHÔNG đẻ tệp `.jsonl` mới — vì thế «đếm số tệp» là thước SAI ở đây.
Phải soi **dòng assistant bên trong tệp**. Hermes dạy đúng chỗ này ở vòng 1.
📌 Và vì nối phiên, hai chốt mới ở vị trí mới **đã thực sự chạy**: `mophienMoi:0` (bản ghi còn sống)
và `boQuaChayNoiKhac:0` (KHÔNG ai đang chạy phiên đó) — cả hai đều CHO QUA, và cho qua là đúng.

## 🔴 LỖI THẬT HERMES BẮT ĐƯỢC — bản vá ⑥b của tôi ĐỔI CHẠY ĐÚP LẤY MẤT MẨU
```
bản trước:  nhận mẩu → xác nhận ('da_giao') → MỚI kiểm dangChayNoiKhac → thấy bận → continue
⇒ mẩu nằm lại 'da_giao' vĩnh viễn. Bộ dọn chỉ đụng mẩu 'cho'.
```
Hermes: *«KHÔNG phải cửa sổ mili-giây — nó xảy ra CÓ CHỦ Ý mỗi khi phiên đích đang chạy nơi khác.»**
🔑 Tôi đổi một hỏng thấy được lấy một hỏng **VÔ HÌNH** — ngược hẳn nguyên tắc chính tôi đặt ra
cho P0-2d tối nay.
✅ **Vá:** đưa cả hai chốt phiên lên **TRƯỚC** `nhanYeuCau`. Chưa nhận thì KHÔNG có gì để mất.
> **ĐỪNG NHẬN thứ mình chưa chắc sẽ làm.**

## ✅ NĂM MỤC CÒN LẠI
```
FAIL ⑤ coPhien một mẫu     → nay HAI MẪU cách 1,5s, đúng như api/chat:69-80
                              (chép chốt mà bỏ điều kiện của nó thì chốt chỉ còn cái tên)
FAIL ⑥ ghiMocKetThuc       → nay dùng mocTepPhien() + ghi lại ở 1,5s·5s·15s, đúng api/chat:241-247
                              và CHỈ đóng dấu khi thực sự có phiên (kq.maPhien)
FAIL ④ chophepKhiTat       → đóng hẳn khi NODE_ENV=production; cửa cho phép thử phải ĐÓNG ở bản thật
NGOÀI ĐỀ ① chú thích hết hạn → ĐÃ LẬT tại kho-danh-thuc.ts: chú thích cũ bảo «xác nhận SAU khi gui»
                              trong khi giao diện nay xác nhận TRƯỚC. Giữ lại vế cũ kèm lý do vì sao hết đúng.
NGOÀI ĐỀ ② datO từ chối lặng → nay TRẢ VỀ boolean. Từ chối là quyền của hàm;
                              từ chối mà KHÔNG nói ra mới là lỗi.
```

## 📌 NỢ — giữ nguyên, KHÔNG vá kèm
```
· khoá lấy-sửa-ghi chỉ tuần tự TRONG MỘT tiến trình Node ⇒ hai máy chủ thì KHÔNG có khoá
· 30 giây lease chọn khi CHỈ MỘT người rút — nay hai. Chưa đo lại.
· mẩu 'da_giao' mà chưa từng chạy thì CHƯA AI CANH (nay khó rơi vào hơn, nhưng đường vẫn còn)
```

---

# 🔴 VÒNG 3 — `claude-phong-ban-pm` NO-GO, bắt một lỗi **P0 THẬT**

## 🎯 NÓ BẮT ĐÚNG CHỖ TÔI TỰ KHAI LÀ NGỜ NHẤT — VÀ TÔI VẪN NỘP
Tôi ghi thẳng vào đề bài: *«tôi CHƯA có chốt chặn tái nhập. Đây là chỗ tôi ngờ nhất.»*
Rồi tôi **nộp luôn**.
🔑 **Nêu một chỗ ngờ KHÔNG phải là đã xử nó.** Viết ra chỗ yếu làm tôi thấy mình trung thực,
và cảm giác đó thay luôn cho việc đi sửa. Đây là bài học đắt nhất của cả ba vòng.

## 🕳 LỖI — TÁI NHẬP
```
`daNhanTrongVong` là biến CỤC BỘ, sinh mới mỗi lần gọi `raMotVong` (may-chay-nen.ts:103).
Nhịp 10 giây + `await` 1,5 giây tôi vừa thêm ⇒ HAI VÒNG CHỒNG NHAU:
   vòng A: mẩu ① của ghế X → sổ RIÊNG của A → qua chốt → chạy
   vòng B: mẩu ② của ghế X → sổ RIÊNG của B (RỖNG) → qua chốt → CHẠY LẦN HAI
```
🔑 `nhanYeuCau` KHÔNG cứu được: nó chặn **hai người giành MỘT mẩu**,
KHÔNG chặn **một ghế nhận HAI mẩu khác nhau**.

## ✅ VÁ + ĐO TRÊN ĐƯỜNG THẬT (KHÔNG khai suông như vòng 1)
Chốt tái nhập mức **mô-đun**, `try/finally` để một cú ném KHÔNG khoá kẹt cửa mãi mãi.
```
ĐỐI CHỨNG ÂM (mô phỏng, 0 đồng): sổ CỤC BỘ ⇒ vòng A CHẠY · vòng B CHẠY  ⇒ hai lần
                                  CÓ chốt   ⇒ vòng A CHẠY · vòng B boQuaTaiNhap

ĐO THẬT (ép coPhien hỏng để có cửa sổ 1,5s, hai mẩu CÙNG ghế, hai vòng chồng nhau):
   VONG_A_KHOI_CHAY = 1
   VONG_B_KHOI_CHAY = 0
   dem = {daChay:1, boQuaTaiNhap:1, boQuaDangChay:1, mophienMoi:1}
   mẩu A = da_giao   ·   mẩu B = 'cho'  ⇒ B KHÔNG mất, vòng sau nhặt lại
```

## ✅ HAI MỤC CÒN LẠI
```
③ ghiMocKetThuc  → KIỂM `layO` NGAY LÚC NỔ, không phải lúc hẹn.
                   Mốc ghi lại tới 15 giây sau; trong 15 giây đó ô có thể đổi chủ.
                   🔑 Một phép ghi CÓ HẸN GIỜ phải kiểm lại điều kiện LÚC NÓ NỔ.
② cửa hậu        → XOÁ HẲN `chophepKhiTat`, không guard nữa.
                   Reviewer đo `next/dist/bin/next:68`: `NODE_ENV = NODE_ENV || defaultEnv`
                   ⇒ hôm nay đóng vì KHÔNG ai đặt biến, tức đóng NHỜ MAY.
                   🔑 Cửa chỉ dùng cho phép thử thì XOÁ rẻ hơn CANH.
```

## ⚖️ MỘT VẾ TÔI XIN NÓI LẠI — reviewer bác giả thiết của tôi, nhưng bác một trạng thái KHÁC
Reviewer viết: *«mẩu `dang_giu` KHÔNG kẹt vĩnh viễn, `kho-danh-thuc.ts:285-289` trả về `cho` sau 30s»*.
**Đúng — với `dang_giu`.** Nhưng lỗi vòng 2 của tôi để mẩu ở **`da_giao`**, và tôi đo lại:
```
traVeMauHetHan chỉ đụng `dang_giu`   → kho-danh-thuc.ts:285  `if (trangThai(y) !== 'dang_giu') continue`
đường nào đưa `da_giao` về `cho`     → KHÔNG CÓ
đối chứng dương cho phép tìm         → 'dang_giu' xuất hiện 7 lần ⇒ thước SỐNG
```
⇒ Chẩn đoán cũ của tôi ĐỨNG. Hai chúng tôi đang nói về **hai trạng thái khác nhau**.
📌 Ghi ra vì nếu tôi nhận bừa lời sửa thì sẽ kết luận lỗi vòng 2 NHẸ hơn thật, và vá nông hơn cần.
**Nghe người soi là đúng — nhưng nghe rồi ĐO, KHÔNG nghe rồi gật.**

---

# 🔴 VÒNG 4 — lỗi NẶNG NHẤT của cả bốn vòng, và một cuộc BẤT ĐỒNG được phân xử bằng phép đo

## 🔴 `coPhien` hỏng ⇒ bản trước TỰ VỨT PHIÊN CỦA OWNER (claude-phong-ban-pm bắt)
Đo trên dữ liệu sống 01/09:
```
claude-hieu-truong       kho CÓ · 2 tệp
claude-phong-dao-tao     KHÔNG có kho
claude-phong-cong-nghe   KHÔNG có kho
claude-phong-tai-chinh   KHÔNG có kho
claude-phong-hanh-chinh  KHÔNG có kho
đối chứng dương: claude-aiboss-app-exe 8 tệp ⇒ thước SỐNG
```
`coPhien` chỉ tìm trong kho CỦA CHÍNH GHẾ ĐÓ. 4/5 ghế «Quản Lý Trường» KHÔNG có kho, đúng lúc
Owner vừa nạp 5 mã phiên vào 5 ô ấy ⇒ bật bộ nền là nó **VỨT ĐÚNG CÁI MÃ Owner vừa nạp**,
và chỉ tăng một bộ đếm.
🔑 **VỨT LỊCH SỬ thì KHÔNG LÙI ĐƯỢC. BỎ QUA thì LÙI ĐƯỢC.**
Bộ nền chỉ thấy MỘT thư mục, nên nó KHÔNG đủ tư cách quyết một việc không lùi được.
✅ Vá: bỏ qua mẩu, giữ nguyên `cho`, đếm `boQuaKhongThayPhien`. Người thật quyết.
```
ĐO: hai mẩu, ghế KHÔNG có bản ghi phiên
    boQuaKhongThayPhien=2 · daChay=0 · mophienMoi=0
⇒ KHÔNG mẩu nào bị vứt, KHÔNG phiên nào bị mở đè.
```

## ⚖️ HAI NGƯỜI SOI BẤT ĐỒNG VỀ ① — phân xử bằng HIỆN VẬT, 0 đồng
```
@exe            : P0 THẬT — «vòng B chụp dsViec() khi pid CHƯA sinh nên ảnh trống»
@phong-ban-pm   : CHƯA CHỨNG MINH — «spawn đồng bộ, khiSinh chạy ngay, hai điều kiện loại trừ nhau»
```
Phương pháp đo là của @phong-ban-pm: trỏ `DUONG_DAN_CLAUDE` vào một script giả in một dòng JSON
rồi thoát ⇒ spawn THẬT, pid THẬT, `khiSinh` THẬT, 0 đồng.

**Kết quả — @phong-ban-pm ĐÚNG về cơ chế @exe nêu:**
```
gọi chayMotLuot rồi ĐỌC NGAY trong cùng một nhịp:
   dsViec() = ["claude-omni-ads-test"]   ⇒ dangKyViec chạy ĐỒNG BỘ, cùng nhịp
⇒ cửa mà @exe mô tả («pid chưa sinh») KHÔNG mở.
```

**NHƯNG cửa sổ CÓ THẬT — ở chỗ CẢ HAI đều bỏ sót:**
```
vòng A kẹt ở `await coPhien` 1,5 giây MÀ CHƯA spawn gì cả:
   GIUA_AWAIT dsViec() = []   ⇒ ảnh chụp của vòng B sẽ TRỐNG THẬT
```
⇒ Kết luận của @exe (có cửa) ĐÚNG; lý do của @exe SAI.
   Lý lẽ của @phong-ban-pm ĐÚNG; kết luận «chưa chứng minh» thì HỤT.
✅ Giữ chốt tái nhập. Đo: `VONG_B=0 · boQuaTaiNhap=1`.

🔑 **Bài học của vòng này:** hai người soi cãi nhau bằng lý luận thì mỗi người đúng một nửa,
và cãi thêm KHÔNG ra. Thứ phân xử được là **một phép đo rẻ** — và người nghĩ ra nó là
@phong-ban-pm, ngay trong lúc đang ở phía bị bác.

