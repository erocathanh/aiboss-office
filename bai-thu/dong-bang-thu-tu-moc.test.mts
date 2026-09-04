/**
 * 🪝 ĐÓNG BĂNG THỨ TỰ MÓC — LÀN B.
 *
 * 🔑 Câu duy nhất bài thử này trả lời: **trong TỪNG component, dãy móc có còn nguyên không.**
 *    Nó KHÔNG hứa «hành vi giống cũ». Nó hứa đúng một tính chất, và tính chất ấy
 *    quyết-định-được: hai dãy chuỗi, so bằng nhau hay không.
 *
 * 🕳 CỚ SINH RA NÓ, bằng số: bản gộp-phẳng v2 gặp một phép HOÁN VỊ THẬT hai dòng `useState`
 *    liền nhau (tập hợp dòng y hệt) và trả **15/15 XANH**. Xem `thu-tu-moc.mjs` đầu tệp.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dayMocTheoComponent, soSanhDay, danhTinh } from './thu-tu-moc.mjs';

// TRỤC ② (04/09): `BongBong` (2 × useMemo) đã dời sang `bong-bong.tsx`, và `dungTruocKhiVe`
// sang `hang-so.ts`. Nếu chỉ đọc `UngDung.tsx` thì đếm ra 67 — ĐÚNG BẰNG con số của bộ dò
// HỎNG ngày trước (`^use[A-Z]` hụt 67/70). Hai nguyên nhân khác hẳn nhau, CÙNG một con số.
// 🔑 Nếu tôi hạ mong đợi xuống 67 cho «xanh», tôi đã tắt đúng cái chốt chặn bí danh tái diễn.
// ⇒ Đọc CẢ BA tệp: vẫn phải ra 70 ⇒ chứng minh dời KHÔNG mất móc nào.
const NGUON = (process.env.NGUON_THU ?? [
  new URL('../src/components/UngDung.tsx', import.meta.url).pathname,
  new URL('../src/components/ung-dung/hang-so.ts', import.meta.url).pathname,
  new URL('../src/components/ung-dung/bong-bong.tsx', import.meta.url).pathname,
].join(',')).split(',');
const BANG = JSON.parse(fs.readFileSync(new URL('./thu-tu-moc.json', import.meta.url), 'utf8'));
const VT = (t: string) => new URL(`./vat-thu/${t}`, import.meta.url).pathname;
const NAY = dayMocTheoComponent(NGUON);
const chuoi = (d: any) => Object.fromEntries(Object.entries(d).map(([t, ds]: any) => [t, ds.map(danhTinh)]));

describe('🪝 dãy móc trong tệp thật — so với bản đóng băng', () => {
  test('đủ component, đúng tên (dãy móc)', () => assert.deepEqual(Object.keys(NAY.day).sort(), BANG.component));
  test('mỗi component giữ NGUYÊN DÃY móc, đúng thứ tự', () => assert.deepEqual(chuoi(NAY.day), BANG.day));
  test('truy vết «móc này đi qua móc tự viết nào» cũng đóng băng', () => assert.deepEqual(NAY.qua, BANG.qua));
});

describe('🔴 VẬT THỬ — thước phải PHÂN BIỆT ĐƯỢC bốn ca, không gộp chúng thành «khác»', () => {
  const lay = (f: string[]) => dayMocTheoComponent(f.map(VT)).day;
  const goc = () => lay(['moc-truoc.tsx']);

  test('① DỜI TỆP thuần (2 component 1 tệp → 2 tệp, có cả nhập ĐỔI TÊN) ⇒ DOI-TEP-THUAN', () => {
    const kq = soSanhDay(goc(), lay(['moc-sau-1.tsx', 'moc-sau-2.tsx']));
    assert.equal(kq.ket, 'DOI-TEP-THUAN', JSON.stringify(kq, null, 1));
  });
  test('② ĐỔI THỨ TỰ hai móc ⇒ DOI-THU-TU, và CHỈ RA component nào', () => {
    const kq = soSanhDay(goc(), lay(['moc-doi-thu-tu.tsx']));
    assert.equal(kq.ket, 'DOI-THU-TU');
    assert.deepEqual(kq.doiThuTu.map((x: any) => x.component), ['Tren']);
    assert.equal(kq.mat.length + kq.them.length, 0, 'đổi thứ tự mà báo là mất/thêm ⇒ phán quyết sai loại');
  });
  test('③ BÓC ra MÓC TỰ VIẾT ⇒ vẫn DOI-TEP-THUAN (React cũng gỡ phẳng đúng thế)', () => {
    const kq = soSanhDay(goc(), lay(['moc-boc-thanh-moc-rieng.tsx']));
    assert.equal(kq.ket, 'DOI-TEP-THUAN', 'kêu oan ở đây thì nó sẽ kêu oan đúng lần chia ta định làm');
  });
  test('④ ĐỔI MẢNG PHỤ THUỘC ⇒ KHÔNG được im', () => {
    const kq = soSanhDay(goc(), lay(['moc-doi-phu-thuoc.tsx']));
    assert.notEqual(kq.ket, 'DOI-TEP-THUAN');
  });
});

describe('🔴 BÓC TÁCH sang component MỚI — phải GỌI TÊN, không được im mà cũng không được kêu «mất»', () => {
  const lay = (f: string[]) => dayMocTheoComponent(f.map(VT)).day;
  test('bóc tách ĐỦ ⇒ CHUYEN-CHU, nêu rõ móc nào từ đâu sang đâu', () => {
    const kq = soSanhDay(lay(['truoc-khi-chia.tsx']), lay(['sau-khi-chia-1.tsx', 'sau-khi-chia-2.tsx']));
    assert.equal(kq.ket, 'CHUYEN-CHU');
    assert.equal(kq.chuyenChu.length, 2);
    assert.deepEqual(kq.chuyenChu.map((c: any) => `${c.tu}→${c.den}`), ['Man→Nut', 'Man→Nut']);
    assert.equal(kq.mat.length, 0, 'đổi chủ mà khai là MẤT ⇒ người soi sẽ đi tìm thứ không mất');
  });
  test('bóc tách mà LÀM RƠI ⇒ MAT-HOAC-THEM, và chỉ đúng móc bị rơi', () => {
    const kq = soSanhDay(lay(['truoc-khi-chia.tsx']), lay(['sau-khi-chia-1.tsx', 'sau-khi-chia-thieu.tsx']));
    assert.equal(kq.ket, 'MAT-HOAC-THEM');
    assert.deepEqual(kq.mat.map((x: any) => x.ai.split('#').slice(0, 2).join(' ')), ['useCallback bam']);
  });
});

describe('🔴 BÍ DANH — bản cũ dò bằng `^use[A-Z]` nên hụt 67/70. Đây là chốt chặn nó tái diễn', () => {
  test('bắt được móc gọi qua bí danh, và GIẢI ra được móc React thật', () => {
    const d: any = NAY.day.UngDung;
    const bd = d.filter((m: any) => m.vi === 'bi-danh');
    assert.ok(bd.length >= 1, 'KHÔNG thấy móc bí danh nào ⇒ bộ dò đã mù trở lại');
    assert.deepEqual([...new Set(bd.map((m: any) => m.giai))], ['useEffect|useLayoutEffect']);
  });
  test('ĐỐI CHỨNG DƯƠNG — thước phải THẤY đủ ba lối biết-là-móc, không chỉ một', () => {
    const d: any = NAY.day.UngDung;
    assert.equal(d.length, BANG.soMoc);
    assert.ok(d.filter((m: any) => m.vi === 'nhap').length > 0);
    assert.ok(d.filter((m: any) => m.vi === 'bi-danh').length > 0);
  });
  test('KHÔNG có hai móc nào TRÙNG DANH TÍNH ⇒ hoán vị bất kỳ cặp nào cũng bị bắt', () => {
    for (const [ten, ds] of Object.entries(NAY.day) as any) {
      const id = ds.map(danhTinh);
      assert.equal(new Set(id).size, id.length,
        `component ${ten} có hai móc trùng danh tính ⇒ đổi chỗ CHÍNH HAI CÁI ĐÓ sẽ lọt`);
    }
  });
});

describe('🔴 thước phải TỪ CHỐI khi chưa đo được, đừng trả 0', () => {
  test('danh sách RỖNG ⇒ ném lỗi', () => assert.throws(() => dayMocTheoComponent([]), /RỖNG/));
  test('tệp không có component nào ⇒ ném lỗi, không im lặng đạt', () =>
    assert.throws(() => dayMocTheoComponent([VT('khong-co-that.tsx')])));
});
