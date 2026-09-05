// BẢNG {bố cục} × {anCot} × {anKhu} — MỌI ô phải đổi ít nhất MỘT biến NHÌN THẤY ĐƯỢC
// ở bề rộng đang đứng, ngay LẦN BẤM ĐẦU.
// 🔑 Vì sao lập bảng thay vì vá từng ô: người soi đếm được BẢY ô no-op. Vá lẻ thì sót —
//    và cái sót lại trông y hệt cái đã vá.
// 📏 Neo CSS (đo 05/09): `.khung.an-cot …` ⊂ @media(min-width:1041px) ⇒ anCot chỉ THẤY ở desktop
//                        `.cot-3.mo-khu …` ⊂ @media(max-width:1040px) ⇒ anKhu chỉ THẤY ở mobile
const bam = (boCuc, anCot, anKhu) => {
  const dangAn = anCot === null ? boCuc === 6 : anCot;
  return { anCot: !dangAn, anKhu: !anKhu };
};
let tong = 0, hong = [];
for (const boCuc of [1, 2, 4, 6])
  for (const anCot of [null, false, true])
    for (const anKhu of [false, true])
      for (const man of ['desktop', 'mobile']) {
        tong++;
        const sau = bam(boCuc, anCot, anKhu);
        const truocCot = anCot === null ? boCuc === 6 : anCot;
        // biến NHÌN THẤY ĐƯỢC ở bề rộng này có đổi không
        const doi = man === 'desktop' ? sau.anCot !== truocCot : sau.anKhu !== anKhu;
        if (!doi) hong.push(`${man} · bố cục ${boCuc} · anCot=${anCot} · anKhu=${anKhu}`);
      }
console.log(`   bảng có ${tong} ô · số ô KHÔNG đổi gì nhìn thấy được: ${hong.length}   ← phải 0`);
hong.slice(0, 8).forEach((x) => console.log('      ✘', x));

// ĐỐI CHỨNG DƯƠNG: handler CŨ phải lộ ra đúng những ô no-op
const bamCu = (boCuc, anCot, anKhu) => {
  const dangAn = anCot === null ? boCuc === 6 : anCot;
  return (dangAn || !anKhu) ? { anCot: false, anKhu: true } : { anCot: true, anKhu };
};
let hongCu = 0;
for (const boCuc of [1, 2, 4, 6])
  for (const anCot of [null, false, true])
    for (const anKhu of [false, true])
      for (const man of ['desktop', 'mobile']) {
        const sau = bamCu(boCuc, anCot, anKhu);
        const truocCot = anCot === null ? boCuc === 6 : anCot;
        const doi = man === 'desktop' ? sau.anCot !== truocCot : sau.anKhu !== anKhu;
        if (!doi) hongCu++;
      }
console.log(`   ĐỐI CHỨNG DƯƠNG — handler CŨ: ${hongCu} ô no-op   ← phải > 0 (thước BIẾT ĐỎ)`);
process.exit(hong.length === 0 && hongCu > 0 ? 0 : 1);
