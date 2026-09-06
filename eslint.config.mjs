/**
 * 🚦 CỔNG LINT — việc ⑭, Owner giao 06/09/2026 («sao không cài cái này đi»).
 *
 * 🕳 TRƯỚC ĐÓ: `package.json` khai `"lint": "next lint"` nhưng KHÔNG có gói eslint và KHÔNG có
 *    tệp cấu hình nào. Lệnh đó chưa từng chạy được ⇒ **cổng chưa từng nổ**, mà cả nhà tin là có.
 * 🔑 Một dòng script trỏ tới thứ chưa cài là lời hứa, khôngphải cơ chế — cùng hình lỗi với
 *    `postbuild` từng ghi trong hồ sơ ghế này.
 *
 * ⚠️ VÌ SAO KHÔNG DÙNG `next lint`: đo 06/09 trên Next 15.5.4 — nó tự in
 *    «`next lint` is deprecated and will be removed in Next.js 16», và bảo chuyển sang ESLint CLI.
 *    Dựng cổng trên một lệnh sắp bị gỡ là dựng lên cát ⇒ đi thẳng ESLint CLI + cấu hình PHẲNG.
 *
 * 📌 BỘ LUẬT: `next/core-web-vitals` + `next/typescript` — đúng bộ create-next-app chọn cho
 *    mức «Strict». **KHÔNG tắt một luật nào.** Lần chạy đầu ra bao nhiêu lỗi thì báo bấy nhiêu:
 *    đó là NỢ CŨ lộ ra, khôngphải hỏng mới, và việc của lượt này là ĐẾM chứ khôngphải DỌN.
 * 🔴 Loại trừ ở dưới CHỈ có thư mục sinh ra bởi máy. Khôngmột dòng nào loại trừ mã dự án —
 *    kể cả `bai-thu/vat-thu/` (vật thử cố ý bẩn). Số của nó được TÁCH RIÊNG khi báo cáo, chứ
 *    khôngbị giấu đi: giấu thì con số tổng đẹp lên mà nợ vẫn nguyên.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/* 🪤 Đặt tên rồi mới xuất: xuất thẳng một mảng vô danh thì chính cổng này bắt lỗi tệp của nó
   (`import/no-anonymous-default-export`). Tôi để nguyên lỗi đó ở lần chạy ĐẦU rồi mới sửa —
   để con số đầu tiên là số THẬT, kể cả phần do tôi vừa đẻ ra. */
const cauHinh = [
  { ignores: ['.next/**', '.next-dev/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default cauHinh;
