/**
 * 🧊 CÂU NHẮC KHÔNG ĐƯỢC ĐÈ — phép kiểm TĨNH trên CSS.
 *
 * ⚠️ NÓI RÕ PHẠM VI TRƯỚC, để chú thích này khônghứa quá thứ nó làm:
 *    tệp này ĐỌC CSS, khôngmở trình duyệt (dự án khôngcó playwright — đo 05/09: 0 gói).
 *    Nó canh được HAI điều: câu nhắc có cộng `--cao-bang` không, và khoảng chừa có đủ cao
 *    hơn thanh trên không. Nó KHÔNG canh được «trông thế nào trên máy thật» — số 47/51px
 *    dưới đây do người đo bằng trình duyệt và ghi vào đây kèm ngày.
 * 🔑 Một phép kiểm khai đúng thứ nó KHÔNG làm thì người sau biết chỗ nào còn hở.
 *    Khai gộp thành «đã kiểm» mới là chỗ sinh ra niềm tin sai.
 */
import { readFileSync } from 'node:fs';

const CAO_THANH = { desktop: 47, mobile: 51, doNgay: '2026-09-05', doBang: 'trình duyệt thật 1280×800 và 390×844' };

function docLuat(css) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const m = /\.nhac-bo-ghe\s*\{([^}]*)\}/.exec(s);
  if (!m) return null;
  const than = m[1];
  const lay = (t) => { const r = new RegExp(`(?:^|;)\\s*${t}\\s*:\\s*([^;]+)`).exec(than); return r ? r[1].trim() : null; };
  const top = lay('top') ?? '';
  const so = /(\d+)px/.exec(top.includes('calc') ? top.replace(/var\([^)]*\)/g, '') : top);
  return { top, coCaoBang: top.includes('--cao-bang'), chua: so ? +so[1] : 0, xuyenChuot: lay('pointer-events') === 'none' };
}

const CAN = Math.max(CAO_THANH.desktop, CAO_THANH.mobile);
const nay = docLuat(readFileSync('src/app/globals.css', 'utf8'));
let hong = 0;
const doi = (dat, ten, them) => { console.log(`   ${dat ? '✔' : '🔴'} ${ten}${them ? ` — ${them}` : ''}`); if (!dat) hong += 1; };

console.log(`   thanh trên cao ${CAO_THANH.desktop}px (desktop) · ${CAO_THANH.mobile}px (mobile) — đo ${CAO_THANH.doNgay} bằng ${CAO_THANH.doBang}`);
doi(!!nay, 'tìm thấy rule .nhac-bo-ghe');
doi(nay?.coCaoBang === true, 'top CÓ cộng var(--cao-bang)', 'thiếu ⇒ câu nhắc (z-index 90) che băng cảnh báo (z-index 70)');
doi((nay?.chua ?? 0) > CAO_THANH.mobile, `khoảng chừa ${nay?.chua}px > ${CAO_THANH.mobile}px`, `top hiện tại: ${nay?.top}`);
doi(nay?.xuyenChuot === true, 'pointer-events:none — cú bấm đi xuyên được');

/* ── ĐỐI CHỨNG DƯƠNG: chạy CHÍNH thước này trên bản TRƯỚC vòng 2 ────────────
   Bản đó là `top:12px` khôngcộng `--cao-bang` ⇒ thước phải ĐỎ đúng hai vế. */
const CU = `${process.env.HOME}/Operations/sao-luu-viec-do/GOC_globals-truoc-vong2.css`;
let cu = null;
try { cu = docLuat(readFileSync(CU, 'utf8')); } catch { /* khôngcó bản cũ thì bỏ vế này */ }
if (cu) {
  const batDuoc = cu.coCaoBang === false && cu.chua <= CAO_THANH.mobile;
  console.log(`   ${batDuoc ? '✔' : '🔴'} ĐỐI CHỨNG DƯƠNG — bản trước vòng 2 (top:${cu.top}) phải ĐỎ cả hai vế: ${batDuoc ? 'thước BIẾT ĐỎ' : 'THƯỚC MÙ, đừng tin mấy dòng trên'}`);
  if (!batDuoc) hong += 1;
} else {
  console.log('   ⚠️ khôngđọc được bản cũ ⇒ CHƯA chứng minh được thước biết đỏ. Đừng dẫn kết quả này đi đâu.');
  hong += 1;
}
console.log(hong === 0 ? '   ✔ ĐẠT' : `   🔴 HỎNG ${hong}`);
process.exit(hong === 0 ? 0 : 1);
