/**
 * 🔬 THƯỚC BA TRẠNG THÁI — ĐẠT · KHÔNG ĐẠT · KHÔNG ĐO ĐƯỢC
 *
 * CLI ở cuối tệp là cổng ba trạng thái. `KHÔNG ĐO ĐƯỢC` trả mã 2 khi chưa có lỗi chắc chắn;
 * một lời gọi chắc chắn `BO-QUA` vẫn làm toàn nguồn `KHÔNG ĐẠT`, kể cả khi lời gọi khác chưa đo được.
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
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
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

function boVoTrong(n) {
  let ra = n;
  while (ra && VO.has(ra.kind)) ra = ra.expression;
  return ra;
}

export const TRANG_THAI = Object.freeze({
  DAT: 'ĐẠT',
  KHONG_DAT: 'KHÔNG ĐẠT',
  KHONG_DO_DUOC: 'KHÔNG ĐO ĐƯỢC',
});

export class LoiKhongDoDuoc extends Error {
  constructor(vi) {
    super(`${TRANG_THAI.KHONG_DO_DUOC} · ${vi}`);
    this.name = 'LoiKhongDoDuoc';
    this.code = 'KHONG_DO_DUOC';
  }
}

function docVanBan(ma, ten) {
  let vanBan;
  if (typeof ma === 'string') vanBan = ma;
  else if (ma instanceof Uint8Array) {
    try { vanBan = new TextDecoder('utf-8', { fatal: true }).decode(ma); }
    catch { throw new LoiKhongDoDuoc(`${ten}: dữ liệu không phải UTF-8 hợp lệ`); }
  } else throw new LoiKhongDoDuoc(`${ten}: đầu vào không phải chữ hoặc mảng byte`);

  if (vanBan.trim().length === 0) throw new LoiKhongDoDuoc(`${ten}: tệp RỖNG`);
  // UTF-8 hợp lệ có thể chứa ký tự điều khiển hợp lệ trong chú thích và literal.
  // Chỉ parser mới được quyết định văn bản có phải mã nguồn đo được hay KHÔNG.
  return vanBan;
}

export function docNguon(ma, ten = 'x.tsx') {
  const vanBan = docVanBan(ma, ten);
  const loaiTheoTen = ts.getScriptKindFromFileName(ten);
  const loai = loaiTheoTen === ts.ScriptKind.Unknown ? ts.ScriptKind.TSX : loaiTheoTen;
  const src = ts.createSourceFile(ten, vanBan, ts.ScriptTarget.Latest, true, loai);
  const loi = loiCuPhap(src);
  if (loi.length > 0) throw new LoiKhongDoDuoc(`không phân tích được ${ten}: ${loi.join(' · ')}`);
  return src;
}

/** Chuyển chẩn đoán cú pháp thành chữ; `docNguon` dùng kết quả này làm cổng cứng. */
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

/** Chuẩn hoá nơi lưu thành từng đoạn để nhận ra cả lần ghi đè một đối tượng cha. */
function khoaNoiLuu(n, src) {
  n = boVoTrong(n);
  if (!n) return null;
  if (ts.isIdentifier(n)) return [`id:${n.text}`];
  if (n.kind === ts.SyntaxKind.ThisKeyword) return ['this'];
  if (n.kind === ts.SyntaxKind.SuperKeyword) return ['super'];
  if (ts.isPropertyAccessExpression(n)) {
    const goc = khoaNoiLuu(n.expression, src);
    return goc ? [...goc, `prop:${n.name.text}`] : null;
  }
  if (ts.isElementAccessExpression(n)) {
    const goc = khoaNoiLuu(n.expression, src);
    const k = n.argumentExpression;
    if (!goc || !k) return null;
    if (ts.isStringLiteralLike(k) || ts.isNumericLiteral(k)) return [...goc, `prop:${k.text}`];
    return [...goc, `elem:${k.getText(src)}`];
  }
  return null;
}

const cungKhoa = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
const laKhoaCha = (cha, con) => !!cha && !!con && cha.length <= con.length
  && cha.every((x, i) => x === con[i]);

function laNhanChu(n) {
  if (!ts.isIdentifier(n) || !n.parent) return false;
  const p = n.parent;
  return (ts.isPropertyAccessExpression(p) && p.name === n)
    || (ts.isPropertyAssignment(p) && p.name === n)
    || (ts.isBindingElement(p) && p.propertyName === n)
    || ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p)
      || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isInterfaceDeclaration(p)
      || ts.isTypeAliasDeclaration(p)) && p.name === n);
}

function boVoNgoai(n) {
  let ra = n;
  while (ra.parent && VO.has(ra.parent.kind)) ra = ra.parent;
  return ra;
}

/** Một lần truy cập là ĐỌC, GHI ĐÈ, hoặc chỉ là NHÃN cú pháp. */
function loaiTruyCap(n) {
  if (laNhanChu(n)) return 'NHAN';
  const ngoai = boVoNgoai(n);
  const p = ngoai.parent;
  if (!p) return 'DOC';
  if (ts.isBinaryExpression(p) && p.left === ngoai) {
    return p.operatorToken.kind === ts.SyntaxKind.EqualsToken ? 'GHI' : 'DOC';
  }
  if ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === ngoai) return 'GHI';
  if (ts.isDeleteExpression(p) && p.expression === ngoai) return 'GHI';
  return 'DOC';
}

const CACH = Object.freeze({
  DUNG: 'DUNG',
  BO_QUA: 'BO-QUA',
  KHONG_DO_DUOC: 'KHONG-DO-DUOC',
});

const ketQua = (cach, loi = []) => ({ cach, loi });

/** Một giá trị có nhiều đường đi: chỉ cần một đường đọc là DÙNG; chưa rõ thắng bỏ qua. */
function gopKetQua(...ds) {
  if (ds.some((x) => x.cach === CACH.DUNG)) return ketQua(CACH.DUNG);
  const chuaDo = ds.filter((x) => x.cach === CACH.KHONG_DO_DUOC);
  if (chuaDo.length > 0) return ketQua(CACH.KHONG_DO_DUOC, chuaDo.flatMap((x) => x.loi));
  return ketQua(CACH.BO_QUA);
}

/** Từ lúc nhận kết quả: lần truy cập đầu theo thứ tự thực thi là đọc hay bị ghi đè. */
function duocDocTruocKhiGhiDe(noiLuu, src, sauViTri) {
  const khoa = khoaNoiLuu(noiLuu, src);
  if (!khoa) {
    const dich = boVoTrong(noiLuu);
    // Binding pattern (`{ x }`, `[x]`) đọc giá trị ngay trong chính phép tách.
    if (dich && (ts.isObjectBindingPattern(dich) || ts.isArrayBindingPattern(dich)
      || ts.isObjectLiteralExpression(dich) || ts.isArrayLiteralExpression(dich))) return ketQua(CACH.DUNG);
    return ketQua(CACH.KHONG_DO_DUOC,
      [new LoiKhongDoDuoc(`không theo dõi được đích lưu «${noiLuu.getText(src)}»`).message]);
  }
  const suKien = [];
  const di = (n) => {
    if (n.end <= sauViTri) return;
    const khoaNay = khoaNoiLuu(n, src);
    if (khoaNay) {
      const loai = loaiTruyCap(n);
      const ngoai = boVoNgoai(n);
      const p = ngoai.parent;
      if (loai === 'DOC' && cungKhoa(khoaNay, khoa) && ngoai.getStart(src) >= sauViTri) {
        suKien.push({ viTri: ngoai.getStart(src), cach: CACH.DUNG });
        return; // đừng đếm lại các mảnh con của cùng một biểu thức truy cập
      }
      if (loai === 'GHI' && laKhoaCha(khoaNay, khoa)) {
        const nutGhi = p && ((ts.isBinaryExpression(p) && p.left === ngoai)
          || ((ts.isForInStatement(p) || ts.isForOfStatement(p)) && p.initializer === ngoai)
          || (ts.isDeleteExpression(p) && p.expression === ngoai)) ? p : ngoai;
        // Không tính chính phép gán vừa cất kết quả. Ghi xảy ra sau khi vế phải đã được đọc.
        if (nutGhi.getStart(src) >= sauViTri)
          suKien.push({ viTri: nutGhi.end, cach: CACH.BO_QUA });
        return;
      }
    }
    ts.forEachChild(n, di);
  };
  di(src);
  suKien.sort((a, b) => a.viTri - b.viTri || (a.cach === CACH.DUNG ? -1 : 1));
  return ketQua(suKien[0]?.cach ?? CACH.BO_QUA);
}

function phanLoai(goi, src) {
  let n = goi;
  let p = n.parent;
  while (p && VO.has(p.kind)) { n = p; p = p.parent; }
  if (!p) return ketQua(CACH.BO_QUA);
  if (p.kind === ts.SyntaxKind.VoidExpression) return ketQua(CACH.BO_QUA);
  if (ts.isExpressionStatement(p)) return ketQua(CACH.BO_QUA);
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    // dấu phẩy: chỉ vế CUỐI mang giá trị ra ngoài
    return p.right === n ? phanLoai(p, src) : ketQua(CACH.BO_QUA);
  }
  if (ts.isVariableDeclaration(p) && p.initializer === n) {
    return duocDocTruocKhiGhiDe(p.name, src, goi.getEnd());
  }
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === n) {
    // Phép gán vừa cất vào đích, vừa mang chính giá trị đó ra ngoài (`consume(x = f())`).
    return gopKetQua(duocDocTruocKhiGhiDe(p.left, src, goi.getEnd()), phanLoai(p, src));
  }
  return ketQua(CACH.DUNG); // tham số · điều kiện · return · thân arrow · toán tử… đều có người nhận
}

export function soiChoGoi(ma, dsTen, ten = 'x.tsx') {
  const src = docNguon(ma, ten);
  const bo = new Set(dsTen);
  const dong = src.text.split('\n');
  const ra = [];
  const di = (n) => {
    const callee = ts.isCallExpression(n) ? boVoTrong(n.expression) : null;
    if (callee && ts.isIdentifier(callee) && bo.has(callee.text)) {
      const { line } = src.getLineAndCharacterOfPosition(n.getStart(src));
      const kq = phanLoai(n, src);
      ra.push({ ten: callee.text, dong: line + 1, cach: kq.cach,
        van: (dong[line] ?? '').trim().slice(0, 88), ...(kq.loi.length > 0 ? { loi: kq.loi } : {}) });
    }
    ts.forEachChild(n, di);
  };
  di(src);
  return ra.sort((a, b) => a.dong - b.dong);
}

/** API ba trạng thái. Không tìm thấy lời gọi cũng là KHÔNG ĐO ĐƯỢC, không phải bảng sạch. */
export function chamNguon(ma, dsTen, ten = 'x.tsx') {
  try {
    if (!Array.isArray(dsTen) || dsTen.length === 0)
      throw new LoiKhongDoDuoc('danh sách tên hàm RỖNG');
    const cho = soiChoGoi(ma, dsTen, ten);
    if (cho.length === 0) throw new LoiKhongDoDuoc(`không thấy lời gọi nào của: ${dsTen.join(', ')}`);
    const loi = cho.flatMap((x) => x.loi ?? []);
    const coBoQua = cho.some((x) => x.cach === CACH.BO_QUA);
    const coChuaDo = cho.some((x) => x.cach === CACH.KHONG_DO_DUOC);
    return {
      // Lỗi đã biết phải thắng phần chưa đo; phần chưa đo chỉ thắng khi chưa có lỗi chắc chắn.
      trangThai: coBoQua ? TRANG_THAI.KHONG_DAT
        : coChuaDo ? TRANG_THAI.KHONG_DO_DUOC : TRANG_THAI.DAT,
      cho,
      loi,
    };
  } catch (e) {
    const loi = e instanceof Error ? e.message : String(e);
    return { trangThai: TRANG_THAI.KHONG_DO_DUOC, cho: [], loi: [loi] };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tep, chuoiTen] = process.argv.slice(2);
  let kq;
  if (!tep || !chuoiTen) {
    kq = { trangThai: TRANG_THAI.KHONG_DO_DUOC, cho: [],
      loi: ['cách dùng: node bai-thu/soi-ket-qua.mjs <tệp.tsx> <tên-hàm[,tên-hàm]>'] };
  } else {
    try {
      kq = chamNguon(fs.readFileSync(tep), chuoiTen.split(',').filter(Boolean), tep);
    } catch (e) {
      kq = { trangThai: TRANG_THAI.KHONG_DO_DUOC, cho: [],
        loi: [e instanceof Error ? e.message : String(e)] };
    }
  }
  console.log(`${kq.trangThai} · ${kq.cho.length} lời gọi`);
  for (const x of kq.cho) console.log(`  dòng ${x.dong} [${x.ten}] ${x.cach} · ${x.van}`);
  for (const l of kq.loi) console.error(`  ${l}`);
  process.exitCode = kq.trangThai === TRANG_THAI.DAT ? 0
    : kq.trangThai === TRANG_THAI.KHONG_DAT ? 1 : 2;
}
