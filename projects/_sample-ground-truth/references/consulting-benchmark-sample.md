# Định chuẩn chuyển đổi dự án tư vấn mẫu (`consulting-benchmark-sample.md` — DỮ LIỆU MẪU GIẢ ĐỊNH)

> **Cảnh báo dữ liệu mẫu:** Tài liệu này là nguồn tham khảo giả định dùng riêng cho dự án mẫu `_sample-ground-truth`. Đường dẫn dưới đây là đường dẫn giả định (`.invalid` theo chuẩn RFC 2606), không trỏ tới trang web thật.

- **Đường dẫn tham khảo giả định:** `https://benchmark-sample.example.invalid/b2b-consulting-funnel-metrics-2026`
- **Các ngưỡng đối chiếu mẫu cho doanh nghiệp dịch vụ theo dự án (tư vấn, thiết kế, đào tạo):**
  1. **Tỷ lệ tham dự hội thảo chuyên đề:** Định chuẩn mẫu đạt từ `30%` đến `40%` trên tổng lượt tải tài liệu.
  2. **Tỷ lệ đặt lịch tư vấn 1-1:** Định chuẩn mẫu đạt từ `18%` đến `25%` trên số người tham dự hội thảo (tương đương khoảng `7%` đến `9%` trên tổng lượt tải tài liệu).
  3. **Ngưỡng cảnh báo về tỷ lệ huỷ lịch hẹn:** Nếu tỷ lệ huỷ lịch vượt quá `10%` tổng số lịch đặt trong tuần, ghế phải đánh dấu cảnh báo rõ trong báo cáo để trình `owner` điều chỉnh khung giờ.
  4. **Quy tắc trích dẫn và đối soát lược bỏ:** Con số đưa vào bản nháp trong `wip/` phải dẫn rõ dòng từ tệp CSV trong `inputs/` (ví dụ `CSV dòng 6`), không tự suy diễn; bản chốt trong `outputs/` phải có mục `## Ba chi tiết đã lược bỏ` kèm ít nhất 3 dòng giải thích có chữ `vì`.
