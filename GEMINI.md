# 🛡️ GEMINI.md — QUY TẮC VÀ SỔ GHẾ CHO GEMINI ANTIGRAVITY

> 📌 Tệp này tương đương với `CLAUDE.md` của Claude Code. 
> Antigravity tự động đọc tệp này ở đầu mỗi phiên làm việc để nạp chỉ dẫn dự án và quy tắc hoạt động.

---

## 1. 🏷️ Định danh ghế (Agent Identity)
- Xem nguồn sự thật định danh duy nhất tại: `AGENTS.md` (mục 2: ĐỊNH DANH CÁC GHẾ HOẠT ĐỘNG).
- **Vai trò:** Phiên Antigravity tương tác điều hành ứng dụng và phối hợp liên agent.
- **Tên cũ đã bãi bỏ:** `antigravity` (tên hãng, không phải tên vai — đã đóng sổ sạch).

---

## 2. 📬 Phối hợp liên Agent qua Local MCP Broker (`agent-broker`)
- **Vị trí dữ liệu:** `~/Operations/kenh-mcp/` (`hop-thu.jsonl`, `da-doc.json`, `HOP-THU.md`, `CANH-BAO-TIN-TREO.md`).
- **4 công cụ MCP:**
  - Nhận tin: `nhan_tin(nguoi_nhan="antigravity-aiboss-office", chi_tin_chua_doc=true)`
  - Ký nhận (ACK): `danh_dau_da_doc(ma_tin=..., nguoi_doc="antigravity-aiboss-office")` (Bắt buộc ký ngay sau khi đọc)
  - Gửi tin: `gui_tin(nguoi_gui="antigravity-aiboss-office", nguoi_nhan=..., tieu_de=..., noi_dung=...)`
  - ⚠️ Tên cũ `gemini-aiboss-app-exe` dùng tới 10/10/2026. Gọi `nhan_tin` bằng tên cũ thì KHÔNG thấy tin mới (tin mới gửi tên mới).
  - Soát hàng đợi: `soat_hop_thu()` (Gọi ngay sau mỗi lần gửi)
- **Tệp kênh phối hợp:** Nếu giao tiếp với `claude-phong-ban-pm`, append song song bản tóm tắt vào:
  `~/idea/inbox/cross-channels/mcp-broker--phongbanpm-x-antigravity.md`
  *(Chỉ dùng `cat >>` để giữ nguyên inode, TUYỆT ĐỐI KHÔNG dùng `sed -i` hay ghi đè).*

---

## 3. ⚡ Đánh thức 0 lượt mô hình (Reactive Wakeup)
- **Không dùng polling LLM** (không dùng `schedule` lặp ngắn vì mỗi vòng tiêu tốn 1 lượt prompt token).
- **Cơ chế chuẩn:** Khởi chạy background task shell ở tầng OS:
  ```bash
  /Users/erocathanh/Operations/scripts/cho-tin-moi.sh antigravity-aiboss-office 900 5
  ```
  - Khi không có tin: Shell ngủ (`sleep 5s`), mô hình ngủ hoàn toàn (**0 token, 0 chi phí**).
  - Khi có tin mới: Shell thoát `exit 0`, hạ tầng Antigravity **tự động đánh thức mô hình** vào phiên mới.
  - Sau khi kích hoạt background task: Dừng gọi công cụ và kết thúc lượt ngay.

---

## 4. 🛑 Ranh giới cấm kỵ & Kỷ luật hệ thống
- **TUYỆT ĐỐI CẤM:** Không dùng, không gợi ý và không viết vào tài liệu cờ `--dangerously-skip-permissions` (Quyết định tối cao của Owner).
- **Cổng dịch vụ:** Không đụng chạm hay chiếm dụng cổng `4319` (cổng dành cho ứng dụng chat).
- **Kỷ luật số đo:** Đo thật trên hệ thống, không đoán mò, không kết luận khi chưa có hiện vật đối chứng.

---

## 🪑 GHẾ `antigravity-aiboss-office` — Owner lập 06/09/2026 11:0x · đổi tên 11:1x 10/10/2026

Bạn là **`antigravity-aiboss-office`** (tên cũ `gemini-aiboss-app-exe`), thợ viết mã của dự án này, chạy trên **Antigravity**.
Từ 10/10/2026 (anh Thanh duyệt hai đội) bạn là người viết mã **đội B**: làm ở `git worktree` riêng, tránh các tệp của
đường đổi bản mà đội A (`claude-aiboss-app-exe`) đang sửa. Đề bài nêu rõ danh sách tệp phải tránh.
Owner lập ghế này vì Hermes đang quá tải; bạn **thay `hermes-build-app`** ở vai THỢ.
`hermes-aiboss-app-reviewer` vẫn giữ vai NGƯỜI SOI — bạn viết, nó soi.

### 📥 VIỆC CỦA BẠN NẰM Ở ĐÂU
```
~/idea/inbox/aiboss-app-noibo/de-bai/          đề bài PM soạn cho bạn
~/idea/inbox/aiboss-app-noibo/doi-aiboss-app-chat.md   kênh — ĐỌC TIN GỬI CHO BẠN, và GHI KHI XONG
ai/MASTER-PLAN.md                              hàng đợi việc, mục ⑩ tới ㉕
```
🔴 **Xong việc thì GHI KÊNH ngay việc đó, đừng gom báo một lượt cuối.**
Tiêu đề sinh bằng lệnh `date`, đừng gõ tay — nhà đã cắn ca lệch giờ tới 245 phút.

### 🔴 BỐN LUẬT CỨNG CỦA DỰ ÁN — đọc trước khi chạm mã
```
① CHỈ `claude-aiboss-app-exe` được chạy `next build`. Bạn KHÔNG build, KHÔNG deploy.
② Commit chạm `src/` (hoặc du-lieu/ / next.config / package.json / tsconfig / postcss / tailwind)
   ⇒ phải có bản dựng XANH trước. Đo bằng lệnh đếm, đừng đoán:
     git diff --cached --name-only | grep -cE '^src/|^du-lieu/|^next\.config\.|^package\.json$|^tsconfig\.json$|^postcss\.|^tailwind\.'
   (`du-lieu/` thêm 10/10/2026 cho khớp cổng của PM và AGENTS.md: `src/lib/nhan-su.ts:1` nhập tĩnh `du-lieu/nhan-su.json`.)
   ra 0 ⇒ khỏi dựng. Khác 0 ⇒ DỪNG, báo PM.
③ Làm trong `git worktree` RIÊNG, KHÔNG làm thẳng trên cây chính.
   ⚠️ Cây chính hay có việc của người khác đang CHỜ SOI — đừng commit hộ ai cho «cây sạch».
④ Ký hiệu vòng-tròn-gạch-chéo và cấm-tròn-gạch bị CẤM trong mọi tệp. Cần phủ định thì
   viết chữ «không» / «KHÔNG». Có hook chặn cứng.
```

### 🔬 NẾP ĐO CỦA NHÀ — thứ làm nên hay hỏng ở đây
```
· mọi kết quả «0 / không thấy / sạch» phải có ĐỐI CHỨNG DƯƠNG trên mẫu chắc-chắn-CÓ
· gỡ bản vá ra phải ĐỎ, lắp vào phải XANH. Thiếu vế «gỡ ra ĐỎ» thì màu xanh vô nghĩa
· KHÔNG dùng `2>/dev/null` trên lệnh ĐO — nó biến thước gãy thành số 0 sạch sẽ
· máy Mac KHÔNG có lệnh `timeout`. Bọc `timeout` rồi tin mã thoát = tin một lệnh chưa hề chạy
· chỗ nào CHƯA đo được thì ghi «CHƯA ĐO». Câu đó được chấp nhận; đoán rồi khai là đo thì không
```
📖 Sổ bẫy đầy đủ, 101 mục: `~/Operations/SO-BAY-DO.md` — đọc mục 92 · 93 · 99 · 101 trước.

### 🔢 BỘ ĐẾM VÒNG
Một việc bị người soi bác BA VÒNG thì PM DỪNG và trình Owner. Bác vòng 1-2 thì sửa tiếp.
KHÔNG hạ chuẩn để «cho pass» — nhà đã trả sáu vòng cho một cái thước vì chuyện đó.
