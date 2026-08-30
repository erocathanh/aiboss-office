🔒 reviewer — CHỈ-ĐỌC. ⛔ Đừng đòi nó ghi file: SOUL cấm, nó sẽ từ chối. Bạn tự ghi, và hứng TRỌN đầu ra (> tệp), ⛔ KHÔNG tail/head.
FROM: hermes-aiboss-app-review / TO: Eroca Thanh

### 1. Chẩn đoán có đúng chỗ không

VERDICT: PASS

Bằng chứng:

- `src/components/UngDung.tsx:90-93`
  > `const NHIP_THAM_DO_MS = 5_000;`

- `src/components/UngDung.tsx:1159-1164`
  > `// Chỉ hỏi hộ ô ĐANG CÓ GHẾ và ⛔ KHÔNG đang chạy`  
  > `.filter(({ o }) => o.ns && !o.dangChay && !o.dangNap)`

- `src/lib/kho-danh-thuc.ts:25-26`
  > `export const HAN_YEU_CAU_MS = 3 * 60_000;`

- `src/lib/kho-danh-thuc.ts:84-87`
  > `return !y.da_xu && bayGio - y.luc < HAN_YEU_CAU_MS;`

Chẩn đoán lõi đúng: ô bận bị loại khỏi `dsHoi`; yêu cầu vẫn mang `da_xu=false`, nhưng sau 180 giây `conDung()` không chọn nữa.

PM mô tả sai một chi tiết: yêu cầu không bị vứt ngay và hệ thống không thiếu cơ chế “thử lại”. Trình duyệt đã thăm dò lại mỗi 5 giây; nếu ô rảnh trước 180 giây, yêu cầu sẽ được nhận. Bệnh chính xác là: thời hạn tuyệt đối 180 giây ngắn hơn thời gian bận có thể xảy ra.

Dẫn chiếu `UngDung.tsx:725` đã lỗi thời. Dòng hiện tại là `UngDung.tsx:1159-1163`; dòng 725 hiện thuộc logic nạp bộ ghế, không phải chuông.

### 2. Khẳng định “P0-2a không bị chặn bởi việc thêm khoá”

VERDICT: FAIL

Bằng chứng:

- `src/lib/kho-danh-thuc.ts:17-19`
  > `Đọc-sửa-ghi ở đây đều là lệnh ĐỒNG BỘ, ⛔ không có await xen giữa`  
  > `trong một tiến trình Node, hai yêu cầu ⛔ không chen được vào giữa nhau.`

- `src/lib/kho-danh-thuc.ts:157-168`
  > `const s = donDep(doc(), bayGio);`  
  > `const y = s.hang_doi.find(...)`  
  > `y.da_xu = true;`  
  > `ghi(s);`

- `src/lib/kho-danh-thuc.ts:67-72`
  > `const tam = \`${TEP}.tam\`;`  
  > `fs.writeFileSync(tam, ...)`  
  > `fs.renameSync(tam, TEP);`

- `src/components/UngDung.tsx:1159-1163`
  > `.filter(({ o }) => o.ns && !o.dangChay && !o.dangNap)`

- `src/components/UngDung.tsx:1177-1183`
  > `const o = dsORef.current[i];`  
  > `if (!o?.ns || o.dangChay) continue;`  
  > `void guiRef.current(i, y.cau_hoi, y.tu_ai);`

Trong đúng một tiến trình Node, hai tab không cùng nhận một yêu cầu: `nhanYeuCau()` đọc, đặt `da_xu=true`, rồi ghi bằng mã đồng bộ trước khi request kế tiếp được xử lý.

Nhưng PM đã biến giới hạn “một tiến trình Node” thành bảo đảm hệ thống:

1. Chu trình đọc-sửa-ghi không có khoá liên tiến trình. Nếu có hai worker/server process, cả hai có thể đọc cùng bản `da_xu=false`; ghi nguyên tử chỉ chống JSON dở, không chống lost update hoặc double-claim. Tệ hơn, cả hai dùng chung tên tệp tạm `.tam`.
2. Hai tab có trạng thái `dangChay` cục bộ độc lập. Một tab cũ có thể khai ô rảnh, thắng quyền nhận và chạy phiên trong khi tab kia đang chạy cùng phiên. `da_xu` chống hai tab nhận cùng mẩu trong một tiến trình, nhưng không tạo khoá chạy phiên có thẩm quyền ở máy chủ.
3. Sau khi máy chủ đã đặt `da_xu=true`, client còn kiểm lại `o.dangChay`. Nếu ô vừa bận trong khoảng chờ mạng, dòng 1182 bỏ mẩu đã claim; yêu cầu không còn đường thử lại.

Vì vậy, “P0-2a không thêm runner mới” đúng theo nghĩa hẹp, nhưng không đủ để kết luận “làm ngay không cần khoá/protocol claim”. Tối thiểu cần lease/ack hoặc cơ chế trả mẩu về hàng nếu client chưa thực sự khởi chạy.

### 3. “Giữ + thử lại” có đẻ rung dai dẳng không

VERDICT: FAIL

Bằng chứng:

- `ai/NGHIEN-CUU-heartbeat.md:50-57`
  > `ô bận ⇒ GIỮ trong hàng, thử lại ở vòng thăm dò sau`

- `src/components/UngDung.tsx:90-93`
  > `const NHIP_THAM_DO_MS = 5_000;`

- `src/lib/kho-danh-thuc.ts:25-26`
  > `Yêu cầu quá hạn này mà chưa ai xử → BỎ.`  
  > `HAN_YEU_CAU_MS = 3 * 60_000`

- `src/lib/kho-danh-thuc.ts:42-44`
  > `luc: number;`  
  > `da_xu: boolean;`  
  > `xu_luc: number | null;`

Đề xuất không xác định trần mới, trạng thái số lần thử, dead-letter hay cách báo hết hạn. Nếu “giữ” đồng nghĩa bỏ hạn 3 phút, ghế bận 40 phút sẽ tự chạy một chỉ thị 40 phút tuổi mà không có xác nhận lại.

Trần đề nghị:

- Tối đa 60 lần thăm dò, tương đương 5 phút ở nhịp 5 giây.
- Tính theo `luc` gốc; tuyệt đối không gia hạn `luc` mỗi lần thử.
- Hết hạn thì chuyển sang trạng thái `het_han`/dead-letter và hiện rõ cho bên gọi hoặc Owner; không xoá im lặng.
- Chỉ thị quá 5 phút không tự chạy. Muốn chạy phải rung lại hoặc xác nhận lại.

Với việc có thể thay đổi dữ liệu, gửi tin, deploy hoặc gọi agent khác, để mẩu chết có báo cáo an toàn hơn tự thi hành sau 40 phút.

### 4. Phép nghiệm thu PM đề ra có lỗ không

VERDICT: FAIL

Bằng chứng:

- `ai/NGHIEN-CUU-heartbeat.md:79-86`
  > `Rung một ghế ĐANG chạy dở. Ghế xong lượt ⇒ câu hỏi PHẢI tự tới`  
  > `ĐỐI CHỨNG DƯƠNG: rung một ghế đang RẢNH ⇒ tới ngay`

- `src/lib/kho-danh-thuc.ts:165-168`
  > `y.da_xu = true;`  
  > `y.xu_luc = bayGio;`  
  > `ghi(s);`  
  > `return y;`

- `src/components/UngDung.tsx:1180-1183`
  > `const o = dsORef.current[i];`  
  > `if (!o?.ns || o.dangChay) continue;`  
  > `void guiRef.current(...)`

Phép thử có thể xanh trong một lượt bận ngắn nhưng vẫn bỏ sót ít nhất bốn bệnh:

1. Race claim-rồi-bỏ: request được máy chủ đánh dấu đã xử, sau đó ô chuyển sang bận trước dòng 1182; client bỏ request và máy chủ không phát lại.
2. Hai tab: tab A đang chạy, tab B có state cũ là rảnh; tab B nhận và có thể mở tiến trình thứ hai cho cùng phiên.
3. Bận dài hơn TTL: test dùng lượt dưới 3 hoặc 5 phút sẽ xanh, còn lượt 40 phút vẫn mất hoặc chạy mẩu quá cũ.
4. Đổi ghế trong lúc chờ: phép thử không kiểm câu hỏi còn tới đúng `ma_nhan_su` ban đầu.

Nghiệm thu phải thêm:

- Ép ô chuyển sang bận sau khi `/api/danh-thuc/nhan` trả về nhưng trước khi gọi `gui()`.
- Mở hai tab cùng trỏ một ô; xác minh chỉ một tiến trình chạy.
- Ca bận vượt TTL; xác minh mẩu vào dead-letter, không chạy muộn.
- Đổi ghế của ô trong lúc mẩu chờ; xác minh mẩu không được gửi sang ghế mới.
- Đếm theo `ma_yeu_cau`: mỗi mã phải có đúng một trạng thái cuối `ack`, `expired` hoặc `cancelled`.

### 5. PM có thiên vị phương án nhà mình không

VERDICT: FAIL

Bằng chứng cho kết luận của PM:

- `ai/NGHIEN-CUU-heartbeat.md:95-104`
  > `hàng đợi ĐÃ nằm trên ĐĨA rồi`  
  > `RAILWAY Ở XA, NÓ ⛔ NHÌN THẤY LÚC NÀO GHẾ RẢNH`

- `ai/NGHIEN-CUU-heartbeat.md:125-128`
  > `MÔ HÌNH AN TOÀN = KÉO`  
  > `Máy nhà tỉnh dậy thì HỎI RA lấy về.`

Phản chứng mạnh nhất: Railway không cần tự biết ghế rảnh. Nó có thể làm broker có lease:

1. Máy nhà hoặc trình duyệt chỉ `claim` khi thấy ghế rảnh.
2. Nếu ghế bận sau claim thì `nack` hoặc để lease hết hạn.
3. Khi thực sự sinh tiến trình thì `ack`.
4. Broker giữ idempotency key, số lần thử, TTL, dead-letter và trạng thái để bên gửi tra.
5. Hai tab cùng kéo vẫn chỉ một tab giữ lease.
6. Máy ngủ hoặc app restart không làm bên gửi mất khả năng quan sát yêu cầu.

Đây chính là cách phá cả race hai consumer và mất mẩu sau claim. Lập luận “máy nhà đã tỉnh thì Railway thừa” không bác được các giá trị lease, ack, quan sát trạng thái và hàng đợi sống khi máy tắt.

Tuy nhiên, phản chứng này không chứng minh Railway là lựa chọn nên dùng cho P0-2a. Cùng protocol lease/ack/dead-letter có thể làm trên đĩa máy nhà với ít phụ thuộc hơn. Kết luận hợp lý phải là “Railway không cần thiết và chi phí cao cho ca một máy”, không phải “Railway không giúp được”.

### 6. Thứ tự triển khai

VERDICT: FAIL

Bằng chứng:

- `ai/NGHIEN-CUU-heartbeat.md:71-77`
  > `1. P0-2a`  
  > `2. P0-1 khoá có hạn dùng`  
  > `3. P0-2b máy chủ tự chạy`

- `src/lib/kho-danh-thuc.ts:150-168`
  > `lấy yêu cầu ... rồi ĐÁNH DẤU ĐÃ XỬ ngay`  
  > `y.da_xu = true;`  
  > `ghi(s);`

- `src/lib/kho-phien.ts:74-79`
  > `const s = doc();`  
  > `s[maO] = ...`  
  > `ghi(s);`

- `src/lib/kho-phien.ts:43-48`
  > `const tam = \`${TEP}.tam\`;`  
  > `fs.writeFileSync(tam, ...)`  
  > `fs.renameSync(tam, TEP);`

- `src/app/api/o/route.ts:53-67`
  > `const cu = layTatCa()[maO];`  
  > `...`  
  > `datO(maO, maNhanSu, maPhien);`

Cảnh báo không làm P0-2b trước khoá là đúng, nhưng P0-2a cũng không nên triển khai trước nếu nó chỉ kéo dài TTL. Kéo dài thời gian sống làm tăng cửa sổ gặp tab cũ, đổi ghế và mẩu lỗi thời mà chưa sửa protocol claim.

Thứ tự nên là:

1. Tách hai loại khoá:
   - Khoá/lease chạy theo phiên hoặc ghế, có hạn dùng và owner token.
   - Lease cho từng `ma_yeu_cau`, có `claim → ack/nack/expire`.
2. Gộp vào bước này kiểm tra bất biến đích: lúc claim và lúc ack, `ma_o` vẫn phải chứa đúng `ma_nhan_su`.
3. Sau đó bật P0-2a với TTL hữu hạn, số lần thử và dead-letter có quan sát.
4. Cuối cùng mới thêm P0-2b; cả browser lẫn server phải đi qua cùng lease chạy, không có đường tắt.
5. Khi thêm P0-2b mới bổ sung gộp theo ghế, ưu tiên, trần riêng và công tắc tắt.

Không nên gộp toàn bộ P0-1 và P0-2b thành một thay đổi lớn. Nhưng queue lease/ack phải gộp với P0-2a vì đó là một protocol; triển khai retry trước rồi vá claim sau tạo trạng thái trung gian không an toàn.

## PHÁT HIỆN NGOÀI ĐỀ

1. Có đường gửi câu hỏi sang sai ghế khi ô đổi người trong lúc chờ.

   - `src/lib/kho-danh-thuc.ts:35-45` lưu cả `ma_o` và `ma_nhan_su`.
   - `src/app/api/danh-thuc/nhan/route.ts:29-32` trả về `ma`, `tu_ai`, `cau_hoi`, `luc` nhưng bỏ `ma_nhan_su`.
   - `src/components/UngDung.tsx:1180-1183` chỉ kiểm `o.ns` tồn tại và không bận; không so `o.ns.ten` với người nhận ban đầu.

   P0-2a càng giữ mẩu lâu thì xác suất đổi ghế càng tăng.

2. API báo thành công quá mức.

   - `src/app/api/danh-thuc/route.ts:117-118`
     > `Trình duyệt đang mở ô đó sẽ tự gửi trong ~5 giây.`

   Câu này sai khi tab ẩn, ô bận, tab cũ, đổi ghế hoặc request hết hạn. HTTP 200 chỉ chứng minh đã xếp hàng, không chứng minh sẽ gửi sau khoảng 5 giây.

3. Ghi nguyên tử đang bị nhầm với khoá.

   - `src/lib/kho-phien.ts:45-48` và `src/lib/kho-danh-thuc.ts:69-72` dùng tệp tạm rồi `renameSync`.
   
   Cách này chống tệp JSON dở khi tiến trình chết, nhưng không chống hai chu trình đọc-sửa-ghi đè nhau. Nếu P0-1 chỉ thêm rename nguyên tử lần nữa thì không giải quyết cạnh tranh.

VERDICT: PASS 1/6 · FAIL 5/6 · KHÔNG-VERIFY 0/6 · VERDICT TỔNG: KHÔNG ĐẠT — no-go cho P0-2a theo bản hiện tại; phải chốt protocol lease/ack, TTL hữu hạn và kiểm đúng ghế trước khi kéo dài retry.
