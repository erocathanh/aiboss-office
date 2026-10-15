# Báo cáo tuần dự án tư vấn mẫu (`weekly-project-report` — DỮ LIỆU MẪU GIẢ ĐỊNH)

> **Ghi chú:** Số liệu dưới đây là dữ liệu mẫu giả định, trích xuất kèm số dòng từ `inputs/20261013_weekly-funnel-metrics.csv` (dòng 1 là tiêu đề, dòng 2–6 là số liệu 5 tuần `W37`–`W41`) và `inputs/20261013_kickoff-meeting-notes.md`, không chứa thông tin định danh cá nhân (PII).

## 1. Thông tin chung
- **Mã dự án:** `Client-Alpha-B2B` (Dự án mẫu tư vấn thiết kế hệ thống & đào tạo quản trị dự án)
- **Kỳ báo cáo:** Tuần `2026-W41-SAMPLE` (CSV dòng 6 · Đánh giá luỹ kế 5 tuần từ `2026-W37-SAMPLE` đến `2026-W41-SAMPLE`, CSV dòng 2–6)
- **Nguồn dữ liệu đối chiếu:** `inputs/20261013_client-project-brief.md`, `inputs/20261013_weekly-funnel-metrics.csv` (dòng 2–6), `inputs/20261013_kickoff-meeting-notes.md`, `references/consulting-benchmark-sample.md`

## 2. Bảng tổng hợp số liệu tuần (Đối chiếu từ `inputs/`)
| Chỉ số | Số liệu tuần W41 (Mẫu · CSV dòng 6) | Tổng luỹ kế 5 tuần W37–W41 (Mẫu · CSV dòng 2–6) | Trạng thái so với ngưỡng (`references/`) |
|---|---|---|---|
| Lượt tải tài liệu chuyên môn | 195 (`CSV dòng 6`) | 855 (`CSV dòng 2–6`; 4 tuần đầu `dòng 2–5`: 660) | Giảm nhẹ 7,1% so với tuần W40 (từ 210 ở `dòng 5` xuống 195 ở `dòng 6`) |
| Số người tham dự hội thảo | 68 (34,9% lượt tải · `CSV dòng 6`) | 307 (35,9% lượt tải · `CSV dòng 2–6`) | Đạt ngưỡng chuẩn (30%–40%) |
| Số lịch tư vấn đặt mới | 14 (20,6% dự hội thảo; 7,2% lượt tải · `CSV dòng 6`) | 67 (21,8% dự hội thảo; tỷ lệ gộp 7,8% lượt tải · `CSV dòng 2–6`; 4 tuần đầu `dòng 2–5`: 53/660 = 8,0%) | Đạt ngưỡng chuẩn (18%–25% dự hội thảo) |
| Số hợp đồng dự án ký mới | 3 (`CSV dòng 6`) | 20 (`CSV dòng 2–6`; 4 tuần đầu `dòng 2–5`: 17) | CẢNH BÁO: Giảm 40% so với tuần W40 (từ 5 ở `dòng 5` xuống 3 ở `dòng 6`) |
| Số ca huỷ lịch hẹn (Tỷ lệ %) | 3 (21,4% lịch đặt · `CSV dòng 6`) | 7 (tỷ lệ gộp 10,4% lịch đặt · `CSV dòng 2–6`; 4 tuần đầu `dòng 2–5`: gộp 4/53 = 7,5%, trung bình cộng 4 tuần = 7,8%) | CẢNH BÁO: Vượt ngưỡng 10% ở tuần W41 (4 tuần đầu đều từ 6,3% đến 10,0%) |

## 3. Điểm nghẽn & Phương án xử lý
- **Điểm nghẽn phát hiện:** Trong 4 tuần đầu (`W37`–`W40`, `CSV dòng 2–5`), tỷ lệ huỷ lịch từng tuần lần lượt là 10,0%, 8,3%, 6,7%, 6,3% (tỷ lệ huỷ gộp 4/53 = 7,5%, trung bình cộng 4 tuần là 7,8%); riêng tuần `2026-W41-SAMPLE` (`CSV dòng 6`) tỷ lệ huỷ lịch tăng lên 21,4% (3/14 ca) do khung giờ chiều thứ Sáu trùng lịch họp giao ban của khách hàng dự án, kéo số hợp đồng ký mới giảm 40% so với tuần W40 (từ 5 xuống 3 hợp đồng).
- **Phương án đề xuất trình `owner`:**
  - Phương án A (Ưu tiên khuyến nghị): Mở thêm 2 khung giờ tư vấn vào sáng thứ Ba và sáng thứ Năm trên lịch đặt hẹn của giai đoạn 2.
  - Phương án B: Giữ nguyên khung giờ chiều thứ Sáu nhưng điều chỉnh quy trình xác nhận lịch hẹn sớm hơn 24 giờ (tin nhắn gửi khách hàng phải chờ `owner` duyệt).

## Ba chi tiết đã lược bỏ
- Lược bỏ bàn luận về màu sắc biểu đồ trên trang giới thiệu hội thảo vì chi tiết này không ảnh hưởng đến tỷ lệ huỷ lịch hẹn tuần W41.
- Lược bỏ bản gỡ băng lời thoại chi tiết của cuộc họp khởi động giai đoạn 2 vì các con số cốt lõi và nguyên nhân trùng lịch đã được tóm tắt đầy đủ ở mục 2 và mục 3.
- Lược bỏ danh sách câu hỏi phụ của từng nhóm thiết kế phía khách hàng vì báo cáo tuần chỉ tập trung vào quyết định điều chỉnh khung giờ tư vấn của `owner`.
