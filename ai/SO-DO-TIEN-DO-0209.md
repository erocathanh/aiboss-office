# Sơ đồ tiến độ `aiboss-app-chat` — đo 02/09/2026 18:3x

> Mọi ô dưới đây là **số đo tại nguồn lúc 18:3x**, không phải nhãn chép lại từ kế hoạch.
> Người đo: `claude-aiboss-app-pm`. Cách đo ghi ngay cạnh từng dòng để ai cũng chạy lại được.

## ① TEAM ĐANG LÀM GÌ — 18:33

| Ghế | Vai | Trạng thái đo được |
|---|---|---|
| `claude-aiboss-app-pm` | PM — giữ sổ, giao việc, nghiệm thu | đang chạy |
| `claude-aiboss-app-exe` | thợ — viết mã, người DUY NHẤT được `next build` | **rảnh 51 phút** (im từ 17:42) |
| `claude-phong-ban-pm` | 🔬 research (Owner đổi vai 02/09) | đang chạy |
| `hermes-aiboss-app-reviewer` | 🛡 người soi DUY NHẤT (Owner chốt 02/09) | 2 tiến trình sống |

```
máy chủ   pid 73404 · khởi 17:34:30 · đang phục vụ bản mới
kho       HEAD 639a62e · cây bẩn 2 mục (README.bak cố ý + MASTER-PLAN đang sửa)
```

## ② TA ĐANG Ở ĐÂU — bốn tầng việc của kế hoạch, ĐO LẠI TỪNG MỤC

### P0 — nền, làm trước mọi thứ
| Mục | Trạng thái | Cách đo |
|---|---|---|
| **P0-1** khoá quanh đọc-sửa-ghi sổ ô | 🔴 **CHƯA** | 11 tệp chạm `o-phien`; tìm `flock/.lock/mutex` ⇒ **0 tệp**. Ghi bằng `writeFileSync` qua tệp tạm, KHÔNG có khoá |
| **P0-2** máy chủ TỰ chạy lượt, bỏ phụ thuộc trình duyệt | 🔴 **CHƯA** | `api/danh-thuc/route.ts` có **0** lời gọi chạy thật ⇒ chuông vẫn cần TRÌNH DUYỆT nhặt |
| **P0-3** sửa `README.md:11` | 🟢 **XONG** | dòng 11 nay trỏ đúng `~/Projects/aiboss-app-chat` |

⚠️ Kế hoạch ghi: **P0-1 và P0-2 phải cùng một khoá.** Làm P0-2 khi chưa có khoá là đâm vào đúng chỗ đang sợ.
📌 P0-2 chính là câu Owner hỏi 02/09 ~12:50 — *«có mắt canh riêng, có nhịp tim riêng rồi, sao vẫn phải mở trình duyệt gõ làm tiếp đi?»* (mục 4y).

### P1 — bốn thứ học từ LobeHub
| Mục | Trạng thái |
|---|---|
| **P1-1** bảng đo mức dùng theo ghế (đắt nhất — nó là TIỀN) | 🔴 chưa |
| **P1-2** đường dẫn đích danh tới ghế + chủ đề | 🔴 chưa |
| **P1-3** chia nhỏ `UngDung.tsx` | 🔴 **ĐANG ĐI LÙI** — xem ③ |
| **P1-4** quyền theo từng ghế | 🔴 chưa |

### P2 · P2b · P3
```
P2-1 chia hội thoại theo chủ đề        🔴 chưa
P2-2 gom bảy tệp sao-lưu-tay .truoc-*  🔴 chưa
P2-3 mốc giờ đầy đủ trong khung chat   🔴 chưa · ⚠️ CÒN MỘT CÂU PHẢI HỎI OWNER: «hh:ss» là gõ nhanh
                                          của «hh:mm» hay Owner thật sự muốn GIÂY?
P2-4 hồ sơ ghế chỉ đọc                 🔴 chưa
P3-1 cửa ngoài internet                🔴 chưa (cố ý — làm P0 trước thì P3 nhẹ hẳn)
```

### Ba mốc nghiệm thu của cả plan
```
M1  đóng tab trình duyệt, hai ghế vẫn nhắn được cho nhau    ⇒ CHƯA (cần P0-1 + P0-2)
M2  mở bảng đo mức dùng, thấy số từng ghế trong 24 giờ      ⇒ CHƯA (cần P1-1)
M3  hai người sửa hai việc cùng lúc, không ai chờ ai        ⇒ CHƯA (cần P1-3 + luật worktree)
```
🔴 **Chưa mốc nào chạm tới.**

## ③ SỐ ĐÁNG BÁO ĐỘNG NHẤT — mục «chia nhỏ tệp» đang chạy NGƯỢC

```
kế hoạch ghi          2.015 dòng
31/08 16:19  5c57131  2.780
31/08 21:14  218a918  2.984
01/09 21:18  6fb0ac0  3.128
02/09 17:27  c7f1131  3.337   ⇐ hôm nay
```
📈 **+65% so với con số trong kế hoạch · +20% trong hai ngày gần nhất.**
🔑 P1-3 là **điều kiện để hai người làm song song** (mốc M3). Mỗi ngày nó nằm hàng đợi thì cái giá phải trả
để chia nhỏ lại **tăng thêm**, và số người có thể làm song song vẫn là MỘT.
📌 Đây là món nợ **tự lớn lên**: mọi bản vá đều đi qua tệp này, nên hoãn nó KHÔNG phải giữ nguyên hiện trạng.

## ④ VẬY HÔM NAY 02/09 CẢ ĐỘI LÀM GÌ — nếu lộ trình không nhích?

Toàn bộ ngày đi vào **tuyến ĐỘ TIN CẬY**, không phải tuyến tính năng:

```
sáng-trưa   vá vi_sao nút Dừng · ba luật rút ra (4x) · bắt matKetNoi là cờ chết (4s)
chiều       bản TAY CẦM: bỏ số hiệu tiến trình, giữ tham chiếu — người soi ngoài nhà
            FAIL 6/6 → FAIL 5/6 → ĐẠT 4/4 điều kiện tối thiểu
17:27       commit c7f1131 · 17:34:30 NẠP LÊN APP THẬT · giay_tu_ep = 90 đo sống
cả ngày     sổ bẫy đo 51 → 61 mục · giao thức neo băm (PROTOCOL-review-hash) v1.0→v1.5
18:0x       Owner đổi vai: phong-ban-pm CHỈ research · mọi việc soi giao Hermes
```
⚖️ **Đánh đổi phải nói thẳng:** app đang KHÔNG đáng tin thì làm thêm tính năng là xây trên nền lún —
nên tuyến độ tin cậy đi trước là ĐÚNG. Nhưng cái giá là **lộ trình đứng yên hai ngày**, và món nợ P1-3
lớn thêm 20% trong đúng hai ngày ấy.

## ⑤ SẼ ĐI ĐÂU — đề xuất thứ tự, chờ Owner chốt

```
① P0-1 khoá sổ ô        ← nền của mọi thứ. KHÔNG có nó thì P0-2 nguy hiểm.
② P0-2 máy chủ tự chạy  ← đóng mốc M1, và trả lời đúng câu Owner hỏi 12:50
③ P1-3 chia UngDung.tsx ← nợ tự lớn. Càng hoãn càng đắt. Mở đường M3.
④ P1-1 bảng đo mức dùng ← đóng M2. Đây là TIỀN, nên đáng làm sớm.
```
🚧 Bốn mục đang treo ở tuyến độ tin cậy, KHÔNG mục nào gấp:
khe `khong_co_viec` (nay ĐO ĐƯỢC vì app đã sống) · ba lỗ bảng 15:26 · `/api/fork` ngoài phanh kiểu ·
mắt canh gọi lại về tin đã xử (4z — đã đo 2 ca hôm nay, mỗi ca tốn một lượt chạy thật).

## ⑥ HAI CÂU CHỜ OWNER
```
· round-6 (ngưỡng ép SIGKILL): bản dựng đứng im từ 17:17 — dựng tiếp hay bỏ?
  hiện đang chạy số TẠM 90 giây do PM chọn theo luật «không được tệ hơn bản đang chạy»
· P2-3 «hh:ss»: gõ nhanh của «hh:mm», hay Owner thật sự muốn GIÂY?
```
