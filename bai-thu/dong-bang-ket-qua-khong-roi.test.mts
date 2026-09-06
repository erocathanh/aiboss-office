/**
 * 🧊 KẾT QUẢ CÓ THỂ HỎNG THÌ KHÔNG ĐƯỢC RƠI — thay `dong-bang-goi-ghi-o.test.mts` (đã xoá).
 *
 * 🔬 THƯỚC nằm ở `bai-thu/soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs`: nó đọc CÂY CÚ PHÁP
 *    cho danh sách tên trực tiếp được giao. Hợp đồng hẹp và giới hạn nằm trong tệp tài liệu cùng tên.
 *
 * ⚠️ CHỖ NÓ KHÔNG VỚI TỚI, nói ra để người sau khỏi tưởng đã kín:
 *    · hàm CÓ THỂ hỏng mà KHÔNG khai kiểu trả về thì nó khôngthấy (phép «≥4 hàm» chỉ chặn việc
 *      GỠ lời khai đã có, khôngchặn việc viết hàm mới mà khôngkhai từ đầu);
 *    · thước theo đích lưu bằng hình dạng cú pháp (`x`, `o.kq`, `o['kq']`) và lần truy cập kế tiếp;
 *      nó chưa giải bí danh hay định danh ký hiệu qua type-checker;
 *    · truyền kết quả làm tham số được tính là DÙNG vì nơi gọi đã chuyển giá trị đi. Muốn biết hàm
 *      nhận có tự vứt hay không phải phân tích xuyên hàm, nằm ngoài sức của thước cú pháp này.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chamNguon, docNguon, timHamCoKetQua, soiChoGoi } from './soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs';

const NGUON = new URL('../src/components/UngDung.tsx', import.meta.url).pathname;
const THUOC = new URL('./soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa.mjs', import.meta.url).pathname;

/* ── MẪU BIẾT SẴN ĐÁP ÁN — chạy MỖI lượt, gồm đủ bốn ca người soi đòi ────────────────────────
   🔑 Thiếu phần này thì màu xanh bên dưới vô nghĩa: một thước gán «DÙNG» cho mọi thứ cũng cho ra
      bảng xanh y hệt. Và nó phải canh CẢ HAI CHIỀU — bỏ lọt VÀ báo đỏ oan đều là hỏng. */
const MAU: { ma: string; mong: 'DUNG' | 'BO-QUA'; vi: string }[] = [
  // ① CHÍN kiểu vứt kết quả bằng ngoặc / vỏ bọc — cùng MỘT gốc, nên phải bịt cả họ
  { ma: 'f(1);', mong: 'BO-QUA', vi: 'lời gọi trần' },
  { ma: '(f(2));', mong: 'BO-QUA', vi: 'bọc một lớp ngoặc' },
  { ma: '((f(3)));', mong: 'BO-QUA', vi: 'bọc hai lớp' },
  { ma: 'await f(4);', mong: 'BO-QUA', vi: 'await trần' },
  { ma: '(await f(5));', mong: 'BO-QUA', vi: 'ngoặc bọc await — ca PAREN_DISCARD gốc' },
  { ma: '((await f(6)));', mong: 'BO-QUA', vi: 'hai lớp ngoặc bọc await' },
  { ma: 'void f(7);', mong: 'BO-QUA', vi: 'void' },
  { ma: 'void (await f(8));', mong: 'BO-QUA', vi: 'void + ngoặc + await' },
  { ma: '(await f(9))!;', mong: 'BO-QUA', vi: 'ngoặc + dấu chắc-chắn-khác-null' },
  // ② CÓ người nhận ⇒ phải XANH (chống BÁO ĐỎ OAN — lỗi vòng 2 của tôi)
  { ma: 'const a10 = await f(10); use(a10);', mong: 'DUNG', vi: 'gán rồi đọc' },
  { ma: 'if (!(await f(11))) use(0);', mong: 'DUNG', vi: 'dùng làm điều kiện' },
  { ma: 'use(12, await f(13));', mong: 'DUNG', vi: 'vị trí tham số' },
  { ma: 'const w14 = () => { return f(14); };', mong: 'DUNG', vi: 'trả về từ thân hàm' },
  { ma: 'const k15 = () => f(15);', mong: 'DUNG', vi: 'thân arrow rút gọn' },
  // ③ LỜI GỌI THẬT kiểu đặc biệt — cũng phải XANH, đây là chỗ vòng 2 bắt nhầm
  { ma: 'const o18 = await f?.(18); use(o18);', mong: 'DUNG', vi: 'lời gọi optional `f?.()`' },
  { ma: 'const g19 = f<boolean>(19); use(g19);', mong: 'DUNG', vi: 'lời gọi có tham số kiểu' },
  // ④ TRANH CHẤP `_bo` — xử bằng HÀNH VI, khôngbằng TÊN. Cả hai chiều đều phải đúng.
  { ma: 'const _bo16 = await f(16); use(_bo16);', mong: 'DUNG', vi: '`_bo` CÓ được đọc ⇒ khôngđược báo đỏ' },
  { ma: 'const _bo17 = await f(17);', mong: 'BO-QUA', vi: '`_bo` KHÔNG ai đọc ⇒ phải bắt' },
  // ⑤ BA PHẢN VÍ DỤ PHÂN LOẠI của verdict vòng 3 — việc ㉒ phải giữ chúng sống trong bộ mẫu
  { ma: 'const hop20: { kq?: boolean } = {}; hop20.kq = await f(20); use(hop20.kq);',
    mong: 'DUNG', vi: 'gán thuộc tính rồi đọc thuộc tính' },
  { ma: 'if (!(Boolean(true), await f(21))) use(21);',
    mong: 'DUNG', vi: 'vế phải dấu phẩy mang giá trị ra điều kiện' },
  { ma: 'let biGhiDe22: boolean; biGhiDe22 = await f(22); biGhiDe22 = false; use(biGhiDe22);',
    mong: 'BO-QUA', vi: 'giá trị bị ghi đè trước lần đọc đầu tiên' },
];

test('🔴 thước phân loại đúng toàn bộ mẫu đã biết đáp án — sai một ca phải ĐỎ', () => {
  const ma = ['const f = async (n: number): Promise<boolean> => n > 0;',
    'declare function use(...a: unknown[]): void;', ...MAU.map((x) => x.ma)].join('\n');
  const ten = timHamCoKetQua(docNguon(ma));
  const cho = soiChoGoi(ma, ten);
  const sai = cho.map((c, k) => ({ ...MAU[k], duoc: c.cach })).filter((x) => x.duoc !== x.mong);
  assert.equal(cho.length, MAU.length, `mong ${MAU.length} lời gọi, thước chỉ thấy ${cho.length}`);
  assert.deepEqual(sai, [], `thước phân loại sai:\n${sai.map((x) =>
    `  «${x.ma}» mong ${x.mong} · được ${x.duoc} (${x.vi})`).join('\n')}`);
});

test('🔴 HỒI QUY ㉒ — gán vào THUỘC TÍNH `.` / `[]` rồi đọc thuộc tính ⇒ DUNG', () => {
  const ma = [
    'const hopCham: { ketQua?: boolean } = {}; hopCham.ketQua = f(); use(hopCham.ketQua);',
    "const hopNgoac: { ketQua?: boolean } = {}; hopNgoac['ketQua'] = f(); use(hopNgoac.ketQua);",
  ].join('\n');
  assert.deepEqual(soiChoGoi(ma, ['f']).map((x) => x.cach), ['DUNG', 'DUNG']);
});

test('🔴 HỒI QUY ㉒ — vế phải dấu phẩy mang giá trị ra ngoài, không đệ quy lại lời gọi', () => {
  const ma = 'if (!(Boolean(true), f())) use();';
  assert.deepEqual(soiChoGoi(ma, ['f']).map((x) => x.cach), ['DUNG']);
});

test('🔴 HỒI QUY ㉒ — ghi đè trước lần đọc đầu tiên ⇒ BO-QUA', () => {
  const ma = 'let ketQua: boolean; ketQua = f(); ketQua = false; use(ketQua);';
  assert.deepEqual(soiChoGoi(ma, ['f']).map((x) => x.cach), ['BO-QUA']);
});

function chayThuoc(noiDung: string | Buffer, tenTep = 'vat-thu.tsx') {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'soi-loi-goi-ten-truc-tiep-'));
  const tep = path.join(thuMuc, tenTep);
  try {
    fs.writeFileSync(tep, noiDung);
    const kq = spawnSync(process.execPath, [THUOC, tep, 'f'], { encoding: 'utf8' });
    return { ma: kq.status, loiRa: `${kq.stdout}${kq.stderr}` };
  } finally {
    fs.rmSync(thuMuc, { recursive: true, force: true });
  }
}

/** Mỗi hồi quy phải tự chứng minh bàn đo phân biệt được một tệp lành với một tệp bỏ kết quả. */
function doiChungLanhVaHong(tenTep = 'vat-thu.tsx', dau = '', duoi = '') {
  const lanh = chayThuoc(`${dau}consume(f());${duoi}`, tenTep);
  const hong = chayThuoc(`${dau}f();${duoi}`, tenTep);
  assert.equal(lanh.ma, 0, `đối chứng LÀNH không ĐẠT:\n${lanh.loiRa}`);
  assert.match(lanh.loiRa, /^ĐẠT\b/m);
  assert.equal(hong.ma, 1, `đối chứng bỏ kết quả không ĐỎ đúng tên:\n${hong.loiRa}`);
  assert.match(hong.loiRa, /^KHÔNG ĐẠT\b/m);
  assert.notEqual(lanh.ma, hong.ma, 'bàn đo trả cùng kết quả cho tệp lành và tệp hỏng');
  return { lanh, hong };
}

test('🔴 VÒNG 2 CA 1 — consume nhận giá trị của phép gán thuộc tính ⇒ ĐẠT', () => {
  const { lanh, hong } = doiChungLanhVaHong();
  const kq = chayThuoc('const box = { value: false }; consume(box.value = f());');
  assert.equal(kq.ma, 0, kq.loiRa);
  assert.equal(kq.ma, lanh.ma);
  assert.notEqual(kq.ma, hong.ma);
  assert.match(kq.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.match(kq.loiRa, /\[f\] DUNG\b/);
});

test('🔴 VÒNG 2 CA 2 — vế phải đọc giá trị cũ trước khi vế trái ghi lại ⇒ ĐẠT', () => {
  const { lanh, hong } = doiChungLanhVaHong();
  const kq = chayThuoc('let answer = f(); answer = answer + 1; consume(answer);');
  assert.equal(kq.ma, 0, kq.loiRa);
  assert.equal(kq.ma, lanh.ma);
  assert.notEqual(kq.ma, hong.ma);
  assert.match(kq.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.match(kq.loiRa, /\[f\] DUNG\b/);
});

test('🔴 VÒNG 2 CA 3 — ghi đè đối tượng cha làm rơi giá trị thuộc tính ⇒ KHÔNG ĐẠT', () => {
  const { lanh, hong } = doiChungLanhVaHong();
  const kq = chayThuoc('let box = { value: 0 }; box.value = f(); box = { value: 9 }; consume(box.value);');
  assert.equal(kq.ma, 1, kq.loiRa);
  assert.equal(kq.ma, hong.ma);
  assert.notEqual(kq.ma, lanh.ma);
  assert.match(kq.loiRa, /^KHÔNG ĐẠT · 1 lời gọi$/m);
  assert.match(kq.loiRa, /\[f\] BO-QUA\b/);
});

test('🔴 VÒNG 2 CA 4 — đích chưa theo dõi được không được xoá lỗi BO-QUA đã biết', () => {
  const { lanh, hong } = doiChungLanhVaHong();
  const ma = 'f(); getBox().value = f();';
  const api = chamNguon(ma, ['f'], 'vat-thu.tsx');
  assert.equal(api.trangThai, 'KHÔNG ĐẠT');
  assert.equal(api.cho.length, 2, JSON.stringify(api));
  assert.equal(api.cho[0]?.cach, 'BO-QUA');
  assert.equal(api.cho[1]?.cach, 'KHONG-DO-DUOC');
  assert.ok(api.loi.length >= 1, 'phải giữ cả lý do của phần chưa đo được');

  const kq = chayThuoc(ma);
  assert.equal(kq.ma, 1, kq.loiRa);
  assert.equal(kq.ma, hong.ma);
  assert.notEqual(kq.ma, lanh.ma);
  assert.match(kq.loiRa, /^KHÔNG ĐẠT · 2 lời gọi$/m);
  assert.match(kq.loiRa, /\[f\] BO-QUA\b/);
  assert.match(kq.loiRa, /\[f\] KHONG-DO-DUOC\b/);
});

test('🔴 VÒNG 2 CA 5 — nguồn .ts giữ ScriptKind.TS qua soiChoGoi và generic arrow vẫn đo được', () => {
  const dau = 'const identity = <T>(x: T) => x; ';
  const { lanh, hong } = doiChungLanhVaHong('vat-thu.ts', dau);
  const ma = `${dau}f();`;
  assert.deepEqual(soiChoGoi(ma, ['f'], 'vat-thu.ts').map((x) => x.cach), ['BO-QUA']);

  const kq = chayThuoc(ma, 'vat-thu.ts');
  assert.equal(kq.ma, 1, kq.loiRa);
  assert.equal(kq.ma, hong.ma);
  assert.notEqual(kq.ma, lanh.ma);
  assert.match(kq.loiRa, /^KHÔNG ĐẠT · 1 lời gọi$/m);
  assert.doesNotMatch(kq.loiRa, /KHÔNG ĐO ĐƯỢC/);
});

test('🔴 VÒNG 2 CA 6 — form feed là khoảng trắng hợp lệ, không phải dữ liệu nhị phân', () => {
  const { lanh, hong } = doiChungLanhVaHong('vat-thu.ts', '', '\f');
  const kq = chayThuoc('f();\f', 'vat-thu.ts');
  assert.equal(kq.ma, 1, kq.loiRa);
  assert.equal(kq.ma, hong.ma);
  assert.notEqual(kq.ma, lanh.ma);
  assert.match(kq.loiRa, /^KHÔNG ĐẠT · 1 lời gọi$/m);
  assert.doesNotMatch(kq.loiRa, /NHỊ PHÂN|KHÔNG ĐO ĐƯỢC/);
});

test('🔴 VÒNG 3 CA 1 — ký tự lạ hợp lệ trong chú thích, chuỗi và template không được che BO-QUA', () => {
  const mau = [
    { vi: 'chú thích', dau: `/*${String.fromCharCode(1)}*/ ` },
    { vi: 'chuỗi', dau: `const chuoi = "${String.fromCharCode(2)}"; ` },
    { vi: 'template', dau: `const mau = \`${String.fromCharCode(3)}\`; ` },
  ];
  for (const { vi, dau } of mau) {
    const lanh = chayThuoc(`${dau}consume(f());`, 'vat-thu.ts');
    const hong = chayThuoc(`${dau}f();`, 'vat-thu.ts');

    assert.equal(lanh.ma, 0, `đối chứng LÀNH có ký tự lạ trong ${vi} không ĐẠT:\n${lanh.loiRa}`);
    assert.match(lanh.loiRa, /^ĐẠT · 1 lời gọi$/m);
    assert.equal(hong.ma, 1, `nguồn hợp lệ bỏ kết quả sau ${vi} không ĐỎ đúng tên:\n${hong.loiRa}`);
    assert.match(hong.loiRa, /^KHÔNG ĐẠT · 1 lời gọi$/m);
    assert.match(hong.loiRa, /\[f\] BO-QUA\b/);
    assert.doesNotMatch(`${lanh.loiRa}${hong.loiRa}`, /NHỊ PHÂN|KHÔNG ĐO ĐƯỢC/);
    assert.notEqual(lanh.ma, hong.ma, `bàn đo trả cùng kết quả cho nguồn lành và nguồn hỏng sau ${vi}`);
  }
});

test('🔴 VÒNG 3 CA 2 — ngoặc quanh callee không được làm mất lời gọi BO-QUA trong ca hỗn hợp', () => {
  const lanh = chayThuoc('consume(f()); consume((f)());', 'vat-thu.ts');
  const hong = chayThuoc('consume(f()); (f)();', 'vat-thu.ts');

  assert.equal(lanh.ma, 0, `đối chứng LÀNH có cùng callee bọc ngoặc không ĐẠT:\n${lanh.loiRa}`);
  assert.match(lanh.loiRa, /^ĐẠT · 2 lời gọi$/m);
  assert.equal(lanh.loiRa.match(/\[f\] DUNG\b/g)?.length, 2, lanh.loiRa);
  assert.equal(hong.ma, 1, `ca hỗn hợp có lời gọi bỏ kết quả không ĐỎ đúng tên:\n${hong.loiRa}`);
  assert.match(hong.loiRa, /^KHÔNG ĐẠT · 2 lời gọi$/m);
  assert.equal(hong.loiRa.match(/\[f\] DUNG\b/g)?.length, 1, hong.loiRa);
  assert.equal(hong.loiRa.match(/\[f\] BO-QUA\b/g)?.length, 1, hong.loiRa);
  assert.notEqual(lanh.ma, hong.ma, 'bàn đo trả cùng kết quả cho nguồn lành và nguồn hỗn hợp hỏng');
});

test('🔴 BA TRẠNG THÁI — mã đo được và có người đọc ⇒ ĐẠT, mã đo được nhưng bỏ kết quả ⇒ KHÔNG ĐẠT', () => {
  const dat = chayThuoc('declare function f(): boolean; use(f());');
  assert.equal(dat.ma, 0, dat.loiRa);
  assert.match(dat.loiRa, /^ĐẠT\b/m);

  const khongDat = chayThuoc('declare function f(): boolean; f();');
  assert.equal(khongDat.ma, 1, khongDat.loiRa);
  assert.match(khongDat.loiRa, /^KHÔNG ĐẠT\b/m);
});

test('🔴 BA TRẠNG THÁI — tệp VỠ CÚ PHÁP ⇒ KHÔNG ĐO ĐƯỢC và cổng ĐỎ', () => {
  const kq = chayThuoc('declare function f(): boolean; use(f()); const reviewerBroken = ;');
  assert.equal(kq.ma, 2, kq.loiRa);
  assert.match(kq.loiRa, /^KHÔNG ĐO ĐƯỢC\b/m);
});

test('🔴 BA TRẠNG THÁI — tệp RỖNG ⇒ KHÔNG ĐO ĐƯỢC và cổng ĐỎ', () => {
  const kq = chayThuoc('');
  assert.equal(kq.ma, 2, kq.loiRa);
  assert.match(kq.loiRa, /^KHÔNG ĐO ĐƯỢC\b/m);
});

test('🔴 BA TRẠNG THÁI — tệp NHỊ PHÂN ⇒ KHÔNG ĐO ĐƯỢC và cổng ĐỎ', () => {
  const kq = chayThuoc(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x01]));
  assert.equal(kq.ma, 2, kq.loiRa);
  assert.match(kq.loiRa, /^KHÔNG ĐO ĐƯỢC\b/m);
});

test('🔴 tìm được ÍT NHẤT bốn hàm có kết quả — gỡ lời khai để né thước là ĐỎ', () => {
  const ds = timHamCoKetQua(docNguon(fs.readFileSync(NGUON, 'utf8')));
  assert.ok(ds.length >= 4, `chỉ tìm được ${ds.length}: ${ds.join(', ')}`);
  for (const phai of ['datNguoi', 'dongO', 'ghiO', 'napLichSu']) {
    assert.ok(ds.includes(phai), `${phai} khôngcòn khai kiểu trả về ⇒ nó tàng hình với bộ đo này`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 📒 ĐỐI CHIẾU VỚI BỘ CŨ `dong-bang-goi-ghi-o.test.mts` (đã xoá) — GIỮ / CHUYỂN / BỎ
 *
 *  ① «khôngchỗ gọi ghiO nào nuốt lỗi»          → CHUYỂN, và MỞ RỘNG: bảng dưới canh CẢ 6 hàm
 *                                                  tự tìm được, khôngchỉ `ghiO`.
 *  ② «đối chứng dương trên bản sao TRƯỚC vòng 3» → CHUYỂN: nay là mẫu-biết-sẵn-đáp-án chạy MỖI
 *                                                  lượt, khôngphụ thuộc một tệp sao lưu NGOÀI kho
 *                                                  (tệp đó mất là phép kiểm im lặng mất theo).
 *  ③ «bảng chỗ gọi ĐẦY ĐỦ, đếm cả loại DÙNG»    → GIỮ. 🔴 ĐÂY LÀ THỨ BẢN VÒNG 1 CỦA TÔI ĐÁNH RƠI:
 *                                                  tôi chỉ đóng băng phía BỎ-QUA, nên XOÁ HẲN một
 *                                                  lời gọi đang được kiểm thì bảng khôngđổi ⇒ xanh.
 *  ④ «mọi lối ra của datNguoi phải trả về giá trị» → GIỮ, và siết thêm: phải đi qua `baoHong`.
 *  ⇒ khôngbảo đảm nào BỊ BỎ.
 *
 * 🔑 Bài học ghi lại cho người sau: **một bộ đo THAY một bộ đo khác thì phải đối chiếu từng bảo
 *    đảm, khôngphải chỉ đếm xem bộ mới có nhiều phép hơn không.** Bộ mới của tôi có 4 phép y như
 *    bộ cũ, xanh hết, mà yếu hơn ở hai ca — và cả hai ca ấy đều là ca THẬT.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/** 📌 BẢNG ĐÓNG BĂNG ĐẦY ĐỦ: từng hàm × từng cách xử lý. Đổi bất kỳ ô nào ⇒ ĐỎ.
 *  · thêm chỗ gọi BỎ-QUA mới        ⇒ số BỎ-QUA tăng   ⇒ ĐỎ
 *  · đổi một chỗ DÙNG thành bỏ qua  ⇒ hai số cùng đổi  ⇒ ĐỎ
 *  · XOÁ HẲN một lời gọi đang dùng  ⇒ số DÙNG giảm     ⇒ ĐỎ   ← ca bản trước để lọt
 *
 *  ── LÝ DO cho 7 chỗ BỎ-QUA, khôngphải «vì nó đang thế» ──────────────────────────────────
 *  ghiO ×2 · napDsPhien ×1 · napLichSu ×1  ⇒ vòng KHÔI PHỤC lúc mở app: chạy cho cả 6 ô, hỏng
 *     một ô khôngđược chặn 5 ô kia; và Owner CHƯA BẤM GÌ nên chưa có thao tác nào để báo hỏng.
 *  napDsPhien ×3  ⇒ LÀM MỚI danh sách phiên chạy nền, sau khi việc chính đã xong VÀ đã báo.
 *  🔑 Ranh giới gói trong một câu: **có người vừa BẤM để chờ kết quả này không.**
 */
const BANG = {
  DUNG: { datNguoi: 3, docLichSu: 4, dongO: 1, ghiO: 7, napDsPhien: 1, napLichSu: 4 },
  'BO-QUA': { ghiO: 2, napDsPhien: 4, napLichSu: 1 },
};

test('🔴 BẢNG CHỖ GỌI ĐẦY ĐỦ — thêm, đổi, hay XOÁ một lời gọi đều phải ĐỎ', () => {
  const ma = fs.readFileSync(NGUON, 'utf8');
  const cho = soiChoGoi(ma, timHamCoKetQua(docNguon(ma)));
  const dem: Record<string, Record<string, number>> = {};
  for (const c of cho) { (dem[c.cach] ??= {}); dem[c.cach][c.ten] = (dem[c.cach][c.ten] ?? 0) + 1; }
  const sapXep = (o: Record<string, Record<string, number>>) => Object.fromEntries(
    Object.entries(o).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))]));
  assert.deepEqual(sapXep(dem), sapXep(BANG),
    `bảng chỗ gọi đã đổi. ĐỪNG sửa số cho vừa — hỏi trước «chỗ nào mất, chỗ nào thêm»:\n${
      cho.map((x) => `  dòng ${x.dong} [${x.ten}] ${x.cach} · ${x.van}`).join('\n')}`);
});

test('🔴 MỌI lối ra của datNguoi phải TRẢ VỀ giá trị, và đi qua MỘT cửa báo hỏng', () => {
  const ma = fs.readFileSync(NGUON, 'utf8');
  const dau = ma.indexOf('const datNguoi = useCallback(');
  const cuoi = ma.indexOf('}, [baoHong, boCuc, capNhat, datTieuDiem, ghiO, huyLuong, napDsPhien, napLichSu]);');
  assert.ok(dau > 0 && cuoi > dau, 'khôngkhoanh được thân datNguoi');
  const than = ma.slice(dau, cuoi).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal([...than.matchAll(/\breturn\s*;/g)].length, 0, 'còn «return;» trơn — lối đó ngầm thành THÀNH CÔNG');
  assert.ok(/: Promise<KetQuaDatNguoi>/.test(than.slice(0, 300)), 'datNguoi phải KHAI kiểu trả về');
  const hong = [...than.matchAll(/return\s+\{\s*xong:\s*false,\s*hong:/g)].length;
  assert.equal(hong, 0, `còn ${hong} lối trả HỎNG mà KHÔNG qua baoHong ⇒ ô đó im lặng với người dùng`);
  assert.ok([...than.matchAll(/return\s+baoHong\(/g)].length >= 3, 'phải có ≥3 lối hỏng đi qua baoHong');
});
