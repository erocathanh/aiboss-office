/**
 * 🧬 KÝ HIỆU HÌNH DẠNG của THÂN component — thứ `boc-mo-dun.mjs` KHÔNG với tới.
 *
 * 🎯 VÌ SAO TẦNG NÀY TỒN TẠI: thân `UngDung` chiếm 86% tệp và là phần sẽ bị chia ở M2-M5.
 *    Nó KHÔNG chạy được nếu không dựng DOM và giả lập mạng — mà giả lập sai chính là chỗ đẻ ra
 *    một bộ đo XANH GIẢ. Nên tôi KHÔNG giả lập. Tôi đóng băng thứ KHÁC: HÌNH DẠNG.
 *
 * 🔑 VÌ SAO HÌNH DẠNG LÀ ĐÚNG THỨ CẦN CHO MỘT LẦN CHIA:
 *    chia tệp là DỜI mã, KHÔNG đổi ý định. Nên kiểu hỏng của nó KHÔNG phải «logic sai» mà là:
 *      ① một thứ BỊ MẤT (một móc · một nhánh JSX · một hàm con)
 *      ② một thứ BỊ ĐỔI THỨ TỰ — React phụ thuộc THỨ TỰ móc, đổi là hỏng câm
 *      ③ một MẢNG PHỤ THUỘC đổi ⇒ đóng băng giá trị cũ, hoặc vòng lặp vô hạn
 *      ④ một thuộc tính / lớp CSS đổi ⇒ giao diện lệch mà `tsc` vẫn xanh
 *    Bốn kiểu đó đều ĐỌC ĐƯỢC từ cây cú pháp, KHÔNG cần chạy.
 *
 * ⚠️ NÓI CHO ĐÚNG SỨC: đây là ĐÓNG BĂNG HÌNH DẠNG, **KHÔNG PHẢI** đóng băng hành vi.
 *    Nó bắt được «có thứ bị mất / đổi chỗ / đổi phụ thuộc».
 *    Nó KHÔNG bắt được «cùng hình dạng nhưng chạy ra kết quả khác» — ví dụ ai đó đổi một dấu
 *    so sánh bên trong một hàm con. Muốn bắt cái đó thì phải CHẠY, và chạy thì phải giả lập.
 */
import ts from './nap-typescript.mjs';
import fs from 'node:fs';

export function kyHieuThan(duongDan, tenHam = 'UngDung') {
  const src = ts.createSourceFile(duongDan, fs.readFileSync(duongDan, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let than = null;
  src.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name && n.name.text === tenHam) than = n; });
  if (!than) throw new Error(`KHÔNG thấy hàm ${tenHam} trong ${duongDan} — bộ đo đang soi nhầm tệp`);

  /**
   * 🔴 BÍ DANH MÓC — biểu thức `use[A-Z]` KHÔNG đủ, và đối chứng âm bắt được điều này.
   * 🕳 `UngDung.tsx:2013` gọi `dungTruocKhiVe(…, [toanMan])` — đó LÀ một móc React, khai ở cấp
   *    mô-đun như `const dungTruocKhiVe = <bí danh của useLayoutEffect/useEffect>`.
   *    Tên nó KHÔNG bắt đầu bằng `use` ⇒ bộ bóc bản đầu KHÔNG thấy ⇒ **cả mảng phụ thuộc của nó
   *    nằm ngoài vùng đóng băng**, và tôi đã suýt khai «35 mảng phụ thuộc» như thể đó là TẤT CẢ.
   * ✅ Nay tự dò: khai báo cấp mô-đun nào trỏ vào một móc React thì tên nó cũng là tên móc.
   * 📌 Bài học: **một quy ước đặt tên KHÔNG phải một phép đo.** Dự án nào cũng có bí danh riêng,
   *    và bí danh là chỗ mọi bộ dò theo tên đều mù.
   */
  const MOC_REACT = /^(useState|useRef|useEffect|useLayoutEffect|useMemo|useCallback|useReducer|useContext)$/;
  const biDanh = new Set();
  src.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return;
    for (const d of n.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      if (MOC_REACT.test(d.initializer.getText(src).replace(/.*?([A-Za-z]+)$/, '$1'))
          || MOC_REACT.test(d.initializer.getText(src))
          || /\buse(Layout)?Effect\b/.test(d.initializer.getText(src))) biDanh.add(d.name.text);
    }
  });
  const laMoc = (t) => /^use[A-Z]/.test(t) || biDanh.has(t);

  // ① MÓC THEO THỨ TỰ — React phụ thuộc thứ tự, nên thứ tự LÀ một phần của hình dạng
  const moc = [];
  (function di(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && laMoc(n.expression.text)) {
      const cuoi = n.arguments[n.arguments.length - 1];
      const deps = cuoi && ts.isArrayLiteralExpression(cuoi)
        ? cuoi.elements.map((e) => e.getText(src)).sort() : null;
      moc.push({ loai: n.expression.text, phuThuoc: deps });
    }
    ts.forEachChild(n, di);
  })(than);

  // ② TRẠNG THÁI — tên + giá trị khởi tạo (đổi giá trị khởi tạo là đổi hành vi lần đầu vẽ)
  const trangThai = [];
  (function di(n) {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (!d.initializer || !ts.isCallExpression(d.initializer)) continue;
        const g = d.initializer.expression.getText(src);
        if (g !== 'useState' && g !== 'useRef') continue;
        const ten = ts.isArrayBindingPattern(d.name)
          ? d.name.elements.map((e) => e.getText(src)).join('/')
          : d.name.getText(src);
        const dau = d.initializer.arguments[0];
        trangThai.push({ ten, goi: g, khoiTao: dau ? dau.getText(src).replace(/\s+/g, ' ').slice(0, 60) : '(rỗng)' });
      }
    }
    ts.forEachChild(n, di);
  })(than);

  // ③ CÂY JSX — tên thẻ lồng nhau + tên thuộc tính đã sắp. Mất một nhánh là đổi ký hiệu.
  function cayJsx(n) {
    const ra = [];
    (function di(x) {
      if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x)) {
        const mo = ts.isJsxElement(x) ? x.openingElement : x;
        const the = mo.tagName.getText(src);
        /**
         * 🔴 GHI CẢ GIÁ TRỊ khi nó là CHUỖI THUẦN — đối chứng âm bắt được lỗ này.
         * 🕳 Bản đầu chỉ ghi TÊN thuộc tính ⇒ ký hiệu ra `div[className]`
         *    ⇒ đổi `className="khoi-fork"` thành `className=""` KHÔNG làm đổi ký hiệu.
         *    Tức lớp CSS — thứ quyết định Owner NHÌN THẤY gì — nằm ngoài vùng đóng băng.
         * ⚖️ Chỉ ghi giá trị khi nó là chuỗi TĨNH. Giá trị tính lúc chạy (`{...}`) thì ghi `{…}`,
         *    vì ghi nội dung biểu thức sẽ làm ký hiệu vỡ mỗi lần ai đó đổi tên một biến — giòn
         *    tới mức người ta sẽ tắt bộ đo đi.
         */
        const thuocTinh = mo.attributes.properties.map((p) => {
          if (!p.name) return '{…}';
          const t = p.name.getText(src);
          const v = p.initializer;
          if (v && ts.isStringLiteral(v)) return `${t}="${v.text}"`;
          return t;
        }).sort().join(',');
        /**
         * 🔴 Q2 — GHI CẢ PHẦN CHỮ. Reviewer dựng một phép phá đổi CHỮ HIỂN THỊ trong JSX và ký hiệu
         *    của tôi TRÙNG KHÍT ⇒ bộ đo XANH. Tức đổi một câu Owner ĐỌC mà thước im.
         * 📌 Mười phép phá của tôi chỉ phá đúng những trường bộ đo ĐÃ TUYÊN BỐ NHÌN.
         *    **Người viết thước tự dựng phép phá thì chỉ phá được chỗ mình đã nghĩ tới.**
         */
        /**
         * ⚠️ VÁ LẦN HAI — bản vá Q2 đầu tiên của tôi MỚI BẮT ĐƯỢC MỘT NỬA.
         * 🕳 Tôi chỉ lấy `JsxText` (chữ trần giữa hai thẻ). Nhưng phần lớn chữ trong tệp này nằm
         *    trong BIỂU THỨC: `{o.dangFork ? '…' : '🧬 Fork về ghế này'}`. Chạy đúng phép phá
         *    reviewer dựng ⇒ bộ đo VẪN XANH lần thứ hai.
         * 🔑 Tôi vá theo ĐÚNG CHỮ trong lời bác («ghi cả phần chữ») thay vì đi đo xem chữ THẬT SỰ
         *    nằm ở đâu trong cây. Sửa theo mô tả của lỗi, không theo hình dạng của vật.
         * ✅ Nay lấy CẢ chuỗi ký tự nằm trong biểu thức con — đó mới là chỗ Owner thật sự đọc.
         */
        const layChu = (c) => {
          if (ts.isJsxText(c)) return [c.getText(src).replace(/\s+/g, ' ').trim()];
          const ra = [];
          if (ts.isJsxExpression(c) && c.expression) {
            (function di(e) {
              if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ra.push(e.text.replace(/\s+/g, ' ').trim());
              ts.forEachChild(e, di);
            })(c.expression);
          }
          return ra;
        };
        const chu = ts.isJsxElement(x)
          ? x.children.flatMap(layChu).filter(Boolean).join('|')
          : '';
        ra.push(`${the}[${thuocTinh}]${chu ? '«' + chu + '»' : ''}`);
      }
      ts.forEachChild(x, di);
    })(n);
    return ra;
  }
  const jsx = cayJsx(than);

  // ④ HÀM CON + BỀ MẶT ĐÓNG GÓI — hàm con đọc những tên nào ở ngoài nó
  const hamCon = [];
  (function di(n) {
    if (ts.isVariableStatement(n)) {
      const d = n.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name) && d.initializer && ts.isCallExpression(d.initializer)
          && /useCallback|useMemo/.test(d.initializer.expression.getText(src))) {
        const chu = d.initializer.getText(src);
        hamCon.push({ ten: d.name.text, soDong: chu.split('\n').length });
      }
    }
    ts.forEachChild(n, di);
  })(than);

  return { moc, trangThai, jsx, hamCon };
}

/** Rút gọn thành vài con số để so nhanh và để in ra cho người đọc. */
export function tomTat(k) {
  const dem = {};
  for (const m of k.moc) dem[m.loai] = (dem[m.loai] || 0) + 1;
  return {
    soMoc: k.moc.length,
    theoLoai: dem,
    soMangPhuThuoc: k.moc.filter((m) => m.phuThuoc !== null).length,
    soPhanTuPhuThuoc: k.moc.reduce((a, m) => a + (m.phuThuoc ? m.phuThuoc.length : 0), 0),
    soTrangThai: k.trangThai.length,
    soNutJsx: k.jsx.length,
    soTheKhacNhau: new Set(k.jsx.map((x) => x.split('[')[0])).size,
    soHamCon: k.hamCon.length,
  };
}

/**
 * 🧮 KÝ HIỆU GỘP CHO NHIỀU TỆP — vá Q4.2 ở tầng THÂN, và đây là chỗ tôi đổi MÔ HÌNH chứ không
 *    chỉ đổi tham số.
 *
 * 🔑 Ý CHÍNH: **một lần CHIA giữ nguyên TẬP HỢP, chỉ đổi CÁCH CHIA TẬP HỢP ẤY RA CÁC TỆP.**
 *    Dời một móc sang tệp khác thì tổng số móc KHÔNG đổi. Làm rơi một móc thì tổng ĐỔI.
 *    ⇒ Đóng băng **tập hợp GỘP** thì nó SỐNG QUA một lần chia ĐÚNG, và ĐỎ khi có thứ rơi mất.
 * ⚖️ Đây là câu trả lời cho đúng lỗ reviewer chỉ: bản cũ buộc phải chụp lại sau khi chia, mà chụp
 *    lại là so mã đã chia với chính nó. Bản này **KHÔNG cần chụp lại** — nên cũng KHÔNG có chỗ
 *    cho cái đường vòng ấy.
 * ⚠️ Cái GIÁ phải khai: ký hiệu gộp KHÔNG canh THỨ TỰ móc GIỮA các tệp (thứ tự chỉ có nghĩa
 *    trong phạm vi MỘT component). Trong phạm vi mỗi component thì thứ tự vẫn được canh.
 */
export function kyHieuGop(dsDuongDan, tenHam) {
  const ds = Array.isArray(dsDuongDan) ? dsDuongDan : [dsDuongDan];
  if (ds.length === 0) throw new Error('kyHieuGop: danh sách RỖNG ⇒ CHƯA ĐO, không phải ĐẠT');
  const theoHam = {};
  for (const d of ds) {
    for (const ten of tenHam ? [tenHam] : timComponent(d)) {
      const k = kyHieuThan(d, ten);
      if (theoHam[ten]) throw new Error(`Hai tệp cùng khai component \`${ten}\` ⇒ LỖI THẬT, không bỏ qua`);
      theoHam[ten] = k;
    }
  }
  const tenHams = Object.keys(theoHam).sort();
  if (tenHams.length === 0) throw new Error(`KHÔNG thấy component nào trong ${ds.length} tệp ⇒ bộ đo đang soi NHẦM CHỖ`);
  const gop = (lay) => tenHams.flatMap((t) => lay(theoHam[t])).sort();
  return {
    soTep: ds.length,
    component: tenHams,
    // tập hợp GỘP — sống qua một lần chia đúng
    mocTheoLoai: gop((k) => k.moc.map((m) => m.loai)),
    phuThuoc: gop((k) => k.moc.filter((m) => m.phuThuoc).map((m) => m.phuThuoc.join('+'))),
    trangThai: gop((k) => k.trangThai.map((t) => `${t.goi} ${t.ten} = ${t.khoiTao}`)),
    jsx: gop((k) => k.jsx),
    hamCon: gop((k) => k.hamCon.map((h) => h.ten)),
    // thứ tự móc TRONG TỪNG component — vẫn canh, chỉ không canh giữa các component
    thuTuTrongTungHam: Object.fromEntries(tenHams.map((t) => [t, theoHam[t].moc.map((m) => m.loai)])),
  };
}

/** Tìm mọi hàm cấp mô-đun có TRẢ VỀ JSX ⇒ coi là component. Dùng khi chưa biết tên sau khi chia. */
export function timComponent(duongDan) {
  const src = ts.createSourceFile(duongDan, fs.readFileSync(duongDan, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ra = [];
  src.forEachChild((n) => {
    if (!ts.isFunctionDeclaration(n) || !n.name || !n.body) return;
    let coJsx = false;
    (function di(x) { if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) coJsx = true; ts.forEachChild(x, di); })(n.body);
    if (coJsx) ra.push(n.name.text);
  });
  return ra;
}
