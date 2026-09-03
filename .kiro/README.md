# `.kiro/` — cổng đặc tả của kho `aiboss-app-chat`

Bật ngày 03/09/2026 theo lệnh Owner (đội áp dụng thử, `claude-phong-ban-pm` mang số về).
Thợ bật: `claude-aiboss-app-exe`. Đề bài: kênh đội tin 19:05.

## 🔴 VÌ SAO TỆP NÀY TỒN TẠI — nó KHÔNG phải tài liệu trang trí

**Git KHÔNG theo dõi thư mục rỗng.** Nếu `.kiro/` chỉ được tạo bằng `mkdir` suông thì nó
CHỈ có ở cây chính; **mọi worktree sinh sau sẽ RA ĐỜI KHÔNG CÓ CỔNG**.

Mà đội này làm việc bằng worktree song song (M1a vừa chạy đua hai worktree). Bật kiểu đó
thì chỉ số «đã bật» lên 1, còn chỉ số «cổng có chặn được gì không» đứng 0 — và **số 0 ấy
nói dối**, y như cái chốt ba tháng không nổ mà đội vừa mổ hôm nay.

⇒ Thư mục này phải mang **ít nhất một tệp được git theo dõi**. Tệp đó là tệp này.
📌 Đừng xoá nó để «cho gọn». Xoá là tắt cổng ở mọi worktree tương lai, và tắt trong im lặng.

## 📏 CỔNG HOẠT ĐỘNG THẾ NÀO — đo từ mã, không phải đoán

`~/Development/kiro-for-eroca/hooks/lib/gate_enforce.py`, chạy ở móc `PreToolUse` cho `Write|Edit`:

```
không tìm thấy .kiro/ đi ngược lên từ ĐƯỜNG TỆP   → cho qua   (dòng 50-52)
ghi vào trong .kiro/**                            → cho qua   (55-56)
tệp .md                                           → cho qua   (57-58)   docs không phải source
KHÔNG có .kiro/specs/                             → cho qua   (60-62)
có specs/ nhưng KHÔNG spec nào chưa-duyệt         → cho qua   (80-81)
có spec active mà approvals.tasks.approved != true → CHẶN, mã 2 (90-95)
```

## ✅ TRẠNG THÁI HÔM NAY: `specs/` RỖNG ⇒ CỔNG IM, KHÔNG CHẶN AI

Bật cổng KHÔNG có nghĩa là bắt đầu chặn. Đặc tả là chuyện sau, và là chuyện của Owner/PM.
Ai thêm đặc tả đầu tiên thì từ lúc ấy cổng mới có việc để làm.

⚠️ `.kiro/.gate-enforce.log` do cổng tự ghi khi nó chặn — đã cho vào `.gitignore`,
đừng commit nó.
