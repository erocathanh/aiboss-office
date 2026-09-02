# Báo cáo S1A-M1-BRIEF — đề RACE chỉ phần M1 được phủ

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID: `S1A-M1-BRIEF`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-02T13:55:00Z · 20:55 giờ máy`.
- Thực hiện: `2026-09-02T19:57:22Z · 20:57:22 BST`.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- Commit trước khi soạn đề: `8bcee0b892001388275cb0d6bcba036a45f2e020`.
- Artifact: `ai/DE-BAI-S1A-M1-RACE.md`.
- Ràng buộc đã giữ: chỉ viết đề, không thi S1a, không mở worktree, không build, không sửa `src/`.

## 2. Mục tiêu và owned files

Mục tiêu: soạn cùng một đề RACE cho hai thợ, chỉ M1 phần bộ đóng băng hiện tại với tới; có acceptance đo được, hash nền, owned files riêng cho từng thợ và phép chứng minh runtime không đổi.

Owned files của lượt viết đề:

- `ai/DE-BAI-S1A-M1-RACE.md`
- báo cáo này

## 3. Quyết định phạm vi trong đề

Đề cho phép tách 21 khai báo cấp mô-đun và type/contract thuần. Đề chặn M2-M5, JSX, callback, effect, fetch/SSE và mọi luồng chạy trong thân component.

Đề còn chặn `use-o-chat.ts` trong lượt này. Lý do: `dsO`, `dsORef`, `datDsO`, `capNhat` nằm trong thân `UngDung`, trong khi bộ hiện tại tự khai không phủ 2.855/3.337 dòng thân component. Gọi phần đó là an toàn chỉ vì nhãn M1 sẽ vượt quá bằng chứng hiện có.

Hai danh sách ownership có 16 đường dẫn và cố ý giống nhau vì đây là RACE trong hai worktree độc lập; không phải hai SHARD trong cùng cây.

## 4. Acceptance và chứng minh hành vi không đổi

Đề có tám cổng đo:

1. Không đổi ngoài owned list và không chạm M2-M5/dependency/config/CSS.
2. Bộ đóng băng trước/sau: `tests 47 · pass 47 · fail 0`; sáu phép phá đều làm đỏ.
3. Tập đúng 21 tên không thiếu/thừa, kèm đối chứng bỏ một tên trên bản sao phải đỏ.
4. So runtime AST/transpile của thân `UngDung` với bản lấy từ `git show COMMIT_NEN`; runtime delta bằng 0 và số node đã so lớn hơn 0; thêm runtime statement trên bản sao phải đỏ.
5. Contract có hai phía dùng, không side effect; runtime ba route bằng 0 delta và mutation key/method phải đỏ.
6. Typecheck Node 24.19.0 mã thoát 0; AST import/cycle có đối chứng dương.
7. Bảng 21/21 tên từ vị trí cũ sang mới cùng hash/AST giá trị.
8. Freeze/handoff có commit, diff, hash, số đo và waste của RACE.

Bộ nền thật đã chạy trong lượt soạn đề:

```text
tests 47 · pass 47 · fail 0
phép phá 6 · làm bộ đo đỏ 6
MD5 src/components/UngDung.tsx trước/sau đối chứng âm khớp
```

## 5. Hash và tự kiểm đề

- Hash block: 12 tệp READ + 2 tệp TRACKED = 14 anchor.
- R6 đọc ngược từ đề: `anchors_checked=14 · mismatch=0`.
- Đối chứng dương R6 trong bộ nhớ: cố ý đổi một chữ số MD5 của `src/components/UngDung.tsx` thì `mismatch=1`, gọi đúng tệp.
- Ownership parser: `A=16 · B=16 · identical_RACE=true · empty=0`.
- Scope parser: có câu chặn M2-M5 và `use-o-chat.ts`.
- Ký hiệu phủ định bị cấm trong tệp: 0.
- MD5 đề sau khi bỏ trailing whitespace: `fa46fab4481e9e55926b5acc9a42d382`.

## 6. Commit, push/deploy

- Commit tạo đề ban đầu: `34ecd56a0ba779700520d5541a213040d905d6a8`.
- Một chỉnh sửa tiếp theo bỏ hai trailing whitespace sẽ đi cùng commit báo cáo.
- Chưa push. Không deploy. Không build.

## 7. Blocker thật trước dispatch

`bai-thu/` đang untracked tại thời điểm soạn. Vì vậy commit hiện tại chưa chứa bộ đóng băng và không thể là nền để mở hai worktree. Đề ghi rõ PM chỉ dispatch sau khi:

- bộ kiểm được commit và review;
- hai thợ nhận cùng một `COMMIT_NEN` chứa đúng byte;
- R6/R6a được chạy lại ngay trước dispatch;
- worktree cũ được xử theo quyết định của PM.

Hash hiện tại là hash nội dung đã đo, không được dùng để che việc commit nền chưa tái lập được bộ kiểm.

## 8. Tài liệu SoT và hành động tiếp theo

Không sửa `ai/MASTER-PLAN.md`, `ai/TASK_BOARD.md` hoặc `ai/KE-HOACH-SONG-SONG.md`. PM cần:

1. đọc và chốt đề;
2. xử blocker `bai-thu/` chưa có trong commit;
3. cập nhật `COMMIT_NEN` và đo lại hash ở giây dispatch;
4. chỉ sau đó mới mở hai worktree RACE;
5. giữ S1b M2-M5 ở trạng thái chặn.
