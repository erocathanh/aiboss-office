FROM: hermes-aiboss-app-review / TO: Eroca Thanh

Phạm vi: commit f87322cf0e2652114fe97d26870084b5ebc4536e.

Lưu ý: trong lúc soi, HEAD của worktree đã bị tiến trình khác đẩy từ f87322c sang 18c7424. Tôi khóa verdict vào nội dung bất biến của f87322c bằng:

`git show f87322c:src/lib/may-chay-nen.ts`

Không dựng, không chạy app, không sửa tệp.

1. [FAIL] CHỐNG CHẠY TRÙNG — chốt lấy mẩu

Đường lỗi qua lease:

1) Trình duyệt nhận mẩu; `nhanYeuCau` đặt trạng thái `dang_giu`, người giữ và hạn 30 giây tại `src/lib/kho-danh-thuc.ts:502-505`.
2) Trình duyệt bị treo/ngủ trước khi gọi `gui()`. Khi lease hết, mẩu được trả về `cho` tại `src/lib/kho-danh-thuc.ts:282-290`.
3) Sau 45 giây không thăm dò, bộ nền vượt chốt trình duyệt tại `src/lib/may-chay-nen.ts:76-80`, nhận lại mẩu tại `src/lib/may-chay-nen.ts:82-85`, rồi chạy tại `src/lib/may-chay-nen.ts:90-105`.
4) Trình duyệt tỉnh lại với bản mẩu cũ và gọi `gui()` trước khi xác nhận tại `src/components/UngDung.tsx:1823-1838`.
5) Chỉ sau khi lượt trình duyệt đã bắt đầu, nó mới gọi xác nhận tại `src/components/UngDung.tsx:1840-1854`.
6) `xacNhanDaGiao` thấy mẩu đã là `da_giao` thì trả thành công ngay, không kiểm lại `giu_boi`, tại `src/lib/kho-danh-thuc.ts:406-411`.

Kết quả: bộ nền và trình duyệt cùng chạy một câu. Chính mã giao diện đã thừa nhận lớp lỗi này tại `src/components/UngDung.tsx:1844-1848`.

Ngoài ra, chốt lấy-sửa-ghi chỉ tuần tự trong một tiến trình Node, theo giới hạn tự khai tại `src/lib/kho-danh-thuc.ts:18-20`. `instrumentation.register()` lại được gọi cho mỗi tiến trình, theo `src/instrumentation.ts:2`. Với hai tiến trình máy chủ, hai bên có thể cùng đọc bản `cho` trước khi bên kia ghi; không có CAS hay khóa liên tiến trình.

Vế “xác nhận thất bại nhưng lượt vẫn chạy” riêng trong bộ nền được chặn đúng: `if (!xn.xong) continue` tại `src/lib/may-chay-nen.ts:84-85`. Nhưng toàn tiêu chí vẫn FAIL vì đường lease phía trên đủ gây chạy đúp.

2. [FAIL] CHỐNG CHẠY TRÙNG — chốt ghế đang chạy

Tại commit f87322c:

- Ảnh `dsViec()` chỉ được lấy một lần trước vòng lặp: `src/lib/may-chay-nen.ts:65`.
- Mọi mẩu sau đó chỉ hỏi ảnh cũ: `src/lib/may-chay-nen.ts:68-73`.
- Lượt được khởi chạy không `await`: `src/lib/may-chay-nen.ts:90-105`.
- Không có thao tác thêm ghế vừa nhận vào `dangChayTheoGhe`.

Đường lỗi:

1) Ảnh đầu vòng chưa có ghế A.
2) Mẩu thứ nhất của A vượt chốt và gọi `chayMotLuot`.
3) Mẩu thứ hai của cùng A, nhưng ở ô khác, vẫn nhìn ảnh cũ nên tiếp tục vượt chốt.
4) Hai tiến trình A chạy đồng thời.

Nếu hai mẩu cùng ô, dấu thăm dò do chính `nhanYeuCau` ghi có thể tình cờ chặn mẩu sau; điều đó không cứu được trường hợp cùng ghế ở hai ô. Một mẩu cũ có thể nhắm ô trước khi Owner chuyển ghế, còn mẩu mới nhắm ô hiện tại.

HEAD mới 18c7424 đã xuất hiện thêm `daNhanTrongVong`, nhưng đó không thuộc commit f87322c đang được yêu cầu chấm.

3. [PASS] CHỐNG CHẠY TRÙNG — còn trình duyệt thì nhường

- Mặc định đóng an toàn: `layThamDo = () => Date.now()` tại `src/lib/may-chay-nen.ts:122`.
- Mọi mẩu trong `raMotVong` đều phải qua phép kiểm tại `src/lib/may-chay-nen.ts:74-80`.
- `instrumentation.register()` trả ngay nếu không phải Node tại `src/instrumentation.ts:18-20`.
- Trong nhánh Node, nguồn thăm dò được nạp và cắm tại `src/instrumentation.ts:21-26`.
- `bat()` chỉ được gọi sau đó tại `src/instrumentation.ts:28`.

Tìm usage cho thấy `datNguonThamDo` chỉ có định nghĩa trong `may-chay-nen.ts` và lời gọi tại `instrumentation.ts`; không thấy lối production hiện tại đảo thứ tự `bat()` trước `datNguonThamDo()`.

PASS này chỉ áp dụng chốt nhường trình duyệt. Nó không cứu đường lease chạy đúp ở tiêu chí 1.

4. [FAIL] BA MẮT XÍCH CỦA LƯỢT VÔ HÌNH

① Sổ tiến trình: có mã nối.

- PID được nhận qua `khiSinh`: `src/lib/chay-mot-luot.ts:138-141`.
- `dangKyViec` ghi theo ô tại `src/lib/kho-tien-trinh.ts:27-29`.
- Dọn đúng PID tại `src/lib/chay-mot-luot.ts:161-163` và `src/lib/kho-tien-trinh.ts:31-36`.

③ Buộc đúng mã ô: có mã nối.

- `maO` là đầu vào bắt buộc tại `src/lib/chay-mot-luot.ts:62-70`.
- Khi Claude phát mã phiên, `datO(maO, maNhanSu, mau.ma_phien)` được gọi tại `src/lib/chay-mot-luot.ts:143-147`.

② Chữ đọc lại: chưa đủ bằng chứng để PASS.

- Sink của bộ nền cố ý rỗng tại `src/lib/may-chay-nen.ts:91-97`.
- Tác giả tự ghi đây chưa phải phép đo lượt nền thật tại `src/lib/chay-mot-luot.ts:20-26`.
- `/api/phien` đúng là dựng đường `.jsonl` từ thư mục làm việc tại `src/lib/doc-phien.ts:24-57`, rồi đọc `<maPhien>.jsonl` tại `src/lib/doc-phien.ts:280-288`.
- `chayAgent` spawn Claude với `cwd: ts.thuMuc` tại `src/lib/chay-agent.ts:216-223`.

Nhưng không có lượt nền thật trong bằng chứng của commit để chứng minh: spawn → sinh đúng JSONL → `datO` nhận đúng session ID → `/api/phien` đọc được cả câu hỏi lẫn câu trả lời. Theo tiêu chuẩn đối kháng, lời khai kiến trúc không thay phép đo end-to-end.

Thiếu mắt xích được đo ⇒ toàn tiêu chí FAIL.

5. [FAIL] CÔNG TẮC

`bat()` có kiểm tra đúng:

- Chặn khi đã bật: `src/lib/may-chay-nen.ts:129-130`.
- Chặn khi `CHAY_NEN !== '1'`: `src/lib/may-chay-nen.ts:131`.
- Timer chỉ được dựng sau đó: `src/lib/may-chay-nen.ts:132-137`.

Nhưng `raMotVong` được export công khai tại `src/lib/may-chay-nen.ts:58`, và bản thân hàm không kiểm `CHAY_NEN` hay `dangChay`.

Đường bỏ qua:

1) Import `raMotVong`.
2) Gọi thẳng `raMotVong()`.
3) Hàm đọc hàng đợi, nhận, xác nhận và gọi `chayMotLuot` tại `src/lib/may-chay-nen.ts:60-109`.
4) Không đi qua `bat()`.

Chú thích còn nói rõ hàm được tách để “nghiệm thu gọi thẳng” tại `src/lib/may-chay-nen.ts:54-58`. Vì vậy claim “bộ nền không thể chạy nếu công tắc tắt” là sai ở biên module.

6. [FAIL] LÕI TÁCH RA LÀM MẤT CHỐT

Nhân sự vẫn được kiểm trong lõi tại `src/lib/chay-mot-luot.ts:97-100`. Nhưng hai chốt quan trọng không được bộ nền thay thế:

a) Không kiểm phiên tồn tại trước `--resume`

- HTTP kiểm `coPhien` hai lần rồi mới quyết định tại `src/app/api/chat/route.ts:68-87`.
- Bộ nền đọc thẳng `ma_phien` từ sổ tại `src/lib/may-chay-nen.ts:87-88`.
- Lõi truyền mã đó vào `chayAgent` tại `src/lib/chay-mot-luot.ts:127-130`.
- `chayAgent` thêm `--resume` trực tiếp tại `src/lib/chay-agent.ts:209-211`.

Đường lỗi: sổ ô giữ mã phiên đã mất/hỏng → bộ nền không gọi `coPhien` → truyền `--resume` mù → Claude có thể mở ngữ cảnh sai hoặc thất bại sau khi mẩu đã bị đánh dấu `da_giao`.

b) Không chặn phiên đang chạy ngoài app

- HTTP gọi `dangChay` tại `src/app/api/chat/route.ts:90-112`.
- Chốt này có bằng chứng tiến trình đang giữ mã phiên tại `src/lib/doc-phien.ts:439-461`.
- Bộ nền chỉ nhìn `dsViec()` trong RAM app tại `src/lib/may-chay-nen.ts:65-73`; nó không gọi `dangChay`.

Đường lỗi: terminal đang `--resume` phiên P nhưng không nằm trong `kho-tien-trinh` của app → bộ nền coi ghế rảnh → cũng `--resume P` → hai tiến trình ghi cùng JSONL.

Chốt mức dùng của hàng đánh thức đã được áp dụng lúc xếp mẩu tại `src/app/api/danh-thuc/route.ts:101-105`, nên đó không phải nguyên nhân FAIL chính. FAIL vì thiếu `coPhien` và `dangChay`.

7. [PASS] NODE/EDGE

- Không có static import của `may-chay-nen` hoặc `chay-agent` ở đầu `instrumentation.ts`.
- Nhánh khác Node thoát trước tại `src/instrumentation.ts:18-20`.
- Hai dynamic import chỉ nằm sau chốt runtime tại `src/instrumentation.ts:21-22`.
- `node:child_process` nằm sâu trong `src/lib/chay-agent.ts:1`, được kéo qua chuỗi dynamic import phía Node.

Ở mức mã nguồn, cấu trúc này đủ để Next loại đường spawn khỏi nhánh Edge. Không có phép dựng bó để kiểm tra artifact vì đề bài cấm dựng.

NGOÀI ĐỀ

1) Bộ nền tự giả làm thăm dò trình duyệt.

`nhanYeuCau` luôn gọi `ghiNhanThamDo` tại `src/lib/kho-danh-thuc.ts:482-484`, kể cả người gọi là `NGUOI_GIU_NEN`. Sau khi bộ nền nhận một mẩu, dấu của chính nó có thể làm chốt tại `src/lib/may-chay-nen.ts:76-80` kết luận nhầm “có trình duyệt” trong 45 giây. Đây là lỗi trì hoãn, không phải chống chạy trùng.

2) Đường nền không ghi `moc_ket_thuc`.

Đối chứng dương:

`git grep -n -F 'ghiMocKetThuc' -- src`

Output có lời gọi ở:

- `src/app/api/chat/route.ts:243`
- `src/app/api/fork/route.ts:139`

Không có lời gọi trong `may-chay-nen.ts` hoặc `chay-mot-luot.ts`. Trong khi `dangChay` coi phiên mới sửa nhưng không có mốc sở hữu là đang bận tại `src/lib/doc-phien.ts:463-494`. Lượt nền vừa xong có thể bị giao diện/chốt sau coi là còn bận trong tối đa năm phút.

VERDICT: PASS 2/7 · FAIL 5/7 · KHÔNG-VERIFY 0/7 — NO-GO: f87322c còn ít nhất hai đường chạy trùng có thể làm Owner trả tiền hai lần.
