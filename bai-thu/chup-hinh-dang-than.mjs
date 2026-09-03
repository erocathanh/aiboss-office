/**
 * 📸 CHỤP BẢN ĐÓNG BĂNG hình dạng thân.  `node bai-thu/chup-hinh-dang-than.mjs`
 * 🔴 Cảnh báo giống hệt `chup-thu-tu-moc.mjs`: chụp lại SAU khi chia = so mã đã chia với chính nó.
 *    Bản v1 KHÔNG có script này, và một bản chụp không có script sinh thì lần sau người ta chụp
 *    bằng tay, mỗi người một kiểu, rồi không ai biết bản đóng băng đang đóng băng cái gì.
 */
import fs from 'node:fs';
import { kyHieuGop } from './hinh-dang-than.mjs';
const nguon = process.argv.slice(2);
if (nguon.length === 0) nguon.push(new URL('../src/components/UngDung.tsx', import.meta.url).pathname);
const k = kyHieuGop(nguon);
const dich = new URL('./hinh-dang-than.json', import.meta.url).pathname;
fs.writeFileSync(dich, JSON.stringify({
  _doc: 'BẢN ĐÓNG BĂNG hình dạng thân, KHOÁ THEO COMPONENT. Sinh bằng bai-thu/chup-hinh-dang-than.mjs.',
  nguon: nguon.map((n) => n.replace(/^.*\/aiboss-app-chat\//, '')), ...k,
}, null, 1) + '\n');
console.log(`đã chụp → ${dich}`);
for (const [t, v] of Object.entries(k.theoComponent))
  console.log(`  ${t}: ${v.moc.length} móc · ${v.trangThai.length} trạng thái · ${v.jsx.length} nút JSX · ${v.hamCon.length} hàm con`);
