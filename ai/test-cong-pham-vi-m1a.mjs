#!/usr/bin/env node
/** Nghiệm thu hai chiều cho cổng phạm vi M1a. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const THU_MUC_AI = path.dirname(fileURLToPath(import.meta.url));
const CONG = path.join(THU_MUC_AI, 'cong-pham-vi-m1a.mjs');
const CHU_THICH_1 = '/* Bố cục + tên lớp CSS bê nguyên bản mẫu 09 Owner đã duyệt. */';
const CHU_THICH_2 = '/** BỘ GHẾ DỰNG SẴN — «Quản Lý Trường» (Owner 30/08). */';
const TEN = ['PhongBan', 'NhanSu', 'TomTatPhien', 'Tin', 'CapGheDungSan', 'OChat'];
const SO_DONG = new Map([
  ['PhongBan', 1],
  ['NhanSu', 13],
  ['TomTatPhien', 4],
  ['Tin', 45],
  ['CapGheDungSan', 1],
  ['OChat', 62],
]);

function khaiBao(ten, soDong) {
  if (ten === 'CapGheDungSan') {
    assert.equal(soDong, 1);
    return 'type CapGheDungSan = { ten: string };';
  }
  if (soDong === 1) return `interface ${ten} { giaTri: string }`;
  const dongGiua = Array.from(
    { length: soDong - 2 },
    (_, i) => `  truong${i + 1}?: string;`,
  );
  return [`interface ${ten} {`, ...dongGiua, '}'].join('\n');
}

function taoKieu(boTen = new Set()) {
  return TEN
    .filter((ten) => !boTen.has(ten))
    .map((ten) => khaiBao(ten, SO_DONG.get(ten)))
    .join('\n\n') + '\n\nexport { PhongBan, NhanSu, TomTatPhien, Tin, CapGheDungSan, OChat };\n';
}

function taoUngDung() {
  return `${CHU_THICH_1}\n${CHU_THICH_2}\nexport function UngDung() {\n`
    + '  type CapGhe = { ten: string | null; phien: string | null; goiY?: string };\n'
    + '  return null;\n}\n';
}

function chay(ungDung, kieu) {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'cong-pham-vi-m1a-'));
  const duongUngDung = path.join(thuMuc, 'UngDung.tsx');
  const duongKieu = path.join(thuMuc, 'kieu.ts');
  fs.writeFileSync(duongUngDung, ungDung);
  fs.writeFileSync(duongKieu, kieu);
  const ketQua = spawnSync(process.execPath, [CONG, duongUngDung, duongKieu], {
    encoding: 'utf8',
  });
  fs.rmSync(thuMuc, { recursive: true, force: true });
  return ketQua;
}

function xacNhanCaDung(ketQua) {
  assert.equal(ketQua.status, 0, ketQua.stdout + ketQua.stderr);
  assert.match(ketQua.stdout, /KIEU=6\b/);
  assert.match(ketQua.stdout, /TEN_DUNG=6\b/);
  assert.match(ketQua.stdout, /TEN_THIEU=0\b/);
  assert.match(ketQua.stdout, /TEN_DU=0\b/);
  assert.match(ketQua.stdout, /CON_TRONG_UNGDUNG=0\b/);
  assert.match(ketQua.stdout, /TONG_DONG_THAN=126\b/);
  assert.match(ketQua.stdout, /CAP_GHE_TRONG_UNGDUNG=1\b/);
  assert.match(ketQua.stdout, /CHU_THICH_NGUON=2\b/);
  assert.match(ketQua.stdout, /CHU_THICH_DICH=0\b/);
  assert.equal(ketQua.stderr, '');
}

function haiChieu(taoCaViPham, mauLoi, maViPham = 1) {
  const dung = chay(taoUngDung(), taoKieu());
  xacNhanCaDung(dung);

  const caViPham = taoCaViPham({ ungDung: taoUngDung(), kieu: taoKieu() });
  const sai = chay(caViPham.ungDung, caViPham.kieu);
  assert.equal(sai.status, maViPham, sai.stdout + sai.stderr);
  assert.match(sai.stderr, mauLoi);
}

test('đủ sáu tên: đúng trả 0, thiếu Tin trả khác 0 và gọi tên', () => {
  haiChieu(
    ({ ungDung }) => ({ ungDung, kieu: taoKieu(new Set(['Tin'])) }),
    /VI PHẠM THIẾU_TÊN: Tin/,
  );
});

test('sáu tên vắng khỏi nguồn: đúng trả 0, còn PhongBan trả khác 0', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({
      ungDung: `${ungDung}\ninterface PhongBan { giaTri: string }\n`,
      kieu,
    }),
    /VI PHẠM CHƯA_DỜI_HẾT: còn trong UngDung\.tsx: PhongBan/,
  );
});

test('không có kiểu thứ bảy: đúng trả 0, thêm ThuBay trả khác 0', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({ ungDung, kieu: `${kieu}\ninterface ThuBay {}\n` }),
    /VI PHẠM KHAI_BÁO_THỨ_BẢY: ThuBay/,
  );
});

test('CapGhe ở trong hàm: đúng trả 0, mang sang kieu.ts trả khác 0', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({
      ungDung: ungDung.replace(
        '  type CapGhe = { ten: string | null; phien: string | null; goiY?: string };\n',
        '',
      ),
      kieu: `${kieu}\ntype CapGhe = { ten: string | null };\n`,
    }),
    /VI PHẠM CAP_GHE_BỊ_MANG_SANG/,
  );
});

test('chú thích dòng 17 ở nguồn: đúng trả 0, mang sang kieu.ts trả khác 0', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({
      ungDung: ungDung.replace(`${CHU_THICH_1}\n`, ''),
      kieu: `${CHU_THICH_1}\n${kieu}`,
    }),
    /VI PHẠM CHÚ_THÍCH_1_BỊ_MANG_SANG_KIEU/,
  );
});

test('chú thích dòng 216-254 ở nguồn: đúng trả 0, mang sang kieu.ts trả khác 0', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({
      ungDung: ungDung.replace(`${CHU_THICH_2}\n`, ''),
      kieu: `${CHU_THICH_2}\n${kieu}`,
    }),
    /VI PHẠM CHÚ_THÍCH_2_BỊ_MANG_SANG_KIEU/,
  );
});

test('tổng thân 126 dòng: đúng trả 0, tăng một dòng trả khác 0 và in 127', () => {
  haiChieu(
    ({ ungDung, kieu }) => ({
      ungDung,
      kieu: kieu.replace('interface NhanSu {\n', 'interface NhanSu {\n  themMotDong?: string;\n'),
    }),
    /VI PHẠM TỔNG_DÒNG_THÂN: 127, phải đúng 126/,
  );
});

test('có vật để kiểm: đúng trả 0, hai tệp rỗng bị từ chối mã 2', () => {
  haiChieu(
    () => ({ ungDung: '', kieu: '' }),
    /TỪ CHỐI: kieu\.ts không có khai báo kiểu nào để kiểm/,
    2,
  );
});
