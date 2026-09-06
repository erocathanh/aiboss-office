import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TEN_THUOC = 'soi-ket-qua-loi-goi-ten-truc-tiep-da-khoa';
const THUOC_MOI = new URL(`./${TEN_THUOC}.mjs`, import.meta.url).pathname;
const THUOC_CU = new URL('./soi-ket-qua.mjs', import.meta.url).pathname;
const TAI_LIEU = new URL(`./HOP-DONG-${TEN_THUOC}.md`, import.meta.url).pathname;
const THUOC_DANG_CO = fs.existsSync(THUOC_MOI) ? THUOC_MOI : THUOC_CU;

const KHONG_BAO_DAM = [
  'generic trong callee — `take(f<number>()); (f<number>)();`',
  'dấu phẩy trong callee — `take(f()); ((touch(),(touch(),f)))();`',
  'bí danh (alias)',
  'scope',
  'xuyên mô-đun',
  'mọi nhánh runtime',
] as const;

function chay(noiDung: string, dsTen = 'f') {
  const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), 'hop-dong-hep-'));
  const tep = path.join(thuMuc, 'ca.ts');
  try {
    fs.writeFileSync(tep, noiDung);
    const kq = spawnSync(process.execPath, [THUOC_DANG_CO, tep, dsTen], { encoding: 'utf8' });
    return { ma: kq.status, loiRa: `${kq.stdout}${kq.stderr}` };
  } finally {
    fs.rmSync(thuMuc, { recursive: true, force: true });
  }
}

function doiChungLanh(noiDung: string, soLoiGoi: number) {
  const kq = chay(noiDung);
  assert.equal(kq.ma, 0, `đối chứng lành không ĐẠT:\n${kq.loiRa}`);
  assert.match(kq.loiRa, new RegExp(`^ĐẠT · ${soLoiGoi} lời gọi$`, 'm'));
  assert.equal(kq.loiRa.match(/\[f\] DUNG\b/g)?.length, soLoiGoi, kq.loiRa);
  return kq;
}

function coCanhBao(kq: { ma: number | null; loiRa: string }, gioiHan: string) {
  assert.match(kq.loiRa, /CẢNH BÁO PHẠM VI HẸP:/);
  assert.ok(kq.loiRa.includes(`KHÔNG BẢO ĐẢM: ${gioiHan}`),
    `kết quả ĐẠT không tự khai giới hạn «${gioiHan}»:\n${kq.loiRa}`);
}

test('TÊN THƯỚC khóa phạm vi lời gọi tên trực tiếp đã có test, tên rộng cũ không còn', () => {
  assert.equal(fs.existsSync(THUOC_MOI), true, `thiếu tên thước hẹp: ${path.basename(THUOC_MOI)}`);
  assert.equal(fs.existsSync(THUOC_CU), false, `tên rộng cũ vẫn còn: ${path.basename(THUOC_CU)}`);
});

test('TÀI LIỆU và cảnh báo ĐẠT khóa cùng đúng sáu giới hạn đã biết', () => {
  assert.equal(fs.existsSync(TAI_LIEU), true, `thiếu tài liệu hợp đồng hẹp: ${path.basename(TAI_LIEU)}`);
  const taiLieu = fs.readFileSync(TAI_LIEU, 'utf8');
  assert.ok(taiLieu.includes(`${TEN_THUOC}.mjs`), 'tài liệu không gọi đúng tên thước hẹp');
  assert.ok(taiLieu.includes('chỉ bảo đảm các dạng lời gọi ĐÃ KHÓA BẰNG TEST'),
    'tài liệu đang hứa rộng hơn tập mẫu đã khóa');
  assert.ok(taiLieu.includes('không suy rộng thành mọi JavaScript/TypeScript'),
    'tài liệu thiếu câu cấm suy rộng');

  const dat = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f());', 1);
  for (const gioiHan of KHONG_BAO_DAM) {
    assert.ok(taiLieu.includes(gioiHan), `tài liệu bỏ sót giới hạn «${gioiHan}»`);
    coCanhBao(dat, gioiHan);
  }
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — generic trong callee được ghi nhận cùng đối chứng lành', () => {
  const lanh = doiChungLanh(
    'declare function f<T>(): boolean; declare function take(x: boolean): void; take(f<number>()); take((f)());', 2);
  const gioiHan = chay(
    'declare function f<T>(): boolean; declare function take(x: boolean): void; take(f<number>()); (f<number>)();');
  assert.equal(gioiHan.ma, 0, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.equal(gioiHan.loiRa.match(/\[f\] DUNG\b/g)?.length, 1, gioiHan.loiRa);
  assert.notEqual(lanh.loiRa, gioiHan.loiRa, 'thước không phân biệt được số lời gọi đã nhận diện');
  coCanhBao(gioiHan, KHONG_BAO_DAM[0]);
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — dấu phẩy trong callee được ghi nhận cùng đối chứng lành', () => {
  const lanh = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f()); take((f)());', 2);
  const gioiHan = chay(
    'declare function f(): boolean; declare function touch(): void; declare function take(x: boolean): void; take(f()); ((touch(),(touch(),f)))();');
  assert.equal(gioiHan.ma, 0, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.equal(gioiHan.loiRa.match(/\[f\] DUNG\b/g)?.length, 1, gioiHan.loiRa);
  assert.notEqual(lanh.loiRa, gioiHan.loiRa, 'thước không phân biệt được số lời gọi đã nhận diện');
  coCanhBao(gioiHan, KHONG_BAO_DAM[1]);
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — bí danh (alias) được ghi nhận cùng đối chứng lành', () => {
  const lanh = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f()); take((f)());', 2);
  const gioiHan = chay(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f()); const g = f; g();');
  assert.equal(gioiHan.ma, 0, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.notEqual(lanh.loiRa, gioiHan.loiRa, 'ca bí danh không khác đối chứng hai lời gọi trực tiếp');
  coCanhBao(gioiHan, KHONG_BAO_DAM[2]);
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — scope được ghi nhận cùng đối chứng lành', () => {
  const lanh = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f());', 1);
  const gioiHan = chay(
    'declare function f(): boolean; declare function take(x: boolean): void; function inner(){ const f = () => {}; f(); } take(f());');
  assert.equal(gioiHan.ma, 1, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^KHÔNG ĐẠT · 2 lời gọi$/m);
  assert.equal(gioiHan.loiRa.match(/\[f\] BO-QUA\b/g)?.length, 1, gioiHan.loiRa);
  assert.equal(gioiHan.loiRa.match(/\[f\] DUNG\b/g)?.length, 1, gioiHan.loiRa);
  assert.notEqual(lanh.ma, gioiHan.ma, 'ca scope phải ghi nhận được báo đỏ oan đã biết');
  coCanhBao(lanh, KHONG_BAO_DAM[3]);
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — xuyên mô-đun được ghi nhận cùng đối chứng lành', () => {
  const lanh = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; take(f()); take((f)());', 2);
  const gioiHan = chay(
    "import { g } from './khac'; declare function f(): boolean; declare function take(x: boolean): void; take(f()); g();");
  assert.equal(gioiHan.ma, 0, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.notEqual(lanh.loiRa, gioiHan.loiRa, 'ca xuyên mô-đun không khác đối chứng hai lời gọi trực tiếp');
  coCanhBao(gioiHan, KHONG_BAO_DAM[4]);
});

test('BIẾT MÀ CỐ Ý CHƯA LÀM — mọi nhánh runtime được ghi nhận cùng hai đối chứng', () => {
  const lanh = doiChungLanh(
    'declare function f(): boolean; declare function take(x: boolean): void; const x = f(); take(x);', 1);
  const gioiHan = chay(
    'declare function f(): boolean; declare function take(x: boolean): void; declare const condition: boolean; const x = f(); if (condition) take(x);');
  const boQuaTrucTiep = chay('declare function f(): boolean; f();');
  assert.equal(gioiHan.ma, 0, gioiHan.loiRa);
  assert.match(gioiHan.loiRa, /^ĐẠT · 1 lời gọi$/m);
  assert.equal(boQuaTrucTiep.ma, 1, boQuaTrucTiep.loiRa);
  assert.match(boQuaTrucTiep.loiRa, /^KHÔNG ĐẠT · 1 lời gọi$/m);
  assert.match(boQuaTrucTiep.loiRa, /\[f\] BO-QUA\b/);
  assert.equal(lanh.ma, gioiHan.ma, 'test phải ghi rõ thước chưa phân biệt đường runtime có điều kiện');
  coCanhBao(gioiHan, KHONG_BAO_DAM[5]);
});
