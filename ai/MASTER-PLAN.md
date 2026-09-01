# `aiboss-app-chat` — MASTER PLAN v1.0
> 📅 Dựng 30/08/2026 · 👤 `claude-phong-ban-pm` (App Reviewer) soạn theo lệnh Owner
> 🎯 Nguồn duy nhất về hướng đi. Việc cụ thể nằm ở `TASK_BOARD.md`, lý do chốt nằm ở `DECISION_LOG.md`.
> ⚠️ Mọi con số dưới đây **đo lúc 07:01 ngày 30/08/2026**. Số quá một ngày thì ĐO LẠI, đừng chép.

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
nào bắt được điều đó.** Cách chữa thật: thêm `| iconv -f utf-8 -t utf-8 -c` sau chỗ cắt. **CHƯA làm.**

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
