# KẾ HOẠCH CHIA ĐỘI CHẠY SONG SONG

FROM: hermes-build-app / TO: claude-aiboss-app-pm

> **Trạng thái:** đề xuất để PM bác/chốt. Lượt này chỉ viết kế hoạch; KHÔNG sửa `src/`, KHÔNG dựng, KHÔNG commit.

**Mục tiêu:** tổ chức hai thợ và hai phiên soi để hai việc độc lập có thể đi từ nhận việc tới verdict cùng lúc, trong khi mọi bản dựng vẫn đi qua một cửa nối tiếp có neo băm.

**Cách tổ chức đề nghị:** chia theo lát dọc tính năng, nhưng dựng trước một lõi trạng thái nhỏ và một hợp đồng dùng chung. Không chia thuần theo “logic ở trên, JSX ở dưới”, cũng không gom mọi lời gọi HTTP thành một tệp thần thánh mới.

**Nền kỹ thuật đã đọc:** Next.js 15.5.4, React 19.1.1, TypeScript 5.7.2, pnpm 10.32.1; `package.json` hiện không có script test và repo hiện không có tệp `*.test.*` hoặc `*.spec.*` theo phép tìm ở phụ lục.

---

## 0. Kết luận ngắn để PM quyết

1. Tôi đề nghị **phương án D: lõi trạng thái mỏng + lát dọc tính năng + thành phần trình bày**. Nó lấy ưu điểm song song của phương án B, thêm một đường xử lý rõ cho `capNhat`, và không gom toàn bộ HTTP vào một tệp như phương án C.
2. `capNhat` ở lại trong một hook lõi duy nhất, dự kiến `src/components/ung-dung/use-o-chat.ts`. Hook này chỉ sở hữu `dsO`, `dsORef`, `capNhat` và thao tác trạng thái nguyên tử; nó KHÔNG sở hữu gọi mạng, chính sách phiên, đánh thức hay JSX.
3. Sau lượt tách nền, có **năm mảnh sở hữu**. Con số năm là lựa chọn thiết kế dựa trên các cụm mã đo được ở mục 1, KHÔNG phải số mảnh đã tồn tại:
   - M1: lõi trạng thái + kiểu/hợp đồng dùng chung.
   - M2: phiên/lịch sử/fork/resume.
   - M3: gửi luồng/Dừng/hàng chờ.
   - M4: đánh thức/đối soát/tab tỉnh.
   - M5: trình bày gồm khung app, danh bạ và ô chat.
4. Hai thợ chỉ song song thật sau khi M1 đã được nhập vào main, hợp đồng của lượt đã đóng băng, hai danh sách owned files không giao nhau, và cả hai worktree tự chạy được phép kiểm không dùng `.next/`.
5. Tôi đồng ý phải có khoá cửa dựng. Khoá phải bảo vệ `.next/` ở kho chính, dùng `mkdir` nguyên tử trong git common dir, ghi người giữ/PID/commit/giờ, và chỉ thu khoá cũ khi xác minh PID đã chết; KHÔNG tự xoá chỉ vì hết giờ.
6. Hai phiên reviewer dùng **cùng cổng bắt buộc, khác trọng tâm**, cùng neo vào một cây đã đóng băng. Một blocker của bất kỳ phiên nào là NO-GO; PM không được gộp hai verdict trái nhau thành “đa số đạt”.
7. Hiện chưa có số nền đáng tin để tuyên bố nhanh gấp 2-3. Phải ghi thời gian theo từng chặng và so throughput có trọng số trên các lượt trước/sau; mục 5 định nghĩa phép đo.

---

## 1. Đường cắt

### 1.1 Số đo hiện tại

Tại commit nền `639a62e0681e08fe0afec516212c72bd8a9843a5`, cây làm việc chính còn có thay đổi của người khác. Các số dưới đây đọc từ bản đang nằm trên đĩa, KHÔNG được hiểu là số của commit nền:

| Vật | Số đo | Nguồn/lệnh |
|---|---:|---|
| `UngDung.tsx` | 3.337 dòng theo API đọc tệp; lệnh Node đếm dấu xuống dòng in 3.338 vì tệp kết thúc bằng newline | `read_file src/components/UngDung.tsx`; xem phụ lục A2 |
| kích thước | 200.875 byte | `read_file src/components/UngDung.tsx` |
| hàm `UngDung` | dòng 483-3337 | TypeScript AST, phụ lục A2 |
| `useState` trong `UngDung` | 18 | TypeScript AST, phụ lục A2 |
| lời gọi `capNhat(...)` thật | 53 call expressions | TypeScript AST; đối chứng dương thêm một call trong bộ nhớ cho ra 54 |
| mọi lần identifier `capNhat` xuất hiện | 61 | TypeScript AST; đối chứng dương cho ra 62 |
| nhập runtime từ `@/lib/` vào máy khách | 3 | AST: `dung-markdown`, `so-o`, `han-gio-fork`; đối chứng dương thêm import giả trong bộ nhớ cho ra 4 |
| nhập type từ `@/lib/` | 1 | AST: `ViSaoDung` |
| API route | 8 tệp | liệt kê `src/app/api/**/*.ts` ở phụ lục A4 |
| `src/lib` | 22 tệp TypeScript trong phép liệt kê hiện tại | liệt kê ở phụ lục A4 |
| test/spec trong repo | 0 tệp tìm thấy theo hai glob đã chạy | phụ lục A5; đối chứng dương cho công cụ tìm tệp được nêu ở bước chuẩn bị trước thi công |

**Đính chính quan trọng:** tin 19:00 của exe ghi `capNhat` bị gọi 68 lần. Trên bản hiện tại, AST đo được 53 call expressions; 68 là CHƯA tái lập được. Tôi không dùng 68 làm nền kế hoạch.

Các cụm đã lộ rõ theo dòng hiện tại:

- trạng thái và helper chung: khoảng dòng 483-716;
- phiên/lịch sử/khôi phục/đổi ghế: khoảng 717-1640;
- gửi luồng và hàng chờ: khoảng 1642-1904;
- đánh thức, mã cũ, tab tỉnh lại: khoảng 1931-2345;
- JSX: khoảng 2370-3337.

Các khoảng trên là bản đồ để đọc, KHÔNG phải đường cắt máy móc. Nhiều callback nằm lồng nhau và có phụ thuộc chéo qua `dsORef`, `capNhat`, `napLichSu`, `guiRef`.

### 1.2 Vì sao ba phương án A/B/C chưa đủ nếu đứng một mình

- **A, cắt ngang hook/JSX:** dễ thấy nhưng mỗi thay đổi tính năng thường sửa cả hook và thành phần gọi nó. Hai thợ vẫn giẫm ở tệp ráp gốc và hợp đồng props.
- **B, cắt dọc tính năng:** gần mục tiêu song song nhất, nhưng thiếu câu trả lời cho `capNhat`, kiểu `OChat`, `dsORef` và điểm ráp.
- **C, gom lời gọi máy chủ:** hữu ích để làm chặt hợp đồng, nhưng một tệp `goi-may-chu.ts` chứa mọi cửa sẽ thành điểm nóng mới. Nó cũng không làm nhỏ JSX.

### 1.3 Phương án D đề nghị

#### M1 — Lõi trạng thái và hợp đồng, vùng dùng chung có kiểm soát

Dự kiến:

- `src/components/ung-dung/kieu.ts`
- `src/components/ung-dung/use-o-chat.ts`
- `src/shared/contracts/phien.ts`
- `src/shared/contracts/tien-trinh.ts`
- `src/shared/contracts/danh-thuc.ts`

Nội dung:

- `kieu.ts`: `Tin`, `OChat`, `TomTatPhien`, các kiểu props máy khách và mặc định `O_TRONG`.
- `use-o-chat.ts`: khởi tạo `dsO`, giữ `dsORef`, và xuất đúng một thao tác `capNhat(i, patchOrUpdater)` có cùng semantics hiện tại.
- `src/shared/contracts/*`: chỉ kiểu và kiểm tra hình dạng thuần; máy khách và route cùng nhập. KHÔNG nhập `node:*`, dữ liệu tĩnh hay side effect.

Quyết định cho `capNhat`:

- KHÔNG đổi sang reducer trong lượt chia tệp. Đổi useState sang reducer là đổi cơ chế chạy và làm mất mốc so.
- KHÔNG đưa `capNhat` vào React context trong lượt chia. Context đổi ranh giới render và có thể làm rộng vùng vẽ lại.
- KHÔNG cho hook tính năng tự gọi `datDsO`.
- Mọi hook tính năng nhận một interface hẹp, ví dụ thao tác cập nhật một ô và ref chỉ đọc. Sau khi M1 ổn định, thêm tính năng trong M2-M4 thường không phải sửa M1.
- `OChat` là hợp đồng dùng chung. Nếu một lượt cần thêm trường, PM đóng băng thay đổi hợp đồng trước, nhập thay đổi đó trước, rồi mới mở hai nhánh tính năng. Đây là cửa nối tiếp có chủ ý, không giả vờ song song.

#### M2 — Phiên, lịch sử, fork và resume

Dự kiến:

- `src/components/ung-dung/use-phien.ts`
- `src/components/ung-dung/api-phien.ts`

Di chuyển nguyên hành vi của các cụm `napDsPhien`, `locTin`, `docLichSu`, `napLichSu`, `keoThem`, `napLaiChat`, `ghiO`, `datNguoi`, `chonPhien`, `forkVeGhe`, `danLenhResume`, `phienMoi`, `napBoGhe`.

M2 không sở hữu JSX. Nó trả trạng thái và command có kiểu cho M5.

#### M3 — Gửi luồng, Dừng và hàng chờ

Dự kiến:

- `src/components/ung-dung/use-chat-runtime.ts`
- `src/components/ung-dung/api-chat.ts`

Di chuyển nguyên hành vi của `gui`, `dungViec`, `huyLuong`, bộ nhả chữ, hàng chờ và đọc SSE. Contract Dừng phải chuyển từ `@/lib/kho-tien-trinh` sang `src/shared/contracts/tien-trinh.ts`; máy khách KHÔNG nhập type từ mô-đun quản tiến trình máy chủ nữa.

#### M4 — Đánh thức, đối soát và vòng đời tab

Dự kiến:

- `src/components/ung-dung/use-danh-thuc.ts`
- `src/components/ung-dung/api-danh-thuc.ts`

Di chuyển nguyên hành vi của `thamDoMotNhip`, mã tab, so bản dựng, báo cửa hỏng, tab tỉnh lại và phép gọi xác nhận. Verdict ô-treo lúc 18:55 chỉ ra cờ tab hiện không được đối soát định kỳ với nguồn tiến trình; đó là **việc sửa hành vi riêng sau lượt tách**, KHÔNG được lén chữa trong commit chia tệp.

#### M5 — Thành phần trình bày

Dự kiến:

- `src/components/ung-dung/ThanhDau.tsx`
- `src/components/ung-dung/DanhBa.tsx`
- `src/components/ung-dung/ThanhDieuKhien.tsx`
- `src/components/ung-dung/OChatView.tsx`
- `src/components/ung-dung/LuoiChat.tsx`
- `src/components/UngDung.tsx` còn vai trò ráp các mảnh.

Các thành phần này nhận dữ liệu và command có kiểu. Chúng KHÔNG gọi `fetch`, KHÔNG tự chạm `dsORef`, KHÔNG nhập từ mô-đun máy chủ. Một thay đổi chữ, nút, bố cục hay accessibility phải dừng trong M5 trừ khi tiêu chí nghiệp vụ thật sự đổi.

### 1.4 Ai sở hữu mảnh nào

Sau lượt tách nền:

| Loại lượt | `hermes-build-app` | `claude-aiboss-app-exe` | Vùng nối tiếp |
|---|---|---|---|
| lượt thiên về giao diện | M5 và CSS liên quan | M2/M3/M4 hoặc backend tương ứng | M1/contracts do PM đóng băng trước |
| lượt thiên về backend | nhóm phối hợp: `/api/o`, `/api/phien`, `/api/danh-thuc/**` và lib trực tiếp của chúng | nhóm runtime: `/api/chat`, `/api/dung`, `/api/fork` và lib trực tiếp của chúng | mô-đun giao nhau như `kho-phien`, `doc-phien`, `khoi-dong-nen` phải chỉ có một owner trong lượt |
| cùng một việc để chạy đua | hai người làm độc lập trong hai worktree; chỉ một bản thắng được nhập | như cột trái | KHÔNG ghép nửa bản A với nửa bản B |

Tên người ở hai cột có thể đổi theo lượt; điều bắt buộc là **owned files**, không phải chức danh cố định. PM phải ghi danh sách file trước khi mở worktree.

### 1.5 Tách backend/front-end đúng nghĩa

Hiện máy khách nhập runtime từ ba mô-đun `src/lib`, không phải hai như số cũ trong MASTER-PLAN. Lượt tách nền phải:

1. đưa tiện ích thuần máy khách như markdown sang vùng client/shared phù hợp;
2. đưa `SO_O`, hạn fork dạng hiển thị và các response type vào `src/shared/` không side effect;
3. cấm import từ `src/lib` máy chủ trong cây `src/components/` bằng một phép kiểm import AST;
4. giữ tám cửa HTTP làm biên chạy; KHÔNG đổi URL, payload hay thứ tự gọi trong lượt chia.

Nghiệm thu “máy khách không còn nhập runtime từ server lib” là kết quả 0 nên phải có đối chứng dương: chạy cùng checker trên một chuỗi AST giả có import `@/lib/fake-positive-control`; checker phải báo 1.

---

## 2. Thứ tự và điều kiện bắt đầu song song thật

### Giai đoạn S0 — Chụp nền và dọn điều kiện, chưa chia mã

1. PM xác nhận ai sở hữu ba thay đổi đã có ở cây chính lúc đo: `ai/MASTER-PLAN.md`, `ai/README.md.pre-luat-hermes.bak`, `ai/SO-DO-TIEN-DO-0209.md`. KHÔNG reset, KHÔNG dọn hộ.
2. Chụp commit nền, `git status --short --branch`, worktree list, hash các file thuộc phạm vi.
3. Đóng băng bộ kiểm hành vi hiện tại trước khi di chuyển: typecheck; AST invariants; danh sách endpoint/payload; bốn khoá localStorage; shape `O_TRONG`; browser smoke cho bố cục, phiên, gửi, Dừng, lịch sử, fork/resume, đánh thức.
4. Phép đo browser và cách tạo dữ liệu thử hiện CHƯA ĐO/CHƯA CHỐT; đây là blocker thật. KHÔNG bắt đầu split chỉ với `tsc`.

### Giai đoạn S1 — Tách nền không đổi hành vi

Vì cả hai lời giải đều phải sửa `UngDung.tsx`, không thể nhập hai nhánh cùng lúc mà không giẫm. Dùng **chế độ chạy đua độc lập**:

1. PM phát cùng acceptance và cùng hash nền cho hai thợ.
2. Hai worktree cùng xuất phát từ một commit; hai thợ KHÔNG đọc/chờ/cherry-pick bản của nhau.
3. Mỗi thợ tự dựng đủ M1-M5 theo đường cắt đã chốt.
4. Ai freeze trước thì được reviewer rảnh soi trước. Bản thắng phải qua đủ cổng; bản thua giữ làm phương án đối chiếu, KHÔNG lấy từng mẩu trộn vào bản thắng.
5. Chỉ nhập một bản. Sau khi nhập, đóng cả worktree/branch còn lại theo luật dọn có kiểm.

Chế độ này giảm thời gian chờ nhưng tiêu hai lượt làm cho một hiện vật. Nó KHÔNG được tính là tăng throughput hai lần.

### Giai đoạn S2 — Mở hai lane disjoint

Chỉ bắt đầu khi đồng thời đạt:

- S1 đã nhập và được review theo hash;
- `UngDung.tsx` chỉ còn vai trò ráp; feature logic đã ở M2-M4, JSX đã ở M5;
- hợp đồng lượt đã freeze trên main;
- file ownership của hai ticket giao nhau 0 file, được checker in cả hai danh sách và phần giao;
- mỗi nhánh có phép kiểm cục bộ tự chạy trong worktree, không cần `.next/` hoặc `.trang-thai/` thật;
- mọi ca app sống đã có lịch vào cửa integration;
- hai phiên reviewer đã được cấp artifact/hash cụ thể;
- không có freeze block sống trên file sắp sửa của lane kia.

Nếu giao nhau khác 0, PM chọn một trong ba: tách lại ticket, đưa file chung vào lượt contract nối tiếp, hoặc chuyển cả hai sang chế độ chạy đua. KHÔNG cho hai người “tự né nhau” trong cùng file.

### Giai đoạn S3 — Tách việc backend/front-end theo contract

1. PM chốt request/response type và invariant trong `src/shared/contracts/*` ở một commit nền.
2. Lane FE dùng contract và fixture cục bộ; KHÔNG cần route mới đã nhập để typecheck/test component.
3. Lane BE dùng cùng contract để kiểm route/lib; KHÔNG sửa component.
4. Nhập lane đầu; lane sau đo lại giao file. Nếu giao 0, rebase lên main, chạy lại kiểm, rồi `--ff-only`. Nếu có giao, dừng và để PM chia lại; KHÔNG tự giải xung đột bằng chọn cả hai.
5. Dựng/app-live chỉ sau khi cả hai lane cần ship đã nhập và reviewer hash còn khớp.

---

## 3. Bản §7 MỚI — luật đội, worktree, dựng và hai phiên soi

### §7.1 Nhận việc và sở hữu

1. Mỗi ticket có: task ID, commit nền, owned files, forbidden files, acceptance, negative/positive controls, quyền commit/push/build và đường báo cáo.
2. Trước khi mở worktree, chạy `git worktree list --porcelain`; PM đối chiếu worktree đang sống với bảng ticket. Worktree cũ không tự động là rác.
3. Mỗi ticket dùng một branch/worktree riêng. Hai thợ chỉ cùng ticket khi PM ghi rõ **RACE**; còn lại owned files phải giao nhau 0.
4. File thuộc block hash đang sống không ai được sửa trước khi báo kênh và reviewer huỷ/thu hẹp freeze theo R7.

### §7.2 Mở, làm và dọn worktree

5. Hai worktree trong cùng lượt phải ghi commit nền đã đo. Không lấy `HEAD bây giờ` sau khi người khác vừa commit để suy nền của mình.
6. Trong worktree được chạy `tsc --noEmit`, lint/checker không sinh `.next/`, và test cục bộ. KHÔNG chạy `next build` trong worktree thợ.
7. `.trang-thai/` và `/Users/Shared/phong-ban-ai-ws/` là tài nguyên ngoài nhánh. KHÔNG chạy ca sinh tiến trình thật hoặc sửa sổ thật nếu ticket không có lịch integration riêng.
8. Dọn chỉ sau khi commit cần giữ đã nhập hoặc PM xác nhận bỏ. Chạy `git worktree remove <path>` rồi `git branch -d <branch>`; đo lại cả worktree list và branch list. KHÔNG đặt tiêu chí “phải còn đúng một worktree”, vì hiện có thể có nhiều ticket hợp lệ cùng lúc; tiêu chí đúng là không còn worktree/branch của ticket đã đóng.

### §7.3 Nhập hai nhánh

9. Integration captain chụp `main` trước khi nhập. Nhánh đầu chỉ vào bằng `--ff-only`.
10. Nhánh thứ hai đo `git diff --name-only main...HEAD` và giao file với delta vừa nhập. Giao 0 thì rebase main, chạy lại toàn bộ phép kiểm và `--ff-only`; giao khác 0 thì dừng, không tự giải.
11. Commit được xác nhận bằng hash trước/sau và `git show --stat <hash> -- <owned files>`, KHÔNG dùng `git log -1` làm bằng chứng việc của mình.

### §7.4 Cửa dựng dùng chung

12. Mỗi đợt chỉ có một **integration captain** do PM ghi tên trên kênh. Đây là quyền theo lượt, KHÔNG phải quyền vĩnh viễn của một ghế.
13. Chỉ captain được dựng, chỉ tại kho chính, sau khi: cây cần dựng sạch trong phạm vi mã; verdict hash còn khớp; commit dựng đã chụp trước lệnh; không có app-live test khác đang giữ cửa.
14. Khoá đề nghị đặt dưới `$(git rev-parse --git-common-dir)/aiboss-next-build.lock/`, lấy bằng `mkdir` nguyên tử. Metadata tối thiểu: ticket, ghế, PID, host, commit, worktree, giờ lấy.
15. Khoá có `trap` nhả khi lệnh kết thúc. Khi thấy khoá cũ, KHÔNG xoá theo thời gian đơn thuần. Chỉ thu hồi sau khi xác minh đúng host và PID không còn sống; nếu không xác minh được thì hỏi PM.
16. TTL cụ thể CHƯA ĐO vì chưa đo phân bố thời gian dựng. TTL chỉ là chuông báo để điều tra, KHÔNG là giấy phép tự phá khoá.
17. Khoá phải nằm ngoài `.next/`; một lượt dựng có thể thay nội dung `.next/`. Khoá chỉ chống chạy chồng, KHÔNG chứng minh bản đúng.
18. Trước dựng, captain chạy R6/R6a/R8: đọc hash từ brief/verdict, tự băm lại và in số anchor đã kiểm. Mismatch chưa có delta review thì KHÔNG dựng.
19. `next dev` riêng cho UI chưa được bật cho tới khi đo và tách trạng thái/process. Hai bản cùng đọc `.trang-thai/` hoặc sinh `claude` là CHƯA AN TOÀN.

### §7.5 Hai phiên reviewer

20. Hai phiên là hai session ID riêng, mỗi phiên nhận cùng: task, acceptance, commit nền, artifact commit, READ/TRACKED hash block và scope cấm.
21. Reviewer A sở hữu **đúng-spec và không đổi hành vi**: đối chiếu acceptance, API contract, state invariants, localStorage, diff moved-code và positive controls.
22. Reviewer B sở hữu **đối kháng và tích hợp**: race, lifecycle, tài nguyên dùng chung, negative controls, cửa build, đường thất bại và claim “0/sạch/khớp”.
23. Cả hai vẫn phải chạy bộ cổng tối thiểu chung; chia trọng tâm KHÔNG có nghĩa reviewer được bỏ lỗi blocker nhìn thấy ngoài phần mình.
24. Reviewer tự đo hash khi bắt đầu và verdict chỉ ghi READ cho file đã mở. TRACKED chỉ phát hiện đổi, không mang lời khai đã soi.
25. Hai reviewer không đọc verdict của nhau trước khi nộp verdict đầu để tránh neo theo nhau. Sau đó PM lập bảng: claim, bằng chứng, hash, verdict A, verdict B.
26. Một blocker từ A hoặc B làm artifact NO-GO. Hai verdict trái nhau không lấy đa số, không chọn verdict dễ chịu hơn. PM giao đúng câu bất đồng cho một lượt tái đo trên cùng hash; nếu hash đổi thì soi delta trước.
27. Trong chế độ RACE, reviewer lấy artifact freeze đến trước, không cố định reviewer theo tên thợ. Nếu hai artifact cùng tới, mỗi phiên lấy một artifact. Bản được chọn để nhập phải có ít nhất một full verdict đạt; trước build, phiên còn lại làm cross-check blocker trên artifact thắng. Số phút cho cross-check CHƯA ĐO và phải ghi thực tế vào sổ đo.
28. Mỗi edit sau verdict chỉ vô hiệu phần edit. Review delta, không soi lại từ đầu, nhưng phải băm lại toàn bộ TRACKED trước build.

---

## 4. Phép nghiệm thu tách tệp mà không đổi hành vi

Không có test hiện hữu nên `tsc` một mình không đủ. Trước implementation, PM phải chốt một bộ đặc tính nền có ít nhất các lớp sau:

1. **Cấu trúc:** TypeScript parse được mọi tệp; client import server-lib runtime về 0 với đối chứng dương 1; bốn giá trị localStorage khớp byte; số route/URL/payload không đổi.
2. **Trạng thái:** `O_TRONG` giữ đủ trường và giá trị; `capNhat` vẫn merge patch/function patch trên đúng một ô; updater phải thuần trong các đường SSE.
3. **Hành vi browser trước/sau trên cùng fixture:** bố cục 1/2/4/6, chọn ghế, nạp phiên, lịch sử cũ, fork/resume, gửi, hàng chờ, Dừng, đánh thức, tab tỉnh, băng mã cũ.
4. **Mạng:** ghi request trace trước/sau; cùng thao tác phải giữ URL, method, payload shape và thứ tự có ý nghĩa.
5. **Render:** snapshot DOM theo class/text/aria tại các trạng thái đã chốt; CSS ở cả `globals.css` và `mau09.css` được kiểm vì globals có thể đè.
6. **Cũ-đỏ/mới-xanh:** lượt split không có bugfix nên không được bịa một bug đỏ. Thay vào đó dùng mutation control: cố ý đổi một khoá localStorage, bỏ một endpoint hoặc thêm một import server-lib trong bản chuỗi/bản sao thử; checker phải đỏ. Mutation không được ghi vào source thật.
7. **Kiểm toàn repo trong worktree:** dùng Node 24.19.0; chạy typecheck và lint theo script thật. `package.json` hiện ghi `next lint`, nhưng khả năng script này chạy được với Next 15.5.4 CHƯA ĐO trong lượt kế hoạch; phải thử trước khi lấy làm gate.
8. **Build:** chỉ captain chạy sau hai review, qua khoá §7.4. Lệnh cụ thể phải theo runbook được PM chốt; lượt này KHÔNG chạy build.

---

## 5. Đo “nhanh gấp 2-3”

### 5.1 Không dùng số commit hay số dòng làm thước chính

Commit có thể bị chia vụn; dòng có thể phình vì comment/di chuyển. Hai số đó chỉ dùng mô tả, KHÔNG làm tử số năng suất.

### 5.2 Sổ đo cho từng ticket

Đề nghị tạo ở lượt implementation sau, KHÔNG tạo trong lượt kế hoạch này:

- `ai/METRICS-SONG-SONG.csv`

Mỗi hàng ghi từ nguồn máy được:

- `ticket_id`, `lane`, `mode` (`SHARD` hoặc `RACE`), `complexity_points` chốt trước khi giao;
- `dispatch_at`, `ack_at`, `first_change_at`, `freeze_at`;
- `review_start_at`, `verdict_at`, `merge_at`, `build_start_at`, `build_end_at`, `accepted_at`;
- `review_rounds`, `conflict_files`, `conflict_minutes`, `build_wait_minutes`;
- `winner`, `discarded_agent_minutes`, `rework_minutes`, `escaped_defect`.

Mốc kênh dùng ISO trong heading; mốc git dùng `%cI`; build lock tự ghi giờ. Không dùng giờ gõ tay nếu có nguồn máy.

### 5.3 Nền so sánh

- Lấy một cửa sổ lịch sử gồm **10 ticket hoàn thành gần nhất** trước rollout, ghép dispatch/verdict/merge bằng task ID. Số 10 là chính sách lấy mẫu đề nghị, CHƯA phải mẫu đã thu.
- Nếu không ghép được task ID hoặc thiếu mốc, ghi hàng `MISSING`; KHÔNG nội suy từ mtime.
- Chấm complexity trước khi nhìn thời gian bằng dãy điểm `1, 2, 3, 5`; tiêu chí chấm phải được PM viết trước. Đây là thang đề nghị, CHƯA hiệu chuẩn.
- Tách ticket RACE khỏi SHARD. RACE có thể giảm latency nhưng một ticket thắng vẫn chỉ tính một work unit.

### 5.4 Công thức

- `cycle_time = accepted_at - dispatch_at`.
- `review_wait = review_start_at - freeze_at`.
- `integration_wait = accepted_at - verdict_at`.
- `weighted_throughput = tổng complexity_points của ticket được nhận / giờ trôi của cửa sổ`.
- `speedup = weighted_throughput_song_song / weighted_throughput_nền`.
- `latency_factor = median_cycle_time_nền / median_cycle_time_song_song`.
- `waste_ratio = discarded_agent_minutes / tổng agent_minutes`.
- `conflict_rate = ticket có conflict_files > 0 / tổng ticket SHARD`.

Mọi phép chia phải do script tính và in cả tử, mẫu, số hàng thiếu; KHÔNG tính tay trong báo cáo.

### 5.5 Điều kiện được nói “gấp 2” hoặc “gấp 3”

Đề nghị chỉ công bố sau **ba wave song song liên tiếp**; số ba là cổng chính sách, CHƯA có dữ liệu hiệu chuẩn.

- Nói **gấp 2** khi `speedup >= 2.0`, median cycle không xấu hơn nền, escaped defect không tăng, và từng wave đều có hai lane thực sự chồng thời gian.
- Nói **gấp 3** khi `speedup >= 3.0` với cùng cổng chất lượng.
- Nếu chỉ `latency_factor` tăng mà throughput không tăng, phải nói “phản hồi nhanh hơn”, KHÔNG nói “năng suất gấp N”.
- Nếu RACE nhanh hơn nhưng waste_ratio cao, báo cả hai; KHÔNG giấu phần công bị bỏ.

Với hai thợ, throughput bền vững gấp 3 là mục tiêu khó và hiện CHƯA có số chứng minh. Nó chỉ có thể xuất hiện nếu đồng thời gỡ đáng kể thời gian chờ review/build/integration; kế hoạch không mặc định điều đó sẽ xảy ra.

---

## 6. Chỗ CHƯA đo được

1. **Baseline tốc độ:** CHƯA ghép 10 ticket lịch sử với đủ dispatch/freeze/review/merge/acceptance.
2. **Cây phụ thuộc semantic đầy đủ:** đã đo 18 `useState`, 53 lời gọi `capNhat` và các cụm dòng; CHƯA có ma trận chính xác mọi callback đọc/ghi từng trường `OChat` sau các `await`.
3. **Sai khác 68 so với 53:** CHƯA biết 68 đến từ bản file cũ hơn hay phép đếm identifier/chuỗi khác.
4. **Vùng `/Users/Shared/phong-ban-ai-ws/`:** biết route/lib tham chiếu, CHƯA đo hai lượt thật có ghi cùng tên tệp hay giành cùng tiến trình.
5. **`.trang-thai/` cho dev riêng:** CHƯA đo khả năng cấu hình state root riêng và chế độ chỉ xem không sinh tiến trình.
6. **Thời gian build:** CHƯA đo phân bố nên CHƯA chốt TTL/cảnh báo khoá.
7. **Browser characterization:** CHƯA có test runner trong package và CHƯA chốt fixture không chạm dữ liệu thật.
8. **`pnpm run lint`:** package script hiện là `next lint`; CHƯA chạy trong lượt này nên CHƯA biết gate có sống.
9. **Hai reviewer:** CHƯA đo review throughput, thời gian cross-check và tỷ lệ verdict bất đồng.
10. **Cây chính bẩn:** ba đường dẫn đang khác HEAD; CHƯA xác định owner của từng thay đổi nên chưa đủ điều kiện mở lượt split.
11. **Số file/mức dòng sau split:** các tên file ở mục 1 là kiến trúc đề nghị; CHƯA có artifact nên KHÔNG ghi LOC mục tiêu giả.
12. **Rủi ro import vòng:** CHƯA dựng các mô-đun mới nên CHƯA đo cycle graph sau tách.

---

## 7. Việc PM cần bác/chốt trước khi thi công

1. Chốt hoặc bác phương án D và năm mảnh sở hữu.
2. Chốt `capNhat` là lõi useState giữ nguyên semantics; KHÔNG reducer/context trong lượt split.
3. Chốt S1 là RACE hai lời giải độc lập hay một thợ tách nền, thợ kia viết characterization. Tôi nghiêng về RACE vì đúng chỉ thị Owner “ai xong sớm soi sớm”, nhưng nó tốn công và phải ghi waste.
4. Chốt integration captain theo wave và vị trí khoá trong git common dir.
5. Chốt reviewer A/B theo hai trọng tâm ở §7.5 và luật “một blocker là NO-GO”.
6. Giao một lượt đo riêng để đóng 12 ô CHƯA đo ở mục 6; không lẫn sửa hành vi.

---

## Phụ lục A — lệnh đã chạy cho các con số

### A1. Trạng thái nền

```bash
git status --short --branch
git remote -v
git rev-parse HEAD
git worktree list --porcelain
```

Kết quả đáng dùng:

- main ahead origin/main 35 tại lúc đo;
- HEAD `639a62e0681e08fe0afec516212c72bd8a9843a5`;
- worktree chính và `/Users/erocathanh/Development/aiboss-p0-2b` cùng tồn tại;
- cây chính có một file modified và hai file untracked nêu ở S0.

### A2. AST `UngDung.tsx`

Đã chạy Node với `typescript` để:

- parse `UngDung` và đếm `useState`;
- đếm `CallExpression` có callee identifier đúng bằng `capNhat`;
- đếm import runtime/type từ `@/lib/`;
- chạy lại trên chuỗi trong bộ nhớ có thêm đúng một call/import giả.

Kết quả:

```text
STATES 18
real capNhat { call_expressions: 53, identifier_occurrences: 61 }
positive_control_plus_one_call { call_expressions: 54, identifier_occurrences: 62 }
real client imports { runtime: 3, type: 1 }
positive_control_plus_fake_runtime { runtime: 4, type: 1 }
```

Đối chứng dương này không sửa tệp thật; chuỗi giả chỉ tồn tại trong tiến trình Node.

### A3. Phần nguồn đã đối chiếu

```text
src/components/UngDung.tsx:1-482
src/components/UngDung.tsx:483-912
src/components/UngDung.tsx:900-1359
src/components/UngDung.tsx:1360-1919
src/components/UngDung.tsx:1920-2379
src/components/UngDung.tsx:2360-3337
```

### A4. Backend và route

Đã liệt kê đệ quy tệp `.ts` dưới `src/lib` và `src/app/api`, rồi parse import `@/lib/*` bằng TypeScript AST. Kết quả hiện tại: 22 tệp lib và 8 route. Route `chat` nhập 10 mô-đun lib; các route còn lại có bảng import trong log đo của lượt này. Hai nhóm backend ở mục 1.4 dựa trên bảng import đó, nhưng file giao nhau vẫn phải đo lại ở từng ticket.

### A5. Tìm test

```text
search_files target=files pattern=*.test.* path=<repo>  -> 0
search_files target=files pattern=*.spec.* path=<repo>  -> 0
```

Đây chưa đủ làm bằng chứng lâu dài vì chưa có đối chứng dương trên cùng cây. Trước khi dùng claim “0 test” làm quyết định implementation, tạo một thư mục fixture ngoài source hoặc dùng một chuỗi/danh sách giả mà `search_files` nhìn thấy, xác nhận nó trả ít nhất một kết quả, rồi xoá fixture theo cách lùi được. Lượt kế hoạch này không tạo fixture.

### A6. Nguồn quy trình đã đọc

- `/Users/erocathanh/.hermes/profiles/hermes-build-app/SOUL.md`
- `ai/MASTER-PLAN.md`, đặc biệt §4l, §5b, §7-§9
- `ai/PROTOCOL-review-hash.md` R1-R9
- `~/Operations/SO-BAY-DO.md`, bản đồ toàn bộ các heading mục cùng các biến thể/va số trong file hiện tại
- kênh đội: verdict ô-treo 18:55 và trả lời H1-H4 lúc 19:00
- `src/components/UngDung.tsx`, `src/lib/**`, `src/app/api/**`, `package.json`, `.gitignore`

---

## Phụ lục B — giới hạn của kế hoạch

- Kế hoạch này không sửa hành vi ô-treo. Verdict 18:55 chỉ được dùng để đặt ranh giới M3/M4 và tạo ticket sau split.
- Kế hoạch này không cho phép dựng, deploy, dữ liệu thật hay thao tác production.
- Kế hoạch này không tự dọn worktree cũ.
- Kế hoạch này không thay MASTER-PLAN cho tới khi PM bác/chốt và tự quyết nguồn canonical cần cập nhật.
