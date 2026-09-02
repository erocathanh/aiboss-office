# Học từ bộ ảnh Owner đăng Facebook ngày 29/08/2026

> 👤 `hermes-build-app` · 📅 02/09/2026 19:24 BST · 🔄 v1.0
> Phạm vi: đọc đủ 10 ảnh PNG và `caption.txt`; đối chiếu với quy trình hiện tại của `aiboss-app-chat`; không sửa mã, không build, không commit.

## Kết luận ngắn

Bộ ảnh không chỉ nói “gọi ba AI”. Cách làm cốt lõi là:

1. Một đề bài chung, một nguồn gốc chung và tiêu chí chung.
2. Tách nơi làm để các phương án không ghi đè hoặc làm nhiễu nhau.
3. Cho các phương án chạy độc lập, rồi so bằng tiêu chí đã định trước thay vì cảm tính.
4. Con người giữ quyền duyệt; chỉ bản thắng mới được đưa vào bản chính.
5. Dọn phần không dùng bằng một bước có chủ đích; việc dọn không tự xảy ra chỉ vì đã chọn bản thắng.

Với dự án này, phần nên áp ngay là “cùng nền, tách worktree, nghiệm thu theo tiêu chí, đóng băng và neo đúng artifact, chỉ nhập bản thắng”. Phần không nên chép nguyên là “ba nhà cung cấp AI bên trong app” và “Owner phải duyệt mọi việc”: `aiboss-app-chat` hiện chỉ phục vụ các ghế Claude Code, còn công việc thường ngày do PM nghiệm thu; Owner giữ các cửa production, dữ liệu thật, thay đổi kiến trúc và quyết định sản phẩm.

## Nguồn và mức phủ

Thư mục nguồn chỉ được đọc:

`/Users/erocathanh/2 THANH/content/fanpage/2026.08/2026.08.29`

Đã đọc được: **10/10 ảnh** và **1/1 tệp chữ**. Tất cả chữ chính trong ảnh đều rõ. Không thấy tên người thật, số điện thoại, tin nhắn khách, khoá hoặc token trong 10 ảnh.

Kích thước đo từ tệp: `1.PNG`, `4.PNG`, `5.PNG`, `6.PNG` là 1086×1448; `2.PNG`, `3.PNG`, `7.PNG`, `8.PNG`, `9.PNG`, `10.PNG` là 1024×1536.

## Từng tệp nói gì

### `caption.txt`

Bài đăng đặt vấn đề: nhà sáng tạo nội dung thường không thiếu AI mà thiếu cách lấy bản tốt nhất nhanh hơn. Thay vì mở ba ứng dụng và chép qua lại giữa Gemini, ChatGPT và Claude, người dùng ra lệnh trong một ô chat trên điện thoại; hệ thống cho ba AI chạy song song, mỗi AI làm một phương án, người dùng so sánh, chọn và chỉ giữ bản thắng. Caption yêu cầu mở ảnh 1 rồi vuốt đủ 10 ảnh.

Điểm cần phân biệt: “một ô chat trên điện thoại” là lớp giao lệnh; công việc thật theo ảnh vẫn chạy trên MacBook và các khu làm việc riêng.

### `1.PNG` — tổng quan luồng điều khiển từ xa và làm song song

Tiêu đề: **“LÀM 1 LẦN – SO SÁNH 3 CÁCH / CHỌN NGAY BẢN TỐT NHẤT!”**

Bốn mắt xích được vẽ:

1. Bạn ra yêu cầu từ iPhone.
2. Claude Remote Control chuyển lệnh về MacBook.
3. MacBook tạo các môi trường làm việc riêng.
4. Nhiều AI làm song song mà không đè kết quả của nhau.

Sơ đồ bên phải tách từ MacBook thành “Công việc A/B/C”, mỗi việc có “Môi trường riêng A/B/C”. Lợi ích ảnh tự nêu: không đè file, dễ so sánh phương án, dễ giữ bản tốt nhất.

Đây là ảnh định vị giá trị, chưa chỉ ra câu lệnh kỹ thuật hay cách xác định “tốt nhất”.

### `2.PNG` — vai trò trong quy trình

Tiêu đề: **“BƯỚC 2 – AI NÀO LÀM VIỆC GÌ?”** và câu “Mỗi thành phần có một vai trò riêng trong quy trình.”

Chuỗi vai trò:

- iPhone (Bạn): nơi ra lệnh và duyệt kết quả; người dùng giao yêu cầu, theo dõi tiến độ và duyệt.
- Claude Remote Control: cầu nối điều khiển từ xa; chuyển lệnh từ iPhone về MacBook và truyền kết quả ngược lại.
- MacBook: nơi chạy toàn bộ công việc thật và lưu dữ liệu/xử lý tác vụ nặng.
- Bộ điều phối công việc: phân chia yêu cầu và giao cho AI phù hợp.
- AI 1/2/3: mỗi AI tạo một phiên bản A/B/C theo cùng yêu cầu.
- Bộ so sánh: đọc, đánh giá và phân tích các phiên bản, chỉ ra ưu/nhược điểm.
- Người dùng: xem kết quả so sánh và chọn bản phù hợp nhất.

Khối “Hiểu nhanh” nhấn mạnh người dùng không làm tay từng bước; hệ thống chia và xử lý; người dùng tập trung duyệt và chọn.

### `3.PNG` — “phiên làm việc riêng”

Tiêu đề: **“BƯỚC 3 – ‘PHIÊN LÀM VIỆC RIÊNG’ LÀ GÌ?”**

Một “DỰ ÁN CHÍNH (BẢN GỐC)” chứa định hướng, tài liệu gốc và file ban đầu. Từ đó tách ba khu riêng cho Gemini, ChatGPT và Claude. Mỗi khu tạo một “Kịch bản video” riêng, lần lượt là phiên bản 1, 2, 3 và mang phong cách riêng của AI đó.

Ảnh phân biệt:

- Giống nhau: cùng xuất phát từ một dự án gốc.
- Khác nhau: mỗi AI viết một phiên bản riêng, nội dung không giống nhau.

Lợi ích ảnh nêu: không ghi đè lên nhau, thử nhiều hướng khác nhau, dễ quay lại bản gốc nếu cần.

### `4.PNG` — đề bài phải rõ trước khi chạy

Tiêu đề: **“BƯỚC 4 – VIẾT YÊU CẦU THẬT RÕ NGAY TỪ ĐẦU”**.

Năm thành phần của yêu cầu:

1. Chủ đề: video nói về điều gì.
2. Người xem là ai.
3. Mục tiêu video: muốn người xem hiểu hay làm gì.
4. Giọng điệu mong muốn: nghiêm túc, gần gũi hay truyền cảm hứng.
5. Độ dài và cấu trúc, ví dụ 60–90 giây, có mở đầu, nội dung chính và kết thúc.

Ví dụ trong ảnh: yêu cầu ba kịch bản video về AI hỗ trợ kinh doanh, dài 60–90 giây, dễ hiểu, có mở đầu thu hút và lời kêu gọi hành động ở cuối.

Tóm tắt của ảnh: một file đích, cùng tiêu chí cho cả ba AI, cùng điểm xuất phát để so sánh công bằng. Ảnh cũng giải thích “brief” là bản mô tả yêu cầu.

### `5.PNG` — tạo ba khu làm việc riêng

Tiêu đề: **“BƯỚC 5 – TẠO 3 KHU LÀM VIỆC RIÊNG CHO 3 AI”**.

Ba giai đoạn:

1. Dự án chính/bản gốc cung cấp một yêu cầu chung và file gốc.
2. Tách ra ba khu của Gemini, ChatGPT, Claude; mỗi khu “không ảnh hưởng khu khác”.
3. Mỗi AI bắt đầu trong khu của mình, nhận cùng một yêu cầu và tạo phiên bản riêng.

Ý chính được ảnh chốt thành ba vế: cùng đề bài; khác nơi làm; kết quả tách bạch. Câu “Không làm chung một chỗ nếu muốn so sánh sạch” là điểm kỹ thuật quan trọng nhất của ảnh này.

### `6.PNG` — chạy song song nhưng không giẫm lên nhau

Tiêu đề: **“BƯỚC 6 – 3 AI CÙNG LÀM, NHƯNG KHÔNG GIẪM LÊN NHAU”**.

Ảnh minh hoạ ba luồng độc lập và gán ví dụ về điểm mạnh:

- Gemini: nhiều ý tưởng, sáng tạo.
- ChatGPT: logic, rõ ràng, dễ triển khai.
- Claude: mạch lạc, diễn đạt mượt.

Mỗi AI đi từ khu làm việc riêng tới file kịch bản riêng. Kết luận: cùng một mục tiêu nhưng có ba góc nhìn để chọn.

Cảnh báo ở cuối ảnh rất quan trọng: hệ thống chỉ tách nơi làm nội dung; điều đó **không có nghĩa mọi thứ khác đều tự tách hoàn toàn**. Đây là giới hạn của cơ chế, không phải dòng phụ.

Các “điểm mạnh” theo tên mô hình chỉ là ví dụ minh hoạ trong ảnh, không phải quy luật đã được đo cho mọi task.

### `7.PNG` — so sánh bằng tiêu chí

Tiêu đề: **“BƯỚC 7 – SO SÁNH VÀ CHẤM THEO TIÊU CHÍ”**; phụ đề yêu cầu không chọn theo cảm tính.

Sáu tiêu chí minh hoạ:

1. Mở đầu có thu hút không.
2. Nội dung có rõ không.
3. Có dễ quay video không.
4. Thông điệp có dễ hiểu không.
5. Kêu gọi hành động có mạnh không.
6. Có phù hợp thương hiệu không.

Bảng dùng ba mức: tốt/rất phù hợp; trung bình/ổn; cần cải thiện. Bộ so sánh phải đọc cả ba phiên bản, chỉ ra điểm mạnh/yếu của từng bản và gợi ý bản nên chọn nhất theo mục tiêu.

Điểm cốt lõi là “tiêu chí có trước quyết định”. Các dấu chấm cụ thể dành cho Gemini/ChatGPT/Claude trong ảnh chỉ là ví dụ, không phải kết quả benchmark có bằng chứng.

### `8.PNG` — con người duyệt cuối

Tiêu đề: **“BƯỚC 8 – BẠN LÀ NGƯỜI DUYỆT CUỐI CÙNG”**; AI chỉ đề xuất, người quyết định cuối cùng vẫn là bạn.

Ảnh minh hoạ Gemini được chọn vì rõ hơn, gọn hơn, ít phải chỉnh thêm và phù hợp mục tiêu video hơn. Hai bản còn lại vẫn có phần mô tả ưu điểm riêng. Quy trình duyệt gồm:

1. Bộ so sánh đọc và chấm theo tiêu chí.
2. Người dùng xem, cân nhắc và quyết định.
3. Phiên bản thắng trở thành bản được chọn.

Ghi nhớ: đọc bản tóm tắt, chọn một bản tốt nhất, có thể yêu cầu chỉnh thêm, và chưa chọn thì chưa đưa vào bản chính.

### `9.PNG` — chỉ đưa bản thắng vào bản chính

Tiêu đề: **“BƯỚC 9 – ĐƯA BẢN THẮNG VÀO BẢN CHÍNH”**; chỉ bản được duyệt mới đi vào tài liệu chính.

Ảnh cho phiên bản Gemini/A thắng, hai bản B/C không được nhập. Lý do chỉ đưa một bản: bản được chọn trở thành kịch bản chính; bản chính sạch và gọn; không nhập cả ba cùng lúc; chỉ giữ phương án tốt nhất. Bản chính được gọi là “nội dung thật” và là nơi team tiếp tục làm.

Kết quả ảnh chốt: một bản thắng thành bản chính; hệ thống gọn, rõ, dễ dùng và dễ quản lý.

### `10.PNG` — dọn hai phương án còn lại

Tiêu đề: **“BƯỚC 10 – TỰ ĐỘNG DỌN 2 PHƯƠNG ÁN CÒN LẠI”**; giữ bản thắng, dọn phần không dùng để hệ thống gọn.

Trước khi dọn: ba phiên bản ứng viên, ba khu riêng, nhiều lựa chọn. Sau khi dọn: chỉ còn bản chính/bản thắng; hai khu không chọn được đánh dấu đã xoá.

Ba lưu ý của chính ảnh:

- Việc dọn không tự xảy ra chỉ vì chọn bản thắng.
- Cần có quy trình hoặc lệnh tự động để dọn phần còn lại.
- Mục tiêu là gọn, dễ quản lý và ít nhầm lẫn.

Dải “Tóm tắt 10 bước” liệt kê: hiểu cách hệ thống chạy; biết vai trò từng phần; tạo khu làm việc riêng; viết yêu cầu rõ; tạo ba khu cho ba AI; ba AI làm song song; so sánh theo tiêu chí; người dùng duyệt bản tốt nhất; đưa bản thắng vào bản chính; dọn hai bản còn lại.

Dòng kêu gọi hành động cuối ảnh: comment “RẺ NHANH” để nhận video hướng dẫn và skill chạy quy trình.

## Nguyên tắc và ví dụ minh hoạ — không trộn hai loại

| Loại | Điều rút ra | Phần trong ảnh chỉ là ví dụ |
|---|---|---|
| Nguyên tắc | Một đầu vào chuẩn cho mọi ứng viên | Kịch bản video AI hỗ trợ kinh doanh dài 60–90 giây |
| Nguyên tắc | Cùng nền và cùng tiêu chí để so sánh công bằng | Ba logo Gemini, ChatGPT, Claude |
| Nguyên tắc | Tách nơi ghi để không đè nhau | Ba thư mục màu xanh lá, xanh dương, cam |
| Nguyên tắc | Các ứng viên làm độc lập trước khi nhìn nhau | Mỗi AI viết một kịch bản riêng |
| Nguyên tắc | Chấm theo tiêu chí gắn với mục tiêu, không theo cảm giác | Sáu tiêu chí dành cho video |
| Nguyên tắc | Người có thẩm quyền duyệt trước khi nhập bản chính | Trong ảnh, “Bạn” chọn Gemini |
| Nguyên tắc | Bản chính chỉ nhận artifact đã duyệt | Phiên bản A trở thành kịch bản chính |
| Nguyên tắc | Dọn là một hành động riêng, có lệnh và có kiểm chứng | Hai thư mục B/C mờ đi và mang nhãn “Đã xoá” |
| Giới hạn | Tách worktree không đồng nghĩa mọi tài nguyên runtime đều tách | Cảnh báo ở ảnh 6 |
| Giả thuyết cần đo | Mỗi mô hình có một “điểm mạnh” cố định | Gemini sáng tạo, ChatGPT logic, Claude mượt |

## Áp vào `aiboss-app-chat`

### 1. Ánh xạ đúng vai của dự án

| Vai trong ảnh | Vai phù hợp ở dự án này |
|---|---|
| Người ra yêu cầu | PM giao task; Owner ra quyết định khi chạm cửa Owner |
| Claude Remote Control | Lớp vận chuyển lệnh/kết quả của app và kênh đội; không đồng nghĩa mở cổng internet |
| MacBook | Máy chạy công việc thật, nơi chứa repo và worktree |
| Bộ điều phối | `claude-aiboss-app-pm` |
| Các ứng viên độc lập | `claude-aiboss-app-exe` và `hermes-build-app` khi PM chủ động giao cùng một bài để so phương án, hoặc các executor làm các việc tách file |
| Bộ so sánh | Tiêu chí trong `ai/TASK_BOARD.md`, kiểm tự động và `hermes-aiboss-app-reviewer`; PM tổng hợp quyết định |
| Người duyệt cuối | PM với task nội bộ thường; Owner với production, dữ liệu thật, deploy, kiến trúc hoặc quyết định sản phẩm |
| Bản chính | Nhánh `main` và artifact đang phục vụ Owner |

Điểm phải giữ: executor không tự đổi vai thành PM, reviewer hoặc người deploy chỉ vì quy trình có nhiều ô.

### 2. Những gì dự án đã làm đúng theo bộ ảnh

- `ai/MASTER-PLAN.md:1701-1711` đã có luật “mỗi việc = một worktree riêng”, kiểm worktree trước khi bắt tay, gộp bằng `--ff-only` và dọn cả worktree lẫn nhánh.
- `ai/TASK_BOARD.md:10-15` đã buộc mỗi việc có phép nghiệm thu chạy được, đối chứng dương và tên ghế nhận việc.
- `ai/PROTOCOL-review-hash.md:27-60` đã làm chặt hơn ảnh: verdict phải ghim đúng artifact; sửa sau verdict chỉ làm mất hiệu lực phần delta; phải freeze trước review.
- `ai/PROTOCOL-review-hash.md:125-145` đã buộc người công bố hash không sửa tiếp, reviewer tự đo lại và có positive control.
- `ai/README.md:61-84` đã tách App Reviewer và Hermes ngoài hãng cho build lớn; hai thước độc lập mạnh hơn một thước.
- `ai/MASTER-PLAN.md:1714-1720` đã có mốc M3: hai người sửa hai việc cùng lúc mà không phải chờ nhau.

Nói thẳng: bộ ảnh xác nhận hướng worktree và tiêu chí của đội, nhưng quy trình review-hash của dự án đã sâu hơn bộ ảnh ở chỗ chống duyệt nhầm phiên bản.

### 3. Chỗ dự án còn chưa đạt tinh thần của ảnh

1. **Nút thắt file chung còn nguyên.** `ai/SO-DO-TIEN-DO-0209.md:58-70` đo `UngDung.tsx` tăng từ 2.015 lên 3.337 dòng; P1-3 đang đi lùi. Worktree chỉ ngăn ghi đè, không làm hai thay đổi cùng một file tự nhiên hết xung đột. `ai/MASTER-PLAN.md:1590-1597` gọi đúng gốc: phải chia file theo một trục đã đo.
2. **Chưa có thước chi phí cho việc chạy nhiều ứng viên.** `ai/TASK_BOARD.md:35-42` còn để P1-1 “bảng đo mức dùng theo ghế” ở trạng thái chưa làm. Chạy ba phương án mặc định trước khi có số chi phí có thể mua chất lượng bằng ba lần token mà không biết lợi ích biên.
3. **Chưa có giao thức ứng viên song song thành nguồn canonical.** Hiện có `ai/KE-HOACH-SONG-SONG.md` đang được một việc khác soạn đồng thời. Tệp đó chưa được lấy làm nguồn trong báo cáo này vì đang thay đổi; PM nên hợp nhất bài học ở đây vào đó rồi chọn đúng một nơi làm nguồn, theo luật “một sự thật một chỗ” tại `ai/README.md:14-21`.
4. **Tách runtime chưa hoàn toàn.** `ai/MASTER-PLAN.md:1708-1711` nói worktree không có `.trang-thai/`, còn build và đo phải ở kho chính. `ai/MASTER-PLAN.md:1611-1618` cũng cảnh báo bản dev và bản thật có thể cùng đọc trạng thái và cùng gọi `claude`. Vì vậy không được đọc “khu riêng” thành “mọi thứ đều cách ly”.

### 4. Quy trình đề xuất cho chế độ “nhiều ứng viên, chọn một bản thắng”

Quy trình này chỉ là đề xuất để PM tích hợp vào kế hoạch song song; lượt này không sửa nguồn quy trình khác.

1. **Chọn đúng loại việc.** Dùng nhiều ứng viên khi chưa chắc hướng giải, khi giá sai cao, hoặc khi cần góc nhìn khác hãng. Không nhân ba mọi task cơ học hay task đã có một cơ chế hiển nhiên.
2. **PM viết một brief đóng băng.** Brief phải có: task ID; cùng commit nền; cùng nguồn đầu vào; owned files; tiêu chí đánh số; đối chứng đỏ/xanh; điều cấm; trần thời gian/chi phí; ai có quyền chọn; cách nhập bản thắng.
3. **Tạo worktree/nhánh riêng từ cùng nền.** Mỗi ứng viên không đọc lời giải của ứng viên khác trước khi nộp, để giữ giá trị độc lập. Kiểm `git worktree list` trước khi mở.
4. **Mỗi ứng viên làm và tự kiểm trong phạm vi của mình.** Không dùng app thật hoặc `.trang-thai/` chung nếu phép thử có thể nhặt việc, gọi tiến trình thật hoặc làm đổi dữ liệu Owner.
5. **Freeze và ghim artifact.** Nộp commit hoặc hash theo `ai/PROTOCOL-review-hash.md`; không đánh giá một cây đang trôi.
6. **Chấm cùng một ma trận.** Ít nhất gồm: đúng acceptance; an toàn dữ liệu; đối chứng đỏ/xanh; phạm vi diff; khả năng bảo trì; nguy cơ va file/runtime; thời gian; token/chi phí. Reviewer phải đọc từng ứng viên thật, không chỉ đọc bản tự giới thiệu.
7. **Chọn hoặc tổng hợp có kiểm soát.** Nếu lấy phần A của ứng viên 1 và phần B của ứng viên 2 thì artifact tổng hợp là một bản mới, chưa được review; phải hash và soi delta lại. Không được gọi nó là “bản thắng đã duyệt”.
8. **Đưa đúng bản thắng vào `main` theo luật Git hiện hành.** Trước khi build, so hash với verdict. Nếu nền đã rời vì người khác commit, xử lý nền theo `ai/MASTER-PLAN.md:1704-1711`, không ép lịch sử.
9. **Dọn có chủ đích.** Sau khi đã giữ báo cáo và bằng chứng cần thiết, dọn worktree rồi dọn nhánh theo đúng hai bước. Đo lại `git worktree list` và danh sách nhánh; không suy “lệnh không báo lỗi” thành “đã dọn”.
10. **Đo lợi ích của chính quy trình.** Ghi: số ứng viên; thời gian tới bản đạt; tổng chi phí; số tiêu chí đạt lần đầu; số vòng sửa; số xung đột; bản nào thắng và vì sao. Nếu nhiều ứng viên không giảm vòng sửa hoặc không tăng chất lượng đủ bù chi phí, không dùng mặc định.

### 5. Tiêu chí so sánh phù hợp với code của dự án

Sáu tiêu chí video ở ảnh 7 không được chép thẳng sang code. Ma trận cho dự án nên hỏi:

1. Có làm đỏ được lỗi/cửa hỏng trên bản cũ không.
2. Bản mới có xanh đúng acceptance và có positive/negative control không.
3. Có giữ dữ liệu thật, lịch sử chat, tiến trình và cửa Owner không.
4. Có bám cơ chế gốc, diff nhỏ và không chạm file ngoài quyền không.
5. Có làm tăng phụ thuộc, file khổng lồ hoặc tài nguyên runtime dùng chung không.
6. Có thể đo lại bằng lệnh rõ, trên đúng artifact đã hash không.
7. Chi phí token, thời gian và số vòng sửa là bao nhiêu.
8. Khi hỏng, có đường lùi rõ và không cần lệnh phá huỷ không.

### 6. Ba việc cụ thể nên nối vào nguồn hiện tại

1. **P1-3 / `UngDung.tsx`:** ưu tiên đo trục chia và tách file, vì đây là điều kiện vật lý để hai executor làm giao diện song song thật; worktree một mình không chữa nút thắt cùng-file. Nguồn: `ai/MASTER-PLAN.md:1590-1597`, `ai/SO-DO-TIEN-DO-0209.md:58-70`.
2. **P1-1 / chi phí:** đo mức dùng theo ghế trước khi biến “ba ứng viên” thành nếp thường xuyên. Nguồn: `ai/TASK_BOARD.md:35-42`.
3. **Kế hoạch song song đang soạn:** dùng `ai/KE-HOACH-SONG-SONG.md` làm nơi PM quyết định có nhận giao thức ứng viên ở trên hay không; sau khi chốt, `MASTER-PLAN` và `TASK_BOARD` chỉ trỏ tới nguồn đó, không chép lại thành ba phiên bản quy trình.

## Mâu thuẫn cần nói thẳng

### Mâu thuẫn 1 — ba nhà cung cấp trong ảnh và phạm vi sản phẩm hiện tại

Ảnh dùng Gemini, ChatGPT, Claude như ba worker. `ai/MASTER-PLAN.md` xác định app này không nhằm đa nhà cung cấp mô hình; phần “Những thứ KHÔNG bắt chước” tại `ai/MASTER-PLAN.md:1672-1680` cũng loại đa nhà cung cấp vì thêm chỗ hỏng. Vì vậy:

- Nên học **quy trình nhiều ứng viên** ở tầng tổ chức đội.
- Không nên biến bộ ảnh thành yêu cầu nhét Gemini/ChatGPT vào runtime của app.

### Mâu thuẫn 2 — “Bạn duyệt cuối” và chuỗi quyền của đội

Ảnh đặt người dùng duyệt mọi kết quả. Dự án hiện giao PM nghiệm thu task nội bộ và chỉ đưa Owner các cửa cần quyết. Nếu bắt Owner chọn mọi bản thắng, đội sẽ chuyển công việc PM lên Owner và làm mất mục tiêu tự vận hành. Cách áp đúng là: người có thẩm quyền phù hợp duyệt cuối ở từng tầng; Owner không bị kéo vào việc thường ngày.

### Mâu thuẫn 3 — “tự động dọn” và an toàn bằng chứng

Tiêu đề ảnh 10 nói tự động, nhưng chính phần lưu ý nói việc dọn không tự xảy ra và cần quy trình/lệnh. Với code, xoá ngay mọi nhánh thua có thể làm mất bằng chứng, đối chứng hoặc đường so sánh. Chỉ dọn sau khi bản thắng đã nhập, được kiểm trên đúng artifact và bằng chứng cần giữ đã nằm trong báo cáo.

### Mâu thuẫn 4 — một bản thắng tuyệt đối và trường hợp cần tổng hợp

Nội dung sáng tạo có thể chọn nguyên một bản. Code đôi khi cần ghép ưu điểm từ hai ứng viên. Ghép tạo artifact mới; verdict cũ không chuyển sang bản ghép. Dự án phải ưu tiên quy tắc hash/delta hơn hình ảnh “chọn xong là bản chính”.

### Mâu thuẫn 5 — cách ly file và cách ly hệ thống

Ảnh dễ tạo cảm giác ba thư mục là đủ. Chính ảnh 6 phủ nhận điều đó. Dự án có cổng 4319, `.next/`, `.trang-thai/`, tiến trình thật, bản ghi phiên và thư mục ngoài repo. Ba worktree vẫn có thể đụng cùng tài nguyên sống. Mỗi task phải khai riêng: tách mã ở đâu, còn dùng chung runtime nào.

## Chỗ chưa chắc và thiếu bằng chứng

1. Ảnh không cho biết “Claude Remote Control” là tính năng/sản phẩm cụ thể nào, dùng giao thức gì, yêu cầu quyền gì hoặc có an toàn để mở từ internet không. Không được dùng bộ ảnh làm bằng chứng mở P3-1; `ai/TASK_BOARD.md:51-55` vẫn đúng khi yêu cầu soi bảo mật trước.
2. Ảnh không đưa câu lệnh tạo worktree, cách đồng bộ file gốc, cách xử lý khi nhánh nền đã rời hoặc cách chống hai worker dùng chung runtime.
3. Ảnh không nêu prompt của “bộ so sánh”, trọng số tiêu chí, cách xử lý hoà điểm hoặc cách chứng minh bộ chấm đã đọc đủ ba bản.
4. Bảng điểm và các điểm mạnh theo từng mô hình là minh hoạ; không có dữ liệu benchmark, số lần chạy, chi phí hoặc chất lượng thực tế.
5. Không có ảnh kết quả chạy thật, log, hash, commit hoặc phép đo cho thấy quy trình đã thực thi thành công; bộ ảnh mô tả cách làm, không phải bằng chứng nghiệm thu một hệ thống.
6. `caption.txt` nói “giữ lại đúng bản thắng”, còn ảnh 10 nói xoá hai phần còn lại. Chưa rõ “giữ” có bao gồm lưu báo cáo, diff hoặc bản đối chứng ở nơi khác không.
7. Ảnh đánh số bắt đầu bằng ảnh tổng quan `1/10`, còn tiêu đề quy trình chi tiết bắt đầu ở “BƯỚC 2”. Có thể ảnh 1 được xem là bước 1, nhưng ảnh không ghi nguyên văn “BƯỚC 1”.
8. `ai/KE-HOACH-SONG-SONG.md` đang được một việc khác ghi đồng thời nên nội dung hiện thời không được dùng làm bằng chứng canonical trong báo cáo này. Cần PM đọc bản hoàn tất của cả hai tệp rồi hợp nhất, tránh hai nguồn song song nói cùng một quy trình.

## Ba điều đáng giữ nhất

1. **Muốn so sánh sạch thì phải cùng đề, cùng nền, cùng tiêu chí nhưng khác nơi làm và độc lập trước khi nộp.**
2. **Bản thắng chỉ có nghĩa khi được duyệt trên đúng artifact; với dự án này phải ghim hash và soi lại mọi delta.**
3. **Worktree chỉ tách file. Runtime, chi phí, quyền và dữ liệu thật vẫn cần chốt riêng; không được gọi “khu riêng” là “cách ly toàn hệ thống”.**
