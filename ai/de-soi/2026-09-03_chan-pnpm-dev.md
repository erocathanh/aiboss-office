# ĐỀ SOI → reviewer · CHẶN `pnpm dev` GIẾT APP THẬT

> Người viết: `claude-aiboss-app-exe` · 03/09/2026 · điều phối: `claude-aiboss-app-pm`
> **CHƯA dựng, CHƯA commit, CHỈ MỤC RỖNG.** Đi đường chính theo luật ②×④: soi ĐẠT rồi tôi mới build+commit.

## 🔒 NEO BẰNG BĂM — verdict chỉ có hiệu lực với ĐÚNG ba bản này
```
next.config.mjs                a8529959986587b7fa6e42928f7d839c
package.json (VÒNG 3)          e37daece0fea457004756cb6b96e15b8
dev/chay-dev.sh                adde16a05d827e25111d7e7c60c63d23
bai-thu/thu-chot-next-dev.mjs  de3969138030ca99e454d7537d7c5466
```
**VÒNG 2** — sau verdict NO-GO 04/09 (PASS 4/7). Ba tệp đầu ĐÃ ĐỔI so với vòng 1.
Tôi sửa bất kỳ tệp nào sau lúc này thì verdict **hết hiệu lực với phần sửa**. Băm chứng minh
«CHƯA ĐỔI», nó **KHÔNG** chứng minh «ĐÃ ĐỌC».

## 🕳 CA THẬT — tôi gây ra, 03/09/2026
`next dev` **XOÁ SẠCH `.next`** mà cổng 4319 đang phục vụ. Đo lúc đó: **8/8 tài nguyên HTTP 400,
`BUILD_ID` biến mất.** App vẫn trả HTML 200 nên **nhìn từ ngoài KHÔNG giống một cái hỏng** —
Owner tả là «app load chậm, gõ chữ giật, đành gõ không dấu».

`package.json` có `"dev": "next dev -p 4319"` ⇒ **gõ `pnpm dev` là làm đúng việc đó.**

## 🔑 SỬA ĐỔI CỔNG LÀ KHÔNG ĐỦ — `claude-aiboss-app-pm` bắt đúng chỗ này
Đề xuất đầu của tôi là đổi cổng. Sai. Chứng minh ở mức mã:
```
distDir: process.env.NEXT_DIST_DIR || '.next'      ← CỔNG không hề tham gia
⇒ `next dev -p 4320` mà thiếu NEXT_DIST_DIR VẪN xoá sạch `.next`
```
Biến cách ly là **`distDir`**, KHÔNG phải **cổng**.

## 🧱 BẢN VÁ HAI LỚP

**Lớp ① — lối tắt dẫn tới ĐƯỜNG AN TOÀN** (`package.json`)
```
"dev": "next dev -p 4319"   →   "dev": "bash dev/chay-dev.sh"
```
Số script còn chứa `next dev` trần: **0** (bản gốc: 1 — thước biết đếm).
Tôi **KHÔNG** giữ lối thoát kiểu `"dev-nguy-hiem-4319"`: một khẩu súng đã lên đạn để trong ngăn
kéo có dán nhãn vẫn là một khẩu súng đã lên đạn.

**Lớp ② — CHỐT CỨNG** (`next.config.mjs`): đổi cấu hình từ object sang **hàm nhận `phase`**,
rồi `throw` khi `phase === 'phase-development-server' && distDir === '.next'`.
📌 Vì sao cần lớp ②: lớp ① chỉ đổi **đường đi**. Ai gõ thẳng `npx next dev` vẫn vào đường chết.
**Một dòng luật KHÔNG có gì ép thì nó là LỜI HỨA, KHÔNG phải cơ chế.**

## 🔬 BẰNG CHỨNG

**A. Bảng sự thật ĐỦ CA của chốt** — gọi thẳng hàm cấu hình, KHÔNG dựng máy chủ ⇒ rủi ro 0.
Nhóm «KHÔNG được chặn» chạy TRƯỚC, vì chặn nhầm là hỏng nặng hơn:
```
phase-production-build   NEXT_DIST_DIR=(trống)   ⇒ QUA   distDir=.next     ← next build PHẢI qua
phase-production-server  NEXT_DIST_DIR=(trống)   ⇒ QUA   distDir=.next     ← next start PHẢI qua
phase-development-server NEXT_DIST_DIR=.next-dev ⇒ QUA   distDir=.next-dev ← đường an toàn
phase-export             NEXT_DIST_DIR=(trống)   ⇒ QUA
phase-development-server NEXT_DIST_DIR=(trống)   ⇒ CHẶN                    ← pnpm dev / npx next dev
phase-development-server NEXT_DIST_DIR=.next     ⇒ CHẶN                    ← ai CỐ TÌNH ép
                                                    6/6 · mã thoát 0
```
Chạy lại: `node /tmp/thu-chot.mjs` (kịch bản kèm trong tin kênh 16:4x).

**B. Đầu-cuối: gõ đúng `pnpm dev` như cả đội vẫn gõ**
```
TRƯỚC : BUILD_ID dsB9ZPkvL8-ANhGjhy-4f · 162 tệp .next/static · 4319 pid 83378
pnpm dev ⇒ dựng vào .next-dev · 4320 trả 200 · 179.718B · chốt KHÔNG bắn · 0 EvalError
SAU   : BUILD_ID dsB9ZPkvL8-ANhGjhy-4f · 162 tệp .next/static · 4319 pid 83378
app thật: 0 tài nguyên khác 200
```

**C. Bản vá kèm theo trong `dev/chay-dev.sh`** — `NODE_ENV=development`.
Ghế AI chạy BÊN TRONG app nên thừa kế `NODE_ENV=production` của máy chủ mẹ ⇒ `next dev` sinh mã
kiểu `eval` ⇒ edge runtime cấm ⇒ 500 mọi đường. Nhân quả hai chiều, cùng script cùng điều kiện:
`production` ⇒ 500 · 1 EvalError · `development` ⇒ 200 · 0.

## ❓ XIN SOI KỸ BỐN CHỖ — đây là chỗ tôi thấy gờn gợn, hỏi đích danh cho rẻ

1. **Đổi `next.config.mjs` từ object sang hàm** — Next 15.5.4 có nhận hàm ở dạng ESM `export default`
   thật KHÔNG, ở MỌI pha? Tôi mới thử bằng cách gọi tay, **CHƯA chạy `next build` thật.**
   ⚠️ Trớ trêu: `next.config.mjs` VỠ CÚ PHÁP chính là ca 18/08 đẻ ra cổng dựng này.
2. **Chốt có chặn nhầm pha nào tôi chưa nghĩ ra KHÔNG?** Tôi liệt 4 pha. Next có pha nào khác
   mà `distDir` vẫn phải là `.next`?
3. **Bỏ hẳn lối thoát nguy hiểm** có đúng KHÔNG, hay đội cần một đường gõ `next dev` vào `.next`
   trong tình huống nào đó tôi chưa lường?
4. **Thông điệp lỗi** — nó có đủ rõ để người gõ nhầm biết phải làm gì tiếp, hay chỉ làm họ bực?

## 🚫 CHỖ CHƯA PHỦ ĐƯỢC — đọc trước khi ra verdict
```
· CHƯA chạy `next build` với cấu hình mới. Luật ② cấm tôi dựng khi chưa có verdict ⇒ vòng này
  KHÔNG có bằng chứng build. Đây là chỗ hở LỚN NHẤT của gói này, tôi nêu thay vì giấu.
· Chốt chỉ đọc `phase` do Next truyền vào. Nếu Next đổi tên chuỗi pha ở bản sau thì chốt IM LẶNG
  hết tác dụng — hỏng đúng kiểu tệ nhất.
· Bản dev mới chỉ đo bằng curl, CHƯA mở bằng trình duyệt thật.
· `postbuild` trong package.json vẫn KHÔNG BAO GIỜ chạy (nhà dựng bằng `npx next build`).
  Tôi KHÔNG đụng — ngoài phạm vi.
```


---

# VÒNG 2 — vá theo verdict NO-GO 04/09

## Câu 2 (CHƯA ĐẠT → đã vá): so ĐƯỜNG DẪN, KHÔNG so chuỗi
Vòng 1 chốt `thuMucDung === '.next'`. Reviewer thử bốn cách gõ khác cùng trỏ một chỗ, cả bốn LỌT.
🔑 **Cổng canh cái TÊN, trong khi thứ gây hoạ là cái CHỖ.**
```js
const gocDuAn = path.dirname(fileURLToPath(import.meta.url));
if (phase === 'phase-development-server'
    && path.resolve(gocDuAn, thuMucDung) === path.resolve(gocDuAn, '.next')) throw …
```
⚠️ Giải theo **thư mục chứa tệp cấu hình**, KHÔNG theo `process.cwd()`: `dev/chay-dev.sh` chạy
`next dev` từ thư mục KHÁC rồi truyền gốc dự án làm tham số ⇒ lấy `cwd` là so nhầm chỗ.

**Bảng sự thật 18/18** (`node bai-thu/thu-chot-next-dev.mjs`, mã thoát 0):
```
CÂU 3 giữ nguyên ĐẠT: build · start · export · info · test     ⇒ QUA  (5/5)
                      build với "./.next"                      ⇒ QUA
ĐỐI CHỨNG ÂM        : .next-dev · ./.next-dev · .next-dev/     ⇒ QUA  (3/3)
CÂU 2, NĂM cách reviewer dùng:
  .next · ./.next · .next/ · .next/. · .next//                 ⇒ CHẶN (5/5)
BỐN cách tôi tự thêm:
  bai-thu/../.next · đường tuyệt đối · biến trống · chuỗi rỗng ⇒ CHẶN (4/4)
```

## Câu 5 (CHƯA ĐẠT → đã vá): `dev/chay-dev.sh` tự bảo vệ
🔑 **Một cái phanh duy nhất KHÔNG phải hai lớp bảo vệ — nó là một điểm chết dùng chung.**
Script nay tự giải đường dẫn và tự từ chối, KHÔNG hỏi config.
```
DIST_DEV = .next · ./.next · .next/ · .next/. · .next// · bai-thu/../.next
   ⇒ mã thoát 1, có in lý do   (6/6)
ĐỐI CHỨNG ÂM: DIST_DEV=.next-dev ⇒ chốt KHÔNG chặn nhầm (0 lần)
```

## Câu 7 (CHƯA ĐẠT → vá MỘT PHẦN, tôi nói rõ)
Tôi **KHÔNG có log của reviewer** nên KHÔNG biết «hai đường» kia là hai đường nào.
Tôi tự đo ba đường mình nghĩ ra, cả ba hỏng về phía an toàn:
```
① npx next dev TRẦN trong kho  ⇒ mã thoát 1 · in đủ lý do · KHÔNG in "Ready" trước khi nổ
② pnpm dev với DIST_DEV=.next  ⇒ mã thoát 1 · ELIFECYCLE
③ python3 biến mất khỏi PATH   ⇒ hai biến cùng RỖNG ⇒ bằng nhau ⇒ CHẶN (hỏng phía an toàn)
```
🔴 **XIN REVIEWER CHO ĐÍCH DANH HAI ĐƯỜNG ĐÓ.** Vá ba đường tôi tự nghĩ ra KHÔNG có nghĩa
tôi đã vá đúng hai đường reviewer thấy. **Trùng số lượng KHÔNG phải trùng chỗ.**

## Đo lại cây sau MỌI phép thử (các phép trên có chạm `next dev` thật)
```
BUILD_ID dsB9ZPkvL8-ANhGjhy-4f · 162 tệp .next/static · 4319 pid 83378  — y nguyên
tài nguyên app thật KHÔNG trả 200: 0
```

## Còn nguyên trạng
```
CHƯA next build · CHƯA commit · CHỈ MỤC RỖNG — vẫn theo luật ②×④
```

## Chỗ chưa phủ được (thêm ở vòng 2)
```
· path.resolve KHÔNG đi qua liên kết mềm. Ai trỏ NEXT_DIST_DIR vào một liên kết mềm
  chỉ về .next thì vẫn lọt. Chưa vá — cần realpath, mà thư mục có thể chưa tồn tại.
· Câu 7 mới vá ba đường TÔI nghĩ ra, chưa đối chiếu với log reviewer.
```


---

# VÒNG 3 — câu 7(b): postbuild nuốt lỗi

## Đã vá
```
TRƯỚC:  … > .next/COMMIT 2>/dev/null || true
SAU  :  … > .next/COMMIT
```
**Nghiệm thu, chạy thân postbuild THẬT trong thư mục tách biệt, âm trước dương:**
```
ghi vào chỗ KHÔNG ghi được ⇒ mã thoát 1   ← bản cũ LUÔN ra 0
ca bình thường             ⇒ mã thoát 0
```

## 🔴 NHƯNG SỐ ĐO NÓI MỘT CHUYỆN NẶNG HƠN REVIEWER MÔ TẢ
Reviewer viết: *«postbuild VẪN trả thành công khi hỏng»*. Đúng. Nhưng đo tiếp:
```
③ luật nhà dựng bằng `npx next build` — gọi THẲNG nhị phân, KHÔNG qua script gói
   ⇒ postbuild KHÔNG BAO GIỜ chạy trên đường dựng của nhà
④ khuôn postbuild sinh ra : dòng 1 = <sha đầy đủ> · dòng 2 = '# BUILD_ID: …'
   khuôn .next/COMMIT có   : dòng 1 = '# COMMIT-DUNG-TU: …'
   ⇒ HAI KHUÔN KHÁC NHAU ⇒ tệp trên đĩa do NGƯỜI GÕ TAY, KHÔNG do postbuild
```
🔑 Nên `postbuild` KHÔNG phải «một cơ chế nuốt lỗi» — nó là **một cơ chế chưa từng chạy**.
Bỏ `|| true` là đúng, nhưng nó **KHÔNG đổi gì trên thực tế**.
📌 **Cái nguy hơn cái lỗi: ai đọc `package.json` sẽ tin dấu vết bản dựng được sinh TỰ ĐỘNG,
trong khi nó là một bước GÕ TAY, và bước ấy bị MỌI lần dựng xoá đi.**
Một dòng cấu hình ai cũng đọc thấy mà KHÔNG ai gọi thì nó là LỜI HỨA, KHÔNG phải cơ chế.

## Tôi TÁCH việc, và nói RA thay vì để trôi
```
TRONG phạm vi, đã làm : bỏ `2>/dev/null || true` (package.json vốn đã nằm trong bộ thay đổi này)
NGOÀI phạm vi, KHÔNG tự làm: cho dấu vết sinh TỰ ĐỘNG — phải đổi lệnh dựng của nhà,
  mà «chỉ exe được chạy next build» + «dựng bằng npx next build» là luật nhà. ⇒ xin PM/Owner chốt.
```

## PHẠM VI THẬT của cây (reviewer nêu verdict chỉ phủ 6 tệp)
```
tracked đã sửa: 7  — ai/MASTER-PLAN.md · ai/PROTOCOL-review-hash.md · chon-mau/vercel.json
                     dev/chay-dev.sh · next.config.mjs · package.json · tsconfig.json
untracked     : 5  — ai/de-soi/ · bai-thu/thu-chot-next-dev.mjs · chon-mau/.vercelignore
                     chon-mau/deploy-internal.sh · chon-mau/round-4.html
chỉ mục       : 0
```
⚠️ `ai/MASTER-PLAN.md` và `chon-mau/*` KHÔNG phải của bản vá này. Verdict nên nói rõ nó phủ tệp nào.
