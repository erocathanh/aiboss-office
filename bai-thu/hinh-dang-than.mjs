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
import { bangBiDanh, TEN_MOC_REACT } from './thu-tu-moc.mjs';
import fs from 'node:fs';

export function kyHieuThan(duongDan, tenHam = 'UngDung') {
  const src = ts.createSourceFile(duongDan, fs.readFileSync(duongDan, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let than = null;
  src.forEachChild((n) => { if (ts.isFunctionDeclaration(n) && n.name && n.name.text === tenHam) than = n; });
  if (!than) throw new Error(`KHÔNG thấy hàm ${tenHam} trong ${duongDan} — bộ đo đang soi nhầm tệp`);

  /**
   * 🔴 BÍ DANH MÓC — DÙNG CHUNG bảng của `thu-tu-moc.mjs`, KHÔNG tự chế bộ dò thứ hai.
   *
   * 🕳 CA CẮN 03/09, do chính vật thử mới bắt được: bộ dò tự chế ở đây nhận ra
   *    `const truocKhiVe = ... ? useLayoutEffect : useEffect`, nhưng MÙ HOÀN TOÀN trước
   *    `import { useEffect as chayXong } from 'react'` ⇒ component `Duoi` khai 1 móc thay vì 2.
   *    Tức là **cùng một lỗ, dạng khác** — và bản vá đêm qua chỉ bịt đúng dạng đã cắn.
   * 📌 Hai bộ dò cho cùng một khái niệm thì chúng sẽ trôi mỗi cái một kiểu, và cái ÍT được thử
   *    hơn sẽ là cái sai — mà không ai biết, vì cái kia vẫn xanh.
   * ⇒ MỘT bảng, dùng chung. Vá một chỗ thì cả hai thước cùng sáng mắt.
   */
  const { ban, khongGian } = bangBiDanh(src);
  const laMoc = (t) => ban.has(t) || TEN_MOC_REACT.has(t) || /^use[A-Z]/.test(t);
  /** Tên móc React THẬT đứng sau một lời gọi — dùng để nhận ra useState/useRef qua bí danh. */
  const giaiMoc = (t) => (ban.has(t) ? [...ban.get(t).ve] : TEN_MOC_REACT.has(t) ? [t] : []);

  // ① MÓC THEO THỨ TỰ — React phụ thuộc thứ tự, nên thứ tự LÀ một phần của hình dạng
  const moc = [];
  (function di(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && laMoc(n.expression.text)) {
      /**
       * 🔴 HAI CHỖ SỬA, mỗi chỗ một lỗi ĐO ĐƯỢC của bản cũ (03/09):
       * ① đòi `arguments.length >= 2`. Bản cũ nhận MỌI mảng ở vị trí cuối ⇒ `useRef([])` bị
       *    đếm thành «có mảng phụ thuộc». `useRef` LÀM GÌ CÓ mảng phụ thuộc.
       *    ⇒ con số «38 mảng phụ thuộc» tôi từng khai là SAI; thật ra 35. Ba cái kia là
       *      GIÁ TRỊ KHỞI TẠO bị đọc nhầm thành phụ thuộc.
       * ② BỎ `.sort()`. Một lần dời-thuần KHÔNG BAO GIỜ đảo thứ tự phần tử phụ thuộc,
       *    nên sắp lại KHÔNG mua được tính bất biến nào — chỉ mất sức bắt lỗi.
       * 📌 Chuẩn hoá là để nuốt cái KHÁC BIỆT VÔ HẠI. Chuẩn hoá thứ vốn đã ổn định thì
       *    nó chỉ còn tác dụng làm mù.
       */
      const cuoi = n.arguments[n.arguments.length - 1];
      const deps = cuoi && ts.isArrayLiteralExpression(cuoi) && n.arguments.length >= 2
        ? cuoi.elements.map((e) => e.getText(src).replace(/\s+/g, ' ').trim()) : null;
      /**
       * 🔴 GHI MÓC ĐÃ GIẢI, đừng ghi tên GỌI TẠI CHỖ. Vật thử «dời tệp» bắt được chỗ này:
       *    cùng một `useEffect`, ở tệp cũ gọi thẳng, ở tệp mới nhập đổi tên thành `chayXong`
       *    ⇒ ghi tên gọi thì ký hiệu LỆCH, và bộ đo kêu oan đúng lần dời tệp nó sinh ra để canh.
       * ⚠️ Đổi tên bí danh là việc của thước DỜI-THUẦN (LÀN A). Thước này chỉ được kêu khi
       *    MÓC REACT THẬT đổi. Hai thước, hai câu hỏi — đừng để cái này trả lời hộ cái kia.
       */
      const giai = giaiMoc(n.expression.text).sort().join('|') || n.expression.text;
      moc.push({ loai: giai, phuThuoc: deps });
    }
    ts.forEachChild(n, di);
  })(than);

  // ② TRẠNG THÁI — tên + giá trị khởi tạo (đổi giá trị khởi tạo là đổi hành vi lần đầu vẽ)
  const trangThai = [];
  (function di(n) {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (!d.initializer || !ts.isCallExpression(d.initializer)) continue;
        const goiLa = d.initializer.expression.getText(src);
        // qua bí danh cũng phải nhận ra — `import { useRef as giu }` vẫn là useRef
        const g = giaiMoc(goiLa).find((x) => x === 'useState' || x === 'useRef');
        if (!g) continue;
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
        }).join(',');   // 🔴 GIỮ THỨ TỰ NGUỒN, không sắp. Với `{...props}` thì thứ tự thuộc tính
                        //    QUYẾT ĐỊNH cái nào thắng ⇒ sắp lại là chuẩn hoá mất một sự thật.
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
        /**
         * ⚠️ VÁ LẦN BA (03/09) — hai bản vá trước ĐỀU vá đúng chiều nhưng NỚI QUÁ TAY.
         * 🕳 Bản vá lần hai chui vào MỌI biểu thức con và nhặt MỌI chuỗi. Trong đó có JSX LỒNG
         *    (`{cond && <div className="khoi-fork">…</div>}`) ⇒ nó nhặt luôn **TÊN LỚP CSS**
         *    của nút con và ghi vào trục «chữ hiển thị».
         *    Đo được: đổi `className="khoi-fork"` thành `""` làm trục CHỮ của nút cha ĐỔI THEO
         *    ⇒ hai lớp «đổi thuộc tính» và «đổi chữ» KHÔNG còn phân biệt được nữa.
         * 🔑 Nút con ĐÃ CÓ mục riêng trong ký hiệu ⇒ nhặt lại thuộc tính của nó ở đây vừa THỪA
         *    vừa làm BẨN một trục khác. **Nới một phép đo để nó bắt thêm thì nó cũng bắt nhầm thêm.**
         * ⇒ DỪNG ở ranh giới JSX lồng, và lấy CẢ phần chữ của chuỗi mẫu có chèn biến
         *    (`` `🧬 Đang fork… (${…})` ``) — đó vẫn là chữ Owner ĐỌC.
         */
        const layChu = (c) => {
          if (ts.isJsxText(c)) return [c.getText(src).replace(/\s+/g, ' ').trim()];
          const ra = [];
          if (ts.isJsxExpression(c) && c.expression) {
            (function di(e) {
              if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return;
              if (ts.isJsxAttribute(e)) return;
              if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)
                  || ts.isTemplateHead(e) || ts.isTemplateMiddle(e) || ts.isTemplateTail(e))
                ra.push(e.text.replace(/\s+/g, ' ').trim());
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
          && giaiMoc(d.initializer.expression.getText(src)).some((x) => x === 'useCallback' || x === 'useMemo')) {
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
 * 🗝 KÝ HIỆU CHO NHIỀU TỆP — **KHOÁ THEO COMPONENT**, KHÔNG gộp phẳng.
 *
 * 🕳 BẢN v2 ĐÃ SAI Ở ĐÂU (reviewer NO-GO 22:35, và tôi đo lại thấy đúng):
 *    v2 mua tính «sống qua một lần chia» bằng cách SẮP mọi thứ vào một rổ phẳng.
 *    Cái giá là TOÀN BỘ QUAN HỆ: ai sở hữu móc nào · móc nào đi với mảng phụ thuộc nào ·
 *    thứ tự. Rổ phẳng trả lời được «có đủ số lượng không», mà câu ta cần là
 *    «có đúng thứ đó, đúng chỗ đó, đúng thứ tự đó không».
 *
 * ✅ ĐƯỜNG ĐÚNG RẺ HƠN NHIỀU: **khoá theo TÊN COMPONENT.**
 *    Dời một component sang tệp khác thì tên nó KHÔNG đổi ⇒ mọi thứ bên trong nó KHÔNG đổi
 *    ⇒ bất biến qua một lần dời tệp mà KHÔNG phải sắp xếp, KHÔNG phải bỏ quan hệ nào.
 * 📌 Tính bất biến mua bằng KHOÁ thì giữ được quan hệ. Mua bằng SẮP XẾP thì phải bán quan hệ đi.
 *
 * 🔗 Và móc nay đi LIỀN mảng phụ thuộc của nó (`useEffect(a,b)`), thay vì hai rổ rời —
 *    vì «có 35 mảng phụ thuộc» KHÔNG trả lời được «mảng ấy của móc NÀO».
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
  return {
    soTep: ds.length,
    component: tenHams,
    theoComponent: Object.fromEntries(tenHams.map((t) => [t, {
      moc: theoHam[t].moc.map((m) => `${m.loai}(${m.phuThuoc ? m.phuThuoc.join(', ') : '∅'})`),
      trangThai: theoHam[t].trangThai.map((x) => `${x.goi} ${x.ten} = ${x.khoiTao}`),
      jsx: theoHam[t].jsx,
      hamCon: theoHam[t].hamCon.map((h) => h.ten),
    }])),
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
