/**
 * 🧊 ĐÓNG BĂNG HÀNH VI — mô-đun THUẦN trong `src/lib/`.
 *
 * 🎯 Bốn mô-đun này KHÔNG nhập `node:*`, KHÔNG đọc đĩa, KHÔNG sinh tiến trình
 *    ⇒ nhập thẳng và chạy thật được, KHÔNG chạm phiên nào của Owner.
 * 📌 Chọn đúng bốn cái này vì chúng là thứ hai làn sẽ ĐỘNG TỚI khi tách back-end/front-end.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { HAN_FORK_MS, PHUT_FORK, moTaHanFork } from '../src/lib/han-gio-fork.ts';
import { SO_O, oTrongTam } from '../src/lib/so-o.ts';
import { dungMarkdown } from '../src/lib/dung-markdown.ts';

describe('han-gio-fork — NGUỒN DUY NHẤT của hạn fork', () => {
  test('180 giây, và ba chỗ hiển thị đọc từ đây', () => {
    assert.equal(HAN_FORK_MS, 180_000);
    assert.equal(PHUT_FORK, 3);
  });
  test('moTaHanFork nói PHÚT khi ≥60 giây', () => {
    assert.equal(moTaHanFork(), 'tới 3 phút');
  });
  test('phép làm tròn nằm MỘT CHỖ — đổi hằng số là câu chữ đổi theo', () => {
    // 🕳 Ca 02/09: máy khách gõ cứng «3 phút» ở HAI chỗ trong khi nguồn là số trần ở fork/route.ts.
    //    Cả ba khớp NHỜ MAY. Bài thử này là chỗ cái may đó thành một phép đo.
    assert.match(moTaHanFork(), /^tới \d+ (giây|phút)$/);
  });
});

describe('so-o — số ô của app', () => {
  test('SO_O là số nguyên dương', () => {
    assert.ok(Number.isInteger(SO_O) && SO_O > 0, `SO_O = ${SO_O}`);
  });
  test('oTrongTam nhận MÃ Ô (chuỗi), đếm từ 1', () => {
    // 🕳 Tôi viết bài thử này bằng cách ĐOÁN nó nhận chỉ số, và nó đỏ ngay.
    //    Mở mã ra: nó nhận `o-<số>`. Bài thử sai, mã đúng — sửa bài thử theo mã.
    assert.equal(oTrongTam('o-1'), true);
    assert.equal(oTrongTam('o-' + SO_O), true);
  });
  test('CHẶN ô ngoài tầm — ca 21/08 tin mất IM LẶNG', () => {
    // Ca thật: `o-9` nằm trong sổ, chuông gửi tới đó ⇒ cổng trả 200, trình duyệt KHÔNG bao giờ
    // nhặt, mẩu chết sau 180 giây ⇒ tin biến mất mà KHÔNG ai được báo.
    assert.equal(oTrongTam('o-9'), false, 'o-9 lọt lại ⇒ ca 21/08 quay về');
    assert.equal(oTrongTam('o-' + (SO_O + 1)), false, 'lệch một ô ở mép trên');
    assert.equal(oTrongTam('o-0'), false, 'đếm từ 1, o-0 KHÔNG hợp lệ');
  });
  test('TỪ CHỐI mọi dạng KHÔNG phải `o-<số>`', () => {
    for (const x of ['', 'o-', 'o-a', 'x-1', 'o-1a', ' o-1', 'o-1 ', 'O-1'])
      assert.equal(oTrongTam(x), false, `«${x}» lọt qua ⇒ mã ô rác được coi là hợp lệ`);
  });
});

describe('dung-markdown — chữ Owner ĐỌC', () => {
  test('in đậm', () => assert.match(dungMarkdown('**đậm**'), /<(strong|b)>/));
  test('mã trong dòng', () => assert.match(dungMarkdown('`ma`'), /<code>/));
  test('KHÔNG nuốt chữ thường', () => assert.match(dungMarkdown('xin chào'), /xin chào/));
  test('thẻ HTML thô bị VÔ HIỆU, không chạy được', () => {
    // 🕳 Sổ bẫy: viết thẻ kịch bản trần từng làm chết 98% một trang.
    const ra = dungMarkdown('<' + 'script>alert(1)</' + 'script>');
    assert.ok(!/<script>/i.test(ra), 'thẻ kịch bản đi thẳng ra HTML ⇒ chạy được mã lạ');
  });
});
