/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴🔴  THƯỚC NÀY ĐANG HỎNG — KHÔNG ĐƯỢC COI MÀU XANH CỦA NÓ LÀ BẰNG CHỨNG  🔴🔴🔴
 *
 * Bị bác ở verdict `20260905_173533_d01eab` ngày 05/09/2026. Người soi chỉ đích danh:
 *   · phân loại SAI ca gán vào THUỘC TÍNH mà CÓ người đọc          ⇒ báo ĐỎ OAN mã đúng
 *   · KHÔNG đệ quy nguyên nút khi gặp dấu phẩy                     ⇒ sập
 *   · `parseDiagnostics` có lỗi mà vẫn trả bảng XANH               ⇒ TỆP VỠ CÚ PHÁP = XANH
 *   · kết quả bị GHI ĐÈ trước khi đọc vẫn bị tính là «đã dùng»     ⇒ bỏ lọt
 *
 * ⚠️ Nó sai CẢ HAI CHIỀU. Đỏ oan chỉ tốn thời gian; **xanh sai thì đẻ ra lòng tin giả** —
 *    lần hồi quy kế cùng hình lỗi có thể đi qua mà khôngai thấy.
 *
 * 🅒 QUYẾT ĐỊNH OWNER 05/09/2026 18:30: phần PHÂN LOẠI của tệp này **thôi làm cổng**, hạ xuống
 *    mức BÁO-CÁO. Ba thứ vẫn là cổng cứng (người soi đã xác nhận ĐẠT):
 *      · BẢNG đầy đủ «từng hàm × từng cách xử lý»
 *      · NĂM phép phá
 *      · phép «mọi lối ra của `datNguoi` phải trả về giá trị và đi qua MỘT cửa báo hỏng»
 *
 * 🛠 SỬA TỬ TẾ nằm ở việc ㉒ — đề bài: `ai/ban-giao/2026-09-05_thuoc-ast-ba-trang-thai.md`.
 *    Đừng vá vặt ở đây rồi tưởng đã lành; bốn lỗi trên là bốn lỗi khác nhau.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔬 THƯỚC «KẾT QUẢ CÓ AI ĐỌC KHÔNG» — đọc CÂY CÚ PHÁP, khôngđọc chuỗi, khôngđọc TÊN.
 *
 * 🕳 BA ĐỜI THƯỚC, BA KIỂU SAI — ghi lại vì cả ba đều từng XANH:
 *    đời 1: soi dòng có chữ `ghiO`     ⇒ mù với `void datNguoi(...)` ở tầng trên
 *    đời 2: soi ký tự đứng trước       ⇒ nhận nhầm `(await ghiO(...));` là có-người-nhận
 *    đời 3: thêm luật «tên `_` = khôngdùng» ⇒ hỏng CẢ HAI CHIỀU: `_bo` có đọc thì báo đỏ oan,
 *                                          `bo` khôngđọc thì cho qua.
 * 🔑 Gốc của cả ba: chúng hỏi một câu GẦN GIỐNG câu cần hỏi. Câu cần hỏi là
 *    **«giá trị này có ai đọc không»** — đó là HÀNH VI, và chỉ cây cú pháp trả lời được.
 *    Tên biến khôngchứng minh hành vi sử dụng; ký tự đứng trước cũng vậy.
 */
import ts from './nap-typescript.mjs';

/** những lớp vỏ KHÔNG làm ai đọc giá trị — bóc hết rồi mới xét chỗ đứng */
const VO = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AwaitExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.TypeAssertionExpression,
  ts.SyntaxKind.SatisfiesExpression,
]);

export const docNguon = (ma, ten = 'x.tsx') =>
  ts.createSourceFile(ten, ma, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

/**
 * 🔴 PHƠI LỖI CÚ PHÁP RA — đây là một trong bốn lỗi người soi chỉ, và tôi KHÔNG chữa nó ở lượt này.
 * Tệp vỡ cú pháp thì `createSourceFile` vẫn trả về một cây (cây THIẾU), nên mọi phép đếm bên dưới
 * vẫn chạy trơn và vẫn ra một bảng trông rất bình thường.
 * 🔑 Hàm này chỉ để NÓI RA, khôngđể chặn — chặn là việc của ㉒. Nhưng im lặng thì người đọc bảng
 *    khôngcó cách nào biết bảng ấy dựng trên một cây thiếu.
 */
export const loiCuPhap = (src) => (src.parseDiagnostics ?? []).map((d) =>
  `${d.file?.fileName ?? '?'}:${d.start ?? '?'} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);

/** hàm nào KHAI `Promise<T>` với T khác `void` ⇒ nó có kết quả, và kết quả đó khôngđược rơi */
export function timHamCoKetQua(src) {
  const ten = new Set();
  const coKetQua = (t) => !!t && ts.isTypeReferenceNode(t)
    && t.typeName.getText(src) === 'Promise'
    && t.typeArguments?.length === 1
    && t.typeArguments[0].kind !== ts.SyntaxKind.VoidKeyword;
  const di = (n) => {
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) && coKetQua(n.type)) {
      let t = null;
      if (ts.isFunctionDeclaration(n) && n.name) t = n.name.text;
      else {
        let p = n.parent;
        for (let b = 0; b < 6 && p; b += 1, p = p.parent) {
          if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) { t = p.name.text; break; }
        }
      }
      if (t) ten.add(t);
    }
    ts.forEachChild(n, di);
  };
  di(src);
  return [...ten].sort();
}

/** ⚖️ CÂU HỎI THẬT: có chỗ nào ĐỌC cái tên này không — khôngphải cái tên trông thế nào */
function duocDoc(ten, src, boQua) {
  let thay = false;
  const di = (n) => {
    if (thay) return;
    if (ts.isIdentifier(n) && n.text === ten && n !== boQua) {
      const p = n.parent;
      const laNhanChuKhongPhaiDoc = !!p && (
        (ts.isPropertyAccessExpression(p) && p.name === n)
        || (ts.isPropertyAssignment(p) && p.name === n)
        || (ts.isBindingElement(p) && p.propertyName === n)
        || (ts.isVariableDeclaration(p) && p.name === n));
      if (!laNhanChuKhongPhaiDoc) thay = true;
    }
    ts.forEachChild(n, di);
  };
  di(src);
  return thay;
}

function phanLoai(goi, src) {
  let n = goi;
  let p = n.parent;
  while (p && VO.has(p.kind)) { n = p; p = p.parent; }
  if (!p) return 'BO-QUA';
  if (p.kind === ts.SyntaxKind.VoidExpression) return 'BO-QUA';
  if (ts.isExpressionStatement(p)) return 'BO-QUA';
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    // dấu phẩy: chỉ vế CUỐI mang giá trị ra ngoài
    return p.right === n ? phanLoai(n, src) : 'BO-QUA';
  }
  if (ts.isVariableDeclaration(p) && p.initializer === n) {
    return ts.isIdentifier(p.name) && duocDoc(p.name.text, src, p.name) ? 'DUNG' : 'BO-QUA';
  }
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === n) {
    return ts.isIdentifier(p.left) && duocDoc(p.left.text, src, p.left) ? 'DUNG' : 'BO-QUA';
  }
  return 'DUNG';   // tham số · điều kiện · return · thân arrow · toán tử… đều có người nhận
}

export function soiChoGoi(ma, dsTen) {
  const src = docNguon(ma);
  const bo = new Set(dsTen);
  const dong = ma.split('\n');
  const ra = [];
  const di = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && bo.has(n.expression.text)) {
      const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
      ra.push({ ten: n.expression.text, dong: line + 1, cach: phanLoai(n, src), van: (dong[line] ?? '').trim().slice(0, 88) });
    }
    ts.forEachChild(n, di);
  };
  di(src);
  return ra.sort((a, b) => a.dong - b.dong);
}
