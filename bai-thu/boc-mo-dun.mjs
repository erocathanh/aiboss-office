/**
 * 🔬 BỘ BÓC — lấy các khai báo CẤP MÔ-ĐUN THUẦN ra khỏi một tệp .tsx rồi cho chạy thật.
 *
 * 🕳 VÌ SAO CẦN NÓ: `src/components/UngDung.tsx` chỉ XUẤT đúng một thứ (`UngDung`). 21 khai báo
 *    cấp mô-đun còn lại — trong đó có `LA_BO_DUNG_SAN`, năm bộ ghế, `chenRanh`, `boDau` — đều
 *    KHÔNG xuất, nên bài thử KHÔNG import được. Mà chúng chính là thứ sẽ BỊ DI CHUYỂN khi chia tệp.
 * ✅ Cách này bóc NGUYÊN VĂN mã từ cây cú pháp rồi chạy nó ⇒ là hành vi THẬT, KHÔNG phải bản chép.
 *    Và nó KHÔNG sửa một byte nào trong `src/`.
 *
 * ⚠️ GIỚI HẠN PHẢI BIẾT — bộ này CHỈ bóc được thứ THUẦN:
 *    KHÔNG móc React · KHÔNG chạm `document`/`window`/`localStorage` · KHÔNG `fetch`
 *    · KHÔNG `new Date`/`Math.random`. Thứ dính mấy cái đó nằm NGOÀI tầm phủ, và
 *    `bai-thu/README.md` liệt kê đúng phần KHÔNG phủ được kèm số dòng.
 */
import ts from './nap-typescript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KHONG_THUAN =
  /\b(useState|useRef|useEffect|useCallback|useMemo|document|window|localStorage|fetch|Math\.random|Date\.now|new Date)\b/;

/**
 * 📂 GOM NHIỀU TỆP — vá Q4.2 (reviewer NO-GO 22:35).
 *
 * 🕳 Bản đầu nhận ĐÚNG MỘT đường nguồn. Mà đây là bộ đo dựng ra để nghiệm thu việc CHIA TỆP —
 *    **nó KHÔNG đọc nổi một kho đã chia.** Sau khi chia, nó chỉ còn hai kết cục:
 *      đỏ vì không tìm thấy · hoặc có người «sửa cho chạy» bằng cách trỏ sang tệp mới
 *    ⇒ và trỏ sang tệp mới CHÍNH LÀ chụp lại mã đã chia rồi so với chính nó = xanh vô nghĩa.
 * 📌 Tôi viết trong README rằng «sau khi chia thì sửa NGUON thành danh sách tệp» — một câu chữ
 *    hứa một khả năng MÃ KHÔNG CÓ. Đúng bệnh «chú thích hứa nhiều hơn mã làm», mắc ngay trong
 *    tài liệu của công cụ dựng ra để chống nó.
 * ✅ Nay nhận MỘT đường HOẶC một MẢNG đường, và gom kết quả lại thành một bộ duy nhất.
 */
export function bocThuanNhieuTep(dsDuongDan) {
  const ds = Array.isArray(dsDuongDan) ? dsDuongDan : [dsDuongDan];
  if (ds.length === 0) throw new Error('bocThuanNhieuTep: danh sách RỖNG ⇒ CHƯA ĐO, không phải ĐẠT');
  const manh = [], ten = [], bo = [], theoTep = {};
  for (const d of ds) {
    const r = bocThuan(d, true);
    manh.push(`// ── ${d} ──`, r.manhVan);
    ten.push(...r.ten); bo.push(...r.bo);
    theoTep[d] = r.ten;
  }
  const trung = ten.filter((t, i) => ten.indexOf(t) !== i);
  if (trung.length) {
    throw new Error(
      `TRÙNG TÊN giữa các tệp: ${[...new Set(trung)].join(', ')}\n` +
      '⇒ sau khi chia, hai tệp cùng khai một tên là một LỖI THẬT, KHÔNG phải chuyện của bộ đo bỏ qua.',
    );
  }
  const tep = path.join(os.tmpdir(), `boc-gom-${process.pid}-${Date.now()}.mts`);
  fs.writeFileSync(tep, manh.join('\n\n'), 'utf8');
  return { tep, ten, bo, theoTep, soTep: ds.length };
}

/** Bóc mọi khai báo cấp mô-đun THUẦN + mọi khai báo KIỂU, trả về đường dẫn tệp .mts tạm. */
export function bocThuan(duongDanTsx, chiTraVan = false) {
  const ma = fs.readFileSync(duongDanTsx, 'utf8');
  const src = ts.createSourceFile(duongDanTsx, ma, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // 🔴 THU TÊN ĐÃ NHẬP TỪ NGOÀI — khai báo nào dùng tới chúng thì KHÔNG bóc được.
  // 🕳 Ca thật lúc dựng bộ này: `ICON_SO_O` trỏ vào các biểu tượng nhập từ thư viện ⇒ bóc ra
  //    thì nổ «NumberOne is not defined». Nó KHÔNG phải mã bẩn — nó chỉ KHÔNG tự đứng một mình.
  // 📌 Bỏ nó là ĐÚNG, nhưng phải ĐẾM và KHAI RA, đừng lặng lẽ bỏ. Bỏ lặng lẽ thì bộ đo
  //    xanh dần theo cách nó tự thu hẹp phạm vi.
  const tenNhap = new Set();
  src.forEachChild((n) => {
    if (!ts.isImportDeclaration(n) || !n.importClause) return;
    const c = n.importClause;
    /**
     * 🔴 BỎ QUA NHẬP-KIỂU — `import type` bị TypeScript XOÁ lúc biên dịch, nó KHÔNG có mặt
     *    lúc chạy, nên một khai báo chỉ tham chiếu tên nhập-kiểu VẪN THUẦN.
     *
     * 🕳 CA SINH RA BẢN VÁ (M1a, 03/09): dời 6 khai báo kiểu sang `ung-dung/kieu.ts` rồi nhập
     *    lại bằng `import type`. Bộ bóc coi chúng như nhập THƯỜNG ⇒ từ chối 4 khai báo
     *    (BO_QUAN_LY_TRUONG · BO_QUAN_LY_CU · BO_CONG_NGHE · O_TRONG) ⇒ bóc được rơi 21 → 17
     *    ⇒ bộ đo 76/91.
     * 🔑 Và MÃ KHÔNG ĐỔI MỘT BYTE — tôi đo từng khai báo cấp mô-đun: 22 cái, 0 cái khác nhau,
     *    bốn cái bị bỏ băm GIỐNG HỆT. **Hồi quy nằm ở BỘ ĐO, không nằm ở mã.**
     * ⚠️ Bản vá này CHỈ nới đúng nhập-KIỂU. Nhập THƯỜNG vẫn loại khai báo như cũ — có phép thử
     *    hai chiều chốt điều đó, vì «nới cho hết đỏ» là cách dễ nhất để giết một bộ đo.
     */
    if (c.isTypeOnly) return;                     // import type { … } from '…'
    if (c.name) tenNhap.add(c.name.text);
    if (c.namedBindings) {
      if (ts.isNamedImports(c.namedBindings)) {
        for (const e of c.namedBindings.elements) {
          if (e.isTypeOnly) continue;             // import { type A, B } from '…'
          tenNhap.add(e.name.text);
        }
      } else if (ts.isNamespaceImport(c.namedBindings)) tenNhap.add(c.namedBindings.name.text);
    }
  });

  const manh = [];
  const ten = [];
  const bo = [];
  src.forEachChild((n) => {
    // kiểu thì luôn lấy — nó bị xoá lúc chạy, nhưng thiếu nó thì mã KHÔNG phân tích được
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) {
      manh.push('export ' + n.getText(src));
      return;
    }
    let t = '';
    if (ts.isFunctionDeclaration(n) && n.name) t = n.name.text;
    else if (ts.isVariableStatement(n)) {
      const d = n.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name)) t = d.name.text;
    }
    if (!t) return;
    const chu = n.getText(src);
    if (KHONG_THUAN.test(chu)) { bo.push([t, 'dính móc React / DOM / đồng hồ']); return; }
    const dungNhap = [...tenNhap].filter((x) => new RegExp('\\b' + x + '\\b').test(chu));
    if (dungNhap.length) { bo.push([t, 'dùng tên nhập từ ngoài: ' + dungNhap.join(',')]); return; }
    manh.push('export ' + chu.replace(/^export\s+/, ''));
    ten.push(t);
  });
  const manhVan = manh.join('\n\n');
  if (chiTraVan) return { manhVan, ten, bo };
  const tep = path.join(os.tmpdir(), 'boc-' + path.basename(duongDanTsx, '.tsx') + '-' + process.pid + '.mts');
  fs.writeFileSync(tep, manhVan, 'utf8');
  return { tep, ten, bo };
}
