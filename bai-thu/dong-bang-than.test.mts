/**
 * 🧬 ĐÓNG BĂNG HÌNH DẠNG THÂN COMPONENT — bản v3.
 *
 * 🔄 ĐỔI SO VỚI v2: **vứt MÔ HÌNH GỘP PHẲNG, giữ nguyên bộ đo.**
 *    v2 sắp mọi thứ vào một rổ phẳng để «sống qua một lần chia», và bán đi toàn bộ QUAN HỆ.
 *    v3 mua đúng tính bất biến ấy bằng **KHOÁ THEO TÊN COMPONENT** — rẻ hơn, và không phải bán gì.
 *    ⇒ móc đi LIỀN mảng phụ thuộc của nó · thứ tự trong từng component được giữ ·
 *      biết móc nào THUỘC component nào.
 *
 * 🪝 Thứ tự móc có bài thử RIÊNG, sâu hơn: `dong-bang-thu-tu-moc.test.mts`.
 * ⚠️ VẪN LÀ HÌNH DẠNG, KHÔNG PHẢI HÀNH VI. Xem README.
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
const U = () => NAY.theoComponent.UngDung ?? { moc: [], trangThai: [], jsx: [], hamCon: [] };

describe('🔴 VẬT THỬ — ký hiệu phải SỐNG QUA một lần DỜI TỆP (đo bằng vật, không bằng lời hứa)', () => {
  /**
   * ⚠️ SỬA LẠI ĐIỀU VẬT THỬ NÀY CHỨNG MINH — v2 nói sai chỗ này.
   * v2 gọi cặp `truoc-khi-chia` → `sau-khi-chia-1/2` là «chia ĐÚNG» và đòi ký hiệu GIỐNG HỆT.
   * Nhưng cặp ấy KHÔNG phải dời tệp: nó BÓC hai móc từ `Man` sang một component MỚI `Nut`.
   * Đó là đổi ngữ nghĩa React thật (khác instance, khác vòng đời) — đòi nó «giống hệt» tức là
   * đòi bộ đo IM trước một thay đổi thật. v2 im được vì đã sắp phẳng, và tôi đã gọi đó là ĐẠT.
   * 📌 Một vật thử chứng minh sai điều thì nó vẫn xanh đều đặn, và nó dạy cả đội tin nhầm.
   * ⇒ v3 tách hai ca: DỜI TỆP (phải giống hệt) và BÓC TÁCH (phải khác, và phải GỌI TÊN).
   */
  const chot = (k: any) => JSON.stringify(k.theoComponent);
  test('DỜI TỆP thuần: 2 component 1 tệp → 2 tệp ⇒ ký hiệu GIỐNG HỆT', () => {
    const truoc = kyHieuGop([VT('moc-truoc.tsx')]);
    const sau = kyHieuGop([VT('moc-sau-1.tsx'), VT('moc-sau-2.tsx')]);
    assert.deepEqual(sau.component, truoc.component);
    assert.equal(sau.soTep, 2, 'vật thử phải thật sự nằm ở HAI tệp, không thì phép thử vô nghĩa');
    assert.equal(chot(sau), chot(truoc), 'ký hiệu đổi sau một lần dời tệp ⇒ bộ đo sẽ kêu oan mỗi lần chia');
  });
  test('BÓC TÁCH sang component mới ⇒ ký hiệu PHẢI KHÁC (đây là đổi ngữ nghĩa, không phải dời)', () => {
    const truoc = kyHieuGop([VT('truoc-khi-chia.tsx')]);
    const sau = kyHieuGop([VT('sau-khi-chia-1.tsx'), VT('sau-khi-chia-2.tsx')]);
    assert.notEqual(chot(sau), chot(truoc));
    assert.deepEqual(sau.component, ['Man', 'Nut'], 'phải THẤY component mới, không được nuốt nó vào rổ chung');
  });
  test('BÓC TÁCH mà LÀM RƠI ⇒ ký hiệu KHÁC (đối chứng âm gắn liền)', () => {
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

describe('hình dạng THEO TỪNG COMPONENT — so với bản đóng băng', () => {
  test('đủ component, đúng tên', () => assert.deepEqual(NAY.component, DONG_BANG.component));
  test('móc ĐI LIỀN mảng phụ thuộc của nó, đúng thứ tự', () =>
    assert.deepEqual(U().moc, DONG_BANG.theoComponent.UngDung.moc));
  test('trạng thái: tên + giá trị khởi tạo, đúng thứ tự', () =>
    assert.deepEqual(U().trangThai, DONG_BANG.theoComponent.UngDung.trangThai));
  test('cây JSX: thẻ + thuộc tính + GIÁ TRỊ + PHẦN CHỮ, đúng thứ tự', () =>
    assert.deepEqual(U().jsx, DONG_BANG.theoComponent.UngDung.jsx));
  test('hàm con: đủ tên, đúng thứ tự', () =>
    assert.deepEqual(U().hamCon, DONG_BANG.theoComponent.UngDung.hamCon));
});

describe('🔴 Q2 — ký hiệu phải mang PHẦN CHỮ, vì đó là thứ Owner ĐỌC', () => {
  /**
   * 🔴 NGƯỠNG HẠ TỪ 100 XUỐNG 80 — và phải nói rõ VÌ SAO, đừng để nó trông như nới cho dễ qua.
   * 🕳 Con số 106 tôi từng khai bị THỔI 28%: bộ bóc chữ chui vào JSX LỒNG bên trong biểu thức và
   *    nhặt luôn TÊN LỚP CSS làm «chữ hiển thị». 23 nút trong đó KHÔNG mang một chữ nào.
   * ⇒ 83 là con số SAU KHI phép đo được sửa cho ĐÚNG. Vùng phủ KHÔNG hề giảm; cái giảm là
   *    phần bịa. Ngưỡng ở đây chỉ làm ĐỐI CHỨNG DƯƠNG «bộ bóc có THẤY chữ không».
   */
  test('TỔNG chữ Owner ĐỌC = 82 — CẢ HAI VẾ tự đo, không vế nào gõ sẵn', () => {
    // 🔴 VERDICT VÒNG 2 ②: bản trước tôi viết `assert.equal(77 + bo.length, 82)`.
    //    Số 77 là tôi GÕ SẴN ⇒ phép đó KHÔNG hề đo phía JSX, nó chỉ cộng hằng số của tôi
    //    với một con số khác. Một phép đo mà một vế là hằng số thì nó đo ĐÚNG MỘT VẾ.
    // ✅ Nay CẢ HAI vế đọc từ hiện vật: JSX đếm từ cây cú pháp, nhãn đọc từ `hang-so.ts`.
    //    Xoá chữ ở BẤT KỲ vế nào cũng làm tổng tụt.
    const jsx = U().jsx.filter((x: string) => x.includes('«')).length;
    const nguonSo = fs.readFileSync(
      new URL('../src/components/ung-dung/hang-so.ts', import.meta.url), 'utf8');
    const khoiSo = nguonSo.slice(nguonSo.indexOf('const SO_BO_GHE'), nguonSo.indexOf('const LA_BO_DUNG_SAN'));
    const nhan = [...khoiSo.matchAll(/ten: '([^']+)'/g)].map((m) => m[1]);
    assert.ok(nhan.length > 0, 'KHÔNG bóc được nhãn nào từ SO_BO_GHE ⇒ phép này đang mù');
    assert.equal(jsx + nhan.length, 82,
      `tổng chữ Owner ĐỌC đổi (${jsx} JSX + ${nhan.length} nhãn = ${jsx + nhan.length} ≠ 82)`);
  });

  test('ĐÚNG 77 nút JSX mang chữ hiển thị THẬT — số ĐÓNG BĂNG, không phải sàn', () => {
    // 🔴 VERDICT vòng 1 bác cách vá cũ của tôi, và bác ĐÚNG.
    //    Tôi hạ sàn 80 → 75 rồi thêm một «phép bù» canh nhãn trong `SO_BO_GHE`.
    //    Người soi dựng ca hỏng: xoá HAI nút chữ KHÔNG thuộc sổ («Cơ cấu tổ chức», «Tỉ trọng
    //    nhân sự») ⇒ sàn 75 CHO QUA · phép bù CHO QUA · sàn 80 cũ thì BẮT ĐƯỢC.
    // 🔑 Phép bù canh chữ trong SỔ; phép này canh chữ trong JSX. **Hai thứ khác nhau — nó
    //    KHÔNG thay được, nó chỉ đứng cạnh.** Câu hỏi đúng KHÔNG phải «sàn bao nhiêu» mà
    //    «canh CÁI GÌ»: thứ phải canh là CHỮ OWNER ĐỌC, và nó KHÔNG được hụt đi.
    // ✅ Nên đây là bộ ĐÓNG BĂNG: chốt con số CHÍNH XÁC. Mất một nút chữ là ĐỎ ngay.
    //    Một cái sàn luôn chừa chỗ để rơi mà cổng vẫn xanh — 77 hơn sàn 75 đúng 2, tức
    //    ĐÚNG HAI nút được phép biến mất trong im lặng. Đóng băng thì con số 0.
    // 📌 Thêm chữ MỚI cũng đỏ — CỐ Ý: đổi số này phải là một hành động CÓ Ý THỨC, kèm lý do.
    const coChu = U().jsx.filter((x: string) => x.includes('«'));
    assert.equal(coChu.length, 77,
      `nút JSX mang chữ đổi (${coChu.length} ≠ 77) ⇒ có chữ vừa MẤT hoặc vừa THÊM, khai ra lý do`);
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
  test('ký hiệu KHÔNG rỗng ở cả bốn phần', () => {
    assert.ok(U().moc.length >= 68 && U().jsx.length >= 200);
    assert.ok(U().trangThai.length >= 30 && U().hamCon.length >= 20);
    assert.ok(U().moc.filter((m: string) => !m.endsWith('(∅)')).length >= 35, 'mất hết mảng phụ thuộc ⇒ thước đang mù một trục');
  });
  test('timComponent tìm được component trong tệp thật', () => {
    assert.ok(timComponent(NGUON[0]).length >= 1);
  });
});
