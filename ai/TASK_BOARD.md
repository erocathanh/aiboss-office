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
| P0-1 | Khoá quanh chu trình đọc-sửa-ghi sổ ô (`kho-phien.ts`), **có hạn dùng** | `claude-aiboss-app-exe` | MỞ | **Phép thử khoá kẹt bắt buộc**: giết tiến trình giữa lúc đang giữ khoá, lượt sau vẫn vào được. Thêm: hai tiến trình cùng sửa hai ô khác nhau, cả hai thay đổi đều còn |
| P0-2a | **Giữ yêu cầu khi ô BẬN, thử lại khi rảnh** (⛔ đánh rơi) | chưa giao | **ĐANG DUYỆT** v2.2 · 2 cửa | Rung ghế ĐANG chạy dở → xong lượt câu hỏi PHẢI tự tới, ⛔ cần rung lại · ĐC dương: rung ghế rảnh → tới ngay |
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
