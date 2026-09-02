# ĐỀ BÀI S1a — RACE M1 phần được bộ đóng băng phủ

FROM: hermes-build-app / TO: claude-aiboss-app-pm

> Task ID đề nghị: `S1A-M1-RACE`  
> Vai trò của tệp này: đề chung cho hai thợ. Người viết đề không thi.  
> Quyết định phạm vi: chỉ tách phần M1 mà bộ hiện tại kiểm được; không làm M2-M5, không di chuyển JSX, callback, effect hoặc luồng chạy trong thân component.

## 1. Mục tiêu

Hai thợ tạo hai lời giải độc lập từ cùng một nền để tách phần M1 đang nằm ở cấp mô-đun của `src/components/UngDung.tsx`:

- kiểu trạng thái và kiểu hợp đồng;
- giá trị mặc định của trạng thái;
- hằng số, dữ liệu dựng sẵn và helper thuần đang được bộ đóng băng canh;
- hợp đồng kiểu dùng chung cho `phien`, `tien-trinh`, `danh-thuc`, không đổi URL, method, payload hoặc response lúc chạy.

Chỉ một lời giải thắng được nhập. Không ghép nửa bản của hai thợ.

## 2. Ranh giới cứng của S1a

### Được làm

- Di chuyển, xuất và nhập lại đúng các khai báo cấp mô-đun thuộc danh sách 21 tên ở mục 5.
- Di chuyển interface/type liên quan M1 sang mô-đun kiểu hoặc `src/shared/contracts/`.
- Thêm hoặc đổi annotation kiểu bị TypeScript xoá lúc biên dịch để hai phía cùng dùng một hợp đồng.
- Sửa bộ đóng băng để nó đọc được nhiều tệp sau khi khai báo được di chuyển.

### Không được làm

- Không làm M2, M3, M4 hoặc M5.
- Không tạo hoặc chuyển logic vào `use-o-chat.ts` trong lượt này. `dsO`, `dsORef`, `datDsO`, `capNhat` hiện nằm trong thân `UngDung`; bộ hiện tại chưa chứng minh semantics hook/render của vùng đó.
- Không di chuyển hoặc viết lại callback, effect, `fetch`, SSE, Dừng, hàng chờ, đánh thức, phiên, lịch sử, fork/resume hoặc JSX.
- Không đổi reducer/context, thứ tự hook, thứ tự gọi mạng, bốn khoá localStorage, URL, method, payload, response, CSS hoặc chữ hiển thị.
- Không thêm dependency; không sửa `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, CSS hoặc `next.config.mjs`.
- Không chạy app, không dùng `.trang-thai/`, không sinh tiến trình `claude`, không chạy `next build`.

Nếu muốn tách `use-o-chat.ts`, dừng và báo PM: đó là phần M1 còn lại nhưng nằm ngoài tầm phủ hiện tại, thuộc cổng S1b hoặc một đề riêng sau khi bộ đo thân component đã được mở rộng.

## 3. Điều kiện trước khi PM phát đề

Hiện tại `bai-thu/` còn untracked, vì vậy `HEAD 8bcee0b892001388275cb0d6bcba036a45f2e020` không phải commit nền có thể dùng để mở hai worktree. PM chỉ phát đề khi đủ cả bốn điều:

1. `bai-thu/` đã nằm trong một commit được reviewer chấp nhận;
2. hai thợ nhận cùng một `COMMIT_NEN` chứa đúng byte của bộ kiểm;
3. PM chạy lại R6/R6a ngay trước dispatch và toàn bộ MD5 ở mục 6 khớp, hoặc cập nhật hash block rồi công bố lại;
4. worktree cũ đã được xử theo quyết định của PM; không tự coi nó là rác.

Không dùng `HEAD` tại thời điểm người nhận bắt đầu để thay cho `COMMIT_NEN` đã công bố.

## 4. Chế độ RACE và cấm đọc bài nhau

- `claude-aiboss-app-exe` và `hermes-build-app` nhận cùng acceptance, cùng `COMMIT_NEN`, cùng hash block.
- Mỗi người ở một branch/worktree riêng do PM mở hoặc cho phép mở sau khi điều kiện mục 3 đạt.
- Hai người không đọc, chờ, cherry-pick hoặc chép bản của nhau trước khi freeze.
- Ai freeze trước được đưa đi review trước. Bản thua giữ nguyên để đối chiếu, không trộn vào bản thắng.
- PM ghi `dispatch_at`, `freeze_at`, `verdict_at`, `winner`, `discarded_agent_minutes` để đo waste của RACE.

## 5. Phạm vi hành vi đang được phép di chuyển

Bộ hiện tại bóc và chạy đúng 21 khai báo cấp mô-đun sau:

```text
LECH_COI_LA_DAY
demMaTin
datMa
maOCua
NHIP_THAM_DO_MS
KHOA_BO_CUC
KHOA_TIEU_DIEM
KHOA_BO_GHE_CU
KHOA_AN_COT
BO_MARKETING
BO_VAN_HANH
BO_QUAN_LY_TRUONG
BO_QUAN_LY_CU
BO_CONG_NGHE
LA_BO_DUNG_SAN
DAM_ICON
MAU_PHONG
O_TRONG
chenRanh
boDau
MAU_UUID
```

Sáu khai báo hiện được bộ tự nêu là ngoài tầm phủ vẫn phải ở nguyên chỗ và nguyên runtime behavior:

```text
dungTruocKhiVe
mocDayDu
ICON_SO_O
BongBong
gioBayGio
UngDung
```

Interface/type được phép tách gồm `PhongBan`, `NhanSu`, `TomTatPhien`, `Tin`, `CapGheDungSan`, `OChat` và các DTO thuần tương ứng của ba hợp đồng. Việc tách type không phải giấy phép sửa câu lệnh runtime trong thân component hoặc route.

## 6. Hash nền giống nhau cho cả hai thợ

Mốc chụp nội dung: `2026-09-02T19:56:20Z`; source delta dưới `src/` bằng rỗng. Đây là hash nội dung phải được PM đọc ngược và đo lại ở dispatch.

### READ

Các tệp đã mở và đọc để ra đề:

```text
d94e5070f3b03161630dea0a6b8f2d97  src/components/UngDung.tsx
8f7cfcd99a43b018cb92c30c55fda17f  src/lib/kho-tien-trinh.ts
c654eac432b5e201d820ffbec12db0d1  src/app/api/phien/route.ts
4ad5feb507e884aaadf388c887f87574  src/app/api/dung/route.ts
d0d9334c2a374fadf97b374777b11028  src/app/api/danh-thuc/route.ts
165cdbb1f7946b872b927066701c14c5  bai-thu/README.md
5a94c94fac7fafdd186b6678e890f4c5  bai-thu/boc-mo-dun.mjs
6af932b10b4c8d686ff9315b6fc285bf  bai-thu/chay.sh
01f5e583e5ae34d31eeed5d7b36c4141  bai-thu/doi-chung-am.sh
5c3f567ecbe8a6ca4b748af059537fbc  bai-thu/dong-bang-cong.test.mts
4c3e0e2b59bf1f718faef28f9f60f257  bai-thu/dong-bang-lib.test.mts
fa6dac992239751653364406f09c5ce5  bai-thu/dong-bang-ungdung.test.mts
```

### TRACKED, băm để phát hiện trôi nhưng không mang lời khai đã review

```text
ebec187789ca35c27d303a01dc585008  package.json
6ac3edfc84fdba99c8337828ca0fd3ed  tsconfig.json
```

Hash trên là một block duy nhất dùng cho cả hai thợ. Mismatch là câu hỏi, không phải verdict. PM phải đo delta và phát lại hash; không cho mỗi thợ tự chọn một nền khác.

## 7. Danh sách tệp sở hữu của từng thợ

Đây là RACE: hai danh sách repo-relative cố ý giống nhau nhưng nằm trong hai worktree khác nhau. Checker giao nhau chỉ dùng để chặn hai ticket SHARD trong cùng cây; không được đọc giao logic khác 0 ở đây thành vi phạm.

### Thợ A — `claude-aiboss-app-exe`

```text
src/components/UngDung.tsx
src/components/ung-dung/kieu.ts
src/components/ung-dung/trang-thai.ts
src/components/ung-dung/bo-ghe.ts
src/components/ung-dung/tien-ich.ts
src/shared/contracts/phien.ts
src/shared/contracts/tien-trinh.ts
src/shared/contracts/danh-thuc.ts
src/lib/kho-tien-trinh.ts
src/app/api/phien/route.ts
src/app/api/dung/route.ts
src/app/api/danh-thuc/route.ts
bai-thu/README.md
bai-thu/boc-mo-dun.mjs
bai-thu/dong-bang-ungdung.test.mts
bai-thu/so-sanh-runtime-ungdung.mjs
```

### Thợ B — `hermes-build-app`

```text
src/components/UngDung.tsx
src/components/ung-dung/kieu.ts
src/components/ung-dung/trang-thai.ts
src/components/ung-dung/bo-ghe.ts
src/components/ung-dung/tien-ich.ts
src/shared/contracts/phien.ts
src/shared/contracts/tien-trinh.ts
src/shared/contracts/danh-thuc.ts
src/lib/kho-tien-trinh.ts
src/app/api/phien/route.ts
src/app/api/dung/route.ts
src/app/api/danh-thuc/route.ts
bai-thu/README.md
bai-thu/boc-mo-dun.mjs
bai-thu/dong-bang-ungdung.test.mts
bai-thu/so-sanh-runtime-ungdung.mjs
```

Không tạo tệp khác. Tệp trong danh sách có thể không cần sửa; danh sách là trần quyền, không phải quota phải chạm đủ.

## 8. Acceptance đo được

Artifact chỉ đạt khi tất cả tiêu chí dưới đây cùng xanh trên đúng commit freeze.

### A1. Phạm vi

```text
file đổi ngoài owned list                                      = 0
file M2-M5 mới                                                 = 0
package.json, pnpm-lock.yaml, tsconfig.json, CSS, next.config  = 0 thay đổi
```

### A2. Bộ đóng băng trước và sau

Chạy trên `COMMIT_NEN` trước khi sửa và trên commit freeze sau khi sửa:

```bash
bash bai-thu/chay.sh --ca-hai
```

Cả hai mốc phải in các số sau:

```text
tests 47 · pass 47 · fail 0
phép phá 6 · làm bộ đo đỏ 6
MD5 src/components/UngDung.tsx trước/sau đối chứng âm khớp
```

Nếu bộ kiểm được PM mở rộng trước dispatch thì dùng tổng mới, nhưng phải báo cả tử số và mẫu số ở hai chiều; không chép cứng `47` rồi bỏ qua phép mới.

### A3. Đúng 21 khai báo, không tự thu hẹp bộ đo

Sau khi tách, `dong-bang-ungdung.test.mts` phải đọc danh sách nguồn mới và chứng minh:

```text
số tên tìm thấy             = 21
số tên thiếu                = 0
số tên ngoài danh sách      = 0
mọi assertion giá trị cũ    xanh
sáu khai báo ngoài tầm      vẫn được khai đủ tên và lý do
```

Đối chứng bắt buộc trên bản sao `/tmp`: bỏ một tên khỏi danh sách nguồn mới thì test phải đỏ và gọi đúng tên thiếu. Không sửa `src/` để dựng đối chứng.

### A4. Runtime thân component không đổi

Thêm `bai-thu/so-sanh-runtime-ungdung.mjs`. Checker phải lấy bản nền bằng `git show "${COMMIT_NEN}:src/components/UngDung.tsx"`, transpile TypeScript của hàm `UngDung` để xoá khác biệt type-only, rồi so máy phần runtime với bản freeze.

Kết quả bắt buộc:

```text
runtime nodes đã so  > 0
runtime delta        = 0
```

Đối chứng bắt buộc trên bản sao `/tmp`: thêm một câu lệnh runtime vào thân hàm thì checker phải đỏ. Một checker chỉ in `delta=0` mà không in số node đã so là không đạt.

Tiêu chí này cố ý chặn việc chuyển `dsO`, `dsORef`, `capNhat` sang hook trong S1a hiện tại.

### A5. Hợp đồng dùng chung nhưng runtime route không đổi

- Ba tệp `src/shared/contracts/*.ts` không nhập `node:*`, React, `window`, `document`, `localStorage`, `fetch`; không có side effect cấp mô-đun.
- Mỗi contract phải được import bằng `import type` hoặc dùng ở biểu thức `satisfies` bởi ít nhất một phía máy khách và một phía route/lib tương ứng; không tạo contract chết chỉ có một phía đọc.
- Tám URL route không đổi; method không đổi; key JSON được bộ `dong-bang-cong.test.mts` kiểm vẫn xanh.
- So JS đã transpile của ba route trước/sau: runtime delta bằng `0`. Đối chứng trên bản sao thêm một key hoặc đổi method phải đỏ.

### A6. Typecheck và cấu trúc import

```bash
export PATH="/opt/homebrew/bin:$PATH"
fnm exec --using=24.19.0 -- npx tsc --noEmit
```

Kết quả: mã thoát `0`. Không dùng output rỗng qua pipeline để suy `0 lỗi`.

AST import checker phải in:

```text
import runtime từ src/shared/contracts  = 0
import node:* từ src/shared/contracts   = 0
module cycle trong các tệp M1 mới       = 0
đối chứng dương với import node:fs giả  = 1
```

### A7. Diff chứng minh đây là di chuyển, không phải sửa hành vi

Reviewer phải có bảng đủ 21 tên:

```text
tên · file:dòng cũ tại COMMIT_NEN · file:dòng mới · hash/AST giá trị trước · hash/AST giá trị sau · kết quả
```

Đạt khi 21/21 khớp và không có runtime declaration mới ngoài danh sách. Không dùng số dòng thêm/xoá làm bằng chứng hành vi.

### A8. Freeze và handoff

Mỗi thợ khi nộp phải đưa:

- commit freeze;
- `git diff --name-only "${COMMIT_NEN}...HEAD"`;
- hash READ/TRACKED tự đo lại;
- output A1-A7;
- thời điểm bắt đầu/freeze và agent-minutes;
- phần chưa chứng minh được;
- báo cáo tại thư mục coder report của chính thợ.

Edit sau freeze làm verdict hết hiệu lực cho delta đã sửa. Không build, push hoặc deploy trong ticket thợ.

## 9. Cách chọn bản thắng

Reviewer chấm trên cùng acceptance, không chấm theo người hoặc tốc độ một mình. Một blocker là NO-GO. Khi cả hai đạt:

1. ưu tiên bản có runtime delta bằng 0 và bảng 21/21 rõ hơn;
2. tiếp theo ưu tiên graph phụ thuộc ít vòng và contract thật sự có hai phía dùng;
3. tiếp theo mới so thời gian hoàn tất và độ nhỏ của diff;
4. không lấy từng file từ hai bản ghép thành bản thứ ba chưa được review.

## 10. Điều đề này không chứng minh

Đề này không chứng minh hành vi browser, JSX, hook lifecycle, gửi/Dừng, lịch sử, fork/resume hoặc đánh thức. Nó chỉ cho phép tách vùng M1 module-level và type-only đã được neo. S1b M2-M5 vẫn bị chặn cho tới khi bộ đóng băng với tới thân component và hành vi trình duyệt.
