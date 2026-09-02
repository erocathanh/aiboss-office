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

/** Bóc mọi khai báo cấp mô-đun THUẦN + mọi khai báo KIỂU, trả về đường dẫn tệp .mts tạm. */
export function bocThuan(duongDanTsx) {
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
    if (c.name) tenNhap.add(c.name.text);
    if (c.namedBindings) {
      if (ts.isNamedImports(c.namedBindings)) for (const e of c.namedBindings.elements) tenNhap.add(e.name.text);
      else if (ts.isNamespaceImport(c.namedBindings)) tenNhap.add(c.namedBindings.name.text);
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
  const tep = path.join(os.tmpdir(), 'boc-' + path.basename(duongDanTsx, '.tsx') + '-' + process.pid + '.mts');
  fs.writeFileSync(tep, manh.join('\n\n'), 'utf8');
  return { tep, ten, bo };
}
