// LA_BO_DUNG_SAN cũ vs mới PHẢI trả kết quả GIỐNG HỆT trên mọi ca.
import { bocThuan } from '/Users/erocathanh/Projects/aiboss-app-chat/bai-thu/boc-mo-dun.mjs';
const { tep } = bocThuan('/Users/erocathanh/Projects/aiboss-app-chat/src/components/ung-dung/hang-so.ts');
const M = await import(tep);
const { BO_MARKETING, BO_VAN_HANH, BO_QUAN_LY_CU, BO_QUAN_LY_TRUONG, BO_CONG_NGHE,
        LA_BO_DUNG_SAN, SO_BO_GHE } = M;

// bản CŨ, chép nguyên từ mã trước khi gom
const CU = (ten) => [
  BO_MARKETING,
  BO_VAN_HANH,
  BO_QUAN_LY_CU.map((m) => m.ten),
  BO_QUAN_LY_TRUONG.map((m) => m.ten),
  BO_CONG_NGHE.map((m) => m.ten),
].some((bo) => bo.every((x, i) => ten[i] === x));

const ca = [];
for (const b of [BO_MARKETING, BO_VAN_HANH]) ca.push(b.slice());
for (const b of [BO_QUAN_LY_CU, BO_QUAN_LY_TRUONG, BO_CONG_NGHE]) ca.push(b.map(m => m.ten));
ca.push([]);                                        // rỗng
ca.push(['khong-ton-tai']);                         // bịa
ca.push([null, null, null, null, null, null]);      // toàn null
ca.push(BO_MARKETING.slice(0, 3));                  // tiền tố
ca.push([...BO_MARKETING].reverse());               // đảo thứ tự
ca.push([...BO_MARKETING.slice(0,-1), 'khac']);     // lệch phần tử cuối
let lech = 0;
for (const c of ca) {
  const a = CU(c), b = LA_BO_DUNG_SAN(c);
  if (a !== b) { lech++; console.log('   ✘ LỆCH:', JSON.stringify(c).slice(0,70), 'cũ=', a, 'mới=', b); }
}
console.log(`   ${ca.length} ca thử · số ca LỆCH = ${lech}   ← phải 0`);
console.log(`   ĐỐI CHỨNG DƯƠNG — thước có biết ĐỎ không:`);
const gia = (ten) => !CU(ten);
let bat = 0;
for (const c of ca) if (gia(c) !== CU(c)) bat++;
console.log(`      cắm một hàm SAI HẲN ⇒ lệch ${bat}/${ca.length}   ← phải = ${ca.length}`);
console.log(`   SO_BO_GHE có ${SO_BO_GHE.length} bộ · mọi bộ đều có ghế: ${SO_BO_GHE.every(b=>b.ghe.length>0)}`);
console.log(`   mọi ghế đã CHUẨN HOÁ về {ten,phien}: ${SO_BO_GHE.every(b=>b.ghe.every(g=>'ten' in g && 'phien' in g))}`);
process.exit(lech === 0 && bat === ca.length ? 0 : 1);
