# Báo cáo S0-CHECKER-EMPTY — từ chối danh sách ownership rỗng

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID: `S0-CHECKER-EMPTY`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-02T13:55:00Z · 20:55 giờ máy`.
- Thực hiện: `2026-09-02T19:51:29Z · 20:51:29 BST`.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- Commit nền: `033177d90d4036c562b5a44abd4bd94689437449`.
- Ràng buộc đã giữ: không mở worktree, không build, không sửa `src/`.

## 2. Mục tiêu và owned files

Mục tiêu: không cho trạng thái «chưa khai tệp nào» bị đọc thành «hai danh sách không giao nhau».

Owned files:

- `ai/check-file-ownership.py`
- báo cáo này

## 3. Cơ chế trước và sau

Trước: hai danh sách rỗng hoặc một danh sách rỗng tạo phần giao rỗng, vì vậy checker thoát `0` và im lặng.

Sau: checker kiểm cả hai danh sách ngay sau khi đọc và chuẩn hoá. Nếu danh sách nào không còn đường dẫn hợp lệ, checker:

- trả mã `2`;
- in lỗi trên stderr;
- gọi tên `DANH_SACH_A`, `DANH_SACH_B`, hoặc cả hai;
- in kèm đường dẫn tệp đầu vào để người gọi biết nguồn nào không khai được ownership.

Hành vi danh sách có dữ liệu giữ nguyên: có giao trả `1` và in ba khối; không giao trả `0` và im lặng.

## 4. Kiểm chứng và đối chứng đỏ

Đối chứng đỏ chạy trước khi sửa:

```text
rỗng-rỗng: rc=0 · output 0 byte
rỗng-có:   rc=0 · output 0 byte
EXPECTED_RED: checker vẫn chấp nhận ít nhất một danh sách rỗng
```

Sau khi sửa, năm ca đều đạt:

```text
rỗng-rỗng              rc=2 · gọi tên DANH_SACH_A và DANH_SACH_B
rỗng-có                rc=2 · gọi tên DANH_SACH_A
có-rỗng, ca đối xứng   rc=2 · gọi tên DANH_SACH_B
có-có, có giao         rc=1 · PHAN_GIAO = src/shared.ts
có-có, không giao      rc=0 · output 0 byte
Python AST              OK
NGHIỆM THU              5/5 ca đạt
```

Không chạy `pnpm run lint` hoặc `pnpm run build`: PM cấm build và thay đổi chỉ nằm trong Python/Markdown. Kết quả trên không được dùng để khai toàn repo đã qua lint/build.

## 5. Diff, commit, push/deploy

- Implementation commit: `efb3be5f8034b523abbb2411f5fe823db812f326`.
- Diff: `ai/check-file-ownership.py`, thêm 9 dòng.
- MD5 checker sau sửa: `20e1d340f406c4b036103e56fbefb062`.
- Chưa push. Không deploy.

## 6. Rủi ro và phần chưa xác minh

- Checker coi tệp chỉ có dòng trắng hoặc comment là danh sách rỗng; đây là chủ ý vì không có đường dẫn ownership nào được khai.
- Checker vẫn không mở rộng glob và không xác minh đường dẫn có tồn tại trong Git; hai việc đó ngoài task này.

## 7. Tài liệu SoT

Không sửa `ai/MASTER-PLAN.md`, `ai/TASK_BOARD.md` hoặc `ai/KE-HOACH-SONG-SONG.md`; bản vá chỉ siết cổng công cụ đã tồn tại.

## 8. Hành động tiếp theo cho PM

Dùng checker đã vá để nghiệm thu manifest S1a trước khi mở worktree. Danh sách rỗng nay là lỗi đầu vào, không còn là bằng chứng giao nhau bằng 0.
