# NGHIÊN CỨU — đường đánh thức THỨ HAI, ⛔ phụ thuộc trình duyệt

> 📅 30/08/2026 · 👤 `claude-aiboss-app-pm` · theo lệnh Owner
> 🎯 Trả lời: nên làm gì, theo thứ tự nào, và **cái gì làm được NGAY mà ⛔ chờ ai**.
> ⚠️ Mọi số dưới đây ĐO lúc 07:2x ngày 30/08. Số quá một ngày thì đo lại, ⛔ chép.

## ① ĐƯỜNG HIỆN TẠI ĐỨT Ở ĐÂU — ba chỗ, ⛔ phải một

```
POST /api/danh-thuc  →  xepHang() ghi .trang-thai/danh-thuc.json  →  [CHỜ]
                                                                      ↓
        trình duyệt ĐANG MỞ app + tab ĐANG HIỆN → thăm dò → nhặt → gửi vào ô → chạy
```
| # | Chỗ đứt | Bằng chứng trong mã | Hậu quả |
|---|---|---|---|
| ① | Trình duyệt ⛔ mở | vòng thăm dò nằm trong `UngDung.tsx` | ⛔ ai nhặt, hết hạn sau 180 giây |
| ② | Tab bị ẩn | `document.hidden` ⇒ vòng thăm dò ngủ | như trên |
| ③ | **Ô ĐANG CHẠY** | `UngDung.tsx:1162` + `:1182` `if (!dang \|\| dangChay.has(k)) continue` | **chuông RƠI IM LẶNG** |

🔴 **Chỗ ③ là chỗ hay cắn nhất và ⛔ liên quan gì tới trình duyệt đóng hay mở.** Owner mở app,
tab đang hiện, mà rung vẫn mất — chỉ vì ghế kia đang bận. Yêu cầu ⛔ được giữ lại để thử sau,
nó **hết hạn rồi biến mất**, ⛔ báo cho ai.

## ② MÁY CHỦ ĐÃ BIẾT TỰ CHẠY MỘT LƯỢT — ⛔ phải viết mới
```
src/lib/chay-agent.ts:188      spawn(CAU_HINH.lenhClaude, …)   ← đã chạy thật mỗi ngày
src/app/api/fork/route.ts:77   spawn(claude, ['--resume', …])  ← đã chạy thật
```
⇒ Phần khó nhất (dựng tiến trình, nối vào đúng phiên) **đã có sẵn**. Việc còn thiếu chỉ là
**ai bấm nút** khi ⛔ có trình duyệt.

## ③ HỌC GÌ TỪ `openclaw` — đọc mã thật, ⛔ đọc lời đồn
`~/Development/openclaw/src/infra/heartbeat-wake.ts` (358 dòng) + `heartbeat-cooldown.ts`.
Ba thứ đáng bê về, và **cả ba đều là thứ ta ĐANG THIẾU**:
```
① BẬN THÌ HOÃN, ⛔ VỨT   HEARTBEAT_SKIP_REQUESTS_IN_FLIGHT · _CRON_IN_PROGRESS · _LANES_BUSY
                          + RETRYABLE_BUSY_SKIP_REASONS ⇒ bận là XẾP LẠI, ⛔ đánh rơi.
                          ⇒ chữa đúng chỗ đứt ③ của ta.
② GỘP YÊU CẦU            DEFAULT_COALESCE_MS = 250  ⇒ nhiều tiếng gọi dồn thành MỘT lượt.
                          Với ta quan trọng hơn nhiều: mỗi lượt là TIỀN THẬT của Owner.
③ CÓ THỨ TỰ ƯU TIÊN      REASON_PRIORITY + intent scheduled|event|immediate|manual
                          ⇒ tiếng gọi của Owner phải chen trên tiếng gọi máy-gọi-máy.
```
📌 openclaw tách hẳn **người xếp hàng** khỏi **người chạy** (`HeartbeatWakeHandler`).
Ta cũng nên vậy: hàng đợi ⛔ cần biết ai sẽ chạy — trình duyệt hay máy chủ.

## ④ ĐỀ XUẤT — CHIA P0-2 LÀM ĐÔI. Đây là phần đáng đọc nhất.
Bảng việc đang ghi «P0-2 CHẶN bởi P0-1». **Đúng một nửa.** Soi ra thì có một nửa ⛔ bị chặn:

### 🟢 P0-2a — GIỮ YÊU CẦU KHI Ô BẬN, THỬ LẠI KHI RẢNH  ← làm được NGAY
```
Đổi: ô bận ⇒ bỏ qua + để hết hạn 180 giây
Thành: ô bận ⇒ GIỮ trong hàng, thử lại ở vòng thăm dò sau (đúng RETRYABLE_BUSY của openclaw)
⛔ CHẶN bởi P0-1: nó ⛔ thêm người ghi nào cả — vẫn đúng MỘT người chạy lượt (trình duyệt).
Chỉ sửa: hàng đợi ⛔ đánh rơi việc.
Được  : chữa chỗ đứt ③ — chỗ hay cắn nhất, và ⛔ dính gì tới trình duyệt đóng/mở.
Giá   : nhỏ · lùi được · ⛔ đụng đường chạy lượt.
```
### 🟡 P0-2b — MÁY CHỦ TỰ CHẠY KHI ⛔ AI NHẶT  ← CHẶN THẬT bởi P0-1
```
nhịp đập: mỗi N giây, máy chủ xem hàng đợi; yêu cầu quá N giây ⛔ ai nhặt ⇒ máy chủ TỰ chạy
          (dùng lại chay-agent.ts:188)
🔴 VÌ SAO PHẢI CHỜ P0-1: lúc đó có HAI người có thể chạy cùng một ghế — trình duyệt và máy chủ.
   ⛔ khoá thì đúng bằng ca hỏng hôm qua NHÂN ĐÔI: hai bên cùng đọc sổ, cùng ghi, đè mất nhau.
   Khoá phải là khoá CÓ HẠN DÙNG (chết giữa chừng ⇒ khoá tự nhả), đúng như P0-1 đã ghi.
BẮT BUỘC kèm: ① trần lượt RIÊNG cho đường máy chủ, chặt hơn trần 6/phút của cổng
              ② gộp yêu cầu cùng ghế thành MỘT lượt
              ③ tắt được bằng một công tắc (openclaw có setHeartbeatsEnabled — ta cũng cần)
```

## ⑤ THỨ TỰ ĐỀ XUẤT
```
1. P0-2a   ⛔ chờ ai — chữa chỗ đứt hay gặp nhất
2. P0-1    khoá có hạn dùng
3. P0-2b   máy chủ tự chạy, chỉ sau khi 2 xong
```
⚠️ **⛔ đảo 2 và 3.** Làm P0-2b trước khoá là tự tay dựng cái bệnh ta vừa mất một đêm để chữa.

## ⑥ NGHIỆM THU — hợp đồng, ⛔ phải lời hứa
```
P0-2a  Rung một ghế ĐANG chạy dở. Ghế xong lượt ⇒ câu hỏi PHẢI tự tới, ⛔ cần rung lại.
       ĐỐI CHỨNG DƯƠNG: rung một ghế đang RẢNH ⇒ tới ngay (chứng minh phép thử ⛔ mù).
P0-2b  ĐÓNG HẲN TRÌNH DUYỆT. Rung một ghế. Đo mtime tệp .jsonl của ghế đó phải ĐỔI.
       ĐỐI CHỨNG DƯƠNG: cùng thước đo một ghế chắc chắn đang chạy ⇒ thấy đổi.
       ĐỐI CHỨNG ÂM  : rung một ghế ⛔ tồn tại ⇒ 404, và ⛔ tệp nào đổi.
⛔ NHẬN «đã chạy thử thấy được» — mã 200 chỉ nói ĐÃ XẾP HÀNG, ⛔ nói ĐÃ TỚI.
```

---

## ⑦ CÂU HỎI OWNER 30/08: «gửi lên Railway giữ hộ, hết bận thì bắn lại» — ĐO RỒI TRẢ LỜI

### 🟥 Với chỗ đứt ③ (ô đang bận): **Railway ⛔ giúp được.** Ba lý do, mỗi lý do một số đo.
```
① CÁI THIẾU ⛔ PHẢI «CHỖ GỬI GIỮ» — hàng đợi ĐÃ nằm trên ĐĨA rồi:
   .trang-thai/danh-thuc.json → hang_doi[] có đủ ma · ma_o · ma_nhan_su · cau_hoi · luc · da_xu
   kho-danh-thuc.ts:86  conDung() = !y.da_xu && bayGio - y.luc < HAN_YEU_CAU_MS (3 phút)
   ⇒ Yêu cầu ĐƯỢC giữ, bền qua khởi động lại. Nó ⛔ mất vì thiếu chỗ chứa —
     nó mất vì **⛔ ai THỬ LẠI** trước khi hết 3 phút.
② RAILWAY Ở XA, NÓ ⛔ NHÌN THẤY LÚC NÀO GHẾ RẢNH.
   Trạng thái `dangChay` nằm trong trình duyệt + trên đĩa máy nhà. Muốn Railway biết thì:
     (a) máy nhà báo lên  ⇒ nhưng lúc đó máy nhà ĐÃ TỈNH, tự bắn được ⇒ Railway thừa
     (b) Railway hỏi vào  ⇒ phải mở cửa internet vào localhost:4319 ⇒ đó là P3-1, đang CHẶN,
                            và phải soi bảo mật TRƯỚC — `/api/fork` chạy lệnh THẬT trên máy
③ GIÁ: thêm một chặng mạng · thêm một cửa phải canh · thêm tiền —
   để giải một bài **hoàn toàn nằm trong MỘT máy**.
```

### 🟩 NGƯỜI GÁC NGOÀI TRÌNH DUYỆT — **NHÀ ĐÃ THUÊ RỒI, SÁU NGƯỜI**
```
launchctl list → com.eroca.mat-canh-{claude-aiboss-app-exe, -pm, phong-ban-pm,
                                     eroca-boss, zalo-bot, chat-channels}
StartInterval 90 giây · sống NGOÀI trình duyệt · sống NGOÀI mọi lượt chat
BẰNG CHỨNG nó đang làm việc thật — đọc ngay trong hàng đợi:
   { "ma_o": "o-3", "tu_ai": "mat-canh-kenh", "cau_hoi": "[mắt canh] có 1 tin mới…" }
```
📌 **Ý Owner ĐÚNG, chỉ đặt nhầm chỗ**: người gác ⛔ cần thuê ngoài — **đã có, đang chạy**.
P0-2a rút gọn thành đúng một câu: **dạy người gác đó biết THỬ LẠI khi ghế bận**,
thay vì rung một phát rồi để yêu cầu chết sau 3 phút.

### 🟨 RAILWAY ĐÁNG DÙNG — nhưng cho việc KHÁC (P3-1), và dùng kiểu KÉO
```
Việc nó giải được mà máy nhà ⛔ giải nổi:  MÁY TẮT · MÁY NGỦ · Owner ĐI VẮNG
   ⇒ lúc đó ⛔ có gì trên máy chạy, kể cả launchd.
MÔ HÌNH AN TOÀN = KÉO, ⛔ phải ĐẨY:
   Railway chỉ là HỘP THƯ giữ lệnh của Owner.
   Máy nhà tỉnh dậy thì HỎI RA lấy về. Railway ⛔ BAO GIỜ gọi vào máy.
   ⇒ ⛔ phải mở cổng nào · ⛔ phơi localhost:4319 ra internet · lộ hộp thư ⛔ đồng nghĩa lộ máy.
```
⚠️ Nếu chọn ĐẨY (Railway gọi thẳng vào máy) thì phải soi bảo mật trước — `/api/fork` và
`/api/chat` chạy **lệnh thật** trên máy Owner. Đó là lý do P3-1 ghi «soi bảo mật TRƯỚC khi mở».


---

## ⑧ ĐÍNH CHÍNH BẢN v1 — HAI CHỖ TÔI SAI (30/08 08:1x, sau hai cửa duyệt)

### 🔴 SAI ①: tôi TRÍCH NHẦM DÒNG — và nhầm vào một cặp SONG SINH
```
tôi trích  UngDung.tsx:725   if (!dang || dangChay.has(k)) continue
đo lại     dòng 725 nằm trong vòng ĐÓNG Ô khi ghế đổi chỗ (gọi dongO) — ⛔ LIÊN QUAN chuông
đúng phải  1162  .filter(({o}) => o.ns && !o.dangChay && !o.dangNap)   ⛔ hỏi hộ ô bận
           1182  if (!o?.ns || o.dangChay) continue                    bỏ mẩu ĐÃ claim
```
📌 Hai đoạn mã **trông y hệt nhau**. Tôi grep ra chuỗi khớp rồi lấy chỗ khớp ĐẦU TIÊN.
Đúng bẫy ⑭: từ khoá khớp nhầm chỗ ⇒ **báo «có» sai** ⇒ yên tâm sai. Chữa: grep xong phải MỞ RA ĐỌC
xem hàm đó làm gì, ⛔ dừng ở «có dòng khớp».

### 🔴 SAI ②: tôi NÓI QUÁ BỆNH — bản chưa sửa **ĐÃ tự thử lại tới 3 phút**
```
1162 chỉ HỎI HỘ ô KHÔNG bận ⇒ mẩu của ô bận ⛔ hề bị claim ⇒ da_xu vẫn false
kho-danh-thuc.ts:86  conDung() = !da_xu && bayGio - luc < HAN_YEU_CAU_MS
UngDung.tsx:93       NHIP_THAM_DO_MS = 5_000   ⇒ 5 giây hỏi lại một lần
⇒ ghế bận DƯỚI 3 phút: vòng thăm dò sau NHẶT ĐƯỢC. Bản chưa sửa ĐÃ chạy đúng.
```
⇒ Câu «ô bận ⇒ chuông rơi im lặng» của tôi **quá tay**. Bệnh THẬT hẹp hơn và sắc hơn:
```
· bận QUÁ 3 phút          → hết hạn, chết
· CLAIM RỒI BỎ (1182)     → mất NGAY, ⛔ cần chờ hết hạn   ← nặng nhất, cả hai cửa cùng bắt
· ĐỔI GHẾ giữa chừng      → gửi sang SAI ghế (nhan/route.ts:29-32 ⛔ trả ma_nhan_su)
· HAI TAB                 → mỗi tab giữ dangChay riêng ⇒ mở tiến trình thứ hai
```
🔴 **Hệ quả chết người cho phép nghiệm thu v1 của tôi:** «rung ghế đang chạy dở → xong lượt phải tự tới»
**XANH SẴN trên bản CHƯA SỬA GÌ** nếu lượt bận dưới 3 phút. Phép thử đó chứng minh **⛔ gì cả**.
✅ Sửa: bận **> 3 phút 30 giây**, và **BẮT BUỘC đối chứng âm chạy trên bản CHƯA SỬA phải THẤT BẠI**.
📌 Đây là nhóm C ở dạng nguy nhất: **phép đo xanh, kết luận sai, mà ⛔ có số nào sai cả.**

### ✅ SỬA LUÔN LÝ DO BÁC RAILWAY — hai cửa cùng chỉ ra, mỗi cửa một kiểu
```
Hermes : Railway ⛔ cần biết ghế rảnh — nó làm BROKER có lease (claim/ack/nack/TTL/dead-letter)
reviewer: bằng chứng của CHÍNH TÔI mạnh hơn lý do tôi đưa —
          6 việc launchd ĐÃ đặt được yêu cầu mà mẩu vẫn rơi
          ⇒ chỗ đứt ⛔ nằm ở NGƯỜI ĐẶT, nó nằm ở NGƯỜI NHẶT.
⇒ KẾT LUẬN GIỮ, LÝ DO THAY: «Railway ⛔ CẦN THIẾT và đắt cho ca một máy»
  ⛔ phải «Railway ⛔ giúp được». Cùng protocol lease làm trên đĩa, ít phụ thuộc hơn.
```

---

## ⑨ P0-2a **v2** — sau HAI cửa bác. Gốc bệnh: KHOẢNG GIỮA claim và dùng.

> Cả `hermes-aiboss-app-review` lẫn `claude-phong-ban-pm` đều bác v1. Reviewer đo tiếp và
> chỉ ra: claim-rồi-bỏ **⛔ phải một cửa, mà là BỐN**. Tôi đo lại từng cửa, xác nhận.

### 🔑 GỐC CHUNG — một câu
```
CLAIM xảy ra ở MÁY CHỦ (kho-danh-thuc.ts:166 `y.da_xu = true; ghi(s);`)
DÙNG  xảy ra ở TRÌNH DUYỆT (UngDung.tsx:1183 `guiRef.current(...)`)
⇒ MỌI thứ rơi vào khoảng giữa hai chỗ đó đều MẤT VĨNH VIỄN.
   Vì conDung() = !da_xu && … ⇒ đã claim thì ⛔ BAO GIỜ sống lại.
```
⇒ **⛔ vá từng cửa.** Phải đổi protocol: `claim → ack | nack | expire`.

### 🚪 BỐN CỬA — đo tại nguồn
| # | Chỗ | Cơ chế mất |
|---|---|---|
| ① | `UngDung.tsx:1182` | ô vừa bận trong lúc chờ mạng ⇒ `continue`, mẩu đã claim bị bỏ |
| ② | `UngDung.tsx:1173` `if (!r.ok) return` | `nhan/route.ts:30-33` claim + **ghi đĩa TỪNG Ô một**, ⛔ có try/catch bọc vòng. Ô thứ ba ném lỗi ⇒ hai mẩu đầu ĐÃ nằm trên đĩa `da_xu=true` ⇒ 500 ⇒ client `return` ⇒ mất cả hai |
| ③ | `UngDung.tsx:1185` `catch` | máy chủ claim + ghi xong, câu trả lời mất trên đường về ⇒ mẩu chết |
| ④ | `UngDung.tsx:1183` | `gui()` hỏng ⇒ mẩu đã claim vẫn coi như đã dùng, ⛔ đường trả về hàng |

### 🕳 CỬA ③ CÓ THÊM MỘT LỚP — **CHÚ THÍCH TRONG MÃ ĐANG NÓI DỐI**
```
UngDung.tsx:1186   /* mất mạng một nhịp — nhịp sau thử lại, ⛔ đừng làm ồn */
```
Câu đó ĐÚNG khi **chưa** claim. Đứt **sau** claim thì `conDung()` trả false ⇒ **⛔ có nhịp sau nào cả.**
🔴 Người soi mã đọc dòng chú thích này sẽ **đóng cửa ③ lại mà ⛔ kiểm** — và đó là cách một lỗi
sống sót qua nhiều vòng soi. 📌 Chú thích sai nguy hơn ⛔ có chú thích: nó **mua đứt sự yên tâm.**

### 🙋 CỬA ④ — tôi ĐOÁN SAI CƠ CHẾ, ghi lại cho đúng
Tôi định khai: *«1183 gọi bằng `void` ⇒ lỗi ⛔ ai bắt»*. **Sai.** Đo thân hàm `gui()`
(dòng 874–1106, **233 dòng**): có **3 `try` · 4 `catch` · 1 `finally`** ⇒ nó TỰ bắt lỗi.
⇒ Cửa ④ vẫn CÓ THẬT, nhưng cơ chế khác: **`gui()` bắt lỗi rồi nuốt, mà mẩu thì đã claim mất rồi,
và ⛔ có đường trả nó về hàng.** ⛔ phải «lỗi ⛔ ai bắt» — mà là «bắt được cũng ⛔ cứu được mẩu».

### 📐 v2 — HỢP ĐỒNG
```
① Đổi `da_xu: boolean` → trạng thái: cho | dang_giu | xong | that_bai | het_han
② claim CÓ HẠN GIỮ (lease): quá hạn mà ⛔ ack ⇒ TỰ VỀ trạng thái `cho`, thử lại được
③ ack (đã đưa tới ghế) · nack (⛔ đưa được — ô bận / gui hỏng) ⇒ về `cho` NGAY
④ 🔴 ack/nack BẮT BUỘC CÓ HẠN — reviewer nêu, tôi nhận:
   ⛔ có hạn thì ta chỉ đổi «MẤT mẩu» thành «KẸT mẩu», bệnh mới còn khó thấy hơn bệnh cũ
⑤ bất biến: lúc claim VÀ lúc ack, `ma_o` phải VẪN đúng `ma_nhan_su` ban đầu
   (nay `nhan/route.ts:29-32` ⛔ trả `ma_nhan_su` về ⇒ client ⛔ so được — phải trả)
⑥ trần thử lại tính theo `luc` GỐC, tuyệt đối ⛔ gia hạn `luc`; hết trần ⇒ dead-letter HIỆN RÕ
⑦ `nhan/route.ts` phải bọc vòng lặp: một ô ném lỗi ⛔ được kéo theo các ô đã claim
```

### 🧪 NGHIỆM THU v2 — mỗi phép phải THẤT BẠI trên bản CHƯA SỬA
```
T1 ghế bận > 3 phút 30 giây ⇒ mẩu vẫn tới sau khi rảnh
   🔴 ĐỐI CHỨNG ÂM BẮT BUỘC: chạy T1 trên bản CHƯA SỬA phải THẤT BẠI.
      (v1 tôi ra đề bận 30 giây — XANH SẴN trên bản chưa sửa ⇒ chứng minh ⛔ gì)
T2 ép ô bận SAU khi /nhan trả về, TRƯỚC khi gọi gui() ⇒ mẩu phải về `cho`, ⛔ mất
T3 HAI TAB cùng trỏ một ô, gửi MỘT yêu cầu ⇒ sinh ĐÚNG 1 bản ghi (reviewer ra đề)
T4 đổi ghế của ô trong lúc mẩu chờ ⇒ mẩu ⛔ được gửi sang ghế mới
T5 bận vượt trần thử ⇒ vào dead-letter, ⛔ chạy muộn
T6 mỗi `ma_yeu_cau` kết thúc ở ĐÚNG MỘT trạng thái cuối: xong | that_bai | het_han
```

### 🔧 v2.1 — NĂM ĐIỀU KHOẢN THÊM (reviewer 30/08 08:5x · tôi đo lại, nhận cả năm)

#### ⑧ 🔴 CHUYỂN ĐỔI DỮ LIỆU CŨ — nặng nhất, và v2 ⛔ có một chữ nào về nó
```
kho-danh-thuc.ts:55-64  doc():  JSON.parse(...) as Partial<So>
                        chỉ kiểm Array.isArray cho HAI mảng gốc.
                        `as Partial<So>` là ép kiểu LÚC BIÊN DỊCH — ⛔ kiểm gì lúc CHẠY.
                        Từng MẨU trong mảng ⛔ ai kiểm.
ĐO TRÊN ĐĨA 30/08 08:5x:  4 mẩu · da_xu=true: 4 · da_xu=false: 0
```
⇒ Đổi `da_xu: boolean` → `trang_thai` mà ⛔ chuyển đổi thì mẩu cũ đọc ra `trang_thai === undefined`:
```
viết  `trang_thai !== 'xong'`  ⇒ mẩu ĐÃ CHẠY hôm nay **CHẠY LẠI** (rung lại ghế bằng câu cũ)
viết  `trang_thai === 'cho'`   ⇒ mẩu KẸT thành rác, ⛔ ai dọn
```
`GIU_LICH_SU_MS = 10 * 60_000` (dòng 32) che phần lớn ⇒ cửa HẸP, nhưng **khác 0** —
đủ để cắn đúng một lần rồi cả nhà đi tìm ma. **Chữa: MỘT dòng chuẩn hoá ngay trong `doc()`** —
đọc lên thấy `da_xu` thì quy sang `trang_thai` tại chỗ, ⛔ để mã phía sau tự đoán.

#### ⑦′ SỬA ĐIỀU KHOẢN ⑦ — bọc `try/catch` là **⛔ ĐỦ**
```
nhan/route.ts:30-33   for (const maO of dsO) { const y = nhanYeuCau(maO); … }
kho-danh-thuc.ts:166  nhanYeuCau tự `ghi(s)` — GHI ĐĨA NGAY, TỪNG Ô MỘT
⇒ tới lúc ô thứ ba ném lỗi thì hai mẩu đầu ĐÃ nằm trên đĩa. try/catch ⛔ gỡ lại được.
```
✅ Đúng phải là: **claim CẢ DANH SÁCH trong MỘT lần đọc-sửa-ghi** (một `doc()` → sửa hết → một `ghi()`).
🎁 Đổi thế còn **hẹp luôn cửa hai tab** mà T3 đang đo — vì cả cụm claim thành một cú tráo duy nhất.

#### ⑨ AI làm việc «tự về `cho`» — PHẢI GHI RÕ, ⛔ để exe tự chọn
```
CHỌN: LƯỜI (xét lúc ĐỌC), ⛔ dùng bộ đếm nền.
VÌ SAO: bộ đếm nền là NGƯỜI GHI THỨ HAI ⇒ cần khoá ⇒ P0-2a lại thành bị chặn bởi P0-1.
        Xét-lúc-đọc nằm gọn TRONG chu trình đọc-sửa-ghi đã có ⇒ ⛔ thêm người ghi nào.
```
📌 ⛔ ghi rõ thì exe chọn bộ đếm nền, và ta quay lại đúng vòng vừa thoát ra.

#### ⑩ ĐIỀU KHOẢN CHO CHÚ THÍCH NÓI DỐI (1186) — khen thôi ⛔ đủ, phải vào hợp đồng
```
Sửa mã ở cửa ③ thì BẮT BUỘC sửa luôn chú thích 1186 trong CÙNG một thay đổi.
Và api/danh-thuc/route.ts:117 «trình duyệt sẽ tự gửi trong ~5 giây» phải đổi thành
câu nói ĐÚNG việc nó làm: «đã xếp hàng · sẽ gửi khi ô rảnh · ⛔ bảo đảm thời điểm».
NGHIỆM THU: grep chuỗi hứa-hẹn cũ trong mã phải ra 0, kèm đối chứng dương trên chuỗi chắc chắn còn.
```
→ đã ghi thành bẫy **㉔** trong `~/Operations/SO-BAY-DO.md`.

#### ⑪ T2 PHẢI CÓ CÁCH DỰNG — ⛔ thì exe sẽ ghi «⛔ tái hiện được»
```
Thêm cờ gỡ lỗi TẠM: DEBUG_TRE_SAU_NHAN_MS (mặc định 0, ⛔ bật trong bản thật).
Khác 0 ⇒ client ngủ chừng ấy mili-giây GIỮA lúc /nhan trả về VÀ lúc gọi gui().
Cách chạy T2:  đặt 15000 → rung ghế đang RẢNH → trong 15 giây đó gõ một câu vào CHÍNH ô ấy
               (ô chuyển sang bận) → thả.
KỲ VỌNG: mẩu về `cho` và tới sau khi ô rảnh.  BẢN CHƯA SỬA: mẩu MẤT HẲN.
Gỡ cờ trước khi commit bản thật; nghiệm thu phải kèm phép đo chứng minh cờ đã gỡ.
```

### 🔒 v2.2 — CHỌN **LỐI A**, nhưng lối A có một lỗ CHỈ HIỆN TRÊN ĐIỆN THOẠI

#### ⑫ MỘT TAB LÀM NGƯỜI NHẶT DUY NHẤT — kèm PHÁT HIỆN TÍNH NĂNG bắt buộc
Reviewer đúng: gom một lần đọc-sửa-ghi chỉ **rút ngắn thời gian phơi ra**, ⛔ tạo ra tính loại trừ.
Chọn **LỐI A**: chỉ một tab chạy vòng thăm dò. ⛔ đụng P0-1, ⛔ thêm người ghi nào.
```
🔴 NHƯNG: `navigator.locks` ĐÒI SECURE CONTEXT.
   chay-lan.sh:102   exec npx next start -H 0.0.0.0 -p 4319
   ⇒ Owner mở trên MÁY:       http://localhost:4319   → secure ⇒ navigator.locks CÓ
   ⇒ Owner mở trên ĐIỆN THOẠI: http://<IP-LAN>:4319   → ⛔ secure ⇒ navigator.locks = undefined
   (hồ sơ ghế có luật «ô gõ ≥16px vì điện thoại tự phóng to» ⇒ điện thoại là đường dùng THẬT)
⇒ Cắm thẳng navigator.locks = trên Mac thì khoá, trên điện thoại thì **âm thầm ⛔ khoá gì cả**.
   T3 chạy ở localhost sẽ XANH, mà bệnh vẫn nguyên trên đường Owner dùng hằng ngày.
```
✅ **Hợp đồng ⑫:**
```
① có `navigator.locks`  → dùng: locks.request('nhat-yeu-cau', …) rồi mới chạy vòng thăm dò
② ⛔ có                 → bầu chọn bằng `BroadcastChannel` (⛔ đòi secure context)
③ ⛔ có cả hai          → LÙI VỀ hành vi hiện tại + ghi một dòng cảnh báo nhìn thấy được,
                          ⛔ im lặng coi như đã khoá
④ ⛔ BAO GIỜ giả định có khoá. Đường nào cũng phải ĐO ra mình đang ở nhánh nào.
```

#### 🧪 T3 SỬA — phép cũ sẽ NÓI DỐI nếu chỉ chạy một đường
```
T3a  hai tab trên  http://localhost:4319       → một yêu cầu sinh ĐÚNG 1 bản ghi
T3b  hai tab trên  http://<IP-LAN>:4319        → cũng phải ĐÚNG 1 bản ghi
🔴 CHỈ chạy T3a là phép thử NÓI DỐI: nhánh ① che mất việc nhánh ② có chạy ⛔.
ĐỐI CHỨNG: in ra mình đang dùng nhánh NÀO trong mỗi lần chạy — thấy cùng một nhánh
           ở cả hai phép ⇒ phép thử ⛔ chạm tới nhánh kia ⇒ ⛔ kết luận được.
```

#### ⑪ SỬA MÂU THUẪN — reviewer bắt đúng, tôi viết hai câu ngược nhau
```
CHỐT: GIỮ cờ DEBUG_TRE_SAU_NHAN_MS, mặc định 0. ⛔ gỡ.
VÌ SAO: T2 phải chạy lại MỖI LẦN đụng vào chỗ này; gỡ rồi thì lần sau lại chế lại,
        mà bản chế lại ⛔ chắc giống bản đã duyệt.
NGHIỆM THU thay đổi theo: chứng minh mặc định = 0 (⛔ phải chứng minh đã gỡ).
```

#### 📐 NHẬN ĐÍNH CHÍNH SỐ ĐO — reviewer đúng, tôi nói sai một chữ
```
tôi viết : «4/4 mẩu da_xu=true ⇒ CỬA chuyển-đổi RỘNG hơn ta tưởng»   ← SAI
đúng     : CỬA (thời gian) vẫn đúng bằng GIU_LICH_SU_MS = 10 phút. Con số 4/4 ⛔ nới nó ra.
           Cái 4/4 làm nặng thêm là HẬU QUẢ: rơi vào cửa đó thì mất/chạy lại CẢ 4 mẩu, ⛔ phải 1.
```
📌 Lẫn **xác suất** với **thiệt hại** — hai trục khác nhau. Ghi lại vì nó dễ lặp.

### 🔙 v2.3 — **RÚT LỐI A. Bệnh hai tab gần như chắc chắn ⛔ tồn tại.**

`claude-phong-ban-pm` tự rút đề bài T3 của chính họ. Tôi đo lại cả ba vế — **họ đúng**:
```
kho-danh-thuc.ts   async 0 · Promise 0 · await 1 → mà chữ 'await' DUY NHẤT đó nằm ở DÒNG 17,
                   TRONG CHÍNH CÂU CHÚ THÍCH nói rằng ⛔ có await.  ⇒ mã thật: 0.
                   (đối chứng dương: đếm 'function' ra 8 ⇒ thước sống)
nhan/route.ts      await DUY NHẤT ở dòng 20 (đọc thân yêu cầu); từ 30→35 đồng bộ tới hết
nhanYeuCau         doc() … ghi() — GIỮA hai lệnh đó ⛔ có await nào
cổng 4319          ĐÚNG MỘT tiến trình (pid 16624) · 0 cấu hình cluster/worker
```
⇒ Trong một tiến trình Node, hai yêu cầu **⛔ chen được vào giữa nhau**. Hai tab ⛔ thể cùng claim.
⇒ **T3 sẽ XANH trên bản CHƯA SỬA** ⇒ điều khoản ⑫ đang chữa một bệnh **⛔ có thật**.

#### 🗑 BỎ ⑫ và bỏ luôn phần secure-context
Phát hiện «navigator.locks chết trên IP-LAN» vẫn **đúng và sắc** — nhưng nó là lỗ của một phương án
ta **⛔ cần nữa**. Chuyển sang `DECISION_LOG.md` để ai sau này định dùng `navigator.locks` ⛔ vấp lại.

#### 🕳 VÌ SAO CẢ HAI CÙNG TRƯỢT — ghi lại, vì đây mới là bài học
```
Ba vòng liền ta chỉ bàn CÁCH CHỮA. ⛔ ai quay lại hỏi: «bệnh này có THẬT ⛔».
Càng bàn kỹ càng tin là có — công sức bỏ vào một giả thuyết làm nó trông đúng hơn.
Và tôi từng bị bắt ĐÚNG lỗi này ở v1 (phép thử xanh sẵn trên bản chưa sửa).
Bị bắt một lần rồi vẫn tái phạm ở vai NGƯỜI NHẬN ĐỀ — vì lần này người ra đề là reviewer,
và tôi cho rằng đề của người soi thì khỏi soi.
```
📌 **Đề bài của người kiểm cũng phải bị kiểm.**

#### ✅ T3 → PHÉP ĐỐI CHỨNG CHẠY **TRƯỚC** KHI VIẾT MÃ
```
T3-doi-chung  hai tab, một yêu cầu, đo trên BẢN CHƯA SỬA
   XANH ⇒ gạch «hai tab» khỏi bốn cửa, ⛔ viết dòng mã nào cho nó
   ĐỎ   ⇒ reviewer sai, mở lại lối A (và lúc đó lỗ secure-context sống lại)
```

#### ✅ T3′ THAY THẾ — bệnh CÓ THẬT, và ĐÃ XẢY RA rồi
```
Bệnh thật nằm ngay trong câu chú thích: bảo đảm chỉ đúng trong MỘT tiến trình.
29/08: máy chủ MỒ CÔI pid 58779 sống sót qua bootout ⇒ HAI máy chủ ⇒ sổ ô THỨ HAI.
T3′  hai máy chủ cùng trỏ một .trang-thai · gửi MỘT yêu cầu · phải sinh ĐÚNG 1 bản ghi
     ⇒ bản chưa sửa CHẮC CHẮN TRƯỢT (⛔ như T3 cũ chắc chắn xanh)
```
⚠️ **Và ghi rõ cái bảo đảm này MONG MANH:** nó dựa vào hai điều ⛔ ai canh —
① đúng một tiến trình ② ⛔ có `await` trong đoạn đọc-sửa-ghi.
Ai thêm một `await` vào `nhanYeuCau`, hoặc lỡ để hai máy chủ cùng chạy (ĐÃ xảy ra), là cửa mở lại.
⇒ Điều khoản ⑬: đặt một phép kiểm tự động khẳng định **⛔ có `await` giữa `doc()` và `ghi()`**.

#### ✅ ⑭ MỌI LẦN GỌI DẬY PHẢI KÈM MỘT DÒNG TRÊN KÊNH
```
Hai đường hỏng theo HAI kiểu khác nhau:
   chuông → MẤT ⛔ để lại dấu vết (ca 30/08 08:00:17, mẩu chết sau 180 giây)
   kênh   → CHẬM, nhưng nằm đó tới khi có người đọc
⇒ Gọi mà ⛔ ghi kênh = đánh cược vào đường có thể mất trắng.
```

### 🔒 v2.4 — ⑬ VIẾT ĐỦ (reviewer gật v2.3 với đúng điều kiện này). **Đã dựng và chạy thử.**

Reviewer cảnh báo đúng: ⑬ viết ngây thơ **ĐỎ ngay ngày đầu**, và đỏ vì **chính câu chú thích nó bảo vệ**.
```
ngây thơ:  grep -c 'await' kho-danh-thuc.ts  →  1   🔴 ĐỎ
           thứ làm nó đỏ là dòng 17: «⛔ không có `await` xen giữa»
```
Và thiếu đối chứng thì ⑬ thành **phép kiểm câm LUÔN XANH** — nguy hơn ⛔ có phép kiểm nào,
vì nó phát ra sự yên tâm.

#### ✅ ⑬ — hợp đồng đầy đủ, **ba vế, thiếu vế nào cũng ⛔ tính là có phép kiểm**
```
① BỎ CHÚ THÍCH TRƯỚC KHI ĐẾM   xoá /* … */ và // … rồi mới đếm `await` / `async`
                                ⇒ ĐO THẬT: await 0 · async 0   (bản ngây thơ ra 1)
② ĐỐI CHỨNG DƯƠNG               đếm `function` bằng ĐÚNG thước đã bỏ chú thích ⇒ phải ra 8
                                ra 0 ⇒ THƯỚC CÂM ⇒ ⛔ được tin số ở ①
③ ĐỐI CHỨNG ÂM                  bơm MỘT `await` thật vào bản sao (vd `donDep(await doc(), …)`)
                                ⇒ phép kiểm PHẢI bắt được. ⛔ bắt được ⇒ phép kiểm vô dụng.
                                ĐO THẬT: bản cố tình làm hỏng → await 1 ✅ bắt được
```
🧪 **Đã chạy thử cả ba vế trên mã thật ngày 30/08** — kết quả ghi ngay trên. exe chỉ việc gói lại
thành phép kiểm chạy được, ⛔ phải tự nghĩ ra cách.
📌 Vế ③ là thứ reviewer đòi thêm sau ca ㉕ của exe: **đối chứng phải đi qua ĐÚNG KHÂU đang nghi.**
Ở đây khâu đang nghi là «đếm await trong mã», nên đối chứng âm phải **bơm await vào MÃ**,
⛔ phải bơm chuỗi mẫu qua ống.

#### 📒 NẾP MỚI, nhận từ reviewer — **CHẠY PHÉP KIỂM LẦN HAI SAU KHI SỬA**
Họ tự khai: chạy script cấp số, script in «㉖», họ vẫn gõ ㉕ ⇒ trùng. Bắt được vì **chạy lại lần hai**.
```
Có công cụ · đã gọi công cụ · mà ⛔ ĐỌC KẾT QUẢ nó in ra.
⇒ Lần hai bắt được thứ lần một bỏ qua. Ở ⑬ thì lần hai CHÍNH LÀ vế đối chứng ②③.
```

---

# 📋 v3 — HỢP ĐỒNG BẰNG **BẢNG TRƯỜNG + SỐ**, ⛔ bằng văn xuôi

> Cửa hai (Hermes) bác v2.4 đúng chỗ: *«hợp đồng nói CÁI GÌ nhưng ⛔ nói BẰNG SỐ NÀO và TRƯỜNG NÀO
> ⇒ hai người đọc ra hai bản khác nhau.»* v3 sinh ra để mọi ô dưới đây **⛔ còn chỗ cho ai phát minh.**

## ① BẢNG TRƯỜNG của một mẩu trong `hang_doi`

| Trường | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| `ma` | chuỗi uuid | ✅ | mã mẩu, ⛔ đổi suốt đời |
| `ma_o` | `o-<N>` | ✅ | ô đích lúc XẾP HÀNG |
| `ma_nhan_su` | chuỗi | ✅ | **ghế** đích lúc xếp hàng — dùng làm BẤT BIẾN, xem ④ |
| `tu_ai` | chuỗi | ✅ | ai gọi |
| `cau_hoi` | chuỗi | ✅ | nội dung |
| `luc` | mốc ms | ✅ | lúc xếp hàng. **⛔ BAO GIỜ ghi đè** — mọi hạn tính từ đây |
| `trang_thai` | `cho`\|`dang_giu`\|`xong`\|`that_bai`\|`het_han` | ✅ | thay hẳn `da_xu` |
| `lease_id` | chuỗi uuid \| null | ✅ | cấp MỚI mỗi lần claim. ack/nack ⛔ khớp ⇒ TỪ CHỐI |
| `lease_den` | mốc ms \| null | ✅ | `= luc_claim + HAN_GIU_MS` |
| `so_lan_thu` | số | ✅ | +1 mỗi lần claim. Khởi 0 |
| `ly_do_that_bai` | chuỗi \| null | ✅ | bắt buộc khi `that_bai`/`het_han`, ⛔ để rỗng |
| `moc_ket` | mốc ms \| null | ✅ | lúc vào trạng thái cuối |

## ② BỐN CON SỐ — chốt cứng, kèm lý do. Ai muốn đổi thì đổi ở ĐÂY, ⛔ đổi rải rác.
```
HAN_GIU_MS      = 30_000      claim → phải ack/nack trong 30 giây, ⛔ thì tự về `cho`
                              vì sao 30: từ /nhan trả về tới lúc gui() vào được phiên đo thật ~1-3 giây;
                              30 giây là gấp 10 lần, đủ cho mạng chậm mà ⛔ giam mẩu lâu.
HAN_SONG_MS     = 480_000     tuổi tối đa của MẨU (8 phút), tính từ `luc` GỐC
                              vì sao 8 phút: lượt chạy thật đo trong phiên 30/08 là 2–5 phút.
                              8 phút phủ ca thường; quá đó thì chỉ thị đã CŨ, ⛔ được tự chạy.
TRAN_THU        = 96          = 480s / 5s nhịp thăm dò. Đai an toàn thứ hai bên cạnh HAN_SONG.
GIU_LICH_SU_MS  = 1_800_000   giữ mẩu ĐÃ KẾT 30 phút (nay 10 phút)
                              vì sao nới: dead-letter phải NHÌN THẤY ĐƯỢC. Hết hạn lúc 8 phút mà
                              dọn lúc 10 phút thì chỉ còn 2 phút để ai đó kịp thấy — quá ngắn.
```

## ③ MÁY TRẠNG THÁI — mọi chuyển đổi, ⛔ có đường nào khác

| Từ | Sang | Kích hoạt | Ghi kèm |
|---|---|---|---|
| `cho` | `dang_giu` | `/nhan` claim được | `lease_id` mới · `lease_den = now+30s` · `so_lan_thu += 1` |
| `dang_giu` | `xong` | `/ack` **kèm `lease_id` KHỚP** | `moc_ket = now` |
| `dang_giu` | `cho` | `/nack` kèm `lease_id` KHỚP, lý do TẠM (ô bận · gui hỏng) | `lease_id = null` · `lease_den = null` |
| `dang_giu` | `cho` | **LƯỜI**: lúc ĐỌC thấy `now > lease_den` | như trên · ⛔ bộ đếm nền (xem ⑨ v2.1) |
| `dang_giu` | `that_bai` | `/nack` lý do VĨNH VIỄN (ô ⛔ còn ghế đó) | `ly_do_that_bai` bắt buộc |
| bất kỳ chưa kết | `het_han` | **LƯỜI**: `now - luc > HAN_SONG_MS` **hoặc** `so_lan_thu > TRAN_THU` | `ly_do_that_bai` = `'qua-han'` \| `'qua-tran-thu'` |
| `xong`/`that_bai`/`het_han` | — | **⛔ có đường ra.** Trạng thái cuối là CUỐI | |

🔴 **`/ack` và `/nack` ⛔ khớp `lease_id` ⇒ trả 409, ⛔ đổi trạng thái gì.**
Đóng đúng lỗ Hermes nêu: *«chỉ gửi `ma` ⇒ một client CŨ có thể ack lease của người khác.»*

## ④ BẤT BIẾN ĐÍCH — kiểm ở CẢ HAI đầu
```
lúc CLAIM và lúc ACK:  sổ ô hiện tại tại `ma_o` phải VẪN mang đúng `ma_nhan_su` của mẩu.
⛔ khớp ⇒ `that_bai`, ly_do = 'doi-ghe'.  ⛔ được gửi sang ghế mới.
🔧 SỬA MÃ BẮT BUỘC: `api/danh-thuc/nhan/route.ts:29-32` hiện ⛔ trả `ma_nhan_su` về client
   ⇒ client ⛔ có gì để so. Phải trả thêm `ma_nhan_su` và `lease_id`.
```

## ⑤ RANH GIỚI `ack` — Hermes hỏi «ack khi nào mới tính là đã đưa tới ghế»
```
gui() PHẢI trả về có cấu trúc:  { da_gui: boolean, ma_phien: string|null, loi?: string }
ack  ⇐ CHỈ khi da_gui === true  (câu đã vào lượt của ghế, có ma_phien)
nack ⇐ da_gui === false · gui() ném lỗi · ô bận lúc kiểm lại (UngDung.tsx:1182)
⛔ BAO GIỜ ack ở chỗ khác. Hiện `gui()` (874–1106) tự bắt lỗi rồi NUỐT ⇒ phải sửa để TRẢ KẾT QUẢ.
```

## ⑥ CƠ CHẾ LIÊN TIẾN TRÌNH — Hermes đòi chọn MỘT, tôi chọn **khoá tệp `O_EXCL`**
```
CHỌN: open(<TEP>.khoa, 'wx')  — thất bại nếu tệp đã tồn tại ⇒ loại trừ THẬT giữa các tiến trình
⛔ CHỌN: SQLite (đổi cả tầng lưu trữ — đã chốt CHƯA làm, xem DECISION_LOG)
⛔ CHỌN: chỉ dựa vào rename nguyên tử — Hermes nói đúng: nó chống JSON DỞ, ⛔ chống hai chu trình đè nhau
nội dung tệp khoá: { pid, luc }   ·   khoá CŨ quá 10 giây ⇒ được phá (chủ đã chết)
mọi chu trình đọc-sửa-ghi trong kho-danh-thuc.ts VÀ kho-phien.ts đều phải qua khoá này
```
### 🔴 ⑥b TỆP TẠM DÙNG CHUNG TÊN — lỗi Hermes tìm ra, tôi đo lại CÓ THẬT
```
kho-phien.ts:46 · kho-danh-thuc.ts:70   const tam = `${TEP}.tam`;    ← HẰNG SỐ
đối chứng: tìm 'process.pid' trong src/lib → 0 chỗ ⇒ nhà CHƯA từng làm kiểu đó
⇒ HAI máy chủ cùng thư mục ⇒ cùng ghi <TEP>.tam ⇒ một bên rename tệp tạm của bên kia
   ⇒ ghi «nguyên tử» thành ghi LẪN. Và 29/08 ĐÃ có hai máy chủ cùng sống.
✅ SỬA: const tam = `${TEP}.${process.pid}.${Date.now()}.tam`;
```

## ⑦ CHUYỂN ĐỔI DỮ LIỆU CŨ — bảng ánh xạ BẮT BUỘC, đặt trong `doc()`
| Mẩu đọc lên | → `trang_thai` | Vì sao |
|---|---|---|
| có `trang_thai` là 1 trong 5 giá trị hợp lệ | giữ nguyên | bản mới |
| ⛔ có `trang_thai`, `da_xu === true` | `xong` | đã chạy rồi, ⛔ được chạy lại |
| ⛔ có `trang_thai`, `da_xu === false` | `cho` | chưa ai nhặt |
| thiếu cả hai, hoặc kiểu lạ | **`het_han`** + `ly_do='du-lieu-cu-la'` | 🔴 **mặc định AN TOÀN là ⛔ CHẠY** |
```
ĐO 30/08: trên đĩa 4 mẩu · da_xu=true 4 · da_xu=false 0
⇒ ⛔ có bảng này thì cả 4 mẩu đọc ra `undefined`, và tuỳ cách viết mà CHẠY LẠI hết hoặc kẹt hết.
```

## ⑧ TÁCH HAI BỆNH — Hermes tách, cả hai cửa nhà đều đã gộp nhầm suốt bốn vòng
```
«hai tab cùng claim MỘT MẨU»   ⇒ ⛔ TỒN TẠI (một tiến trình, đọc-sửa-ghi đồng bộ). ⛔ làm gì cả.
«hai tab cùng CHẠY MỘT PHIÊN»  ⇒ CÓ THẬT, nhưng thuộc **P0-1**, ⛔ phải việc này.
```

## 🧪 NGHIỆM THU v3 — mỗi phép ghi rõ THƯỚC ĐO, và phải THẤT BẠI trên bản CHƯA SỬA
| # | Phép | Thước đo (⛔ đếm chung chung) | Bản chưa sửa |
|---|---|---|---|
| T1 | ghế bận **> 8 phút 30 giây** | mẩu tới sau khi rảnh · `trang_thai='xong'` · `so_lan_thu` ghi đúng số lần | phải TRƯỢT |
| T2 | ép ô bận SAU `/nhan`, TRƯỚC `gui()` (cờ `DEBUG_TRE_SAU_NHAN_MS=15000`) | mẩu về `cho`, `lease_id=null` | phải TRƯỢT |
| T3-đc | hai tab, một yêu cầu, **BẢN CHƯA SỬA** | ĐÚNG 1 claim thành công cho `ma` đó | **dự kiến XANH** ⇒ xanh thì gạch bệnh, ⛔ viết mã |
| T3′ | **HAI máy chủ** cùng `.trang-thai`, một yêu cầu | ① đúng 1 `lease_id` được cấp cho `ma` đó ② ⛔ tệp `.tam` nào của bên này bị bên kia rename | phải TRƯỢT |
| T4 | đổi ghế của ô trong lúc mẩu chờ | `that_bai` + `ly_do='doi-ghe'` · ⛔ gửi sang ghế mới | phải TRƯỢT |
| T5 | bận vượt `HAN_SONG_MS` | `het_han` + `ly_do='qua-han'` · CÒN NHÌN THẤY ≥ 22 phút sau đó | phải TRƯỢT |
| T6 | 100 mẩu ngẫu nhiên | mỗi `ma` có ĐÚNG MỘT trạng thái cuối · tổng `xong+that_bai+het_han` = 100 | phải TRƯỢT |
| T7 | ack bằng `lease_id` SAI | trả 409 · trạng thái ⛔ đổi | phải TRƯỢT |
| T8 | ⑬ bất biến `await` (đã dựng, xem v2.4) | await 0 · function 8 · bản bơm await bị bắt | — |
🔴 **Mọi phép phải in ĐỐI CHỨNG ÂM: chạy trên bản CHƯA SỬA và ghi lại nó TRƯỢT THẾ NÀO.**
Thiếu vế đó thì phép thử ⛔ chứng minh gì — đúng lỗi tôi mắc ở v1.

---

# 🔴 v3.1 — ĐÍNH CHÍNH NẶNG: TÔI CHẨN ĐOÁN SAI BỆNH, VÀ ƯU TIÊN CÓ THỂ SAI THEO

> Tôi chốt con số `HAN_SONG_MS = 8 phút` bằng câu «lượt chạy thật 2–5 phút». **Tôi ⛔ đo câu đó.**
> Đi đo, và số lật đổ cả chẩn đoán lẫn thứ tự ưu tiên.

## ① «Lượt chạy 2–5 phút» — SAI MỘT BẬC. Đo 3.541 lượt thật của 18 ghế:
```
trung vị        20 giây      phân vị 90   75 giây      dài nhất  384 giây (6,4 phút)
lượt > 3 phút   28/3541 = 1%          lượt > 8 phút   0/3541 = 0%
⇒ HẠN 3 PHÚT HIỆN TẠI ĐÃ PHỦ 99% LƯỢT. «Bận quá hạn» là bệnh HIẾM, ⛔ phải bệnh chính.
```

## ② CA THẬT 08:00 — TÔI QUY SAI THỦ PHẠM, và tôi đã báo cả nhà cái sai đó
```
chuông reviewer gửi tôi : 08:00:17 · hết hạn 08:03:17
ô TÔI rảnh              : 07:57:48 → 08:08:43  (655 giây LIỀN)
⇒ CẢ vòng đời chuông nằm TRỌN trong lúc ô tôi RẢNH.
🔴 «Ô tôi bận quá 3 phút» — SAI HOÀN TOÀN. Tôi ráp hai sự thật (chuông chết · tôi đang làm việc)
   thành một quan hệ nhân-quả **⛔ hề đo** ⇒ đúng bẫy ⑰ của chính tôi, lần thứ hai.
```
**Thủ phạm thật, suy từ số:** ô rảnh + mẩu chưa claim + nhịp thăm dò 5 giây ⇒ có người thăm dò thì
phải nhặt trong 5 giây. Nó ⛔ nhặt suốt 180 giây ⇒ **⛔ CÓ AI THĂM DÒ** ⇒ trình duyệt đóng, hoặc
tab ẩn (`document.hidden` ⇒ vòng thăm dò ngủ).
📌 **Đó ĐÚNG là giả thuyết Owner nêu đầu tiên, và tôi đã bác anh ấy — bác SAI.**

## ③ HỆ QUẢ CHO ƯU TIÊN — phải nói thẳng, kẻo lại xây đúng thứ ⛔ ai cần
```
cửa ① trình duyệt ⛔ mở  }
cửa ② tab ẩn            }  ⇒ ĐÂY là ca VỪA XẢY RA THẬT. P0-2a ⛔ chữa được. Chỉ P0-2b chữa.
cửa ③ bận quá hạn         ⇒ P0-2a chữa — nhưng đo ra chỉ 1% lượt chạm tới
cửa ④ claim-rồi-bỏ        ⇒ P0-2a chữa — CÓ THẬT theo mã, nhưng CHƯA ai đo được một ca thật
cửa ⑤ đổi ghế             ⇒ P0-2a chữa — có thật theo mã, chưa có ca thật
cửa ⑥ hai máy chủ         ⇒ CÓ ca thật 29/08
```
🔴 **Câu phải trả lời TRƯỚC khi viết dòng mã nào:** trong các ca MẤT TIN đã xảy ra thật,
bao nhiêu ca do cửa ③④⑤ (P0-2a chữa), bao nhiêu ca do cửa ①② (chỉ P0-2b chữa)?
**Hiện tại: ca đo được DUY NHẤT thuộc cửa ①②.**
⇒ Nếu số nói vậy thì **P0-2b phải lên trước P0-2a**, ⛔ phải như tôi xếp.
📌 Đây đúng bẫy ㉖ — *đo rất kỹ một bệnh mà chưa ai chứng minh là bệnh CHÍNH* — lần này ở tầng
ƯU TIÊN, ⛔ phải ở tầng cơ chế. Sáu vòng soi ⛔ ai hỏi câu này, kể cả hai cửa duyệt.

## ④ VIỆC PHẢI LÀM TRƯỚC — đếm ca mất tin THẬT theo cửa
```
Dựng phép đếm chạy trên .trang-thai + bản ghi phiên: mỗi mẩu KHÔNG tới đích thì xếp vào cửa nào.
⇒ CÓ SỐ rồi mới xếp ưu tiên. ⛔ có số thì mọi thứ tự đều là cảm tính, dù hợp đồng có đẹp tới đâu.
```
⚠️ Số trong v3 (`HAN_SONG_MS` 8 phút) tình cờ VẪN đúng — phủ 100% lượt đo được (dài nhất 6,4 phút).
Nhưng nó đúng vì **may**, ⛔ vì lý do tôi viết. Lý do đã sửa lại ở đây.
