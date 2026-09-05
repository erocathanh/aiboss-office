/**
 * 🧊 ĐÓNG BĂNG: câu nhắc nạp bộ ghế phải KỂ ĐÚNG chuyện đã xảy ra.
 *
 * 🕳 Ca gốc (người soi bắt 05/09): `napBoGhe` luôn kết bằng «Đã nạp xong bộ ghế.» kể cả khi
 *    mọi lời gọi mạng đều hỏng. Bộ này canh đúng cái đó, và canh bằng MẠNG GIẢ — khôngnạp
 *    ghế thật, khôngđụng sổ ô, nên dựng lại được ca hỏng theo ý muốn.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cauNhacNapBoGhe, ghiSoO, ketQuaTrong } from '../src/components/ung-dung/nap-bo-ghe.ts';

/** mạng giả: trả về đúng thứ ta bảo nó trả, hoặc ném đúng lúc ta bảo nó ném */
const mang = (cach: { ok?: boolean; nem?: boolean }) => (async () => {
  if (cach.nem) throw new TypeError('Failed to fetch');
  return { ok: cach.ok } as Response;
}) as unknown as typeof fetch;

const THAN = { ma_o: 'o-2', ma_nhan_su: 'ketoan', ma_phien: null, xoa_lien_ket: false };

test('🔴 ghiSoO phải PHÂN BIỆT được ba kết cục của một lời gọi mạng', async () => {
  assert.equal(await ghiSoO(THAN, mang({ ok: true })), true, 'máy chủ nhận ⇒ true');
  assert.equal(await ghiSoO(THAN, mang({ ok: false })), false, 'máy chủ CHỐI (4xx/5xx) ⇒ false');
  assert.equal(await ghiSoO(THAN, mang({ nem: true })), false, 'rớt mạng ⇒ false, khôngđược ném ra ngoài');
});

test('🔴 ĐỐI CHỨNG DƯƠNG — bản CŨ (bỏ qua res.ok) sẽ LỌT cả ba ca', async () => {
  const cu = async (goiMang: typeof fetch) => { await goiMang('/api/o', { method: 'POST' }); return true; };
  const ketCu = [await cu(mang({ ok: true })), await cu(mang({ ok: false }))];
  assert.deepEqual(ketCu, [true, true], 'bản cũ nói THÀNH CÔNG cả khi máy chủ chối — đây là thứ ta vừa gỡ');
});

test('🔴 LUẬT BẤT BIẾN: có bất kỳ ô nào HỎNG thì câu nhắc KHÔNG được chứa chữ «xong»', () => {
  const hongCoThe = ['ghi-so', 'doc-lich-su'] as const;
  const boQuaCoThe = ['dang-chay', 'thieu-ghe'] as const;
  let daThu = 0;
  for (const h of hongCoThe) {
    for (const them of [[], [{ o: 3, vi_sao: boQuaCoThe[0] }], [{ o: 4, vi_sao: boQuaCoThe[1] }],
      [{ o: 3, vi_sao: boQuaCoThe[0] }, { o: 4, vi_sao: boQuaCoThe[1] }]]) {
      for (const lt of [[], [5]]) {
        const kq = { ...ketQuaTrong(), hong: [{ o: 2, vi_sao: h }], boQua: [...them], loiThoi: [...lt] };
        const cau = cauNhacNapBoGhe(kq);
        assert.ok(!cau.includes('xong'), `ca ${h}/${them.length}/${lt.length} vẫn nói «xong»: ${cau}`);
        assert.ok(cau.includes('Ô 2'), `ca ${h} khôngnêu ô hỏng: ${cau}`);
        daThu += 1;
      }
    }
  }
  assert.equal(daThu, 16, 'phải quét đủ 16 tổ hợp có-hỏng');
});

test('🔴 và chiều NGƯỢC LẠI: khôngcó ô nào hỏng thì PHẢI nói xong (đừng doạ oan)', () => {
  assert.equal(cauNhacNapBoGhe(ketQuaTrong()), 'Đã nạp xong bộ ghế.');
  assert.match(cauNhacNapBoGhe({ ...ketQuaTrong(), loiThoi: [3] }), /xong.*Ô 3.*mới hơn/s);
});

test('🔴 ô ĐANG CHẠY và ô THIẾU GHẾ là BỎ QUA, khôngphải hỏng — nhưng vẫn phải nói ra', () => {
  const chay = cauNhacNapBoGhe({ ...ketQuaTrong(), boQua: [{ o: 2, vi_sao: 'dang-chay' }] });
  assert.match(chay, /Ô 2 đang chạy/);
  assert.ok(!chay.startsWith('🔴'), 'bỏ qua có lý do thì khôngdựng cờ đỏ');
  const thieu = cauNhacNapBoGhe({ ...ketQuaTrong(), boQua: [{ o: 5, vi_sao: 'thieu-ghe' }] });
  assert.match(thieu, /Ô 5 không tìm thấy ghế/);
});

test('🔴 nhiều ô hỏng thì gộp và SẮP XẾP — số ô phải đọc được, khôngphải thứ tự ngẫu nhiên', () => {
  const cau = cauNhacNapBoGhe({ ...ketQuaTrong(),
    hong: [{ o: 5, vi_sao: 'ghi-so' }, { o: 2, vi_sao: 'ghi-so' }, { o: 4, vi_sao: 'doc-lich-su' }] });
  assert.match(cau, /Ô 2, 5 KHÔNG ghi được/);
  assert.match(cau, /Ô 4 nạp được ghế nhưng KHÔNG đọc được lịch sử/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 🎛 PHẦN VÒNG 3 — chạy ĐƯỜNG ĐIỀU PHỐI THẬT (`chayNapBoGhe`) bằng MẠNG GIẢ.
 *
 * 🕳 Vì sao phải có phần này: vòng 2 tôi thử `cauNhacNapBoGhe` bằng bảng 16 tổ hợp, xanh hết —
 *    mà app VẪN báo «đã nạp xong» khi hỏng. Phép thử đúng, vật SAI: cái hỏng nằm ở đường đi
 *    khôngchuyển kết quả tới hàm tạo câu.
 * 📌 Ở đây `ghiO` là hàm THẬT (`ghiSoO`) chạy trên `fetch` GIẢ ⇒ tầng mạng được đi thật,
 *    khôngphải một hàm giả trả sẵn true/false.
 * ══════════════════════════════════════════════════════════════════════════ */
import { chayNapBoGhe, type PhuThuocNap, type KetQuaDatNguoi } from '../src/components/ung-dung/nap-bo-ghe.ts';

const DANH_BA = ['ketoan', 'marketing', 'kythuat', 'nhansu', 'phaply'];
const BO = [null, 'ketoan', 'marketing', 'kythuat', 'nhansu', 'phaply'].map((t) => ({ ten: t }));

/** phụ thuộc MẶC ĐỊNH: 6 ô trống, danh bạ đủ, mạng lành */
function nen(pha: Partial<PhuThuocNap> & { mang?: typeof fetch } = {}): PhuThuocNap {
  const mang = pha.mang ?? mangGia({ ok: true });
  return {
    soO: 6,
    docO: () => ({ ten: null, phien: null, dangChay: false }),
    coTrongDanhBa: (t) => DANH_BA.includes(t),
    // ⚠️ `datNguoi` giả này đi qua ghiSoO THẬT với `fetch` giả ⇒ lỗi mạng là lỗi mạng thật.
    datNguoi: async (i, t): Promise<KetQuaDatNguoi> => (
      (await ghiSoO({ ma_o: `o-${i + 1}`, ma_nhan_su: t, ma_phien: null, xoa_lien_ket: true }, mang))
        ? { xong: true } : { xong: false, hong: 'ghi-so' }),
    dongO: async (i) => ghiSoO({ ma_o: `o-${i + 1}`, ma_nhan_su: null, ma_phien: null, xoa_lien_ket: false }, mang),
    ghiO: async (i, t, ph) => ghiSoO({ ma_o: `o-${i + 1}`, ma_nhan_su: t, ma_phien: ph, xoa_lien_ket: false }, mang),
    napLichSu: async () => 'xong',
    ...pha,
  };
}
const mangGia = (c: { ok?: boolean; nem?: boolean }) => (async () => {
  if (c.nem) throw new TypeError('Failed to fetch');
  return { ok: c.ok } as Response;
}) as unknown as typeof fetch;

test('🔴 HỒI QUY VÒNG 2 — mạng CHẾT ⇒ đường điều phối tuyệt đối KHÔNG được nói «xong»', async () => {
  for (const [ten, m] of [['máy chủ CHỐI 500', mangGia({ ok: false })], ['rớt mạng', mangGia({ nem: true })]] as const) {
    const kq = await chayNapBoGhe(BO, nen({ mang: m }));
    const cau = cauNhacNapBoGhe(kq);
    assert.ok(!cau.includes('xong'), `[${ten}] vẫn nói xong: ${cau}`);
    assert.equal(kq.hong.length, 5, `[${ten}] phải ghi HỎNG cả 5 ô`);
    assert.match(cau, /^🔴 Ô 2, 3, 4, 5, 6 KHÔNG ghi được vào sổ ô/, `[${ten}] ${cau}`);
  }
});

test('🔴 ĐỐI CHỨNG DƯƠNG — mạng LÀNH thì đường ấy PHẢI nói xong (đừng doạ oan)', async () => {
  const kq = await chayNapBoGhe(BO, nen());
  assert.deepEqual({ hong: kq.hong.length, boQua: kq.boQua.length, daDat: kq.daDat }, { hong: 0, boQua: 0, daDat: 5 });
  assert.equal(cauNhacNapBoGhe(kq), 'Đã nạp xong bộ ghế.');
});

test('🔴 MỌI lối ra của datNguoi đều tới được câu nhắc — quét từng lý do một', async () => {
  const bang: { ra: KetQuaDatNguoi; mong: RegExp; xong: boolean }[] = [
    { ra: { xong: false, hong: 'doc-ds-phien' }, mong: /KHÔNG đọc được danh sách phiên/, xong: false },
    { ra: { xong: false, hong: 'ghi-so' }, mong: /KHÔNG ghi được vào sổ ô/, xong: false },
    { ra: { xong: false, hong: 'doc-lich-su' }, mong: /KHÔNG đọc được lịch sử/, xong: false },
    { ra: { xong: false, boQua: 'trung-o' }, mong: /đã mở ở ô khác/, xong: false },
    { ra: { xong: false, boQua: 'o-mot' }, mong: /ô ông trùm/, xong: false },
    { ra: { xong: false, boQua: 'loi-thoi' }, mong: /lượt mới hơn đè lên/, xong: true },
    { ra: { xong: true }, mong: /^Đã nạp xong bộ ghế\.$/, xong: true },
  ];
  for (const ca of bang) {
    const kq = await chayNapBoGhe(BO, nen({ datNguoi: async () => ca.ra }));
    const cau = cauNhacNapBoGhe(kq);
    assert.match(cau, ca.mong, `lý do ${JSON.stringify(ca.ra)} khôngtới được câu nhắc: ${cau}`);
    assert.equal(cau.includes('xong'), ca.xong, `lý do ${JSON.stringify(ca.ra)} sai chiều «xong»: ${cau}`);
  }
});

test('🔴 lịch sử hỏng ở nhánh KHÔI PHỤC PHIÊN cũng phải tới được câu nhắc', async () => {
  const boCoPhien = [null, 'ketoan'].map((t, k) => ({ ten: t, phien: k === 1 ? 'phien-abc' : null }));
  const kq = await chayNapBoGhe(boCoPhien, nen({ soO: 2, napLichSu: async () => 'hong' }));
  assert.match(cauNhacNapBoGhe(kq), /Ô 2 nạp được ghế nhưng KHÔNG đọc được lịch sử/);
  const kq2 = await chayNapBoGhe(boCoPhien, nen({ soO: 2, napLichSu: async () => 'loi-thoi' }));
  assert.match(cauNhacNapBoGhe(kq2), /Đã nạp xong bộ ghế\. \(Ô 2 có lượt mới hơn đè lên\.\)/);
});

test('🔴 ô ĐANG CHẠY khôngbị đè, và ghế KHÔNG có trong danh bạ phải được nêu tên', async () => {
  const kq = await chayNapBoGhe(BO, nen({ docO: (i) => ({ ten: null, phien: null, dangChay: i === 2 }) }));
  assert.match(cauNhacNapBoGhe(kq), /Ô 3 đang chạy/);
  const kq2 = await chayNapBoGhe([null, 'ai-do-la'].map((t) => ({ ten: t })), nen({ soO: 2 }));
  assert.match(cauNhacNapBoGhe(kq2), /Ô 2 không tìm thấy ghế trong danh bạ/);
});
