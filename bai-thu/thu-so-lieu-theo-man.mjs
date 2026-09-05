/* ⑲ 05/09 — Owner đặt: điện thoại ẨN dòng 225/9/67, desktop GIỮ.
 * grep chỉ nói «có dòng display:none ở đâu đó», KHÔNG nói «ở BỀ NGANG NÀY thì nó ẩn hay hiện».
 * ⇒ đọc tầng CSS theo đúng thứ tự nguồn, cho từng bề ngang, rồi HỎI vật xem nó trả lời gì.
 * Bộ này chạy được cả trên bản TRƯỚC vá (đối chứng dương) — thước phải BIẾT nói ngược lại. */
import { readFileSync } from 'node:fs';

const boChuThich = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

/** trả về các khai báo `display` áp cho selector, theo THỨ TỰ NGUỒN, đã lọc theo bề ngang */
function docTang(nguon, selector, be_ngang) {
  const s = boChuThich(nguon);
  const ra = [];
  // tách khối @media cấp 1; phần còn lại là tầng gốc (luôn áp)
  const re = /@media([^{]+)\{/g;
  let m, cuoiTruoc = 0;
  const doan = [];
  while ((m = re.exec(s))) {
    doan.push({ dk: null, van: s.slice(cuoiTruoc, m.index) });
    let sau = re.lastIndex, sau0 = sau, do_sau = 1;
    while (do_sau > 0 && sau < s.length) { if (s[sau] === '{') do_sau++; else if (s[sau] === '}') do_sau--; sau++; }
    doan.push({ dk: m[1].trim(), van: s.slice(sau0, sau - 1) });
    cuoiTruoc = sau; re.lastIndex = sau;
  }
  doan.push({ dk: null, van: s.slice(cuoiTruoc) });

  for (const d of doan) {
    if (d.dk) {
      const mx = /max-width:\s*(\d+)px/.exec(d.dk); const mn = /min-width:\s*(\d+)px/.exec(d.dk);
      if (mx && be_ngang > +mx[1]) continue;
      if (mn && be_ngang < +mn[1]) continue;
    }
    const rr = /([^{}]+)\{([^{}]*)\}/g; let r;
    while ((r = rr.exec(d.van))) {
      const dsSel = r[1].split(',').map((x) => x.trim());
      if (!dsSel.includes(selector)) continue;
      const dp = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(r[2]);
      if (dp) ra.push({ gt: dp[1].trim(), trong: d.dk ?? 'tầng gốc' });
    }
  }
  return ra;
}

/** display CUỐI CÙNG thắng (mọi selector ở đây đều cùng độ chọn 0,1,0) */
const hienKhong = (bo, sel, w) => {
  const all = bo.flatMap((n) => docTang(n, sel, w));
  return all.length ? all[all.length - 1].gt !== 'none' : true;
};

const doc = (p) => readFileSync(p, 'utf8');
const BO_NAY = [doc('src/app/mau09.css'), doc('src/app/globals.css')];      // globals @import mau09 ở dòng 2 ⇒ mau09 TRƯỚC
const NHA = process.env.HOME;
const BO_CU = [doc(`${NHA}/Operations/sao-luu-viec-do/GOC_mau09-truoc-viec19.css`), doc(`${NHA}/Operations/sao-luu-viec-do/GOC_globals-truoc-viec19.css`)];

const MAN = [
  { w: 360, ten: 'điện thoại hẹp',      so_lieu: false },
  { w: 390, ten: 'iPhone 390×844',      so_lieu: false },   // ← Owner sẽ đo đúng ô này
  { w: 640, ten: 'mốc cũ 640',          so_lieu: false },
  { w: 1040, ten: 'mép TRÊN của mobile', so_lieu: false },
  { w: 1041, ten: 'mép DƯỚI của desktop', so_lieu: true },
  { w: 1280, ten: 'desktop 1280×800',   so_lieu: true },    // ← Owner sẽ đo đúng ô này
  { w: 1440, ten: 'desktop rộng',       so_lieu: true },
];

let hong = 0;
console.log('   bề ngang  .so-lieu       .nhom-bo-cuc   mong đợi');
for (const m of MAN) {
  const sl = hienKhong(BO_NAY, '.so-lieu', m.w);
  const nb = hienKhong(BO_NAY, '.nhom-bo-cuc', m.w);
  const dat = sl === m.so_lieu && nb === true;                 // nút bố cục PHẢI hiện ở MỌI bề ngang
  if (!dat) hong++;
  console.log(`   ${String(m.w).padEnd(9)} ${(sl ? 'HIỆN' : 'ẩn').padEnd(13)} ${(nb ? 'HIỆN' : '🔴 ẩn').padEnd(14)} ${m.so_lieu ? 'HIỆN' : 'ẩn'}  ${dat ? '✔' : '🔴 SAI'}  (${m.ten})`);
}

console.log('\n   ── ĐỐI CHỨNG DƯƠNG: chạy CHÍNH thước này trên bản TRƯỚC vá');
const cu390 = hienKhong(BO_CU, '.so-lieu', 390);
const cu1280 = hienKhong(BO_CU, '.so-lieu', 1280);
console.log(`      bản cũ 390px  → .so-lieu ${cu390 ? 'HIỆN' : 'ẩn'}   (phải HIỆN — nếu ẩn thì thước đang mù, ĐỪNG tin bảng trên)`);
console.log(`      bản cũ 1280px → .so-lieu ${cu1280 ? 'HIỆN' : 'ẩn'}   (phải HIỆN)`);
if (!cu390 || !cu1280) { console.log('   🔴 THƯỚC MÙ — bản cũ lẽ ra HIỆN ở cả hai'); hong++; }

console.log(hong === 0 ? '\n   ✔ ĐẠT 7/7 bề ngang + thước tự chứng biết nói NGƯỢC' : `\n   🔴 HỎNG ${hong}`);
process.exit(hong === 0 ? 0 : 1);
