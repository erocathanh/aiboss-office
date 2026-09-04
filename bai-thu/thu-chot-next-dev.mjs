// Bảng sự thật cho chốt chặn `next dev` ghi đè bản dựng đang phục vụ.
// Vật thử = 5 cách viết HERMES nêu (vòng 1) + 3 LOẠI GEMINI nêu (vòng 2).
// 🔑 Câu hỏi đúng KHÔNG phải «hai chuỗi có bằng nhau» mà «ghi vào đây có ĐỤNG .next không».
import fs from 'node:fs';
const KHO = '/Users/erocathanh/Projects/aiboss-app-chat';
const mod = await import(KHO + '/next.config.mjs');
const cauHinh = mod.default;
const LIEN_KET = KHO + '/lien-ket-thu-nghiem';

// ⚠️ TÁCH BIẾN: bài này thử chốt THƯ MỤC DỰNG. Chốt NODE_ENV (lỗ ④) là chốt KHÁC, có bài riêng.
// Vỏ lệnh của ghế có sẵn NODE_ENV=production ⇒ không đặt lại thì MỌI ca dev bị chặn vì lý do KHÁC,
// và bài thử sẽ "xanh vì nhầm lý do" — đúng thứ nguy hơn cả một bài thử đỏ.
process.env.NODE_ENV = 'development';

function thu(pha, dd, mong, ghi) {
  if (dd === null) delete process.env.NEXT_DIST_DIR; else process.env.NEXT_DIST_DIR = dd;
  let kq;
  try { cauHinh(pha); kq = 'QUA'; } catch { kq = 'CHẶN'; }
  const ok = kq === mong;
  console.log(`   ${ok ? '✔' : '✘ >>> HỎNG <<<'}  ${JSON.stringify(dd).padEnd(24)} ⇒ ${kq.padEnd(5)} (mong ${mong})  ${ghi}`);
  return ok;
}
const DEV = 'phase-development-server';

console.log('══ GIỮ NGUYÊN CÂU 3 — hai máy khác hãng đã xác nhận, ĐỪNG làm hỏng ══');
const a = ['phase-production-build','phase-production-server','phase-export','phase-info','phase-test']
  .map(p => thu(p, null, 'QUA', '← ' + p.replace('phase-','')));

console.log('\n══ ĐỐI CHỨNG ÂM — .next-dev các kiểu ⇒ KHÔNG được chặn ══');
const b = [
  thu(DEV, '.next-dev',    'QUA', ''),
  thu(DEV, './.next-dev',  'QUA', ''),
  thu(DEV, '.next-dev/',   'QUA', ''),
  thu(DEV, '.NEXT-DEV',    'QUA', '← hoa-thường KHÁC thư mục ⇒ vẫn phải QUA'),
  thu(DEV, 'bai-thu',      'QUA', '← thư mục khác hẳn'),
];

console.log('\n══ LOẠI 1 (Hermes, 5 ca) — biến thể chính tả cùng một đường ══');
const c = ['.next','./.next','.next/','.next/.','.next//'].map(v => thu(DEV, v, 'CHẶN', ''));

console.log('\n══ LOẠI 2 (Gemini ①) — CHỮ HOA-THƯỜNG ══');
const d = [
  thu(DEV, '.NEXT', 'CHẶN', '← realpath KHÔNG chữa được ca này'),
  thu(DEV, '.Next', 'CHẶN', ''),
  thu(DEV, './.NEXT/', 'CHẶN', '← trộn hai loại'),
];

console.log('\n══ LOẠI 3 (Gemini ②) — LIÊN KẾT MỀM ══');
let e = [];
try {
  fs.symlinkSync('.next', LIEN_KET, 'dir');
  e = [ thu(DEV, 'lien-ket-thu-nghiem', 'CHẶN', '← symlink trỏ vào .next') ];
} finally {
  try { fs.unlinkSync(LIEN_KET); } catch {}
}
console.log(`   liên kết đã dọn: ${fs.existsSync(LIEN_KET) ? '>>> CÒN SÓT <<<' : 'sạch'}`);

console.log('\n══ LOẠI 4 (Gemini ③) — THƯ MỤC CON và THƯ MỤC CHA ══');
const f = [
  thu(DEV, '.next/server', 'CHẶN', '← con: ghi vào đây VẪN phá bản dựng'),
  thu(DEV, '.next/static', 'CHẶN', '← con'),
  thu(DEV, '.',            'CHẶN', '← CHA: chứa .next bên trong'),
  thu(DEV, './',           'CHẶN', '← cha, cách gõ khác'),
];

const tat = [...a, ...b, ...c, ...d, ...e, ...f];
console.log(`\n══ CHỐT ══\n   ${tat.filter(Boolean).length}/${tat.length} ca đúng`);
process.exit(tat.every(Boolean) ? 0 : 1);
