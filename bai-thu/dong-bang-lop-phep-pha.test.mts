/**
 * 🏷 BÀI THỬ CHO CHÍNH CỔNG «PHÉP PHÁ CÓ ĐÚNG TÊN KHÔNG».
 *
 * 🕳 Cổng này sinh ra vì BA phép phá trong một hộp 16 phép đang làm việc KHÁC với tên chúng mang,
 *    và cả ba lọt qua hai vòng soi. Nhưng chính cổng ấy, nếu chỉ được BIỂU DIỄN MỘT LẦN bằng tay
 *    rồi thôi, thì nó cũng sẽ mục đúng như thứ nó canh.
 * 📌 **Một phép kiểm chỉ chạy đúng một lần, vào ngày người ta hào hứng nhất, là một giai thoại —
 *    không phải một cái cổng.**
 *
 * Ba ca dưới đây là BA SAI LỆCH CÓ THẬT (reviewer R0 nêu đủ số dòng, 03/09). Chúng ở đây để
 * KHÔNG ai dựng lại được chúng mà cổng vẫn im.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doHinh, kiemLop, BANG_LOP } from './lop-phep-pha.mjs';

const GOC = new URL('../src/components/UngDung.tsx', import.meta.url).pathname;
let thuMuc: string;
const g = () => doHinh(GOC);

/** Dựng một bản chép ĐÃ PHÁ trong thư mục tạm. KHÔNG chạm `src/`, KHÔNG chạm `bai-thu/`. */
function pha(cu: string, moi: string): string {
  const s = fs.readFileSync(GOC, 'utf8');
  assert.equal(s.split(cu).length - 1, 1, `neo phải DUY NHẤT: ${cu.slice(0, 50)}`);
  const p = path.join(thuMuc, `pha-${Math.random().toString(36).slice(2)}.tsx`);
  fs.writeFileSync(p, s.replace(cu, moi));
  return p;
}

before(() => { thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'lop-phep-pha-')); });
after(() => fs.rmSync(thuMuc, { recursive: true, force: true }));

describe('🔴 BA SAI LỆCH CÓ THẬT — cổng phải BẮT khi khai theo tên CŨ, và CHO QUA khi khai đúng lớp', () => {
  const ca = [
    { ten: '① xoá trống className (tên cũ nói «MẤT một nhánh JSX»)',
      cu: 'className="khoi-fork"', moi: 'className=""',
      sai: 'xoa-nut-jsx', dung: 'doi-thuoc-tinh-jsx' },
    { ten: '② xoá một móc (tên cũ nói «ĐỔI THỨ TỰ móc»)',
      cu: "const [tuKhoa, datTuKhoa] = useState('');", moi: '',
      sai: 'hoan-vi-moc', dung: 'xoa-moc' },
    { ten: '③ thêm sai phần tử phụ thuộc (tên cũ nói «BỎ SÓT móc bí danh»)',
      cu: '}, [toanMan]);', moi: '}, [toanMan, dsO]);',
      sai: 'xoa-moc', dung: 'doi-phu-thuoc' },
  ];
  for (const c of ca) {
    test(`${c.ten} ⇒ khai «${c.sai}» phải BỊ CHẶN`, () => {
      const kq = kiemLop(g(), doHinh(pha(c.cu, c.moi)), c.sai);
      assert.equal(kq.dat, false, `cổng CHO QUA một nhãn sai ⇒ nó KHÔNG canh được thứ nó sinh ra để canh`);
      assert.match(kq.vi, /delta THẬT là/);
    });
    test(`${c.ten} ⇒ khai «${c.dung}» phải QUA`, () => {
      const kq = kiemLop(g(), doHinh(pha(c.cu, c.moi)), c.dung);
      assert.equal(kq.dat, true, kq.vi);
    });
  }
});

describe('🔴 BẢNG SỰ THẬT 2×2 — hai lớp JSX phải tách bạch CẢ HAI CHIỀU', () => {
  /**
   * ⚠️ Chiều thứ hai mới là chiều đắt. Bộ bóc chữ đời đầu chui vào JSX LỒNG và nhặt cả TÊN LỚP CSS
   *    làm «chữ hiển thị» ⇒ đổi className cũng làm trục CHỮ đổi theo ⇒ hai lớp KHÔNG phân biệt được,
   *    mà nhìn từ chiều thuận thì vẫn thấy «đúng».
   * 📌 Một phép so chỉ tự chứng được MỘT chiều thì nó bảo vệ đúng những người đã làm đúng.
   */
  const doiThuocTinh = () => pha('className="khoi-fork"', 'className=""');
  const doiChu = () => pha('🧬 Fork về ghế này', '🧬 Fork sang ghế này');
  test('đổi THUỘC TÍNH · khai doi-thuoc-tinh-jsx ⇒ QUA', () =>
    assert.equal(kiemLop(g(), doHinh(doiThuocTinh()), 'doi-thuoc-tinh-jsx').dat, true));
  test('đổi THUỘC TÍNH · khai doi-chu-jsx        ⇒ CHẶN', () =>
    assert.equal(kiemLop(g(), doHinh(doiThuocTinh()), 'doi-chu-jsx').dat, false));
  test('đổi CHỮ       · khai doi-chu-jsx        ⇒ QUA', () =>
    assert.equal(kiemLop(g(), doHinh(doiChu()), 'doi-chu-jsx').dat, true));
  test('đổi CHỮ       · khai doi-thuoc-tinh-jsx ⇒ CHẶN', () =>
    assert.equal(kiemLop(g(), doHinh(doiChu()), 'doi-thuoc-tinh-jsx').dat, false));
});

describe('🔴 cổng phải TỪ CHỐI hai ca im lặng nguy nhất', () => {
  test('lớp LẠ ⇒ TỪ CHỐI, không cho trôi qua', () => {
    const kq = kiemLop(g(), doHinh(pha('className="khoi-fork"', 'className=""')), 'lop-bia-ra');
    assert.equal(kq.dat, false);
    assert.match(kq.vi, /lớp lạ/);
  });
  test('neo TRƯỢT (tệp KHÔNG đổi gì) ⇒ TỪ CHỐI, đừng khen một phép phá chưa phá được gì', () => {
    const p = path.join(thuMuc, 'y-het.tsx');
    fs.copyFileSync(GOC, p);
    const kq = kiemLop(g(), doHinh(p), 'doi-thuoc-tinh-jsx');
    assert.equal(kq.dat, false);
    assert.match(kq.vi, /KHÔNG đổi được gì/);
  });
});

describe('ĐỐI CHỨNG DƯƠNG — bảng lớp có thật, và mỗi lớp phải có ĐỊNH NGHĨA chạy được', () => {
  test('đủ 9 lớp, mỗi lớp có mô tả và một hàm kiểm', () => {
    const ten = Object.keys(BANG_LOP);
    assert.ok(ten.length >= 9, `chỉ ${ten.length} lớp`);
    for (const t of ten) {
      assert.equal(typeof BANG_LOP[t].phai, 'function', `lớp ${t} thiếu hàm kiểm ⇒ nó là lời hứa, không phải cơ chế`);
      assert.ok(BANG_LOP[t].ta.length > 5, `lớp ${t} thiếu mô tả`);
    }
  });
});
