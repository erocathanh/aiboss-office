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
