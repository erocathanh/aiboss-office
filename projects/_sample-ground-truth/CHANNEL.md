# Kênh dự án mẫu (`CHANNEL.md` — DỮ LIỆU MẪU GIẢ ĐỊNH, CHỈ NỐI THÊM)

### [2026-10-13T08:00:00Z · 09:00 London] FROM: marketing-lead / TO: content-writer — Giao soạn báo cáo tuần dự án tư vấn mẫu
- [2026-10-13 09:00] BƯỚC 1 · xong · không · Ghế marketing-lead tiếp nhận 3 tệp dữ liệu mẫu trong inputs/ và giao content-writer đối chiếu với references/consulting-benchmark-sample.md để lập báo cáo theo templates/weekly-project-report-template.md.

### [2026-10-13T10:15:00Z · 11:15 London] FROM: content-writer / TO: reviewer, marketing-lead — Nộp bản nháp báo cáo tuần v01 kèm mã băm
- [2026-10-13 11:15] BƯỚC 2 · xong · wip/weekly-project-report_v01_20261013.md · Đã hoàn thành bản nháp v01 (md5 `a0e080128aeb8e84ecc86c444a917b7a`) dẫn đúng dòng CSV mẫu, có đủ mục Ba chi tiết đã lược bỏ và báo điểm nghẽn tỷ lệ huỷ lịch tuần W41 vượt ngưỡng 10% cho marketing-lead cùng reviewer.

### [2026-10-13T13:00:00Z · 14:00 London] FROM: reviewer / TO: marketing-lead — Nghiệm thu độc lập ĐẠT bản nháp v01
- [2026-10-13 14:00] BƯỚC 3 · xong · không · Đã đối chiếu độc lập wip/weekly-project-report_v01_20261013.md (md5 `a0e080128aeb8e84ecc86c444a917b7a`) với 3 tệp trong inputs/ và references/: số liệu khớp dòng 2–6 CSV, đủ mục Ba chi tiết đã lược bỏ (3 dòng có chữ vì), 0 thông tin định danh cá nhân (PII) — kết luận ĐẠT.

### [2026-10-13T13:45:00Z · 14:45 London] FROM: marketing-lead / TO: owner — Trình 2 phương án xử lý điểm nghẽn và xin lệnh chốt
- [2026-10-13 14:45] BƯỚC 4 · chờ duyệt · wip/weekly-project-report_v01_20261013.md · Bản nháp v01 (md5 `a0e080128aeb8e84ecc86c444a917b7a`) đã qua reviewer nghiệm thu ĐẠT; trình owner chọn 1 trong 2 phương án (Phương án A: mở thêm khung giờ sáng thứ Ba và thứ Năm; Phương án B: điều chỉnh giờ nhắc lịch thứ Sáu) và ra lệnh chốt.

### [2026-10-13T14:30:00Z · 15:30 London] FROM: owner / TO: marketing-lead, content-writer — Quyết định chọn Phương án A và ra lệnh trực tiếp: «Chốt bản này»
- Người chủ (`owner`) trực tiếp ra lệnh trong phiên: chọn Phương án A cho giai đoạn 2 và **«Chốt bản này»** đối với `wip/weekly-project-report_v01_20261013.md` (md5 `a0e080128aeb8e84ecc86c444a917b7a`).

### [2026-10-13T14:35:00Z · 15:35 London] FROM: content-writer / TO: owner, marketing-lead — Đã tạo bản _final tại wip/ và xuất bản chốt vào outputs/
- [2026-10-13 15:35] BƯỚC 5 · xong · outputs/weekly-project-report_final.md · Thực hiện lệnh chốt của owner: đã tạo wip/weekly-project-report_final.md, kiểm tra outputs/ chưa trùng tên, ghi bằng Write (không dùng cp) bản chốt vào outputs/weekly-project-report_final.md (md5 `a0e080128aeb8e84ecc86c444a917b7a`) và báo đường dẫn thư mục `<office-root>/projects/_sample-ground-truth/outputs/` để owner mở ngay.

### [2026-10-13T14:40:00Z · 15:40 London] FROM: marketing-lead / TO: owner — Kiểm tra đường dẫn báo cáo bản chốt
- [2026-10-13 15:40] BƯỚC 6 · xong · không · Đã kiểm tra tệp outputs/weekly-project-report_final.md (md5 `a0e080128aeb8e84ecc86c444a917b7a`) có mặt tại đường dẫn báo cáo `<office-root>/projects/_sample-ground-truth/outputs/` và giữ nguyên bản nháp trong wip/.
