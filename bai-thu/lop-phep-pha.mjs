/**
 * 🏷 CỔNG KIỂM «PHÉP PHÁ CÓ ĐÚNG TÊN KHÔNG» — mỗi phép phá phải KHAI LỚP, máy đo delta THẬT
 *    rồi đối chiếu. Khai sai lớp ⇒ CHẶN, KHÔNG tính là ĐẠT.
 *
 * 🕳 VÌ SAO PHẢI CÓ CỔNG, chứ KHÔNG phải ba bản vá:
 *    Cùng một hình lỗi — «phép phá làm việc KHÁC với tên nó mang» — xuất hiện **BA lần trong một
 *    hộp 16 phép**, và cả ba lần đều lọt qua mắt người viết lẫn mắt hai vòng soi:
 *      · «MẤT một nhánh JSX»        thật ra chỉ xoá TRỐNG className, nhánh còn nguyên
 *      · «ĐỔI THỨ TỰ móc»           thật ra XOÁ móc
 *      · «BỎ SÓT móc gọi qua bí danh» thật ra THÊM SAI phần tử vào mảng phụ thuộc
 *    Nó lọt được vì phép phá sai tên VẪN ĐỎ — chỉ là đỏ vì lý do khác. Cái đỏ ấy trông y hệt
 *    một cái cổng đang canh, nên KHÔNG ai đi đọc lệnh.
 * 📌 **Một phép đo sai nhãn nguy hơn một phép đo hỏng: phép đo hỏng thì im, phép đo sai nhãn thì
 *    TRẢ LỜI — và trả lời tự tin, đúng thứ mình muốn nghe.**
 * 🔑 Vá ba chỗ thì chỗ THỨ TƯ lại quên. Cổng ở đây thì phép phá MỚI mặc định bị soi.
 *
 * ⚠️ KHAI SỨC ĐỦ: cổng này kiểm «delta có thuộc lớp đã khai không». Nó KHÔNG kiểm «lớp đã khai có
 *    phải thứ ta CẦN đo không» — chọn sai lớp ngay từ đầu thì nó vẫn cho qua. Đó vẫn là việc của
 *    người soi. Cổng chỉ bịt được đường «tên nói một đằng, lệnh làm một nẻo».
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import { dayMocTheoComponent, danhTinh } from './thu-tu-moc.mjs';
import { kyHieuGop } from './hinh-dang-than.mjs';

const bam = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 12);

/** Rút mọi SỰ THẬT ĐO ĐƯỢC của một tệp, tách theo TRỤC để lát nữa biết trục nào đã đổi. */
export function doHinh(duongDan) {
  const noiDung = fs.readFileSync(duongDan, 'utf8');
  const k = kyHieuGop([duongDan]);
  const jsx = Object.values(k.theoComponent).flatMap((c) => c.jsx);
  const m = dayMocTheoComponent([duongDan]).day;
  const moc = Object.entries(m).flatMap(([t, ds]) => ds.map((x) => ({ ...x, chu: t })));
  return {
    // trục JSX — tách THẺ · THUỘC TÍNH · CHỮ, vì ba thứ đó hỏng theo ba kiểu khác nhau
    soNutJsx: jsx.length,
    the: jsx.map((x) => x.split('[')[0]),
    thuocTinh: jsx.map((x) => (x.match(/\[(.*?)\]/s) ?? ['', ''])[1]),
    chu: jsx.map((x) => (x.match(/«(.*)»$/s) ?? ['', ''])[1]),
    // trục MÓC
    soMoc: moc.length,
    dayMoc: moc.map(danhTinh),
    daTapMoc: [...moc.map(danhTinh)].sort(),
    tenMocDaGiai: moc.map((x) => x.giai || x.goi),
    phuThuoc: moc.map((x) => (x.pt ? x.pt.join(',') : '∅')),
    vanTay: moc.map((x) => x.vanTay),
    // trục VĂN BẢN — dùng cho lớp hoán vị: đa tập DÒNG phải bằng
    daTapDong: bam([...noiDung.split('\n')].sort().join('\n')),
    noiDung: bam(noiDung),
  };
}

const bang = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * BẢNG LỚP. Mỗi lớp là một VỊ TRÍ trong không gian delta, KHÔNG phải một lời mô tả.
 * `phai` = phải đúng · `cam` = phải sai. Thiếu một vế là lớp đó nới, nên cả hai vế đều bắt buộc.
 */
export const BANG_LOP = {
  'xoa-nut-jsx':        { ta: 'xoá HẲN một nhánh JSX',            phai: (g, p) => p.soNutJsx < g.soNutJsx },
  'doi-thuoc-tinh-jsx': { ta: 'đổi GIÁ TRỊ một thuộc tính JSX',   phai: (g, p) => p.soNutJsx === g.soNutJsx && !bang(g.thuocTinh, p.thuocTinh) },
  'doi-chu-jsx':        { ta: 'đổi CHỮ HIỂN THỊ trong JSX',       phai: (g, p) => p.soNutJsx === g.soNutJsx && !bang(g.chu, p.chu) && bang(g.thuocTinh, p.thuocTinh) },
  'xoa-moc':            { ta: 'xoá HẲN một lời gọi móc',          phai: (g, p) => p.soMoc < g.soMoc },
  'hoan-vi-moc':        { ta: 'ĐỔI CHỖ móc, KHÔNG thêm KHÔNG bớt', phai: (g, p) => bang(g.daTapMoc, p.daTapMoc) && !bang(g.dayMoc, p.dayMoc) && g.daTapDong === p.daTapDong },
  'doi-phu-thuoc':      { ta: 'đổi MẢNG PHỤ THUỘC của một móc',   phai: (g, p) => p.soMoc === g.soMoc && !bang(g.phuThuoc, p.phuThuoc) },
  'doi-danh-tinh-moc':  { ta: 'đổi MÓC REACT được gọi',           phai: (g, p) => p.soMoc === g.soMoc && !bang(g.tenMocDaGiai, p.tenMocDaGiai) },
  'doi-doi-so-moc':     { ta: 'đổi ĐỐI SỐ hoặc THAM SỐ KIỂU của móc', phai: (g, p) => p.soMoc === g.soMoc && !bang(g.vanTay, p.vanTay) && bang(g.tenMocDaGiai, p.tenMocDaGiai) },
  'doi-mo-dun':         { ta: 'đổi mã CẤP MÔ-ĐUN (ngoài thân component)',
                          phai: (g, p) => g.noiDung !== p.noiDung && p.soMoc === g.soMoc && bang(g.dayMoc, p.dayMoc)
                                          && p.soNutJsx === g.soNutJsx && bang(g.thuocTinh, p.thuocTinh) && bang(g.chu, p.chu) },
};

/**
 * @returns {{dat: boolean, vi: string, thay: string[]}}  `thay` = các trục ĐÃ ĐỔI, đo được.
 * 🔴 Lớp lạ ⇒ TỪ CHỐI, KHÔNG cho qua. Bảng lớp thiếu chỗ thì phải THÊM LỚP có định nghĩa,
 *    chứ KHÔNG để một phép phá trôi qua mà không ai kiểm.
 */
export function kiemLop(goc, pha, lop) {
  const truc = [];
  if (pha.soNutJsx !== goc.soNutJsx) truc.push(`số nút JSX ${goc.soNutJsx}→${pha.soNutJsx}`);
  if (!bang(goc.thuocTinh, pha.thuocTinh)) truc.push('thuộc tính JSX');
  if (!bang(goc.chu, pha.chu)) truc.push('chữ hiển thị');
  if (pha.soMoc !== goc.soMoc) truc.push(`số móc ${goc.soMoc}→${pha.soMoc}`);
  else if (!bang(goc.dayMoc, pha.dayMoc)) truc.push(bang(goc.daTapMoc, pha.daTapMoc) ? 'THỨ TỰ móc' : 'danh tính móc');
  if (!bang(goc.phuThuoc, pha.phuThuoc)) truc.push('mảng phụ thuộc');
  if (!bang(goc.tenMocDaGiai, pha.tenMocDaGiai)) truc.push('móc React được gọi');
  if (!bang(goc.vanTay, pha.vanTay)) truc.push('đối số móc');
  if (goc.noiDung === pha.noiDung) return { dat: false, vi: 'phép phá KHÔNG đổi được gì — neo trượt', thay: [] };
  const l = BANG_LOP[lop];
  if (!l) return { dat: false, vi: `lớp lạ «${lop}» ⇒ TỪ CHỐI. Thêm lớp có định nghĩa, đừng để phép phá trôi qua`, thay: truc };
  return l.phai(goc, pha)
    ? { dat: true, vi: l.ta, thay: truc }
    : { dat: false, vi: `KHAI lớp «${lop}» (${l.ta}) nhưng delta THẬT là: ${truc.join(' · ') || 'không trục nào của bộ đo'}`, thay: truc };
}

// chạy trực tiếp:  node lop-phep-pha.mjs <tệp gốc> <tệp đã phá> <lớp>
if (process.argv[1] && process.argv[1].endsWith('lop-phep-pha.mjs')) {
  const [g, p, lop] = process.argv.slice(2);
  const kq = kiemLop(doHinh(g), doHinh(p), lop);
  console.log(kq.dat ? `LỚP-ĐÚNG ${kq.vi} | trục đổi: ${kq.thay.join(' · ')}` : `LỚP-SAI ${kq.vi}`);
  process.exit(kq.dat ? 0 : 1);
}
