/**
 * 🪝 THƯỚC THỨ TỰ MÓC — LÀN B.
 *
 * 🎯 CÂU NÓ TRẢ LỜI, viết hẹp lại cho quyết-định-được:
 *      «trong TỪNG component, DÃY lời gọi móc có còn NGUYÊN THỨ TỰ và NGUYÊN DANH TÍNH không»
 *    Dời một component sang tệp khác ⇒ dãy GIỮ NGUYÊN. Đổi chỗ hai móc ⇒ dãy ĐỔI.
 *
 * 🕳 VÌ SAO PHẢI CÓ NÓ — số đo, không phải lo xa (03/09 00:5x):
 *    Bản gộp-phẳng v2 đứng trước một phép ĐỔI CHỖ THẬT (hoán vị hai dòng `useState` liền nhau,
 *    tập hợp dòng y hệt, chỉ khác thứ tự) và trả về **15/15 XANH**.
 *    Phép phá ② của tôi mang tên «ĐỔI THỨ TỰ móc» nhưng lệnh sed của nó là XOÁ một dòng.
 *    ⇒ Suốt hai đêm, chỗ này CHƯA BAO GIỜ bị thử. Một phép phá đặt tên theo thứ mình MUỐN đo
 *      mà làm thứ khác thì nó vẫn xanh-đỏ đều đặn, và nó dạy ta tin nhầm.
 *    📌 Cái tên của phép phá KHÔNG phải bằng chứng phép phá đo cái đó. Phải đọc lệnh.
 *
 * 🔑 SPLIT-INVARIANT BẰNG KHOÁ, KHÔNG BẰNG SẮP XẾP — đây là chỗ khác v2:
 *    v2 mua tính «sống qua một lần chia» bằng cách SẮP mọi thứ vào một rổ phẳng, và trả giá bằng
 *    toàn bộ QUAN HỆ (ai sở hữu cái gì · móc nào đi với mảng phụ thuộc nào · thứ tự).
 *    Bản này khoá theo TÊN COMPONENT. Dời component sang tệp khác thì tên nó không đổi,
 *    nên dãy bên trong nó cũng không đổi — mà KHÔNG cần sắp xếp gì cả.
 *
 * ⚠️ KHAI ĐỦ SỨC — thước này KHÔNG nói được gì về:
 *    ① nội dung chạy ra sao (nó đọc cây cú pháp, KHÔNG chạy)
 *    ② mã cấp mô-đun ngoài component (đó là việc `boc-mo-dun.mjs`)
 *    ③ «dời-thuần từng dòng» (đó là LÀN A — thước khác, người khác)
 *    ④ móc gọi có ĐIỀU KIỆN (`if (x) useEffect(...)`) — nó ghi theo thứ tự VĂN BẢN,
 *       trong khi React chạy theo thứ tự THẬT lúc render. Mã đúng luật React thì hai cái trùng;
 *       mã sai luật thì thước này KHÔNG bắt được, `eslint-plugin-react-hooks` mới bắt.
 */
import ts from './nap-typescript.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';

export const TEN_MOC_REACT = new Set([
  'useState', 'useRef', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback',
  'useReducer', 'useContext', 'useImperativeHandle', 'useDebugValue', 'useId',
  'useDeferredValue', 'useTransition', 'useSyncExternalStore', 'useInsertionEffect',
  'useActionState', 'useOptimistic', 'useFormStatus',
]);

const bam = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
const gon = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * 🔴 BẢNG BÍ DANH — bản cũ dò bằng `^use[A-Z]` nên hụt 67 so với 70.
 *    Nhưng vá đúng MỘT ca đã cắn thì lần sau cắn ca kế bên. Nên đây dò theo NĂM LỐI, và mỗi lối
 *    ghi lại VÌ SAO nó được coi là móc — để người đọc phân biệt chỗ ta CHỨNG MINH được
 *    với chỗ ta chỉ TIN VÀO QUY ƯỚC ĐẶT TÊN.
 */
export function bangBiDanh(src) {
  const ban = new Map();   // tên trong tệp  →  { ve: Set<tên móc React>, vi: cách biết }
  const khongGian = new Set(); // tên trỏ vào cả gói react (React.useState)

  const themTho = (ten, ve, vi) => {
    const cu = ban.get(ten) ?? { ve: new Set(), vi };
    for (const v of ve) cu.ve.add(v);
    ban.set(ten, cu);
  };

  // ① NHẬP TỪ 'react' — kể cả nhập ĐỔI TÊN, thứ bản cũ mù hoàn toàn
  src.forEachChild((n) => {
    if (!ts.isImportDeclaration(n)) return;
    if (!ts.isStringLiteral(n.moduleSpecifier) || n.moduleSpecifier.text !== 'react') return;
    const c = n.importClause;
    if (!c) return;
    if (c.name) khongGian.add(c.name.text);                       // import React from 'react'
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) // import * as React
      khongGian.add(c.namedBindings.name.text);
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) {
      for (const e of c.namedBindings.elements) {
        const goc = (e.propertyName ?? e.name).text;              // { useEffect as X }
        if (TEN_MOC_REACT.has(goc)) themTho(e.name.text, [goc], 'nhap');
      }
    }
  });

  // ② KHAI BÁO CẤP MÔ-ĐUN trỏ vào móc — gồm cả biểu thức điều kiện nhiều nhánh.
  //    `const dungTruocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;`
  //    ⇒ ve = {useLayoutEffect, useEffect}. Ghi CẢ HAI, vì cả hai đều là sự thật.
  // ③ BÍ DANH BẮC CẦU — `const a = useEffect; const b = a;` ⇒ lặp tới khi bảng thôi lớn.
  let doi = true, vong = 0;
  while (doi) {
    doi = false;
    if (++vong > 20) throw new Error('bảng bí danh KHÔNG hội tụ sau 20 vòng ⇒ có vòng lặp trong khai báo');
    src.forEachChild((n) => {
      if (!ts.isVariableStatement(n)) return;
      for (const d of n.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const ve = new Set();
        (function di(e) {
          if (ts.isIdentifier(e)) {
            if (TEN_MOC_REACT.has(e.text)) ve.add(e.text);
            else if (ban.has(e.text)) for (const v of ban.get(e.text).ve) ve.add(v);
          }
          if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)
              && khongGian.has(e.expression.text) && TEN_MOC_REACT.has(e.name.text)) ve.add(e.name.text);
          ts.forEachChild(e, di);
        })(d.initializer);
        // 🔴 CHỈ nhận khi initializer KHÔNG phải một lời GỌI móc. `const [a] = useState(0)` là
        //    DÙNG móc, KHÔNG phải ĐẶT BÍ DANH cho móc. Lẫn hai cái này là đẻ ra móc ma.
        if (ve.size === 0 || ts.isCallExpression(d.initializer)) continue;
        const truoc = ban.get(d.name.text)?.ve.size ?? 0;
        themTho(d.name.text, ve, 'bi-danh');
        if ((ban.get(d.name.text).ve.size) !== truoc) doi = true;
      }
    });
  }
  return { ban, khongGian };
}

/** Khối hàm cấp mô-đun: component (có JSX) hoặc móc tự viết (tên `useXxx`). */
function khoiCapModun(src) {
  const ra = [];
  const themNeuHam = (ten, node, than) => {
    if (!than) return;
    let coJsx = false;
    (function di(x) {
      if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) coJsx = true;
      ts.forEachChild(x, di);
    })(than);
    ra.push({ ten, node, than, laComponent: coJsx, laMocTuViet: /^use[A-Z]/.test(ten) });
  };
  const boVo = (e) => {                       // memo(...) · forwardRef(...) · memo(forwardRef(...))
    while (e && ts.isCallExpression(e) && e.arguments.length >= 1
           && /^(memo|forwardRef|React\.memo|React\.forwardRef)$/.test(e.expression.getText(src))) e = e.arguments[0];
    return e;
  };
  src.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) return themNeuHam(n.name.text, n, n.body);
    if (!ts.isVariableStatement(n)) return;
    for (const d of n.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const e = boVo(d.initializer);
      if (e && (ts.isArrowFunction(e) || ts.isFunctionExpression(e))) themNeuHam(d.name.text, d, e.body);
    }
  });
  return ra;
}

/** Một lời gọi móc, rút thành thứ SO SÁNH ĐƯỢC mà KHÔNG dính đường dẫn tệp hay số dòng. */
function docMotLoiGoi(n, src, ban, khongGian, thanGoc) {
  let goi = null, vi = null;
  if (ts.isIdentifier(n.expression)) {
    const t = n.expression.text;
    if (ban.has(t)) { goi = t; vi = ban.get(t).vi; }
    else if (TEN_MOC_REACT.has(t)) { goi = t; vi = 'thang'; }
    else if (/^use[A-Z]/.test(t)) { goi = t; vi = 'quy-uoc'; }
  } else if (ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
             && khongGian.has(n.expression.expression.text)
             && (TEN_MOC_REACT.has(n.expression.name.text) || /^use[A-Z]/.test(n.expression.name.text))) {
    goi = `${n.expression.expression.text}.${n.expression.name.text}`; vi = 'thuoc-tinh';
  }
  if (!goi) return null;

  const giai = (ban.get(goi) ? [...ban.get(goi).ve].sort()
             : TEN_MOC_REACT.has(goi) ? [goi]
             : ts.isPropertyAccessExpression(n.expression) && TEN_MOC_REACT.has(n.expression.name.text) ? [n.expression.name.text]
             : []).join('|');

  // mảng phụ thuộc: GIỮ NGUYÊN THỨ TỰ. v2 sắp nó lại — mà một lần dời-thuần KHÔNG BAO GIỜ
  // đảo thứ tự phụ thuộc, nên sắp lại chỉ mất sức bắt lỗi chứ không mua được gì.
  const cuoi = n.arguments[n.arguments.length - 1];
  const coMangPT = cuoi && ts.isArrayLiteralExpression(cuoi) && n.arguments.length >= 2;
  const pt = coMangPT ? cuoi.elements.map((e) => gon(e.getText(src))) : null;

  // vân tay: các đối số KHÔNG-phải-mảng-phụ-thuộc. Tách riêng khỏi `pt` để khi ĐỎ thì biết
  // ĐỎ Ở TRỤC NÀO — thân đổi, hay phụ thuộc đổi.
  const kieu = n.typeArguments ? '<' + n.typeArguments.map((t) => gon(t.getText(src))).join(',') + '>' : '';
  const doiSo = kieu + n.arguments.slice(0, coMangPT ? -1 : undefined).map((a) => gon(a.getText(src))).join(' ;; ');

  // tên được gán ra — thứ phân biệt hai `useState` liền nhau mà không cần đọc thân
  let ket = '';
  const cha = n.parent;
  if (cha && ts.isVariableDeclaration(cha)) ket = gon(cha.name.getText(src));

  // chuỗi hàm bao BÊN TRONG component — rỗng = gọi ở cấp cao nhất (chỗ React chấp nhận)
  const trong = [];
  for (let p = n.parent; p; p = p.parent) {
    if (p === thanGoc) break;                     // chạm thân component ⇒ dừng
    if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p) || ts.isMethodDeclaration(p)) {
      if (p.body === thanGoc) break;              // chính hàm component ⇒ KHÔNG tính vào chuỗi bao
      const v = p.parent && ts.isVariableDeclaration(p.parent) ? p.parent.name.getText(src)
              : p.name ? p.name.getText(src) : '@';
      trong.unshift(v);
    }
  }
  return { goi, giai, vi, ket, pt, vanTay: bam(doiSo), trong };
}

/**
 * 🔑 GỠ MÓC TỰ VIẾT RA CHO PHẲNG — vì React cũng làm đúng thế.
 *    Tách năm móc vào một `useAbc()` rồi gọi `useAbc()` là refactor GIỮ NGUYÊN thứ tự móc thật.
 *    Nếu thước coi đó là «đổi» thì nó sẽ kêu oan đúng vào lần chia mà ta định làm ⇒ người ta tắt nó.
 * ⚠️ Chỉ gỡ móc tự viết ĐỊNH NGHĨA TRONG BỘ TỆP ĐANG SOI. Móc nhập từ gói ngoài thì để nguyên
 *    (ta KHÔNG đọc được thân nó ⇒ nói là đã gỡ thì là nói dối).
 */
function trai(than, src, ban, khongGian, mocTuViet, dangMo, sau) {
  const ra = [];
  (function di(n) {
    if (ts.isCallExpression(n)) {
      const m = docMotLoiGoi(n, src, ban, khongGian, than);
      if (m) {
        const con = mocTuViet.get(m.goi);
        if (con) {
          if (dangMo.has(m.goi)) throw new Error(`móc tự viết \`${m.goi}\` gọi vòng lại chính nó ⇒ KHÔNG gỡ phẳng được`);
          dangMo.add(m.goi);
          for (const x of trai(con.than, con.src, con.ban, con.khongGian, mocTuViet, dangMo, [...sau, m.goi]))
            ra.push(x);
          dangMo.delete(m.goi);
        } else {
          ra.push({ ...m, qua: sau.join('>') });
        }
      }
    }
    ts.forEachChild(n, di);
  })(than);
  return ra;
}

/**
 * DÃY MÓC THEO TỪNG COMPONENT, gộp cho CẢ BỘ TỆP.
 * @returns { day: {ten -> [phần tử]}, qua: {ten -> [chuỗi truy vết]}, mocTuViet: [tên] }
 */
export function dayMocTheoComponent(dsDuongDan) {
  const ds = Array.isArray(dsDuongDan) ? dsDuongDan : [dsDuongDan];
  if (ds.length === 0) throw new Error('dayMocTheoComponent: danh sách RỖNG ⇒ CHƯA ĐO, không phải ĐẠT');

  const tep = ds.map((d) => {
    const src = ts.createSourceFile(d, fs.readFileSync(d, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const { ban, khongGian } = bangBiDanh(src);
    return { d, src, ban, khongGian, khoi: khoiCapModun(src) };
  });

  // móc tự viết gom TOÀN BỘ bộ tệp — vì sau khi chia, móc có thể nằm ở tệp khác component
  const mocTuViet = new Map();
  for (const t of tep) for (const k of t.khoi) {
    if (!k.laMocTuViet) continue;
    if (mocTuViet.has(k.ten)) throw new Error(`hai tệp cùng khai móc \`${k.ten}\` ⇒ LỖI THẬT, không bỏ qua`);
    mocTuViet.set(k.ten, { than: k.than, src: t.src, ban: t.ban, khongGian: t.khongGian });
  }

  const day = {}, qua = {};
  for (const t of tep) for (const k of t.khoi) {
    if (!k.laComponent) continue;
    if (day[k.ten]) throw new Error(`hai tệp cùng khai component \`${k.ten}\` ⇒ LỖI THẬT, không bỏ qua`);
    const ds2 = trai(k.than, t.src, t.ban, t.khongGian, mocTuViet, new Set(), []);
    day[k.ten] = ds2.map(({ qua: _q, ...r }) => r);
    qua[k.ten] = ds2.map((x) => x.qua);
  }
  if (Object.keys(day).length === 0)
    throw new Error(`KHÔNG thấy component nào trong ${ds.length} tệp ⇒ thước đang soi NHẦM CHỖ`);
  return { day, qua, mocTuViet: [...mocTuViet.keys()].sort() };
}

/**
 * Danh tính một phần tử — thứ dùng để nhận ra «vẫn là móc ấy» sau khi dời.
 *
 * 🔑 NEO VÀO MÓC ĐÃ GIẢI (`giai`), KHÔNG neo vào tên gọi tại chỗ (`goi`). Vì sao:
 *    · đổi tên một bí danh (`truocKhiVe` → `dungTruocKhiVe`) KHÔNG đổi móc React nào được gọi
 *      ⇒ thước này PHẢI im, và LÀN A mới là chỗ kêu «có dòng bị sửa». Hai thước, hai câu hỏi.
 *    · đổi THẬT (`dungTruocKhiVe` → `useEffect` trơn) thì `giai` từ `useEffect|useLayoutEffect`
 *      thành `useEffect` ⇒ VẪN ĐỎ. Nới đúng chỗ nên nới, KHÔNG nới chỗ khác.
 * ⚠️ Móc tự viết từ gói NGOÀI thì `giai` rỗng ⇒ lùi về `goi`, vì lúc ấy tên GỌI là thứ duy nhất
 *    ta biết. Khai ra để người đọc biết chỗ nào ta chứng minh, chỗ nào ta chỉ có cái tên.
 */
export const danhTinh = (m) => `${m.giai || m.goi}#${m.ket}#${m.pt ? m.pt.join(',') : '∅'}#${m.vanTay}#${m.trong.join('>')}`;

/**
 * 🧾 PHÁN QUYẾT QUYẾT-ĐỊNH-ĐƯỢC giữa hai bản. KHÔNG trả «giống/khác» trơn — trả VÌ SAO khác,
 *    vì «khác» mà không chỉ được chỗ thì người ta sẽ chụp lại bản đóng băng cho nó im.
 */
export function soSanhDay(truoc, sau) {
  const tenCu = Object.keys(truoc).sort(), tenMoi = Object.keys(sau).sort();
  const kq = { ket: 'DOI-TEP-THUAN', doiThuTu: [], mat: [], them: [], chuyenChu: [], componentMoi: [], componentMat: [] };

  for (const t of tenCu) if (!(t in sau)) kq.componentMat.push(t);
  for (const t of tenMoi) if (!(t in truoc)) kq.componentMoi.push(t);

  const dem = (ds) => { const m = new Map(); for (const x of ds) m.set(danhTinh(x), (m.get(danhTinh(x)) || 0) + 1); return m; };
  const goCu = new Map(), goMoi = new Map();
  for (const t of tenCu) for (const x of truoc[t]) goCu.set(danhTinh(x), [...(goCu.get(danhTinh(x)) ?? []), t]);
  for (const t of tenMoi) for (const x of sau[t]) goMoi.set(danhTinh(x), [...(goMoi.get(danhTinh(x)) ?? []), t]);

  for (const t of tenCu) {
    if (!(t in sau)) continue;
    const a = truoc[t].map(danhTinh), b = sau[t].map(danhTinh);
    if (a.join('\n') === b.join('\n')) continue;
    const ma = dem(truoc[t]), mb = dem(sau[t]);
    let cungTapHop = ma.size === mb.size;
    if (cungTapHop) for (const [k, v] of ma) if (mb.get(k) !== v) { cungTapHop = false; break; }
    if (cungTapHop) kq.doiThuTu.push({ component: t, cu: a, moi: b });
    else {
      for (const [k, v] of ma) { const d = v - (mb.get(k) || 0); for (let i = 0; i < d; i++) kq.mat.push({ component: t, ai: k }); }
      for (const [k, v] of mb) { const d = v - (ma.get(k) || 0); for (let i = 0; i < d; i++) kq.them.push({ component: t, ai: k }); }
    }
  }
  // móc rời khỏi component này mà xuất hiện nguyên vẹn ở component khác ⇒ CHUYỂN CHỦ, khác hẳn MẤT
  kq.mat = kq.mat.filter((x) => {
    const o = (goMoi.get(x.ai) ?? []).filter((t) => t !== x.component);
    if (o.length === 0) return true;
    kq.chuyenChu.push({ ai: x.ai, tu: x.component, den: o[0] });
    return false;
  });
  kq.them = kq.them.filter((x) => !kq.chuyenChu.some((c) => c.ai === x.ai && c.den === x.component));

  if (kq.mat.length || kq.them.length || kq.componentMat.length) kq.ket = 'MAT-HOAC-THEM';
  else if (kq.doiThuTu.length) kq.ket = 'DOI-THU-TU';
  else if (kq.chuyenChu.length || kq.componentMoi.length) kq.ket = 'CHUYEN-CHU';
  return kq;
}
