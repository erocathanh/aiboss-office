/**
 * Bundled AIBOSS Office MCP Agent Broker core storage engine.
 * Source: Copied from agent-broker-mcp (commit 0d1ed6c) on 2026-10-15.
 * Mailbox location: Reads and writes mailbox files in process.env.MCP_HOP_THU_DIR,
 * defaulting to <REPO_ROOT>/operations/data/mailbox relative to this module so it
 * never depends on an external ~/Operations/kenh-mcp directory on customer machines.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO_MAILBOX_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/mailbox'
);

export const MA_LOI = {
  THIEU_THAM_SO: 'THIEU_THAM_SO',
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

export function layThuMucHopThu(thuMucOverride) {
  return thuMucOverride || process.env.MCP_HOP_THU_DIR || DEFAULT_REPO_MAILBOX_DIR;
}

export function damBaoThuMuc(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
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
        // Kiểm tra xem khoá đã quá hạn chưa (stale lock recovery)
        try {
          const stat = fs.statSync(lockDir);
          if (Date.now() - stat.mtimeMs > ttlMs) {
            fs.rmdirSync(lockDir);
            continue; // Thử lại ngay sau khi gỡ khoá chết
          }
        } catch (_) {
          // Thư mục khoá vừa bị tiến trình khác xoá, thử lại vòng lặp
          continue;
        }

        if (Date.now() - batDau >= timeoutMs) {
          throw new BrokerError(
            MA_LOI.KHOA_TEP_THAT_BAI,
            `Không thể lấy khoá ${lockDir} sau ${timeoutMs}ms (đang có tiến trình khác giữ khoá)`
          );
        }
        // Chờ ngẫu nhiên 30-80ms trước khi thử lại
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

/**
 * 1. gui_tin
 */
export async function guiTin({ nguoi_gui, nguoi_nhan, tieu_de, noi_dung, thu_muc, timeout_khoa_ms = 5000 }) {
  if (!nguoi_gui || typeof nguoi_gui !== 'string' || !nguoi_gui.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'nguoi_gui'");
  }
  if (!nguoi_nhan || typeof nguoi_nhan !== 'string' || !nguoi_nhan.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'nguoi_nhan'");
  }
  if (!tieu_de || typeof tieu_de !== 'string' || !tieu_de.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'tieu_de'");
  }
  if (!noi_dung || typeof noi_dung !== 'string' || !noi_dung.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'noi_dung'");
  }

  const dir = layThuMucHopThu(thu_muc);
  const tepJsonl = path.join(dir, 'hop-thu.jsonl');
  const tepMd = path.join(dir, 'HOP-THU.md');
  const tepChuong = path.join(dir, '.chuong-bao');

  return await voiKhoa(dir, async () => {
    const ma_tin = sinhMaTin();
    const luc = new Date().toISOString();

    const banGhi = {
      ma_tin,
      luc,
      nguoi_gui: nguoi_gui.trim(),
      nguoi_nhan: nguoi_nhan.trim(),
      tieu_de: tieu_de.trim().slice(0, 150),
      noi_dung: noi_dung.trim()
    };

    const dongJson = JSON.stringify(banGhi) + '\n';
    fs.appendFileSync(tepJsonl, dongJson, 'utf8');

    // Cập nhật bản chiếu Markdown cho người đọc
    const entryMd = `\n---\n### 📨 [${luc}] \`${banGhi.nguoi_gui}\` ➔ \`${banGhi.nguoi_nhan}\`\n- **Mã tin:** \`${ma_tin}\`\n- **Tiêu đề:** ${banGhi.tieu_de}\n- **Nội dung:**\n> ${banGhi.noi_dung.replace(/\n/g, '\n> ')}\n`;
    fs.appendFileSync(tepMd, entryMd, 'utf8');

    // Chạm chuông báo
    try {
      fs.writeFileSync(tepChuong, luc, 'utf8');
    } catch (_) {}

    return {
      thanh_cong: true,
      ma_tin,
      luc,
      so_bytes: Buffer.byteLength(dongJson, 'utf8')
    };
  }, timeout_khoa_ms);
}

/**
 * 2. nhan_tin
 */
export async function nhanTin({ nguoi_nhan, chi_tin_chua_doc = true, gioi_han = 5, thu_muc }) {
  if (!nguoi_nhan || typeof nguoi_nhan !== 'string' || !nguoi_nhan.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu hoặc sai tham số bắt buộc 'nguoi_nhan'");
  }

  const dir = layThuMucHopThu(thu_muc);
  const tepJsonl = path.join(dir, 'hop-thu.jsonl');
  const tepDaDoc = path.join(dir, 'da-doc.json');
  const nguoiNhanChuan = nguoi_nhan.trim();

  if (!fs.existsSync(tepJsonl)) {
    return {
      so_tin: 0,
      tin_nhan: [],
      canh_bao: 'KHONG_CO_TIN_MOI',
      loi_khuyen: 'Hộp thư rỗng (chưa có tin nào từng gửi). DỪNG gọi lại công cụ này ngay lập tức. Chờ mắt canh đánh thức hoặc đợi tối thiểu 60 giây.'
    };
  }

  // Đọc chỉ mục đã đọc
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

  // Đọc từng dòng jsonl an toàn
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
    } catch (err) {
      // Dòng hỏng: ghi log sang tệp corrupt, không làm sập server
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
export async function danhDauDaDoc({ ma_tin, nguoi_doc, thu_muc }) {
  if (!ma_tin || (typeof ma_tin !== 'string' && !Array.isArray(ma_tin))) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu tham số 'ma_tin'");
  }
  if (!nguoi_doc || typeof nguoi_doc !== 'string' || !nguoi_doc.trim()) {
    throw new BrokerError(MA_LOI.THIEU_THAM_SO, "Thiếu tham số 'nguoi_doc'");
  }

  const dir = layThuMucHopThu(thu_muc);
  const tepDaDoc = path.join(dir, 'da-doc.json');
  const nguoiDocChuan = nguoi_doc.trim();
  const dsMaTin = Array.isArray(ma_tin) ? ma_tin : [ma_tin];
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

    // Ghi an toàn bằng tệp tạm rồi đổi tên
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
export async function soatHopThu({ nguong_treo_phut = 15, thu_muc } = {}) {
  const dir = layThuMucHopThu(thu_muc);
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
      canhBaoMd += `| \`${t.ma_tin}\` | \`${t.nguoi_gui}\` | \`${t.nguoi_nhan}\` | ${t.tieu_de} | **${t.tuoi_phut}** |\n`;
    }
    fs.writeFileSync(tepCanhBao, canhBaoMd, 'utf8');
  }

  return {
    tong_so_tin,
    so_tin_treo: tinTreo.length,
    tin_treo: tinTreo
  };
}
