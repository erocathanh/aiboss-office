#!/usr/bin/env node
/**
 * Cổng phạm vi M1a: chỉ chấp nhận đúng sáu khai báo kiểu được dời khỏi UngDung.tsx.
 *
 * Tạo 03/09/2026 · hermes-build-app.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const TEN_MONG_DOI = [
  'PhongBan',
  'NhanSu',
  'TomTatPhien',
  'Tin',
  'CapGheDungSan',
  'OChat',
];
const TAP_TEN_MONG_DOI = new Set(TEN_MONG_DOI);
const TONG_DONG_THAN_MONG_DOI = 126;
const DAU_CHU_THICH = [
  'Bố cục + tên lớp CSS bê nguyên bản mẫu 09 Owner đã duyệt.',
  'BỘ GHẾ DỰNG SẴN — «Quản Lý Trường» (Owner 30/08).',
];

function laKhaiBaoKieu(nut) {
  return ts.isInterfaceDeclaration(nut)
    || ts.isTypeAliasDeclaration(nut)
    || ts.isEnumDeclaration(nut);
}

function lietKeKhaiBaoKieu(tepNguon) {
  const ketQua = [];
  const tham = (nut) => {
    if (laKhaiBaoKieu(nut)) ketQua.push(nut);
    ts.forEachChild(nut, tham);
  };
  tham(tepNguon);
  return ketQua;
}

function tenKhaiBao(nut) {
  return nut.name?.text ?? '<không-tên>';
}

function soDongThan(tepNguon, nut) {
  const dau = tepNguon.getLineAndCharacterOfPosition(nut.getStart(tepNguon)).line;
  const cuoi = tepNguon.getLineAndCharacterOfPosition(nut.end).line;
  return cuoi - dau + 1;
}

function namTrongHam(nut) {
  for (let cha = nut.parent; cha && !ts.isSourceFile(cha); cha = cha.parent) {
    if (ts.isFunctionDeclaration(cha)
      || ts.isFunctionExpression(cha)
      || ts.isArrowFunction(cha)
      || ts.isMethodDeclaration(cha)) return true;
  }
  return false;
}

function docTep(duongDan, nhan) {
  let vanBan;
  try {
    vanBan = fs.readFileSync(duongDan, 'utf8');
  } catch (loi) {
    throw new Error(`TỪ CHỐI: không đọc được ${nhan} ${duongDan}: ${loi.message}`);
  }
  const tepNguon = ts.createSourceFile(
    duongDan,
    vanBan,
    ts.ScriptTarget.Latest,
    true,
    duongDan.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (tepNguon.parseDiagnostics.length > 0) {
    const loiDau = tepNguon.parseDiagnostics[0];
    const noiDung = ts.flattenDiagnosticMessageText(loiDau.messageText, ' ');
    throw new Error(`TỪ CHỐI: ${nhan} không tạo được AST hợp lệ: ${noiDung}`);
  }
  return { vanBan, tepNguon };
}

export function kiemPhamVi(duongUngDung, duongKieu) {
  const nguon = docTep(duongUngDung, 'UngDung.tsx');
  const dich = docTep(duongKieu, 'kieu.ts');
  const kieuNguon = lietKeKhaiBaoKieu(nguon.tepNguon);
  const kieuDich = lietKeKhaiBaoKieu(dich.tepNguon);

  if (kieuDich.length === 0) {
    return {
      ma: 2,
      loi: ['TỪ CHỐI: kieu.ts không có khai báo kiểu nào để kiểm'],
    };
  }

  const theoTenDich = new Map();
  for (const nut of kieuDich) {
    const ten = tenKhaiBao(nut);
    const danhSach = theoTenDich.get(ten) ?? [];
    danhSach.push(nut);
    theoTenDich.set(ten, danhSach);
  }
  const tenThieu = TEN_MONG_DOI.filter((ten) => !theoTenDich.has(ten));
  const tenDu = [...theoTenDich.keys()].filter((ten) => !TAP_TEN_MONG_DOI.has(ten));
  const tenLap = [...theoTenDich.entries()]
    .filter(([, cacNut]) => cacNut.length !== 1)
    .map(([ten, cacNut]) => `${ten}×${cacNut.length}`);
  const conTrongNguon = kieuNguon
    .map(tenKhaiBao)
    .filter((ten) => TAP_TEN_MONG_DOI.has(ten));
  const cacThanDich = TEN_MONG_DOI.flatMap((ten) => theoTenDich.get(ten) ?? []);
  const tongDongThan = cacThanDich.reduce(
    (tong, nut) => tong + soDongThan(dich.tepNguon, nut),
    0,
  );
  const capGheNguon = kieuNguon.filter((nut) => tenKhaiBao(nut) === 'CapGhe');
  const capGheDich = kieuDich.filter((nut) => tenKhaiBao(nut) === 'CapGhe');
  const loi = [];

  if (kieuDich.length !== TEN_MONG_DOI.length) {
    loi.push(`VI PHẠM SỐ_KHAI_BÁO: kieu.ts có ${kieuDich.length}, phải đúng 6`);
  }
  if (tenThieu.length > 0) loi.push(`VI PHẠM THIẾU_TÊN: ${tenThieu.join(', ')}`);
  if (tenDu.length > 0) loi.push(`VI PHẠM KHAI_BÁO_THỨ_BẢY: ${tenDu.join(', ')}`);
  if (tenLap.length > 0) loi.push(`VI PHẠM LẶP_TÊN: ${tenLap.join(', ')}`);
  if (conTrongNguon.length > 0) {
    loi.push(`VI PHẠM CHƯA_DỜI_HẾT: còn trong UngDung.tsx: ${conTrongNguon.join(', ')}`);
  }
  if (tongDongThan !== TONG_DONG_THAN_MONG_DOI) {
    loi.push(`VI PHẠM TỔNG_DÒNG_THÂN: ${tongDongThan}, phải đúng 126`);
  }
  if (capGheDich.length > 0) {
    loi.push('VI PHẠM CAP_GHE_BỊ_MANG_SANG: CapGhe phải ở trong hàm UngDung');
  }
  if (capGheNguon.length !== 1 || !namTrongHam(capGheNguon[0])) {
    loi.push(`VI PHẠM CAP_GHE_KHÔNG_CÒN_TRONG_HÀM: tìm thấy ${capGheNguon.length} trong UngDung.tsx`);
  }

  let chuThichNguon = 0;
  let chuThichDich = 0;
  for (const [chiSo, dau] of DAU_CHU_THICH.entries()) {
    const coNguon = nguon.vanBan.includes(dau);
    const coDich = dich.vanBan.includes(dau);
    if (coNguon) chuThichNguon += 1;
    if (coDich) chuThichDich += 1;
    if (coDich) loi.push(`VI PHẠM CHÚ_THÍCH_${chiSo + 1}_BỊ_MANG_SANG_KIEU`);
    if (!coNguon) loi.push(`VI PHẠM CHÚ_THÍCH_${chiSo + 1}_KHÔNG_CÒN_Ở_UNGDUNG`);
  }

  const so = {
    kieu: kieuDich.length,
    tenDung: TEN_MONG_DOI.length - tenThieu.length,
    tenThieu: tenThieu.length,
    tenDu: tenDu.length,
    conTrongUngDung: conTrongNguon.length,
    tongDongThan,
    capGheTrongUngDung: capGheNguon.length,
    chuThichNguon,
    chuThichDich,
  };
  return { ma: loi.length === 0 ? 0 : 1, loi, so };
}

function dongSo(so) {
  return [
    `KIEU=${so.kieu}`,
    `TEN_DUNG=${so.tenDung}`,
    `TEN_THIEU=${so.tenThieu}`,
    `TEN_DU=${so.tenDu}`,
    `CON_TRONG_UNGDUNG=${so.conTrongUngDung}`,
    `TONG_DONG_THAN=${so.tongDongThan}`,
    `CAP_GHE_TRONG_UNGDUNG=${so.capGheTrongUngDung}`,
    `CHU_THICH_NGUON=${so.chuThichNguon}`,
    `CHU_THICH_DICH=${so.chuThichDich}`,
  ].join(' ');
}

function main() {
  const thuMucAi = path.dirname(fileURLToPath(import.meta.url));
  const gocKho = path.dirname(thuMucAi);
  const thamSo = process.argv.slice(2);
  if (thamSo.length > 2) {
    console.error('TỪ CHỐI: chỉ nhận tối đa hai đường dẫn: UngDung.tsx và kieu.ts');
    return 2;
  }
  const duongUngDung = path.resolve(
    thamSo[0] ?? path.join(gocKho, 'src/components/UngDung.tsx'),
  );
  const duongKieu = path.resolve(
    thamSo[1] ?? path.join(gocKho, 'src/components/ung-dung/kieu.ts'),
  );

  try {
    const ketQua = kiemPhamVi(duongUngDung, duongKieu);
    if (ketQua.so) console.log(dongSo(ketQua.so));
    for (const loi of ketQua.loi) console.error(loi);
    return ketQua.ma;
  } catch (loi) {
    console.error(loi.message);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
