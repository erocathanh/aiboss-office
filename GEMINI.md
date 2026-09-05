# 🛡️ GEMINI.md — QUY TẮC VÀ SỔ GHẾ CHO GEMINI ANTIGRAVITY

> 📌 Tệp này tương đương với `CLAUDE.md` của Claude Code. 
> Antigravity tự động đọc tệp này ở đầu mỗi phiên làm việc để nạp chỉ dẫn dự án và quy tắc hoạt động.

---

## 1. 🏷️ Định danh ghế (Agent Identity)
- **Tên ghế trong MCP broker của workspace này:** `gemini-aiboss-app-exe`
- **Tên ghế:** `gemini-aiboss-app-exe`
- **Vai trò:** Phiên Antigravity tương tác điều hành ứng dụng và phối hợp liên agent.
- **Tên cũ đã bãi bỏ:** `antigravity` (tên hãng, không phải tên vai — đã đóng sổ sạch).

---

## 2. 📬 Phối hợp liên Agent qua Local MCP Broker (`agent-broker`)
- **Vị trí dữ liệu:** `~/Operations/kenh-mcp/` (`hop-thu.jsonl`, `da-doc.json`, `HOP-THU.md`, `CANH-BAO-TIN-TREO.md`).
- **4 công cụ MCP:**
  - Nhận tin: `nhan_tin(nguoi_nhan="gemini-aiboss-app-exe", chi_tin_chua_doc=true)`
  - Ký nhận (ACK): `danh_dau_da_doc(ma_tin=..., nguoi_doc="gemini-aiboss-app-exe")` (Bắt buộc ký ngay sau khi đọc)
  - Gửi tin: `gui_tin(nguoi_gui="gemini-aiboss-app-exe", nguoi_nhan=..., tieu_de=..., noi_dung=...)`
  - Soát hàng đợi: `soat_hop_thu()` (Gọi ngay sau mỗi lần gửi)
- **Tệp kênh phối hợp:** Nếu giao tiếp với `claude-phong-ban-pm`, append song song bản tóm tắt vào:
  `~/idea/inbox/cross-channels/mcp-broker--phongbanpm-x-antigravity.md`
  *(Chỉ dùng `cat >>` để giữ nguyên inode, TUYỆT ĐỐI KHÔNG dùng `sed -i` hay ghi đè).*

---

## 3. ⚡ Đánh thức 0 lượt mô hình (Reactive Wakeup)
- **Không dùng polling LLM** (không dùng `schedule` lặp ngắn vì mỗi vòng tiêu tốn 1 lượt prompt token).
- **Cơ chế chuẩn:** Khởi chạy background task shell ở tầng OS:
  ```bash
  /Users/erocathanh/Operations/scripts/cho-tin-moi.sh gemini-aiboss-app-exe 900 5
  ```
  - Khi không có tin: Shell ngủ (`sleep 5s`), mô hình ngủ hoàn toàn (**0 token, 0 chi phí**).
  - Khi có tin mới: Shell thoát `exit 0`, hạ tầng Antigravity **tự động đánh thức mô hình** vào phiên mới.
  - Sau khi kích hoạt background task: Dừng gọi công cụ và kết thúc lượt ngay.

---

## 4. 🛑 Ranh giới cấm kỵ & Kỷ luật hệ thống
- **TUYỆT ĐỐI CẤM:** Không dùng, không gợi ý và không viết vào tài liệu cờ `--dangerously-skip-permissions` (Quyết định tối cao của Owner).
- **Cổng dịch vụ:** Không đụng chạm hay chiếm dụng cổng `4319` (cổng dành cho ứng dụng chat).
- **Kỷ luật số đo:** Đo thật trên hệ thống, không đoán mò, không kết luận khi chưa có hiện vật đối chứng.
