/**
 * 🧬 ĐÓNG BĂNG HÌNH DẠNG THÂN COMPONENT — bản v2, vá theo NO-GO của reviewer 22:35.
 *
 * 🔑 ĐỔI MÔ HÌNH, KHÔNG chỉ đổi tham số:
 *    **một lần CHIA giữ nguyên TẬP HỢP, chỉ đổi cách chia tập hợp ấy ra các tệp.**
 *    ⇒ đóng băng TẬP HỢP GỘP thì nó SỐNG QUA một lần chia đúng, và ĐỎ khi có thứ rơi mất.
 *    ⇒ **KHÔNG phải chụp lại sau khi chia** — nên cũng KHÔNG có chỗ cho đường vòng
 *      «chụp mã đã chia rồi so với chính nó».
 *
 * ⚠️ VẪN LÀ HÌNH DẠNG, KHÔNG PHẢI HÀNH VI. Xem README.
 * ⚠️ Ký hiệu gộp KHÔNG canh thứ tự móc GIỮA các component (thứ tự chỉ có nghĩa trong một
 *    component). Trong từng component thì vẫn canh — xem `thuTuTrongTungHam`.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kyHieuGop, timComponent } from './hinh-dang-than.mjs';
import { nguonTypescript, phienBanTypescript } from './nap-typescript.mjs';

const NGUON = (process.env.NGUON_THU ?? new URL('../src/components/UngDung.tsx', import.meta.url).pathname).split(',');
const DONG_BANG = JSON.parse(fs.readFileSync(new URL('./hinh-dang-than.json', import.meta.url), 'utf8'));
const NAY = kyHieuGop(NGUON);
const VT = (t: string) => new URL(`./vat-thu/${t}`, import.meta.url).pathname;

describe('🔴 Q4.2 — ký hiệu phải SỐNG QUA một lần chia (đo bằng VẬT THỬ, không bằng lời hứa)', () => {
  const chot = (k: any) => JSON.stringify({ m: k.mocTheoLoai, p: k.phuThuoc, t: k.trangThai, j: k.jsx, h: k.hamCon });
  test('chia ĐÚNG (1 tệp → 2 tệp, 1 component → 2) ⇒ ký hiệu GIỐNG HỆT', () => {
    const truoc = kyHieuGop([VT('truoc-khi-chia.tsx')]);
    const sau = kyHieuGop([VT('sau-khi-chia-1.tsx'), VT('sau-khi-chia-2.tsx')]);
    assert.equal(truoc.component.length, 1);
    assert.equal(sau.component.length, 2, 'vật thử phải thật sự có HAI component, không thì phép thử vô nghĩa');
    assert.equal(chot(sau), chot(truoc), 'ký hiệu đổi sau một lần chia ĐÚNG ⇒ bộ đo sẽ kêu oan mỗi lần chia');
  });
  test('chia mà LÀM RƠI ⇒ ký hiệu KHÁC (đối chứng âm gắn liền)', () => {
    const truoc = kyHieuGop([VT('truoc-khi-chia.tsx')]);
    const roi = kyHieuGop([VT('sau-khi-chia-1.tsx'), VT('sau-khi-chia-thieu.tsx')]);
    assert.notEqual(chot(roi), chot(truoc), 'làm rơi mà ký hiệu vẫn giống ⇒ bộ đo MÙ đúng chỗ nó sinh ra để canh');
  });
  test('nhận danh sách RỖNG ⇒ NÉM LỖI, không trả về ký hiệu rỗng', () => {
    assert.throws(() => kyHieuGop([]), /RỖNG/);
  });
  test('KHÔNG thấy component nào ⇒ NÉM LỖI, không im lặng đạt', () => {
    assert.throws(() => kyHieuGop([VT('khong-co-that.tsx')]));
  });
});

describe('tập hợp GỘP — so với bản đóng băng', () => {
  test('móc: đủ số, đủ loại', () => assert.deepEqual(NAY.mocTheoLoai, DONG_BANG.mocTheoLoai));
  test('mảng phụ thuộc: từng mảng khớp', () => assert.deepEqual(NAY.phuThuoc, DONG_BANG.phuThuoc));
  test('trạng thái: tên + giá trị khởi tạo', () => assert.deepEqual(NAY.trangThai, DONG_BANG.trangThai));
  test('cây JSX: thẻ + thuộc tính + PHẦN CHỮ', () => assert.deepEqual(NAY.jsx, DONG_BANG.jsx));
  test('hàm con: đủ tên', () => assert.deepEqual(NAY.hamCon, DONG_BANG.hamCon));
});

describe('🔴 Q2 — ký hiệu phải mang PHẦN CHỮ, vì đó là thứ Owner ĐỌC', () => {
  test('có ít nhất 60 nút JSX mang chữ hiển thị', () => {
    const coChu = NAY.jsx.filter((x: string) => x.includes('«'));
    assert.ok(coChu.length >= 100, `chỉ ${coChu.length} nút mang chữ ⇒ bộ bóc có thể đang bỏ phần chữ`);
  });
});

describe('thứ tự móc TRONG TỪNG component — React phụ thuộc thứ tự', () => {
  test('mỗi component giữ nguyên thứ tự móc', () => {
    assert.deepEqual(NAY.thuTuTrongTungHam, DONG_BANG.thuTuTrongTungHam);
  });
});

describe('🔴 Q5 — bộ đo phải KHAI nó nạp typescript từ đâu, bản nào', () => {
  test('nguồn typescript nằm trong một kho có package.json khai đúng bản đó', () => {
    const goc = nguonTypescript.replace(/\/node_modules\/typescript\/lib\/typescript\.js$/, '');
    const pkg = JSON.parse(fs.readFileSync(`${goc}/package.json`, 'utf8'));
    const khai = (pkg.devDependencies?.typescript ?? pkg.dependencies?.typescript ?? '').replace(/^[^0-9]*/, '');
    assert.ok(khai, `kho ${goc} KHÔNG khai typescript trong package.json ⇒ đang nạp từ chỗ lạ`);
    assert.equal(phienBanTypescript.split('.').slice(0, 2).join('.'), khai.split('.').slice(0, 2).join('.'),
      `bản đang nạp ${phienBanTypescript} lệch bản kho khai ${khai} ⇒ ký hiệu có thể đổi vì CÔNG CỤ, không vì MÃ`);
  });
  test('ĐỐI CHỨNG DƯƠNG — có đọc được phiên bản thật, không phải chuỗi rỗng', () => {
    assert.match(phienBanTypescript, /^\d+\.\d+/);
  });
});

describe('ĐỐI CHỨNG DƯƠNG — thước có THẤY gì không', () => {
  test('ký hiệu KHÔNG rỗng ở cả năm phần', () => {
    assert.ok(NAY.mocTheoLoai.length >= 68 && NAY.jsx.length >= 200);
    assert.ok(NAY.trangThai.length >= 30 && NAY.hamCon.length >= 20 && NAY.phuThuoc.length >= 35);
  });
  test('timComponent tìm được component trong tệp thật', () => {
    assert.ok(timComponent(NGUON[0]).length >= 1);
  });
});
