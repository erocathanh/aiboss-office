/**
 * 📸 CHỤP BẢN ĐÓNG BĂNG cho thước thứ tự móc.  `node bai-thu/chup-thu-tu-moc.mjs`
 *
 * 🔴 ĐỌC TRƯỚC KHI CHẠY — đây là cái nút nguy hiểm nhất trong cả bộ đo:
 *    Chụp lại SAU khi đã chia tệp = so mã đã chia VỚI CHÍNH NÓ = XANH mà KHÔNG chứng minh gì.
 *    Đó đúng là đường vòng reviewer đã chỉ ra ở bản v1. Chỉ chạy lệnh này khi:
 *      ① dựng bản đóng băng LẦN ĐẦU, hoặc
 *      ② đã có người soi ĐỌC và DUYỆT phần khác biệt, và ghi lại lý do.
 *    Chụp mà không khai lý do thì lần sau không ai biết bản đóng băng đang đóng băng cái gì.
 */
import fs from 'node:fs';
import { dayMocTheoComponent, danhTinh } from './thu-tu-moc.mjs';

const nguon = process.argv.slice(2);
if (nguon.length === 0) nguon.push(new URL('../src/components/UngDung.tsx', import.meta.url).pathname);
const k = dayMocTheoComponent(nguon);
const day = Object.fromEntries(Object.entries(k.day).map(([t, ds]) => [t, ds.map(danhTinh)]));
const ra = {
  _doc: 'BẢN ĐÓNG BĂNG dãy móc theo từng component. Sinh bằng bai-thu/chup-thu-tu-moc.mjs. ĐỪNG chụp lại sau khi chia tệp.',
  nguon: nguon.map((n) => n.replace(/^.*\/aiboss-app-chat\//, '')),
  component: Object.keys(k.day).sort(),
  soMoc: k.day.UngDung ? k.day.UngDung.length : null,
  day, qua: k.qua, mocTuViet: k.mocTuViet,
};
const dich = new URL('./thu-tu-moc.json', import.meta.url).pathname;
fs.writeFileSync(dich, JSON.stringify(ra, null, 1) + '\n');
console.log(`đã chụp → ${dich}`);
for (const [t, ds] of Object.entries(day)) console.log(`  ${t}: ${ds.length} móc`);
