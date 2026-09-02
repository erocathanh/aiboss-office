/**
 * 🧬 ĐÓNG BĂNG HÌNH DẠNG THÂN COMPONENT — tầng phủ nốt 86% mà ba bộ kia KHÔNG với tới.
 *
 * ⚠️ ĐỌC DÒNG NÀY TRƯỚC KHI TIN CON SỐ XANH:
 *    đây là đóng băng **HÌNH DẠNG**, KHÔNG phải đóng băng **HÀNH VI**.
 *    Nó bắt: thứ bị MẤT · bị ĐỔI THỨ TỰ · mảng phụ thuộc ĐỔI · thuộc tính/lớp CSS ĐỔI.
 *    Nó KHÔNG bắt: cùng hình dạng mà chạy ra kết quả khác (vd đổi một dấu so sánh bên trong).
 * 🔑 Chọn tầng này vì kiểu hỏng của một lần CHIA là «dời mà rơi mất / dời mà đổi chỗ»,
 *    chứ không phải «viết sai logic». Bốn kiểu đó ĐỌC ĐƯỢC, không cần chạy, nên KHÔNG cần
 *    giả lập — và giả lập chính là chỗ đẻ ra bộ đo xanh giả.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kyHieuThan, tomTat } from './hinh-dang-than.mjs';

const NGUON = process.env.NGUON_THU ?? new URL('../src/components/UngDung.tsx', import.meta.url).pathname;
const DONG_BANG = JSON.parse(fs.readFileSync(new URL('./hinh-dang-than.json', import.meta.url), 'utf8'));
const NAY = kyHieuThan(NGUON);

describe('móc React — SỐ LƯỢNG và THỨ TỰ', () => {
  test('đúng 70 móc (gồm 3 lời gọi qua BÍ DANH dungTruocKhiVe)', () => {
    assert.equal(NAY.moc.length, DONG_BANG.moc.length);
  });
  test('THỨ TỰ móc y nguyên — React phụ thuộc thứ tự, đổi chỗ là hỏng CÂM', () => {
    assert.deepEqual(NAY.moc.map((m: any) => m.loai), DONG_BANG.moc.map((m: any) => m.loai),
      'thứ tự móc đổi ⇒ React ghép nhầm trạng thái giữa hai lần vẽ');
  });
  test('từng loại móc giữ đúng số lượng', () => {
    assert.deepEqual(tomTat(NAY).theoLoai, tomTat(DONG_BANG).theoLoai);
  });
});

describe('mảng phụ thuộc — chỗ hỏng IM LẶNG nhất khi dời mã', () => {
  test('38 mảng phụ thuộc, 50 phần tử, từng cái khớp', () => {
    assert.deepEqual(NAY.moc.map((m: any) => m.phuThuoc), DONG_BANG.moc.map((m: any) => m.phuThuoc),
      'thiếu một phần tử ⇒ đóng băng giá trị cũ; thừa một phần tử ⇒ chạy lại vô ích hoặc vòng lặp');
  });
});

describe('trạng thái — tên và GIÁ TRỊ KHỞI TẠO', () => {
  test('35 khai báo useState/useRef giữ nguyên tên và giá trị đầu', () => {
    assert.deepEqual(NAY.trangThai, DONG_BANG.trangThai,
      'đổi giá trị khởi tạo = đổi hành vi ở LẦN VẼ ĐẦU, và lần đầu là lần Owner nhìn thấy');
  });
});

describe('cây JSX — lớp trình bày (M5), phần PM đang chặn', () => {
  test('242 nút, đúng thứ tự, đúng bộ thuộc tính', () => {
    assert.deepEqual(NAY.jsx, DONG_BANG.jsx,
      'mất một nhánh JSX ⇒ một nút biến khỏi màn hình mà tsc vẫn xanh');
  });
  test('33 loại thẻ khác nhau', () => {
    assert.equal(tomTat(NAY).soTheKhacNhau, tomTat(DONG_BANG).soTheKhacNhau);
  });
});

describe('hàm con trong thân', () => {
  test('23 hàm con, đúng tên', () => {
    assert.deepEqual(NAY.hamCon.map((h: any) => h.ten), DONG_BANG.hamCon.map((h: any) => h.ten));
  });
});

describe('ĐỐI CHỨNG DƯƠNG — thước có THẤY gì không, hay đang so hai cái rỗng', () => {
  test('ký hiệu KHÔNG rỗng ở cả bốn phần', () => {
    const t = tomTat(NAY);
    assert.ok(t.soMoc >= 68, `chỉ thấy ${t.soMoc} móc ⇒ bộ bóc có thể đang MÙ`);
    assert.ok(t.soNutJsx >= 200, `chỉ thấy ${t.soNutJsx} nút JSX ⇒ bộ bóc có thể đang MÙ`);
    assert.ok(t.soTrangThai >= 30 && t.soHamCon >= 20);
  });
});
