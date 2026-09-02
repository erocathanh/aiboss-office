/**
 * 🧊 ĐÓNG BĂNG HỢP ĐỒNG CỔNG — mọi `Response.json({…})` trong `src/app/api/`.
 *
 * 🎯 VÌ SAO TẦNG NÀY: chia tệp hay dời mã thì thứ mất IM LẶNG NHẤT là một KHOÁ trong phản hồi.
 *    `tsc` KHÔNG bắt được — máy khách đọc `j.giay_tu_ep` mà máy chủ thôi gửi thì nó thành
 *    `undefined`, và giao diện chỉ ÍT ĐI một câu chữ chứ KHÔNG nổ.
 * 🕳 Ca thật 02/09: máy khách gõ cứng «sau 10 giây» trong khi máy chủ đổi sang 90. Không ai thấy,
 *    vì cả hai bên vẫn chạy.
 *
 * 🔬 Đọc bằng CÂY CÚ PHÁP, KHÔNG gọi mạng, KHÔNG dựng máy chủ, KHÔNG chạm phiên thật.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import ts from './nap-typescript.mjs';
import fs from 'node:fs';
import path from 'node:path';

const GOC = process.env.GOC_API_THU ?? new URL('../src/app/api', import.meta.url).pathname;

/** Trả về mọi lời gọi Response.json: khoá đã sắp + mã trạng thái (0 = không khai ⇒ 200). */
function khoaCua(tep: string): Array<{ khoa: string[]; ma: number }> {
  const s = ts.createSourceFile(tep, fs.readFileSync(tep, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ra: Array<{ khoa: string[]; ma: number }> = [];
  (function di(n: any) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.name.text === 'json' && n.expression.expression.getText(s) === 'Response') {
      const a = n.arguments[0];
      if (a && ts.isObjectLiteralExpression(a))
      {
        const st = n.arguments[1];
        const ma = st ? Number((st.getText(s).match(/status:\s*(\d+)/) || [])[1] || 0) : 0;
        ra.push({ khoa: a.properties.map((p: any) => (p.name ? p.name.getText(s) : '…')).sort(), ma });
      }
    }
    ts.forEachChild(n, di);
  })(s);
  return ra;
}

function moiCua(): Record<string, Array<{ khoa: string[]; ma: number }>> {
  const ra: Record<string, Array<{ khoa: string[]; ma: number }>> = {};
  (function walk(d: string) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name === 'route.ts') ra[path.relative(GOC, p)] = khoaCua(p);
    }
  })(GOC);
  return ra;
}

const CUA = moiCua();

describe('số cửa và số chỗ trả JSON', () => {
  test('đúng 8 tệp route.ts — thêm/bớt cửa là đổi bề mặt của app', () => {
    assert.equal(Object.keys(CUA).length, 8, `nay có ${Object.keys(CUA).length} cửa: ${Object.keys(CUA).sort().join(', ')}`);
  });
});

describe('cửa DỪNG — nơi ba tuần vá dồn vào', () => {
  const c = CUA['dung/route.ts'];
  test('POST /api/dung giữ đủ SÁU khoá', () => {
    const co = c.find((x) => x.khoa.includes('da_giet'))?.khoa;
    assert.deepEqual(co, ['da_giet', 'giay_tu_ep', 'ma_nhan_su', 'pid', 'vi_sao', 'xong'].sort());
  });
  test('`giay_tu_ep` CÒN — mất nó là màn hình thôi biết ngưỡng ép', () => {
    assert.ok(c.some((x) => x.khoa.includes('giay_tu_ep')));
  });
  test('`vi_sao` CÒN — mất nó là nút Dừng thôi nói được vì sao KHÔNG dừng', () => {
    assert.ok(c.some((x) => x.khoa.includes('vi_sao')));
  });
  test('`pid` giữ TÊN CŨ ở dây mạng (đổi là gãy máy khách đang mở)', () => {
    assert.ok(c.some((x) => x.khoa.includes('pid')));
    assert.ok(!c.some((x) => x.khoa.includes('pid_de_hien_thi')), 'tên tầng TRONG rò ra dây mạng');
  });
  test('GET /api/dung giữ hai khoá đếm ô', () => {
    assert.ok(c.some((x) => x.khoa.join() === ['dang_chay', 'so_o_dang_chay'].sort().join()));
  });
});

describe('cửa ĐÁNH THỨC', () => {
  const c = CUA['danh-thuc/route.ts'];
  test('phản hồi xếp hàng giữ đủ khoá hạn giờ', () => {
    const co = c.find((x) => x.khoa.includes('con_lai_phut_nay'))?.khoa;
    assert.ok(co, 'mất khoá hạn ⇒ ghế gọi KHÔNG biết còn mấy lượt');
    for (const k of ['ma_o', 'ma_nhan_su', 'ma_yeu_cau', 'het_han_sau_giay', 'ghi_chu', 'xong'])
      assert.ok(co!.includes(k), `thiếu khoá ${k}`);
  });
  test('cửa NHẬN giữ năm khoá đối chứng', () => {
    const n = CUA['danh-thuc/nhan/route.ts'].find((x) => x.khoa.includes('nhan'))?.khoa;
    assert.deepEqual(n, ['ban_dung', 'da_giu', 'lech_ghe', 'nhan', 'thieu_khai'].sort());
  });
});

describe('mọi cửa đều báo lỗi bằng CÙNG MỘT khoá', () => {
  test('mọi phản hồi có MÃ LỖI đều mang khoá `loi`', () => {
    /**
     * 🕳 THƯỚC ĐẦU CỦA TÔI NỚI, và nó báo đỏ GIẢ: tôi hỏi «phản hồi MỘT KHOÁ nào không phải `loi`»
     *    ⇒ bắt luôn ba phản hồi THÀNH CÔNG `{o}` `{xong}` `{phien}` (không khai status ⇒ 200).
     * 🔑 Câu cần hỏi là «phản hồi có MÃ LỖI nào KHÔNG mang khoá `loi`», chứ không phải
     *    «phản hồi nào chỉ có một khoá». Lệch một chút, và lệch về phía KÊU OAN —
     *    mà một cái chuông kêu oan là một cái chuông sắp bị gỡ.
     */
    const la: string[] = [];
    for (const [tep, ds] of Object.entries(CUA))
      for (const k of ds)
        if (k.ma >= 400 && !k.khoa.includes('loi')) la.push(`${tep}: {${k.khoa.join(' ')}} status ${k.ma}`);
    assert.deepEqual(la, [], 'có cửa báo lỗi bằng khoá khác ⇒ máy khách bắt hụt');
  });
  test('ĐỐI CHỨNG DƯƠNG — thước NHÌN THẤY mã lỗi, không phải luôn trả mảng rỗng', () => {
    let coLoi = 0;
    for (const ds of Object.values(CUA)) for (const k of ds) if (k.ma >= 400) coLoi++;
    assert.ok(coLoi >= 20, `chỉ thấy ${coLoi} phản hồi mang mã lỗi ⇒ thước có thể đang MÙ`);
  });
});
