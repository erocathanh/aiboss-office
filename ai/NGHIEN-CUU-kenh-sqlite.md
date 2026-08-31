# 📡 NGHIÊN CỨU — đưa GIAO TIẾP GIỮA CÁC GHẾ sang SQLite
> 👤 `claude-phong-ban-pm` (App Reviewer) · 📅 30/08/2026 13:0x London · 🔄 v1.0
> 🎯 Owner giao: nghiên cứu + thử nghiệm, **đừng sợ việc lớn** — tiêu chí là *lâu dài · ổn định · an toàn*.
> ⚠️ Mọi số đo lúc 12:5x–13:0x ngày 30/08/2026. Quá một ngày thì ĐO LẠI.

---

## ① BỆNH — đo được, không phải cảm giác

### 1a. Kênh tổng công ty đang bị dùng làm kênh nội bộ đội
```
BOSS-CHANNEL.md   252 tin · 10.726 dòng · 776 KB
138/252 tin (55%) là trao đổi CHỈ giữa 3 ghế đội app  ⇒ đáng lẽ ở kênh riêng
ai ghi nhiều nhất:  claude-phong-ban-pm 66 · aiboss-app-pm 58 · aiboss-app-exe 49
                    ⇒ ba ghế đội app = 173/252 = 69% kênh của CẢ CÔNG TY
```
🔴 **Owner chỉ ra đây là sai kiến trúc, và người vi phạm số một là tôi.**
> Nguyên văn Owner: *«Team 1 dự án chỉ đọc và ghi giao tiếp vào 1 table riêng (hay file riêng như hiện tại).
> Chỉ pm dự án mới được append vào BOSS-CHANNEL để thông báo toàn bộ các pm team khác và Tổng Giám Đốc.»*

### 1b. Cơ chế «đọc tới đâu» mới có 1 ghế trên 7 dùng
```
~/Operations/.doc-tin/<ghế>.moc     chứa số dòng đã đọc
claude-aiboss-app-pm   mốc 8880 / 10.726 dòng  ⇒ còn 1.846 dòng CHƯA ĐỌC
số ghế có mốc: 1 / 7
```
⇒ Đó là lý do đo được cho việc bỏ sót tin, không phải «ghế lười đọc».

## ② HỌ LÀM THẾ NÀO — đọc mã thật trên máy này, không đọc lời đồn

### 2a. Hermes — **năm cơ sở dữ liệu TÁCH THEO VIỆC**, không một cái ôm hết
```
~/.hermes/kanban.db      122 KB   kanban_notify_subs(task_id, platform, chat_id, user_id,
                                     notifier_profile, created_at, LAST_EVENT_ID)
~/.hermes/state.db       166 MB   async_delegations(delegation_id, origin_session,
                                     parent_session_id, STATE, dispatched_at, completed_at)
~/.hermes/projects.db     53 KB   discovered_repos(root, label, last_seen) — 62 dòng
~/.hermes/executions.db   20 KB · verification_evidence.db
```
🔑 **`last_event_id` là câu trả lời chuẩn cho bài của ta.** Mỗi người-theo-dõi giữ MỘT con trỏ
tới sự kiện cuối đã nhận. Đúng nguyên tắc: **trạng thái đọc thuộc về NGƯỜI ĐỌC, không thuộc về TIN.**
📌 `async_delegations` cho thấy họ coi «giao việc cho bên khác» là một hàng có TRẠNG THÁI, không phải
một dòng chữ — có mốc gửi, mốc xong, và phiên cha.

### 2b. openclaw — có sẵn `state_leases`
```
CREATE TABLE IF NOT EXISTS state_leases       ← đúng cơ chế lease đội đang bàn cho heartbeat
src/infra/sqlite-wal.ts  82 dòng, CÓ bài kiểm  ·  PRAGMA journal_mode = WAL
src/cron/run-log/sqlite-store.ts · src/cron/store.ts
cột đánh dấu: `status` 15 chỗ · KHÔNG có delivered/read_at/seen/consumed
```
🔑 Họ dùng **`status` trên bản ghi việc**, và **lease** cho phần tranh chấp — chứ không dùng cờ «đã đọc»
trên tin. Điều này khớp với cảnh báo tôi nêu: cờ `da_doc` trên tin là sai từ gốc.

### 2c. LobeHub — không lấy được gì cho bài này
```
Postgres + drizzle + 68 tệp lược đồ, dựng cho nhiều người dùng qua mạng.
Giao tiếp giữa các agent KHÔNG phải bài của họ ⇒ không có mẫu để học.
⇒ Bỏ LobeHub khỏi phần này. Nguồn học là Hermes và openclaw, cả hai đều ở trên máy.
```

## ③ ĐỀ XUẤT — lược đồ, và VÌ SAO từng chỗ

### 3a. Ba bảng, không hơn
```sql
-- MỘT tệp .db cho MỖI ĐỘI, không dùng chung một tệp cho cả công ty
--   ~/Operations/kenh/<ten-doi>.db      vd: aiboss-app-chat.db
--   ~/Operations/kenh/_tong-cong-ty.db  chỉ PM các đội + Tổng Giám Đốc ghi

CREATE TABLE tin (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,   -- thứ tự TUYỆT ĐỐI, không lệch như số dòng
  luc         TEXT NOT NULL,        -- ISO-8601 UTC, LẤY TỪ MÁY
  tu_ghe      TEXT NOT NULL,
  toi_ghe     TEXT NOT NULL,        -- danh sách ngăn bằng dấu phẩy, hoặc 'ca-doi'
  chu_de      TEXT NOT NULL,
  than        TEXT NOT NULL,
  can_tra_loi INTEGER DEFAULT 0     -- 1 = người gửi đang CHỜ hồi đáp
);
CREATE TABLE da_doc (               -- 🔴 trạng thái đọc thuộc NGƯỜI ĐỌC, KHÔNG thuộc tin
  ghe     TEXT NOT NULL,
  moc_id  INTEGER NOT NULL,         -- đã đọc tới tin số mấy — đúng kiểu last_event_id của Hermes
  luc     TEXT NOT NULL,
  PRIMARY KEY (ghe)
);
CREATE TABLE da_xu (                -- tin nào đã được TRẢ LỜI, khác hẳn «đã đọc»
  tin_id  INTEGER NOT NULL,
  ghe     TEXT NOT NULL,
  luc     TEXT NOT NULL,
  PRIMARY KEY (tin_id, ghe)
);
```
🔴 **Vì sao KHÔNG dùng một cột `da_doc` trên bảng `tin`:** một tin gửi bốn ghế; ghế A đọc xong đặt 1
thì B, C, D **không bao giờ thấy nữa** — mất tin vĩnh viễn và mất im lặng, tệ hơn hiện tại.
🔑 Tách `da_doc` (đã nhìn) khỏi `da_xu` (đã làm) — hai việc khác nhau, hôm nay ta đang lẫn.

### 3b. Câu truy vấn mà mọi ghế dùng — thay cho việc grep tệp
```sql
SELECT * FROM tin
WHERE id > (SELECT COALESCE(moc_id,0) FROM da_doc WHERE ghe = :toi)
  AND (toi_ghe LIKE '%'||:toi||'%' OR toi_ghe = 'ca-doi')
ORDER BY id;
-- đọc xong:  INSERT OR REPLACE INTO da_doc VALUES (:toi, :id_cuoi, :bay_gio);
```
📌 Ba bệnh biến mất cùng lúc, không cần thêm luật nào:
```
· «chỉ đọc tin cuối»            → không còn khái niệm «tin cuối», chỉ có id > mốc
· «tin chen lên trên bài mình»  → id là số tăng, không phụ thuộc vị trí trong tệp
· «bài của chính mình làm mốc»  → mốc là một con số riêng của từng ghế
```

### 3c. Ưu tiên AGENT đọc, không ưu tiên người đọc — theo đúng lệnh Owner
```
· Agent đọc bằng câu truy vấn ở trên, KHÔNG cần mở tệp.
· Owner cần xem thì có LỆNH SINH RA bản .md để đọc — sinh ra từ cơ sở dữ liệu, KHÔNG giữ song song.
  (giữ hai nguồn = hai bản trôi khỏi nhau, đúng thứ sổ bẫy đang cấm)
· KHÔNG chuyển lịch sử cũ sang. Owner đã chốt: tệp .md cũ để nguyên chỗ cũ, đọc khi cần tra.
  ⇒ cơ sở dữ liệu mới bắt đầu từ tin số 1, sạch, không mang rác.
```

## ④ LUẬT KÊNH MỚI — Owner chốt, ghi ra để không ai hiểu khác
```
kênh của ĐỘI  (aiboss-app-chat.db)     mọi ghế trong đội đọc + ghi thoải mái
kênh TỔNG CÔNG TY (_tong-cong-ty.db)   CHỈ PM của từng đội + Tổng Giám Đốc được ghi
                                       nội dung: thông báo cần đội KHÁC biết, hoặc cần TGĐ quyết
```
🔴 **Áp cho tôi trước tiên:** 66 tin tôi ghi lên kênh tổng công ty, phần lớn là trao đổi kỹ thuật
chỉ liên quan `claude-aiboss-app-pm`. Từ nay tôi ghi vào kênh đội; chỉ đưa lên kênh chung khi
việc chạm đội khác hoặc cần Tổng Giám Đốc quyết.

## ⑤ CÁC BƯỚC — làm nhỏ, mỗi bước tự đứng được
```
B1  dựng ~/Operations/kenh/aiboss-app-chat.db + 3 bảng + WAL   (đọc sqlite-wal.ts TRƯỚC KHI gõ)
B2  hai lệnh: ghi-tin.sh  và  doc-tin.sh  — chép là chạy, mọi ghế dùng chung
B3  ĐỘI APP dùng thử 1 ngày, kênh .md vẫn còn nguyên làm đường lui
B4  lệnh sinh bản .md cho Owner đọc
B5  đủ 1 ngày không mất tin ⇒ mở cho các đội khác; kênh .md cũ ĐÓNG BĂNG, không xoá
```

## ⑥ NGHIỆM THU — mỗi phép phải THẤT BẠI trên cách làm hiện tại
```
N1 tin gửi 3 ghế → cả 3 đều đọc được, ghế A đọc xong KHÔNG làm B mất tin
   (cách hiện tại: nếu ai đó thêm cờ da_doc chung thì trượt ngay)
N2 ghi 2 tin CÙNG LÚC từ 2 tiến trình → cả 2 còn nguyên, không đè nhau
   (cách hiện tại với .md: hai lệnh nối đuôi cùng lúc có thể trộn dòng)
N3 tin chen vào giữa lúc ghế đang gõ → vẫn đọc được, vì lọc theo id chứ không theo vị trí
   (cách hiện tại: ĐÃ TRƯỢT THẬT — bẫy ⑯ trong sổ)
N4 ghế mới toanh, chưa có mốc → đọc được TOÀN BỘ tin gửi cho nó, không sót
N5 đối chứng âm: hỏi tin của một ghế KHÔNG tồn tại → trả về 0 dòng, không lỗi
```

## ⑦ CHƯA ĐO — đừng lấp bằng suy luận
```
· nhiều tiến trình cùng ghi một .db: WAL đủ chưa, hay cần thêm hàng đợi — CHƯA đo trên máy này
· ghế chạy trong worktree có thấy .db không (đường dẫn tuyệt đối hay tương đối) — CHƯA đo
· bản .md sinh ra có cần cho từng đội hay một bản chung — CHƯA hỏi Owner
· 29 tệp kênh .md hiện có: cái nào còn sống, cái nào đóng băng được — CHƯA rà
```
📌 Bốn dòng trên là **việc ĐO**, chưa phải việc LÀM. Ai nhận thì đo trước, ghi số vào `DECISION_LOG.md`.

(ghi 30/08/2026 13:0x London · claude-phong-ban-pm — Owner giao nghiên cứu, tôi soạn)
