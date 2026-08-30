import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layO } from './kho-phien';
import { dangChay } from './doc-phien';

/**
 * MẨU CHẾT THÌ PHẢI KÊU — và phải ĐẾM ĐƯỢC.
 *
 * 🎯 VÌ SAO: một yêu cầu đánh thức chết mà ⛔ ai hay — nó chỉ lặng lẽ hết hạn rồi bị dọn.
 *    Ca thật 29-30/08: chuông trả `200`, người gửi yên trí đã tới, bên kia ⛔ hề nhận.
 *    Im lặng ⇒ ⛔ ai đi sửa, và ⛔ ai biết bệnh nào mới là bệnh đang giết ta.
 *
 * 📄 HỢP ĐỒNG với người đọc (`ai/do-lai-06-09.sh`): `ai/S1-KHUON-SO-DEM.md`.
 *    Lệch khuôn ⇒ ngày 06/09 đọc ra số SAI mà VẪN IM — đúng loại hỏng ta đang chữa.
 *    ⚠️ `cua` phải là CHUỖI "1".."6", ⛔ phải số.
 *
 * ⚠️ ⛔ BAO GIỜ được ném lỗi ra ngoài: đây là đường phụ. Sổ hỏng thì thôi,
 *    ⛔ được kéo sập lượt gọi của người ta.
 */

/** Sáu cửa — số hiệu là CHUỖI, khớp `S1-KHUON-SO-DEM.md`. */
export type MaCua = '1' | '2' | '3' | '4' | '5' | '6' | 'thieu-cua';

const TEN_CUA: Record<string, string> = {
  '1': 'không-poller (ô RẢNH mà ⛔ ai thăm dò — trình duyệt đóng)',
  '2': 'tab-ẩn (có tab thăm dò ô khác, riêng ô này ⛔ bao giờ được hỏi)',
  '3': 'quá-hạn vì ô BẬN (ô chạy suốt đời mẩu)',
  '4': 'claim-rồi-bỏ',
  '5': 'đổi-ghế (ghế ở ô lúc chết ≠ ghế lúc xếp hàng)',
  '6': 'hai-máy-chủ',
  'thieu-cua': '⛔ ĐO ĐƯỢC cửa nào — ⛔ đoán, để người đọc kêu',
};

/** 🔒 Chốt cứng theo khuôn. Biến môi trường CHỈ để phép thử ⛔ bẩn sổ thật. */
const SO_DEM =
  process.env.DUONG_DAN_SO_DEM ?? path.join(os.homedir(), 'Operations', 'dem-cua-mat-tin.jsonl');

/** Kênh — để người ta THẤY ngay, khác với sổ đếm là để CỘNG. */
const KENH =
  process.env.DUONG_DAN_KENH ??
  path.join(os.homedir(), 'idea', 'inbox', 'phong-ban-ai-boss', 'BOSS-CHANNEL.md');

/** ⛔ kêu hai lần một mẩu. Nhớ trong bộ nhớ tiến trình — ⛔ thêm người ghi đĩa. */
const daBao = new Set<string>();
const TRAN_NHO = 500;

export interface MauChet {
  ma: string;
  ma_o: string;
  ma_nhan_su: string;
  tu_ai: string;
  cau_hoi: string;
  luc: number;
  da_xu: boolean;
}

/** Lượt thăm dò quan sát được — do `kho-danh-thuc` giữ trong bộ nhớ. */
export interface ThamDo {
  toanCuc: number;
  cuaO: number;
}

/**
 * Mẩu chết vì CỬA nào.
 * 🔴 Luật: chỉ ghi cửa ĐO ĐƯỢC. ⛔ đo được thì ghi `thieu-cua` — người đọc CÓ đếm riêng
 *    và sẽ kêu. Đoán bừa một con số trông đẹp hơn, nhưng nó làm hỏng chính phép đo này.
 */
export function doanCua(m: MauChet, td: ThamDo): MaCua {
  let o: ReturnType<typeof layO> = null;
  try {
    o = layO(m.ma_o);
  } catch {
    return 'thieu-cua';
  }

  // ⑤ — chắc nhất, đo thẳng từ sổ ô.
  if (o?.ma_nhan_su && o.ma_nhan_su !== m.ma_nhan_su) return '5';

  // ③ vs ① — khuôn bắt phân biệt bằng «ô lúc mẩu chết RẢNH hay CHẠY».
  let ban: boolean | null = null;
  try {
    if (o?.ma_nhan_su && o.ma_phien) ban = dangChay(o.ma_nhan_su, o.ma_phien, o.moc_ket_thuc);
  } catch {
    ban = null;
  }
  if (ban === true) return '3';

  // ② — có tab thăm dò (ô khác) trong đời mẩu, riêng ô này ⛔ được hỏi lần nào.
  if (td.toanCuc >= m.luc && td.cuaO < m.luc) return '2';

  // ① — ô rảnh mà suốt đời mẩu ⛔ có lượt thăm dò nào tới máy chủ.
  if (ban === false && td.toanCuc < m.luc) return '1';

  return 'thieu-cua';
}

/** Một dòng cho người ĐỌC BẰNG MẮT trên kênh. Ép về MỘT dòng, ⛔ xuống dòng. */
export function dongKenh(m: MauChet, cua: MaCua, bayGio: number): string {
  const hoi = m.cau_hoi.replace(/\s+/g, ' ').slice(0, 60);
  return (
    `- ⚰️ MẨU CHẾT ${new Date(bayGio).toISOString()} · ma=${m.ma.slice(0, 8)} · ô=${m.ma_o}` +
    ` · ghế=${m.ma_nhan_su} · từ=${m.tu_ai} · cửa=${cua} ${TEN_CUA[cua]}` +
    ` · sống=${Math.round((bayGio - m.luc) / 1000)}s · «${hoi}»`
  );
}

/** Ghi sổ đếm + kêu lên kênh. Trả về cửa đã ghi, hoặc null nếu mẩu này kêu rồi. */
export function baoMauChet(m: MauChet, td: ThamDo, bayGio = Date.now()): MaCua | null {
  if (daBao.has(m.ma)) return null;
  daBao.add(m.ma);
  if (daBao.size > TRAN_NHO) {
    const cuNhat = daBao.values().next().value; // Set giữ thứ tự chèn ⇒ đầu là cũ nhất
    if (cuNhat !== undefined) daBao.delete(cuNhat);
  }

  const cua = doanCua(m, td);

  // ── sổ đếm (máy đọc) — đúng khuôn S1-KHUON-SO-DEM.md
  try {
    fs.mkdirSync(path.dirname(SO_DEM), { recursive: true });
    fs.appendFileSync(
      SO_DEM,
      `${JSON.stringify({
        luc: bayGio,
        ma: m.ma,
        cua,
        ma_o: m.ma_o,
        ma_nhan_su: m.ma_nhan_su,
        tu_ai: m.tu_ai,
        tuoi_giay: Math.round((bayGio - m.luc) / 1000),
        so_lan_thu: m.da_xu ? 1 : 0,
        ghi_chu: '',
      })}\n`,
      'utf8',
    );
  } catch {
    /* sổ ⛔ ghi được thì thôi — ⛔ để lỗi lan ra lượt gọi */
  }

  // ── kênh (người đọc)
  try {
    fs.appendFileSync(KENH, `${dongKenh(m, cua, bayGio)}\n`, 'utf8');
  } catch {
    /* kênh ⛔ ghi được thì thôi */
  }

  return cua;
}

/** Chỉ dùng cho phép thử. */
export function quenDaBao(): void {
  daBao.clear();
}
