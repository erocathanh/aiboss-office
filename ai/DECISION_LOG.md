# DECISION LOG — `aiboss-app-chat`

> Ghi **NỐI ĐUÔI**. Không sửa mục cũ — sai thì ghi mục mới đính chính và trỏ về mục cũ.
> Mỗi mục phải có: chốt gì · **số đo lúc chốt** · ai chốt · điều kiện mở lại.

---

## Q-001 · 30/08/2026 06:28 · Tên dự án Vercel — GIỮ NGUYÊN
**Chốt:** giữ `phong-ban-ai-mockup`, không đổi theo tên kho.
**Số đo lúc chốt:**
```
phong-ban-ai-mockup.vercel.app     → 200 · 11.983 byte
aiboss-app-chat-mockup.vercel.app  → 404 ·    107 byte
đối chứng âm, một tên bịa          → 404 ·    107 byte   ⇒ hai vỏ 404 giống nhau ⇒ cái 200 là trang thật
```
**Lý do:** địa chỉ công khai **sinh ra từ tên dự án**, đổi tên là địa chỉ cũ chết và không có chuyển hướng.
Đây là trang mẫu, loại người ta hay gửi đi, và không ai biết hiện có ai đang giữ đường dẫn đó.
Đổi lại chỉ được «tên nhìn cho khớp mắt»: kho nối với dự án bằng MÃ, không bằng tên.
**Ai chốt:** `claude-aiboss-app-pm` · `claude-phong-ban-pm` · `claude-aiboss-app-exe` — 3/3.
Owner đã trao quyền quyết cho team app («họ đồng ý là tôi đồng ý»).
**Việc kèm theo:** thêm một dòng chú vào `~/Operations/ha-tang/VERCEL-BAN-DO.md` cạnh dòng 368.
**Mở lại khi:** có tên miền riêng che chắn phía trước, lúc đó đổi tên không giết địa chỉ nào.

---

## Q-002 · 30/08/2026 06:24 · Chuyển trạng thái sang SQLite — CHƯA
**Chốt:** giữ JSON, chưa chuyển `.trang-thai/` sang cơ sở dữ liệu.
**Số đo lúc chốt:**
```
kho-phien.ts:43-48  ghi tệp tạm rồi đổi tên  ⇒ ĐÃ ghi nguyên tử, có sẵn chú thích giải thích
8 bản o-phien.json (1 sống + 7 sao lưu tay)  ⇒ 8/8 hợp lệ · 0 tệp hỏng · 0 tệp rỗng
đếm chỗ có khoá                              ⇒ 0
```
**Lý do:** ghi đã nguyên tử; không có bằng chứng mất dữ liệu; và hai ca hỏng thật hôm nay
(máy chủ mồ côi ghim đường dẫn cũ · va số hiệu trong tệp `.md`) thì cơ sở dữ liệu đều **không ngăn được**
— ca thứ nhất vẫn thành hai cơ sở dữ liệu ở hai đường dẫn.
**Một tiền đề bị lật:** ban đầu tưởng 7 tệp `.truoc-*` là triệu chứng sợ ghi đè. Đọc tên chúng ra
(`truoc-doi-o2`, `truoc-tra-o2`, `truoc-xep-o`…) thì đó là **sao lưu trước khi sửa tay**, đúng luật nhà.
Là kỷ luật, không phải bệnh — và không phải bằng chứng cho bệnh đang bàn.
**Ai chốt:** `claude-aiboss-app-pm` (PM của app).
**Mở lại khi:** đo được ít nhất **một ca mất bản cập nhật thật** — một ô biến khỏi sổ mà không ai xoá.
Lúc đó đọc `~/Development/openclaw/src/infra/sqlite-wal.ts` (82 dòng, có bài kiểm) TRƯỚC khi gõ dòng nào.

---

## Q-003 · 30/08/2026 06:36 · Đưa việc đánh thức ra dịch vụ ngoài (Railway) — KHÔNG, cho bài này
**Chốt:** không dùng dịch vụ ngoài để chữa việc «đóng tab thì các ô ngừng nói chuyện».
**Số đo lúc chốt:**
```
chay-agent.ts:188  spawn(claude …)  · tệp không có 'use client'  ⇒ tiến trình chạy PHÍA MÁY CHỦ
api/danh-thuc:38   xepHang() rồi return                          ⇒ cổng chỉ xếp hàng, không gọi ai
UngDung.tsx:1147   setInterval 5 giây + lọc tab ẩn               ⇒ TRÌNH DUYỆT là thứ bấm nút hộ
```
**Lý do:** đường vào không nghẽn (cổng đang trả 200); việc chạy bắt buộc ở máy Owner nên dịch vụ ngoài
không chạy hộ được; và chỗ nghẽn là **một quyết định trong mã** (`UngDung.tsx:1115` — máy chủ cố ý
không tự chạy vì sợ hai nơi cùng gọi một phiên). Dịch vụ ngoài đưa tin tới cửa rồi máy chủ vẫn đứng im.
**Thay bằng:** P0-1 + P0-2 — cùng một cái khoá, giải cả hai bệnh.
**Vẫn đúng chỗ cho bài khác:** Owner ở ngoài nhà muốn ra lệnh cho ghế → P3-1, làm sau P0.

---

## Q-004 · 30/08/2026 · Nơi để tài liệu AI của dự án
**Chốt:** `~/Projects/aiboss-app-chat/ai/`, khuôn theo `claude-master-app/ai/` và `youtube-modeling/ai/`.
**Ai chốt:** Owner.
