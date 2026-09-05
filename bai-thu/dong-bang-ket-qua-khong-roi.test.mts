/**
 * 🧊 KẾT QUẢ CÓ THỂ HỎNG THÌ KHÔNG ĐƯỢC RƠI — thay `dong-bang-goi-ghi-o.test.mts` (đã xoá).
 *
 * 🔬 THƯỚC nằm ở `bai-thu/soi-ket-qua.mjs`: nó đọc CÂY CÚ PHÁP, khôngđọc chuỗi, khôngđọc TÊN.
 *    Ba đời thước trước đều XANH mà đều sai — lịch sử ghi trong tệp đó, đọc trước khi sửa.
 *
 * ⚠️ CHỖ NÓ KHÔNG VỚI TỚI, nói ra để người sau khỏi tưởng đã kín:
 *    · hàm CÓ THỂ hỏng mà KHÔNG khai kiểu trả về thì nó khôngthấy (phép «≥4 hàm» chỉ chặn việc
 *      GỠ lời khai đã có, khôngchặn việc viết hàm mới mà khôngkhai từ đầu);
 *    · `duocDoc` hỏi «cái tên này có chỗ nào đọc không» trên TOÀN TỆP, khôngphân tích phạm vi —
 *      hai biến trùng tên ở hai hàm khác nhau sẽ được coi là một. Đổi lấy: khôngcần chương trình
 *      hoá kiểu (type-checker), chạy nhanh, và sai về phía DUNG (báo thiếu, khôngbáo oan).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
/* 🔴🔴🔴 THƯỚC `soi-ket-qua.mjs` ĐANG HỎNG — bị bác ở verdict 20260905_173533_d01eab (05/09/2026).
   Nó báo ĐỎ OAN mã đúng, VÀ báo XANH cho tệp vỡ cú pháp. KHÔNG được coi màu xanh của nó là bằng
   chứng. Theo QUYẾT ĐỊNH 🅒 của Owner 18:30 cùng ngày, phần PHÂN LOẠI của nó đã HẠ xuống mức
   BÁO-CÁO trong tệp này — xem phép đầu tiên bên dưới, nó IN ra chứ khônglàm bộ chạy đỏ.
   Sửa tử tế ở việc ㉒: `ai/ban-giao/2026-09-05_thuoc-ast-ba-trang-thai.md`. 🔴🔴🔴 */
import { docNguon, loiCuPhap, timHamCoKetQua, soiChoGoi } from './soi-ket-qua.mjs';

const NGUON = new URL('../src/components/UngDung.tsx', import.meta.url).pathname;

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
];

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * 📋 BÁO CÁO — KHÔNG PHẢI CỔNG (hạ cấp theo QUYẾT ĐỊNH 🅒 của Owner, 05/09/2026 18:30)
 *
 * 🕳 Phép này TRƯỚC ĐÂY là cổng: nó khẳng định thước phân loại ĐÚNG trên 18 mẫu. Nhưng người soi
 *    chứng minh thước sai ở BỐN ca mà 18 mẫu này khôngchạm tới. Giữ nó làm cổng nghĩa là **cấp
 *    giấy chứng nhận đúng cho một cái thước đã biết là sai** — tệ hơn khôngcó cổng, vì cả nhà tin
 *    rằng chỗ này đang được canh.
 * ⇒ Nay nó CHỈ IN RA. Nó KHÔNG bao giờ làm bộ chạy đỏ, kể cả khi thước trả lời sai hết.
 * 🔑 Đọc con số nó in như đọc một lời khai của bị can, khôngphải như đọc một biên bản giám định.
 * ══════════════════════════════════════════════════════════════════════════════════════════ */
test('📋 BÁO CÁO (KHÔNG phải cổng) — thước phân loại tự khai, đúng sai đều KHÔNG chặn', () => {
  const ma = ['const f = async (n: number): Promise<boolean> => n > 0;',
    'declare function use(...a: unknown[]): void;', ...MAU.map((x) => x.ma)].join('\n');
  const src = docNguon(ma);
  const noi = (t: string) => console.log(`      ${t}`);

  const loiMau = loiCuPhap(src);
  const nguonThat = docNguon(fs.readFileSync(NGUON, 'utf8'), 'UngDung.tsx');
  const loiThat = loiCuPhap(nguonThat);
  noi(`lỗi cú pháp — mẫu: ${loiMau.length} · nguồn thật: ${loiThat.length}`);
  if (loiThat.length) {
    noi('🔴 NGUỒN THẬT VỠ CÚ PHÁP — mọi bảng dưới đây dựng trên một CÂY THIẾU, đừng tin:');
    for (const l of loiThat.slice(0, 5)) noi(`   ${l}`);
  }

  const ten = timHamCoKetQua(src);
  const cho = soiChoGoi(ma, ten);
  const sai = cho.map((c, k) => ({ ...MAU[k], duoc: c.cach })).filter((x) => x.duoc !== x.mong);
  noi(`mẫu ${MAU.length} ca · thước trả lời sai ${sai.length} ca`);
  for (const x of sai) noi(`   🔴 «${x.ma}» mong ${x.mong} · được ${x.duoc}  (${x.vi})`);
  if (sai.length === 0) {
    noi('✔ đúng cả 18 ca MẪU — nhưng ĐÂY KHÔNG PHẢI BẰNG CHỨNG thước lành:');
    noi('  người soi đã chỉ BỐN ca sai mà bộ mẫu này KHÔNG chạm tới (verdict 20260905_173533_d01eab).');
  }
  noi('⇒ phép này KHÔNG chặn gì cả. Cổng cứng là ba phép bên dưới.');
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
