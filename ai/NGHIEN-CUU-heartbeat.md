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
