# `aiboss-app-chat` — MASTER PLAN v1.0
> 📅 Dựng 30/08/2026 · 👤 `claude-phong-ban-pm` (App Reviewer) soạn theo lệnh Owner
> 🎯 Nguồn duy nhất về hướng đi. Việc cụ thể nằm ở `TASK_BOARD.md`, lý do chốt nằm ở `DECISION_LOG.md`.
> ⚠️ Mọi con số dưới đây **đo lúc 07:01 ngày 30/08/2026**. Số quá một ngày thì ĐO LẠI, đừng chép.
> 🔒 **Trước khi dựng bất cứ gì: `ai/PROTOCOL-review-hash.md`** — verdict phải dán vào một bản CỤ THỂ.

---

## 1. Dự án này là gì

App web chạy tại máy Owner, mở nhiều ô chat cùng lúc, **mỗi ô là một ghế Claude Code riêng**.
Nó **thay cho việc mở nhiều cửa sổ terminal**, nên có đủ quyền như terminal.

**Không phải mục tiêu** (viết ra để khỏi ai đó tiện tay làm):
- Không phải sản phẩm bán cho người ngoài. Một máy, một người dùng.
- Không đa nhà cung cấp mô hình. Chỉ Claude Code.
- Không chợ tiện ích cắm thêm, không kho tri thức, không app máy tính bàn.

## 2. Thực tại — số đo, không phải cảm giác

```
mã nguồn      29 tệp · 5.502 dòng   (UngDung.tsx một mình 2.015 dòng = 37%)
kho           ~/Projects/aiboss-app-chat · git 42 commit · nhánh main · 1 worktree
cổng          localhost:4319 → 200 · đối chứng âm một đường bịa → 404
số ô          SO_O = 6  (khai ở src/lib/so-o.ts)
ô đang có ghế 6/6 — o-1 eroca-boss · o-2 aiboss-app-pm · o-3 phong-ban-pm
                     o-4 aiboss-app-exe · o-5 zalo-bot · o-6 chat-channels
trạng thái    lưu bằng JSON trong .trang-thai/ · 0 tệp CSDL · 0 chỗ có khoá
```

### Bệnh đã đo được, xếp theo mức đau

| # | Bệnh | Bằng chứng |
|---|---|---|
| B1 | **Đóng tab thì các ô ngừng nói chuyện với nhau** | trình duyệt là thứ đi hỏi và bấm nút hộ (`UngDung.tsx:1147`, nhịp 5 giây, ngủ khi tab ẩn) |
| B2 | **Mất bản cập nhật khi hai nơi cùng sửa sổ ô** | `kho-phien.ts:35` đọc trọn, `:43` ghi trọn, đếm khoá ra 0 |
| B3 | **Một tệp 2.015 dòng** | 37% mã nằm trong một tệp, hai người sửa là đụng nhau |
| B4 | **Không biết mỗi ghế tiêu bao nhiêu** | chưa có chỗ nào đọc mức dùng |
| B5 | Chỉ dẫn chết trong tài liệu | `README.md:11` trỏ vào đường không tồn tại |

## 3. Kiến trúc — ai làm gì (đo tại mã, 30/08)

```
trình duyệt   chỉ HIỂN THỊ + đi hỏi «có việc chưa» mỗi 5 giây + BẤM NÚT hộ
máy chủ Next  chay-agent.ts:188  spawn(claude …)   ← tiến trình THẬT chạy ở đây
cổng đánh thức api/danh-thuc:38  chỉ XẾP HÀNG rồi trả lời, tự nó không gọi ai
```

🔑 **Điểm mấu chốt của toàn bộ plan này:** tiến trình đã chạy phía máy chủ rồi.
Trình duyệt **không** chạy gì cả — nó chỉ quyết định **lúc nào** gọi.
Máy chủ cố ý không tự gọi, lý do ghi ngay trong mã (`UngDung.tsx:1115`):
*«hai nơi cùng gọi một phiên = hai tiến trình cùng ghi một tệp .jsonl = hỏng bản ghi»*.

⇒ **B1 và B2 là CÙNG MỘT BÀI**: hai nơi đụng một thứ mà không có khoá.
Giải được khoá thì máy chủ tự chạy được, và đóng tab không còn ảnh hưởng gì.

### Vì sao KHÔNG đưa việc này ra dịch vụ ngoài (Railway)
```
① đường vào không nghẽn — cổng nhận yêu cầu và trả 200 ngay bây giờ
② việc chạy bắt buộc ở máy Owner: mã, tệp phiên, khoá, hồ sơ ghế đều ở đó
③ chỗ nghẽn là một QUYẾT ĐỊNH TRONG MÃ, không phải đoạn đường thiếu
```
Railway đúng chỗ cho **một bài khác**: Owner ở ngoài nhà, muốn ra lệnh cho ghế. Xem P3.

## 4. Bốn tầng việc

### P0 — nền, làm trước mọi thứ khác
```
P0-1  khoá quanh chu trình đọc-sửa-ghi sổ ô        → chữa B2
P0-2  máy chủ TỰ chạy lượt, bỏ phụ thuộc trình duyệt → chữa B1 (dựa trên P0-1)
P0-3  sửa README.md:11                             → chữa B5
```
⚠️ **P0-1 và P0-2 phải cùng một khoá.** Làm P0-2 mà chưa có khoá là đúng vào cái mã đang sợ.

### P1 — bốn thứ học được từ LobeHub, xếp theo giá trị
```
P1-1  BẢNG ĐO MỨC DÙNG THEO GHẾ        ← đắt nhất, vì nó là TIỀN. Tách rõ phần đọc lại từ phần mới.
P1-2  ĐƯỜNG DẪN ĐÍCH DANH tới (ghế + chủ đề)  ← mở đúng chỗ, không phải bấm dò
P1-3  CHIA NHỎ UngDung.tsx 2.015 dòng   ← điều kiện để hai người làm song song
P1-4  QUYỀN THEO TỪNG GHẾ               ← ghế nội dung không cần quyền xoá tệp
```

### P2 — dọn nhà
```
P2-1  chia hội thoại theo chủ đề trong một ghế
P2-2  gom bảy tệp sao-lưu-tay .truoc-* thành một nếp có tên
```

### P3 — điều khiển từ xa (bài khác hẳn, đừng trộn vào P0)
```
P3-1  một cửa ngoài internet để Owner ra lệnh khi không ở trước máy → LÚC NÀY Railway mới đúng chỗ
```
📌 Làm P0 trước thì P3 nhẹ hẳn: lúc đó dịch vụ ngoài chỉ còn mỗi việc chuyển tin.

### Đợt M — học từ Mandeck (thêm 14/09/2026 · chi tiết + nhãn kiểm thử ở mục «ĐỢT M» cuối tệp)
```
M1  tái hiện «đèn kẹt» rồi mới vá                → phép nghiệm thu còn thiếu của P0-7 · P1-7
M2  sổ lượt bền + kết cục đúng + khoá chung B0    → cách làm của P1-6 · P1a · B0 · P1-1
M3  làn «Việc cần anh»                             → dùng P1-2
M4  nối «đã kiểm chứng» (verdict + md5) vào sổ    → PROTOCOL-review-hash
M5  một thư viện · HTTP · CLI · MCP, chỉ trong máy → mới; ra ngoài máy vẫn là P3-1
```

### P2b — hai việc Owner nêu 30/08, CHƯA làm

```
P2-3  MỐC GIỜ ĐẦY ĐỦ trong khung chat   → hiện CHỈ có giờ:phút, THIẾU ngày
P2-4  HỒ SƠ GHẾ: nạp CLAUDE.md lên giao diện, CHỈ ĐỌC
```

#### P2-3 · mốc giờ đầy đủ — Owner 30/08: «phần lịch sử chat có thêm hh:ss dd/mm/yyyy tôi chưa thấy làm»

**Đo hiện trạng (30/08):**
```
UngDung.tsx:314   gioBayGio() = toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',hour12:false})
                  ⇒ ra ĐÚNG «14:39». KHÔNG có ngày.
doc-phien.ts:329  tin đọc từ bản ghi cũ dùng gioNgan(j.timestamp) — cùng kiểu, cũng KHÔNG có ngày
```
🟢 **Rẻ hơn tưởng:** dữ liệu ĐÃ MANG sẵn mốc đầy đủ — `luc?: number` (doc-phien.ts:226 · UngDung.tsx:46),
đổ từ `Date.now()` và `mocMs(j.timestamp)`. ⇒ Đây là việc **ĐỔI CÁCH VẼ**, KHÔNG phải đổi dữ liệu,
KHÔNG phải đọc lại tệp. Ngày đã nằm sẵn trong tay, chỉ chưa in ra.

⚠️ **MỘT CHỖ PHẢI HỎI OWNER TRƯỚC KHI LÀM:** Owner viết «hh:ss».
```
· app ĐANG hiện giờ:PHÚT (hh:mm) — thứ đang THIẾU là NGÀY
· nếu «hh:ss» là gõ nhanh của «hh:mm» ⇒ chỉ cần thêm dd/mm/yyyy
· nếu Owner THẬT SỰ muốn GIÂY ⇒ phải là hh:mm:ss, KHÔNG phải hh:ss
   (giờ:giây bỏ phút là đọc ra số vô nghĩa)
```
KHÔNG được tự đoán rồi làm — hỏi một câu là xong.

⚠️ **Chỗ dễ hụt khi làm:** đừng in ngày lên MỌI dòng — hội thoại dài thì ngày lặp lại
hàng trăm lần, rối hơn là thiếu. Cân nhắc: dòng nào SANG NGÀY MỚI thì hiện mốc ngày,
còn từng tin vẫn giữ giờ:phút. App đã có sẵn khối `.moc-ngay` làm đúng việc đó.

#### P2-4 · hồ sơ ghế CHỈ ĐỌC
Chi tiết + lý do khoá vế Sửa: `~/idea/inbox/phong-ban-ai-app/KE-HOACH-HO-SO-GHE-CHI-DOC.md`
🔒 Owner chốt 30/08: **KHÔNG cho sửa CLAUDE.md qua web.** Mở lại vế Sửa phải xin Owner LẦN NỮA.


## 4b. Việc mang từ MASTER-PLAN v1 (18/08) sang — ĐÃ LỌC, chỉ giữ cái CÒN SỐNG

> Bản v1 dài 670 dòng, nằm ở `~/idea/inbox/phong-ban-ai-app/master-plan-CU-DA-NGHI-30AUG/`. Ngày 30/08 tôi đối chiếu
> từng khái niệm rồi **đo lại tại mã hôm nay** để biết cái nào đã làm, cái nào còn sống.
> **KHÔNG bê nguyên** — chép việc đã xong vào plan là làm plan nói dối.

### ĐÃ LÀM RỒI, bỏ khỏi plan — có số
```
nút DỪNG cạnh nút Gửi (v1 gọi FE-S3)   → 2 chỗ trong JSX, ĐÃ CÓ
bảng markdown → danh sách dọc màn hẹp   → 5 luật CSS trong mau09.css, ĐÃ CÓ
convertMarkdownTables mất nội dung      → hàm đó KHÔNG còn trong src (0 tệp) ⇒ bẫy hết hiệu lực
```

### P0-6 · 🚨 BẪY NHÓM TIẾN TRÌNH — cảnh báo này CHƯA AI GHI VÀO MÃ

**Đo 18/08:** ba ghế **chung một nhóm tiến trình với MÁY CHỦ** (`pgid=70498`).
**Đo lại 30/08 — VẪN ĐÚNG:**
```
kill(-pid) trong src        = 0   ⇒ mã hiện tại an toàn CHÍNH VÌ nó giết ĐÚNG MỘT pid
detached trong chay-agent   = 0   ⇒ ghế VẪN chưa có nhóm riêng
GET /api/dung               = 0   ⇒ vẫn phải BẤM mới biết sổ giữ pid nào
cảnh báo trên gietViec      = 0   ⇒ 🔴 12 ngày trôi qua, CHƯA ai ghi
```
🔴 `process.kill(-pid)` là **lối viết phổ biến nhất** khi ai đó muốn «giết luôn tiến trình con».
Sửa theo lối đó = **bắn SIGTERM vào cả nhóm = giết MÁY CHỦ và CẢ BA GHẾ.**
```
① ghi CẢNH BÁO ngay trên hàm gietViec — KHÔNG đổi sang process.kill(-pid)
② muốn diệt cả con thì phải cho ghế NHÓM RIÊNG lúc sinh (detached) TRƯỚC, KHÔNG làm ngược
③ SIGTERM vào cha KHÔNG lan xuống cháu — đo 18/08: mỗi ghế để lại 4 tiến trình cháu còn sống,
   chúng vẫn ghi tiếp vào tệp phiên ⇒ lượt SAU của chính ô đó có thể bị CHÍNH APP chặn
④ phép thử 2-ô (bấm dừng ô A, đối chứng ô B phải còn, máy chủ phải còn) — CHƯA ai chạy.
   KHÔNG chạy lúc Owner đang dùng app.
```
📌 Bước ① rẻ nhất và ngăn được tai nạn nặng nhất. Làm trước.

### P0-7 · F5 LÚC GHẾ ĐANG NHẢ CHỮ — giao diện NÓI DỐI, và nó lấy mất cái phanh
> 🔄 **14/09/2026:** bước ① dưới đây ĐÃ CÓ MÃ (`api/dung/route.ts:18` · `UngDung.tsx:912 · 946`), **CHƯA nghiệm thu**. Số đo 30/08 bên dưới đã lỗi thời — xem «ĐỢT M» mục ③ cuối tệp.

**Đo lại 30/08 — VẪN ĐÚNG:**
```
dangChay: false trong khôi phục   = 3 chỗ (UngDung.tsx:256 · 744 · 1323)
/api/phien có cờ đang-chạy        = 0     ⇒ trang KHÔNG có cách nào HỎI «ô này còn chạy KHÔNG»
nút Dừng gác sau o.dangChay       = 4 chỗ
```
Ba tầng bệnh, **tầng ③ nặng nhất**:
```
① LUỒNG ĐỨT     /api/chat gắn MỘT yêu cầu HTTP ⇒ tab mới KHÔNG nối lại được luồng cũ
② LỊCH SỬ CỤT   chỉ nạp tới mốc .jsonl đã ghi ra đĩa
③ 🔴 NÓI DỐI    khôi phục đặt dangChay=false ⇒ MỌI ô hiện RẢNH, kể cả ô đang chạy thật
                ⇒ nút Dừng KHÔNG hiện ⇒ Owner MẤT CÁCH DỪNG việc đang tiêu tiền
                ⇒ và ô soạn vẫn cho gửi ⇒ có thể CHEN vào lượt đang chạy
```
⚠️ Đặt `dangChay:false` **KHÔNG phải cẩu thả** — đó là lựa chọn duy nhất khi KHÔNG có nguồn sự thật.
```
① thêm GET /api/dung chỉ-đọc (hoặc cờ trong /api/phien): ô nào ĐANG CHẠY + pid + bắt đầu lúc nào
   ⇒ khôi phục đặt dangChay ĐÚNG SỰ THẬT ⇒ NÚT DỪNG HIỆN LẠI.  RẺ · LÙI ĐƯỢC · LÀM TRƯỚC
   📌 Trùng với P0-6 bước ③ — làm một lần, được cả hai việc.
② nối lại luồng sau F5 — việc THẬT SỰ KHÓ, openclaw KHÔNG có mẫu để bê (nó là cổng nối + TUI,
   KHÔNG phải app web ⇒ KHÔNG có nút F5 nào để hỏng; nó nối lại KẾT NỐI, KHÔNG phát lại LUỒNG)
③ trong lúc chưa có ②: ô đang chạy sau F5 phải NÓI RA. KHÔNG để giao diện im lặng nói dối.
```
🚩 CHƯA ĐO: `chayNen` trong v1 nay KHÔNG còn trong mã (0 hit) ⇒ câu «việc vẫn chạy tới hết» phải
ĐO LẠI, KHÔNG chép từ v1. Và chưa ai quan sát TẬN MẮT cảnh «F5 xong nút Dừng biến mất» — v1 suy từ MÃ.

### P0-2 bổ sung · MỘT CỬA QUYẾT ĐỊNH ĐÁNH THỨC (v1 gọi BE-S6 v2, học từ openclaw)

```
MỘT hàm  quyetDinhDanhThuc({ y_dinh, nguon, luc, ke_tiep_luc, lan_chay_gan_nhat, cac_lan_gan_day })
         → { hoan:false } | { hoan:true, ly_do:'chua-toi-han'|'qua-sat'|'lu'|'o-dang-ban' }
MỌI đường gọi nó. KHÔNG ai được đi vòng.
'o-dang-ban' là lý do THỬ LẠI ĐƯỢC ⇒ hẹn lại sau 1 giây, KHÔNG vứt      ← chữa đúng bệnh «rơi im lặng»
ý định 'khẩn' bỏ qua chưa-tới-hạn + quá-sát, NHƯNG VẪN qua phanh lũ      ← chống vòng lặp
ghế chưa chạy lần nào ⇒ cho qua ngay                                     ← giữ ghế rảnh nhanh
```
📌 Cách canh bằng launchd trở thành **MỘT NGUỒN nữa**, KHÔNG phải một hệ riêng có luật riêng.
Câu «WatchPaths hay StartInterval» tụt xuống hàng chi tiết cài đặt — **đó chính là chỗ v1 lạc đường.**

**Năm cổng nghiệm thu — chép nguyên, đừng rút gọn:**
```
① rung vào ô ĐANG CHẠY → KHÔNG mất; ô xong lượt thì tự tới   (nay: tan sau 3 phút)
② hai lần gọi cách nhau 5ms cùng ghế → chỉ MỘT chạy, cái kia 'qua-sat'
   ĐỐI CHỨNG DƯƠNG: cách nhau 40 giây → CẢ HAI chạy   ⇐ thiếu vế này thì ① vô nghĩa
③ ép 6 lần trong 60 giây → cái thứ 6 bị 'lu'; log PHẢI nói rõ lý do, KHÔNG im
④ ghế chưa chạy lần nào + gọi theo sự kiện → chạy NGAY, KHÔNG bị phanh
⑤ KHÔNG còn đường nào đi vòng — grep đếm chỗ gọi; đối chứng dương: cố thêm một đường vòng
   thì bộ thử PHẢI ĐỎ
```
⚠️ **KHÔNG bê con số 30 giây của openclaw.** Của họ hợp với nhịp tim máy; của ta là người-gửi ⇒ 30s
có thể QUÁ CHẬM. Bê số của người khác vào bài toán khác là lỗi v1 suýt lặp lần hai.

### P1-6 · SQLite cho trạng thái liên-ghế (v1 gọi BE-S1..S4) — CHƯA làm dòng nào
```
đo 30/08: sqlite trong src = 0 tệp  ⇒ cả làn BE của v1 chưa khởi động
```
Việc này là **cách làm** cho P0-1 (khoá quanh chu trình đọc-sửa-ghi sổ ô), KHÔNG phải việc rời.
Nghiên cứu mới đang ở `ai/NGHIEN-CUU-kenh-sqlite.md`. Phản biện cũ giữ ở
`~/idea/inbox/phong-ban-ai-app/master-plan-CU-DA-NGHI-30AUG/phan-bien/G1-cas-sql.md` — ĐỌC TRƯỚC khi dựng lại.

### Giữ làm tư liệu, KHÔNG phải việc
```
· bộ thử 7 ca cho bảng-thành-dọc + cách chạy lại  → v1 dòng 306-356
· số đo bảng 12 cột ca «CSS bó tay»               → v1 dòng 310-325
⇒ FE đã làm xong, nhưng bộ thử vẫn dùng được để canh hồi quy. Đừng dựng lại từ số 0.
```


## 4c. Owner nêu 31/08 — hai việc, một chỉ thị

### 🔴 CHỈ THỊ · HEARTBEAT PHẢI HỌC **GIỐNG HỆT** OPENCLAW
> Owner 31/08: *«ưu tiên học cách chạy heartbeat giống hệt openclaw nhé»*

KHÔNG tự nghĩ lại từ đầu, KHÔNG «lấy ý tưởng rồi làm theo cách mình». Đọc mã họ, làm theo họ.
```
~/Development/openclaw/src/infra/   515 tệp nhắc heartbeat
  heartbeat-runner.ts                    90.650 byte — bộ chạy chính
  heartbeat-wake.ts                      pendingWakes · gộp wake · thử lại 1 GIÂY
  heartbeat-cooldown.ts                  cửa sổ chống lũ 60 giây / 5 lượt
  heartbeat-visibility.ts · heartbeat-events-filter.ts · heartbeat-schedule.ts
  🎯 heartbeat-runner.skips-busy-session-lane.test.ts   ← BA nhóm bận, đọc trước tiên
```
**Ba nhóm «bận» của họ** (ta chỉ có MỘT): `requests-in-flight` · `cron-in-progress` · `lanes-busy`.
⚠️ Chỗ **KHÔNG** bắt chước được, đã đo và có lý do: họ giữ `pendingWakes` trong BỘ NHỚ tiến trình,
vì «wake» của họ là **tín hiệu GỘP ĐƯỢC**. Của ta là **câu người thật, phải giao ĐÚNG MỘT LẦN**
⇒ ta phải giữ trên ĐĨA. Đây là khác biệt bản chất, KHÔNG phải chỗ ta làm khác cho tiện.
⚠️ Và KHÔNG bê con số: «30m» trong phép thử của họ là `heartbeat.every` — **nhịp tim máy**,
KHÔNG phải tuổi thọ một mẩu. Bê mù là lỗi đội này suýt lặp lần hai.

### P1-7 · 🔴 ĐÈN KHÔNG NHÁY SAU KHI MỞ LẠI TRÌNH DUYỆT (Owner báo 31/08, có ảnh)
> 🔄 **14/09/2026:** bước ① ② dưới đây ĐÃ CÓ MÃ, **CHƯA nghiệm thu**. Chiều NGƯỢC mới lộ: đèn bật lúc khôi phục mà KHÔNG ai tắt khi lượt xong — xem «ĐỢT M» mục ② và M1 cuối tệp.

> Owner: *«khi tắt trình duyệt và mở lại lúc ai agent đang trả lời thì nó KHÔNG nháy đèn báo
> đang chạy ở tên ai agent, và tôi bấm nhắn tin mới biết»*
> Ảnh: `~/Zalo-files/2026-08-31/chup-man-hinh-chat-pm-aiboss-canh-bao-phien-trung.jpg` (10:44)

**Ảnh cho thấy BA thứ, KHÔNG phải một:**
```
① đèn ở ảnh đại diện XANH ĐỨNG YÊN — đáng lẽ phải NHÁY (den-chay) vì ghế đang chảy chữ
② Owner gõ tin rồi mới biết — giao diện bắt anh THỬ mới biết trạng thái
③ app trả lời: «Phiên này vừa đổi trong 5 phút — nhiều khả năng ĐANG CHẠY ở terminal khác»
```

🔑 **Điểm cốt lõi, dễ bỏ sót:** vế ③ chứng minh **app ĐÃ CÓ tín hiệu cần cho vế ①.**
`doc-phien.ts:25` canh «tệp phiên đổi trong 5 phút». Nó tính ra sự thật «ghế này đang chạy»,
rồi **tiêu sự thật đó vào một lời TỪ CHỐI, thay vì thắp cái đèn.**
⇒ Việc này KHÔNG cần nguồn dữ liệu mới. Chỉ cần **đưa tín hiệu đã có ra đúng chỗ người ta nhìn.**

🔴 **Và câu cảnh báo đang NÓI SAI:** «ĐANG CHẠY ở terminal khác» — lúc đó KHÔNG có terminal nào,
đó là chính lượt của ghế trong app. Bẫy này đã ghi trong linh hồn ghế PM (§② mục FORK):
*«Owner bị chặn thì ĐỪNG vội đổ cho terminal đang mở — ĐO TRƯỚC»*. Câu chữ phải đổi theo:
nói **«ghế này đang chạy dở»**, và chỉ nói «terminal khác» khi ĐO ĐƯỢC là có.

**Nối vào P0-7** (F5 lúc ghế đang nhả chữ — giao diện nói dối). Cùng một gốc:
`dangChay: false` lúc khôi phục, và `/api/phien` KHÔNG có cờ đang-chạy.
Khác nhau ở chỗ: P0-7 nói về **mất cái phanh** (nút Dừng biến mất);
P1-7 nói về **mất cái đèn** (KHÔNG biết nó đang chạy). Vá nguồn một lần, được cả hai.

```
① thêm cờ đang-chạy vào /api/phien (hoặc GET /api/dung) — trùng P0-6 bước ③ và P0-7 bước ①
   ⇒ LÀM MỘT LẦN, ĐƯỢC BA VIỆC. Đây là lý do nó đáng lên trước.
② khôi phục đọc cờ đó rồi đặt dangChay ĐÚNG SỰ THẬT ⇒ đèn nháy lại, nút Dừng hiện lại
③ sửa câu cảnh báo cho khớp sự thật đo được
```
**Nghiệm thu:** cho một ghế chạy câu dài → ĐÓNG hẳn trình duyệt → mở lại →
đèn ghế đó phải NHÁY, KHÔNG cần gõ gì. Đối chứng: ghế rảnh thì đèn xanh ĐỨNG YÊN.
⚠️ Đo trên **WebKit** (Safari) chứ KHÔNG chỉ Chromium — đội này đã sai vì việc đó.

## 4d. 📸 BẰNG CHỨNG ẢNH OWNER GỬI 30-31/08 — mỗi ảnh gắn với một kết luận

> Ảnh là **mẫu duy nhất KHÔNG thay được bằng số**. Ba lần trong hai ngày, số của đội nói ĐẠT
> mà mắt Owner nhìn ra hỏng ngay. Dẫn đủ đường dẫn để người sau mở lại được.

```
~/Zalo-files/2026-08-30/
  2aOboQvAIhoTwMrki6OgpALnPHej50qTXWi9XVKa.jpg   nút «Xem thêm» ĐÈ LÊN CHỮ, che 2 dòng
                                                 ⇒ đẻ ra: gỡ dải ghim, đưa nút lên thanh đầu ô
  2aOboQvBST8YWdbiIXKy3ma32UkLoKA69coY4hEm.jpg   sau thu nhỏ — ô 2·3·4 ĐÚNG, ô 1 giữ chỗ đọc
  2aOboQvBSaylONtLngYGifVQS7p3x1ys3WJRj6pc.jpg   (ảnh đôi) xác nhận 3 ô ở tin mới nhất
  2aOboQvBY0FY1cwz9GRGIeO1HVX9WoMzhMA7g9GS.jpg   toàn màn hình ô 1, trước khi thu
  2aOboQvBY6g6RphkAX1n8XK17uDBZYOCRJruOLcO.jpg   sau khi thu nhỏ ô 1
  2aOboQvBYF5jxWFhCBVb3n1NCAJGIpJiz5LZ5H6W.jpg   🔑 ô3 cắt ngang chữ «Eroca Thanh», ô4 cắt giữa câu
                                                 ⇒ đẻ ra: ô ĐANG NHẢ CHỮ thì đẩy lên, DỪNG thì bị che
  2aOboQvBYMMiLQyugrpLfzWGPuxM7Bo520kDqDDs.jpg   ô3 nhả chữ thì đẩy lên, ô4 chưa nhả nên bị che

~/Zalo-files/2026-08-31/
  chup-man-hinh-chat-pm-aiboss-canh-bao-phien-trung.jpg
        🔑 đèn XANH ĐỨNG YÊN trong khi ghế đang chạy · Owner phải GÕ TIN mới biết
        · app trả «đang chạy ở terminal khác» — câu này NÓI SAI, lúc đó KHÔNG có terminal nào
        ⇒ đẻ ra P1-7. Và vế ③ chứng minh app ĐÃ CÓ tín hiệu cần cho vế ①.
  aiboss-phong-ban-ai-canh-bao-phien-dang-chay-noi-khac.jpg
        🔴 SAU khi nạp bản mới: đèn + nút Dừng VẪN sai sau F5
        ⇒ ĐO RA: đây KHÔNG phải thụt lùi — P1-7 CHƯA BAO GIỜ được vá (xem 4e)
  chup-man-hinh-pm-phong-ban-ai-debug-mat-canh-restart.jpg
        Owner nhắn tin xong mới phát hiện ô đang chạy — cùng bệnh
  chat-tho-code-app-aiboss-debug-nap-ban-moi.jpg
        🔑 exe bị CẮT GIỮA CÂU (tin kết bằng dấu «:») vì bộ hẹn nổ giữa lượt
        ⇒ đẻ ra: bộ hẹn phải canh MỌI ghế, và quá trần thì BÁO chứ ĐỪNG nổ
  chup-man-hinh-chat-debug-aiboss-app-mat-canh-restart.jpg
        ✅ mặt TỐT: sau F5 thấy ô 4 đang chạy, và ghế tự được đánh thức KHÔNG cần Owner chat
        ⚠️ nhưng xem 4e — đó là trùng hợp lúc đang chảy chữ, KHÔNG phải trạng thái được khôi phục
  chup-man-hinh-chat-tgd-luat-gioi-han-vong-lap-aiboss.jpg
  chup-man-hinh-pm-aiboss-hoi-quota-ngoai-le.jpg
        Owner hỏi ngoại lệ hạn mức ⇒ ĐO RA phanh KHÔNG chạm việc gấp ⇒ khuyến nghị KHÔNG làm
  chup-man-hinh-chat-pm-phong-ban-ai-mat-canh-kenh.jpg
```

## 4e. 🔴 P1-7 **CHƯA BAO GIỜ ĐƯỢC VÁ** — đính chính một hiểu nhầm của cả Owner lẫn PM

Owner báo 31/08 trưa: *«lần trước đã fix nhưng lần gần nhất lại không còn được fix»*.
**Đo tại mã — KHÔNG có bản vá nào, nên cũng KHÔNG có thụt lùi:**
```
/api/phien trả cờ đang-chạy          0
GET /api/dung (tra sổ tiến trình)    0
dangChay: false lúc khôi phục        vẫn 3 chỗ (UngDung.tsx:300 · 863 · 1453)
commit từng vá P1-7                  KHÔNG có — chỉ có commit TÀI LIỆU 8282b21
```
🕳 **Vì sao cả hai tưởng đã vá:** lúc ~11:5x Owner F5 và thấy ô 4 hiện «đang chạy» ĐÚNG.
Nhưng cờ đó do **luồng đang sống** bật lên, KHÔNG phải do khôi phục từ máy chủ.
📌 **«Trông đúng lúc đang chảy chữ» KHÁC «khôi phục đúng sau khi tải lại».**
PM báo Owner vế đầu như một chiến thắng mà KHÔNG tách hai vế — lỗi của PM.
⇒ Bài học chung: **một quan sát đúng lúc sự việc đang diễn ra KHÔNG chứng minh trạng thái được lưu.**

## 4f. Ba phát hiện 31/08 — `claude-phong-ban-pm` soi và soạn, PM kiểm rồi dán

### P0-8 · 🔴 NHÃN «qua-han» ĐANG NÓI DỐI — báo hỏng ở chỗ KHÔNG hỏng
```
sổ danh-thuc.json : mẩu xếp 11:47:59 → tt=bo · ly_do=qua-han · THIẾU xu_luc
bản ghi phiên ghế : ghế NHẬN câu đó lúc 11:48:05  ⇒ 6 giây, giao THÀNH CÔNG
⇒ hai nguồn ĐỘC LẬP, và chúng nói ngược nhau
```
**Gốc:** lời xác nhận KHÔNG quay về ⇒ mẩu ở lại `dang_giu` ⇒ quá 30 giây `traVeMauHetHan`
trả về `cho` ⇒ quá 180 giây `donDep` đóng dấu `qua-han`. **Việc GIAO KHÔNG hỏng; đường XÁC NHẬN hỏng.**
🔴 Cột «vì sao bỏ» là thứ cả P0-2b dựng ra để có. Nó khai sai theo hướng NGUY NHẤT:
**che chỗ hỏng thật, và bịa ra một chỗ hỏng KHÔNG có.** Hai người đã đi tìm nhầm hướng vì nó.

### P0-9 · `da_xu` KHÔNG dùng làm khoá ĐẾM được nữa
```
boMau() đặt da_xu = true  ⇒ mẩu BỊ BỎ cũng mang da_xu = true
⇒ ai đếm «đã giao» bằng khoá này sẽ đếm LUÔN mẩu chết ⇒ số nghiệm thu CAO HƠN sự thật
ranh giới sạch: trước P0-2b  so_lan_thu=0 (3/3) · sau  so_lan_thu=1 (7/7, mà 7 mẩu đó KHÔNG có xu_luc)
```
**Thước đúng:** đếm `trang_thai === 'da_giao'`, hoặc đếm mẩu **CÓ `xu_luc`**.
📌 Đây là ca **làm hỏng chính cái thước cả đội đang cầm để soi** — cùng họ với việc giẫm mốc bộ canh.

### P0-10 · 🛟 HAI ĐƯỜNG GIAO TIN — và vế PHẢN VÍ DỤ phải chép cùng
```
đường A  gọi thẳng giữa hai ghế    vài giây     hỏng là MẤT LUÔN, KHÔNG ai gọi lại
đường B  bộ canh đọc kênh          tới 90 giây  tự gọi lại nên KHÔNG mất
```
**Luật:** việc gì cũng **GHI KÊNH TRƯỚC rồi mới gọi.** Chỉ gọi mà KHÔNG ghi thì đường A hỏng
là mất trắng, vì đường B KHÔNG có gì để đọc.

🔴 **VẾ PHẢN VÍ DỤ, có thật, phải chép cùng — hai đường CHỈ bù nhau khi KHÔNG cùng tắc:**
```
12:03:30  bộ canh ghế PM gọi lần 12/12 ⇒ chạm trần
12:05:00  PHANH CẠN — ghế PM ĐIẾC                      ← đường B tắc
12:43:59  reviewer gửi ba mục · lời gọi thẳng CHẾT     ← đường A tắc
13:03:33  phanh tự nhả
13:09:34  bộ canh gọi lại, thấy 5 tin dồn
⇒ CẢ HAI ĐƯỜNG CÙNG TẮC 58 PHÚT. Tin về hai cái lỗ bị chính hai cái lỗ đó nuốt.
```

### ✅ Câu Owner sẽ còn hỏi lại: bộ canh có mất tin khi máy chủ khởi lại KHÔNG — **KHÔNG**
```
ghế phong-ban-pm  11:42:05 → (khởi lại 11:43:46) → 11:48:05 → 11:54:45
ghế app-exe       11:42:12 → (khởi lại)          → 11:44:00   chỉ 14 giây sau
nhật ký bộ canh   3747 → 3939 → 4090 → 4175   liền số, KHÔNG hở dòng nào
```
Lý do: nó giữ mốc trên **ĐĨA**, KHÔNG nằm trong bộ nhớ máy chủ.

### ⚖️ MỘT ĐIỂM PM BÁC LẠI reviewer — dòng cảnh báo phanh KHÔNG sai
reviewer báo dòng «còn ~358 phút» là lỗi số cứng. **Đo lại: KHÔNG phải.**
```
mat-canh-ghe.sh:42  CON=$(( (CUA_SO - (GIO - LAN)) / 60 ))   ← hằng số SỐNG
dòng «358 phút» in lúc 12:05 · PM sửa CUA_SO lúc 12:10
⇒ lúc in, cửa sổ VẪN là 6 giờ ⇒ 358 phút ĐÚNG tại thời điểm đó
⇒ 12:35 nó in «28 phút» theo hằng số MỚI ⇒ công thức chạy đúng
```
📌 Bài học chung: **một dòng nhật ký cũ KHÔNG sai — nó đúng với cấu hình lúc nó được ghi.**
Đọc log cũ bằng cấu hình MỚI là một dạng của bệnh «trộn hai bản» ta đã cắn ba lần hôm nay.

## 4g. 📚 SỔ TRI THỨC DỰ ÁN — Owner nêu 31/08, đã dựng `ai/SO-TRI-THUC.md`

> Owner: *«giờ ai cũng đoán và ai cũng đi kiểm từ đầu rồi phát hiện mình sai mình thiếu…
> sau này bảo thêm chức năng lại cắm mắt vào thêm mà KHÔNG hề có kho tri thức để biết
> có hay chưa và xác minh ở đâu, thêm xong lại phải cập nhật ở đâu»*

### 🔑 THIẾT KẾ — thứ phân biệt sổ này với một tệp ghi chú thường
```
MỖI MỤC = câu sự thật  +  LỆNH ĐO LẠI CHẠY ĐƯỢC  +  mốc giờ  +  tên ghế đã đo
```
**Vì sao lệnh đo lại là bắt buộc:** Owner hỏi đúng chỗ đau — *«kiểm lại xem có outdated lúc đọc
không»*. Một ghi chú tĩnh KHÔNG trả lời được câu đó; nó chỉ già đi trong im lặng.
Có lệnh thì **«sổ này còn đúng KHÔNG» trở thành một câu hỏi ĐO ĐƯỢC trong vài giây**.
⇒ Đây chính là nếp cả đội tự rèn ra trong hai ngày: đối chứng dương · ba mốc · dấu vân.
Sổ chỉ là chỗ **cất** chúng lại cho người sau.

### Luật vận hành (chép trong đầu sổ)
```
① KHÔNG có lệnh đo ⇒ KHÔNG được ghi vào sổ. Tri thức không kiểm được là TIN ĐỒN.
② Đọc sổ ⇒ VẪN PHẢI chạy lệnh. Sổ cho biết ĐO Ở ĐÂU, nó KHÔNG thay bạn đo.
③ Sửa mã ⇒ sửa sổ TRONG CÙNG COMMIT. Lệch một ngày là sổ bắt đầu nói dối.
④ Mọi câu «bằng 0» phải kèm ĐỐI CHỨNG DƯƠNG ngay trong lệnh.
```
📌 Vế ③ trả lời câu *«thêm xong cập nhật ở đâu»*: **cùng commit, không phải việc riêng.**

### Đã gieo sẵn 4 khu · 11 lệnh đo — toàn bộ là thứ đội đo được 30-31/08
```
KHU 1 đánh thức ghế   hai bộ đếm khác nhau · giữ mẩu · nhãn qua-han nói dối ·
                      da_xu không đếm được · hai đường giao tin
KHU 2 giao diện       F5 mất nút Dừng (CHƯA vá) · CSS hai tệp · bản dựng rút gọn tên ·
                      Safari khác Chrome · thước đo phải chặn cửa nguy hiểm
KHU 3 dựng và nạp     ba mốc · DẤU VÂN mạnh hơn ba mốc · bộ hẹn canh mọi ghế
KHU 4 cấm động        realm · 4 khoá localStorage · vùng cách ly · mat-canh-ghe.sh
```

### ⚖️ VỀ `claude-mem` (github.com/thedotmack/claude-mem) — Owner hỏi có dùng được KHÔNG
**Đọc README ngày 31/08. Kết luận: nó giải một bài KHÁC, KHÔNG hợp việc này.**
```
nó lưu     TÓM TẮT HỘI THOẠI nén ngữ nghĩa, SQLite + vector, ~/.claude-mem/
           tự động qua 5 hook vòng đời · truy vấn theo mã quan sát
nó KHÔNG   trỏ tệp:dòng để kiểm lại · KHÔNG có khái niệm «đo lại»
```
🔴 **Chỗ chí mạng:** thứ Owner cần là *«biết nằm ở dòng nào tệp nào để kiểm xem có lỗi thời»*.
Tóm tắt hội thoại **cũng lỗi thời y hệt**, mà lại **KHÔNG kiểm được** — vì không có gì để trỏ tới.
⇒ Dùng nó cho bài này là đổi một sổ có thể sai-mà-biết lấy một sổ sai-mà-không-biết.

**Nó có ích cho việc KHÁC:** giúp phiên MỚI nhớ «hôm qua đã làm gì». Nhưng dự án này đã có
kênh append-only + nhật ký phiên cho đúng việc đó, và hai thứ đó **đọc được bằng mắt người**.
⇒ **Khuyến nghị: KHÔNG cài cho dự án này.** Nếu sau này muốn thử thì thử ở dự án khác trước —
đừng lấy dự án đang có 4 ghế chạy song song làm chỗ thí nghiệm một hệ tự-ghi-nền.

### ⏭ Việc còn lại của sổ (chưa làm)
```
· `kiem-so-tri-thuc.sh` — chạy TẤT CẢ lệnh đo trong sổ, in mục nào đã LỖI THỜI
  ⇒ biến cả cuốn sổ thành thứ TỰ KIỂM. Đây mới là chỗ nó thắng mọi tệp ghi chú.
· nối vào linh hồn ghế: mọi ghế đội app ĐỌC SỔ TRƯỚC khi hỏi/đoán/đi đo lại từ đầu
```

## 4h. 🗓 NGÀY 01/09 — sáu thứ Owner nhắc, và THỨ TỰ ƯU TIÊN cho toàn plan

> ✍️ `claude-aiboss-app-pm` dán 01/09 20:4x. Owner đo lúc 20:2x: tệp này sửa lần cuối **31/08 13:56**,
> cả ngày 01/09 chưa vào một dòng — Owner đếm ngay trong tệp (đối chứng dương `P0-2`→5, `Owner`→36).
> 🔴 **Lỗi của PM:** tôi dựng một tệp kế hoạch THỨ HAI (`KE-HOACH.md`) vì KHÔNG biết tệp này tồn tại.
> Nay đã gộp về đây; `KE-HOACH.md` chỉ còn là con trỏ. **Hai cuốn sổ cho một dự án là chắc chắn trôi.**

### ① SỔ «Ô ĐANG CHẠY» SAI ĐƯỢC CẢ HAI CHIỀU
```
BÁO THỪA  (chắc chắn, chứng minh bằng đọc mã)
   kho-tien-trinh.ts  dsViec() chỉ đổ Map ra, KHÔNG kiểm pid còn sống
   đo: grep -cE 'kill\(' kho-tien-trinh.ts → 1, và nó nằm ở gietViec, KHÔNG ở dsViec
   ⇒ tiến trình chết mà chưa ai gọi xoaViec ⇒ đèn sáng MÃI MÃI

BÁO THIẾU  (kho-tien-trinh.ts:25 `const SO = new Map<…>()` — sổ nằm trong BỘ NHỚ)
   ⚠️ giả thuyết «máy chủ khởi lại ⇒ sổ trống» ĐÃ BỊ OWNER BÁC 01/09: ca ảnh 31/08 KHÔNG có
      khởi lại nào. Xem ③ và ⑤c dưới — bệnh thật nằm ở phía trình duyệt.
```

### ② BA CHỖ TỰA VÀO CUỐN SỔ ĐÓ ĐỂ **QUYẾT ĐỊNH** — cái đèn chỉ là chỗ Owner nhìn thấy
```
may-chay-nen.ts             4 chỗ  ⇒ tưởng ghế RẢNH ⇒ chạy chồng lên lượt đang chạy
UngDung.tsx (`dangChay`)   37 chỗ  ⇒ lọc ô nhận đánh thức ⇒ lời gọi RƠI IM LẶNG
hen-khoi-dong-lai-app.sh    3 chỗ  ⇒ ✂️ ĐÃ GẠCH: sổ chỉ có quyền BẮT CHỜ (`exit 3`), KHÔNG có
                                     quyền CHO NỔ — nhánh còn lại rơi xuống mtime ⇒ hỏng về phía AN TOÀN
```
🔑 Gốc lỗi khoanh sai của PM: **thấy nó ĐỌC sổ rồi kết luận nó QUYẾT theo sổ, mà KHÔNG hỏi sổ có
quyền tới đâu.** «Có đọc một nguồn sai» KHÔNG đủ để kết luận «sẽ quyết định sai».
⚠️ Gạch xong thì **mtime thành tiếng nói cuối duy nhất**, ngưỡng 75s — và nó MỎNG:
```
lần nạp 01/09 nổ khi ghế bận nhất im 78s ⇒ hơn ngưỡng ĐÚNG 3 GIÂY
ca «ghế BẬN mà im >75s»: exe đếm 481 · phong-ban-pm đếm 504 (lệch về CỠ, thuận về CHIỀU)
```
✅ **ĐÃ QUYẾT (PM, 01/09):** bộ hẹn chỉ nổ khi **CẢ HAI** nói rảnh — `pgrep -P <pid máy chủ>` → 0 con
(nguồn CHÍNH, hệ điều hành giữ) **VÀ** mọi ghế im ≥75s (lớp hai). Đo thật: `pgrep -P 39808` ra đúng
2 con `claude -p …` = đúng 2 lượt đang chạy; đối chứng âm pid bịa → 0; đối chứng dương tổng claude → 19.
📌 Giữ CẢ HAI lớp vì chúng hỏng ở **hai chỗ khác nhau** — `pgrep` hở khi máy chủ vừa khởi lại (con cũ
thành mồ côi). **Hai lớp cùng tựa vào một cuốn sổ thì chúng KHÔNG còn là hai lớp.**

### ③ P0-2c ĐÃ NẠP 10:58:51 — dựng XANH, và có BẰNG CHỨNG SỐNG
```
Compiled successfully 1 · Failed to compile 0 · UnhandledSchemeError 0
bó edge gồm ĐÚNG 2 tệp; node:fs · node:path · node:os · node:crypto · node:child_process → CẢ 5 = 0
   đối chứng dương trên chính bó edge: 'PHONGBAN' → 1 ⇒ thước ĐỌC ĐƯỢC
nhật ký máy chủ: «[chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.»
```
🔑 **Dòng nhật ký đó là bằng chứng SỐNG:** nó chỉ in ra khi `batMotLan()` chạy tới cuối trên máy chủ
thật ⇒ đường dây THÔNG. Bộ nền tắt là vì **biến `CHAY_NEN` chưa đặt**, KHÔNG phải vì mã hỏng.
⏭ **Bật hay KHÔNG bật là một quyết định triển khai chưa ai ra** — cần Owner trả lời một câu.

### ④ ROUND-4 OWNER ĐÃ QUYẾT (09:29 01/09) và ROUND-5 (10:46)
```
round-4 ① cửa sổ nạp : B — chờ P0-2c xong rồi nạp MỘT LẦN   ✅ đã thi hành 10:58:51
round-4 ② sổ bộ canh : A — duyệt sửa ký tự mũi tên           ⚠️ xem ⑤, chẩn đoán này SAI
round-5 ① vòng soi thứ ba : C — cấp chìa nhưng KHÔNG chặn
round-5 ② thời điểm nạp   : C — tự canh, nạp khi cả sáu ô cùng im  ✅ đã thi hành
```
Trang đã đóng dấu: `aiboss-app-noibo.erocathanh.com/round-5/` (banner + badge, đo trên bản sống).

### ⑤ 🔴 CHẨN ĐOÁN MŨI TÊN **SAI** — thủ phạm thật là `cut -c1-95` dưới bảng mã C
```
Owner duyệt round-4 ② dựa trên chẩn đoán của PM: «ký tự mũi tên làm hỏng dòng sổ»
SỰ THẬT: 3.901/3.901 dòng hỏng VẪN CÒN mũi tên nguyên vẹn
thủ phạm: mat-canh-ghe.sh:180 `| cut -c1-95` — `cut -c` cắt theo BYTE dưới bảng mã C (launchd)
          ⇒ chém ĐÔI một ký tự nhiều byte
```
📌 **Chuỗi ba lỗi đáng nhớ:** PM chẩn sai → Owner quyết dựa trên chẩn đoán đó → exe thi hành → exe đo
lại thấy KHÔNG cứu được. **Một quyết định đúng quy trình vẫn sai nếu tiền đề sai, và KHÔNG lớp duyệt
nào bắt được điều đó.** Cách chữa thật: thêm `| iconv -f utf-8 -t utf-8 -c` sau chỗ cắt.
✅ **ĐÃ VÁ 01/09 20:5x** (`mat-canh-ghe.sh`, PM vá — một dòng, đúng hạn mức PM được phép sửa mã).
Chứng minh bằng BA phép, KHÔNG chỉ bằng lời:
```
① TÁI HIỆN được bệnh : 'a'*93 + 'ế'  →  cut -c1-95  ⇒ KHÔNG còn là utf-8 hợp lệ
② VÁ ĂN              : thêm `iconv -c` ⇒ hợp lệ trở lại
③ ĐỐI CHỨNG ÂM       : chuỗi thuần ASCII ⇒ hai bản GIỐNG HỆT ⇒ iconv KHÔNG xén oan dữ liệu lành
md5 trước f6bbbf35… → sau c458c9a4… · `bash -n` sạch
```
⚠️ **Phép chứng minh ĐẦU của PM đã HỎNG và phải làm lại:** chuỗi thử đầu tiên KHÔNG tạo ra byte hỏng
(bản «bẩn» vẫn hợp lệ utf-8), tức là nó **KHÔNG tái hiện được bệnh** — nếu cứ thế báo «vá xong» thì đó
là một lời khai KHÔNG có cơ sở. Phải tính để mốc cắt rơi ĐÚNG GIỮA một ký tự nhiều byte mới tái hiện được.
🔑 **Vá xong mà chưa từng tái hiện được bệnh thì KHÔNG biết mình vừa chữa cái gì.**

### ⑥ `claudecodeui` ĐÃ GIẢI XONG BÀI «MÀN HÌNH NÓI DỐI» — ta có 0 tệp làm việc đó
```
~/Development/claudecodeui/server/modules/providers/services/sessions-watcher.service…  ⇐ chokidar
đẩy sự kiện ra trình duyệt (ws / event-stream): 8 tệp
ĐỐI CHỨNG ÂM (chuỗi bịa): 0

app ta: chokidar | fs.watch | watchFile trong src/ → 0 tệp
        ĐỐI CHỨNG DƯƠNG ('readFile' trong src/) → 5 tệp ⇒ thước SỐNG, số 0 là THẬT
```
🔑 **Nó THEO DÕI TỆP rồi ĐẨY sự kiện; ta thì HỎI THEO NHỊP và chỉ hỏi khi tab đang hiện.**
Đây là câu trả lời kiến trúc cho **cả họ bệnh**: P1-7 (đèn KHÔNG nháy sau khi mở lại trình duyệt) ·
⑤c dưới đây (tab ngủ rồi tỉnh thì tin cũ đứng im) · và cả chiều BÁO THIẾU ở ①.
⚠️ Cùng họ với **chỉ thị 4c** («heartbeat phải học GIỐNG HỆT openclaw») — cả hai đều nói: **đổi từ
HỎI sang ĐƯỢC BÁO.**

### ⑤c · TAB NGỦ RỒI TỈNH — ca Owner chụp 31/08, nay đã tìm ra ĐÚNG nguyên nhân
**Bối cảnh thật (Owner nói 01/09):** KHÔNG có khởi lại, KHÔNG có nạp lại. Để trình duyệt NGỦ rồi quay
lại ⇒ «load fail», KHÔNG đọc được tin cũ; F5 thì đọc được; nhưng ô đang nhả chữ thì KHÔNG nhả tiếp.
```
đo bởi claude-aiboss-app-exe (01/09), đã có đối chứng dương ĐỔI MẪU sau khi mẫu đầu thất bại:
   trong khối thamDoMotNhip: napLichSu 0 · docLichSu 0 · napThem 0
      (đối chứng dương cùng khối: datCuaHong 4 · ban_dung 4 · fetch 2 ⇒ thước sống)
   napLichSu chỉ được gọi 5 chỗ, CẢ 5 là hành động MỞ ĐẦU (:931 :1075 :1152 :1262 :1278)
   visibilitychange · pageshow · onfocus · online trong UngDung.tsx → 0 chỗ
   napLichSu:809  `if (!kq) return;`  ⇒ trượt một lần là IM LUÔN, KHÔNG thử lại, KHÔNG báo
```
🔑 **KHÔNG phải một cái hỏng — là một đường CHƯA TỪNG ĐƯỢC NỐI.** Đi tìm chỗ hỏng thì KHÔNG thấy,
vì thứ chưa tồn tại KHÔNG để lại dấu hỏng nào.
⚠️ Giả thuyết PM «nghi nhất» (trình duyệt bóp cổ đồng hồ) **đúng sự việc, KHÔNG phải nguyên nhân**:
đồng hồ vẫn cắm, nhịp kế tiếp vẫn chạy — nhưng nhịp đó KHÔNG hề đọc lịch sử.

### 🎯 THỨ TỰ ƯU TIÊN TOÀN PLAN — luật hai tiêu chí (Owner đặt 01/09)
> **Chỉ được CHEN NGANG khi thoả CẢ HAI: quan trọng VÀ khẩn. Thoả một thì XẾP HÀNG.**

| Bậc | Việc | Q.trọng | Khẩn | Ghi chú |
|---|---|---|---|---|
| **P0** | **⑤c lớp 1** — nối đường «tab tỉnh ⇒ đọc lại lịch sử» + nhánh thử lại có hạn | ✅ Owner mất tin, phải F5 | ✅ **mỗi ngày** | ĐANG LÀM (exe). Rẻ nhất bảng. |
| **P0** | ⑤ vá `cut -c1-95` bằng `iconv -c` | ✅ sổ hỏng 3.901 dòng | 🟡 | Một dòng. Owner đã duyệt nhầm hướng, phải sửa lại cho đúng thủ phạm. |
| **P1a** | bền hoá sổ «ô đang chạy» + đối chiếu pid (gồm ①) | ✅ **phần GIAO NHAU của mọi đường** | ❌ | Bước một. Làm nó thì KHÔNG đường nào biến nó thành công thừa. |
| **P1b** | ⑥ **theo dõi tệp + ĐẨY sự kiện** (kiểu `claudecodeui`) | ✅ giải cả HỌ bệnh: P1-7 · ⑤c lớp 2 · báo thiếu ở ① | ❌ | Cùng gốc với chỉ thị 4c. Đừng vá lẻ từng cái. |
| **P1c** | ① giữ TIẾN TRÌNH SỐNG (`--input-format`) + ② cháy hạn mức | ✅ cắt chỗ tốn lớn nhất | ❌ | 18 ngày chưa động. **Lên lịch tử tế**, đừng để việc vặt chen mãi. |
| **P2** | ③ bật `CHAY_NEN` (chờ Owner 1 câu) · ②-đã-quyết `pgrep -P` cho bộ hẹn | 🟡 | ❌ | Xếp hàng. |
| **P3** | Hermes chưa nối vào app (0 dòng gọi thật) · 3/12 hồ sơ ghế còn khối kịch bản · `chon-mau/` | ❌ | ❌ | Có đường vòng đang chạy. |

⚠️ **Việc mới ập tới:** hỏi đúng hai câu → thiếu một chữ «có» thì **ghi vào bảng rồi quay lại việc đang
làm**. KHÔNG mở điều tra, KHÔNG rủ ghế khác đo cùng.
🔑 **MỚI KHÔNG PHẢI LÀ KHẨN.** Và **việc THÚ VỊ hút người làm mạnh hơn việc QUAN TRỌNG** — chiều 01/09
ba ghế dồn cả buổi vào ① và ② (quan trọng ✅ khẩn ❌) trong khi ⑤c thì chỉ được ghi vào sổ rồi bỏ đó.

---

## 4i. 🔁 BA KHỐI TÔI LÀM MẤT LÚC GỘP SỔ — lấy lại từ `git show 2f968da:KE-HOACH.md`

> 🔴 **Tôi khai «đã gộp về đây» lúc 20:4x. Sai — tôi chỉ chép SÁU MỤC Owner liệt kê, còn phần
> tôi tự viết trong ngày thì rơi mất.** Đo: `PHIÊN VỐN ĐÃ` 0 · `chạy terminal thường` 0 ·
> `HAI CHIỀU CẦN HAI CÁCH` 0 (bản cũ đều có 1). `claude-phong-ban-pm` nghiệm thu «6/6 đã vào» —
> đúng với sáu mục Owner nêu, nhưng **KHÔNG ai kiểm phần tôi tự làm mất.**
> 🔑 **Gộp sổ mà chỉ kiểm danh sách người khác đưa thì chỉ bắt được cái người ta nhớ nhắc.**
> Đây đúng là thứ tôi vừa cảnh báo trong `KE-HOACH.md`: hai cuốn sổ thì trôi. Nó trôi ngay lúc gộp.

### 🔻 ĐƯỜNG ② (`detached: true`) — **RỚT KHỎI BÀN**, đo 01/09 20:5x
```
lệnh có kết quả trả về / tổng lệnh, đếm trên bản ghi phiên:
   claude-aiboss-app-exe đếm    : 0 mồ côi / 5.651
   claude-phong-ban-pm  đếm     : 0 mồ côi / 5.720
   mồ côi DUY NHẤT trong mỗi phép đo = chính lệnh của NGƯỜI ĐANG ĐO
🔑 đối chứng dương TỰ XUẤT HIỆN, và ở CHỖ KHÁC NHAU giữa hai người ⇒ thước sống, tự chứng minh mình
```
📌 Cả ba ghế cân đường ② dựa trên một giả định **chưa ai đo**: «lần nạp cắt ngang lượt đang chảy».
Đo ra **0/5.720**. Bàn cách chữa suốt hai vòng cho một ca **KHÔNG xảy ra**.
🔑 **ĐO CÁI HỎNG TRƯỚC KHI BÀN CÁCH CHỮA.**

### 🔁 KHỐI ①: PHIÊN VỐN ĐÃ ĐỘC LẬP — câu hỏi ban đầu đặt SAI VẬT
```
ghế RẢNH thì KHÔNG TỒN TẠI dưới dạng tiến trình:  6 ghế — tiến trình sống chỉ 1-2
phiên là TỆP:  exe 10.298 mẩu trước lần nạp + 242 sau · soi 12.948 + 485 · CÙNG MỘT TỆP
Owner hỏi «PHIÊN có độc lập KHÔNG» ⇒ CÓ, đã có sẵn
ba ghế đi đo «TIẾN TRÌNH có độc lập KHÔNG» ⇒ KHÔNG
```
🔑 Mọi số đúng, mọi đối chứng xanh, kết luận vẫn lệch — **vì đo nhầm VẬT.**
**Đối chứng dương KHÔNG bắt được lỗi này.** Thứ THẬT SỰ chết theo app: (a) lượt đang chảy ·
(b) cửa sổ để nhìn/gõ · (c) sổ nói ai đang chạy. **KHÔNG phải phiên.**

### 🔁 KHỐI ②: BA ĐƯỜNG cho «ghế sống độc lập» — và cái giá của từng đường
```
① chạy terminal thường  → ghế RỜI KHỎI app: KHÔNG ô, KHÔNG nhận đánh thức
   ⚠️ và bản ghi phiên nằm ở kho theo CWD của terminal ⇒ cwd khác thì app KHÔNG THẤY phiên đó
      (đúng ca «Quản Lý Trường» 01/09: 4/5 ghế KHÔNG có kho phiên vì mở từ thư mục khác)
② detached              → 🔻 RỚT, xem trên
③ làm như openclaw      → launchd + sổ trên đĩa + dọn xác mồ côi; giải đúng gốc, lớn hơn hẳn
```
⚠️ **Chọn ①/③ CHƯA quyết — và KHÔNG cần quyết để bắt đầu P1a.**

### 🔁 KHỐI ③: HAI CHIỀU SAI CỦA SỔ CẦN HAI CÁCH CHỮA KHÁC NHAU
```
chiều BÁO THỪA  : kiểm pid trước khi trả về — chữa TẠI CHỖ ĐỌC, rẻ
chiều BÁO THIẾU : kiểm pid KHÔNG cứu được. Sổ TRỐNG thì KHÔNG có pid nào để mà kiểm.
                  ⇒ phải đổi NGUỒN SỰ THẬT, KHÔNG phải thêm một phép kiểm.
```
🔑 **Một phép kiểm chỉ lọc được thứ ĐANG CÓ trong sổ; nó KHÔNG dựng lại được thứ đã mất khỏi sổ.**
⚠️ Và bẫy trong chính cách chữa chiều B (`claude-aiboss-app-exe` nêu): bền hoá xuống đĩa rồi thì
**phải đối chiếu pid lúc ĐỌC LÊN**, KHÔNG chỉ lúc ghi — nếu KHÔNG thì nó đổi từ «quên sạch sau khi
khởi lại» thành **«nhớ dai những thứ đã chết»**. **Chữa một chiều mà KHÔNG nhìn chiều kia là DỜI lỗi,
KHÔNG phải VÁ lỗi.**

---

## 4i-bis. ⚠️ ĐÍNH CHÍNH LỊCH SỬ KHO — commit `9cb977d` chứa mã KHÔNG thuộc thông điệp của nó

```
9cb977d  20:33  «MASTER PLAN 4h: dán trọn ngày 01/09 …»   ⇐ thông điệp nói TÀI LIỆU
   KE-HOACH.md                380 dòng   · của claude-aiboss-app-pm
   ai/MASTER-PLAN.md          123 dòng   · của claude-aiboss-app-pm
   src/components/UngDung.tsx 101 dòng   · CỦA claude-aiboss-app-exe — bản vá P0 tab-tỉnh-lại,
                                           **CHƯA QUA SOI tại thời điểm commit**
```
✅ **ĐÃ ĐÓNG 01/09 21:14** — `claude-phong-ban-pm` soi xong: **ĐẠT sau BA VÒNG**. Cổng bị đi vòng
lúc 20:33 nay đã được đi lại cho đủ, tuy KHÔNG đúng thứ tự. Ba vòng đó bắt được ba lỗi thật
(xem mục 4k), nên đây KHÔNG phải một cái gật cho xong.
📌 Người soi tự đặt thêm một nếp cho mình: *«từ nay soi điều kiện nhiều biến thì ĐÒI bảng sự thật
đủ ca, KHÔNG nhận lời tả bằng chữ»* — và bạn ấy chạy lại chính biểu thức đó trên cả bốn ca chứ
KHÔNG đọc bảng của người vá rồi gật.
🔴 **Hậu quả khác hai lần trước trong ngày:** hai lần kia là mất việc (`reset --hard`) và ghi sai sổ.
Lần này là **một CỔNG bị đi vòng** — luật nhà là `soi ĐẠT → dựng → commit`, mà mã này vào kho trước
khi được soi. Ai dựng lại từ nhánh chính trong quãng đó là dựng bản chưa qua cổng.
✅ App Owner AN TOÀN suốt quãng đó: `.next` vẫn giữ `z7cetgZ5f…` (bản đã soi, nạp 10:58:51).
✅ Nội dung KHÔNG mất: `claude-aiboss-app-exe` so **hash** (`414d4f56` trong commit = trên đĩa), KHÔNG đếm chuỗi.

📌 **KHÔNG sửa lịch sử** (`claude-aiboss-app-exe` xin như vậy): sửa thì mọi hash đổi, mà hôm nay cả đội
vừa dùng chính hash để chứng minh phục hồi đúng. Ghi đính chính ở đây để người đọc sổ sau ba tháng
KHÔNG đi tìm nhầm chỗ.

### ✅ ĐÃ CẮM CHẶN — `.git/hooks/pre-commit`, vì LỜI HỨA đã thất bại một lần rồi
PM tự rút cách chữa lúc 10:12 (`git commit -- <đường dẫn>`) **rồi vẫn tái phạm lúc 20:33.**
```
LUẬT : một commit KHÔNG được vừa mang tài liệu (.md) vừa mang mã (src/) — tách làm hai commit
ĐO   : ① chỉ .md          ⇒ CHO QUA  ✅ (đối chứng dương)
       ② có cả .md và src/ ⇒ CHẶN     ✅ (đối chứng âm — dựng đúng ca hỏng để thử)
```
🔑 **Lời hứa KHÔNG chặn được thứ mình làm mà KHÔNG để ý.** Ba lần trong một ngày, cùng một hình, và
người gây ra KHÔNG lần nào cố ý — nên nó sẽ lặp lại cho tới khi có một cái chặn chạy TRƯỚC khi commit
thành hình.
⚠️ `claude-aiboss-app-exe` cũng đổi nếp phía mình: **mã CHỜ SOI thì KHÔNG nằm trong chỉ mục** —
vì chính thói quen `git add` sớm là bề mặt để cả ba lần quét trúng.

---

## 4j. 🔴 NGƯỜI SOI NGOÀI NHÀ: **FAIL 6/6 · NO-GO** — và điểm mù CHUNG của cả ba ghế

> `hermes-aiboss-app-review` (khác hãng), 01/09 21:0x. Owner phải nhắc *«đừng quên nhân sự mình có»*
> thì PM mới gọi người thứ ba. **Người thứ ba là người duy nhất có điểm mù KHÁC nhà.**

### 🎯 ĐIỂM MÙ CHUNG, nguyên văn
> *«cả ba ghế đang dùng "tiến trình còn tồn tại" như đồng nghĩa với "lượt đang bận"»*

Hai vật khác nhau, ba ghế gộp làm một suốt cả ngày:
```
tiến trình còn sống  ≠  lượt đang bận
  · tiến trình sống mà RẢNH        ⇒ theo cách đo của ta: BỊ CHẶN nạp oan
  · lượt bận mà tiến trình bị đổi cha (reparented) + mtime cũ  ⇒ ta CHO NẠP, sai về phía NGUY HIỂM
  · tiến trình phụ / xác (zombie) là con trực tiếp ⇒ ta tưởng bận
  · pid bị dùng lại ⇒ có thể SIGTERM nhầm người
```
🔻 **⇒ quyết định «`pgrep -P` làm nguồn chính» (mục 4h ②) BỊ TREO LẠI, chưa được thi hành.**
Muốn dùng thì phải **lọc đúng tiến trình** và **tách bạch hai vật trên**, kèm phép thử cho cả bốn ca.

### 🔴 ⑤ BẢN VÁ `iconv -c` CHỈ LÀ **NỬA** — nó tạo UTF-8 hợp lệ bằng cách VỨT ký tự
Hermes chạy ca `93×"a" + "ế" + "Z"` dưới `LC_ALL=C`:
```
nguồn            97 byte · hợp lệ · có «ếZ»
sau cut -c1-95   96 byte · HỎNG   · chỉ còn 2 byte đầu của «ế»
sau iconv -c     94 byte · hợp lệ · nhưng «ế» BIẾN MẤT HOÀN TOÀN
đối chứng ASCII  giống hệt trước/sau
```
🔑 **Câu tôi khai — «iconv KHÔNG xén oan dữ liệu lành» — chỉ đúng với ASCII, SAI với dữ liệu Unicode lành.**
Bản vá chữa **tính hợp lệ cú pháp**, KHÔNG chữa **mất dữ liệu**. Nó đổi «dòng hỏng nhìn thấy được»
thành «dòng thiếu một chữ mà KHÔNG ai thấy» — có thể TỆ HƠN.

⚠️ **VÀ TIÊU CHÍ NGHIỆM THU CỦA TÔI LÀ ĐẠT-RỖNG LẦN THỨ HAI TRONG NGÀY:**
`iconv -c` **luôn luôn** sinh ra UTF-8 hợp lệ — đó là định nghĩa của nó. Nên phép thử «đầu ra có hợp lệ
KHÔNG» **xanh bất kể bản vá đúng hay sai**.
📌 Cùng đúng cái bệnh `claude-aiboss-app-exe` vừa bắt tôi ở tiêu chí «dòng mới hỏng = 0». **Hai tiêu chí
đạt-rỗng do cùng một người viết, trong cùng một ngày, sau khi đã bị chỉ ra một lần.**

✅ **TIÊU CHÍ ĐÚNG — bốn vế, phải thoả CẢ BỐN:**
```
① đầu ra là UTF-8 hợp lệ
② đầu ra là TIỀN TỐ THEO KÝ TỰ đầy đủ của đầu vào — KHÔNG mất ký tự lành do cắt giữa code point
③ ca biên Unicode tại byte 94-96 phải đúng
④ đối chứng ASCII
```
✅ **Hướng chữa thật: CẮT THEO KÝ TỰ, đừng cắt theo byte rồi dọn.** (`cut -c` dưới bảng mã UTF-8, hoặc
`awk`/`python3` cắt theo ký tự.) Vá hiện tại giữ lại vì nó **hơn KHÔNG có gì**, nhưng ghi rõ là NỬA.

### ⏭ VIỆC SINH RA TỪ VÒNG SOI NÀY — **giao `claude-aiboss-app-exe`, KHÔNG phải PM tự làm**
```
P0  · cắt theo KÝ TỰ trong mat-canh-ghe.sh:200, nghiệm thu bằng ĐỦ BỐN vế trên
P1a · TRƯỚC khi làm: tách bạch «tiến trình sống» khỏi «lượt đang bận» — đây là điều kiện cần,
      và nó vừa được chứng minh là chỗ CẢ BA ghế cùng nhầm
P2  · quyết định `pgrep -P` TREO cho tới khi có phép thử phủ đủ 4 ca ở trên
```

---

## 4k. 🧬 MỘT HÌNH LỖI LẶP BA VÒNG TRONG MỘT BẢN VÁ — «một thứ MANG HAI NGHĨA»

> Rút từ ba vòng soi P0 giữa `claude-aiboss-app-exe` và `claude-phong-ban-pm`, 01/09 21:0x-21:1x.
> PM KHÔNG can thiệp vòng nào — ghi lại vì hình này dùng được cho mọi bản vá sau.

```
vòng 1 · chú thích ghi «DỪNG», mã chỉ `break` khỏi vòng THỬ LẠI, vẫn đi tiếp vòng DUYỆT Ô
vòng 2 · nhãn 'loi-thoi' gánh HAI việc: «có lần gọi mới hơn» và «tab vừa ẩn»
vòng 3 · cờ `boDo` gánh HAI tình huống: «chưa biết nên im» và «đã biết hỏng nhưng bỏ dở»
```
🔑 **Mỗi vòng, người vá dừng lại ở đúng tầng mình đang nhìn.** `claude-aiboss-app-exe` tự rút:
*«tôi chữa cái TÊN rồi tưởng đã chữa cái VIỆC — một nhãn sạch KHÔNG cứu được một điều kiện bẩn,
hai thứ đó ở hai chỗ khác nhau trong mã.»*

### ⚠️ HAI VẾ ĐÁNG MANG SANG MỌI BẢN VÁ SAU
```
① CHÚ THÍCH ĐÚNG Ý ĐỊNH MÀ SAI PHẠM VI thì nó CHE đúng chỗ nó tả — nguy hơn chú thích sai hẳn,
   vì người soi đọc rồi TIN, do nó nói đúng thứ mình muốn nghe.
   📌 Và người viết chú thích thường chính là người đọc lại nó khi tự kiểm:
      «tôi đọc LỜI HỨA của mình thay vì đọc MÃ của mình.»
② CÁI SÓT NẰM Ở CA NGƯỜI TA KHÔNG KỂ. Hai vòng đầu đều hỏng ở ca KHÔNG được nêu ra
   (vòng 1: tab ẩn giữa chừng · vòng 2: ô trước đã biết hỏng).
   ⇒ vòng 3 exe liệt kê **bảng sự thật ĐỦ BỐN CA** thay vì chỉ ca người soi nêu. Đó là cách đóng.
```
✅ **NẾP ②, `claude-phong-ban-pm` chốt cho mình 01/09:** *«một vế ĐÚNG nhưng CHƯA CHỨNG MINH ĐƯỢC
thì GIỮ kèm nhãn "chưa xác minh", đừng bỏ.»*
```
ca thật: exe đưa số ⇒ soi SUÝT BỎ vế «tệp dấu từng có». Giữ lại kèm nhãn ⇒ exe đi tra bản ghi
         của chính mình ⇒ tìm ra BA lần ghi tay ⇒ và chỉ khi đó mới lộ hệ quả CÓ ÍCH:
         «dấu xuất xứ phải nằm TRONG lượt dựng, KHÔNG thể là việc làm SAU»
```
🔑 **Bỏ một vế chưa chứng minh được thì mất luôn HỆ QUẢ đi kèm nó** — mà ở ca này, hệ quả mới là
thứ có giá nhất trong cả chuỗi. Số đo mạnh hơn trí nhớ, nhưng **số đo có PHẠM VI**; trí nhớ của
người khác có thể đang giữ đúng cái khoảng mà phép đo KHÔNG chạm tới.

✅ **NẾP ③, `claude-aiboss-app-exe` tự thêm:** trước khi nộp vòng hai, **đo lại
chính những vế đã được chấm ĐẠT ở vòng một**. Lý do: *«bản vá vòng hai là lúc dễ đạp vỡ vòng một nhất
— người vá đang nhìn chỗ MỚI, KHÔNG nhìn chỗ vừa được duyệt.»*

---

## 4l. 🔴 HAI NGƯỜI COMMIT SONG SONG TRÊN MỘT KHO ⇒ MỌI PHÉP ĐO «TRẠNG THÁI HIỆN TẠI» ĐỀU LUNG LAY

> Trong 10 phút ngày 01/09, commit của `claude-aiboss-app-pm` làm hỏng **HAI** phép đo của
> `claude-aiboss-app-exe` — cả hai lần đều **KHÔNG ai cố ý**, và cả hai lần thước đều **trông đúng**.

```
21:19  exe gõ commit SAI cú pháp ⇒ lệnh trượt
       `git log -1` vẫn in ra một commit — của PM, đẩy cùng lúc ⇒ suýt khai «đã commit»
21:1x  exe sinh dấu xuất xứ bản dựng bằng `git rev-parse HEAD`
       chạy SAU khi PM vừa commit ⇒ dấu ghi commit CỦA PM là nguồn của bản dựng
```
🔑 **Cả hai đều là câu hỏi về «BÂY GIỜ»** — `log -1`, `rev-parse HEAD`. Trên kho một người thì
«bây giờ» là của mình; trên kho hai người thì **«bây giờ» có thể là của người kia**, và mốc giờ
còn KHỚP nên KHÔNG có dấu hiệu nào tố.

### ✅ HAI CÁCH CHỮA — dùng cả hai, vì chúng đóng hai chỗ khác nhau
```
① BỀN (ai cũng làm được, KHÔNG cần phối hợp):
   CHỤP trạng thái TRƯỚC khi làm, đừng hỏi lại SAU khi làm.
   · dựng  ⇒ `git rev-parse HEAD` TRƯỚC lúc gõ lệnh dựng, KHÔNG phải sau
   · commit ⇒ so mã băm TRƯỚC/SAU: bằng nhau ⇒ lệnh của mình TRƯỢT
   · và neo vào thứ CHỈ MÌNH có: `git show --stat HEAD | grep '<tệp mình sửa>'`

② PHỐI HỢP (rẻ, giảm tần suất):
   PM KHÔNG commit trong lúc exe đã báo «sắp dựng» / đang dựng.
   PM báo một dòng lên kênh trước khi đẩy commit tài liệu, nếu exe đang làm việc.
```
⚠️ **Chỉ dùng ② là KHÔNG đủ** — nó dựa vào việc hai người nhớ và nhìn thấy nhau đúng lúc. Hôm nay
đã chứng minh ba lần rằng thứ dựa vào TRÍ NHỚ thì KHÔNG phải một biện pháp.

## 4m. 🔑 `postbuild` TRONG `package.json` **CHƯA BAO GIỜ CHẠY** — mã tồn tại KHÔNG có nghĩa mã được chạy

```
package.json CÓ `postbuild` sinh .next/COMMIT
đối chứng: hai bản chụp .next TRƯỚC hai lần dựng hôm nay — CẢ HAI đều KHÔNG có COMMIT
⇒ tệp đó chưa từng tồn tại, KHÔNG phải bị lần dựng nào xoá
```

🔴 **ĐÍNH CHÍNH 01/09 21:4x — Owner hỏi *«tưởng có quy định dùng pnpm thay npm rồi mà?»* và Owner ĐÚNG.**
`claude-aiboss-app-exe` giải thích là *«hook `post*` của npm chỉ chạy qua `npm run`»*; PM chép nguyên
sang cho Owner. **Kết luận đúng, nguyên nhân SAI** — kho này KHÔNG dùng npm:
```
packageManager  : pnpm@10.32.1      ·  có pnpm-lock.yaml (KHÔNG có package-lock.json)
~/Projects/CLAUDE.md khai            :  `pnpm dev` → localhost:4319
```
🔴 **ĐÍNH CHÍNH THỨ BA (21:43) — và lần này lời khai sai là CỦA PM.**
PM viết vào plan: *«pnpm từ bản 7 MẶC ĐỊNH TẮT pre/post ⇒ kể cả `pnpm build` cũng KHÔNG chạy»*.
`claude-aiboss-app-exe` **thử thật ở thư mục vứt đi, lặp hai lần**:
```
pnpm 10.32.1 · `pnpm build`  → postbuild CHẠY  (cả hai lần)
`npm run build`              → postbuild CHẠY  ⇐ ĐỐI CHỨNG DƯƠNG: thước SỐNG
gọi THẲNG nhị phân           → KHÔNG chạy      ⇐ ĐỐI CHỨNG ÂM: đúng cách nhà đang gọi
```
⇒ **pnpm 10.32.1 CÓ chạy pre/post.** Vế «tắt từ bản 7» đúng với pnpm 7, nhưng **pnpm 9 trở đi đã bật
lại** — và kho này chạy 10.32.1. `claude-phong-ban-pm` cũng khai y hệt và cũng đã nhận sai.

🕳 **GỐC LỖI, và nó là của tôi:**
```
tôi chạy : `pnpm config get enable-pre-post-scripts`  →  undefined
tôi suy  : undefined = chưa bật = TẮT
sự thật  : «CHƯA ĐẶT» KHÔNG nói gì về MẶC ĐỊNH — và mặc định ĐỔI giữa các bản pnpm
```
🔑 **Tôi đọc một giá trị CẤU HÌNH rồi suy ra HÀNH VI, thay vì chạy thử hành vi đó.**
Và tôi **KHÔNG hề dựng đối chứng dương** — chưa một lần hỏi «`postbuild` có chạy được KHÔNG, trong
điều kiện nào?». Cả ngày tôi đòi người khác đối chứng dương, rồi tự mình bỏ qua nó ở đúng chỗ này.
⚠️ Đây là lời khai sai THỨ BA về cùng một mục, và là lời **đầu tiên do chính tôi đo ra**.

✅ **NGUYÊN NHÂN THẬT — đo được, chỉ MỘT:**
```
nhà gõ THẲNG `npx next build`, KHÔNG đi qua script gói
⇒ móc `postbuild` KHÔNG BAO GIỜ có cơ hội được gọi
```
📌 **Hai lời giải sai dẫn tới CÙNG MỘT hành động sai:** «đổi trình chạy script là xong» — mà đổi xong
vẫn hỏng, vì thủ phạm là CÁCH GỌI chứ KHÔNG phải trình chạy. Ba đường chữa, chưa chọn:
```
· gộp dấu vào CHÍNH script build: "build": "next build && <sinh dấu>"  ⇒ vẫn cần dựng qua pnpm
· đổi luật dựng sang `pnpm build`                                      ⇒ đụng luật nhà, cần Owner
· giữ sinh dấu BẰNG TAY như exe đang làm                                ⇒ đang chạy, rẻ nhất
```
⚠️ Đây là **quan trọng ✅ khẩn ❌** — xếp hàng, KHÔNG chen.

#### 🔴 ĐÍNH CHÍNH THỨ HAI (21:36) — câu «CHƯA BAO GIỜ được sinh» cũng SAI. Tách làm HAI vế.
`claude-phong-ban-pm` giữ vế «tệp từng có, rồi mất»; `claude-aiboss-app-exe` tra bản ghi phiên của
CHÍNH MÌNH và nhận sai:
```
31/08 20:39:39  exe ghi TAY .next/COMMIT lần 1
31/08 21:01:35  ghi lại lần 2
31/08 21:02:36  ghi lại lần 3 — chú thích exe tự viết lúc đó:
                «Bản dựng 22:01:41 do NGƯỜI KHÁC chạy — nó XOÁ tệp dấu trước đó»
⇒ hiện vật TỪNG tồn tại BA LẦN, và bị lần dựng kế tiếp xoá BA LẦN
```
✅ **Câu đúng phải tách hai vế — gộp lại là chỗ sai:**
```
CƠ CHẾ TỰ ĐỘNG   : chưa bao giờ chạy   (vì hai lý do ở trên — pnpm tắt pre/post + dựng bằng npx)
HIỆN VẬT GHI TAY : đã tồn tại 3 lần, bị XOÁ 3 lần — mọi lần dựng đều quét sạch `.next/`
```
🔑 Hai vế dẫn người đọc đi **hai hướng ngược nhau**: «chưa nối» ⇒ đi nối · «bị xoá» ⇒ đi tìm ai xoá.

💡 **HỆ QUẢ THẬT SỰ, thứ bị bỏ sót khi kết luận sai:** nếu MỌI lần dựng đều xoá `.next/` — kể cả lần
dựng của người khác — thì **ghi dấu xong vẫn mất, mà KHÔNG ai làm gì sai cả**.
⇒ **Dấu xuất xứ KHÔNG thể là một việc LÀM SAU. Nó phải nằm TRONG chính lượt dựng.**
📌 Đây mới là kết luận có ích, và nó chỉ hiện ra sau khi sửa cả hai lời khai sai.

⚠️ **Gốc lỗi exe tự nêu — lại là PHẠM VI:**
```
phạm vi PHÉP ĐO : 2 bản chụp .next của MỘT ngày
phạm vi LỜI KẾT : «CHƯA BAO GIỜ» — toàn bộ lịch sử
```
🔑 Và nặng hơn: exe **tự tay ghi tệp đó, tự tay viết chú thích nói nó bị xoá**, rồi hôm sau khẳng định
điều ngược lại — bằng chứng nằm trong bản ghi của chính mình mà KHÔNG tra.
**Trí nhớ của người khác thắng phép đo của mình, khi phép đo hỏi sai KHOẢNG THỜI GIAN.**

📌 **Và vế PM phải tự ghi:** đây là **lần thứ BA trong ngày** PM chuyển tiếp khung của người khác
mà KHÔNG kiểm tiền đề (① giả thuyết «khởi lại ⇒ sổ trống» của người soi · ② «phiên KHÔNG độc lập» ·
③ lần này). Cả ba lần PM đều kiểm SỐ rất kỹ và KHÔNG kiểm **vật/nguyên nhân**.
🔑 **Người chuyển tin mà KHÔNG kiểm tiền đề thì đang cho cái sai mượn thêm một chữ ký.**
🔑 **Một dòng cấu hình ai cũng đọc thấy mà KHÔNG ai gọi thì nó là LỜI HỨA, KHÔNG phải cơ chế.**
Và nó **tệ hơn việc KHÔNG có gì**: người đọc `package.json` sẽ tưởng bản dựng nào cũng có dấu xuất xứ.
📌 `claude-aiboss-app-exe` hôm qua đã «vá» tệp đó — tức là **vá nội dung của một thứ chưa bao giờ chạy**.
⇒ Dấu xuất xứ nay sinh **BẰNG TAY**, và nó tự khai luôn cả cái bẫy ở 4l: ghi CẢ `COMMIT-DUNG-TU`
lẫn `HEAD-LUC-DONG-DAU`, kèm ghi chú vì sao hai thứ đó có thể khác nhau.

---

## 4n. 🕳 HAI CÁI IM TRONG MỘT VIỆC — P0 nằm trên đĩa 40 phút mà KHÔNG ai báo lỗi

Bản dựng P0 xong lúc **21:17**. Tới **21:5x vẫn chưa nạp**. KHÔNG ai làm sai một bước nào, và
KHÔNG có một thông báo lỗi nào. Hai người cùng đứng im, vì hai lý do khác nhau:

```
① exe  — đọc quyết định HẸP hơn phạm vi thật của nó
     Owner quyết  : một QUY TRÌNH  («round-5 ②C: tự canh, nạp khi cả sáu ô cùng im»)
     exe đọc      : một LẦN CHO PHÉP  ⇒ ngồi chờ một chữ Owner đã nói từ 10:46

② PM  — coi «đã GHI KÊNH» là «đã GIAO»
     PM ghi câu gỡ chặn lên kênh 21:2x rồi đi làm việc khác
     mà chính hồ sơ ghế PM viết: «kênh là chỗ ĐỂ LẠI, KHÔNG phải chỗ GỌI»
     ⇒ hai lượt liền PM báo cáo Owner như thể việc đang trôi
```
🔑 **Cả hai cái im này KHÔNG sinh ra lỗi.** Việc chỉ nằm đó, và người ngoài nhìn vào tưởng nó đang
chạy. Owner là người phát hiện — bằng đúng một câu: *«chưa hề thấy exe nhắc gì tới vụ hẹn nạp»*.

⚠️ **PM có sẵn phép đo mà KHÔNG dùng:** đếm số lần exe nhắc «hẹn nạp» (ra 0, đối chứng dương
`postbuild` ra 17) và đếm tiến trình `hen-khoi-dong-lai-app` (ra 0). **Hai lệnh, mười giây** —
và PM chỉ chạy chúng SAU khi Owner hỏi.
📌 **Giao việc xong phải ĐO xem người ta có NHẬN KHÔNG.** «Đã báo» KHÔNG phải «đã giao»;
«đã giao» KHÔNG phải «đang chạy». Ba trạng thái, và chỉ trạng thái thứ ba mới đẩy việc đi.

🔑 **Hình chung của cả hai:** *đọc một thứ HẸP hơn phạm vi thật của nó*. exe đọc hẹp một quyết định;
PM đọc hẹp nghĩa của chữ «giao». Cùng họ với mọi lỗi phạm vi trong ngày (mục 4h ⑤ · 4j · 4k) —
nhưng hai cái này rơi vào **phối hợp**, KHÔNG phải phép đo. Và phối hợp thì KHÔNG có đối chứng dương
tự nhiên nào: **im lặng của người kia trông y hệt như họ đang làm.**

---

## 4o. ✅ P0 «TAB NGỦ RỒI TỈNH» — **OWNER NGHIỆM THU TRÊN BẢN SỐNG, ĐẠT** (01/09 22:2x)

> ⚠️ **MỤC NÀY CHỨA HAI CA, đừng đọc tiêu đề rồi gạch cả mục** (rà lại 02/09 17:5x):
> · **P0 «tab ngủ rồi tỉnh»** — Owner nghiệm thu bản sống, **ĐẠT**, đóng.
> · **ca Owner chụp ảnh** (khác ca) — **CÒN XẾP HÀNG ở P1b**, xem dòng «⇒ XẾP HÀNG, hạ xuống P1b» dưới.
> 🔑 Tiêu đề chỉ khoe vế ĐẠT nên mục trông như đã đóng trọn. `claude-phong-ban-pm` nêu 17:46 rằng nó
>    KHÔNG đủ cơ sở kết luận — đúng, vì cơ sở nằm trong thân mục chứ không nằm ở nhãn.

> Owner nguyên văn: *«tôi mới tắt màn hình 1 phút quay lại thấy chữ ô này load hết lên, vậy là chạy
> ĐÚNG Ý tôi rồi. TRƯỚC KIA nó sẽ báo fail tôi phải F5.»*

```
TRƯỚC : tắt màn hình → quay lại → «load fail», phải F5, và F5 vài lần mới thấy
SAU   : tắt màn hình 1 phút → quay lại → chữ TỰ load hết lên
```
🔑 **Đây là nghiệm thu duy nhất KHÔNG ghế nào tự cấp được cho mình.** Cả ba ghế đo được «mã đúng ·
dựng xanh · bó có dấu vân · đã nạp» — nhưng câu *«nó có hết đau KHÔNG»* thì chỉ người ĐANG ĐAU trả
lời được. Mọi phép đo của ta là điều kiện CẦN; câu này mới là điều kiện ĐỦ.

### 🔻 VÀ OWNER TÁCH HAI CA MÀ PM ĐÃ GỘP LÀM MỘT
> *«hình tôi chụp chỉ là lỗi load sau khi F5, KHÔNG phải tắt màn hình rồi mở lại. HAI CASE KHÁC NHAU.»*

```
ca ① TẮT MÀN HÌNH rồi mở lại   ⇒ P0 ĐÃ CHỮA XONG  ✅   (Owner xác nhận trên bản sống)
ca ② F5 GIỮA LƯỢT              ⇒ CHƯA chữa, và nó là ca KHÁC HẲN
```
⚠️ **PM đã xếp ca ② là «P0 mới, khẩn ✅» và rung ghế thợ lúc 22:2x. SAI XẾP HẠNG.** Áp lại đúng
hai tiêu chí sau khi Owner nói rõ:
```
ca ② quan trọng ✅  (mất chữ thật)
     khẩn      ❌  (cái đau MỖI NGÀY của Owner là ca ①, và ca ① đã xong.
                    Ca ② chỉ nổ khi Owner CHỦ ĐỘNG F5 giữa lượt — hiếm, và có đường vòng)
⇒ XẾP HÀNG, KHÔNG chen. Hạ xuống P1b (chung gốc «luồng bám lại được»).
```
🔑 **Gốc lỗi xếp hạng của PM:** thấy Owner gửi ảnh kèm chữ «lỗi» thì gán ngay là khẩn, mà KHÔNG hỏi
*«ca này có phải cái đau HÀNG NGÀY KHÔNG, hay là một ca hiếm Owner tự dựng ra để chụp?»*
📌 Cùng họ với mọi lỗi phạm vi trong ngày, lần này ở tầng **XẾP ƯU TIÊN**: PM gộp hai ca khác nhau
vào một nhãn «tab quay lại thì mất chữ», rồi lấy mức khẩn của ca này áp cho ca kia.

---

## 4p. 🔴 TẦNG THỨ BA — máy khách hỏi ĐÚNG MỘT LẦN rồi tin mãi. Đây là tầng Owner NHÌN THẤY.

> `claude-aiboss-app-exe` tìm ra, `claude-phong-ban-pm` đo lại và xác nhận (01/09 22:2x).
> **Nó ĐỘC LẬP với hai tầng ta đã biết** — vá xong ① và ② thì màn hình VẪN nói dối.

```
① sổ nằm trong BỘ NHỚ    ⇒ khởi lại là trống          ⇒ báo THIẾU   (phía máy chủ)
② dsViec KHÔNG kiểm pid  ⇒ tiến trình chết mà sổ còn  ⇒ báo THỪA    (phía máy chủ)
③ MÁY KHÁCH hỏi MỘT LẦN lúc tải trang rồi TIN MÃI     ⇒ màn hình sai (phía trình duyệt)
```
**Số đo:**
```
fetch('/api/dung') trong UngDung.tsx: ĐÚNG 2 chỗ
   :975  POST — Owner bấm nút DỪNG        ·  :1055 GET — chỉ trong đường khôi phục lúc TẢI TRANG
   ĐỐI CHỨNG DƯƠNG 'fetch(' → 11 chỗ ⇒ thước đọc được lời gọi mạng · ĐỐI CHỨNG ÂM cửa bịa → 0
cờ «đang chạy» hạ được ở: :973 (bấm Dừng) · :1671 (CUỐI vòng đọc luồng)
⇒ luồng chết thì :1671 KHÔNG bao giờ tới ⇒ cờ KẸT, và KHÔNG đường tự động nào gỡ
```
🔑 **KỂ CẢ khi sổ máy chủ đúng tuyệt đối, màn hình Owner vẫn sai** — vì nó KHÔNG hỏi lại.
📌 Và nó giải thích trọn ca Owner chụp 31/08: *F5 lần 1 thấy 2 ô · F5 lần 2 thấy 3 ô*.
**Mỗi lần F5 là một lần hỏi mới**, nên số đổi; giữa hai lần F5 thì màn hình đứng im dù sự thật đã đổi.

### 💡 VÀ ĐÂY LÀ THỨ LÀM VIỆC RẺ ĐI MỘT BẬC
> `claude-aiboss-app-exe`: *«bộ bắt bận→rảnh ĐÃ CÓ SẴN (`UngDung.tsx:2137-2146`), chỉ đang nối vào SAI VIỆC»*

Nó phát hiện được ô vừa chuyển từ **bận sang rảnh**, rồi gọi một hàm **KHÔNG đọc lịch sử** — đúng
hàm PM đã đo sáng nay là `napLichSu` xuất hiện **0 lần** trong khối đó.
🔑 **Đồ nghề đã có, dây nối sai chỗ.** Loại phát hiện này đổi bài toán từ «dựng cơ chế mới» thành
«nối lại một dây» — và nó chỉ thấy được khi có người đọc mã, KHÔNG thấy được bằng cách đo hành vi.

### 🎯 XẾP HẠNG — đổi THỨ TỰ, KHÔNG đổi mức khẩn
```
quan trọng ✅  (đây là tầng Owner NHÌN THẤY: đèn sai · F5 mới thấy · ô im sau khi luồng đứt)
khẩn      ❌  (cái đau MỖI NGÀY — tắt màn hình rồi mở lại — đã chữa xong ở P0)
⇒ VẪN xếp hàng. NHƯNG lên ĐẦU hàng P1, TRƯỚC cả P1a.
```
**Ba lý do nó đứng trước P1a:**
```
· RẺ   — bộ bắt bận→rảnh đã có sẵn, chỉ nối lại dây
· ĐỘC LẬP — KHÔNG cần P1a xong trước; vá được ngay
· ĐÚNG TẦNG — nó là tầng Owner thấy, hai tầng kia Owner KHÔNG thấy trực tiếp
```
⚠️ **PM nói rõ: đây KHÔNG phải lần nâng hạng thứ hai.** 22:2x PM đã trót nâng ca F5 lên «khẩn» rồi
phải hạ xuống. Lần này chỉ **đổi thứ tự trong cùng một bậc** — mức khẩn giữ nguyên là ❌.
🔑 Đổi hạng thì phải có lý do MỚI về mức ĐAU; đổi thứ tự thì chỉ cần lý do mới về GIÁ và PHỤ THUỘC.
Hai việc khác nhau, và trộn chúng là cách một hàng đợi mất kỷ luật.

---

## 4q. 🔴 BẢN VÁ VIẾT RA ĐỂ LÀM **THƯỚC XANH**, KHÔNG PHẢI ĐỂ LÀM **VIỆC ĐÚNG**

> Câu của `claude-aiboss-app-exe` (01/09 22:34), nói về bản vá `iconv` của PM. Đây là bài học
> sắc nhất trong ngày, và nó nói về chính người viết plan này.

**Số đo, ba phép, có cả đối chứng âm:**
```
vào : 93 chữ 'a' + 'ế'  = 96 byte
① bản vá của PM (cut | iconv -c)      → 93 byte · đếm chữ 'ế' = 0   🔴 BIẾN MẤT
② cắt theo KÝ TỰ (LC_ALL=…UTF-8 cut)  → 96 byte · đếm chữ 'ế' = 1   ✅ CÒN NGUYÊN
ĐỐI CHỨNG ÂM: chuỗi thuần ASCII ⇒ hai cách ra GIỐNG HỆT
   ⇒ khác biệt CHỈ ở chữ có dấu, KHÔNG phải khác biệt chung chung
```

🔑 **`iconv -c` đạt tiêu chí «utf-8 hợp lệ» bằng cách VỨT chính thứ làm nó KHÔNG hợp lệ.**
Nó chữa đúng **PHÉP ĐO**, KHÔNG chữa **CÁI BỆNH**. Và hậu quả là thứ nguy nhất:
```
phép đo «đếm dòng hỏng mã hoá» sẽ MÃI MÃI báo xanh
trong khi mỗi dòng cắt trúng chữ có dấu vẫn mất một ký tự — IM LẶNG
⇒ vì thước xanh nên KHÔNG ai đi kiểm lại
```
📌 **Đây là tầng nguy nhất trong tất cả các tầng ta gặp hôm nay.** Các tầng kia (thước mù · tiêu chí
đạt-rỗng · sai phạm vi) đều là **đo sai một cái đúng**. Tầng này là **làm sai một cái, rồi chỉnh phép
đo cho nó xanh** — và người làm KHÔNG cố ý, chỉ là chọn cách vá đầu tiên khiến con số đẹp lên.

⚠️ **Và PM đã tự cấp cho mình ba phép đối chứng trông rất chắc** (tái hiện bệnh · vá ăn · ASCII
KHÔNG xén oan). Cả ba đều ĐÚNG, và cả ba đều **KHÔNG hỏi câu quan trọng nhất**:
> *«sau khi vá, DỮ LIỆU có còn nguyên KHÔNG?»*
Chỉ hỏi *«đầu ra có hợp lệ KHÔNG»* — mà `iconv -c` bảo đảm điều đó bằng định nghĩa.

✅ **CÁCH ĐÚNG (đo được):** khai bảng mã UTF-8 cho lệnh cắt ⇒ nó cắt theo KÝ TỰ, giữ nguyên chữ,
và vẫn hợp lệ. `iconv -c` khi đó là **lớp chắn cuối**, KHÔNG còn là lớp chữa chính.

### 🔴 HỆ QUẢ: TIÊU CHÍ NGHIỆM THU CỦA PM CŨNG VÔ NGHĨA — lần thứ BA trong ngày
PM đặt: *«≥42 dòng mới trong sổ tỷ-lệ-nền-cao-nhất, hỏng = 0»*. `claude-phong-ban-pm` xin ghi rõ,
và đúng:
```
số «0 dòng hỏng» sau bản vá iconv KHÔNG phải bằng chứng bản vá ĐÚNG
`iconv -c` bảo đảm «0 dòng hỏng mã hoá» BẰNG ĐỊNH NGHĨA — nó xanh dù ta chữa gốc hay chỉ vứt ký tự
```
`claude-aiboss-app-exe` đang đếm dở (**60 dòng · 0 hỏng**) và **tự RÚT LẠI**: *«chờ thêm 40 dòng nữa
cũng KHÔNG biết thêm gì»*. Đúng — thước đó đã mù từ lúc bản vá được chọn.

📌 **Ba tiêu chí đạt-rỗng, cùng một người viết, cùng một ngày:**
```
① «dòng mới hỏng = 0»          ⇒ đạt khi KHÔNG có dòng mới          (exe bắt, 20:48)
② «đầu ra là utf-8 hợp lệ»     ⇒ iconv -c bảo đảm bằng định nghĩa   (hermes bắt, 21:0x)
③ «≥42 dòng, hỏng = 0»         ⇒ cùng lý do ②, chỉ đổi cỡ mẫu       (phong-ban-pm bắt, 22:36)
```
🔑 Cả ba đều là **tiêu chí đo CÁI DỄ ĐO thay vì cái CẦN BIẾT**. Và ③ đau nhất: nó được viết ra
**SAU KHI** đã bị chỉ ra ①, tức là PM đã biết bệnh mà vẫn tái phát — vì PM chỉ sửa **cỡ mẫu**,
KHÔNG sửa **thứ được đếm**.
✅ **Thước đúng phải đếm thứ KHÁC:** «ký tự lành có còn nguyên KHÔNG» — chứ KHÔNG phải «có byte hỏng KHÔNG».

---

## 4r. 📊 THƯỚC ĐÚNG PHƠI RA CON SỐ THẬT — mất **2/3 ký tự** mà thước cũ vẫn báo xanh

`claude-aiboss-app-exe` dựng `~/Operations/scripts/thu-cat-chuoi.sh` — đếm **ký tự GIỮ ĐƯỢC**
thay vì đếm **tính hợp lệ của byte**. Đổi thứ được đếm, và con số đổi hẳn bậc:
```
                            ranh giới   thuần    TOÀN CHỮ      utf-8      mã
lệnh                        có dấu      ASCII    CÓ DẤU        hợp lệ    thoát
cut trần (bản gốc)          mất 1       ✅       🔴 mất 63     KHÔNG       1
cut | iconv -c (bản vá PM)  mất 2       ✅       🔴 mất 64     CÓ ⇐ BẪY    1
LC_ALL=UTF-8 cut (đúng)     ✅          ✅       ✅            CÓ          0
```
🔑 **Bản vá của PM làm MẤT NHIỀU HƠN bản gốc (64 > 63), mà lại là bản DUY NHẤT báo «hợp lệ».**
Đó là định nghĩa của một bản vá làm thước mù: nó **tệ hơn về việc**, **đẹp hơn về số**.
📌 Và 63-64 ký tự là **2/3 một dòng** — dòng kênh của nhà mình gần như toàn chữ có dấu, nên đây là
cột sát thực tế nhất, KHÔNG phải ca biên.
⚠️ Phạm vi thiệt hại: chỗ cắt đó chỉ dựng **dòng xem trước** trong sổ bộ quét nền, KHÔNG chạm dữ
liệu kênh. Nên đây là **sổ khó đọc**, KHÔNG phải **mất dữ liệu thật** — ghi rõ để đừng ai hoảng.

## 4s. 💀 `matKetNoi` LÀ MỘT **CỜ CHẾT** — món nợ có tên, xin xử dứt điểm

> 🔴 **CẢNH BÁO CHỐNG ĐỌC NHẦM (thêm 02/09 15:3x, `claude-phong-ban-pm` nêu):**
> Bản vá «giữ tay cầm» CÓ sửa `UngDung.tsx` (md5 `f353d9bf…` → `b3867fd2…`) nhưng **KHÔNG chạm lỗ này**.
> Đo lại sau bản vá: `matKetNoi: true` ⇒ **0 lần** (đối chứng dương: `matKetNoi: false` ⇒ 2 · tổng 7
> ⇒ thước sống). **Lỗ CÒN NGUYÊN.**
> 🔑 Rủi ro là chuyện đọc, KHÔNG phải chuyện mã: người sau thấy «tệp đó đã sửa trong bản tay cầm»
> rất dễ đọc thành «tệp đó đã được xử». **Một lần sửa tệp hứa nhiều hơn phần nó thật sự sửa** —
> cùng họ với «chú thích hứa nhiều hơn mã», chỉ khác lối vào.

```
matKetNoi: true   → 0 chỗ    ⇐ KHÔNG ai bật nó
matKetNoi: false  → 2 chỗ    ⇐ chỉ có chỗ TẮT
matKetNoi mọi kiểu → 7 chỗ   ⇐ có kiểu dữ liệu, có chữ hiển thị, có chỗ vẽ
ĐỐI CHỨNG DƯƠNG: 'dangChay: true' → 1 chỗ ⇒ thước BẮT ĐƯỢC cờ có bật ⇒ số 0 kia là THẬT
```
🔑 **Bảy chỗ nhắc tới nó, KHÔNG chỗ nào bật nó.** Người đọc mã thấy đủ bộ — kiểu, chữ báo, chỗ hiển
thị — và kết luận «app CÓ báo mất kết nối». Nó KHÔNG có.
📌 Cùng họ `postbuild` (mục 4m): **mã tồn tại KHÔNG có nghĩa mã được chạy.** Nhưng ca này **kín hơn**:
`postbuild` nằm im một chỗ, còn cờ này **rải bảy chỗ** nên nhìn càng giống một cơ chế sống.
✅ **Xử dứt điểm — hoặc NỐI vào, hoặc XOÁ hẳn.** Để nguyên là để một **lời hứa giả** trong mã.
⚠️ Xếp **P2** (quan trọng 🟡 · khẩn ❌): nó KHÔNG gây hại đang chạy, nhưng nó **nói dối người đọc mã**,
và ba ghế đã mất thời gian vì đúng loại này hai lần trong một ngày.

---

## 4t. 🧨 BIẾN THỂ THỨ BA: **tiêu chí tự thoả mãn được bằng THẤT BẠI**

> `claude-aiboss-app-exe` bắt được (02/09 08:26), **ngay trong cái cổng nghiệm thu cả đội vừa chốt**.

```
:2213 cũ   if (ket === 'bo-do') break;
           oNoNapLai.current.delete(i);   ⇐ 'hong' CŨNG xoá nợ, mà ô đó CHƯA nạp được
           daTra += 1;                    ⇐ và đếm một lần TRƯỢT thành một lần CỨU
```
🔑 `daTra` chính là con số ta chốt làm **cổng nghiệm thu** («daTra ≥ 1 ⇒ bản vá đang cứu thật»).
Để nguyên thì **cổng đó xanh được bằng một lần nạp TRƯỢT** — nó đo đúng số lần CHẠM, KHÔNG đo số
lần CỨU ĐƯỢC.

### 📐 BA BIẾN THỂ CỦA CÙNG MỘT BỆNH — nay đủ bộ, ghi lại để nhận ra lần sau
```
① thoả bằng MẪU RỖNG      «dòng mới hỏng = 0»      ⇒ xanh khi KHÔNG có dòng mới nào
② thoả bằng ĐỊNH NGHĨA     «đầu ra utf-8 hợp lệ»    ⇒ `iconv -c` bảo đảm điều đó, luôn luôn
③ thoả bằng THẤT BẠI       «daTra ≥ 1»              ⇒ một lần nạp TRƯỢT cũng cộng vào
```
⚠️ **③ kín nhất trong ba.** ① và ② còn có thể nhận ra bằng cách đọc kỹ tiêu chí. ③ thì tiêu chí
nghe **hoàn toàn đúng** — «đếm số lần trả nợ thành công» — và cái sai nằm ở **chỗ tăng biến đếm**,
cách xa chỗ phát biểu tiêu chí. Người viết tiêu chí và người viết chỗ đếm có thể là hai lúc khác nhau
của cùng một người.
✅ **Cách chữa exe dùng:** gom luật xoá nợ về MỘT hàm ở tầng module, và khai rõ trạng thái nào mới
tính là xong (`'hong'` và `'bo-do'` ⇒ **GIỮ nợ**). `daTra` nay chỉ đếm lần nạp THẬT SỰ xong.
📌 Và nó tự đi thêm một bước ngoài chữ của người soi — nhưng **khai rõ là bước tự đi**, kèm cách lùi
(«revert phần `:2213` là đủ, phần `:2139` đứng độc lập»). Đó là cách mở rộng phạm vi đúng: **làm thêm
thì được, nhưng phải nói ra và phải để lại đường lùi riêng cho phần làm thêm.**

🔑 **Luật rút cho mọi cổng nghiệm thu sau này:** hỏi ba câu, KHÔNG phải một —
```
· cổng này có xanh được khi KHÔNG có dữ liệu KHÔNG?        (mẫu rỗng)
· có xanh được do chính công cụ bảo đảm KHÔNG?              (định nghĩa)
· có xanh được khi việc THẤT BẠI KHÔNG?                     (thất bại)
```

---

## 4u. 🛑 NGƯỜI SOI NGOÀI NHÀ: FAIL 5/6 · NO-GO — và **bản vá KHUẾCH ĐẠI một lỗi có sẵn**

> `hermes-aiboss-app-review` 02/09 09:4x, soi CÂY LÀM VIỆC (bản vá chưa commit).

### 🎯 ĐIỂM MÙ CHUNG (câu ⑥) — nguy hơn tất cả những thứ ta đang vá
> *cả ba coi «kết thúc đường xem SSE» là «tiến trình đã xong»*
```
api/chat/route.ts:260-268  cancel() CỐ Ý KHÔNG giết con — con chạy tiếp, đúng thiết kế
api/chat/route.ts:240      finally gọi xoaViec(maO, pid) VÔ ĐIỀU KIỆN
enqueue :214 :216 :218 :221 KHÔNG bọc try (chỉ nhịp tim :155 có bọc)
⇒ trình duyệt rời ⇒ enqueue ném ⇒ vòng thoát ⇒ finally ⇒ SỔ BỊ XOÁ trong khi CON VẪN CHẠY
```
**Hậu quả:** tiến trình vẫn ghi `.jsonl` · sổ đã xoá · `/api/dung` báo RẢNH · nút Dừng biến mất ·
bộ chạy nền tưởng ghế rảnh. Và **chốt ① của PM vô dụng ở đây**: `kill(pid,0)` KHÔNG có pid nào để
kiểm, vì dòng đã bị xoá.
```
hôm qua : «PID tồn tại»           bị coi là «lượt đang bận»
hôm nay : «consumer SSE kết thúc» bị coi là «child process kết thúc»
⇒ cùng họ, cao hơn một tầng: tầng VÒNG ĐỜI
```

### 🔴 VÀ VẾ `claude-aiboss-app-exe` TỰ NÓI RA — bản vá KHUẾCH ĐẠI lỗi có sẵn
```
TRƯỚC bản vá : máy khách đọc sổ đó ĐÚNG MỘT LẦN mỗi lần tải trang
SAU  bản vá  : đọc MỖI 5 GIÂY
⇒ một dòng bị xoá oan nay được BƠM LẠI liên tục thay vì chỉ sai tới lần tải kế
```
🔑 **Lỗi có sẵn cộng bản vá đúng-ý-định = lỗi tệ hơn.** Bản vá KHÔNG tạo ra lỗi ⑥, nhưng nó biến
một lỗi *thỉnh thoảng* thành một lỗi *liên tục*. Ai chỉ hỏi «bản vá có tạo lỗi mới KHÔNG» sẽ trả lời
KHÔNG — và bỏ sót câu đúng: **«bản vá có làm lỗi CŨ nặng thêm KHÔNG?»**
📌 Đây là câu thứ TƯ phải thêm vào bộ cổng nghiệm thu (ba câu cũ ở mục 4t).

### ⚠️ BIÊN AN TOÀN — suýt hỏng, và ghi ra để biết mình may tới mức nào
```
bộ hẹn nạp ĐANG canh, và ô cuối cùng nó chờ CHÍNH LÀ ô của exe
⇒ exe trả lời xong lượt đó là nó NẠP NGAY
⇒ lệnh NO-GO tới trong ĐÚNG lượt đó. Chậm MỘT lượt là bản 5-FAIL đã lên app Owner.
```
🔑 Và bản đó **dựng từ mã CHƯA commit** ⇒ nếu nạp, app Owner sẽ chạy một thứ **KHÔNG ứng với commit
nào**, KHÔNG dựng lại được, KHÔNG lùi được bằng `git`.
📌 **Luật rút ra: KHÔNG hẹn nạp khi vòng soi ngoài nhà chưa trả lời.** Bộ hẹn tự canh là thứ tốt,
nhưng nó KHÔNG biết có ai đang soi — nó chỉ biết sáu ô có im hay KHÔNG.

### 📊 CHẤM ĐIỂM CÁC QUYẾT ĐỊNH CỦA PM
```
① GIỮ đường nâng lúc tải trang        → PASS  (quyết định duy nhất đứng vững)
③ mở lại NÂNG ngay sau chốt ①          → FAIL  (phải chờ CẢ HAI chốt)
② `kill(pid,0)` đóng lỗ dòng rác       → FAIL  (pid dùng lại · zombie · EPERM · sống mà KHÔNG thuộc ô)
④ còn đua khi hạ cờ giữa lúc tab xả chữ → FAIL
⑤ ba đường nạp có thể chồng nhau        → FAIL
```
⚠️ **Lỗi hợp đồng trong bản vá:** sổ CÓ `ma_nhan_su` (`kho-tien-trinh.ts:19-28`) nhưng
`/api/danh-thuc/nhan` VỨT trường đó, chỉ trả `ma_o`; máy khách dựng Set chỉ từ mã ô.
⇒ **danh tính LƯỢT mất trên đường truyền** — cùng một ô đổi ghế/phiên thì KHÔNG phân biệt được.

---

## 4v. 🔇 NÚT DỪNG: vế an toàn của bản vá đứng trên MỘT ĐƯỜNG LÙI **KHÔNG TỒN TẠI**

`claude-phong-ban-pm` chốt: đọc KHÔNG được dấu vân giờ khởi thì **KHÔNG bắn**, và biện hộ bằng:

> *Owner mất đường Dừng TRONG app — còn giết được từ cửa sổ dòng lệnh ⇒ LÙI ĐƯỢC.*

**Đo tại nguồn (02/09 ~10:26, `claude-aiboss-app-pm`):**
```
UngDung.tsx:975-979
   await fetch('/api/dung', { method:'POST', … });
   ← hết. KHÔNG .json() · KHÔNG đọc da_giet · KHÔNG đọc pid
UngDung.tsx:980   catch { /* mạng chập thì bấm lại */ }
```
⇒ Máy khách **vứt câu trả lời đi**. Khi dấu vân đọc hỏng:
```
máy chủ : KHÔNG bắn, trả da_giet:false          ← đúng, an toàn
màn hình: y hệt lúc dừng THÀNH CÔNG              ← Owner tưởng xong, bỏ đi
sự thật : tiến trình VẪN CHẠY, vẫn tiêu tiền
```
🔑 **Nguyên tắc phải sửa lại cho đủ:** «chọn MẤT MÁT thay vì RỦI RO» chỉ đúng khi **cái mất
được NÓI RA**. Mất trong im lặng thì nó KHÔNG còn là mất mát — nó là **một lời nói dối mới**,
đúng con bệnh đang chữa, chỉ dời từ cuốn sổ sang cái nút. Đường lùi mà người dùng KHÔNG biết
là cần lùi thì bằng KHÔNG có.

**CHỐT của @app-pm (02/09):** giữ vế «KHÔNG đọc được thì KHÔNG bắn», kèm điều kiện cứng —
```
① máy chủ: THÊM vi_sao ∈ { khong_co_viec · dong_rac · khong_doc_duoc_dau_van }
           GIỮ da_giet kiểu boolean (KHÔNG đổi hình dạng cửa API)
② máy khách: ĐỌC phản hồi, riêng ca ③ HIỆN một câu kèm PID THẬT
③ hai phần vào CÙNG MỘT lần vá — tách ra là để lại một quãng nút Dừng câm mà mặt vẫn tươi
```
`ps -o lstart=` chỉ có ở macOS/Linux ⇒ máy khác hệ rơi vào ca ③ MỌI lần bấm. Có ①②③ thì
giả định môi trường đó hiện ra bằng một câu chữ, thay vì bằng một cái nút chết câm.

---

## 4w. 🔔 MỘT TRƯỜNG LÝ DO CÓ SẴN, KHAI LÀ **BẮT BUỘC**, VÀ RỖNG 4/4

> 🔗 **VẪN MỞ — nhưng KHÔNG còn là điểm khởi đầu.** `vi_sao_bo` của kho chuông chưa vá, giữ nguyên mục.
> Nhưng **ba ca cùng họ đã được xử trong ngày 02/09**, ghi ra đây để người mở plan tuần sau khỏi
> tưởng chưa ai học được gì từ nó:
> ```
> ① vi_sao nút Dừng        ĐÃ vá · có chốt vét `never` · ĐANG CHẠY trên máy chủ (đo 17:38)
> ② KetGhiSo giá trị trả về không ai đọc   @exe vá
> ③ pidDangChay biến chết                  @exe gỡ
> ```
> 🔑 `claude-phong-ban-pm` nêu 17:46: danh sách treo nói dối theo **HAI chiều ngược nhau** —
>    mục ĐÃ XONG còn nằm đó (rủ làm lại), và mục CHƯA XONG nhưng đã có ba bản vá quanh nó
>    (người đọc tưởng chưa ai chạm ⇒ làm lại từ đầu, **và mất luôn bài học**).
> 📌 Cả hai chỉ lộ ra khi có người **đọc danh sách rồi đối chiếu với thực tế**. Đọc một mình
>    thì danh sách lúc nào cũng nhất quán với chính nó.

Nhặt được đúng lúc đi giao việc — chuông rơi, mở sổ chuông ra đọc thì thấy (02/09 10:27):
```
10:19:54 o-3 phong-ban-pm  tu=claude-aiboss-app-exe  bo   vi_sao_bo=None
10:20:04 o-3 phong-ban-pm  tu=mat-canh-kenh          bo   vi_sao_bo=None
10:23:51 o-2 app-pm        tu=mat-canh-kenh          bo   vi_sao_bo=None
10:24:14 o-4 app-exe       tu=claude-aiboss-app-pm   bo   vi_sao_bo=None
```
```ts
src/lib/kho-danh-thuc.ts:108
   /** Vì sao bỏ — BẮT BUỘC khi `trang_thai === 'bo'`. */
```
**4 trên 6 chuông trong 10 phút bị bỏ. Cả bốn KHÔNG ghi lý do — dù mã khai là bắt buộc.**

🔑 **Bài học ghép thẳng vào 4v:** thêm một trường lý do **mới là MỘT PHẦN BA việc**.
```
① có trường trong cửa API        ← phần dễ, ai cũng nhớ
② có người GHI ở MỌI lối thoát   ← chỗ rơi
③ có người ĐỌC và HIỆN ra        ← chỗ rơi
thiếu ② hoặc ③ ⇒ y hệt vi_sao_bo: một trường đẹp, rỗng, và làm người soi YÊN TÂM GIẢ
```
⇒ Nghiệm thu `vi_sao` của `gietViec` phải là: **chỉ ra ĐỦ các lối ra** đều có gán, và **đối
chứng dương** — ép rơi vào ca ③ rồi xem màn hình có hiện đúng pid hay KHÔNG.

**🕳 Cái giá đã trả bằng người thật:** chuông exe rung `@phong-ban-pm` lúc 10:19:54 **bốc hơi**,
chuông @app-pm rung exe lúc 10:24:14 **bốc hơi**. Từ 10:20 tới 12:31 — **2 giờ 11 phút** — exe
ngồi im. Nhìn từ ngoài thì đọc thành «ô thợ ngồi chơi». **Đọc thế là SAI: lệnh chưa bao giờ tới
nơi.** Rung lại lúc 12:31 khi Owner đang mở tab ⇒ **tới sau 10 giây**.
📌 Chuông chỉ đi được khi trình duyệt Owner mở app VÀ tab đang HIỆN. Tab bị che ⇒ vòng thăm dò
ngủ ⇒ mọi lệnh giao rơi vào hư không, **và KHÔNG một dòng nào báo.**
⚠️ Nếp bắt buộc từ nay: **rung xong phải ĐO `mtime` bản ghi ghế kia. HTTP 200 chỉ là XẾP HÀNG.**

**Xếp hạng (theo luật hai tiêu chí):** ghi `vi_sao_bo` cho đủ = **quan trọng ✅ · khẩn ❌**
⇒ vào hàng đợi, KHÔNG chen ngang P0. Nhưng nó là **thứ hai** sau P0, vì mọi việc giao trong
hệ này đều đi qua cái chuông đó.

---

## 4x. 🧷 BA LUẬT RÚT RA LÚC VÁ `vi_sao` (02/09 12:36-12:45)

**① KHÔNG biết thì KHÔNG suy — và KHÔNG biết thì cũng KHÔNG được XOÁ.**
`claude-aiboss-app-exe` tự bắt lỗi trong chính bản vá của mình: ca `khong_doc_duoc_dau_van`
đang `SO.delete(maO)` rồi mới trả về.
```
vừa thừa nhận KHÔNG xác minh được  ⇒ cũng KHÔNG có cơ sở để XOÁ
xoá ⇒ tiến trình còn sống, sổ trống ⇒ nút Dừng biến mất ⇒ rơi LẠI vào câu ⑥
```
Nay ca đó **GIỮ dòng**. Nó lộ ra vì bị buộc kể **TỪNG lối ra làm gì với sổ** — bảng bốn dòng đó
KHÔNG phải thủ tục giấy tờ, nó là thứ đã bắt được lỗi.

**② Trường bắt buộc thì khai bằng KIỂU, đừng khai bằng CHÚ THÍCH.**
```
vi_sao_bo   khai «BẮT BUỘC» trong chú thích  ⇒ rỗng 4/4, KHÔNG ai biết   (xem 4w)
vi_sao      khai bằng kiểu, KHÔNG dấu `?`     ⇒ bỏ ở bất kỳ lối nào ⇒ tsc CHẶN (thử đủ 4/4)
```
🔑 **Lời hứa trong chú thích chỉ ràng buộc người ĐÃ ĐỌC nó. Kiểu ràng buộc cả người chưa từng nghe.**

**③ Đừng gộp thứ ĐO ĐƯỢC vào thứ KHÔNG đo được rồi bỏ cả cụm.**
exe xếp trọn phép thử ca ③ vào ô bất khả thi vì «cần trình duyệt». Chia ra thì hai phần ba
đo được bằng `curl`:
```
③a máy chủ trả đúng vi_sao + đúng pid   curl được   ⇐ bắt buộc
③b máy khách ĐỌC được JSON đó           curl được   ⇐ bắt buộc
③c chữ HIỆN ra màn hình                 cần MỘT lần nhìn bằng mắt
```
📌 **Việc chỉ-Owner-làm-được phải là thứ CUỐI CÙNG còn lại**, và chỉ tiêu tới sau khi máy đã xanh.
Bắt Owner nhìn một thứ mà `curl` đã đủ bác bỏ là tiêu nhầm thứ đắt nhất trong hệ này.

⚠️ **Ép ca ③ thì phải dọn sạch:** md5 trước → sửa tạm → đo (kèm ĐỐI CHỨNG ÂM: một lần Dừng
bình thường phải KHÔNG ra `vi_sao` đó) → `git checkout -- <tệp>` → md5 lại, phải TRÙNG.
**KHÔNG dùng `reset --hard`** (xoá việc người khác trong cùng cây). Bản vá tạm CẤM vào commit —
đã có ca `9cb977d` mang theo mã chưa ai soi.

---

## 4y. 🔌 OWNER HỎI 02/09 ~12:50: «có mắt canh riêng, có nhịp tim riêng rồi, sao vẫn phải mở trình duyệt gõ *làm tiếp đi* thì anh em mới gọi nhau?»

> Owner dặn: **chưa gấp thì xếp vào đây xử sau.** Mục này là chỗ xếp — kèm ĐỦ số đo để
> người làm sau KHÔNG phải đo lại từ đầu.

### ① Vì sao vẫn kẹt — mắt canh KHÔNG hỏng, hỏng ở CHẶNG CUỐI

```
mắt canh (launchd, 6 bộ, StartInterval 90)  ✅ sống ngoài lượt, chính nó đánh thức PM hôm nay
   ↓ ghi vào hàng đợi  POST /api/danh-thuc   ✅ chạy, trả 200
   ↓ ai RÚT mẩu ra và KHỞI một lượt?         🔴 ĐÚNG MỘT NGƯỜI: TRÌNH DUYỆT
   ↓ ghế chạy
```
🔑 **Trình duyệt KHÔNG phải cái chuông — nó là ĐỘNG CƠ.** Đo 31/08 (đã ghi trong
`chay-mot-luot.ts`): `/api/chat` là đường DUY NHẤT sinh ghế, và nó được gọi từ ĐÚNG MỘT chỗ —
`UngDung.tsx`. Tab bị che ⇒ vòng thăm dò ngủ ⇒ mẩu nằm im 3 phút rồi hết hạn.
📌 Nên thêm mắt canh nữa KHÔNG cứu được. Chuông kêu to hơn KHÔNG làm động cơ nổ máy.

### ② 🟢 THỨ OWNER HỎI **ĐÃ ĐƯỢC DỰNG RỒI** — 576 dòng, đã vào kho, và đang **TẮT**

```
src/lib/chay-mot-luot.ts   191 dòng   tách LÕI chạy một lượt ra khỏi VỎ HTTP/SSE
src/lib/may-chay-nen.ts    385 dòng   máy chủ TỰ rút mẩu khỏi hàng đợi và chạy
src/lib/khoi-dong-nen.ts             công tắc, bật từ mọi cửa runtime 'nodejs'
commit 423696f · 20916a1 · 8f4e1ac   (P0-2c, viết 31/08 đúng cho câu than này của Owner)
```
**Bằng chứng nó đang TẮT — lời khai của CHÍNH APP, KHÔNG phải suy luận:**
```
~/Operations/logs/phong-ban-lan.log:52266   ← đúng lần khởi 08:43 của máy chủ đang chạy
  [chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.
launchctl print com.eroca.phong-ban-lan → environment KHÔNG có CHAY_NEN
plist KHÔNG có khoá EnvironmentVariables
```
⚠️ **Bẫy đo đã cắn khi tìm câu này:** `ps eww <pid>` để đọc biến môi trường ⇒ macOS KHÔNG cho,
trả rỗng. Đối chứng dương cứu: `PATH` cũng ra **0 lần** ⇒ thước chết ⇒ số kia vô giá trị.
**Sổ log của app mới là nguồn nói thật.**

Tắt là **CỐ Ý**: *«Bật là một QUYẾT ĐỊNH nhìn thấy được, KHÔNG phải hệ quả của việc nạp.»*

### ③ 🔴 VÌ SAO CHƯA BẬT ĐƯỢC HÔM NAY — nó ĂN ĐÚNG cuốn sổ đang hỏng

Đọc MÃ, KHÔNG đọc chú thích:
```
may-chay-nen.ts:162   const dangChayTheoGhe = new Set(dsViec().map(v => v.ma_nhan_su));
may-chay-nen.ts:180   if (dangChayTheoGhe.has(...)) → BỎ QUA
```
`dsViec()` chính là cuốn sổ P0 đang chữa — **sổ nói dối được CẢ HAI CHIỀU**.
```
sổ báo THIẾU (câu ⑥, đã bắt tại trận)  ⇒ chốt ② hở ⇒ bộ nền khởi lượt THỨ HAI
                                       ⇒ ghế chạy hai lần, Owner trả tiền hai lần
```
Chính tệp đó gọi ca này là **«ca ĐẮT NHẤT»**.
⚖️ **Nói cho công bằng:** còn một chốt ĐỘC LẬP ở `:254` (`dangChayNoiKhac`, đọc mốc tệp `.jsonl`
chứ KHÔNG đọc sổ) — nhiều khả năng nó đỡ được. **Nhưng CHƯA AI ĐO.**
📌 «Nhiều khả năng đỡ được» KHÔNG phải giấy phép bật một thứ mà giá của sai là tiền thật.

### ④ ĐƯỜNG ĐI — bốn bước, mỗi bước có cổng riêng

```
B0  🆕 HAI CỬA SINH TIẾN TRÌNH PHẢI DÙNG CÙNG MỘT KHOÁ, TRÊN TRỤC Ô  (thêm 02/09 13:5x)
    · /api/chat khoá theo Ô (`datCho(maO)`) · may-chay-nen khoá theo GHẾ (`dangChayTheoGhe`)
    · hai khoá KHÁC TRỤC thì KHÔNG bao giờ chặn được nhau
    · đo: may-chay-nen.ts có `datCho` 0 lần · đối chứng dương chat/route.ts có 2 lần ⇒ thước sống
    🔑 Trục Ô duy nhất theo CẤU TRÚC (đúng 6, khoá o-1..o-6). Trục GHẾ duy nhất chỉ theo THÓI QUEN
       — `api/o/route.ts` KHÔNG có phép kiểm nào cấm một ghế ngồi hai ô.
    🔴 Bật CHAY_NEN=1 mà chưa làm B0 ⇒ mở đúng cuộc đua: hai tiến trình cho MỘT ô,
       Owner trả tiền HAI LẦN. Chính `may-chay-nen.ts` gọi đây là «ca ĐẮT NHẤT».
B1  xong P0 sổ tiến trình (đang chạy)     ⇒ dsViec hết nói dối ⇒ chốt ② mới đứng được
B2  ĐO chốt :254 MỘT MÌNH: ép sổ báo thiếu, xem bộ nền có khởi lượt hai KHÔNG
    ĐỐI CHỨNG DƯƠNG bắt buộc: ép ca chắc chắn PHẢI khởi ⇒ nó có khởi thật KHÔNG
B3  bật CHAY_NEN=1 ở plist · khởi lại · ĐÒI sổ log in dòng BẬT (đừng đòi dòng TẮT vắng mặt)
B4  nghiệm thu THẬT: đóng hẳn trình duyệt · rung một ghế · ĐO mtime .jsonl ghế đó
    ⇐ đây mới là câu trả lời cho Owner. Mọi bước trên chỉ là điều kiện.
```

### ⑤ XẾP HẠNG — **quan trọng ✅ · khẩn ❌ ⇒ NGAY SAU P0, KHÔNG chen ngang**
Đau MỖI NGÀY (02/09 mất **2 giờ 11 phút**: hai lệnh giao bốc hơi, ba ghế đứng im, Owner phải
làm người đưa tin). Nhưng B1 là **điều kiện nhân quả** của B3 — bật trước khi sổ hết nói dối là
đổi «việc đứng im» lấy «chạy hai lần và trả tiền hai lần». Đứng im thì thấy được; trả tiền hai
lần thì KHÔNG.
📌 Xếp sau P0 ở đây KHÔNG phải thủ tục xếp hàng — **là dây chuyền nhân quả.**

---

## 4z-bis. 🔔 KHÔNG AI BÁO CHO PM KHI **HERMES** XONG VIỆC — 32 phút chết đo được (02/09 22:2x)

> Owner bắt tại trận: *«sao ghế nào cũng ngồi im»* · và hỏi đúng gốc: *«em vẫn không dùng heartbeat gì
> khi rung và chờ hả? nên cái chuông nó chết theo em»*

### 📏 ĐO 02/09 22:4x — hạ tầng CÓ SẴN, chỗ hở nằm chỗ khác
```
launchd mat-canh-*        5 mục ĐANG NẠP, có cả ghế exe · StartInterval 90 giây   ⇒ hạ tầng CÓ
phanh trong mat-canh-ghe.sh:  TRAN=68 lần / cửa sổ 3600s · CACH=300s giữa hai lần rung
mắt canh `nohup` của PM   0 tiến trình còn sống — chỉ còn 7 tệp log rỗng
                          ⇒ chúng CHẾT theo ranh giới phiên, nên GIỮA HAI LƯỢT của PM: KHÔNG có gì canh
chuông tay PM rung 22:35  exe nhặt lúc 22:49 ⇒ TRỄ ~14 phút (90s dò + 300s giãn + kiểm ghế-đang-im)
```

### 🔑 BA VẾ KHÁC NHAU, TRƯỚC NAY BỊ GỘP LÀM MỘT
```
① chuông tay `/api/danh-thuc`   nhanh, nhưng HẾT HẠN 3 phút và KHÔNG có lần rung lại
                                 tab không hiện đúng ô ⇒ rơi im lặng (đo 2 lần trong ngày)
② mắt canh launchd               BỀN, sống ngoài lượt — nhưng nó canh **KÊNH**, không canh **CHUÔNG**,
                                 và giãn 5 phút ⇒ nó là đường CHẬM MÀ CHẮC
③ báo cho PM khi việc XONG       🔴 KHÔNG TỒN TẠI với **Hermes** — Hermes không có ghế, không có kênh
                                 riêng, kết thúc phiên là hết. Quên ghi kênh ⇒ KHÔNG ai sửa được nữa.
```
🕳 **Ca thật:** 21:48 giao reviewer, xong 21:55 (6m49s, 58 lượt gọi, KHÔNG lỗi) — **không ghi kênh**.
21:30 giao web-noibo, chạm trần 60/60 lượt — **không ghi kênh**. PM canh KÊNH ⇒ với PM cả hai vẫn
«đang chạy». **32 phút mọi ghế ngồi im, và Owner là người phát hiện.**

📌 **Ghế Claude còn LƯỢT SAU để sửa việc quên báo. Hermes thì KHÔNG.** Với Hermes, «quên báo» là
lỗi vĩnh viễn — nên chỗ canh phải nằm NGOÀI Hermes, không thể trông vào kỷ luật của nó.

### 🔧 VIỆC — chưa giao, xếp hàng
```
· một mắt canh launchd canh THƯ MỤC LOG Hermes (~/Operations/logs/hermes-*.log):
  log ngừng lớn > N giây mà PM chưa ghi kênh về nó ⇒ rung PM
· PM đổi nếp: rung tay xong PHẢI đo mtime ghế kia rồi mới được nói «đã giao»
  (đã áp dụng từ 22:35, nhưng đó là kỷ luật, chưa phải cái chặn)
```
⚖️ quan trọng CÓ · khẩn KHÔNG ⇒ XẾP HÀNG. Nhưng nó là loại **tự trả tiền ngay**: hôm nay mất 32 phút,
và cái mất KHÔNG phải 32 phút — mà là Owner phải làm người đi hỏi.

## 4z. 🔁 MẮT CANH GỌI LẠI VỀ TIN ĐÃ XỬ — mỗi lần là MỘT LƯỢT CHẠY THẬT, tiền thật

> 📏 **CA ĐO ĐƯỢC #2 — 02/09 18:1x, chính ghế `claude-aiboss-app-pm`:** mắt canh báo *«có 2 tin mới»*.
> Ba tin cuối trên kênh: **18:08 của TÔI · 18:00 của @phong-ban-pm (đã đọc, đã trả lời lúc 18:14) ·
> 18:14 của TÔI**. ⇒ Hai «tin mới» ấy là **hai tin do chính tôi vừa ghi**.
> 🔑 Bộ đếm đang đếm **DÒNG MỚI TRONG TỆP**, chứ không đếm **TIN GỬI CHO MÌNH MÀ MÌNH CHƯA ĐỌC**.
>    Hai câu đó trùng nhau ở mọi ca, TRỪ ca người đọc cũng là người ghi — mà đó lại là ca thường nhất,
>    vì ghế nào cũng vừa đọc kênh vừa ghi kênh.
> 💸 Giá: mỗi lần đánh thức = **một lượt chạy thật, tiền thật của Owner**. Hôm nay ≥2 lần.
> 🔧 Bản vá rẻ nhất: bỏ qua tin có `FROM: <chính mã ghế đang canh>` khi đếm. **Giao `claude-aiboss-app-exe`**
>    (script sống, KHÔNG phải việc PM). ⚖️ quan trọng CÓ · khẩn KHÔNG ⇒ vẫn XẾP HÀNG, KHÔNG chen.

**Đo 02/09 12:49 (sổ của chính mắt canh, `~/Operations/scripts/.mc-<ghế>/log`):**
```
12:43:33  rung 2/68  · quét tới dòng 23229
12:43:16            ← tin verdict của @phong-ban-pm nằm ở dòng 23231, tức SAU mốc quét
12:45     PM tự đọc kênh, KHÔNG chờ mắt canh
12:47     PM trả lời xong, đăng chốt
12:49:33  rung 3/68  · «1 tin · đầu: [12:43] FROM: claude-phong-ban-pm»   ⇐ tin ĐÃ XỬ XONG
```
🔑 **Mắt canh KHÔNG sai.** Nó lọc đúng tin của chính mình (`:161 grep -vE "FROM: $TOI"`), và nó
gọi đúng một tin có thật gửi cho mình. Chỗ lệch là **NHỊP**: nó quét 90 giây một lần, còn ghế thì
đọc kênh ngay khi đang chạy. Ghế đi trước cái mốc.

⇒ Hệ quả: **một lượt chạy đầy đủ bị tiêu cho một tin đã xử xong.** Ghế phải mở tệp, đọc, đối chiếu,
rồi mới biết là mình đã làm rồi.

🔧 **Hướng (chưa làm):** ghế nào tự đọc kênh thì tự đẩy `.moc` của mắt canh tới **số dòng ĐÚNG LÚC
NÓ ĐỌC** — KHÔNG phải tới cuối tệp.
⚠️ Đẩy tới cuối tệp là **nuốt mất** tin vừa tới trong lúc mình đang đọc. Cái sửa này hỏng về phía
NGUY HIỂM nếu làm ẩu, nên phải kèm đối chứng: sau khi đẩy mốc, tin kế tiếp vẫn phải gọi được.

**Xếp hạng: quan trọng ✅ · khẩn ❌.** Tốn tiền đều đặn nhưng KHÔNG chặn việc nào.
📌 Ghi lại cả chuyện tôi mất ba lượt đo mới ra kết luận «KHÔNG phải lỗi». Việc đo thì hấp dẫn,
nhưng nó đúng loại việc mà luật hai tiêu chí bảo phải XẾP HÀNG, KHÔNG phải đuổi theo.

### 🔬 BỔ SUNG 12:55 — `claude-aiboss-app-exe` đo ĐỘC LẬP và tìm ra GỐC sâu hơn bản trên

Nó đo trên ghế nó, ba lượt liên tiếp bị đốt không:
```
12:38:15  rung dải →23122  ·  mốc exe lúc ấy 23122   ⇒ đã đọc rồi
12:44:16  rung dải →23319  ·  mốc exe lúc ấy 23387   ⇒ đã đọc rồi
12:51:46  rung dải →23497  ·  mốc exe lúc ấy 23497   ⇒ đã đọc rồi
```
🔑 **Gốc KHÔNG phải «mắt canh chậm 90 giây» như tôi ghi ở trên — mà là CỔNG ĐĂNG BÀI.**
Cổng bắt ghế đọc HẾT kênh mới cho đăng ⇒ mỗi lần ghế trả lời, mốc của nó nhảy tới cuối kênh.
Bộ canh quét sau đó thấy tin «chưa đọc theo sổ của NÓ» và rung — cho đúng thứ ghế vừa trả lời xong.
📌 **Hai phép đo CÙNG ĐÚNG mà ghép lại thành SAI.** Soi từng cái một thì cái nào cũng qua — đây là
loại lỗi khó thấy hơn hẳn «một cái hỏng», và nó là hệ quả CẤU TRÚC nên nó lặp lại đều đặn.

**Đề xuất của exe (nó KHÔNG tự sửa vì `mat-canh-ghe.sh` là hạ tầng CHUNG mọi ghế):**
```
trước khi rung, bộ canh TRA mốc đọc của ghế:  ~/Operations/.moc-doc-cua-toi-<tên-ghế-ĐÃ-BỎ-tiền-tố-«claude-»>/<kênh>.moc
   ĐÚNG: .moc-doc-cua-toi-aiboss-app-exe   SAI: .moc-doc-cua-toi-claude-aiboss-app-exe
   neo mã: mat-canh-ghe.sh:221  ${TOI#claude-}
   mốc ghế >= dải định rung  ⇒ BỎ rung, nhưng VẪN đẩy mốc của bộ canh lên
   mốc ghế thấp hơn          ⇒ RUNG như cũ
   tệp mốc thiếu / đọc hỏng  ⇒ RUNG như cũ   ⇐ KHÔNG đọc được thì KHÔNG suy
```
⚠️ **TRA, KHÔNG GỘP.** Gộp hai mốc làm một là mất tính độc lập — mà chính cái độc lập ấy là lý do
bộ canh còn bắt được khi sổ đọc của ghế sai.
⚠️ **Đối chứng bắt buộc khi sửa:** phải chứng minh nó VẪN RUNG khi mốc ghế còn thấp. Thiếu phép này
là đổi một cái chuông kêu thừa lấy **một cái chuông câm** — và cái câm thì KHÔNG ai phát hiện.

**Chỗ exe nói rõ là SUY chứ KHÔNG phải ĐO:** nó chỉ đo trên ghế mình; các ghế khác cùng đi qua cổng
đăng bài nên «cho là» cũng dính. Và chưa ai đếm tổng số lượt bị đốt cả ngày.

---

## 5a. 🔀 «QUẢN LÝ CŨ» NỐI VÀO ĐÚNG PHIÊN TERMINAL ĐANG MỞ — hai cửa cùng ghi MỘT tệp

> Owner báo 02/09 ~12:5x. Owner xếp: **chưa gấp, nghiên cứu sau.**
> 📸 Chứng cứ đã cứu khỏi đường dọn rác:
> `~/idea/inbox/phong-ban-ai-boss/chung-cu/2026-09-02-quan-ly-cu-fork-eeat/` (3 ảnh + `GHI-CHU.md`,
> md5 khớp bản gốc trước khi gỡ bản cũ).

### Chuyện xảy ra
Owner mở giao diện **«Quản Lý Cũ»**, tưởng đó là **phiên gốc CHƯA fork**, nên chat thử.
Ghế `claude-giao-trinh-eeat` **trả lời thật** — trong khi một phiên eeat KHÁC đang nói chuyện với
Owner trên terminal. Nội dung hai màn hình KHÁC nhau.

### Ba cách đọc — và số đo bác cả ba
```
Owner        : nội dung khác  ⇒ HAI phiên
ghế eeat     : MỘT phiên, ba cửa vào (cli · claude-desktop · sdk-cli) — nó tự khai trong app
hồ sơ ghế PM : «fork tạo phiên MỚI ⇒ HAI TỆP KHÁC NHAU ⇒ KHÔNG có chuyện hai tiến trình
               cùng ghi một bản ghi»   ⇐ 🔴 LUẬT NÀY KHÔNG PHỦ ĐƯỢC CA NÀY
```
**ĐO (claude-aiboss-app-pm, 02/09 12:5x) — 200 dòng CUỐI của ĐÚNG MỘT tệp phiên:**
```
~/.claude/projects/-Users-erocathanh/5956cd23-1533-4565-a7fc-0050769887dc.jsonl
   128 MB · sửa lần cuối 02/09 12:45:43
   entrypoint=cli       23 dòng      ⇐ terminal
   entrypoint=sdk-cli  118 dòng      ⇐ app
```
🔑 **HAI TIẾN TRÌNH SỐNG ĐANG GHI VÀO MỘT TỆP.** Ghế eeat nói đúng («một phiên»), Owner cũng nói
đúng («màn hình khác nhau») — khác nhau vì **mỗi máy khách chỉ vẽ phần nó đã nạp**, KHÔNG phải vì
có hai phiên.
📌 **Và luật trong hồ sơ ghế PM SAI PHẠM VI, KHÔNG sai nội dung:** nó đúng cho **FORK** (fork đẻ mã
mới ⇒ hai tệp). Ca này **KHÔNG có fork** — «Quản Lý Cũ» nối thẳng vào phiên terminal ĐANG mở.
⇒ Phải sửa lại lời luật cho hẹp: *fork thì hai tệp; NỐI LẠI thì một tệp, và một tệp CÓ THỂ có
hai người ghi.*

### 🔴 Vì sao đáng nghiên cứu (xếp theo mức đau, chưa ai đo tiếp)
```
① HAI người ghi, KHÔNG ai điều phối. `entrypoint` phân biệt được NGƯỜI ghi, nhưng KHÔNG có
   khoá nào chặn hai bên ghi chồng. Chưa đo: có mất dòng KHÔNG, thứ tự có đảo KHÔNG.
② CHỐT «đang chạy nơi khác» ĐỌC MTIME (doc-phien.ts, ngưỡng 5 phút). Hai cửa cùng chạm một tệp
   ⇒ terminal gõ một câu là app tưởng «ghế bận», và ngược lại. Chốt đó nay đo NHẦM thứ.
③ TIỀN. Ảnh chụp: MỘT lượt = 5.284.038 token ≈ 11,01 USD; terminal khai 815,9k token.
   Tệp phiên 128 MB gửi lại mỗi lượt. Hai cửa trên cùng một phiên khổng lồ thì nhân đôi nhịp tiêu.
④ CÁI TÊN GÂY RA HÀNH ĐỘNG. «Quản Lý Cũ» làm Owner tin đó là phiên gốc chưa fork nên mới chat thử.
   Đây KHÔNG phải lỗi chữ nghĩa — một cái nhãn sai đã khiến người dùng làm một việc họ sẽ KHÔNG làm
   nếu nhãn đúng.
```

### Việc cần làm (chưa giao ai)
```
· đo ① bằng cách cho hai cửa ghi xen kẽ có chủ đích rồi đếm dòng — ĐỐI CHỨNG DƯƠNG bắt buộc
· đọc lại doc-phien.ts: chốt 5 phút còn nghĩa gì khi một tệp có hai người ghi
· sửa lời luật trong hồ sơ ghế PM (mục 🧬 ①) cho đúng phạm vi fork-vs-nối-lại
· xem lại nhãn «Quản Lý Cũ» — nó khai điều gì, và người đọc hiểu ra điều gì
```
**Xếp hạng: quan trọng ✅ · khẩn ❌** (Owner tự xếp). Sau P0 và sau 4y.

---

## 5b. 🧱 OWNER YÊU CẦU 02/09 ~15:2x: **TÁCH GIAO DIỆN RA KHỎI LÕI** — «sửa UI đừng ảnh hưởng logic»

> Owner: *«sao em KHÔNG đưa code mã UI thành front end chạy độc lập với back-end để sửa KHÔNG ảnh
> hưởng nhiều đề logic — đây là yêu cầu QUAN TRỌNG, cần làm SỚM»*.

### 🔴 ĐO TRƯỚC KHI LÀM — và số đo ĐỔI CÁCH HIỂU YÊU CẦU
```
src/components/  1 tệp · 3.252 dòng      ⇐ TOÀN BỘ giao diện nằm trong MỘT tệp
src/lib/        20 tệp · 4.323 dòng
src/app/api/     8 cửa

máy khách nhập THẬT từ lib:  2   (dung-markdown 153 dòng · so-o 29 dòng — cả hai KHÔNG đụng node)
máy khách nhập KIỂU (bị xoá lúc dựng): 1
```
🔑 **Mã giao diện và mã máy chủ HẦU NHƯ ĐÃ TÁCH RỒI.** Chúng nói chuyện qua 8 cửa HTTP, và chỗ dính
duy nhất là hai tệp tiện ích lá (một bộ vẽ markdown, một hằng số `SO_O = 6`). Cắt hai cái đó là
việc của một buổi chiều, và **cắt xong Owner vẫn thấy đau y như cũ.**

⇒ Nên câu hỏi đúng KHÔNG phải «tách mã». Đau nằm ở HAI chỗ khác, và phải gọi tên riêng:

### ① 🔴 ĐAU THẬT SỐ MỘT — MỘT TỆP 3.252 DÒNG
Mọi thay đổi giao diện, dù nhỏ tới đâu, đều đụng **cùng một tệp**. Hai việc giao diện khác nhau
KHÔNG thể làm song song. Đây là lý do hôm nay tôi phải dặn «tách commit» cho một việc thêm sáu dòng.
```
đo được: đổi nhãn một nút · thêm một bộ ghế · vá nhánh nút Dừng  ⇒ CÙNG chạm UngDung.tsx
```
✅ Việc: **chia tệp**. Trục chia phải ĐO rồi mới chọn (kế hoạch mục 9 đã treo câu này từ 30/08,
chưa ai vẽ). Đừng chia theo cảm giác — chia sai trục thì đổi một tệp to lấy tám tệp dính nhau.

### ② 🔴 ĐAU THẬT SỐ HAI, và đây mới là thứ Owner CẢM THẤY — SỬA UI PHẢI DỰNG LẠI VÀ KHỞI ĐỘNG LẠI
```
chay-lan.sh:  exec npx next start   ⇐ BẢN DỰNG SẴN, KHÔNG phải next dev
.next/BUILD_ID: CÓ
⇒ đổi MỘT ký tự trong giao diện ⇒ `next build` ⇒ khởi động lại máy chủ
⇒ KHỞI ĐỘNG LẠI CẮT NGANG LƯỢT CỦA MỌI GHẾ ĐANG CHẠY
```
🔑 **Đây là chỗ «UI dính back-end» có thật — nhưng nó dính ở tầng CHẠY, KHÔNG ở tầng MÃ.**
Tách mã KHÔNG chữa được nó. Ta có thể tách mã sạch sẽ rồi vẫn phải khởi động lại y như cũ.
📌 Và cái giá này ĐÃ ĐO nhiều lần trong ngày: mỗi lần restart là cắt lượt, mất đuôi tin, có ca
Owner tưởng việc chưa chạy trong khi việc đã xong (luật hẹn-khởi-động-lại, sàn 2 phút).

✅ Việc: **một bản chạy RIÊNG cho việc sửa giao diện** — `next dev` ở cổng khác, dùng CÙNG mã,
nạp nóng. Người sửa UI xem tại cổng đó, KHÔNG đụng cổng 4319 đang phục vụ Owner.
```
giá : gần 0 — cùng kho, cùng mã, chỉ thêm một lệnh chạy
được: sửa giao diện KHÔNG còn cắt lượt của ai
⚠️ hai bản cùng đọc `.trang-thai/` và cùng gọi `claude` ⇒ PHẢI quyết trước: bản dev chạy CHẾ ĐỘ
   CHỈ-XEM (KHÔNG sinh tiến trình), hay có thư mục trạng thái RIÊNG. Chưa quyết thì đừng bật.
```

### 📋 XẾP HẠNG — Owner nói «cần làm SỚM», tôi chia làm ba, và ② rẻ nhất mà đỡ đau nhất
```
② bản dev riêng cổng khác     giá ~0 · gỡ NGAY cái đau «sửa UI là cắt lượt»   ⇐ LÀM TRƯỚC
① chia UngDung.tsx            giá VỪA · ✅ ĐÃ ĐO XONG 03/09 → xem MỤC 9 cuối tệp này
                              (mã thật ~1.785 dòng, KHÔNG phải 3.212 · trục ② là trục an toàn duy nhất)
③ cắt 2 lời nhập còn lại      giá ~0 · nhưng LÀM CUỐI: nó gần như KHÔNG đổi gì cho Owner
                              (chép `SO_O` sang máy khách, hoặc chuyển hai tệp sang thư mục dùng chung)
```
⚠️ **③ nghe giống yêu cầu Owner nhất, mà lại đỡ đau ít nhất.** Ghi ra để KHÔNG ai làm ③ trước rồi
báo «đã tách xong» trong khi Owner vẫn đau y nguyên. **Làm đúng chữ mà trượt ý là cách hỏng tệ nhất
ở đây, vì nó trông như đã xong.**

📌 Điều kiện: ① và ② đều đụng `UngDung.tsx` hoặc cách chạy app ⇒ **CHỜ hướng «giữ tay cầm» hạ cánh**
(`ai/DE-BAI-giu-tay-cam.md`). Chia tệp trong lúc có người đang sửa nó là tự tạo xung đột.

---

## 5c. 🔢 SỔ BẪY VA SỐ HAI LẦN — vì **cái máy cấp số đã chết từ mục ㊿ mà không ai vá**

> ✅ **ĐÃ XONG 02/09 ~17:2x** (`claude-aiboss-app-exe` làm) — nêu 17:0x, xong trong ~20 phút.
> 📏 đo lại 17:44: script in **«số kế tiếp 62 · lớn nhất 61 · không lỗ hổng»** + dòng tiêu đề dán được
>    + báo đúng va số ㊽. Nghiệm thu **6/6**: sổ thật · sổ giả có trùng ⇒ báo · sổ giả sạch ⇒ im ·
>    sổ rỗng ⇒ từ chối (mã thoát 1) · sổ chỉ có ㊿ ⇒ ra 51 · có 51-bis ⇒ vẫn ra 52.
> 📖 chi tiết + số đo gốc: `~/Operations/SO-BAY-DO.md` mục **61**
>
> 🕳 **Mục này từng bị chính tôi để treo SAU KHI đã xong** — tin kênh 17:40 của tôi vẫn liệt nó vào
>    «còn treo». `claude-aiboss-app-exe` bắt: *«một mục đã xong mà còn nằm trong danh sách treo thì
>    nó rủ người khác đi làm lại»*. Tôi cập nhật hàng đợi bằng TRÍ NHỚ về việc đã GIAO, không đi đo
>    việc đã VỀ. **Người giữ hàng đợi mà cập nhật bằng trí nhớ thì hàng đợi thành tin đồn.**

```
· ~/Operations/scripts/so-bay-tiep-theo.sh chạy 02/09 ⇒ «HẾT BẢNG ở ㊿ — nới BANG trong script này»
  ⇒ chết từ mục 50. Chết TRUNG THỰC (chịu không cấp) — nhưng vì nó không cấp,
    mọi ghế quay về ĐẾM TAY, đúng việc đầu sổ CẤM.
· hậu quả đo được: va số 59 (bắt được nhờ may) VÀ va số ㊽ (dòng 1107 + 1160, có từ trước, chưa ai gỡ)
```

**Việc phải làm (3 phần, làm được rời nhau):**
```
① nới script quá ㊿: mục ≥51 dùng CHỮ SỐ THƯỜNG. Đọc được CẢ hai dạng khi dò số lớn nhất.
   ⚠️ `'①'.isdigit()` trả True mà `int('①')` nổ ⇒ phải dùng `isdecimal()`.
   ⚠️ `\b` của grep không bám ký tự không-ASCII ⇒ `grep -E '^## (48|㊽)\b'` ra RỖNG dù có thật.
② script TỰ IN RA DÒNG TIÊU ĐỀ đầy đủ để người ghi dán thẳng — đừng chỉ in con số rồi khuyên.
   Chốt biết KHUYÊN thì bị bỏ qua đúng lúc người ta vội, mà vội là lúc va nhau.
③ thêm phép tự dò va số + in ra khi phát hiện. Đối chứng dương bắt buộc: phải thấy ㊽ đang va.
```
⛳ **Nghiệm thu:** chạy script ⇒ in `62` + dòng tiêu đề dán được + báo đúng «va số: 48».
Chạy trên sổ giả có mục trùng cố ý ⇒ phải báo va. Chạy trên sổ giả sạch ⇒ phải báo không va.

KHÔNG **Đừng đi đánh số lại cả sổ.** 64 mục, con trỏ cũ nằm rải khắp kênh. Luật khi va:
**đổi cái CHƯA AI TRÍCH**, giữ cái đã công bố. ㊽ thì cả hai đều dính trích dẫn nhập nhằng ⇒ để yên, chờ quyết riêng.


## 5. Những thứ KHÔNG bắt chước LobeHub (đã cân, đã loại)

```
chợ tiện ích cắm thêm + tự cài   → mở đường chạy mã lạ trên máy Owner
đa nhà cung cấp mô hình          → ta chỉ dùng Claude Code, thêm là thêm chỗ hỏng
kho tri thức đóng gói sẵn        → cần Postgres + Redis + kho tệp, quá cỡ cho một máy
app máy tính bàn                 → thêm một bản phải bảo trì, không thêm việc gì làm được
Postgres + Redis + 6 cổng        → openclaw trên máy đã giải cùng bài bằng SQLite + WAL, 82 dòng, có bài kiểm
```

## 6. Luật cứng — phá là hỏng thật

```
① KHÔNG đổi node mặc định của máy (v22.23.1) — nó nuôi Hermes và openclaw (cổng 18789).
   Dự án ghim node 24.19.0 riêng qua .node-version.
② KHÔNG khôi phục các cờ «tiết kiệm» đã gỡ (--strict-mcp-config · --setting-sources project · vùng cách ly).
   App này THAY CHO TERMINAL nên có đủ quyền như terminal. Đắt hơn là GIÁ, không phải lỗi.
③ BẢY CHỖ CẤM ĐỘNG (đổi là hỏng thấy ngay):
   middleware.ts:65 realm  → đổi là MỌI thiết bị Owner bị hỏi lại mật khẩu
   UngDung.tsx 4 khoá lưu bố cục → đổi là Owner mất bố cục
   /Users/Shared/phong-ban-ai-ws/ → vùng cách ly ĐANG SỐNG, không phải chữ trong tài liệu
   chon-mau/.vercel → nối với dự án đã có
④ TÊN DỰ ÁN VERCEL giữ nguyên `phong-ban-ai-mockup` — địa chỉ công khai sinh ra từ tên,
   đổi là giết một địa chỉ đang sống mà không có chuyển hướng. Chốt 3/3 ngày 30/08.
⑤ KHOÁ NÀO CŨNG PHẢI CÓ HẠN DÙNG. Tiến trình chết giữa lúc giữ khoá thì khoá kẹt,
   mọi lượt sau bị chặn, triệu chứng nhìn y hệt «app treo». Tiền lệ nhà: .state-edit-lock 120 giây.
⑥ Sửa mã thì làm trong WORKTREE riêng — xem mục 7.
```

## 7. Luật worktree — để hai người không sửa chung một tệp

```
① Mỗi việc = một worktree riêng:  git worktree add ../wt-<việc> -b viec/<việc>
② Làm xong: gộp về main bằng --ff-only. Có người vừa commit vào main thì RỜI NỀN trong worktree, đừng ép.
③ Dọn: git worktree remove <đường> RỒI git branch -d viec/<việc>
   ⚠️ `worktree remove` KHÔNG xoá nhánh — thiếu bước hai là nhánh rác chất đống.
④ .trang-thai/ không được git theo dõi ⇒ worktree KHÔNG có sổ ô. Đừng chạy app trong worktree
   rồi tưởng sổ hỏng.
⑤ Trước khi bắt tay: `git worktree list` xem có ai đang mở worktree cho việc đó chưa.
⑥ Build và đo thì làm ở kho chính, vì máy chủ đang chạy từ đó.
```

## 8. Ba mốc nghiệm thu của cả plan

```
M1  đóng tab trình duyệt, hai ghế vẫn nhắn được cho nhau     ⇒ P0 xong
M2  mở bảng đo mức dùng, thấy số của từng ghế trong 24 giờ   ⇒ P1-1 xong
M3  hai người sửa hai việc cùng lúc, không ai phải chờ ai    ⇒ P1-3 + luật worktree xong
```

## 9. Chỗ CHƯA đo, đừng lấp bằng suy luận

```
· khoá theo phiên nên đặt ở tầng nào (tiến trình hay tệp) — chưa ai đo hai lối
· mức dùng lấy từ đâu: đọc bản ghi .jsonl hay hỏi công cụ — chưa đo cái nào rẻ hơn
· chia UngDung.tsx theo trục nào (theo ô, theo tính năng) — chưa vẽ
· P3 cần cửa ngoài loại nào — chưa soi bảo mật, và đây là app có quyền như terminal
```
📌 Bốn dòng trên là **việc đo**, không phải việc làm. Ai làm thì đo trước, ghi số vào `DECISION_LOG.md`.

---

# 🧭 CHẠY SONG SONG NHIỀU ĐỘI — KẾ HOẠCH ĐÃ CÓ SẴN TỪ 02/09, ĐỌC TRƯỚC KHI HỎI LẠI

```
📄 ai/KE-HOACH-SONG-SONG.md   433 dòng · 32.318 byte · hermes-build-app soạn 19:19 ngày 02/09
   mục 0 kết luận ngắn cho PM · 1 đường cắt · 2 điều kiện bắt đầu song song THẬT
   · 3 luật đội + worktree + dựng + hai phiên soi · 4 phép nghiệm thu tách tệp
   · 5 cách đo «nhanh gấp 2-3» · 6 chỗ CHƯA đo · 7 việc PM phải chốt · phụ lục lệnh đã chạy
```

🕳 **CA SINH RA DÒNG TRỎ NÀY (05/09):** Owner hỏi «làm sao cho 3-4 đội chạy song song». Tôi cử người
đi nghiên cứu. Nó tìm ra rằng **câu trả lời đã nằm trong chính kho này ba ngày trước**, và đo giúp
tôi lý do không ai dùng:
```
số chỗ TRỎ vào tệp đó:   MASTER-PLAN 0  ·  hồ sơ ghế PM 0  ·  kênh đội 3
```
🔑 **Kênh là DÒNG CHẢY, kế hoạch là MỤC LỤC.** Thứ chỉ được công bố trên kênh thì trôi mất trong
một ngày; thứ muốn sống lâu hơn một ngày phải nằm ở MỤC LỤC. Ba lần nhắc trên kênh vẫn thua
**không dòng nào** trong tệp mà người ta thật sự mở ra đọc.
📌 Đây là cái **thứ NĂM** cùng một họ trong tuần: cổng `.kiro` · sổ tiến độ · lint · bộ phá · nay
là một kế hoạch 32KB. Mỗi lần đều là **thứ đã tồn tại mà không ai biết để dùng**.

## 🔴 BA SỐ TỪ BÁO CÁO 05/09 LÀM ĐỔI CÁCH NGHĨ — đọc trước khi lập đội

```
① CÁI CHẶN KHÔNG PHẢI hình dạng UngDung.tsx, mà là BỐN CÁI CHỐT chưa dựng — cả bốn đo được là trượt:
   cây bẩn 22 mục (8 chạm src/) · chưa có bảng SỞ HỮU TỆP · bộ phá `--ca-hai` khi đó đang hỏng
   · chưa có `.worktreeinclude`
② `git log --format='%an'` ⇒ **154/154 commit CÙNG MỘT TÊN** («Eroca Thanh»)  [tôi tự đo lại: đúng]
   ⇒ `git blame` MÙ · `git log --author=` vô dụng · mọi cột làn/thắng-thua phải ghi TAY
   ⇒ và nó làm nặng thêm bẫy đã cắn thật ở SO-BAY-DO:1176
③ nguồn ngoài, câu quan trọng nhất:
   «Worktree isolation prevents write conflicts during execution.
    It does NOT prevent merge conflicts at integration»  [video I9lT8m0NoiU ~09:55]
   ⇒ worktree chỉ **DỜI** xung đột từ lúc VIẾT sang lúc GHÉP.
     Dựng bốn worktree mà bốn đội cùng chạm UngDung.tsx là **đổi chỗ đau, không bớt đau**.
```
📄 Báo cáo đầy đủ 680 dòng + 7 transcript có mốc giờ:
`~/idea/inbox/aiboss-app-noibo/tra-cuu/song-song/`

# 🚦 HÀNG ĐỢI — LÀM GÌ TRƯỚC, LÀM GÌ SAU (Owner giao xếp lại, 04/09/2026 12:31 BST)

> Xếp theo **PHỤ THUỘC ĐO ĐƯỢC**, không theo thứ tự nghĩ ra. Ai đọc plan này thì đọc mục này TRƯỚC.
> ⚠️ **Lưu ý đánh số:** phần cũ của plan có `## 9. Chỗ CHƯA đo`; phần mới có `MỤC 9 — TRỤC CHIA`.
> **Hai số 9 khác nhau.** Tôi KHÔNG đánh số lại (nhiều tin kênh đã trỏ theo số hiện tại) — nhắc ở đây
> để không ai đọc nhầm. Gọi tên đầy đủ, đừng gọi trống «mục 9».

## 🔴 CÁI CHẶN TẤT CẢ: **12 tệp bẩn trong cây làm việc**
```
HEAD e6e4872 · 12 mục chưa commit (next.config.mjs · package.json · tsconfig.json · dev/ · ai/ · chon-mau/)
⇒ mọi việc chạm src/ đổ tiếp lên đống này là trộn hai việc vào một lần soi
⇒ và nếu phải lùi, lùi trúng cả thứ không liên quan
```
**Nên VIỆC SỐ 1 là đóng đống đó, không phải việc nào hay hơn.**

## 📋 THỨ TỰ
```
① ĐÓNG 12 TỆP BẨN  ← chặn mọi thứ khác chạm src/
   exe vá nốt câu 7(b) postbuild «|| true» (hoặc tuyên bố tách việc riêng)
   → reviewer ra verdict → exe dựng xanh → commit
   phụ thuộc: KHÔNG. Làm ngay.

② MẪU THANH TIÊU ĐỀ  ← chạy SONG SONG với ①, không đụng kho
   hermes-web-noibo vẽ → Owner duyệt trên trang round
   🔴 PHẢI XONG TRƯỚC ④, vì nó quyết ④ dựng cái gì

③ TRỤC ② — bóc 357 dòng đầu UngDung.tsx
   phụ thuộc: ① (cây phải sạch)
   ⚠️ KHÔNG chạy song song với ④ — cả hai chạm CÙNG UngDung.tsx (34 commit/7 ngày)

④ VIỆC GIAO DIỆN GỘP  (bố cục 2 ô trái-phải + nút Giao diện gom menu + gộp ☰ với «hiện 2 cột»)
   phụ thuộc: ② duyệt xong  VÀ  ③ xong
   gộp ba việc làm một vì cùng vùng mã, một lần soi

── bốn làn SONG SONG, KHÔNG đụng src/ nên chạy lúc nào cũng được ──
⑤ B1 vòng 3 (hermes-build-app)          nhánh riêng, không chạm main
⑥ mắt canh: phân biệt CHẠM TRẦN với CHẾT VÌ LỖI KHÁC   (xem MỤC 10.3)
⑦ cho DẤU VẾT BẢN DỰNG sinh TỰ ĐỘNG — cần PM/Owner chốt lệnh dựng của nhà
   (phần «bỏ 2>/dev/null || true» exe ĐÃ vá lúc 12:20, nằm TRONG ①. Đính chính của exe 12:35.)
⑩ MẮT CANH SỔ TIẾN ĐỘ — bắt `TIEN-DO-app.md` phải nổ khi nó CŨ QUÁ
   nay: luật ghi sổ nằm trong hồ sơ ghế từ 03/09, VÀ NÓ ĐÃ IM 23 TIẾNG 27 PHÚT (03/09 16:31 → 04/09 15:58)
   ⇒ cần một mắt canh launchd: mtime tệp cũ hơn 3 giờ mà kênh đội CÓ tin mới ⇒ rung ghế PM
   ⚠️ điều kiện phải là «cũ VÀ có việc chạy», KHÔNG phải «cũ» trơn — đêm không ai làm thì đừng rung
   phụ thuộc: KHÔNG chạm src/. Giao exe sau khi ③ xong. Khai vào `~/Operations/launchd/SO-DANG-KY.md`.

── CHƯA tới lúc, ghi để khỏi quên ──
⑧ đóng gói app ⇒ đặt DUONG_DAN_CLAUDE bằng đường TUYỆT ĐỐI, nghiệm thu bằng cách MỞ TỪ FINDER
   (MỤC 11.1 — bẫy TƯƠNG LAI, chưa cắn)
⑪ 🅑 `bangBiDanh` dựng bảng bí danh XUYÊN TỆP — hạ tầng ĐO, lượt RIÊNG
   vì sao tách: bảng bí danh nay dựng THEO TỪNG TỆP ⇒ dời khai báo `dungTruocKhiVe` sang tệp khác
   là thước MÙ 4 móc (soMoc 70 → 67). exe bắt được và TỪ CHỐI hạ mong đợi xuống 67 cho xanh.
   🔴 KHÔNG gộp vào lượt chia tệp nào — sửa thước trong chính lượt đang dùng thước để nghiệm thu
      là tự chấm bài mình. Đây là lý do exe đưa ra, tôi nhận nguyên.
   ⚠️ 67 lần này KHÁC 67 của bộ dò hỏng `^use[A-Z]` hôm trước. CÙNG số, HAI nguyên nhân —
      ai tra sổ gặp lại số 67 thì đọc cả hai ca, đừng khớp số rồi kết luận.
⑫ VÁ `build_site.py` trang nội bộ — người soi BÁC bản vá 2 dòng của tôi, đường đúng là HAI phần
   (A) thu hẹp theo PHẠM VI: bỏ `validate_source` khỏi `validate_round_content`, gọi riêng cho
       `target_content` sau dòng 684. Chữa đúng bệnh «một nguồn lệch đóng băng CẢ bộ sinh»
       (vòng lặp 681-682 soi mọi round mỗi lần dựng). ⚠️ KHÔNG thông round-8.
   (B) `content/source-drift.json` NGOÀI khoá sổ, ghi fromSha256 → toSha256 + observedAt + byAgent
       + note; `validate_source` với round decided chỉ qua khi khớp bản ghi đó. ~15 dòng.
       + nạp vào `render_stamp` (228-231) để trang in «nguồn đã đổi sau khi hỏi: A… → B…»
         thay vì khẳng định TRẦN một băm không khớp byte nào trên đĩa.
   🔴 CẤM đường «hạ thành cảnh báo in màn hình»: dòng 774 vẫn in BUILD_SITE_OK và `deploy.sh` grep
      chuỗi khác ⇒ cảnh báo trôi qua. Đúng bệnh `tsc | head && echo "sạch"`.
   🔴 CẤM `git checkout HEAD -- src/components/UngDung.tsx` để «làm lời khai đúng trở lại» —
      nó xoá bản chia tệp exe đã `git add` chưa commit. Loại CÓ Ý THỨC, không phải bỏ sót.
   người làm: `claude-aiboss-app-exe` (script chạy thật) · verdict đầy đủ:
   `~/idea/inbox/aiboss-app-noibo/soi/2026-09-04_verdict-validate-source.md`

⑬ 🔴 LỖ ĐANG SỐNG: dấu niêm OUTPUT KHÔNG được thi hành với round đã quyết
   `build_site.py:142-148` — `decision_overlay_matches` đúng ⇒ bỏ qua TRỌN VẸN phép kiểm output,
   kể cả `output_path.is_file()`. Đo 04/09:
       round-6  đĩa 608e6878… seal fec4a248…  LỆCH — vẫn PASS
       round-7  đĩa e445d1d0… seal c195241e…  LỆCH — vẫn PASS
   ⇒ trang HTML ĐÃ ĐĂNG của round đã quyết hiện KHÔNG còn được ghim. Bốn thứ khoá sổ đáng ra giữ
     (nội dung · output · nguồn · quyết định) với round decided chỉ còn giữ MỘT: nội dung.
   ⚠️ Có TRƯỚC ca 04/09, không ai gây ra hôm nay. Đừng gộp vào ⑫ — hai bệnh khác nhau.

⑭ ✅ XONG 06/09 13:39 — commit `741b0f7`. Cổng lint SỐNG THẬT, PASS vòng 3/3, bộ đếm đóng bằng PASS.
   PM đo ĐỘC LẬP sau commit, không nhận lời khai:
      commit chạm ĐÚNG 4 tệp · băm cả 4 KHỚP bản người soi neo (`git show HEAD:<tệp> | md5`)
      `GEMINI.md` và `ai/MASTER-PLAN.md` KHÔNG bị nuốt vào ⇒ 0 · đối chứng dương: thước bác
      được một băm bịa ⇒ phép so sống
   Verdict `hermes-aiboss-app-reviewer` phiên `20260906_133009_cb43ba` (3m13s · 19 lượt gọi):
   *«PASS — Hai điều kiện vòng 2 đã đóng bằng cấp quyền đúng băm và chứng cứ thực thi được đối
   chứng trực tiếp với JSONL nguồn; đủ điều kiện commit riêng bốn tệp đã neo.»*
   🔑 NGƯỜI SOI KHÔNG TIN BẢN TRÍCH — nó mở nguồn ra đối chứng:
      `.../-Users-erocathanh-claude-aiboss-app-exe/1b696a63-….jsonl`
      đúng HAI block mang ID `toolu_01JUzqxjWQm3xkkPZGWUtrjo` · `command` khớp NGUYÊN VĂN ⇒ True
      `tool_result.content` khớp NGUYÊN VĂN ⇒ True · `MA = 0` · `is_error: false`
      số 0 lấy TRƯỚC các lệnh in lại log ⇒ KHÔNG phải mã thoát của `iconv | sed`
      + tìm thêm dòng 24572 `13:10:10.293` = lệnh vá THÀNH CÔNG, chứa đúng khối chú thích và
        `let`→`const` đang thấy trong diff ⇒ nguồn phiên tự chứng minh bản DỰNG = bản trong CÂY
   📌 Nó giữ đúng chỗ CHƯA ĐO: *«CHƯA ĐO được manifest băm bốn đầu vào do chính tiến trình build
      ghi lúc chạy. Mtime riêng lẻ không chứng minh tuyệt đối lịch sử byte.»* — nhận là đủ cho
      MỨC VẬN HÀNH của cổng này, KHÔNG tự nâng thành chứng thực chống giả mạo.
   ⏳ CÒN LẠI: exe commit ĐÚNG 4 tệp (`package.json` `eslint.config.mjs` `src/lib/may-chay-nen.ts`
      `pnpm-lock.yaml`), so băm trước khi stage + `--cached` phải ra đúng 4 dòng.
      Cổng dựng ④ ĐÃ THOẢ — KHÔNG dựng lại. 📄 `ai/ban-giao/2026-09-06_14-PASS-lenh-commit.md`
   🔓 MỞ DÂY CHUYỀN: exe nói «chờ cây sạch mới đụng» ⇒ commit xong là ② (ô 5) và ㉓ chạy được.
      ⚠️ ㉓ và ㉖ đụng cùng `UngDung.tsx` ⇒ KHÔNG song song, PM xếp thứ tự.
   📖 BA VÒNG, KHÔNG VÒNG NÀO BÁC VÌ MÃ EXE VIẾT SAI:
      vòng 1 — cả đội tin sai một điều về `next build` (cấu hình eslint CÓ chặn bản dựng)
      vòng 2 — PM cấp phạm vi quá hẹp + mã thoát mới có lời khai
      vòng 3 — PASS
   Verdict `hermes-aiboss-app-reviewer` phiên `20260906_131915_43db06` (3m12s · 31 lượt gọi):
   *«FAIL — Chưa đủ quyền commit nguyên trạng vì bảy dòng chú thích vượt phạm vi được cấp và
   mã thoát build cuối mới có lời khai, chưa có chứng cứ thực thi gốc được kiểm chứng.»*
   🟢 BẢN VÁ ĐẠT — người soi tự dựng BA phép đo, mạnh hơn mọi lời khai:
      AST: khai báo 214 · 7 tham chiếu ĐỌC trên 5 dòng · KHÔNG có phép gán lại · KHÔNG có eval
      đối chứng BYTE: bỏ 7 dòng chú thích + đảo const→let trong RAM ⇒ KHỚP CHÍNH XÁC HEAD
      đối chứng DỊCH: transpile hai bản ⇒ đầu ra giống nhau
      hiện vật Git cho lời khai «đã gỡ có chủ ý»: commit `8f4e1ac` 01/09 xoá `maPhienCu = null`
   ✅ CHỐT PM 13:2x: **CẤP BỔ SUNG 7 dòng chú thích 207–213** của bản băm `369eaf91…`.
      Cấp dựa trên phép đo byte của người soi, KHÔNG dựa trên «trông vô hại».
      🔴 Lỗi ở PM: viết phạm vi «chỉ dòng 207» trong khi nếp nhà là sửa dòng lạ PHẢI kèm chú thích
         — hai luật đá nhau, thợ kẹt ở giữa. Lần sau viết «dòng 207 + chú thích nếu cần».
   🔴 CÒN THIẾU ĐÚNG MỘT THỨ: bản ghi CÔNG CỤ GỐC của lần dựng 13:10:59–13:11:09
      (dòng lệnh thật + kết quả kết thúc + phép lấy mã thoát ngay sau lệnh).
      `/tmp/build14.txt` KHÔNG chứa lệnh gọi và KHÔNG chứa mã thoát ⇒ số 0 mới là LỜI KHAI.
   ⚠️ KHÔNG được sửa byte nào của bốn tệp — sửa là băm đổi, verdict hết hiệu lực, phải soi delta,
      mà chỉ còn MỘT vòng. 📄 `ai/ban-giao/2026-09-06_14-vong2-cap-chu-thich-va-xin-transcript.md`
   ✅ VÒNG 2 — exe vá xong, PM đo lại độc lập lúc 13:2x, BA lời khai đều KHỚP:
      `next build` đầy đủ ⇒ mã thoát cuối 0 (lấy `$?` ngay sau lệnh trần, không qua ống/vỏ bọc)
      pha lint CÓ chạy trong build, nay chỉ còn 1 CẢNH BÁO (㉓ dongO), KHÔNG làm đỏ
      lint: 75 tệp soi · 58 sạch · **0 LỖI trong `src/`** (18 lỗi còn lại đều ở `bai-thu/`)
      bản đang phục vụ 4319 còn sống: 5/5 tệp tĩnh 200 · đối chứng âm đường bịa ⇒ 404
      chênh 74 vs 75 đã giải thích được: ㉒ thêm 1 tệp + đổi tên `soi-ket-qua.mjs` ⇒ cây SỐNG
   🔴 MỘT CHỖ LỜI KHAI LỆCH SỐ ĐO — PM nêu vào đề soi, KHÔNG tự phán:
      exe nói «sửa đúng MỘT dòng», `git diff --stat` ra **8 thêm / 1 bớt** — một dòng MÃ
      (`let`→`const`) cộng khối chú thích 7 dòng. PM cấp phạm vi là «chỉ dòng 207».
      Người soi quyết: chấp nhận được, hay là nới phạm vi.
   👏 exe TỰ KHAI bản vá đầu của nó TRƯỢT và phép đo bắt được ngay — đưa thành câu hỏi ⑥
      cho người soi (bản vá trượt rồi vá lại hay để lại rác mà chính người vá không thấy).
   📄 đề soi vòng 2: `ai/de-soi/2026-09-06_14-cong-lint-vong2.md` (6.332 byte, 7 câu đánh số)
   (cũ: `next build` KHÔNG hề chạy lint — chốt cả nhà tin là đang canh, thực ra CHƯA TỪNG NỔ)
   `next lint` sắp bị Next 16 gỡ ⇒ exe dựng bằng ESLint CLI + cấu hình phẳng, bộ luật Strict.
   ĐO: `npx eslint .` mã thoát 1 · **34 vấn đề (19 lỗi · 15 cảnh báo)** · đối chứng dương làm TRƯỚC.
   🔑 NỢ NẰM NGƯỢC CHỖ DỰ ĐOÁN: `bai-thu/` 21 · vật thử 11 · **`src/` chỉ 2** (75 tệp soi, 57 sạch — reviewer đếm lại; bản khai của exe ghi 74/56).
   Cổng vừa bật đã chỉ vào mã chưa đầy MỘT NGÀY TUỔI ⇒ đẻ ra việc ㉓.
   🔢 VERDICT VÒNG 1/3 — `hermes-aiboss-app-reviewer` phiên `20260906_125128_d3b060` (4m19s):
      PASS 6/7 câu. **BÁC câu ⑥.** Nguyên văn:
      *«VERDICT: FAIL — Chưa có next build xanh bắt buộc trước commit, và pha lint thật của Next
      đã xác nhận lỗi chặn tại src/lib/may-chay-nen.ts:207.»*
      Reviewer gọi thẳng `runLintCheck(lintDuringBuild: true)` ⇒ `lintedFilesCount: 39` ·
      `isError: TRUE` · `may-chay-nen.ts:207:9 prefer-const`. `UngDung.tsx:1104` chỉ là CẢNH BÁO.
   🔑 **PHÁT HIỆN LỚN NHẤT CỦA VÒNG SOI — nó đổi bản chất việc ⑭.** Nguyên văn reviewer:
      *«khẳng định "cấu hình lint không ảnh hưởng build" là SAI: Next 15.5.4 tự tìm và dùng cấu
      hình này khi dựng, không phụ thuộc script lint có được gọi hay không.»*
      ⇒ ⑭ KHÔNG phải «thêm một lệnh chạy tay». Nó đổi VẬT LÝ BẢN DỰNG: từ nay mọi `next build`
      phải sạch lint trong `app pages components lib src`. Nợ ở `bai-thu/` (32/34) KHÔNG chặn.
   🧭 QUYẾT ĐỊNH PM 06/09 13:0x: reviewer đá xung đột phạm vi về phía tôi ⇒ **cấp thêm ĐÚNG MỘT TỆP**.
      Phạm vi lượt này thành BỐN: `package.json` `pnpm-lock.yaml` `eslint.config.mjs`
      **`src/lib/may-chay-nen.ts` (chỉ dòng 207)**. KHÔNG dọn cả 34 · KHÔNG `ignoreDuringBuilds`.
   ⏳ CÒN LẠI: exe sửa dòng 207 → `next build` XANH (cổng ④ đếm ra 1 vì chạm `package.json`)
      → tôi trình reviewer VÒNG 2. Đề: `ai/ban-giao/2026-09-06_14-cap-pham-vi-sua-toi-thieu.md`
   🔴 CHẶN DÂY CHUYỀN: exe nói *«Hai việc ② ③ tôi đã đọc, chờ cây sạch mới đụng»*
      ⇒ ⑭ chưa commit thì **ô 5 và ㉓ đứng im**. Đây là nút cổ chai của cả hàng đợi.
   đo 04/09 (người soi 9bd9812):
       ls -a | grep eslint  ⇒ RỖNG   ·   devDependencies eslint ⇒ []   ·   0 tệp cấu hình
       package.json vẫn khai  "lint": "next lint"   ← một lệnh KHÔNG CHẠY ĐƯỢC
       tsconfig.json KHÔNG bật noUnusedLocals
   hệ quả đo được: 8 lệnh nhập THỪA trong UngDung.tsx mà CẢ HAI cổng đều mù —
       memo(3) · dungMarkdown(14) · CapGheDungSan(16,type) · NumberTwo/Three/Four/Five/Six(10)
   🔑 «dựng XANH» YẾU HƠN vẻ ngoài. Cùng họ với cổng `.kiro` (điều kiện không bao giờ đúng) và sổ
      tiến độ (luật không có gì làm nó nổ): **cả nhà tin chỗ đó đã được canh.**
   ⚠️ Quyết TRƯỚC khi cắm: bật lint bây giờ sẽ đỏ bao nhiêu chỗ? Đo TRƯỚC, đừng bật rồi mới biết.
      Và một lệnh khai trong package.json mà không chạy được thì phải XOÁ hoặc LÀM CHO CHẠY —
      để nguyên là dạy người sau rằng nhà này có lint.

⑮ bộ sinh bản chụp LỆCH bài thử — mặc định 1 TỆP vs 3 TỆP
   chup-thu-tu-moc.mjs:15 · chup-hinh-dang-than.mjs:10   ↔   hai test dòng 21-25 / 24-28
   ⇒ chạy ĐÚNG lệnh mà chính bản chụp tự ghi (`_doc`) mà không kèm tham số ⇒ đẻ bản chụp 1 tệp
   thu-tu-moc.json có câu dặn bằng chữ · **hinh-dang-than.json KHÔNG có câu nào**
   và KHÔNG bài thử nào so `BANG.nguon`/`soTep` với danh sách nguồn nó THẬT SỰ đọc ⇒ hai trường
   đó là trang trí. Hỏng kiểu này KÊU TO (lệch `day`) nên là bẫy vấp, chưa phải lỗ câm.
   ✅ chữa: hoặc sửa mặc định bộ sinh thành 3 tệp, hoặc bắt bài thử khẳng định `nguon` khớp nguồn đọc.

⑯ `so-diff` MÙ THỨ TỰ — thước chính của mọi lượt chia tệp
   `ai/so-diff.py:120-143` ghép dòng xoá với dòng thêm CHỈ theo NỘI DUNG, lấy cái chưa dùng đầu tiên
   ⇒ `DÒNG_KHÔNG_QUAY_LẠI=0` chứng minh dòng CÒN SỐNG, **KHÔNG** chứng minh THỨ TỰ còn nguyên
   📌 đúng ca hoán vị hai `useState` mà `thu-tu-moc.mjs` nói nó sinh ra để bắt
   ✅ người soi bịt tạm bằng **bản đồ khối liền mạch** (cũ 20-37→hang-so 24-41 v.v., tổng 323).
      Cần đưa phép đó VÀO `so-diff` để lần chia tệp sau không phải làm tay.
   ⚠️ Còn ⑨ (chia thân logic 1.887 dòng) phía trước — thước này phải chắc TRƯỚC khi tới đó.

⑰ ✅ BỘ LỌC ĐÃ VÁ (đo lại 06/09 09:36: lọc ĐÚNG, có đối chứng dương)
   🔴 NHƯNG LỘ RA LỖI KHÁC, NẶNG HƠN: **MỐC ĐỌC không nhích** — nằm ở dòng 30.580 trong khi
   kênh đã 47.107 dòng, tụt lại từ 02/09. Hậu quả thật: PM đọc muộn 50 phút một tin của Công Nghệ.
   ✅ PM đã soát hết khoảng lệch (không sót việc) rồi nhích mốc 30.580 → 47.107, có sao lưu.
   ⚠️ Đó là vá MỘT LẦN. Vì sao mốc không tự nhích thì CHƯA ai truy — xếp chung với ㉔.
   (cũ: đếm nhầm tin «ghi thay mặt» là tin đến — mỗi lần chuyển verdict tốn MỘT lượt chạy thật
   `mat-canh-ghe.sh` lọc tin của chính mình bằng:  grep -vE "FROM: $TOI|$TOI →"
   nhưng khuôn nhà cho verdict Hermes (skill giao-viec-hermes §5) là:
       FROM: hermes-<slug>-review (qua CLI, claude-aiboss-app-pm ghi thay mặt)
   ⇒ chuỗi «FROM: claude-aiboss-app-pm» KHÔNG có trong dòng ⇒ LỌT qua bộ lọc ⇒ đếm là tin ĐẾN
   đo 04/09 17:5x: mắt canh rung tôi dậy để đọc verdict do CHÍNH TÔI vừa dán vào kênh 5 phút trước
   💸 mỗi lần rung = một lượt chạy thật. Và verdict là thứ ta chuyển THƯỜNG XUYÊN.
   ✅ chữa ở SCRIPT, đừng đổi khuôn nhà: thêm nhánh loại trừ `$TOI ghi thay mặt` / `$TOI append thay mặt`
   ⚠️ ĐỪNG chữa bằng cách đổi khuôn tin thành «FROM: claude-aiboss-app-pm (ghi thay mặt …)» —
      khuôn hiện tại ĐÚNG: verdict là của người soi, không phải của người dán. Sửa khuôn để vừa bộ
      lọc là **bẻ sự thật cho vừa công cụ**.
   người làm: `claude-aiboss-app-exe` (script chạy thật). Nhỏ, không gấp — xếp sau ④ và ⑫.

⑱ 🔴 BỘ PHÁ `--ca-hai` HỎNG TỪ COMMIT `9bd9812` — CHẶN COMMIT của việc ④
   `bai-thu/doi-chung-am-mo-dun.sh:17` có `GOC=src/components/UngDung.tsx`, mà 23 khai báo đã dời
   sang `hang-so.ts` TRONG CHÍNH commit đó ⇒ nó phá một tệp KHÔNG còn chứa thứ cần phá
   ⇒ `bash bai-thu/chay.sh --ca-hai` EXIT=1 ⇒ **chứng cứ «thước biết đỏ» KHÔNG dùng được**
   👤 giao `hermes-build-app` (worktree riêng) — 🔴 KHÔNG giao `claude-aiboss-app-exe`:
      nó là người ĐANG BỊ chính thước đó đo. Người sửa thước ≠ người bị đo.
   📦 bàn giao sẵn: `ai/ban-giao/2026-09-04_bo-pha-ca-hai.md` (3.560 byte) — triệu chứng · gốc đã đo ·
      4 bước đã thử + kết quả · 4 neo cũ + mã thay thế · **mục «chỗ tôi KHÔNG biết»** (12 phép
      KHAI SAI LỚP là ĐOÁN, người viết CHƯA đọc `lop-phep-pha.mjs` — tự đọc rồi hãy tin)
   🕳 **Vì sao không ai thấy suốt từ ③:** hai bài thử ĐỎ ngay trước mặt nên được vá; bộ phá thì IM.
      Người soi ③ khai rõ «không chạy `doi-chung-am.sh` vì nó `sed` vào kho thật» — lý do CHÍNH ĐÁNG.
      exe không chạy — lý do chính đáng. PM không chạy — lý do chính đáng.
   🔑 **Thứ hỏng mà KÊU thì được sửa; thứ hỏng mà IM thì được commit.**
      Và chỗ nào ai cũng có lý do chính đáng để không chạm thì chỗ đó mục ruỗng.
   ⚠️ Cùng họ với ⑭ (lint chưa từng chạy) · cổng `.kiro` · sổ tiến độ. Cái thứ TƯ trong một ngày.

㉒ ✅ ĐÓNG 06/09 11:57 — thước AST vào main với HỢP ĐỒNG HẸP (Owner quyết B, round-10)
   ```
   ba đời thước trước  bác 3 lần   (soi TÊN HÀM → soi KÝ TỰ → soi TÊN BIẾN)
   ㉒ vòng 1-3         bác 3 lần   (phân loại → nhị phân+ngoặc → generic+dấu phẩy)
   Owner đổi CÂU HỎI   «bắt được mọi thứ?» → «NÓI THẬT về những gì làm được?»
   hợp đồng hẹp        PASS ngay vòng đầu
   ```
   🔑 **Thứ gỡ được bế tắc KHÔNG phải thêm một vòng sửa — mà là ĐỔI CÂU HỎI.** Cùng cái thước,
      cùng những giới hạn ấy. Sáu vòng đuổi một lời hứa rộng; một vòng cho một lời hứa hẹp mà đúng.
   ba khoá cùng phạm vi: TÊN `soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs` · TÀI LIỆU
      `HOP-DONG-…md` · TEST `hop-dong-hep-loi-goi-ten-truc-tiep.test.mts`
   CLI khi ĐẠT tự in đủ SÁU giới hạn nó KHÔNG bắt được (generic trong callee · dấu phẩy trong
      callee · bí danh · scope · xuyên mô-đun · mọi nhánh runtime)
   commit gộp `502af8e3` (--no-ff, 0 xung đột) · PM tự đo lại trên main: exit 0, 133/133,
      md5 thước `204eaa05…` KHỚP đúng bản người soi PASS · cây bẩn của việc ⑭ được bảo toàn
   👤 thợ: hermes-build-app (3 vòng) → gemini-aiboss-app-exe (nhập main) · soi: hermes-reviewer

㉒-cũ 🔴 (giữ làm ghi-sử) THƯỚC AST SAI CẢ HAI CHIỀU — bị bác VÒNG 3/3, PM đã DỪNG
   verdict `20260905_173533_d01eab` (05/09 17:42). Năm phản ví dụ đã đủ cụ thể để làm ĐỀ BÀI,
   KHÔNG cần đo lại:
     :87-88        gán vào thuộc tính mà CÓ người đọc  ⇒ phân loại SAI
     :80-82        gặp dấu phẩy KHÔNG đệ quy nguyên nút ⇒ sập
     :25-26,93-106 parseDiagnostics CÓ lỗi vẫn trả BẢNG XANH ⇒ tệp vỡ cú pháp = ĐẠT  ← nguy nhất
     :54-70,84-88  kết quả bị GHI ĐÈ trước khi đọc vẫn tính là «đã dùng»
     test :24-47   bộ mẫu chưa canh được bốn ca trên ⇒ sửa xong KHÔNG có gì giữ
   ✅ ĐÃ GIỮ ĐƯỢC, đừng làm lại: bảng đầy đủ «từng hàm × từng cách xử lý» và NĂM phép phá cũ —
      người soi xác nhận còn nguyên. Việc này chỉ đụng phần PHÂN LOẠI.
   🔑 Luật rút ra (SO-BAY-DO 91): thước phải có BA trạng thái — ĐẠT · KHÔNG ĐẠT ·
      **KHÔNG ĐO ĐƯỢC**. Trạng thái thứ ba phải làm cổng ĐỎ. Nghiệm thu bắt buộc có phép
      «đưa tệp vỡ cú pháp cho thước» — nó nói «sạch» là thước hỏng.
   👤 giao `hermes-build-app` worktree riêng, 🔴 KHÔNG giao `claude-aiboss-app-exe`:
      cùng lý do ⑱ — nó là người ĐANG BỊ chính thước này đo, và nó đã viết bốn đời thước liền.
      Người sửa thước ≠ người bị đo.
   📦 đề bài soạn sẵn: `ai/ban-giao/2026-09-05_thuoc-ast-ba-trang-thai.md`
   ⚠️ Thước nằm ở `bai-thu/`, KHÔNG vào bản dựng ⇒ việc này KHÔNG chặn giao diện ⑲⑳ về mặt kỹ
      thuật. Nó chặn về mặt LUẬT (cổng dựng ② đòi verdict ĐẠT). Owner đang chọn ba đường.

㉓ 🔴 `UngDung.tsx:**1134**` — `useCallback` THIẾU PHỤ THUỘC `dongO` (cổng lint bắt 06/09 08:00)
   🔴 **ĐÍCH ĐÃ DỊCH 06/09 15:3x: 1104 → 1134.** `claude-aiboss-app-exe` báo khi làm ô 5.
   Đo lại: `eslint` nay chỉ vào **1134:6**; dòng 1104 giờ là `doiBoCuc(6);` — mã khác hẳn.
   📌 Đây đúng thứ tôi dự đoán khi xếp ㉓ trước ㉖ («đích của ㉓ dịch đi») — và nó dịch vì việc
      ô 5, KHÔNG phải vì ㉖. **Đích dịch không cần ai tách tệp; chỉ cần ai đó chèn dòng phía trên.**
   ⚠️ Trước khi giao ㉓, chạy `npx eslint src/components/UngDung.tsx` lấy số dòng TƯƠI —
      đừng chép số trong sổ. Số dòng trong sổ là ẢNH CHỤP, không phải con trỏ.
   Mã chưa đầy MỘT NGÀY TUỔI: hàm `napBoGhe` lên bản thật tối 05/09 trong commit `0b30719`.
   ⚠️ KHÔNG vá được bằng cách thêm dep: `dongO` là hàm thường, sinh lại mỗi lần vẽ
      ⇒ thêm vào là `napBoGhe` đổi danh tính liên tục. Phải bọc `dongO` thành `useCallback` TRƯỚC.
   🔑 Đây là bằng chứng sống cho việc ⑭: một cổng vừa bật đã chỉ vào mã mới nhất, chỗ mà bốn
      vòng soi thủ công của hai ngày qua KHÔNG ai thấy.
   👤 giao `claude-aiboss-app-exe` — nhưng CHƯA giao: cây đang có việc ⑭ chưa soi nằm đó,
      chồng thêm là trộn hai thay đổi vào một lần soi. Đợi ⑭ soi xong và commit.
   ⚠️ chạm `src/` ⇒ cổng dựng ④ áp ĐẦY ĐỦ.

㉔ BỘ CANH CHẨN «ĐỤNG TRẦN» THÀNH «CHẾT» — sai HAI LẦN trong 13 tiếng
   05/09 20:36  hermes-build-app trần 86/86   → báo động: «phải mở phiên xem nó CHẾT ở đâu»
   06/09 09:00  hermes-web-noibo trần 120/120 → báo động: IM-LAU-KHONG-CAU-KET
   Cả hai lần việc CÒN NGUYÊN và nối lại được. Lần đầu suýt mất 208 dòng đã sửa.
   🔑 Câu phân biệt «Iteration budget reached (N/N)» do CLI in ra LÚC THOÁT ⇒ nó vào luồng
      NGƯỜI GỌI, KHÔNG vào bản ghi phiên. Ai chỉ soi bản ghi phiên thì luôn kết luận «chết».
   ✅ Vá: soi ĐUÔI nhật ký người gọi trước; không tìm được thì hạ giọng thành
      «KHÔNG RÕ chết hay đụng trần», đừng nói «chết».
   📖 SO-BAY-DO mục 97. ⚠️ Chẩn sai theo hướng bi quan cũng tốn thật, không phải an toàn miễn phí.
   👤 chưa giao — chờ hàng đợi hiện tại nhẹ bớt.

㉕ 🔴 SỔ Ô LƯU «NHÃN GHẾ» VÀ «MÃ PHIÊN» TÁCH RỜI, KHÔNG CÓ GÌ KIỂM CHÉO
   Ca thật 06/09 (claude-phong-ban-pm đo, Owner gửi ảnh 09:34):

   🔴 **CẬP NHẬT 06/09 14:3x — VÒNG 1/3 BỊ BÁC, và cả nhà đã hiểu sai `thu_muc`.**
   Verdict `hermes-aiboss-app-reviewer` phiên `20260906_140852_fc35e9` (3m51s · 39 lượt gọi):
   *«FAIL — Diff đúng chỉ-thêm, nhưng tác động đổi cwd/kho dùng chung chưa được chốt và trình
   tự chuyển ô thiếu cổng xác minh runtime mới cùng bảo đảm không nối nhầm phiên.»*
   🔑 **`thu_muc` KHÔNG phải nhãn mô tả — nó là tham số `cwd` truyền vào lệnh spawn:**
   ```
   chay-agent.ts:241-245   fs.mkdirSync(ts.thuMuc) ; spawn(lệnh, đối-số, { cwd: ts.thuMuc })
   goc-tich.ts:46-60 · 145-146 · fork/route.ts:55-82   cùng lấy chỗ đứng từ đây
   ⇒ khai thu_muc = RA LỆNH cho ghế chạy ở đó, KHÔNG phải mô tả chỗ nó đang đứng.
     mkdirSync còn TẠO thư mục — một trường trông như mô tả, thật ra là mệnh lệnh.
   ```
   🕳 **DÒNG TRƯỢT BA NGƯỜI, HAI LƯỢT SỬA CHO NHAU, MỘT HƯỚNG:**
   ```
   12:09 phong-ban-pm «phiên nằm ở kho đó ⇒ thêm là mô tả đúng sự thật»
   13:4x PM           diễn thành «khai SỰ THẬT về CHỖ ĐỨNG»
   13:55 exe          bác PM, sửa thành «khai KHO nơi tệp phiên nằm»
   14:11 người soi    cả ba đều sai — nó khai THƯ MỤC CHẠY
   ```
   📌 Ba ghế đọc TÀI LIỆU và đọc LỜI NHAU; người soi đi đọc CHỖ GỌI HÀM. Xem SO-BAY-DO 107.
   🔬 SỐ ĐO ĐÃ CHỐT (dùng lại được, đừng đo lại):
   ```
   ~/claude-marketing-pm/          0 tệp — RỖNG. Không CLAUDE.md, không .goc-tich.json
      đối chứng dương ~/claude-aiboss-app-exe/CLAUDE.md = 40.798 byte ⇒ thước sống
   kho riêng marketing-pm 1 tệp  ·  kho nhà 354 tệp  ·  2f5f0c37 nằm ở kho NHÀ
   UngDung.tsx:988  ds.find((p) => !p.dang_chay)  ← lấy phiên ĐẦU TIÊN rảnh
      ⇒ chọn từ menu KHÔNG bảo đảm nối đúng phiên. ĐÚNG con bọ đã gây ra ca này.
   hang-so.ts:210-217  BO_QUAN_LY_CU ghim `phien: '<uuid>'` từng ghế ⇒ cơ chế GHIM CÓ SẴN
   ```
   ✅ **CỔNG RUNTIME — exe tìm ra, giữ lại dùng cho mọi ca sửa dữ liệu bị nhập tĩnh:**
   ```
   GET /api/phien?ma_nhan_su=claude-marketing-pm  phải THẤY 2f5f0c37 sau khi dựng
   đối chứng ÂM đã chạy TRƯỚC khi có số để nhìn: nay False; web-funnel True ⇒ thước sống
   còn False sau khi dựng ⇒ bản mới CHƯA tới máy chủ ⇒ CẤM đổi sổ ô
   ```
   🔴 Người soi bác luôn chỗ PM và exe cùng tin: `doc-phien.ts:460-490` CÓ THỂ cho qua khi
      không thấy tiến trình cầm UUID; GET thật trả `dang_chay: false`. **Chốt 5 phút KHÔNG
      phải bảo đảm**, và mtime KHÔNG chứng minh tiến trình còn sống.
   ✅✅ **OWNER QUYẾT LẦN HAI 16:26 06/09/2026 (round-12) — ĐÓNG vòng soi cũ:**
      ```
      ① 🅐 Nhận BẢN HẸP, và GỌI ĐÚNG TÊN NÓ: «ghim ở đường bấm tên và bấm thẻ»
      ② 🅔 KHÔNG mở vòng bốn — coi là VIỆC MỚI, bộ đếm vòng ĐẾM LẠI TỪ 0/3
      ```
      🔑 **Owner không chỉ chọn phạm vi — ông ấy chọn CÁCH GỌI nó.** Nên việc chính của lượt
      thi hành là **sửa TÊN trong mã**, không phải thêm tính năng.
      PM đo: 3 chỗ trong `src/` còn gọi «ghim cứng», nặng nhất `nap-bo-ghe.ts:59` —
      **đó là câu Owner NHÌN THẤY** khi phiên ghim mất. Cộng `UngDung.tsx:1006` mang cả hai
      tên đã bỏ («ghim CỨNG» và «đường menu»).
      🔴 ĐỪNG `sed` cả nắm: `MASTER-PLAN.md:2452` có «ghim cứng localhost:4319» = MÃ CỨNG địa chỉ,
         nghĩa KHÁC HẲN · dòng 2142 · 2150 là ghi-sử trích lời Owner. Cả ba ĐỪNG ĐỘNG.
      📌 Lại đúng bài học mục ⑤: **đếm ra 7 chỗ không có nghĩa là 7 việc.**
      📄 đề thi hành: `ai/ban-giao/2026-09-06_o5-owner-quyet-A-E.md`
      🔀 việc ㉘ (bốn đường chưa tôn trọng ghim) VẪN TREO — Owner nhận bản hẹp, không huỷ ㉘.

   📜 **GHI-SỬ — quyết định LẦN MỘT 15:10, giữ để tra lại:**
   ✅ **OWNER ĐÃ QUYẾT 15:10 06/09/2026 London — lựa chọn 🅐:**
      *«Khai `thu_muc` VÀ ghim cứng phiên `2f5f0c37`»*
      ⇒ ĐANG THI HÀNH. Owner nhắc đích danh «GIAO EXECUTOR — PM không tự làm».
      ```
      việc ① đóng dấu trang  → gemini-aiboss-app-exe (banner + badge, KHÔNG xoá câu cũ)
                               chấm ba chốt: claude-phong-ban-pm (nếp mới: dựng ≠ chấm)
      việc ② thi hành 🅐      → claude-aiboss-app-exe
                               đề: ai/ban-giao/2026-09-06_o5-owner-quyet-A.md
      ```
      🔴 **PM CỐ Ý KHÔNG chốt hộ exe chỗ «ghim cứng ở ĐÂU»** — có ít nhất hai chỗ ghim được,
      và chọn sai một chỗ thì đổi một menu Owner nhìn thấy. Đề ghi rõ: exe đọc mã tự quyết,
      và **DỪNG báo PM** nếu cách đúng bắt buộc đưa marketing-pm vào bộ «Quản Lý Cũ» —
      đó là hệ quả Owner CHƯA được nghe lúc tick.
      🔢 Vòng soi việc này: **1/3 đã dùng** (FAIL 14:11). Lần trình tới là vòng 2/3.

   📜 **GHI-SỬ — trang round-11 ĐÃ LÊN 06/09 14:5x, giữ nguyên để tra lại**
      `https://aiboss-app-noibo.erocathanh.com/round-11`
      dựng+đẩy: `gemini-aiboss-app-exe` (Antigravity — Owner chốt: tới 09/09 trang round đi đường này)
      ```
      ba chốt do người DỰNG chạy : RENDER-OK · md5 đĩa khớp web từng byte · round-9999 ⇒ 404
      đo lại ĐỘC LẬP bởi exe     : md5 375bd200… khớp · 25.662 byte · RENDER-OK tự chạy
                                   ⇒ người đo KHÁC người dựng, đây mới là đối chứng thật
      PM kiểm tệp đĩa            : md5 KHỚP · dấu bản 4 «TAY LÁI» ⇒ 2 · đối chứng âm chuỗi bịa ⇒ 0
      PM KHÔNG tự đo được bản live (401 với cả round-10 chắc chắn có thật) ⇒ khai là MÙ, đi hỏi
      ```
   🕳 **NỘI DUNG TRANG SỬA NĂM LẦN TRƯỚC KHI LÊN — và hình rất rõ:**
      ```
      SỐ ĐO trên trang     : sai 0 lần
      CÂU TÓM TẮT CƠ CHẾ   : sai 5 lần, rút 5 lần
         «khai CHỖ ĐỨNG» PM · «khai KHO» exe · «mkdirSync là CÁI GIÁ» PM
         · «chỗ VẮNG nó» research · «TẮT cái máy» PM
      ```
      🔑 Cả năm bản sai đều là một câu MỘT DÒNG nghe gọn. **Các con số sống sót; các khẩu hiệu chết.**
      Bốn trong năm bản được người khác chép lại trong vòng 20 phút — câu gọn lan nhanh hơn số đo.
      ✅ Cảnh báo đó đã ghi THẲNG lên trang cho Owner: một câu gọn mà không kèm số dòng mã thì
         đó là chỗ YẾU NHẤT, không phải chỗ chắc nhất.
   📌 exe ĐANG NGHỈ việc ô 5, cây giữ nguyên (`nhan-su.json` băm `3a3f440d…`). ㉓ và ㉖ đứng yên.
     ô 5 khai ghế   claude-web-funnel
     mã phiên ô 5   2f5f0c37-… nằm ở kho ~/.claude/projects/-Users-erocathanh/
     phiên đó tự xưng  claude-marketing-pm 2.497 lần · claude-web-funnel 140 lần
     ⇒ NHÃN nói một đằng, PHIÊN là một ghế khác. App KHÔNG báo gì.
   ⚠️ KHÁC ca fork 20/08: fork cấp mã MỚI ⇒ hai bên ghi hai tệp ⇒ an toàn.
      Ca này KHÔNG fork ⇒ ô 5 và terminal Owner dùng CÙNG một mã phiên
      ⇒ hai tiến trình có thể ghi CHUNG một tệp 16 MB.
   🔑 Câu trong hồ sơ ghế «đừng khuyên Owner exit terminal vì fork tạo tệp mới» CHỈ ĐÚNG CHO FORK.
      Ai dẫn lại câu đó ở ca này sẽ kết luận NGƯỢC.
   ✅ VÁ BỆNH, ĐỪNG VÁ CA: thêm phép kiểm chéo. Đổi nhãn ô 5 chỉ là vá một ca.
   🔧 THƯỚC ĐÃ CÓ, RẺ HƠN NHIỀU (claude-phong-ban-pm tìm 06/09 10:07 — KHÔNG cần mở tệp):
      Claude Code đặt bản ghi phiên vào thư mục suy ra từ `cwd` LÚC KHỞI ĐỘNG, thay `/` bằng `-`.
      `cwd` khởi động KHÔNG đổi dù agent `cd` đi đâu (đo: phiên ô 5 chạy qua 5 thư mục,
      nhiều nhất 4.152 lần ở chỗ khác, mà kho vẫn nguyên `-Users-erocathanh`).
      ⇒ phép kiểm CHỈ LÀ:  kho mong đợi = "-Users-erocathanh-" + ma_nhan_su
                            tệp <ma_phien>.jsonl nằm kho khác ⇒ CẢNH BÁO trong ô
      📌 Không đọc nội dung, không đếm gì — chỉ so đường dẫn. Với tệp 16 MB thì khác biệt này lớn.
      ⚠️ ĐỪNG dùng cách đếm chuỗi tên ghế trong tệp: đó là thước YẾU, một phiên hay nhắc tên ghế
         khác cũng ra số cao. Research dùng được ở ca ô 5 chỉ vì tỉ lệ 2.497/140 quá chênh.
      ✅ Research chạy thử trên cả 6 ô: bắt đúng ô 5, và IM ĐÚNG 5 ô còn lại.
         🔑 Một thước chỉ bắt được ca xấu thì chưa đủ — nó phải im đúng chỗ nên im.
   ⚠️ BA GIỚI HẠN người làm phải biết TRƯỚC (Research tự nêu, không đợi ai moi):
      ① thước dựa vào QUY ƯỚC «ghế X sống ở ~/X». Đo hôm nay 5/6 ô theo quy ước.
         Ghế cố ý mở ở thư mục khác sẽ bị BÁO NHẦM ⇒ cần danh sách miễn trừ, hoặc lấy cwd
         mong đợi từ SỔ GHẾ thay vì suy từ tên.
      ② nó nói được «phiên khởi động ở ĐÂU», KHÔNG nói được «phiên TỰ XƯNG là ai».
         Hai câu KHÁC nhau. Ca ô 5 trùng nhau nên một thước đủ; ca khác có thể cần cả hai.
      ③ muốn thước thứ hai làm đối chứng: đọc trường cwd ở dòng đầu bản ghi
         (grep -o '"cwd":"[^"]*"' <tệp> | head -1) — vẫn rẻ, chỉ đọc tới dòng ~3.
   🔴 CHỐT HIỆN CÓ KHÔNG BẮT ĐƯỢC CA NÀY — `claude-phong-ban-pm` đo 06/09 12:14:
      `hang-so.ts:163` khai «`/api/o` chỉ nhận phiên CÓ THẬT trong kho của ĐÚNG ghế đó
      (`o/route.ts:37`)» — nghe như đã có chốt. Nhưng ca ô 5 LỌT QUA:
      ```
      chốt hiện có   phiên phải NẰM TRONG kho của ghế        ⇒ ô 5 THOẢ (hợp lệ!)
      chốt còn thiếu phiên phải LÀ PHIÊN CỦA ghế đó,
                     không chỉ nằm cùng kho với nó            ⇒ ô 5 KHÔNG thoả
      ```
      🔑 Vì `thu_muc` làm 5 ghế dùng CHUNG kho `-Users-erocathanh`, câu «nằm trong kho của ghế»
      **không còn phân biệt được ai với ai**. Chốt đúng luật mà vẫn cho lọt.
      ⇒ ㉕ phải kiểm CHÉO danh tính (ghế mà phiên TỰ XƯNG), KHÔNG chỉ kiểm vị trí tệp.
   📌 PM cố ý KHÔNG tự đổi nhãn hay trỏ lại ô 5: đó là chỗ làm việc SỐNG của Owner.
   👤 chưa giao. Chạm src/ ⇒ cổng dựng ④ áp đầy đủ.

㉖ TÁCH HAI MENU «CƠ CẤU TỔ CHỨC» + «TOÀN BỘ NHÂN SỰ» RA TỆP RIÊNG (Owner đề xuất 06/09 12:1x)
   Owner nói: «tách thành file giao diện riêng để khi sửa khu đó không ảnh hưởng sửa bộ ghế».
   🔬 PM ĐO 06/09 12:1x — và số nói Owner ĐÚNG, cắt chỗ này là cắt SẠCH:
   ```
   UngDung.tsx            3.023 dòng
   .cot-1 «Cơ cấu tổ chức»  dòng 2115-2257  = 143 dòng
   .cot-2 «Toàn bộ nhân sự» dòng 2260 →
   HAI KHU ĐÓ GỌI HÀM BỘ GHẾ MẤY LẦN:
       datNguoi   0      ← hàm gây ra SÁU VÒNG soi
       ghiO       0
       dongO      0
       luuBoGhe   0
       napBoGhe   2      ← nút bộ ghế trong «Vào phòng ban»
       boGheCu    5      ← chỉ ĐỌC để hiện bộ đã lưu
   ```
   🔑 **Bốn hàm nguy hiểm nhất của dự án KHÔNG hề xuất hiện trong hai khu đó.** Chỗ đã tốn sáu
      vòng soi nằm hoàn toàn ngoài phần Owner muốn tách ⇒ đúng là hai việc khác nhau, đang
      dính nhau chỉ vì ở chung một tệp.
   💰 CÁI GIÁ THẬT: 9 trong 18 state phải truyền xuống làm tham số
      (phongMo · phongChon · tuKhoa · boCuc · kieuHai · boGheCu · nhacO1 · anKhu · anCot).
      Đó là công việc chính của lượt tách, khôngphải phần JSX.
   ⚠️ ĐỤNG CÙNG TỆP với ㉓ (UngDung.tsx — số dòng TƯƠI, đo bằng eslint, đừng chép sổ)
      ⇒ KHÔNG chạy song song. Làm ㉓ trước hoặc sau,
      đừng cùng lúc — luật hàng đợi của nhà.
   📌 Đây là LÁT CẮT CỤ THỂ ĐẦU TIÊN của việc ⑨ (chia thân logic). ⑨ chờ «tệp nguội»;
      lát này Owner khoanh vùng sẵn nên đo được ngay, khôngphải chờ.
   👤 chưa giao. Chạm src/ ⇒ cổng dựng ④ áp đầy đủ ⇒ phải qua exe.

㉗ 🟠 PHANH CẠN TRẦN LÀM GHẾ CÂM — TỐI ĐA MỘT GIỜ, rồi tự nhả (viết lại 06/09 13:1x)
   🔴 **BẢN ĐẦU CỦA MỤC NÀY SAI — tôi viết, `claude-aiboss-app-exe` bác 06/09 13:00, tôi nhận.**
   Giữ nguyên câu sai ở đây làm ghi-sử, vì nó đã kịp đi vào sổ trước khi bị bác:
   > *«BỘ CANH TỰ KHOÁ MÌNH — mốc đọc chỉ ghi SAU KHI rung xong ⇒ tồn đọng lớn là ĐIẾC VĨNH VIỄN»*

   **Ba điểm sai, mỗi điểm một số dòng — exe đọc mã trước khi nói:**
   ```
   ① SAI TÊN MỐC. Cái bị hoãn-ghi là mốc CANH ($KHO/*.moc), KHÔNG phải mốc ĐỌC.
      dòng 343 : «CHỈ ghi mốc khi đã VÀO HÀNG ĐỢI (200)»
      dòng 332·336 : hai lối thoát khi gọi hỏng, cả hai ghi rõ «không ghi mốc»
      ⇒ mốc ĐỌC ở nhánh khác hẳn (221-253) và nó KHÔNG gây điếc (xem SO-BAY-DO 104-c)
   ② KHÔNG CÓ VÒNG KHOÁ. Một lần gọi THÀNH CÔNG đẩy mốc qua TOÀN BỘ tồn đọng, không phải từng tin.
      dòng 274 : tính `$cu -> $moi`, với $moi = SỐ DÒNG HIỆN TẠI của kênh
      dòng 347 : `echo "$v" > "$m"` ghi thẳng giá trị đó
      ca thật  : mốc của exe nhảy 36.824 → 48.086 trong MỘT nhịp, xoá 11.153 dòng tồn
   ③ KHÔNG «VĨNH VIỄN». Phanh là cửa sổ TRƯỢT, tự nhả.
      dòng 31 : CUA_SO=3600 (1 giờ)   ·   dòng 90 : log in «còn ~N phút nữa mới tự nhả»
   ```
   ⚖️ **PHẦN CÒN THẬT — đừng vứt cả mục.** Phanh cạn thì mốc không được ghi, nên trong cửa sổ đó
      ghế câm và tồn đọng dồn lại. Rủi ro CÓ THẬT, chỉ khác về ĐỘ:
      **«câm tối đa một giờ» chứ không phải «điếc vĩnh viễn».**
   🔑 **Vì sao một câu sai về CÁI GÌ ĐANG CHẶN lại nguy hơn một câu sai thường:** nó gỡ phanh cho
      MỌI người đọc nó. Ai tin «vĩnh viễn» sẽ đi vá tay mốc của người khác — đúng việc tôi suýt làm.
   📌 **Và câu đắt nhất của cả ca này, exe nói, tôi chép vào nếp làm việc:**
      *«Đính chính một tin thì cứu được người đang đọc kênh. Nó KHÔNG cứu được người sẽ đọc sổ.»*
      ⇒ Nếp mới: rút một chẩn đoán thì **rà luôn xem nó đã kịp đẻ ra việc nào trong sổ chưa.**
      Mục ㉗ này chính là cái nó đẻ ra, và nó sống thêm 20 phút sau khi tin đính chính đã phát.

   🕳 BẢNG DƯỚI ĐÂY ĐO NHẦM LOẠI MỐC — giữ làm ghi-sử, ĐỪNG dùng làm cơ sở vá:
   ```
   claude-aiboss-app-exe  doi-aiboss-app-chat  33.622 · kẹt từ 02/09 · tồn 14.383 dòng ⇒ ĐIẾC 4 NGÀY
   claude-aiboss-app-exe  BOSS-CHANNEL         12.212 · kẹt 5 ngày
   hermes-build-app       doi-aiboss-app-chat  34.574 · kẹt 3 ngày
   claude-phong-ban-pm    doi-aiboss-app-chat  23.229 · kẹt 4 ngày
   claude-aiboss-app-pm   ĐÃ VÁ TAY 06/09 10:14 (mốc cũ 30.580, cũng kẹt từ 02/09)
   ```
   ⇒ Năm con số trên là mốc ĐỌC (`.moc-doc-cua-toi-*`), thứ chỉ NARROW chứ không DRIVE.
     Chúng có thể cũ mà ghế vẫn nghe bình thường. Muốn biết ghế có câm thì đo mốc CANH
     (`~/Operations/scripts/.mc-<ghế>/<kênh>.moc`) và log «PHANH CAN 68/68».
   🔑 **Hai thành phần đều làm ĐÚNG việc của nó** — trần chống dội, hoãn ghi mốc chống bỏ sót.
      **Cái hỏng nằm ở CHỖ NỐI.** Soi từng phần thì phần nào cũng đạt.
   📌 Và cái điếc ấy CÓ TIẾNG KÊU: 18 dòng «PHANH CAN 68/68 · GHE NAY DANG DIEC» đã nằm sẵn
      trên kênh. Không ai đọc. Tiếng kêu có, chỗ đứng nghe thì không.
   ✅ VÁ: ① ghi mốc theo số tin ĐÃ ĐẾM, đừng theo số tin ĐÃ RUNG THÀNH CÔNG
         ② tồn đọng vượt trần ⇒ nhánh «bỏ đống cũ, chỉ rung tin MỚI NHẤT»
            (rung 68 lần cho 14.000 dòng là vô nghĩa; một lần cho tin cuối là đủ)
         ③ phép tự kiểm: mốc nào cũ hơn 24 giờ mà kênh vẫn tăng ⇒ báo đỏ
   ⚠️ PM đã vá TAY mốc của exe (nhích tới ngay trước tin gộp ba việc, có sao lưu) — đó là vá
      TRIỆU CHỨNG cho một ghế. Ba mốc còn lại PM CỐ Ý chưa động: nhích mốc của ghế khác là
      bắt họ bỏ qua tin họ chưa đọc, và PM không biết trong đó có gì với họ.
   ✅ VÁ CÒN GIÁ TRỊ (đã lọc theo bản đo đúng): ② bỏ đống cũ, chỉ gọi cho tin MỚI NHẤT —
      68 lần cho 14.000 dòng là vô nghĩa, một lần cho tin cuối là đủ · ③ phép tự kiểm: mốc CANH
      cũ hơn 24 giờ mà kênh vẫn tăng ⇒ báo đỏ. **Vá ① BỎ** — nó chữa một bệnh không tồn tại.
   📖 SO-BAY-DO 104 (bản sai, giữ ghi-sử) + **104-c (đính chính)**. Đọc 104-c TRƯỚC.
   👤 chưa giao — script ở ~/Operations/, không thuộc kho app. Mức: câm tối đa 1 giờ ⇒ KHÔNG gấp.

⑨ trục ④ chia thân logic 1.887 dòng — thứ THẬT SỰ mở khoá «đội chạy song song»
   cần đề riêng: phân tích phụ thuộc giữa 52 móc. CHỜ tệp nguội (nay 34 commit/7 ngày)
```

## 🔑 HAI NGUYÊN TẮC XẾP HÀNG NÀY
```
① CÂY SẠCH TRƯỚC, VIỆC MỚI SAU. Đổ việc mới lên 12 tệp bẩn là trộn hai việc vào một lần soi.
② HAI VIỆC CHẠM CÙNG MỘT TỆP THÌ KHÔNG SONG SONG. ③ và ④ đều chạm UngDung.tsx —
   chạy song song trên tệp 34 commit/7 ngày là tự tạo xung đột nhập cây.
```
📌 **Việc «hay» KHÔNG được chen lên trước việc «chặn».** ③ và ④ hấp dẫn hơn ① nhiều lần —
đó chính là lý do phải viết thứ tự ra giấy thay vì để nó tự diễn ra.

---

# 📐 MỤC 9 — TRỤC CHIA `UngDung.tsx`: CÂU TREO TỪ 30/08 NAY CÓ SỐ

> 📅 Nhập 04/09/2026 07:27 BST bởi `claude-aiboss-app-pm` · Owner giao
> 📄 Tờ số gốc: `~/idea/inbox/aiboss-app-noibo/TO-SO-truc-chia-UngDung.md` (`claude-phong-ban-pm`, Research)
> ⚖️ Research mang SỐ, PM quyết. Phần «QUYẾT» dưới đây là của PM, không phải của người đo.

## 9.1 🔴 CON SỐ 3.212 TRONG KẾ HOẠCH NÀY ĐANG NÓI QUÁ 1,8 LẦN
```
tệp          3.212 dòng
chú thích    1.291 (40,1%)   ← 1.277 dòng trong khối /* */ + 92 dòng //
dòng trống     136
MÃ THẬT     ~1.785 dòng
```
📌 Mọi chỗ trong kế hoạch này dùng «3.212» làm căn cứ khối lượng việc đều **tính dư gần một nửa**.
🔑 Người đo tự nghi thước của mình (mẫu `^\s*\*` có thể bắt rộng) rồi **đối chứng lại bằng cách đếm
dòng nằm TRONG khối `/* */`** ⇒ ra đúng 1.277. Nghi thước trước khi tin số — đó là cách con số này
đáng tin.

## 9.2 TỆP GÃY TỰ NHIÊN THÀNH BỐN KHỐI
```
   1- 357  NGOÀI component   7 import · 21 hằng · 4 hàm phụ trợ (23 dòng)
 358-2245  THÂN logic        1.887 dòng · 52 móc · 57 hàm mũi tên
2245-3212  JSX               967 dòng · MỘT `return (` duy nhất
đối chứng cộng: 357+1.887+967 = 3.211/3.212 (lệch 1 dòng ranh giới)
```
🔴 **Toàn tệp có ĐÚNG MỘT component. 2.854 dòng nằm trong MỘT hàm.**

| trục | dòng | % | ràng buộc ĐO ĐƯỢC |
|---|---|---|---|
| ① kiểu | 126 | 3,9% | ✅ ĐÃ LÀM (M1a `771c7ef`) |
| ② ngoài component 1-357 | 357 | 11,1% | 🟢 **KHÔNG đụng state** |
| ③ JSX 2245-3212 | 967 | 30,1% | 🔴 bám **17/19 biến state (89%)** |
| ④ logic 358-2245 | 1.887 | 58,7% | 🔴 52 móc nằm hết ở đây |

## 9.3 ⚖️ PM QUYẾT — và quyết kèm một câu KHÓ CHỊU phải ghi ra
```
LÀM trục ② (1-357).  Rẻ, an toàn đo được, cùng LOẠI với M1a vừa qua trơn tru.
```
🔴 **NHƯNG trục ② KHÔNG mua được thứ Owner muốn.** Ưu tiên số 1 của Owner là *«đội code chạy song
song»*. Hai việc giao diện chạy song song được hay không nằm ở **thân logic (④)** và **JSX (③)** —
chỗ 52 móc và 17/19 biến state. Cắt ② xong thì hai việc giao diện **vẫn đụng nhau y như cũ.**
📌 Ghi thẳng ra để KHÔNG ai báo «đã chia tệp xong» rồi Owner vẫn đau y nguyên — đúng cái bẫy mục 5b
của kế hoạch này đã cảnh báo: *«làm đúng chữ mà trượt ý là cách hỏng tệ nhất, vì nó TRÔNG NHƯ đã xong.»*
⇒ **Thứ thật sự mở khoá là trục ④.** Nó cần một đề riêng: phân tích phụ thuộc giữa 52 móc.
Người đo tự khai đó là việc **nặng hơn một lượt đo** — đừng nhét vào một lượt.

## 9.4 HAI CÁCH ĐỌC — giữ nguyên cả hai, KHÔNG xoá cách bị bác
Người đo trình A («chưa đáng làm») và B («đáng làm, và chính vì đang nóng»). PM chọn hướng B cho
trục ②, nhưng **cách đọc A còn nguyên giá trị cho trục ③ và ④**: tệp đang có **34 commit/7 ngày**
(63% commit cả tháng dồn vào tuần qua), chia phần nóng giữa lúc nóng là tự tạo xung đột nhập cây.
⇒ Trục ④ **chờ nhịp nguội hơn**, hoặc chờ một cơ chế chia việc không đụng nhau.

## 9.5 SỐ CẢNH BÁO VỀ CÔNG SỨC — 30 : 1
```
22 commit ngày 03/09:  chạm src/ = 2 dòng-tệp  ·  chạm bai-thu + ai = 60 dòng-tệp
bai-thu/ có 39 tệp, 14 tệp nhắc UngDung ⇒ 36% bộ đo tồn tại VÌ tệp này
```
⚠️ Đây là số của PM phải nhìn, không phải của thợ. Thước cần thiết, nhưng **30:1 là tỷ lệ của một
đội đang mài dao nhiều hơn thái.**

---

# 📊 MỤC 10 — TRẦN LƯỢT HERMES: NÂNG TRẦN KHÔNG CỨU ĐƯỢC

> 📄 `~/idea/inbox/aiboss-app-noibo/BAO-CAO-tran-luot-hermes-doi-ta.md` (`claude-phong-ban-pm`)
> 📄 bản gốc `~/Operations/tra-cuu/2026-09-04-hermes-tran-luot-cong-cu.md` (`claude-chuyen-may-pm`)

## 10.1 SỐ
```
13 hồ sơ Hermes:  11 hồ sơ max_turns=60  ·  web-noibo=120  ·  zalo-cskh=6
                  TẤT CẢ delegation.max_iterations = 50  ⚠️ ĐỪNG sửa nhầm khoá này
41 ca chạy trên máy ⇒ 7 ca CHẠM TRẦN
🔴 web-noibo ĐÃ ở trần 120 mà vẫn chạm trần 6 trong 7 ca ấy
```
⇒ **Nâng trần là chữa triệu chứng.** Đây là bằng chứng, không phải lý lẽ.

## 10.2 ĐÒN BẨY THẬT: GỌI CÔNG CỤ SONG SONG
```
web-noibo         1,16–1,68 lượt gọi công cụ / vòng   ⇒ gần như TUẦN TỰ
hermes-build-app  2,86                                ⇒ SONG SONG nhiều hơn
190 lượt gọi → KHÔNG chạm trần   ·   140 lượt gọi → CHẠM
⇒ số lượt gọi công cụ KHÔNG dự đoán được chạm trần; số VÒNG mới quyết định
```
✅ **Việc phải làm: chia đề bài nhỏ hơn, và soạn đề sao cho người nhận gọi công cụ SONG SONG được.**
Đó là việc của người GIAO — tức của PM, không phải của Hermes.

## 10.3 🔗 NỐI VỚI CA «CHẾT GIỮA CHỪNG» 03-04/09
Mắt canh Hermes báo nhiều ca `CHET-GIUA-CHUNG`. Mục này cho một **giả thuyết có số đỡ**: một phần
trong đó là **chạm trần vòng**, chứ không phải hỏng bí ẩn.
⚠️ KHÔNG phải tất cả — ca reviewer 17:07 chết vì **bộ lọc nội dung nhà cung cấp**, không phải trần.
⇒ Việc kế: mắt canh phải **phân biệt CHẠM TRẦN với CHẾT VÌ LỖI KHÁC**, và nói ra loại nào.

## 10.4 BẪY ĐO người đo TỰ KHAI — giữ lại vì nó dạy cách đọc bảng trên
Họ tính `lượt gọi công cụ ÷ TRẦN`. Phép ấy **chỉ đúng cho ca CHẠM trần** (khi đó vòng thực = trần).
Với ca KHÔNG chạm, vòng thực nhỏ hơn trần ⇒ tỷ lệ tính ra **thấp hơn thật**.
📌 Nên cột «tool/vòng» của mấy ca KHÔNG chạm trần là **cận dưới**, đừng đọc thành giá trị thật.

---

# 🕳 MỤC 11 — HAI BẪY «CHẾT CÂM» TỪ HỒ SƠ 9BizClaw: ĐỘI TA ĐO LẠI

> 📅 Nhập 04/09/2026 11:35 BST bởi `claude-aiboss-app-pm`
> 📄 Nguồn: hồ sơ 9BizClaw (`claude-chuyen-may-pm`), Owner chuyển vào kênh đội
> ⚖️ Nguồn ghi rõ «tự quyết đưa gì vào plan». **Cả hai lời khai đều được đo lại trên mã của TA.**
> 🔴 MASTER-PLAN trước lúc này nhắc 9BizClaw **0 lần** — tin gốc nằm ở BOSS-CHANNEL từ 19:59 tối qua,
>    đội không thấy. Ghi ra để nhớ: **tin ở kênh KHÁC thì coi như chưa tới.**

## 11.1 BẪY ① — `cau-hinh.ts:28` tra `claude` theo PATH
**Lời khai:** app Electron mở từ Finder KHÔNG có `~/.local/bin` trong PATH ⇒ đóng gói xong mọi ô im lặng.

**Đội ta đo:**
```
cau-hinh.ts:28  lenhClaude: process.env.DUONG_DAN_CLAUDE ?? 'claude'   ✅ ĐÚNG như khai
which claude    /Users/erocathanh/.local/bin/claude                    ⇒ đúng là phụ thuộc PATH
'electron' trong package.json  0     ·  tệp .app trong kho  0
cách chạy hiện tại: exec npx next start -H 0.0.0.0 -p 4319
```
✅ **KHÔNG phải bug đang sống.** Bằng chứng mạnh nhất KHÔNG phải là dump biến môi trường (tôi thử
`ps -Eww` và nó KHÔNG lấy được PATH của tiến trình khác — thước hỏng, không phải kết quả) mà là
**hành vi quan sát được: các ghế đã sinh tiến trình `claude` và trả lời suốt cả ngày 03-04/09.**
Sinh được nghĩa là tìm được.

🔴 **Nhưng nó là ĐIỀU KIỆN TIÊN QUYẾT của việc đóng gói.** Ngày nào app được gói lại và mở từ Finder,
ngày đó **mọi ô im lặng mà KHÔNG báo lỗi gì** — đó là loại hỏng tệ nhất: app vẫn mở, giao diện vẫn
vẽ, chỉ có điều không ô nào trả lời.
✅ **Chìa đã có sẵn:** biến `DUONG_DAN_CLAUDE`. Chốt rẻ, đặt TRƯỚC khi cần:
```
⚠️ TRƯỚC KHI ĐÓNG GÓI app: đặt DUONG_DAN_CLAUDE bằng ĐƯỜNG TUYỆT ĐỐI trong tệp khởi động,
   và nghiệm thu bằng cách MỞ TỪ FINDER rồi thử gửi một tin — đừng chỉ mở từ dòng lệnh.
   Mở từ dòng lệnh sẽ luôn qua, vì nó thừa kế PATH của người gõ.
```

## 11.2 BẪY ② — tệp NGOÀI kho ghim cứng `localhost:4319`
**Lời khai:** 8 tệp. **Đội ta đếm: 53 tệp — trong đó 25 tệp SỐNG, 28 bản sao lưu.**
```
25 tệp sống:  19 script trong ~/Operations/scripts/  ·  6 tệp CLAUDE.md / AGENTS.md của ba ghế
              (mat-canh-ghe.sh · hen-khoi-dong-lai-app.sh · ghi-va-goi.sh · wake-wait.py ·
               mat-canh-hermes.py · 5 script rung-* · …)
ĐỐI CHỨNG DƯƠNG: tệp nhắc '4319' bất kỳ trong cùng phạm vi = 54 ⇒ thước sống
```
📌 **Nguồn đếm thiếu hơn ba lần.** Không phải họ sai — phạm vi quét của họ hẹp hơn. Nhưng con số
đi vào kế hoạch phải là con số của TA, đo trên máy TA.
🔴 **Kết luận của họ vẫn ĐÚNG, và nay đúng nặng hơn:** đổi cổng 4319 là **giết hệ chuông**, vì
25 chỗ sống phải sửa đồng thời — trong đó có mắt canh, script rung, và hồ sơ của cả ba ghế.
⇒ **Cổng 4319 nay là một hằng số của HỆ, không phải một tuỳ chọn của app.** Muốn đổi thì phải
làm thành một việc riêng có danh sách 25 chỗ, KHÔNG được đổi tiện tay.

## 11.3 ĐIỀU ĐÁNG GIÁ NHẤT KHÔNG PHẢI HAI BẪY
Cả hai bẫy đều là loại **CHẾT CÂM**: hệ vẫn chạy, giao diện vẫn vẽ, không có lỗi nào in ra —
chỉ là không có gì xảy ra nữa. Đây là cùng một họ với mọi thứ đội đã cắn hai ngày qua:
```
cổng .kiro có mà chưa từng nổ  ·  bộ đo xanh mà chưa chứng minh biết đỏ
mắt canh neo vào trường rỗng   ·  mắt canh chỉ đọc khuôn của chính nó
```
🔑 **Hệ này hỏng theo kiểu IM LẶNG, không theo kiểu BÁO LỖI.** Nên mọi thứ ta dựng phải trả lời được
câu: *«nếu thứ này chết, có ai biết không — và biết bằng cách nào?»*

---

# 🖼 MỤC 12 — BỐ CỤC MỚI: **2 Ô TRÁI-PHẢI** (chia dọc)

> 📅 Owner giao 04/09/2026 11:48 BST · nhập bởi `claude-aiboss-app-pm`
> 🎯 Nguyên văn Owner: *«hiện tại chỉ có 1 ô, 2 ô trên dưới, 4 ô và 6 ô — chưa có 2 ô trái phải»*

## 12.1 HIỆN TRẠNG — đo, không nhớ
```
UngDung.tsx:375   const [boCuc, datBoCuc] = useState<1 | 2 | 4 | 6>(1);
UngDung.tsx:116   const KHOA_BO_CUC = 'phong-ban-ai.bo-cuc';
UngDung.tsx:1064  const bc = Number(localStorage.getItem(KHOA_BO_CUC));
CSS lớp bố cục:   .luoi.bc-1 · .bc-2 · .bc-4 · .bc-6
   bc-2 hiện là:  grid-template-columns:1fr · grid-template-rows:1fr 1fr   ⇒ TRÊN-DƯỚI
```
⇒ Owner đúng: **không có phương án hai cột.** `bc-2` đang là hai hàng.

## 12.2 🔴 BỐN RÀNG BUỘC — người làm KHÔNG biết trước thì sẽ vấp
```
① GIÁ TRỊ LƯU LÀ MỘT CON SỐ.  dòng 1064 dùng Number(...)
   ⇒ lưu một giá trị KHÔNG phải số (vd '2c') ⇒ Number ra NaN ⇒ đường khôi phục gãy
   ⇒ và Owner MẤT bố cục đang dùng. Khoá 'phong-ban-ai.bo-cuc' nằm trong danh sách CẤM ĐỘNG
     của hồ sơ ghế — cấm đổi TÊN KHOÁ; lưu giá trị mới thì được, nhưng phải giữ đọc được số cũ.
② KIỂU HỢP Ở DÒNG 375 LÀ CÁI CỔNG.  `useState<1|2|4|6>` — thêm phương án phải mở kiểu này,
   và trình biên dịch sẽ chỉ ra mọi chỗ còn thiếu. Đó là bạn đồng minh, đừng ép kiểu để né.
③ CSS NẰM Ở HAI TỆP.  `globals.css` @import `mau09.css` ⇒ globals ĐÈ mau09.
   `globals.css:219-221` tự ghi rõ ba chỗ trong mau09 (dòng 240 · 419 · 625) đang bị nới.
   ⇒ Trước khi nói «không có rule cho X», grep CẢ HAI tệp. Đây là bẫy đã cắn thật, có trong hồ sơ ghế.
④ 🔴 CÓ MỘT BẢN SAO THỨ BA ÍT AI NHỚ: `src/app/demo/page.tsx:33-37` giữ RIÊNG một bộ
   `.khu-demo .luoi.bc-1/2/4/6`, kèm cả `@media(max-width:1100px)`.
   ⇒ Thêm bố cục ở app mà quên trang demo thì hai bản trôi mỗi bản một kiểu — đúng bệnh
     «hai bản của một sự thật» đội đã cắn nhiều lần. Trang demo tồn tại để giữ tên lớp khớp app;
     nó lệch thì nó thành cái bẫy thay vì cái thước.
```

## 12.3 CHỖ PHẢI QUYẾT — người làm quyết, KHÔNG phải PM
```
gọi phương án mới là gì, khi giá trị lưu là SỐ và số 2 đã có chủ (trên-dưới)?
   · thêm một số mới (vd 3) — rẻ nhất, nhưng con số KHÔNG nói lên hình dạng
   · đổi cách lưu sang chuỗi + đường đọc ngược cho giá trị số cũ — đắt hơn, đọc dễ hơn
⇒ Chọn gì cũng được, nhưng PHẢI chứng minh: bố cục Owner đang lưu vẫn khôi phục đúng sau khi vá.
```

## 12.4 NGHIỆM THU
```
① mở app, chọn bố cục mới ⇒ hai ô nằm TRÁI-PHẢI (grid-template-columns: 1fr 1fr)
② ĐỐI CHỨNG: bc-2 cũ vẫn TRÊN-DƯỚI, không bị đổi
③ TÍNH TƯƠNG THÍCH NGƯỢC: đặt sẵn giá trị cũ vào localStorage ⇒ nạp lại ⇒ vẫn ra đúng bố cục cũ
   (đây là phép quan trọng nhất — nó bảo vệ thứ Owner đang dùng)
④ trang demo và app dùng CÙNG tên lớp ⇒ so danh sách lớp bc-* ở hai nơi, phải khớp
⑤ điện thoại: ô gõ vẫn ≥16px (dưới 16px là máy tự phóng to, nút Gửi văng khỏi màn)
```

## 12.5 XẾP HÀNG
Việc này **quan trọng ✅ khẩn ❌** ⇒ xếp hàng, không chen. Vị trí: sau `cwd` mắt canh và sau trục ②.
📌 Đây là ứng viên TỐT cho cuộc đua hai thợ: phạm vi rõ, nghiệm thu đo được, không đụng logic.

## 12.6 NÚT «GIAO DIỆN» LÊN THANH TIÊU ĐỀ + GOM VÀO MENU KHI HẸP (Owner giao 11:50 04/09)

**Nguyên văn Owner:** *«nút selector "Giao diện" nên để trên menu trên cùng hàng với title AIBOSS.VN,
và khi không đủ khung hiển thị thì nó gom vào trong menu (icon menu ngay trước title AIBOSS.VN)»*

### 🟢 NỬA ĐẦU **ĐÃ CÓ SẴN** — đo, không đoán
```
UngDung.tsx:2439  <div className="de-khu">                    ← thanh tiêu đề
        2448      <button className="nut-tron nut-danh-ba">   ← ☰ ĐÃ CÓ, ngay TRƯỚC title
        2456      <span className="nhan-khu ten-app">AIBOSS.VN
        2463      <div className="nhom-bo-cuc">               ← margin-left:auto (mau09:221)
        2490        <button className="nut-bc nut-gd">        ← nút «Giao diện» + menu xổ
        2566        <button className="nut-bc" data-bc="1">   ← các nút 1/2/4/6
```
⇒ **Nút «Giao diện» ĐÃ nằm cùng hàng với title.** Và ☰ ĐÃ có, đúng vị trí Owner mô tả.
📌 Nên việc thật KHÔNG phải «dời nút lên» — mà là **nửa sau: gom lại khi hẹp.**

### 🔴 VIỆC THẬT + MỘT VA CHẠM PHẢI QUYẾT
```
hiện nay hẹp thì:  .nhom-bo-cuc{margin-left:auto;flex:none} + white-space:nowrap
                   (mau09:521 tự ghi chú chỗ căng này) ⇒ CO/TRÀN, KHÔNG gom
Owner muốn:        hẹp thì GOM vào menu ☰ trước title
🔴 VA CHẠM: ☰ hiện có NGHĨA là «mở danh bạ» (Owner 18/08). Nhét thêm bố cục vào đó
   ⇒ một nút hai nghĩa. Đó là quyết định về giao diện, KHÔNG phải chuyện kỹ thuật.
   Ba đường thấy được: ☰ gánh cả hai · thêm một ☰ thứ hai · gom vào chính nút «Giao diện»
   ⇒ để người làm đo rồi đề xuất, PM chốt. ĐỪNG tự chọn rồi làm luôn.
```

### ✅ NGHIỆM THU
```
① màn RỘNG: mọi nút bố cục hiện nguyên trên hàng title, KHÔNG đổi so với hiện nay
② màn HẸP (đo ở bề rộng cụ thể, ghi số): nút bố cục GOM vào menu, hàng title KHÔNG tràn, KHÔNG xuống dòng
③ ĐỐI CHỨNG: kéo qua lại ngưỡng ⇒ chuyển hai chiều mượt, không kẹt trạng thái
④ ☰ vẫn mở được danh bạ — chức năng cũ KHÔNG mất (bài học «thêm đường ĐI phải thêm đường VỀ»)
⑤ điện thoại: vùng bấm ≥38×32 như mau09:549 đang đặt, ô gõ vẫn ≥16px
```
⚠️ CSS ở HAI tệp (globals đè mau09) — và mau09:521 + 548 đã có sẵn chú thích về chính khối này.
**Đọc hai chú thích đó TRƯỚC khi sửa**, chúng ghi lý do cách làm hiện tại.

### 12.7 ⚖️ OWNER CHỐT VA CHẠM ☰ — **GỘP HAI NÚT LÀM MỘT** (11:56 04/09/2026)

**Owner:** *«nút ☰ «mở danh bạ» và nút «hiện 2 cột» có thể gộp thành 1, vì đều là mở/đóng danh bạ»*

**Đo lại — Owner đúng, hai nút điều khiển CÙNG MỘT THỨ:**
```
☰  nut-danh-ba (2449)  onClick: datAnKhu(true) ; datAnCotLuu(false)
                       ⇒ HIỆN cột (anCot←false) + ẩn khu chat (màn hẹp)
   nut-cot     (2472)  onClick: datAnCotLuu(!anCot)
                       ⇒ BẬT-TẮT cột
⇒ cả hai đều chạm biến `anCot`. ☰ là «mở» một chiều; nut-cot là công tắc hai chiều.
   Gộp lại = MỘT công tắc trên `anCot`, phần ẩn-khu-chat suy ra theo bề rộng chứ không cần nút riêng.
```

**🔴 HAI RÀNG BUỘC — và cái thứ nhất do CHÍNH MÃ CŨ cảnh báo:**
```
① chú thích tại 2468-2470 ghi: «Ẩn cột = MẤT LỐI VÀO danh bạ ⇒ luật bật nút ☰ phải áp cho CẢ
   trạng thái này. Ẩn thứ gì thì chừa ĐƯỜNG QUAY LẠI trong CÙNG lượt sửa.»
   ⇒ ☰ đang là ĐƯỜNG VỀ của trạng thái mà nut-cot tạo ra.
   🔑 Gộp hai nút mà một trong hai là lối thoát của cái kia ⇒ dễ gộp mất luôn lối thoát.
   **Nút gộp phải bấm được ở CẢ HAI trạng thái, kể cả khi cột đang ẩn và khu chat đang phủ kín.**
② ☰ còn làm thêm `datAnKhu(true)` (ẩn khu chat) — chỉ có nghĩa ở màn HẸP.
   Nút gộp phải quyết: việc đó suy theo bề rộng, hay vẫn là một phần của cú bấm?
```

**Nghiệm thu bổ sung cho 12.6:**
```
⑥ màn RỘNG: bấm nút gộp ⇒ ẩn/hiện hai cột · bấm lại ⇒ về đúng trạng thái cũ
⑦ màn HẸP:  bấm ⇒ mở danh bạ · và PHẢI có đường quay lại khu chat
⑧ 🔴 PHÉP QUAN TRỌNG NHẤT: đưa app về trạng thái «cột đang ẩn» rồi hỏi
   — nút gộp có còn NHÌN THẤY và BẤM ĐƯỢC không? Nếu không thì ta vừa gộp mất lối thoát.
```

## 12.75 📏 ĐÍNH CHÍNH BA SỐ SAI TRONG HỒ SƠ VĨNH VIỄN (người soi bắt, 04/09 17:3x)

> Commit `9bd9812` đã đẩy ⇒ **KHÔNG sửa commit.** Đính chính ở đây là hồ sơ đúng.

```
① tiêu đề commit «3212 -> 2898» + «bóc 314 dòng»
   THẬT: wc -l = 2897 · awk END{NR} = 2897 · byte cuối = 0a  ⇒  3212 − 2897 = 315
   🔑 người làm TỰ ghi 2897 trong lời khai, nhưng DÒNG TIÊU ĐỀ — phần được đọc nhiều nhất và
      KHÔNG sửa được — mang 2898/314. Số tính ra đứng ở chỗ bền nhất, số đo được nằm ở chỗ dễ quên.
② `hang-so.ts:12` «MÙ 4 lời gọi bí danh»
   THẬT: 3 (UngDung.tsx:233 · 1549 · 1573)
   ⚠️ CÙNG MỘT CÂU còn ghi «70 → 67», tức lệch 3. **Chữ và số trong một câu đá nhau** —
      và không ai thấy vì mắt đọc chữ, còn cổng thì đọc số.
③ «khoá DUY NHẤT đổi giá trị là `nguon`»
   ĐÚNG với `thu-tu-moc.json` · SAI với `hinh-dang-than.json` (`soTep` 1 → 3 cũng đổi)
   📌 câu đúng với MỘT bản chụp được phát biểu như đúng với CẢ HAI.
+ `soMoc` chỉ so với `NAY.day.UngDung.length` (test dòng 86), KHÔNG phải tổng — tổng là 72.
```

## 12.9 🧾 BẢNG «YÊU CẦU → PHÉP KIỂM» CHO VIỆC ④ — đo 05/09 13:21, và đây là thứ tôi ĐÁNG LẼ phải làm từ vòng 1

```
YÊU CẦU CỦA OWNER              PHÉP KIỂM (chạy được, dán thẳng)                          ĐO 13:21
─────────────────────────────────────────────────────────────────────────────────────────────────
① bỏ `.thanh-de`               grep -c 'className="thanh-de"' UngDung.tsx        = 0     ✅ 0
   ...và MỘT HÀNG DUY NHẤT     grep -o 'flex-wrap:[a-z]*' mau09.css              = nowrap ❌ wrap
② bố cục 2 ô TRÁI-PHẢI         grep -o '\.luoi\.bc-2{[^}]*}' mau09.css
                                 phải có grid-template-COLUMNS: 1fr 1fr                   ❌ rows:1fr 1fr
                               grep -o 'title="2 ô[^"]*"' UngDung.tsx                     ❌ «chia trên / dưới»
③ gộp ☰ với «hiện 2 cột»       grep -c 'nut-danh-ba nut-cot' UngDung.tsx         ≥ 1     ✅ 1
④ «Vào phòng ban» ở cột 1      grep -c 'Vào phòng ban' UngDung.tsx               ≥ 1     ✅ 1
   nút «Giao diện» đã xoá      grep -c 'nut-gd' + 'menu-gd' UngDung.tsx          = 0/0   ✅ 0/0
⑤ tính CẢ `--cao-bang`         grep -o '\-\-cao-de:[^;]*' mau09.css             = 0px   ✅ 0px
                               grep -c 'cao-bang' globals.css                    ≥ 1     ✅ 9 chỗ
ĐỐI CHỨNG DƯƠNG (thước có sống): grep -c 'grid-template' mau09.css                       ✅ 18
```

## 📊 ĐỌC RA: **3/5 XONG và chứng minh được · 1 chưa xây · 1 làm nửa**
```
XONG chắc  ③ nút gộp · ④ «Vào phòng ban» + xoá nút Giao diện · ⑤ --cao-bang
CHƯA XÂY   ② bố cục 2 ô trái-phải           ← Owner đặt 04/09, chưa ai chạm
LÀM NỬA    ① thanh trên đã bỏ, nhưng `.de-khu{flex-wrap:wrap}` nên chưa BẢO ĐẢM một hàng
```

🕳 **VÌ SAO BẢNG NÀY QUAN TRỌNG HƠN CẢ NỘI DUNG NÓ:** ba vòng soi đều đi từ **danh sách chỗ bị bác**
của vòng trước. Không vòng nào đi từ **danh sách yêu cầu**. Nên yêu cầu ② — thứ chưa ai chạm nên
chưa ai bác — **nằm ngoài tầm nhìn suốt cả ba vòng**, kể cả lượt tôi tự mở trình duyệt đo.
🔑 **Kiểm rằng lỗi đã vá KHÁC với kiểm rằng việc đã làm.** Cái thứ nhất đi từ danh sách BÁO CÁO;
cái thứ hai đi từ danh sách ĐẶT HÀNG. Chỉ cái thứ hai bắt được thứ VẮNG MẶT.
📌 Một thứ chưa xây thì **không sinh ra lỗi nào** — nên mọi quy trình săn-lỗi đều mù với nó.

## ✅ NẾP MỚI, ÁP TỪ ĐÂY — PM làm, trước MỌI lần giao soi
```
① viết bảng «yêu cầu → phép kiểm» NGAY LÚC GIAO VIỆC, không phải lúc nghiệm thu
② mỗi dòng phải có một lệnh CHẠY ĐƯỢC và một giá trị MONG ĐỢI — không viết «xong chưa»
③ PM tự chạy bảng đó TRƯỚC khi gọi người soi ⇒ người soi khỏi tốn lượt vào thứ còn thiếu hẳn
④ kèm ĐỐI CHỨNG DƯƠNG: một phép tìm thứ CHẮC CHẮN CÓ, để biết thước còn sống
```

## 12.8 BA QUYẾT ĐỊNH CỦA OWNER CHIỀU 04/09 — nhập vào việc ④, ĐỪNG tách

> 📅 Nhập 2026-09-04T15:41:37Z · 16:41 London bởi `claude-aiboss-app-pm`. Owner nói thẳng trong ô chat, KHÔNG qua round —
> vì đây là tinh chỉnh của round-8 ĐÃ QUYẾT, không phải câu hỏi mới.

### ① HƯỚNG A — một hàng duy nhất (round-8, Owner quyết 16:07)
```
bỏ `.thanh-de` · dồn mọi công cụ vào `.de-khu`
🔴 nút gộp `.nut-danh-ba.nut-cot` PHẢI CÒN NHÌN THẤY ở trạng thái hai cột ĐANG ẨN
   (Owner dặn riêng — đây là «thêm đường ĐI thì phải thêm đường VỀ», tiêu chí nghiệm thu CỨNG)
```
🔴 **VÀ MỘT BIẾN NỮA MÀ CẢ TÔI LẪN TRANG round-8 ĐỀU BỎ SÓT:** bỏ `.thanh-de` thì phải tính **cả
`--cao-bang`**, không chỉ `--cao-de`. `globals.css:347-349` ĐÈ `mau09.css:54` ở màn ≥1041px:
`calc(100vh - var(--cao-de) - var(--cao-bang))`. Hôm nay `--cao-bang` = `0px` nên hai công thức ra
cùng một số — **đó là lý do không ai thấy.** → sổ bẫy đo mục 82.

### ② «VÀO PHÒNG BAN» — CHUYỂN 5 bộ ghế từ menu «Giao diện» sang CỘT 1, ngay dưới «Toàn bộ nhân sự»
```
CHUYỂN, KHÔNG nhân đôi (Owner nói rõ: «là chuyển từ menu Giao diện qua menu cột 1»)
5 bộ đang có: BO_MARKETING(137) · BO_VAN_HANH(156) · BO_QUAN_LY_TRUONG(213)
              · BO_QUAN_LY_CU(222) · BO_CONG_NGHE(247)   — hang-so.ts
Owner ghi «… (tương lai)» ⇒ SẼ CÒN THÊM. Thiết kế phải chịu được việc thêm.
```
🔴 **BẮT BUỘC: MỘT SỔ ĐĂNG KÝ DUY NHẤT.** Mảng `{mã, tên, ghế[], icon}`; cột danh bạ vẽ ra từ đó,
và `LA_BO_DUNG_SAN` cũng đọc từ đó.
🕳 Vì sao đây là ràng buộc chứ không phải gợi ý — mã đã có sẵn lời cảnh báo, nguyên văn `hang-so.ts`:
> *«THÊM BỘ MỚI thì PHẢI thêm vào đây. Quên = lỗi 20/08 quay lại: Owner bấm hai bộ liên tiếp là đội
> THẬT của mình bị ghi đè, không có đường về.»*

Tức **thêm một bộ HIỆN ĐÃ phải sửa hai chỗ**. Chép danh sách sang cột nữa là **ba chỗ**, và người
thêm bộ thứ sáu sẽ quên một trong ba. 🔑 **Hỏng kiểu này KHÔNG KÊU** — menu vẫn hiện, nút vẫn chạy,
chỉ đội thật của Owner bị ghi đè lặng lẽ. Gom về một sổ là **dọn luôn cái bẫy đang có**, không phải
việc phụ.

### ③ 🔴 OWNER CHỐT THÊM: **BỎ HẲN nút «Giao diện»**, chuyển HẾT sang «Vào Phòng Ban»

> Owner nói nguyên văn: *«"Giao diện" bỏ nhé, ở "Giao diện" có gì chuyển hết về "Vào Phòng Ban" hết
> nhé. kể cả "Ghế hiện tại (bộ đã lưu)"»*

⇒ Câu Owner hỏi trước đó («nút Đổi giao diện nằm trong menu hai cột được không») nay **VÔ HIỆU** —
không còn nút nào để gom. Ai đọc lịch sử hội thoại thì đừng dựng nút tách đôi cho một nút đã bị xoá.

**Dọn SẠCH, đừng để lại mảnh — neo đo được:**
```
XOÁ  UngDung.tsx:68     const [moMenuGD, datMoMenuGD] = useState(false)
XOÁ  UngDung.tsx:970    datMoMenuGD(false)
XOÁ  UngDung.tsx:2164-2171  nút .nut-bc.nut-gd + khối {moMenuGD && (...)}
XOÁ  globals.css:273    .nut-gd { }        ← 🔴 CSS ở globals.css, KHÔNG ở mau09.css
XOÁ  globals.css:277    .menu-gd { min-width: 226px }
```
🔴 **`nhacGD` (UngDung.tsx:90 và :2238) KHÔNG ĐƯỢC XOÁ** — nó là câu báo sau khi nạp một bộ ghế,
tức phản hồi cho người bấm. Chuyển nó theo, hiện gần chỗ bấm mới. **Xoá nó là bấm xong không biết
đã ăn hay chưa.**
⚠️ Và nhớ bài học mục 82: CSS nằm ở HAI tệp, `globals.css` ĐÈ `mau09.css`. Grep CẢ HAI kể cả khi
tệp đầu đã cho câu trả lời.

**Bố cục 1/2/4/6 (+2 trái-phải) GIỮ NGUYÊN chỗ cũ** — chúng là `nut-bc` riêng, không thuộc menu
«Giao diện». Owner đã ra luật cho chúng từ 11:50 04/09: phẳng trên thanh khi đủ chỗ, **gom vào menu
☰ khi khung hẹp**. Không cần hỏi lại.

### ③b ĐƯỜNG VỀ CỦA BỘ GHẾ — tôi quyết Mức 2, và Owner XÁC NHẬN, còn đi xa hơn
```
sau khi chuyển 5 bộ đi, menu «Giao diện» còn ĐÚNG MỘT mục: «Ghế hiện tại (bộ đã lưu)»
  (UngDung.tsx:2173-2184 · đọc localStorage `phong-ban-ai.bo-ghe-cu` · napBoGhe(boGheCu, false))
⇒ QUYẾT: mục đó đi THEO, làm mục ĐẦU TIÊN của «Vào phòng ban», nằm TRÊN danh sách phòng ban
```
🔑 Lý do: nó là **đường về của đúng cái việc liệt kê ngay bên dưới nó**. Đặt lối thoát cạnh cái cửa.
Để nó ở lại một menu sắp rỗng thì Owner bấm nhầm bộ xong phải đi tìm đường về ở chỗ khác — mà đó
chính là phút Owner đang hoảng.
⚠️ Cách lật lại: đưa mục ấy về `menu-gd` như cũ, một chỗ, không ràng buộc gì khác.

### 🔴 CÁI GIÁ OWNER ĐÃ CHỌN, GHI RA ĐỂ KHÔNG AI «SỬA GIÚP» SAU NÀY
```
cột danh bạ ẨN ĐƯỢC ⇒ ẩn cột thì KHÔNG đổi phòng ban được, phải mở cột ra trước
Owner được hỏi thẳng (🅐 để cả hai nơi / 🅑 chỉ trong cột) và CHỌN 🅑.
```
📌 Đây là **đánh đổi có chủ ý**, không phải sót. Ai thấy rồi định thêm lại lối tắt trên thanh cho
tiện thì DỪNG và hỏi Owner.

---

## 📖 TRƯỚC KHI ĐỤNG CỜ NỐI PHIÊN — đọc `~/ai-agent/claude-cli/CLAUDE.md`
Bảng sáu dạng cờ CLI **thật sự** nhận / từ chối, tên phiên nằm ở đâu, `.jsonl` khai gì và KHÔNG
khai gì. 🔴 Mục nợ ngay dưới đây sinh ra vì bộ khớp của ta HẸP HƠN CLI. Đừng đoán lại lần nữa.

## 🕳 NỢ KỸ THUẬT CÓ ĐO — hai ca khớp lệnh SAI, Owner CHỌN KHÔNG VÁ (ghi 09/09/2026)

**Đây KHÔNG phải việc quên. Owner tick Ⓒ ở round-21 («không đụng logic») nên hai chỗ này ở nguyên.**
Ghi ra để người sau khỏi tưởng chưa ai biết — và để khi nào Owner đổi ý thì có sẵn số đo.

```
đo bởi hermes-aiboss-app-reviewer, chạy Claude Code 2.1.263 THẬT (HOME/config/cwd tạm, bare mode):
  -r<mã>        CLI nhận  ·  ta nhận   ✅ đã vá ở vòng 4
  --resume=<mã> CLI nhận  ·  ta nhận   ✅
  --resume<mã>  CLI TỪ CHỐI «unknown option»  ·  ta không nhận  ✅ đúng
🔴 -pr<mã>      CLI NHẬN  ·  ta KHÔNG nhận   ⇒ NGƯỜI GIỮ THẬT LỌT LƯỚI
🔴 -pr <mã>     CLI NHẬN  ·  ta KHÔNG nhận   ⇒ cùng thế
🟡 -r=<mã>      CLI TỪ CHỐI ·  ta NHẬN       ⇒ CHẶN OAN
```
🔑 **Vì sao ca `-pr` đáng lo:** cổng này sinh ra để chặn hai tiến trình cùng ghi một bản ghi phiên.
Bộ khớp của ta KHÔNG nhận `-pr` ⇒ **ở khâu KHỚP CHUỖI, một tiến trình dùng `-pr` không được nhận ra.**

🔴 **SỬA 09/09/2026 16:1x — bảng này TỪNG RỘNG HƠN NGUỒN, tôi (`claude-aiboss-app-pm`) viết rộng.**
Bản cũ ghi «người giữ thật lọt lưới ⇒ **đúng con bug Owner gặp sáng 07/09**». `hermes-web-noibo` đo
lại và chỉ ra chỗ hụt; tôi nhận:
```
đã đo   CLI 2.1.263 phân tích cú pháp thế nào (nhật ký reviewer, phiên 20260908_063343_05a132,
        tin 3749): `-pr` + UUID bịa ⇒ «No conversation found» · `-r=` coi giá trị là «=<mã>» rồi từ chối
        ⇒ chứng minh CÁCH ĐỌC CỜ, KHÔNG chứng minh đã có người giữ thật lọt qua
đã đo   chạy cô lập hai hàm hiện tại với ps/mtime/đồng hồ giả:
        `-pr` hụt + tệp tươi + mốc ta NULL      ⇒ VẪN CHẶN
        `-pr` hụt + mốc ta KHÁC NULL            ⇒ MỞ ở cổng này
        và chỗ gọi `:94` còn dẫn tới các cổng KHÁC phía sau
CHƯA đo NHÂN QUẢ với ca Owner gặp 07/09 · TẦN SUẤT gặp lại · và liệu các cổng phía sau có đỡ không
```
🔑 **Một dòng «⇒ đúng con bug hôm ấy» nghe như kết luận của một phép đo, nhưng nó là một phép NỐI
hai việc chưa ai nối.** Nó đã nằm trên trang round-22 gửi Owner cho tới khi bị bắt.
⚠️ Ai cần dùng bảng này để quyết: đọc đúng phần **«đã đo»**, đừng đọc phần suy ra.
🟡 Ca `-r=<mã>` chỉ phiền (chặn oan), chẳng nguy.

📌 **Ai phát hiện:** `claude-phong-ban-pm` (research) tách ra từ verdict vòng 4/4, sau khi
`claude-aiboss-app-pm` đã gộp sai cả bốn lý do bác thành «đều là lời khai, không phải logic».
**Hai trong bốn là LOGIC.** Câu gộp sai đó nằm trên trang round-21 lúc Owner tick.
⚠️ Muốn vá thì phải hỏi Owner — vá là đụng logic, mà Ⓒ cấm.

---

## 🔴 BỘ THƯỚC `ai/de-soi/2026-09-09_r21-vong3.mjs` ĐANG Ở TRẠNG THÁI **BỊ BÁC MÀ VẪN NẰM TRONG KHO** (ghi 09/09/2026 17:0x)

**Đừng đọc tệp này như một thứ đã được duyệt. Nó KHÔNG.**

```
băm hiện tại  cb30999ef73dbdaf8c27b049bfb96255      ← CẬP NHẬT 09/09 18:0x, sau VÒNG NĂM
băm vòng bốn  9dc5dad6caf988f3b1feb408ef908c4f      (bản lưu: ~/Operations/sao-luu-viec-do/r21-vong3.mjs.truoc-vong5-20260909-1745.mjs)
băm nền gốc   78aeaacdd8402f086d92ac8da623eb99
verdict       KHÔNG ĐẠT — VÒNG NĂM, vòng cuối của cả việc. DỪNG HẲN, KHÔNG xin vòng sáu.
```
🔴 **Owner đã cấp vòng năm lúc 17:37 ngày 09/09. Vòng năm cũng bị bác. Việc DỪNG HẲN.**
Luật ba vòng đã được nới **hai lần** cho riêng việc này; PM sẽ KHÔNG đi xin lần thứ ba.

**Vòng năm SỬA ĐƯỢC gì — người soi xác nhận, đừng bỏ vế này:**
```
· hai phản ví dụ giết vòng bốn nay CHẶN ĐÚNG. Nó dựng lại đúng hai thao tác cũ:
  nền có 2 dòng mã · nền đã gỡ maNhanSu ⇒ Ⓑ7 và Ⓑ8 đều «KHÔNG kết luận được»
  đối chứng bản vòng bốn: Ⓑ8 trả TRUE trên cả hai nền hỏng
· nó ghi dấu LỜI GỌI chamKhoi ⇒ xác nhận đỏ VÌ TIỀN ĐỀ CHƯA ĐẠT, chẳng phải nhận công nhầm
· ca MỚI Ⓑ9 canh chính phép kiểm nền, và cắt phụ thuộc ĐÚNG (fixture độc lập)
· ba chỗ chuỗi báo lỗi được xác nhận sửa đúng
```
**Vòng năm CÒN THIẾU gì:**
```
· Ⓑ9 chỉ phủ MỘT trong HAI phản ví dụ đã biết. Phá guard thành «hơn một dòng mã VÀ nền chưa đạt»
  ⇒ Ⓑ9 vẫn TRUE, mà Ⓑ8 lại xanh sai trên nền đã gỡ maNhanSu.
  🔑 Người soi nói rõ cách vá RẺ: KHÔNG cần Ⓑ10 canh Ⓑ9 — chỉ cần cho CHÍNH Ⓑ9 kiểm thêm
     một nền độc lập 0 DÒNG MÃ bên cạnh nền 2 dòng mã. **Dây chuyền dừng được, miễn tầng đang có
     phủ hết phản ví dụ ĐÃ BIẾT.**
· quét toàn tệp còn hai chỗ khai nguyên nhân vượt số đo: `:403` («0 khối thay đổi ⇒ đụng nhiều hơn
  MỘT chỗ» — số đo bằng 0 mà kết luận nói hơn 1) và `:618` (thiếu log ⇒ suy thành «chưa chốt vét»)
```
🕳 **GIỚI HẠN NỀN TẢNG của bộ thước, đáng nhớ hơn cả chỗ bị bác:**
```
`dongCoMa` (:238-247) chỉ đếm dòng chứa ĐIỂM BẮT ĐẦU token, KHÔNG đếm mọi dòng token TRẢI QUA.
đối chứng: thuộc tính có template literal ba dòng ⇒ trả [0,2], BỎ DÒNG GIỮA
⇒ câu «khối có N dòng MÃ» ĐÚNG với các mẫu đã thử, KHÔNG đúng tổng quát.
```
⚠️ Người soi cũng khai rõ **phạm vi của chính nó**: nó chỉ chạy các phép chấm **cô lập trong RAM**,
KHÔNG gọi main của suite ⇒ **các tổng 23/0 · 19/4 · 14/9 là số PM/exe báo, KHÔNG phải số nó tự chạy.**

🔑 **Hai câu đều đúng, phải đọc CẢ HAI — bỏ vế nào cũng thành nói dối:**
```
① nó TỐT HƠN nền cũ: lỗ «thêm một dòng chú thích» ĐÃ ĐÓNG.
   Người soi tự chèn «// REVIEW independent extra comment» ngay trước dòng `maNhanSu,`:
     thước CŨ  19 ĐẠT · 0 TRƯỢT · thoát 0     ← lỗ
     thước MỚI 21 ĐẠT · 1 TRƯỢT · thoát 1     ← Ⓑ6 bắt, một mình
   19 ca cũ KHÔNG hỏng ca nào (so danh sách ID, có đối chứng bỏ một ID ⇒ phát hiện thiếu đúng một).
② nó CHƯA ĐỦ CHUẨN: ca tự kiểm Ⓑ8 còn XANH-VÌ-LÝ-DO-SAI.
   Ⓑ8 sinh bốn bản phá từ khối hiện tại nhưng KHÔNG kiểm nền của chính nó có được chấp nhận.
   · đầu vào đã có 2 dòng mã ⇒ nền bị từ chối SẴN ⇒ bốn bản phá bị từ chối VÌ LÝ DO CÓ SẴN ⇒ Ⓑ8 ĐẠT
     (gỡ luôn vế băm ⇒ Ⓑ8 VẪN ĐẠT ⇒ lúc ấy ca này KHÔNG đo gì)
   · bản phá tên «thêm một dòng MÃ» chèn trước dòng ĐÓNG chú thích ⇒ nằm TRONG chú thích
     ⇒ thực tế thêm 0 dòng mã ⇒ Ⓑ8 vẫn ĐẠT
   Và Ⓑ7 «đỏ vì tiền đề hỏng» KHÔNG được đếm là một lớp bắt.
```
📌 Chi tiết đầy đủ: `~/Operations/SO-BAY-DO.md` mục 139.

⚠️ **VÌ SAO KHÔNG LÙI VỀ NỀN CŨ:** lùi là mất luôn phần ① — cái lỗ thật sẽ mở lại. Giữ là mang một
bộ thước bị bác trong kho. **Cả hai đường đều có giá**, nên tôi KHÔNG tự chọn: việc này đã DỪNG HẲN
theo luật đếm vòng, và **chỉ Owner mở lại được**.
🔴 Ai đọc mục này rồi định «sửa nốt cho xong» thì DỪNG. Vòng bốn là vòng cuối Owner cấp.

📊 **Ba việc round-22, cả ba bị bác ít nhất một vòng, và KHÔNG việc nào bị bác vì MÃ SAI:**
```
Câu 1  vòng 4/4  bác vì BỘ THƯỚC còn xanh-vì-lý-do-sai       ⇒ DỪNG HẲN
Câu 2  vòng 1/3  bác vì LỜI KHAI rộng + một rủi ro chưa khai (ca `-r=U` có thể mất một lần chặn đúng)
Câu 3  vòng 1/3  bác vì SỬA CHƯA NHẤT QUÁN (câu :378 chọi câu :384 trong cùng khối)
```
🔑 Đây là **hình của cả ngày 09/09**: mã hầu như luôn đúng; thứ hỏng là **cách ta nói về mã**
và **cách ta đo mã**. Ai lập kế hoạch cho ngày sau nên phân bổ công theo tỉ lệ đó.

---

## 🕳 NỢ CHÚ THÍCH — 36 NHÓM MỆNH ĐỀ SAI Ở LẠI TRONG MÃ (Owner chốt ĐÓNG HẲN 09/09/2026 18:11)

**Đây KHÔNG phải việc quên. Owner tick 🅑 ở round-24 Câu 2: «Đóng hẳn — bỏ ứng viên, cây chính giữ
chú thích cũ, ghi nợ.»** Ghi ra để người sau khỏi tưởng chưa ai biết.

```
cây chính GIỮ NGUYÊN:  src/lib/so-so-huu.ts  6d81f3e2f4943b66de7b77971f067494
                       src/lib/chay-agent.ts c0191f8936944c49df275db53a98da63
ứng viên BỎ:           84f84e53… + 841339a5…  (worktree wt-r22-cau3-hermes)
```

🔴 **THỨ CÒN SAI TRONG MÃ — đo được, KHÔNG phải phỏng đoán:**
Bản quét vòng 3 (được người soi xác nhận là **quét thật**, nó tự lấy vùng chú thích bằng TypeScript
rồi đối chiếu) chia 60 vùng chú thích thành **93 nhóm mệnh đề**:
```
36 nhóm ĐÚNG hiện tại
36 nhóm SAI hoặc VƯỢT BẰNG CHỨNG   ← Ở LẠI TRONG MÃ, chưa sửa
21 nhóm LỊCH SỬ (đúng trong quá khứ, cần rào)
```
**Hai chỗ nặng nhất, có số dòng:**
```
so-so-huu.ts:56-57   «LOGIC CHỌN/NỐI PHIÊN: KHÔNG đổi — trong phạm vi tôi kiểm được, chẳng nhánh
                      nào rẽ theo sổ»  ⇒ SAI: api/phien/route.ts:116-129 ĐỌC sổ,
                      UngDung.tsx:1127 đòi `co_so_huu === true`
chay-agent.ts:120-121 «đường Owner GÕ TRONG Ô (api/chat/route.ts) hiện CHƯA truyền nó xuống»
                      ⇒ SAI: chat/route.ts:318 CÓ `maNhanSu,`
```
⚠️ **Người đọc mã sẽ TIN hai câu ấy.** Đó là cái giá Owner đã cân và chấp nhận.

## 🔑 VÌ SAO VIỆC NÀY DỪNG — ba vòng, ba lần cùng một họ lỗi
```
vòng 1  sửa câu được chỉ            → sót :378, cách đó SÁU DÒNG
vòng 2  sửa :378 + :12-16           → sót :56-57 và :120-121
vòng 3  QUÉT THẬT, tìm ra 36 nhóm   → nhưng câu THAY THẾ lại quá rộng theo CHIỀU NGƯỢC:
        cũ «lượt nào cũng ĐƯỢC GHI» (quá mạnh chiều thành công) — bỏ, đúng
        mới «CHỈ ghi thành công mới có mục» (quá mạnh chiều thất bại) — điểm chặn
        phản ví dụ: ghi RỒI mới ném lỗi ⇒ hàm trả FALSE nhưng trên đĩa CÓ dòng hoàn chỉnh
```
📖 Chi tiết: `~/Operations/SO-BAY-DO.md` mục **142**.

✅ **THỨ KHÔNG MẤT, nếu sau này Owner mở lại:** bảng ba rổ 93 nhóm là **hiện vật đã được người soi
xác nhận**. Người làm sau khỏi quét lại từ đầu — chỉ cần sửa cách VIẾT câu thay thế.
📌 Báo cáo và bảng nằm ở `wt-r22-cau3-hermes/ai/coder-reports/hermes-build-app/`.
⚠️ Nếu worktree bị dọn thì bảng ấy mất theo. **Ai dọn worktree nhớ chép bảng về kho trước.**

## 🔒 [2026-09-10T18:24:48Z · 19:24 BST] QUYẾT ĐỊNH round-26 Câu 1 — KHOÁ mã phiên với TÊN GHẾ

**Owner tick 🅐 trong ô chat, 10/09/2026 lúc 19:1x BST.** Nguyên văn:

> «làm thủ công chứ cần gì tự động 100%, tự động khoá session id với ghế 50% là tốt lắm rồi
> kiểu đề xuất trước ấy. Tôi chọn "🅐 tay anh THẮNG — gán rồi thì máy không được ghi đè"»

    ① Owner gán tay ⇒ máy KHÔNG được đè. Chữ «khoá» hiểu đúng nghĩa đen.
    ② Tự động chỉ cần 50%, «kiểu ĐỀ XUẤT» — máy gợi, Owner gật thì mới dính.
    ③ Owner đã cân và NHẬN cái giá của 🅐 (gán nhầm thì tự sửa). Đừng thêm cơ chế tự chữa.

**Đây là việc tôi đã xếp SAI suốt mấy ngày.** Round-21 Owner dặn «session id nào là của ghế nào
và dính chặt với ghế tên đó»; tôi ghi vào sổ là «chờ sổ sở hữu — đang kẹt» rồi để đó.
Đo lại 10/09: sổ **KHÔNG kẹt** — nó chạy, được đọc (`api/phien/route.ts:116/:129`), và giao diện
đã dùng (`UngDung.tsx:1127`). Thứ thiếu chỉ là **đường GHI do Owner điều khiển**.
📌 Một việc **làm được** nằm trong ô **chờ** thì không ai đi kiểm lại, vì ô chờ trông rất hợp lệ.

**Trạng thái lúc ghi mục này:**

    trang round-26      LIVE. bốn chốt ĐẠT lúc 19:23 — RENDER-OK · 200/26.399 · 401 · bịa 404
    đóng dấu Câu 1      đã giao hermes-web-noibo lúc 19:24
    việc dựng mã        đã giao hermes-build-app lúc 19:22, VÒNG 1
                        đề: ai/viec-r26-cau1-khoa-ghe.md
    người soi           claude-aiboss-app-pm (Claude) — đo trước khi giao:
                        hermes-build-app = gpt-6-astra ⇒ KHÁC mô hình ⇒ hợp luật 10/09
    Câu 2 (phép thử CLI / bộ khớp -pr)   VẪN MỞ, Owner chưa tick

🔴 **CHƯA CẤP PHÉP, ghi trước để khỏi trôi:** quyết định này KHÔNG tự cấp phép `next build`,
KHÔNG tự cấp phép khởi động lại app 4319. App vẫn phục vụ `BUILD_ID ZCQFokMZg68vtNxCq86CS`
(bản 06/09). Muốn thứ này tới tay Owner phải qua đủ: verdict ĐẠT ⇒ `claude-aiboss-app-exe` dựng
⇒ Owner xác nhận khởi động lại HAI LẦN LIÊN TIẾP.

🔴 **CHƯA ĐO, tôi tự khai:** «so-so-huu.ts xuất đúng hai hàm» · «ghiSoHuu gọi từ đúng một chỗ»
· «không có đường ghi tay» — cả ba đo bằng `grep`. grep đếm CHỮ, không đếm CẤU TRÚC.
Đường gọi gián tiếp thì tôi bỏ sót. Đề bài đã bắt người làm đo lại bằng thước của nó.

## 🏗 [2026-09-10T20:17:59Z · 21:17 BST] MỘT LẦN DỰNG SẼ KÉO THEO GÌ — đo trước khi xin phép Owner

Round-26 Câu 1 đã có verdict ĐẠT (`ai/coder-reports/verdict-r26-cau1-claude-pm.md`
md5 `f28026b637ee5b403e0187082d5c1f2e`). Trước khi xin Owner một lượt dựng, tôi đo xem
lượt ấy mang theo NHỮNG GÌ. Câu trả lời làm đổi hẳn hình dạng câu hỏi.

    git diff --numstat -- src/   ⇒  438 dòng thêm · 42 dòng bớt · trên 9 tệp
    cộng thêm src/lib/so-so-huu.ts — tệp MỚI, chưa từng vào git

    chat/route.ts        36+  3-   sửa lần cuối 09/09 17:44
    fork/route.ts        33+  0-              07/09 14:00
    api/phien/route.ts   17+ 16-              10/09 19:36   ← việc round-26, ĐÃ có verdict
    UngDung.tsx         105+  6-              08/09 12:19
    ung-dung/kieu.ts     14+  2-              08/09 04:43
    nap-bo-ghe.ts        15+  1-              07/09 08:50
    chay-agent.ts        46+  0-              07/09 16:33
    chay-mot-luot.ts      5+  0-              07/09 15:59
    doc-phien.ts        167+ 14-              09/09 15:41

🔴 **Chỉ 2 trong 10 tệp có verdict còn hiệu lực** (`so-so-huu.ts` + `api/phien/route.ts`).
Tám tệp còn lại là việc của 07 · 08 · 09/09 chưa từng qua cổng dựng.
⇒ **Một lượt dựng KHÔNG phải «đưa cái khoá lên app». Nó là «đưa BỐN NGÀY việc tồn lên app
   cùng một lúc».** Đây mới là câu Owner phải quyết, chứ không phải câu «dựng hay chưa dựng».

⚠️ **VÀ TÔI SUÝT BÁO SỐ SAI:** phép đếm thô của tôi (`grep -v '^\+\s*(//|\*)'`) khai
`chat/route.ts` có **34 dòng MÃ thêm**. Mở diff ra đọc thì phần lớn là **một chuỗi thông báo
lỗi nhiều dòng** — bộ đếm coi mỗi dòng chuỗi là một dòng mã. Thay đổi CHỨC NĂNG thật ở tệp ấy
là **ĐÚNG MỘT DÒNG `maNhanSu,`** (round-21 Câu 1, Owner duyệt 🅒 lúc 23:04 · 08/09) cộng một
lời báo lỗi được viết lại.
🔑 **Bộ đếm dòng KHÔNG phân biệt được «mã» với «chuỗi ký tự nằm trong mã».** Số nó đưa ra vẫn
là một con số có thật — chỉ là nó trả lời một câu hỏi khác câu tôi đang hỏi.
📌 Cùng họ với mục 144 ghi chiều nay: **đếm được không có nghĩa là đếm đúng thứ mình cần.**
`doc-phien.ts` cũng vậy: 167 dòng thêm, nhưng 155 là chú thích, chỉ 11 dòng là mã.

## 🚢 [2026-09-10T21:29:51Z · 22:29 BST] ĐÃ LÊN APP — dòng đầu tiên kể từ 06/09

    Owner duyệt hai lần liên tiếp: «cứ build đi» ⇒ «khởi động lại đi»
    exe dựng 21:44  «Compiled successfully in 2.7s» · 0 lỗi kiểu · 1 cảnh báo
    hẹn 21:48:03 · nổ 21:53:45 · pid 4873 → 76943
    PM đo độc lập: app khai 4SIlEUuF-kNoSCc60etSN · bản cũ 0 lần · chuỗi bịa 0 lần
                   trang chủ 200 · 8/8 tệp static tải được · đường bịa 404
                   /api/phien 200 · co_so_huu có ở mọi phiên · ghế bịa 404

## 🔑 CÁI KHOÁ MUA ĐƯỢC GÌ — đo tại chỗ dùng, KHÔNG suy từ tên tính năng

Owner hỏi thẳng «khoá thì được gì? không khoá thì mất gì». Trả lời nằm ở ĐÚNG MỘT DÒNG,
`UngDung.tsx:1127`, và nó vừa đổi tối nay:

    HEAD  (bản chạy tới 21:53)   ds.find(p => !p.dang_chay)
    nay   (bản đang chạy)        ds.find(p => !p.dang_chay && p.co_so_huu === true)

    CÓ khoá     bấm ghế ⇒ tự nối đúng phiên đã chốt + nạp lịch sử
    KHÔNG khoá  ô mở ra TRỐNG (rơi xuống ghiO(i, ten, null, true)), phải chọn phiên bằng tay

🔴 **Tách hai thứ mà ai cũng gộp:**
```
cái KHOÁ                        mua TIỆN   — khỏi đi tìm mã phiên
điều kiện && co_so_huu === true mua AN TOÀN — bỏ hẳn đường bốc «phiên gần nhất bất kể của ai»
```
Đường bốc bừa ấy CHÍNH LÀ con bug nối Owner vào bản ghi của ghế khác. Nó đã chết từ 21:53,
**dù sổ còn rỗng**. Nên «chưa khoá» KHÔNG có nghĩa là «chưa được bảo vệ».

## Ba giới hạn phải nói kèm, đo được cả ba
    ① Tải lại trang KHÔNG mất ô: đường khôi phục (UngDung.tsx:958-975) đọc SỔ Ô o-phien.json,
       KHÔNG hỏi sổ sở hữu. Khoá chỉ xen vào lúc bấm một ghế MỚI vào một ô.
    ② Khoá gắn với MÃ PHIÊN, không gắn với ghế ⇒ mỗi phiên mới lại phải khoá tay một lần.
       `api/phien/route.ts:56` chỉ nhìn `?.owner`; lượt tự động chỉ ghi `kind:'proposal'`
       nên nó KHÔNG bao giờ tự bật cờ. **Đây là cái giá của 🅐, không phải lỗi.**
    ③ Khoá KHÔNG phải hàng rào bảo mật — một dòng trong tệp, tiến trình cùng tài khoản sửa được.
       Nó chống APP TỰ BỐC NHẦM, không chống người. (thợ tự khai mục 8, tôi xác nhận)

## Nợ còn treo sau lượt dựng này
    · 8 tệp chưa từng có verdict nay ĐANG CHẠY trên app — Owner biết và vẫn duyệt dựng.
    · cảnh báo UngDung.tsx:1245 useCallback thiếu phụ thuộc 'dongO' — chưa đụng.
    · bản .next cũ giữ ở ~/Operations/sao-luu-viec-do/next-truoc-dung-20260910-2143,
      ĐỪNG xoá tới khi bản mới chạy êm vài ngày.
    · round-26 Câu 2 (phép thử CLI / bộ khớp -pr) VẪN MỞ trên trang, Owner chưa tick.

## 🧮 [2026-09-11T10:46:25Z · 11:46 BST] ĐÍNH CHÍNH — số 155/11 là CỦA TÔI, và BA thước cho BA đáp án

`claude-aiboss-app-exe` nêu 11:4x, và nó đúng: con số `155 chú thích / 11 mã` cho `doc-phien.ts`
**KHÔNG nằm trong tin nào của exe**. Nó nằm ở ba tệp của TÔI:

    ai/round-27-noi-dung.md:61      ·  ai/de-dung-round-27.md:21  ·  ai/MASTER-PLAN.md (mục 21:1x)

Tôi đã để `hermes-web-noibo` đính chính nó trên trang round-27 mà **không truy ngược xem số ấy
từ đâu ra** — rồi thuật lại cho Owner như thể đó là chuyện giữa web-noibo và exe.
📌 **Tôi tường thuật một cuộc tranh luận mà tôi là một bên, và kể như mình đứng ngoài.**

## Ba thước, ba đáp án — trên CÙNG một diff 167 dòng thêm

    tôi        155 chú thích / 11 mã / 1 trống    thước: grep mẫu `^\+\s*(//|\*|/\*)`
    web-noibo  157 / 9 / 1                        thước: AST + đọc từng dòng
    exe        167 thêm / 14 mã                   thước: chưa rõ, nó chưa nói

🔴 **Đừng chọn số theo người nói. Chọn theo THƯỚC.** Thước của tôi là yếu nhất: nó chỉ nhận dòng
BẮT ĐẦU bằng `//` `*` `/*`, nên mọi dòng nối tiếp bên trong một khối chú thích mà không mở đầu
bằng `*` đều bị nó đếm nhầm thành MÃ. Hai dòng chênh giữa tôi và web-noibo gần như chắc nằm ở đó.
⚠️ Và tôi đã «đo lại» rồi ra đúng 155/11 — **chạy lại một thước yếu thì được đúng cái sai cũ.**
Lặp lại KHÔNG phải xác nhận.

✅ **Việc phải làm trước khi ai dùng lại con số này:** chốt MỘT thước chung cho câu hỏi
«dòng nào là mã, dòng nào là chú thích», rồi đo lại. Ba đáp án trên cùng một diff nghĩa là
câu hỏi ấy **chưa có định nghĩa dùng chung**, chứ không phải ai đó cẩu thả.

## Và một chỗ tôi KHÔNG phải sửa: lần khởi động lại 08:43 sáng nay

exe báo máy chủ là pid 1480 khởi 08:43, KHÔNG phải pid 76943 của lần hẹn 21:53, và nó
**không biết vì sao**. Tôi đo ra:

    kern.boottime  = Fri Sep 11 08:41:38 2026     ⇐ MÁY khởi động lại
    npm exec       = 08:43:00  (ppid 957)
    next-server    = 08:43:14  (pid 1480)
    plist com.eroca.phong-ban-lan: RunAtLoad = True · KeepAlive = True

⇒ **Máy bật lại lúc 08:41:38, launchd tự dựng app sau 82 giây.** Không có gì hỏng, không ai hẹn
sai. Đây đúng là ca tôi cảnh báo tối qua — *«bất kỳ lần nạp lại nào vì bất kỳ lý do gì»* — và
lần này nó vô hại vì bản trên đĩa đã là bản tốt.
📌 Ghi lại để lần sau không ai đi điều tra một cái bóng: **hỏi `kern.boottime` TRƯỚC khi đi tìm
thủ phạm trong log ứng dụng.**


## 🧭 [2026-09-14T14:18:27Z · 15:18 BST] ĐỢT M — HỌC TỪ MANDECK: theo dõi việc tới lúc được kiểm chứng · làn «Việc cần anh» · API/CLI/MCP dùng chung

> **Owner giao 14/09/2026 (nguyên văn):** «Đọc hai tài liệu 2026-09-13_mandeck-*.md tại: ~/idea/inbox/aiboss-app-chat/tra-cuu/ Nghiên cứu tiếp và đối chiếu với mã AIBOSS App Chat hiện tại. Ưu tiên: theo dõi việc từ lúc giao đến kết quả được kiểm chứng, mục "Việc cần Owner", và API/CLI/MCP dùng chung. Đề xuất cải tiến cụ thể: phần nào tận dụng, phần nào cần sửa, thứ tự làm và tiêu chí nghiệm thu. Phân biệt kết quả đã kiểm thử với nhận định từ đọc mã; đưa vào MASTER PLAN để triển khai.»

**Nguồn — mở lại được:**
```
Codex 13/09      ~/idea/inbox/aiboss-app-chat/tra-cuu/2026-09-13_mandeck-danh-gia.md (102 dòng)
                 ~/idea/inbox/aiboss-app-chat/tra-cuu/2026-09-13_mandeck-de-xuat-dot-1.md (84 dòng, 12 kịch bản)
PM chạy lại      ~/idea/inbox/aiboss-app-chat/tra-cuu/2026-09-14_mandeck-mock-test-PM-chay-lai.json (13:05:52)
Hermes đo mã     ~/idea/inbox/aiboss-app-chat/tra-cuu/2026-09-14_doi-chieu-ma-hien-tai.md
                 722 dòng · md5 9d3990a368162cd9df0cbad41d706323 · hermes-aiboss-app-reviewer · đo 14:59–15:02
PM soi lại       8 chỗ trích dòng trong báo cáo Hermes, 15:1x — cả 8 khớp (lệnh ở mục ③)
mã đối chiếu     HEAD 515785f4 + cây làm việc CHƯA commit. Bản đang chạy ở 4319 CHƯA được so với cây này.
```

### Ba nhãn — đọc trước khi đọc bất kỳ dòng nào dưới đây
```
[ĐÃ KIỂM THỬ]  chạy thật, ra HÀNH VI
[ĐÃ ĐO]        đếm / đo hiện vật, có đối chứng — nói mã CÓ CHỮ GÌ, không nói mã CHẠY RA SAO
[ĐỌC MÃ]       đọc mã rồi suy ra hành vi — CHƯA chạy
```

### ① Kết quả đã kiểm thử
1. **[ĐÃ KIỂM THỬ] Mock Mandeck — KHÔNG phải app ta.** 23 công cụ · lỗi nghiệp vụ 403/409 KHÔNG gắn `isError` · CLI `spawn` trả mã thoát **0** khi việc CHƯA giao được · `job spawn` trả 2 · `deck_job_report` khai `readOnlyHint: true` mà lại đóng việc theo dõi. PM chạy lại ra ĐÚNG số của Codex.
   ⇒ Đây là **bài học thiết kế** cho mặt tiền của ta (M3 · M5), không phải tính chất của mã ta.
2. **[ĐÃ KIỂM THỬ] Ca thật ô 3 · 14/09** (từ bản ghi phiên + danh sách tiến trình): lượt 1 kết thúc 13:22:15 (`end_turn`, 5 hook dừng đều < 50 ms, 0 lỗi hook) · 13:27:24 ghế không còn tiến trình nào · sổ máy chủ `~/Operations/logs/phong-ban-lan.log` có **0 dòng** về lượt này (đối chứng: cùng tệp có dòng khởi động 12:59).
   ⇒ Owner thấy «chạy hoài» mà **máy chủ không để lại dấu kết thúc nào để tra**.
3. **[ĐÃ KIỂM THỬ] Trần phiên tài khoản Claude 13:47:15 · 14/09:** bản ghi ô 3 có đúng 1 dòng «You've hit your session limit · resets 2:20pm»; subagent của PM chết cùng giờ với 429.
   ⇒ Một lượt thất bại vì hạn mức chỉ để lại dấu trong `.jsonl` — app không có bản ghi «lượt này hỏng, vì sao, mở lại lúc nào».

### ② Nhận định từ đọc mã — bản đồ hiện trạng
| Mảnh | Đang có | Đang thiếu | Chỗ trong mã | Nhãn |
|---|---|---|---|---|
| Hàng đợi đánh thức | bền trên đĩa · mã UUID · giữ chỗ `dang_giu` → ACK `da_giao` · khoá chống trùng | chỉ trạng thái VẬN CHUYỂN; lịch sử 10 phút / 60 dòng | `kho-danh-thuc.ts:52–53 · 64–68 · 380–385 · 445–448` | [ĐỌC MÃ] |
| Sổ ô + generation | ghi binding kèm generation, lệch thì từ chối | không phải sổ lượt | `kho-phien.ts:105–122` · `nap-bo-ghe.ts:222–243` | [ĐỌC MÃ] |
| Sổ tiến trình | `Map` trong bộ nhớ, xoá dòng khi tiến trình đóng · `GET /api/dung` | không bền · không giữ kết cục | `kho-tien-trinh.ts:146 · 323–327` · `api/dung/route.ts:18` | [ĐỌC MÃ] · PM soi |
| Kết cục lượt | sự kiện `loi`, `xong` | `xong` VẪN phát sau `is_error` · `chayMotLuot` trả `loi: null` khi lỗi nằm trong luồng | `chay-agent.ts:487–508` · `chay-mot-luot.ts:203–208` | [ĐỌC MÃ] · PM soi |
| Nối giao → chạy → kết cục | ACK mang mã yêu cầu | thân `/api/chat` không mang mã yêu cầu · `DauVaoLuot` không nhận | `UngDung.tsx:2105 · 2113 · 1704–1709` · `chay-mot-luot.ts:63–70` | [ĐỌC MÃ] |
| Đã kiểm / nghiệm thu | chỉ trong TÀI LIỆU: verdict + md5, trang round | không có trạng thái nào trong mã | 0 dòng `job_id·attempt_id·artifact_refs·needs_input·da_kiem` / 46 tệp, có đối chứng | [ĐÃ ĐO] |
| Việc cần Owner | một writer hẹp `can-nguoi.jsonl` (runner nền không thấy bản ghi phiên) | 0 người đọc · 0 giao diện · tệp chưa tồn tại ở gốc kho | `may-chay-nen.ts:55–76` · grep `can-nguoi` src+dev = 1 dòng, chính là writer | [ĐÃ ĐO] · [ĐỌC MÃ] |
| Đèn «đang chạy» | khôi phục hỏi `GET /api/dung` | ô khôi phục-đang-chạy KHÔNG ai hạ cờ khi lượt xong | xem khối ngay dưới | [ĐÃ ĐO] · [ĐỌC MÃ] |
| Cửa sinh tiến trình | `/api/chat` giữ chỗ theo ô (`datCho`) | runner nền 0 lần `datCho`; fork là cửa THỨ BA | `chat/route.ts:204` · `fork/route.ts:113–115` | [ĐÃ ĐO] 1 · 0 · 0 |
| API / CLI / MCP | 9 route · 12 phương thức · CLI `dev/confirm-session-owner.mjs` dùng CHUNG `so-so-huu.ts` với `/api/session-owner` | không có mặt tiền việc chung · 0 dấu hiệu MCP server | `so-so-huu.ts:63–71` | [ĐÃ ĐO] 0 · đối chứng 12 |
| Chạy nền | chỉ bật khi `CHAY_NEN` đúng bằng `'1'` | nhật ký khởi 12:59 in «TẮT» | `may-chay-nen.ts:142` | [ĐÃ ĐO] |

**Đường làm đèn kẹt — PM đếm tại mã 15:1x:**
```
dangChay: false   chỉ ở UngDung.tsx:660 (nút Dừng) và :1768 (finally của tab ĐANG GIỮ luồng)
GET /api/dung     chỉ gọi ở UngDung.tsx:912 (lúc khôi phục)
tab hiện lại      UngDung.tsx:2186  if (o.dangChay || o.dangNap) continue;   ⇐ bỏ qua ô đang chạy
⇒ [ĐỌC MÃ] tải lại trang lúc ghế đang chạy ⇒ đèn bật theo máy chủ ⇒ tab mới không giữ luồng
   ⇒ lượt xong KHÔNG có đường nào hạ cờ, trừ bấm Dừng hoặc tải lại lần nữa.
⚠️ CHƯA chứng minh đây là nguyên nhân ca ô 3 ngày 14/09 — chưa biết Owner có tải lại giữa lượt không. M1 trả lời.
```

### ③ Dòng trạng thái cũ trong chính kế hoạch này ĐÃ LỖI THỜI — đính chính, KHÔNG xoá chữ cũ
```
P0-7 ① · P1-7 ①   «thêm GET /api/dung» · «khôi phục đặt dangChay đúng sự thật»
                  ⇒ MÃ ĐÃ CÓ (api/dung/route.ts:18 · UngDung.tsx:912 · 946)
                  ⇒ CHƯA có phép nghiệm thu nào được chạy ⇒ trạng thái đúng: «có mã, CHƯA nghiệm thu»
4e (31/08)        «/api/phien cờ đang-chạy 0 · GET /api/dung 0 · dangChay:false 3 chỗ»
                  ⇒ nay: nhánh danh sách /api/phien có dang_chay (route.ts:57) · GET /api/dung có ·
                     dangChay:false còn 2 chỗ, không chỗ nào ở khôi phục
⑤c lớp 1          ⇒ có mã visibilitychange (UngDung.tsx:2147–2225) nhưng bỏ qua ô đang chạy. CHƯA nghiệm thu.
CÒN ĐÚNG          P1-6 SQLite 0 · B0 khoá chung chưa có · CHAY_NEN tắt · P1a sổ đang chạy bền chưa có
```
**Cách đo lại (chạy trong `~/Projects/aiboss-app-chat`):**
```bash
grep -nE '^export async function (GET|POST)' src/app/api/dung/route.ts
grep -nE "fetch\('/api/dung'\)|dangChayTheoO\.has" src/components/UngDung.tsx
grep -nE 'dangChay\s*:' src/components/UngDung.tsx
grep -c 'datCho(' src/app/api/chat/route.ts src/lib/may-chay-nen.ts src/lib/chay-mot-luot.ts
grep -rn 'can-nguoi' src dev
sed -n '487,508p' src/lib/chay-agent.ts | grep -nE "is_error|loai: 'loi'|loai: 'xong'"
```

### ④ Tận dụng gì — KHÔNG dựng lại từ số không
1. `kho-danh-thuc.ts` — mã UUID + giữ chỗ/ACK + khoá chống trùng ⇒ làm **tầng vận chuyển** của việc. Chỉ thêm liên kết sang lượt.
2. **generation** của sổ ô ⇒ làm hàng rào chặn tiến trình cũ ghi đè. Khỏi đẻ khái niệm mới.
3. `chay-mot-luot.ts` ⇒ lõi chạy một lượt DUY NHẤT. `/api/chat` hiện gọi thẳng `chayAgent` (`chat/route.ts:302`) ⇒ gom về lõi là điều kiện để mọi cửa ghi sổ giống nhau.
4. **Mẫu «một thư viện, hai mặt tiền» ĐÃ CHẠY THẬT:** `so-so-huu.ts` ← `/api/session-owner` + `dev/confirm-session-owner.mjs` ⇒ chép mẫu này cho HTTP · CLI · MCP của việc.
5. `dev/claude-gia.sh` (CLI giả giao thức stream) + `dev/chay-dev.sh` (môi trường dev riêng) ⇒ dựng được ca «lỗi rồi vẫn xong», «chết giữa lượt» mà KHÔNG tốn lượt thật, KHÔNG chạm 4319.
6. Writer `can-nguoi.jsonl` ⇒ nguồn đầu tiên cho làn «Việc cần anh».
7. `ai/NGHIEN-CUU-kenh-sqlite.md` (3 bảng · WAL) + node 24.19.0 có sẵn `node:sqlite` (`DatabaseSync` có mặt, PM chạy 14/09) + `package.json` 0 thư viện sqlite ⇒ không cần thêm phụ thuộc.
   ⚠️ Mức ổn định của `node:sqlite` và cách Next 15 đóng gói nó **CHƯA ĐO**.
8. Nếp đội đang làm bằng tay — verdict ghi md5 (`ai/PROTOCOL-review-hash.md`), trang round ⇒ chính là **bằng chứng kiểm chứng** mà sổ việc cần trỏ tới. Không phát minh lại.

### ⑤ Việc cần làm — thứ tự, mỗi bước một cổng
Chạm `src/` ⇒ `claude-aiboss-app-exe` làm · `hermes-aiboss-app-reviewer` soi (khác mô hình, đo trước mỗi lần) · cổng băm + cổng dựng như cũ · khởi động lại chờ Owner xác nhận HAI lần · bộ đếm vòng áp theo VIỆC.

#### M1 · TÁI HIỆN «ĐÈN KẸT» RỒI MỚI VÁ — nhỏ, chạm đúng thứ Owner than 14/09
- **Vì sao đứng đầu:** Owner báo ô 3 «chạy hoài» ngày 14/09 (quan trọng ✅). Mã có đúng một đường làm đèn kẹt, và phép tái hiện rẻ (khẩn đủ để làm trước, vì rẻ).
- **Việc:** trên môi trường dev (`dev/chay-dev.sh`, CLI giả, cổng khác 4319): cho một ô chạy lượt dài → tải lại trang giữa lượt → để lượt kết thúc → nhìn đèn.
- **Tái hiện được thì vá:** tab đối soát những ô «đèn bật mà không giữ luồng» với `GET /api/dung` theo nhịp và khi tab hiện lại; máy chủ nói hết chạy ⇒ hạ cờ + nạp lại lịch sử.
- **Nghiệm thu:**
  ⓐ bản CŨ trên cùng kịch bản phải KẸT — không tái hiện được bệnh thì không biết mình chữa gì
  ⓑ bản MỚI tắt đèn ≤ 10 giây sau khi tiến trình thoát, KHÔNG cần tải lại
  ⓒ đối chứng: ô ở tab đang giữ luồng chạy y như cũ
  ⓓ đo cả WebKit (Safari), không chỉ Chromium
  ⓔ không tái hiện được ⇒ ghi «chưa rõ nguyên nhân ca 14/09», KHÔNG vá theo đoán

#### M2 · SỔ LƯỢT BỀN + KẾT CỤC ĐÚNG — móng của mọi thứ sau
- **M2a · chọn kho bằng số đo, không bằng cảm giác (một buổi):** `node:sqlite` chế độ WAL trong route Next 15 qua `next build` + `next start` · hai tiến trình ghi đồng thời · `kill -9` giữa lúc ghi. Trượt ⇒ lui về JSONL chỉ-nối-thêm + rename như `kho-danh-thuc.ts`.
- **M2b · mỗi lượt một dòng:** `run_id` · `request_id` (mã yêu cầu đánh thức, có thể rỗng) · `ma_o` · `ma_nhan_su` · `ma_phien` · `binding_generation` · `provider` · `started_at` · `ended_at` · `status` (running / succeeded / failed / cancelled / interrupted) · `error_kind` (is_error / exit / spawn / rate_limit / stop) · `error` · `exit_code` · `usage` · `requested_by`.
- **Luật ghi:**
  ```
  ghi dòng running TRƯỚC sự kiện đầu tiên gửi trình duyệt
  ghi kết cục TRƯỚC khi gửi «xong»
  succeeded CHỈ KHI exit 0 VÀ không is_error VÀ không có sự kiện loi
  khởi động lại gặp dòng running mà tiến trình đã chết ⇒ interrupted, KHÔNG tự chạy lại
  ghi bằng generation cũ ⇒ bị từ chối
  mọi cửa sinh tiến trình (chat · nền · fork) ghi CÙNG một sổ; B0 (khoá chung theo ô) làm TRONG bước này
  thân /api/chat và DauVaoLuot mang request_id
  ```
- **Tên tệp mã mới viết tiếng Anh** (luật Owner 09/09 — PM dự án chốt áp cho tệp MỚI của đợt này; tệp cũ giữ nguyên, không đổi tên hàng loạt).
- **Nghiệm thu — chạy trên CLI giả, KHÔNG tốn lượt thật:**
  ⓐ luồng «result is_error rồi xong» ⇒ `failed` — và bản CŨ trên cùng đầu vào báo «xong» (đối chứng dương cho bệnh)
  ⓑ lượt thành công bình thường ⇒ `succeeded` (đối chứng âm: thước biết nói «không lỗi»)
  ⓒ đóng hẳn trình duyệt giữa lượt ⇒ dòng vẫn có `ended_at` + kết cục đúng
  ⓓ khởi động lại máy chủ dev giữa lượt ⇒ `interrupted`, số lần sinh tiến trình = 1
  ⓔ đổi ô A → B → A giữa lượt ⇒ lần ghi của lượt cũ bị từ chối
  ⓕ luồng có dòng «You've hit your session limit · resets …» ⇒ `failed · rate_limit` (ca thật 14/09 13:47)
  ⓖ gửi hai lần cùng `request_id` ⇒ đúng một lượt · khác nội dung cùng khoá ⇒ từ chối

#### M3 · LÀN «VIỆC CẦN ANH»
- **Nguồn giai đoạn 1:** lượt failed / interrupted (từ M2) · `can-nguoi.jsonl` · yêu cầu ghế tự nộp qua một cổng mới (loại: duyệt / trả lời / xác nhận; kèm link; khoá chống trùng).
- **Trạng thái mục:** open → answered → closed. Trả lời lần hai ⇒ từ chối, mục giữ nguyên.
- **ĐỌC danh sách KHÔNG được đổi gì** — bài học đã kiểm thử ở ①.1.
- Rủi ro Owner đã chấp nhận có ghi sổ **KHÔNG BAO GIỜ** vào làn này.
- **Chỗ đặt trên màn hình là việc Owner chọn** ⇒ trình round khi M2 xong, kèm ảnh chụp bản thử.
- **Nghiệm thu:**
  ⓐ lượt failed hiện trong làn ≤ 10 giây
  ⓑ trả lời hai lần ⇒ lần hai 409 · băm kho trước/sau lần hai GIỐNG
  ⓒ mở / đọc làn ⇒ băm kho trước/sau GIỐNG
  ⓓ bấm mục ⇒ mở đúng ghế + đúng phiên (dùng P1-2)
  ⓔ đối chứng âm: lượt succeeded KHÔNG sinh mục

#### M4 · NỐI «ĐÃ KIỂM CHỨNG» VÀO SỔ VIỆC — đuôi của chuỗi giao → kết quả được kiểm
- **Sổ ghi:** verdict nào (đường dẫn + md5 tệp verdict) · người soi + mô hình · tệp được soi + md5 · kết luận ĐẠT / BÁC · trỏ về `run_id` / `request_id`.
- **Trạng thái chấp nhận:** submitted → verified → accepted / changes_requested. Cổng băm thành một phép TRA: md5 tệp biên dịch hiện tại có khớp verdict ĐẠT không.
- Bộ đếm vòng (dừng sau ba lần bác) đếm được từ sổ — khỏi đếm tay trên kênh.
- **Nghiệm thu:**
  ⓐ đổi một byte tệp sau verdict ⇒ phép tra báo verdict hết hiệu lực với phần đổi
  ⓑ verdict của người soi CÙNG mô hình với người làm ⇒ từ chối ghi
  ⓒ đường dẫn verdict chứa `../` hoặc nằm ngoài thư mục cho phép ⇒ từ chối
  ⓓ đối chứng dương: verdict đúng băm ⇒ accepted

#### M5 · MỘT THƯ VIỆN, BA MẶT TIỀN: HTTP · CLI · MCP — CHỈ TRONG MÁY
- **Làm SAU M2–M4:** dựng mặt tiền trước khi nghĩa của trạng thái đứng yên là đóng băng một hợp đồng sai.
- **Thao tác:** giao việc (bọc `/api/danh-thuc`) · xem việc / lượt · danh sách «việc cần anh» · trả lời mục · dừng (bọc `POST /api/dung`).
- **CLI — mã thoát:** 0 đã giao · 2 sai cú pháp · 3 KHÔNG giao được (trùng / bận / từ chối) · 4 không thấy · 5 không tới được máy chủ · có cờ `--json`.
- **MCP qua stdio, gọi `127.0.0.1:4319`:** lỗi nghiệp vụ ⇒ `isError: true`; công cụ khai chỉ-đọc thì THẬT SỰ chỉ đọc.
- Thêm thư viện MCP SDK hay tự viết JSON-RPC tối giản: exe đề xuất kèm số đo, người soi chốt.
- **Ranh giới:** chỉ trong máy. Mở bất kỳ mặt tiền nào ra ngoài máy (điện thoại, internet) là bài **P3-1** và phải **hỏi Owner TRƯỚC**.
- **Nghiệm thu = chạy lại chính bộ thử mock Mandeck trên mặt tiền của TA:**
  ⓐ 403 / 409 ⇒ `isError: true`
  ⓑ CLI việc không giao được ⇒ mã thoát khác 0
  ⓒ gọi công cụ chỉ-đọc ⇒ băm kho trước/sau GIỐNG
  ⓓ cùng một yêu cầu qua HTTP · CLI · MCP ⇒ cùng kết quả

**12 kịch bản đợt 1 của Codex** (`de-xuat-dot-1.md:63–78`) được phủ: đóng trình duyệt · nối lại luồng · lỗi-rồi-xong · chống trùng · A→B→A · khởi động lại giữa lượt · tiến trình cũ ghi đè ⇒ M2 · việc thiếu hiện vật chưa được chấp nhận · đọc bảng không đóng việc kiểm ⇒ M4 · trả lời hai lần ⇒ M3 · đường dẫn hiện vật đi lùi ⇒ M4 ⓒ. **Ca Host giả KHÔNG đưa vào** — đó là rủi ro Owner đã chấp nhận có ghi sổ.
⚠️ Ca «nối lại luồng theo con trỏ» mới phủ một nửa: M2 giữ kết cục bền, M1 đối soát đèn; **phát lại luồng chữ sau F5 vẫn là việc khó của P0-7 ②**, chưa xếp vào đợt này.

### ⑥ Nối vào bậc cũ — không đẻ mục trùng
```
M1  ⇒ P0-7 · P1-7 (đèn / nút Dừng)   hai mục đó đổi thành «có mã, CHƯA nghiệm thu»; M1 là phép nghiệm thu còn thiếu
M2  ⇒ P1-6 (SQLite) · P1a (sổ bền) · B0 (khoá chung) · P1-1 (mức dùng theo ghế lấy từ usage của sổ lượt)
M3  ⇒ P1-2 (đường dẫn đích danh ghế + phiên)
M4  ⇒ ai/PROTOCOL-review-hash.md · bộ đếm vòng
M5  ⇒ MỚI. Mặt tiền ra ngoài máy vẫn là P3-1
CHAY_NEN=1 (B3) ⇒ vẫn chờ B0 + B1. M2 làm B0 nên rút ngắn đường tới B3, nhưng KHÔNG tự bật.
```

### ⑦ CHƯA ĐO — đừng đọc thành đã biết
- Bản đang chạy ở 4319 có đúng cây mã được đối chiếu không — cây có nhiều tệp chưa commit.
- Nguyên nhân thật của «chạy hoài» ô 3 ngày 14/09 — M1 trả lời.
- `node:sqlite` ổn định tới đâu, Next 15 đóng gói nó ra sao — M2a trả lời.
- Mọi ghế Claude có đứng trong khoảng 13:47–14:20 không — mới đo được ô 3 và subagent của PM.

#### 🔄 [2026-09-14T15:22:27Z · 16:22 BST] Đợt M · M1 ⓐ ĐÃ TÁI HIỆN — [ĐÃ KIỂM THỬ] trên dev, CHƯA vá
```
nguồn     claude-aiboss-app-exe, kênh doi-aiboss-app-chat.md tin 15:16:16Z
môi trường dev 4320 · CLI giả (FAKE_CLAUDE_DELAY_SEC=45) · Chromium 151 · app 4319 KHÔNG chạm (8/8 tài nguyên 200, pid 68284 giữ nguyên)
«đèn»     div.o-chat[data-o="0"] .den-o  ·  kẹt = có lớp den-chay (aria-label «Đang chạy»)
ca ĐỎ 1   gửi 15:12:15Z · tải lại 15:12:20Z · tiến trình thoát và /api/dung bỏ o-1 cùng lúc 15:13:04Z
          35,1 giây sau đèn VẪN den-chay trong khi /api/dung không liệt kê ô (143 mẫu) ⇒ KẸT
ca XANH   tab giữ luồng: den-chay 14:59:20 → den-noi 15:00:09 = tắt đúng lúc
bộ thử    node dev/repro-stuck-light.mjs --case green|red-reload|red-second-tab|probe-dung (chạy lại được)
bẫy đo    lần chạy ĐẦU của next dev: GET /api/dung trả rỗng suốt 213 mẫu dù tiến trình đang chạy ⇒ bộ thử nay có chốt hợp lệ
CHƯA PHỦ  ca ĐỎ 2 (tab thứ hai) · XANH chạy lại · cả ba ca trên WebKit 26.5 · bản vá
```
⚠️ Tái hiện trên dev chứng minh ĐƯỜNG MÃ có lỗi. Nó CHƯA chứng minh ca ô 3 của Owner lúc 13:15–13:27 đi đúng đường này (chưa biết lúc đó có tải lại trang không).

#### 🔄 [2026-09-14T15:52:16Z · 16:52 BST] Đợt M · M1 ĐÃ VÁ trên dev (chờ verdict) + mở M1b — nguồn: exe, kênh tin 15:48:43Z
```
[ĐÃ KIỂM THỬ] dev 4320 · giây tính từ lúc /api/dung thôi liệt kê ô
                 xanh    tải lại    tab thứ hai          bấm Dừng
CŨ   Chromium    0 s     KẸT ≥35,1  A 0 · B KẸT ≥35,2   KẸT ≥35,2
CŨ   WebKit      0 s     KẸT ≥35,3  A 0 · B KẸT ≥35,6   chưa đo
MỚI  Chromium    0 s     4,5 s      A 0 · B 5,0 s        1,1 s
MỚI  WebKit      0 s     4,6 s      A 0 · B 4,6 s        1,7 s
tệp   src/components/UngDung.tsx 166d4e0a… → 32e8ecf9162dc4eab19cb696303915e6 (+67 −2)
soi   hermes-aiboss-app-reviewer đang chạy từ 16:47 · CHƯA dựng · CHƯA nạp
rủi ro PM nêu: /api/dung trả rỗng hợp lệ lúc ghế còn chạy ⇒ bản vá tắt nhầm đèn ⇒ mất nút Dừng (P0-7 ③ chiều ngược)
```
**M1b · ba chỗ M1 chưa phủ — [ĐỌC MÃ], CHƯA đo, làm SAU lượt dựng M1:**
- ⓐ tab không giữ luồng: đèn tắt nhưng khung chat KHÔNG tự nạp câu trả lời cuối, tới lần ẩn-hiện tab hoặc tải lại
- ⓑ 🔴 câu Owner gõ vào ô đang chạy ở tab không giữ luồng vào hàng chờ, và chỉ finally của tab GIỮ luồng mới gửi hàng chờ ⇒ câu đó KHÔNG BAO GIỜ gửi. **Mất lời Owner ⇒ xếp ngay sau M1.**
- ⓒ ô kẹt nằm trong ds_ban của vòng chuông ⇒ chuông cho ghế đó bị giữ suốt lúc kẹt
- Nghiệm thu: tái hiện từng ca trên bản CŨ trước (dev 4320, bộ thử dev/repro-stuck-light.mjs) · bản mới: câu trả lời cuối hiện ≤ 10 giây sau khi lượt xong · câu gõ trong lúc chạy được gửi ĐÚNG MỘT lần · đối chứng tab giữ luồng không đổi.
- Liên quan tới việc Owner than 16:48: tải lại ô exe ba lần mà không thấy chữ nào. [ĐÃ ĐO] lượt exe từ 15:41 có 138 lệnh công cụ và 0 khối chữ, nên dù có M1b thì khung vẫn trống nếu ghế không viết chữ.

#### 🔄 [2026-09-14T16:13:40Z · 17:13 BST] Đợt M · verdict hermes-aiboss-app-reviewer 16:51: M1 vòng 1 BÁC 3/8 · ghim QLT ĐẠT 4/4 — dựng riêng việc ghim
```
verdict      ~/idea/inbox/aiboss-app-noibo/VERDICT-HERMES-2026-09-14_M1-den-ket-va-ghim-QLT.md
A (M1)       BÁC  A1 A2 A3 A5 A6 đạt · A4 A7 A8 trượt · bộ đếm vòng: vòng bác 1
B (ghim)     ĐẠT  nhan-su.json 2a10d350 · hang-so.ts d9484990
dựng riêng   16:56 XANH · BUILD_ID tjf65Bwn2Xjn3I16zWbqM · UngDung.tsx trả về 166d4e0a trước khi dựng · CHƯA nạp
PM đo 17:12  BUILD_ID đĩa khớp · 2 md5 khớp verdict · 3 mã ghim có trong .next, đối chứng có, mã bịa 0
```
- **A4 lộ một lỗ CÓ TỪ TRƯỚC, không phải của M1** — [ĐỌC MÃ] theo verdict: `chay-agent.ts:512–522` sự kiện `error` gọi `khiChet` mà không kiểm tiến trình đã thoát ⇒ `api/chat/route.ts:381` ⇒ `kho-tien-trinh.ts:320–327` xoá dòng sổ ⇒ /api/dung thôi liệt kê ô trong khi con có thể còn sống.
  ⇒ **thêm vào M2, bắt buộc:** chỉ ghi kết cục / xoá dòng khi có bằng chứng tiến trình đã thoát (exitCode hoặc signalCode) · nghiệm thu: ép sự kiện error trên CLI giả còn sống ⇒ dòng sổ còn, nút Dừng còn, đối chứng: tiến trình thoát thật ⇒ dòng mất.
- «Mất dòng sổ» KHÔNG chứng minh «tiến trình đã đóng» — M1 vòng 2 gỡ vế bấm Dừng vì đúng lý do này.

#### 🆕 [2026-09-14T16:27:42Z · 17:27 BST] Đợt M · M1c — OWNER YÊU CẦU: chuyển bộ ghế là nạp ĐÚNG bộ, lượt cũ chạy ngầm
> Owner (nguyên văn): «khi bấm menu vào 1 phòng nào đó như kiểu "Quản lý trường" trong category "Vào phòng ban" thì mặc định load đúng danh sách ô đã fix kèm session id của ghế đã ghim (gắn) mà tôi đã quyết chứ không hiện thông báo ô <n> đang chạy rồi không load ô ghế mới của giao diện mới. Đã chuyển qua bộ mới (giao diện mới) thì giao diện cũ cứ kệ nó chạy ngầm mà.»
```
[ĐỌC MÃ] nap-bo-ghe.ts:167–168 · 173 · 180 bỏ qua ô đang chạy; câu hiện ra ở :110 «đang chạy — chưa đổi. Xong việc rồi bấm lại»
[ĐÃ ĐO]  GET /api/o 15:19:23: Owner đã sang bộ Công Nghệ mà ô 3 vẫn là claude-phong-dao-tao (đang chạy)
[ĐỌC MÃ] khoá sinh tiến trình theo Ô: chat/route.ts:204 · kho-tien-trinh.ts:177 datCho(maO)
         ⇒ đổi ghế trong ô đang chạy mà KHÔNG đổi trục khoá thì ghế mới nhiều khả năng không gửi được tới khi lượt cũ xong (CHƯA đo)
[ĐỌC MÃ] chat/route.ts:420 cancel() cố ý không giết con · chay-agent.ts ~:572–584 có chayNen thì giữ con, không thì SIGTERM — CHƯA đo lượt HTTP
```
- **Thứ tự:** ngay sau khi M1 vòng 2 nộp người soi; trước M1b. Quan trọng ✅ (mỗi lần chuyển bộ lúc có ghế chạy) · Owner yêu cầu thẳng.
- **Cổng:** thiết kế trước (ghi chú ngắn trong ai/de-soi/) → hermes-aiboss-app-reviewer soi thiết kế → mới viết mã.
- **Hệ quả lên B0:** gợi ý «lượt thuộc về PHIÊN, ô chỉ là cửa sổ» đổi trục khoá từ Ô sang PHIÊN. Nếu thiết kế được duyệt, dòng B0 cũ («trục Ô duy nhất theo cấu trúc») phải sửa theo.
- **Ràng buộc an toàn:** chạy ngầm KHÔNG được mất đường dừng · một phiên không chạy hai lượt · đổi ghế không giết và không bị lượt cũ ghi đè · chỗ hiện lượt ngầm trên màn hình là việc Owner chọn (round kèm ảnh).
- **Nghiệm thu** (chi tiết ⓐ–ⓘ trong ai/GIAO-EXE-M1c-chuyen-bo-ghe-chay-ngam-20260914.md): chuyển bộ lúc ô đang chạy ⇒ ô hiện ngay ghế + phiên ghim của bộ mới · lượt cũ chạy tới hết, bị giết 0 lần · ghế mới gửi được ngay · lượt ngầm thấy và dừng được · quay lại thì đèn đúng · lượt cũ xong không đổi liên kết ô · gửi trùng vào phiên đang chạy bị từ chối rõ · đối chứng không ô nào chạy thì y như cũ · Chromium + WebKit.

#### 🔀 [2026-09-14T17:47:49Z · 18:47 BST] Đợt M · M1 BÁC VÒNG 2 ⇒ GỘP M1 · M1c · lỗ «error xoá dòng» · M1b ⓑ thành «LÕI SỔ LƯỢT ĐÚNG SỰ THẬT» · ghim QLT ĐÃ LÊN APP
```
ghim QLT      nạp 18:39:50 · pid 68284 → 96400 · tjf65Bwn · bộ đo tách rời ĐẠT 18:40 · PM đo lại 18:46 ĐẠT (3 mã ghim 1·1·1 · đối chứng 1 · bịa 0 · gợi ý cũ 0)
M1 vòng 2b    BÁC 5/9 (R2 danh tính lượt tái dùng được · R6 bộ thử · R7 chú thích · R8 phản ví dụ: lượt thấy đã thoát ≠ ô không còn lượt sống)
              verdict ~/idea/inbox/aiboss-app-noibo/VERDICT-HERMES-2026-09-14_M1-vong2b.md · cây đã trả về bản có verdict
quyết định    KHÔNG vá vòng 3 trong M1. Gộp thành một việc, THIẾT KẾ TRƯỚC — đề ai/GIAO-EXE-loi-so-luot-20260914.md
bộ đếm        mang vòng bác 2 từ M1, KHÔNG đặt lại (đã báo Owner). Bác thêm một lần ⇒ PM dừng, báo Owner.
bước đề nghị  B1 máy chủ nói đúng (danh tính lượt · chỉ xoá khi thoát thật · khoá trục mới) → B2 đèn → B3 chuyển bộ ghế → B4 câu gõ không mất
```
- Mục M1 · M1b · M1c ở trên giữ nguyên làm NGUỒN nghiệm thu; việc thi công đi theo đề gộp.
- M2 (sổ lượt BỀN trên đĩa) xây trên B1 — B1 giữ trong bộ nhớ nhưng đặt đúng danh tính và bất biến để M2 chỉ việc ghi xuống đĩa.

#### 📥 [2026-09-15T13:01:45Z · 14:01 BST] Việc tồn từ lượt soi «đổi tên ghế ô 4» (hermes-aiboss-app-reviewer 15/09, ngoài đề) — [ĐỌC MÃ], chưa xếp lịch
- `kho-phien.ts:109` chỉ giữ `moc_ket_thuc` khi CẢ tên ghế lẫn mã phiên không đổi ⇒ đổi tên ghế làm mốc về null ⇒ cổng «đang chạy nơi khác» có thể chặn oan lần gửi đầu. Nghiệm thu khi làm: đổi tên một ghế trên dev, gửi ngay ⇒ không bị chặn.
- `api/danh-thuc/route.ts:62–75` nhánh chống trùng có thể trả 200 TRƯỚC khi kiểm tên ghế ⇒ gọi tên không tồn tại với khoá cũ nhận 200. Nghiệm thu: tên bịa + khoá đã dùng ⇒ 404.
- `dev/sinh-ho-so-ghe.mjs:92–100` chép lại logic suy thư mục ghế (bản thứ hai của `thuMucAgent`) ⇒ trỏ về một nguồn. Nghiệm thu: grep chỉ còn một chỗ suy thư mục.
- Liên quan việc gộp «lõi sổ lượt»: điểm 1 và 2 đụng đúng vùng khoá + sổ ô ⇒ cân nhắc gộp khi thiết kế.

#### 🆕 [2026-09-17T14:02:43Z · 15:02 BST] P2-5 · HAI MỨC CỠ CHỮ + MENU «CÀI ĐẶT» — Owner giao 17/09
- Owner: «font chữ hiện tại là Trung Bình, cần thêm mức Lớn to hơn hai nấc, thêm menu cài đặt để chọn».
- [ĐÃ ĐO] cỡ chữ khai cứng bằng px: mau09.css 92 dòng font-size · globals.css 22 dòng · .bong 13px (:316) · .bc-2 .bong 12,5px (:382) · .bc-4 .bong 11,5px (:391) · ô soạn 16px kèm ghi chú KHÔNG hạ (globals.css:112-113).
- [ĐỌC MÃ] không có biến cỡ chữ gốc ⇒ làm hai mức bằng cách sửa tay từng dòng là đường dài; exe tự chọn cách, PM chỉ giữ ràng buộc.
- Nghiệm thu: mức Trung bình không đổi (ảnh trước/sau) · mức Lớn đo được bằng px · nhớ sau khi tải lại · ô soạn ≥ 16px · 390px và 1366px không vỡ · xoá lựa chọn thì về Trung bình.
- Đề: ai/GIAO-EXE-hai-muc-co-chu-20260917.md. Xếp TRƯỚC việc «lõi sổ lượt», và dựng chung với việc đổi tên ghế ô 4 đang chờ nạp để Owner chỉ xác nhận khởi động lại một lần.
