/**
 * Bundled AIBOSS Office MCP Agent Broker core storage engine.
 * Source: Copied from agent-broker-mcp (commit 0d1ed6c) on 2026-10-15, hardened in C2-broker v02.
 * Mailbox location: Self-anchored at startup to <REPO_ROOT>/operations/data/mailbox
 * (resolved via import.meta.url -> ../../data/mailbox).
 * MCP_HOP_THU_DIR is only honored when its resolved realpath lies strictly inside <REPO_ROOT>.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

function safeRealpathNearest(targetPath) {
  const resolved = path.resolve(targetPath);
  let cur = resolved;
  const tail = [];
  while (true) {
    try {
      const realCur = fs.realpathSync(cur);
      return tail.length > 0 ? path.join(realCur, ...tail.reverse()) : realCur;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return resolved;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_RAW = path.resolve(MODULE_DIR, '../../..');
export const REPO_ROOT_REAL = safeRealpathNearest(REPO_ROOT_RAW);
export const OPS_DATA_ROOT_REAL = safeRealpathNearest(path.join(REPO_ROOT_REAL, 'operations', 'data'));
export const DEFAULT_REPO_MAILBOX_DIR = path.join(OPS_DATA_ROOT_REAL, 'mailbox');

export const MA_LOI = {
  THIEU_THAM_SO: 'THIEU_THAM_SO',
  THAM_SO_KHONG_HOP_LE: 'THAM_SO_KHONG_HOP_LE',
  KHOA_TEP_THAT_BAI: 'KHOA_TEP_THAT_BAI',
  GHI_TEP_LOI: 'GHI_TEP_LOI',
  DOC_TEP_LOI: 'DOC_TEP_LOI'
};

export class BrokerError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'BrokerError';
  }
}

export function isPathInsideRepo(candidatePath, repoRoot = REPO_ROOT_REAL) {
  const realRepo = safeRealpathNearest(repoRoot);
  const opsDataRoot = safeRealpathNearest(path.join(realRepo, 'operations', 'data'));
  const resolvedCandidate = path.resolve(realRepo, candidatePath);
  const realCandidate = safeRealpathNearest(resolvedCandidate);
  const rel = path.relative(opsDataRoot, realCandidate);
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveSafeMailboxDir(rawEnv = process.env.MCP_HOP_THU_DIR, repoRoot = REPO_ROOT_REAL) {
  const realRepo = safeRealpathNearest(repoRoot);
  const opsDataRoot = safeRealpathNearest(path.join(realRepo, 'operations', 'data'));
  const defaultDir = path.join(opsDataRoot, 'mailbox');
  if (!rawEnv || typeof rawEnv !== 'string' || !rawEnv.trim()) {
    return defaultDir;
  }
  const trimmed = rawEnv.trim();
  const resolvedCandidate = path.resolve(realRepo, trimmed);
  const realCandidate = safeRealpathNearest(resolvedCandidate);
  const rel = path.relative(opsDataRoot, realCandidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    console.error(
      `[agent-broker-mcp] CẢNH BÁO: MCP_HOP_THU_DIR phải nằm trong operations/data/ (${trimmed}), bỏ qua và dùng hộp thư mặc định.`
    );
    return defaultDir;
  }
  return realCandidate;
}

const LOCKED_MAILBOX_DIR = resolveSafeMailboxDir(process.env.MCP_HOP_THU_DIR, REPO_ROOT_REAL);

export function layThuMucHopThu() {
  return LOCKED_MAILBOX_DIR;
}

export function damBaoThuMuc(dir) {
  const realBefore = safeRealpathNearest(dir);
  const relBefore = path.relative(OPS_DATA_ROOT_REAL, realBefore);
  if (!relBefore || relBefore.startsWith('..') || path.isAbsolute(relBefore)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      'Thư mục hộp thư phải nằm trong operations/data/ của kho AIBOSS Office'
    );
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const realDir = safeRealpathNearest(dir);
  const rel = path.relative(OPS_DATA_ROOT_REAL, realDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      'Thư mục hộp thư phải nằm trong operations/data/ của kho AIBOSS Office'
    );
  }
}

const TRAN_KY_TU_DINH_DANH = 64;
const TRAN_KY_TU_TIEU_DE = 150;
const TRAN_BYTES_NOI_DUNG = 32 * 1024;
const MAU_DINH_DANH_HOP_LE = /^[a-z0-9][a-z0-9._-]*$/;
const MAU_KY_TU_DIEU_KHIEN = /[\x00-\x1f\x7f\r\n]/;

export function chanThamSoLa(rawArgs, allowedKeys) {
  if (rawArgs === undefined || rawArgs === null) return;
  if (typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new BrokerError(MA_LOI.THAM_SO_KHONG_HOP_LE, 'Tham số công cụ phải là một đối tượng JSON');
  }
  for (const key of Object.keys(rawArgs)) {
    if (!allowedKeys.has(key)) {
      throw new BrokerError(MA_LOI.THAM_SO_KHONG_HOP_LE, `tham số không được phép: ${key}`);
    }
  }
}

export function kiemTraDinhDanhGhe(val, tenTruong) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, `Thiếu hoặc sai tham số bắt buộc '${tenTruong}'`);
  }
  if (MAU_KY_TU_DIEU_KHIEN.test(val)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      `Tham số '${tenTruong}' không được chứa ký tự điều khiển hoặc xuống dòng`
    );
  }
  const chuan = val.trim();
  if (chuan.length > TRAN_KY_TU_DINH_DANH) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      `Tham số '${tenTruong}' vượt quá trần ${TRAN_KY_TU_DINH_DANH} ký tự`
    );
  }
  if (!MAU_DINH_DANH_HOP_LE.test(chuan)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      `Tham số '${tenTruong}' không hợp lệ (chỉ chấp nhận ^[a-z0-9][a-z0-9._-]*$)`
    );
  }
  return chuan;
}

export function kiemTraTieuDe(val) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'tieu_de'");
  }
  if (MAU_KY_TU_DIEU_KHIEN.test(val)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      "Tham số 'tieu_de' không được chứa ký tự xuống dòng hoặc ký tự điều khiển"
    );
  }
  const chuan = val.trim();
  if (val.length > TRAN_KY_TU_TIEU_DE || chuan.length > TRAN_KY_TU_TIEU_DE) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      `Tham số 'tieu_de' vượt quá trần ${TRAN_KY_TU_TIEU_DE} ký tự`
    );
  }
  return chuan;
}

export function kiemTraNoiDung(val) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'noi_dung'");
  }
  if (/\x00/.test(val)) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      "Tham số 'noi_dung' không được chứa ký tự NUL"
    );
  }
  const soBytes = Buffer.byteLength(val, 'utf8');
  if (soBytes > TRAN_BYTES_NOI_DUNG) {
    throw new BrokerError(
      MA_LOI.THAM_SO_KHONG_HOP_LE,
      `Tham số 'noi_dung' vượt quá trần 32 KB (${TRAN_BYTES_NOI_DUNG} bytes)`
    );
  }
  return val;
}

export function lamSachMotDongMd(str) {
  return String(str ?? '')
    .replace(/[\x00-\x1f\x7f\r\n]+/g, ' ')
    .replace(/`/g, "'")
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * Khoá nguyên tử bằng thư mục POSIX (mkdir).
 * Tránh race condition, có hạn dùng TTL (mặc định 5s).
 */
export async function voiKhoa(dir, congViec, timeoutMs = 5000, ttlMs = 5000) {
  damBaoThuMuc(dir);
  const lockDir = path.join(dir, '.khoa');
  const batDau = Date.now();

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      break; // Khoá thành công
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockDir);
          if (Date.now() - stat.mtimeMs > ttlMs) {
            fs.rmdirSync(lockDir);
            continue;
          }
        } catch (_) {
          continue;
        }

        if (Date.now() - batDau >= timeoutMs) {
          throw new BrokerError(
            MA_LOI.KHOA_TEP_THAT_BAI,
            `Không thể lấy khoá ${lockDir} sau ${timeoutMs}ms (đang có tiến trình khác giữ khoá)`
          );
        }
        const cho = 30 + Math.floor(Math.random() * 50);
        await new Promise((resolve) => setTimeout(resolve, cho));
      } else {
        throw new BrokerError(MA_LOI.GHI_TEP_LOI, `Lỗi tạo khoá: ${err.message}`);
      }
    }
  }

  try {
    return await congViec();
  } finally {
    try {
      if (fs.existsSync(lockDir)) {
        fs.rmdirSync(lockDir);
      }
    } catch (err) {
      console.error(`[CANH_BAO] Không thể gỡ thư mục khoá ${lockDir}: ${err.message}`);
    }
  }
}

export function sinhMaTin() {
  const d = new Date();
  const nam = d.getUTCFullYear();
  const thang = String(d.getUTCMonth() + 1).padStart(2, '0');
  const ngay = String(d.getUTCDate()).padStart(2, '0');
  const gio = String(d.getUTCHours()).padStart(2, '0');
  const phut = String(d.getUTCMinutes()).padStart(2, '0');
  const giay = String(d.getUTCSeconds()).padStart(2, '0');
  const hex = crypto.randomBytes(2).toString('hex');
  return `tin-${nam}${thang}${ngay}-${gio}${phut}${giay}-${hex}`;
}

const GUI_TIN_KEYS = new Set(['nguoi_gui', 'nguoi_nhan', 'tieu_de', 'noi_dung']);
const NHAN_TIN_KEYS = new Set(['nguoi_nhan', 'chi_tin_chua_doc', 'gioi_han']);
const DANH_DAU_KEYS = new Set(['ma_tin', 'nguoi_doc']);
const SOAT_HOP_THU_KEYS = new Set(['nguong_treo_phut']);

/**
 * 1. gui_tin
 */
export async function guiTin(rawArgs = {}) {
  chanThamSoLa(rawArgs, GUI_TIN_KEYS);
  const nguoiGuiChuan = kiemTraDinhDanhGhe(rawArgs.nguoi_gui, 'nguoi_gui');
  const nguoiNhanChuan = kiemTraDinhDanhGhe(rawArgs.nguoi_nhan, 'nguoi_nhan');
  const tieuDeChuan = kiemTraTieuDe(rawArgs.tieu_de);
  const noiDungChuan = kiemTraNoiDung(rawArgs.noi_dung);

  const dir = layThuMucHopThu();
  const tepJsonl = path.join(dir, 'hop-thu.jsonl');
  const tepMd = path.join(dir, 'HOP-THU.md');
  const tepChuong = path.join(dir, '.chuong-bao');

  return await voiKhoa(dir, async () => {
    const ma_tin = sinhMaTin();
    const luc = new Date().toISOString();

    const banGhi = {
      ma_tin,
      luc,
      nguoi_gui: nguoiGuiChuan,
      nguoi_nhan: nguoiNhanChuan,
      tieu_de: tieuDeChuan,
      noi_dung: noiDungChuan
    };

    const dongJson = JSON.stringify(banGhi) + '\n';
    fs.appendFileSync(tepJsonl, dongJson, 'utf8');

    const nguoiGuiMd = lamSachMotDongMd(banGhi.nguoi_gui);
    const nguoiNhanMd = lamSachMotDongMd(banGhi.nguoi_nhan);
    const tieuDeMd = lamSachMotDongMd(banGhi.tieu_de);
    const entryMd = `\n---\n### 📨 [${luc}] \`${nguoiGuiMd}\` ➔ \`${nguoiNhanMd}\`\n- **Mã tin:** \`${ma_tin}\`\n- **Tiêu đề:** ${tieuDeMd}\n- **Nội dung:**\n> ${banGhi.noi_dung.replace(/\r?\n/g, '\n> ')}\n`;
    fs.appendFileSync(tepMd, entryMd, 'utf8');

    try {
      fs.writeFileSync(tepChuong, luc, 'utf8');
    } catch (_) {}

    return {
      thanh_cong: true,
      ma_tin,
      luc,
      so_bytes: Buffer.byteLength(dongJson, 'utf8')
    };
  });
}

/**
 * 2. nhan_tin
 */
export async function nhanTin(rawArgs = {}) {
  chanThamSoLa(rawArgs, NHAN_TIN_KEYS);
  const nguoiNhanChuan = kiemTraDinhDanhGhe(rawArgs.nguoi_nhan, 'nguoi_nhan');
  const chi_tin_chua_doc = rawArgs.chi_tin_chua_doc === undefined ? true : Boolean(rawArgs.chi_tin_chua_doc);
  const gioiHanRaw = rawArgs.gioi_han === undefined ? 5 : Number(rawArgs.gioi_han);
  const gioi_han = Number.isFinite(gioiHanRaw) ? Math.min(Math.max(1, Math.trunc(gioiHanRaw)), 20) : 5;

  const dir = layThuMucHopThu();
  damBaoThuMuc(dir);
  const tepJsonl = path.join(dir, 'hop-thu.jsonl');
  const tepDaDoc = path.join(dir, 'da-doc.json');

  if (!fs.existsSync(tepJsonl)) {
    return {
      so_tin: 0,
      tin_nhan: [],
      canh_bao: 'KHONG_CO_TIN_MOI',
      loi_khuyen: 'Hộp thư rỗng (chưa có tin nào từng gửi). DỪNG gọi lại công cụ này ngay lập tức. Chờ mắt canh đánh thức hoặc đợi tối thiểu 60 giây.'
    };
  }

  let daDocMap = {};
  if (fs.existsSync(tepDaDoc)) {
    try {
      const raw = fs.readFileSync(tepDaDoc, 'utf8');
      daDocMap = JSON.parse(raw);
    } catch (err) {
      console.error(`[CANH_BAO] Không đọc được tệp da-doc.json: ${err.message}`);
    }
  }
  const daDocCuaGhe = daDocMap[nguoiNhanChuan] || {};

  const noiDungRaw = fs.readFileSync(tepJsonl, 'utf8');
  const cacDong = noiDungRaw.split('\n');
  const tinPhuHop = [];

  for (let i = 0; i < cacDong.length; i++) {
    const dong = cacDong[i].trim();
    if (!dong) continue;

    try {
      const tin = JSON.parse(dong);
      const dungNguoiNhan = tin.nguoi_nhan === nguoiNhanChuan || tin.nguoi_nhan === 'tat-ca';
      if (!dungNguoiNhan) continue;

      const daDoc = Boolean(daDocCuaGhe[tin.ma_tin]);
      if (chi_tin_chua_doc && daDoc) continue;

      tinPhuHop.push({
        ma_tin: tin.ma_tin,
        luc: tin.luc,
        nguoi_gui: tin.nguoi_gui,
        tieu_de: tin.tieu_de,
        noi_dung: tin.noi_dung,
        da_doc: daDoc
      });

      if (tinPhuHop.length >= gioi_han) {
        break;
      }
    } catch (_) {
      const tepCorrupt = path.join(dir, 'hop-thu.corrupt.log');
      fs.appendFileSync(tepCorrupt, `[${new Date().toISOString()}] Dòng ${i + 1} hỏng: ${dong}\n`, 'utf8');
    }
  }

  if (tinPhuHop.length === 0) {
    return {
      so_tin: 0,
      tin_nhan: [],
      canh_bao: 'KHONG_CO_TIN_MOI',
      loi_khuyen: 'Hộp thư rỗng. DỪNG gọi lại công cụ này ngay lập tức. Chờ mắt canh đánh thức hoặc đợi tối thiểu 60 giây.'
    };
  }

  return {
    so_tin: tinPhuHop.length,
    tin_nhan: tinPhuHop
  };
}

/**
 * 3. danh_dau_da_doc
 */
export async function danhDauDaDoc(rawArgs = {}) {
  chanThamSoLa(rawArgs, DANH_DAU_KEYS);
  const { ma_tin, nguoi_doc } = rawArgs;
  if (!ma_tin || (typeof ma_tin !== 'string' && !Array.isArray(ma_tin))) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu tham số 'ma_tin'");
  }
  const nguoiDocChuan = kiemTraDinhDanhGhe(nguoi_doc, 'nguoi_doc');
  const dsMaTin = (Array.isArray(ma_tin) ? ma_tin : [ma_tin]).map((m) => {
    if (!m || typeof m !== 'string' || !m.trim() || MAU_KY_TU_DIEU_KHIEN.test(m) || m.trim().length > 128) {
      throw new BrokerError(MA_LOI.THAM_SO_KHONG_HOP_LE, "Tham số 'ma_tin' không hợp lệ");
    }
    return m.trim();
  });

  const dir = layThuMucHopThu();
  const tepDaDoc = path.join(dir, 'da-doc.json');
  const luc = new Date().toISOString();

  return await voiKhoa(dir, async () => {
    let daDocMap = {};
    if (fs.existsSync(tepDaDoc)) {
      try {
        daDocMap = JSON.parse(fs.readFileSync(tepDaDoc, 'utf8'));
      } catch (_) {
        daDocMap = {};
      }
    }

    if (!daDocMap[nguoiDocChuan]) {
      daDocMap[nguoiDocChuan] = {};
    }

    for (const m of dsMaTin) {
      daDocMap[nguoiDocChuan][m] = luc;
    }

    const tepTam = path.join(dir, `da-doc.json.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tepTam, JSON.stringify(daDocMap, null, 2), 'utf8');
    fs.renameSync(tepTam, tepDaDoc);

    return {
      thanh_cong: true,
      so_tin_da_doc: dsMaTin.length,
      da_doc_luc: luc
    };
  });
}

/**
 * 4. soat_hop_thu
 */
export async function soatHopThu(rawArgs = {}) {
  chanThamSoLa(rawArgs, SOAT_HOP_THU_KEYS);
  const nguongRaw = rawArgs.nguong_treo_phut === undefined ? 15 : Number(rawArgs.nguong_treo_phut);
  const nguong_treo_phut = Number.isFinite(nguongRaw) && nguongRaw > 0 ? nguongRaw : 15;

  const dir = layThuMucHopThu();
  damBaoThuMuc(dir);
  const tepJsonl = path.join(dir, 'hop-thu.jsonl');
  const tepDaDoc = path.join(dir, 'da-doc.json');
  const tepCanhBao = path.join(dir, 'CANH-BAO-TIN-TREO.md');

  if (!fs.existsSync(tepJsonl)) {
    return { tong_so_tin: 0, tin_treo: [] };
  }

  let daDocMap = {};
  if (fs.existsSync(tepDaDoc)) {
    try {
      daDocMap = JSON.parse(fs.readFileSync(tepDaDoc, 'utf8'));
    } catch (_) {}
  }

  const noiDungRaw = fs.readFileSync(tepJsonl, 'utf8');
  const cacDong = noiDungRaw.split('\n');
  let tong_so_tin = 0;
  const tinTreo = [];
  const bayGio = Date.now();
  const nguongMs = nguong_treo_phut * 60 * 1000;

  for (const dong of cacDong) {
    if (!dong.trim()) continue;
    try {
      const tin = JSON.parse(dong);
      tong_so_tin++;
      const tuoiMs = bayGio - new Date(tin.luc).getTime();
      const daDoc = Boolean(daDocMap[tin.nguoi_nhan]?.[tin.ma_tin]);

      if (!daDoc && tuoiMs > nguongMs) {
        tinTreo.push({
          ma_tin: tin.ma_tin,
          nguoi_gui: tin.nguoi_gui,
          nguoi_nhan: tin.nguoi_nhan,
          tieu_de: tin.tieu_de,
          tuoi_phut: Math.round(tuoiMs / 60000)
        });
      }
    } catch (_) {}
  }

  if (tinTreo.length > 0) {
    let canhBaoMd = `# 🚨 CẢNH BÁO: PHÁT HIỆN ${tinTreo.length} TIN MỒ CÔI (TREO > ${nguong_treo_phut} PHÚT)\n\n`;
    canhBaoMd += `Quét lúc: ${new Date().toISOString()}\n\n`;
    canhBaoMd += `| Mã tin | Người gửi | Người nhận | Tiêu đề | Tuổi (phút) |\n|---|---|---|---|---|\n`;
    for (const t of tinTreo) {
      canhBaoMd += `| \`${lamSachMotDongMd(t.ma_tin)}\` | \`${lamSachMotDongMd(t.nguoi_gui)}\` | \`${lamSachMotDongMd(t.nguoi_nhan)}\` | ${lamSachMotDongMd(t.tieu_de)} | **${t.tuoi_phut}** |\n`;
    }
    fs.writeFileSync(tepCanhBao, canhBaoMd, 'utf8');
  }

  return {
    tong_so_tin,
    so_tin_treo: tinTreo.length,
    tin_treo: tinTreo
  };
}
