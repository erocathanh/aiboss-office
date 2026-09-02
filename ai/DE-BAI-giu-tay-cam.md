# ĐỀ BÀI — GIỮ TAY CẦM, THÔI GIỮ SỐ HIỆU

> 📅 02/09/2026 · soạn bởi `claude-aiboss-app-pm` sau lệnh đảo hướng của Owner
> («hướng ta đang đi là sai, đào sâu thêm hố sai»).
> ⚠️ **ĐỌC MỤC ① TRƯỚC MỤC ②.** Mục ① nói GIỮ GÌ. Ai đọc mục ② trước sẽ đập nhầm.

---

## ① 🔒 GIỮ NGUYÊN — KHÔNG được đụng. Năm thứ này KHÔNG dính tới số-hay-tay-cầm.

Chúng là kết quả của sáu vòng soi hôm nay, mỗi thứ đã trả giá để tìm ra:
```
1. XOÁ SỔ theo sự kiện `close` của tiến trình con, KHÔNG theo lúc luồng xem đứt
   (chay-agent.ts:373 → khiChet)          ⇐ đây là gốc bệnh cả ngày, câu ⑥
2. KHÔNG ghi đè MÙ lên dòng của một tiến trình còn sống — phải kêu, và kêu tới chỗ Owner THẤY
   🔴 SAU KHI ĐỔI, mục này lên hạng «quan trọng» → **BẮT BUỘC**: mất một SỐ thì mất một con số;
      mất một TAY CẦM thì app VĨNH VIỄN KHÔNG dừng được tiến trình đó nữa (exe đo 14:35).
3. KHOÁ THEO Ô cho đường sinh tiến trình (datCho / traCho, nhả ở ba chỗ)
4. CỔNG viết theo danh sách ĐƯỢC QUA, KHÔNG theo danh sách bị chặn
   ⇒ trạng thái mới thêm sau này MẶC ĐỊNH bị chặn
5. `vi_sao` đủ ba chặng (sinh · chở · đọc) · chốt vét `never` · chốt `finally` trả cờ về BẬT
   khi KHÔNG có bằng chứng dương là đã dừng
```
📌 Mục 5 **thu nhỏ chứ KHÔNG biến mất**: số mã lý do giảm, nhưng cơ chế ba chặng và chốt vét giữ nguyên.

---

## ② 🔄 ĐỔI — thay danh tính bằng TAY CẦM

**Gốc, đo được, một dòng:**
```
chay-agent.ts:234   const tien = spawn(...)                 ⇐ tay cầm CÓ SẴN
chay-agent.ts:266   if (tien.pid) ts.khiSinh?.(tien.pid);   ⇐ VỨT tay cầm, chuyền cái SỐ
```

**Việc:**
```
· `khiSinh` nhận TAY CẦM (đối tượng con), KHÔNG chỉ nhận số
· 🔴 GIỮ NGUYÊN chốt `if (tien.pid)` ở chay-agent.ts:266 — nó đang che một ca THẬT:
     spawn một lệnh KHÔNG tồn tại ⇒ pid=undefined · exitCode=null · signalCode=null
     ⇒ phép «còn sống» dưới đây trả TRUE ⇒ ghi vào sổ một DÒNG MA khai «đang chạy»
     (`claude-aiboss-app-exe` đo 02/09 14:35). Và ca `error` phải GỠ dòng sổ.
· dòng sổ giữ tay cầm. Trường `pid` ĐỔI TÊN thành `pid_de_hien_thi`
  🔑 đổi tên là một phần của việc, KHÔNG phải chuyện thẩm mỹ: sau khi đổi, mọi chỗ dùng
     số hiệu để RA QUYẾT ĐỊNH sẽ đọc lên thấy sai ngay. Cái tên làm việc canh gác.
· còn sống?  →  `tien.exitCode === null && tien.signalCode === null`   (KHÔNG gọi `ps`)
· dừng?      →  `tien.kill('SIGTERM')`
· hai cửa sinh (chat/route.ts:301 · chay-mot-luot.ts:146) đều phải chuyền tay cầm
  ⇒ khai trường KHÔNG có dấu `?` để `tsc` chặn cửa nào quên — đúng cách đã hiệu quả với `vi_sao`
```

**XOÁ được (kiểm lại từng cái, đừng xoá theo trí nhớ):**
```
docTienTrinh · mọi lời gọi `ps` · LC_ALL/TZ ghim · so `lstart`/`etime` · ngưỡng lệch giờ
bốn dấu vân (ppid · comm · argv · tuổi) · phần danh tính trong `xacMinhDong`
mã lý do `dau_van_lech`
```

**PHẢI XEM LẠI TỪNG CÁI, KHÔNG xoá tự động:**
```
· so_tu_mau_thuan (:373)  GIỮ phép kiểm, đổi thứ đem so — NHƯNG ĐỔI HẠNG.
                          🔴 Sau khi đổi, nhánh này chỉ chạy khi MÃ CỦA CHÍNH TA hỏng ⇒ gần như
                          KHÔNG BAO GIỜ ⇒ theo luật «nhánh chạy 0 lần thì chưa nghiệm thu được»,
                          để nguyên hình dạng cũ là tự tạo một nhánh VĨNH VIỄN không kiểm chứng được.
                          ⇒ Nó thôi làm một mã lý do bình thường gửi Owner. Nó thành CHỐT TỰ KIỂM:
                            chạy vào đó ⇒ `console.error` kêu to («sổ tự mâu thuẫn — LỖI CỦA APP»)
                            VÀ vẫn chặn. Chặn thì Owner thấy ⇒ nó KHÔNG im lặng.
· selfVaToTien (:503)     loại chính mình + tổ tiên. Với tay cầm thì ca đó KHÔNG dựng được nữa
                          ⇒ nhiều khả năng bỏ được. ĐO rồi hãy bỏ, đừng suy.
· xinBoQua (:122)         đường thoát có chủ ý, đang so `cu.pid === pid` ⇒ đổi sang so tay cầm.
· /api/dung trả `pid`     GIỮ. Owner cần con số để tự gõ `kill <pid>`. Đây là dùng để HIỂN THỊ,
                          hợp lệ — và là lý do trường kia tên `pid_de_hien_thi`.
```

---

## ③ ⚠️ THỨ ĐỔI HƯỚNG NÀY **KHÔNG** CHỮA — nói trước, đừng để tưởng đã xong
```
· 🔴 KHÔNG được viết «tay cầm MIỄN NHIỄM hoàn toàn với pid tái cấp». Câu ĐÚNG là:
  **KHÔNG BAO GIỜ BẮN NHẦM — chứ KHÔNG phải LUÔN BIẾT ĐÚNG.**
  Đo (exe, 14:35): ngay sau spawn và TRƯỚC sự kiện `close`, `exitCode` vẫn `null`
  ⇒ tay cầm khai «SỐNG» trong khi con có thể ĐÃ chết. Cửa sổ ấy hỏng về phía AN TOÀN
  (giữ cờ, giữ dòng sổ) nên nó KHÔNG chặn hướng này — nhưng nó có thật.
· 🔴 `/api/fork` ĐỨNG NGOÀI PHANH. Đo: `fork/route.ts` chạm sổ tiến trình **0 dòng**
  (đối chứng dương: `chat/route.ts` = 6 dòng ⇒ thước sống). Nó `spawn` rồi tự hẹn `SIGTERM` sau 180s.
  ⇒ Phanh chính của đề này là «khai trường KHÔNG có dấu `?` để `tsc` chặn cửa nào quên chuyền tay cầm».
     **`tsc` KHÔNG nhìn thấy một cửa KHÔNG gọi `dangKyViec`.** Nên sau khi làm xong, `tsc` sẽ XANH
     trong khi vẫn còn MỘT đường sinh tiến trình đứng ngoài sổ.
  ⚠️ **Đừng đọc phanh xanh thành «mọi cửa đã được máy giữ».** (`claude-phong-ban-pm` bác 02/09 15:05,
     tôi đo lại và nhận.)
  📌 Cho fork vào sổ là việc RIÊNG, đã xếp hàng: sổ khoá theo Ô mà fork KHÔNG có ô ⇒ phải quyết một
     cách đánh khoá trước, KHÔNG phải một dòng.
  🟢 Tin tốt: `fork/route.ts:77-86` **ĐÃ giữ tay cầm và giết bằng tay cầm** — tức trong chính kho này
     đã có một cửa làm đúng kiểu ta sắp làm. Dùng nó làm mẫu, đừng dựng lại từ đầu.
· 🔗 Ba lỗ khác `claude-phong-ban-pm` nộp 14:32 (bộ chạy nền khác trục khoá · `matKetNoi` · luồng đứt)
  KHÔNG nằm trong đề này — chúng đã ghi ở `ai/MASTER-PLAN.md` mục 4y (điều kiện B0) và 4s.
  Ghi con trỏ ở đây để đề bài KHÔNG tự đọc thành «hết lỗ».
· CHÁU: `tien.kill()` chỉ với tới con, KHÔNG với tới tiến trình cháu do con sinh ra.
  ⚠️ Mã HÔM NAY cũng KHÔNG với tới (nó `process.kill(v.pid)`), nên đây KHÔNG phải bước lùi —
     nhưng cũng KHÔNG phải thứ được chữa. Giết theo NHÓM là việc XẾP HÀNG riêng.
· Sổ vẫn CHẾT khi máy chủ khởi động lại (Map trong bộ nhớ). Không đổi.
```
📌 Ghi ra để lần sau KHÔNG ai viết vào tài liệu rằng «nút Dừng đã kín».

---

## ④ ĐỐI CHỨNG BẮT BUỘC — hai chiều, thiếu vế nào thì chưa nghiệm thu
```
① tay cầm SỐNG   ⇒ exitCode null · signalCode null · kill ⇒ tiến trình chết THẬT (đo lại bằng ps)
② tay cầm CHẾT   ⇒ exitCode KHÁC null ⇒ KHÔNG bắn, và KHÔNG khai là đã bắn
③ ĐỐI CHỨNG ÂM   ⇒ tạo một tiến trình KHÁC, KHÔNG đưa tay cầm vào sổ
                   ⇒ nút Dừng của ô đó phải KHÔNG với tới nó
④ thử phá        ⇒ bỏ tay cầm ở MỘT cửa sinh ⇒ `tsc` phải CHẶN. Phục hồi ⇒ 0 lỗi.
```

## ⑤ THỨ TỰ
```
KHÔNG dựng, KHÔNG nạp cho tới khi có người soi.
Người soi: `hermes-aiboss-app-reviewer`, đề viết TRUNG TÍNH (đã đo: 0 lần bị bộ lọc chặn).
`claude-phong-ban-pm` đang làm việc Owner giao — KHÔNG kéo về.
```
