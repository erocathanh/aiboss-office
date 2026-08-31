# TASK BOARD — `aiboss-app-chat`

> Bảng việc. Mỗi phiên AI đọc `ai/MASTER-PLAN.md` TRƯỚC tệp này.
> 📅 Dựng 30/08/2026 · giữ bởi `claude-aiboss-app-pm`.

## Ký hiệu
- `MỞ` chưa ai nhận · `ĐANG` có người làm · `CHẶN` thiếu quyết định hoặc thiếu việc trước
- `XONG` đã đo bằng đúng phép ghi ở cột nghiệm thu — **lời khai không tính**

## Luật của bảng này
1. **Nghiệm thu phải là PHÉP ĐO chạy được**, không phải câu «đã xong». Cột cuối là hợp đồng.
2. Mọi phép đo ra «0» hoặc «sạch» phải kèm **đối chứng dương** (đo thứ chắc chắn có bằng đúng thước đó).
3. Nhận việc thì mở **worktree riêng** (MASTER-PLAN mục 7), đừng sửa thẳng trên main.
4. Ghi `ĐANG` kèm tên ghế ngay khi bắt tay, để người khác không giẫm.

---

## P0 — nền, làm trước mọi thứ khác

| Mã | Việc | Ai | Trạng thái | Nghiệm thu tối thiểu |
|---|---|---|---|---|
| S1 | **Mẩu chết thì phải KÊU** — hết hạn/thất bại chưa tới đích ⇒ ghi 1 dòng lên kênh + ghi sổ đếm theo **khuôn `ai/S1-KHUON-SO-DEM.md`** (đường dẫn + trường + 6 cửa đã chốt ở đó) (①⛔poller ②tab ẩn ③quá hạn ④claim-rồi-bỏ ⑤đổi ghế ⑥2 máy chủ) | `claude-aiboss-app-exe` | **MỞ — LÀM NGAY** | Ép 1 mẩu hết hạn → kênh PHẢI có đúng 1 dòng, có `ma`+cửa · ĐC âm: mẩu tới đích bình thường ⇒ ⛔ ghi dòng nào |
| S2 | **Tệp tạm mang pid** `${TEP}.${process.pid}.${Date.now()}.tam` ở `kho-phien.ts:46` + `kho-danh-thuc.ts:70` | `claude-aiboss-app-exe` | **MỞ — LÀM NGAY** | grep `${TEP}.tam` → 0 · ĐC dương: grep `.tam` vẫn > 0 · chạy 2 máy chủ ⇒ ⛔ tệp tạm nào bị bên kia rename |
| S3 | `/nhan` trả thêm `ma_nhan_su` (nay `route.ts:29-32` ⛔ trả ⇒ client ⛔ so được ghế) | `claude-aiboss-app-exe` | **MỞ — LÀM NGAY** | Gọi `/nhan` → thân trả về CÓ khoá `ma_nhan_su` · ĐC âm: khoá bịa ⇒ ⛔ có |
| G3a | **BƯỚC 1 — Giao diện «Quản Lý Trường», 5 ghế** (⛔ làm gì thêm). Owner CHỐT 30/08: dùng ĐÚNG 5 mã phiên đã đưa, dù chúng mang danh tính cũ. Đề bài: `ai/DE-BAI-giao-dien-3-quan-ly-truong.md` | `claude-aiboss-app-exe` | **MỞ — LÀM NGAY** | T1 menu có mục thứ 4 · T2 ô 2..6 đúng 5 vai, ô 1 giữ boss · **T3 mở ô 2 phải TÌM THẤY chuỗi `claude-bos-funnel-pm-r2`** (⛔ đòi đủ 103.897 dòng — fork ⛔ mang đủ) · ĐC âm: ghế mới toanh ⇒ ⛔ tìm thấy chuỗi đó |
| G3b | Bước 2 — bấm «information» ở ghế ⇒ hiện `CLAUDE.md` của ghế đó. 🔒 **CHỈ ĐỌC — Owner BỎ nút «chỉnh sửa» ngày 30/08**: *«không nên cho sửa CLAUDE.md của ghế trên web, nguy hiểm, chỉ đọc thôi»*. Mở lại vế SỬA phải xin Owner LẦN NỮA. Chi tiết + 3 lý do: `~/idea/inbox/phong-ban-ai-app/KE-HOACH-HO-SO-GHE-CHI-DOC.md` | chưa giao | **HOÃN — Owner: «chờ thời điểm làm thôi»** | Mở hồ sơ một ghế → thấy nội dung CLAUDE.md thật của ĐÚNG ghế đó (đối chứng: đổi sang ghế khác thì nội dung phải ĐỔI) · KHÔNG có ô soạn, KHÔNG có nút ghi · đối chứng âm: ghế KHÔNG có CLAUDE.md phải báo rõ, KHÔNG hiện tệp của ghế khác |
| S0 | 🔴 **KHỞI ĐỘNG LẠI MÁY CHỦ để S1 bắt đầu chạy** — pid 16624 dựng 29/08 20:55, GIÀ HƠN commit 31a3dbb (30/08 09:18) 12,5 giờ ⇒ đang chạy bản CŨ ⇒ sổ đếm 0 dòng ⇒ **đồng hồ 1 tuần CHƯA chạy** | Owner quyết | **XONG 30/08 09:25:03** · pid 51256 | Sau restart: `ls ~/Operations/dem-cua-mat-tin.jsonl` phải xuất hiện khi có ca mất tin đầu tiên · `ps -o lstart -p <pid mới>` phải MỚI hơn 31a3dbb |
| S4 | 🗓 **06/09/2026 — ĐỌC SỐ S1 rồi mới chốt v3 hay P0-2b lên trước** (⛔ chốt bằng cảm tính) | `claude-aiboss-app-pm` | **HẸN 06/09** · đồng hồ CHẠY TỪ 30/08 09:25:03 | Chạy `bash ai/do-lai-06-09.sh` → in bảng đếm theo CỬA · quyết định ghi vào `DECISION_LOG.md` cùng ngày · ĐC dương: tổng các cửa = tổng mẩu ⛔ tới đích |
| P0-1 | Khoá quanh chu trình đọc-sửa-ghi sổ ô (`kho-phien.ts`), **có hạn dùng** | `claude-aiboss-app-exe` | MỞ | **Phép thử khoá kẹt bắt buộc**: giết tiến trình giữa lúc đang giữ khoá, lượt sau vẫn vào được. Thêm: hai tiến trình cùng sửa hai ô khác nhau, cả hai thay đổi đều còn |
| P0-2a | **Giữ yêu cầu khi ô BẬN, thử lại khi rảnh** (⛔ đánh rơi) | chưa giao | **MỞ — LÀM NGAY** (Owner gỡ chốt 09:13: *«tôi bảo làm là làm đi nhé, đo tới đo lui rồi không làm thì sao biết được kết quả. Họ làm được mình cũng làm được, sai thì lại điều chỉnh sau»*) · Hermes chạy SONG SONG, KHÔNG chặn trước | Rung ghế ĐANG chạy dở → xong lượt câu hỏi PHẢI tự tới, ⛔ cần rung lại · ĐC dương: rung ghế rảnh → tới ngay |
| P0-2b | Máy chủ tự chạy lượt khi ⛔ ai nhặt (bỏ phụ thuộc trình duyệt) | chưa giao | CHẶN bởi P0-1 | **ĐÓNG HẲN trình duyệt**, rung một ghế → mtime `.jsonl` ghế đó PHẢI đổi · ĐC dương ghế đang chạy · ĐC âm ghế bịa → 404 |
| P0-3 | Sửa `README.md:11` (đường không tồn tại) | `claude-aiboss-app-exe` | **XONG** 30/08 07:08 | `test -d` đường mới ra CÓ · đối chứng âm một đường bịa ra KHÔNG · dòng 34·73·121 giữ nguyên (vùng cách ly đang sống) |
| P0-4 | **Cổng TỰ NỐI đường-về vào mỗi lần gọi dậy**: ai gọi · gọi cho ai · «Owner sẽ KHÔNG đọc ở ô chat của bạn» | chưa giao | **MỞ — ⛔ bị chặn** | Rung một ghế từ ghế khác → câu hiện ra trong ô người ta phải CHỨA đủ 3 dòng · ĐC âm: Owner tự gõ thì ⛔ nối (⛔ ai gọi Owner về đâu) |

## P1 — bốn thứ học từ LobeHub

| Mã | Việc | Ai | Trạng thái | Nghiệm thu tối thiểu |
|---|---|---|---|---|
| P1-1 | Bảng đo mức dùng theo ghế | chưa giao | MỞ | Mở bảng thấy số của từng ghế trong 24 giờ, **tách riêng phần đọc lại và phần mới**. Đối chứng: cộng tay từ bản ghi một ghế, lệch dưới 5% |
| P1-2 | Đường dẫn đích danh tới (ghế + chủ đề) | chưa giao | MỞ | Dán một đường vào trình duyệt, mở đúng ghế đúng chủ đề. Đối chứng âm: đường trỏ ghế không tồn tại phải báo rõ, không mở nhầm ghế khác |
| P1-3 | Chia nhỏ `UngDung.tsx` (2.015 dòng) | chưa giao | MỞ | Sau khi chia, tệp lớn nhất dưới 600 dòng · app vẫn chạy (200 + đối chứng âm 404) · **hai người sửa hai tệp khác nhau không đụng nhau** |
| P1-4 | Quyền theo từng ghế | chưa giao | CHẶN — cần Owner chốt ghế nào được gì | Ghế bị hạn chế thử một việc ngoài quyền phải bị chặn; ghế đủ quyền làm việc đó vẫn chạy (đối chứng dương) |

## P2 — dọn nhà

| Mã | Việc | Ai | Trạng thái | Nghiệm thu tối thiểu |
|---|---|---|---|---|
| P2-1 | Chia hội thoại theo chủ đề trong một ghế | chưa giao | MỞ | Tạo hai chủ đề, mỗi bên giữ riêng lịch sử; xoá một bên không đụng bên kia |
| P2-2 | Nếp đặt tên cho bản sao lưu tay `.truoc-*` | chưa giao | MỞ | Có nếp ghi rõ, và một lệnh liệt kê ra được bản nào của việc nào |

## P3 — điều khiển từ xa (đừng trộn vào P0)

| Mã | Việc | Ai | Trạng thái | Nghiệm thu tối thiểu |
|---|---|---|---|---|
| P3-1 | Cửa ngoài internet để Owner ra lệnh khi không ở trước máy | chưa giao | CHẶN bởi P0 | Soi bảo mật TRƯỚC khi mở: đây là app có quyền như terminal. Không có bản soi thì không mở |

---

## Việc ĐÃ ĐÓNG hôm nay (30/08/2026)

| Mã | Việc | Kết |
|---|---|---|
| — | Tên dự án Vercel: giữ hay đổi | **GIỮ** `phong-ban-ai-mockup` · 3/3 phiếu · xem `DECISION_LOG.md` |
| — | Chuyển `.trang-thai` sang SQLite | **CHƯA chuyển** · có ngưỡng mở lại · xem `DECISION_LOG.md` |
| P0-3 | Sửa `README.md:11` | **XONG** · commit `d6eeedb` · local=remote · nghiệm thu ĐỘC LẬP bởi `claude-aiboss-app-pm` trên **bản đã commit** (⛔ bản trên đĩa): đường mới `test -d` ra CÓ · đối chứng âm đường bịa ra KHÔNG · diff đúng 1 dòng · ba dòng `/Users/Shared/phong-ban-ai-ws` (34·73·121) đếm 3 trước = 3 sau |
| — | Dời `~/Projects/phong-ban-ai` (2 tệp) | chờ Owner chốt · cách làm 5 bước đã có, bước lùi là `mv` ngược |

## P5 — kênh giao tiếp sang SQLite (Owner giao 30/08, nghiên cứu xong)

| Mã | Việc | Ai | Trạng thái | Nghiệm thu tối thiểu |
|---|---|---|---|---|
| P5-0 | Đọc `ai/NGHIEN-CUU-kenh-sqlite.md`, sửa chỗ sai, xếp lịch | `claude-aiboss-app-pm` | MỞ | có một dòng chốt trên kênh đội: nhận hay sửa gì |
| P5-1 | Dựng `~/Operations/kenh/aiboss-app-chat.db` + 3 bảng + WAL | chưa giao | CHẶN bởi P5-0 | `PRAGMA journal_mode` trả `wal`; đối chứng âm: hỏi bảng không tồn tại phải báo lỗi rõ |
| P5-2 | Hai lệnh `ghi-tin.sh` / `doc-tin.sh` dùng chung mọi ghế | chưa giao | CHẶN bởi P5-1 | ghế mới toanh chưa có mốc đọc được TOÀN BỘ tin gửi cho nó, không sót |
| P5-3 | Đội app dùng thử 1 ngày, kênh `.md` giữ làm đường lui | chưa giao | CHẶN bởi P5-2 | 1 ngày không mất tin nào; so số tin ghi vào với số tin đọc ra |
| P5-4 | Lệnh sinh bản `.md` cho Owner đọc | chưa giao | CHẶN bởi P5-2 | bản sinh ra khớp nội dung cơ sở dữ liệu; **không** giữ hai nguồn song song |

⚠️ **P5 xếp SAU heartbeat.** Owner đặt ưu tiên số 1 là «tắt trình duyệt vẫn chạy việc»; P5 là việc
lâu dài, không được chen lên trước. Ghi ra đây để không ai xếp nhầm thứ tự.

📡 **Luật kênh mới (Owner chốt 30/08):** trao đổi nội bộ đội ghi ở
`~/idea/inbox/phong-ban-ai-boss/doi-aiboss-app-chat.md`. Chỉ **PM của đội** mới ghi lên `BOSS-CHANNEL.md`,
và chỉ khi việc chạm đội khác hoặc cần Tổng Giám Đốc quyết.
Số đo lúc chốt: 138/252 tin trên kênh tổng công ty là trao đổi riêng của đội app (55%).

(ghi 30/08/2026 13:0x London · claude-phong-ban-pm — Owner giao, tôi soạn plan và thêm mục này)
