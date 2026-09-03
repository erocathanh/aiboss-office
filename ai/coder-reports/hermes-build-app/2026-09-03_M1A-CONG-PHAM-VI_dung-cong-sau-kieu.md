# Báo cáo M1A-CONG-PHAM-VI — cổng sáu kiểu, 126 dòng

> 👤 hermes-build-app · 📅 03/09/2026 08:37 giờ máy · 🔄 v1.0

FROM: hermes-build-app / TO: claude-aiboss-app-pm

## 1. Task và nền

- Task ID dùng trong báo cáo: `M1A-CONG-PHAM-VI`.
- PM giao: `claude-aiboss-app-pm`, tin kênh `2026-09-03T02:35:00Z · 09:35 giờ máy`.
- Repo: `/Users/erocathanh/Projects/aiboss-app-chat`.
- Commit nền/HEAD lúc bắt đầu: `c01ff29cc2bdea10edbda43ede5680f41c4b1809`.
- Owned files: `ai/cong-pham-vi-m1a.mjs`, `ai/test-cong-pham-vi-m1a.mjs`, báo cáo này và một bài nối đuôi trên kênh đội.
- Giữ ràng buộc: không sửa `src/`, không sửa `bai-thu/`, không mở worktree, không chạy `next build`.

## 2. Cơ chế đã dựng

`ai/cong-pham-vi-m1a.mjs` đọc `UngDung.tsx` và `kieu.ts` bằng `ts.createSourceFile`, rồi kiểm độc lập các trục:

1. Trong `kieu.ts` có đúng sáu khai báo interface/type/enum và đúng sáu tên `PhongBan`, `NhanSu`, `TomTatPhien`, `Tin`, `CapGheDungSan`, `OChat`.
2. Sáu tên đó không còn ở bất kỳ độ sâu nào trong AST `UngDung.tsx`.
3. Tổng span thân sáu node, tính từ `node.getStart()` đến `node.end`, đúng `126` dòng. Cách này không hút chú thích đứng trước khai báo vào thân.
4. `CapGhe` còn đúng một lần, nằm trong một hàm ở `UngDung.tsx`; nếu có trong `kieu.ts` thì báo riêng `CAP_GHE_BỊ_MANG_SANG`.
5. Hai dấu riêng của khối chú thích dòng 17 và 216-254 còn ở nguồn và không có ở đích; từng khối có chẩn đoán riêng.
6. Tệp đích không có khai báo nào, tệp không đọc được hoặc AST lỗi đều trả mã `2` với chữ `TỪ CHỐI`; không trả mã 0 cho mẫu rỗng.

Ca xanh in toàn bộ số thay vì chỉ in chữ đạt:

```text
KIEU=6 TEN_DUNG=6 TEN_THIEU=0 TEN_DU=0 CON_TRONG_UNGDUNG=0 TONG_DONG_THAN=126 CAP_GHE_TRONG_UNGDUNG=1 CHU_THICH_NGUON=2 CHU_THICH_DICH=0
```

## 3. Nghiệm thu hai chiều

Lệnh:

```text
fnm exec --using=24.19.0 -- node --test ai/test-cong-pham-vi-m1a.mjs
```

Kết quả:

```text
tests 8 · pass 8 · fail 0 · duration 1898.814125 ms · mã thoát 0
```

Mỗi test chạy lại ca đúng và đòi mã 0 trước khi dựng đúng một vi phạm:

| Điều kiện | Ca đúng | Ca vi phạm và chẩn đoán bị bắt |
|---|---:|---|
| Đủ sáu tên ở đích | 0 | bỏ `Tin` → khác 0, `THIẾU_TÊN: Tin` |
| Vắng sáu tên khỏi nguồn | 0 | để `PhongBan` ở nguồn → khác 0, `CHƯA_DỜI_HẾT` |
| Không có kiểu thứ bảy | 0 | thêm `ThuBay` → khác 0, `KHAI_BÁO_THỨ_BẢY: ThuBay` |
| `CapGhe` ở trong hàm | 0 | mang sang đích → khác 0, `CAP_GHE_BỊ_MANG_SANG` |
| Chú thích dòng 17 ở nguồn | 0 | mang sang đích → khác 0, `CHÚ_THÍCH_1_BỊ_MANG_SANG_KIEU` |
| Chú thích dòng 216-254 ở nguồn | 0 | mang sang đích → khác 0, `CHÚ_THÍCH_2_BỊ_MANG_SANG_KIEU` |
| Tổng thân đúng 126 | 0 | thêm một dòng trong thân → khác 0, báo `127, phải đúng 126` |
| Có vật để kiểm | 0 | hai tệp rỗng → mã 2, `TỪ CHỐI` |

## 4. Đối chiếu với sáu thân thật đang ở UngDung.tsx

Một phép mô phỏng trong `/tmp` dùng AST trích đúng sáu node hiện tại bằng `getStart/end`, bỏ sáu node khỏi bản sao `UngDung.tsx`, giữ `CapGhe` và hai chú thích ở nguồn, rồi chạy cổng trên hai bản sao. Không sửa `src/`.

```text
KIEU=6 TEN_DUNG=6 TEN_THIEU=0 TEN_DU=0 CON_TRONG_UNGDUNG=0 TONG_DONG_THAN=126 CAP_GHE_TRONG_UNGDUNG=1 CHU_THICH_NGUON=2 CHU_THICH_DICH=0
RC=0 KHAI_BAO_TRICH=6
```

Đây là đối chiếu trên chính sáu thân thật, không chỉ trên fixture tổng hợp của unit test.

## 5. Kiểm cú pháp, typecheck và vệ sinh

```text
node --check ai/cong-pham-vi-m1a.mjs                         → mã 0
node --check ai/test-cong-pham-vi-m1a.mjs                    → mã 0
fnm exec --using=24.19.0 -- npx tsc --noEmit                 → mã 0
git diff --check -- hai tệp                                  → mã 0
ký hiệu phủ định bị cấm trong hai tệp                         → 0
```

Chạy cổng mặc định trên cây hiện tại trả mã `2` và `TỪ CHỐI` vì `src/components/ung-dung/kieu.ts` chưa tồn tại. Đây là hành vi đúng trước lượt dời: cổng không cấp xanh khi chưa có vật đích để kiểm.

## 6. Hash và trạng thái

```text
bb6b417275c1c0cb31650e3ab9984dc6  ai/cong-pham-vi-m1a.mjs       210 dòng
4cb13b219dfb37170cdc8eae528f070a  ai/test-cong-pham-vi-m1a.mjs  163 dòng
```

Không stage tệp của người khác. Không push, không deploy.

## 7. Giới hạn và bước tiếp theo

- Cổng này đo phạm vi sáu kiểu và các vật cấm nêu trong task; `so-diff.py` vẫn là cổng riêng cho tính dời nguyên văn.
- Dấu chú thích dùng hai câu nhận diện có thật trong từng khối. Lượt dời-thuần không được sửa câu nên việc mang nguyên khối sang đích bị bắt; thay nội dung để lách thuộc trách nhiệm của `so-diff`.
- Tôi không tự chấm cổng đạt. Bước kế tiếp là `hermes-aiboss-app-reviewer` đọc hai tệp tại đúng hash và trả verdict câu hẹp trước khi mở M1a.
