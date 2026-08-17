import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * SỔ "YÊU CẦU ĐÁNH THỨC" — ghi XUỐNG ĐĨA, cùng chỗ với sổ ô↔phiên.
 *
 * 🎯 VÌ SAO CÓ TỆP NÀY: ghế trong app chạy `claude -p` ⇒ **sống một lượt rồi tắt**.
 *    ⛔ KHÔNG ghế nào canh kênh được. Muốn ghế A giao việc xong mà ghế B tự làm,
 *    phải có chỗ để A ĐẶT LẠI một mẩu giấy, và trình duyệt (thứ DUY NHẤT sống liên tục)
 *    nhặt mẩu giấy đó rồi bấm nút hộ.
 *
 * ⛔ CỔNG NÀY KHÔNG TỰ CHẠY LƯỢT CHAT. Nó chỉ ghi giấy. Chạy là việc của trình duyệt —
 *    nếu cả hai cùng chạy thì hai tiến trình cùng ghi MỘT tệp phiên = hỏng bản ghi
 *    (đúng cái bẫy `dangChay()` trong doc-phien.ts đang canh).
 *
 * ⚠️ Đọc-sửa-ghi ở đây đều là lệnh ĐỒNG BỘ, ⛔ không có `await` xen giữa ⇒ trong một
 *    tiến trình Node, hai yêu cầu ⛔ không chen được vào giữa nhau. Nhiều máy chủ thì
 *    phải đổi sang kho dùng chung — cùng giới hạn đã ghi ở README (chặn mức dùng).
 */

const THU_MUC = path.join(process.cwd(), '.trang-thai');
const TEP = path.join(THU_MUC, 'danh-thuc.json');

/** Yêu cầu quá hạn này mà chưa ai xử → BỎ. ⛔ Đừng đánh thức bằng câu đã cũ. */
export const HAN_YEU_CAU_MS = 3 * 60_000;

/** Trần đánh thức cho CẢ MÁY CHỦ (mỗi phút) — phanh chống vòng lặp A↔B đốt tiền thật. */
export const TRAN_MOI_PHUT = 6;

/** Giữ lại lịch sử một lúc để còn tra được ai gọi ai; quá thì dọn. */
const GIU_LICH_SU_MS = 10 * 60_000;
const TRAN_DONG_SO = 60;

export interface YeuCauDanhThuc {
  ma: string;
  ma_o: string;
  ma_nhan_su: string;
  /** Ai đánh thức — tên kỹ thuật của ghế gửi. Hiện lên giao diện làm nhãn. */
  tu_ai: string;
  cau_hoi: string;
  luc: number;
  da_xu: boolean;
  xu_luc: number | null;
}

interface So {
  hang_doi: YeuCauDanhThuc[];
  /** Mốc các lần đánh thức ĐÃ NHẬN — cửa sổ trượt 60 giây cho cả máy chủ. */
  moc_goi: number[];
}

const SO_TRONG: So = { hang_doi: [], moc_goi: [] };

function doc(): So {
  try {
    const j = JSON.parse(fs.readFileSync(TEP, 'utf8')) as Partial<So>;
    return {
      hang_doi: Array.isArray(j.hang_doi) ? j.hang_doi : [],
      moc_goi: Array.isArray(j.moc_goi) ? j.moc_goi : [],
    };
  } catch {
    return { ...SO_TRONG };
  }
}

function ghi(s: So): void {
  fs.mkdirSync(THU_MUC, { recursive: true });
  // Ghi tệp tạm rồi đổi tên → ⛔ không để lại JSON dở dang nếu tắt máy giữa chừng.
  const tam = `${TEP}.tam`;
  fs.writeFileSync(tam, JSON.stringify(s, null, 2), 'utf8');
  fs.renameSync(tam, TEP);
}

function donDep(s: So, bayGio: number): So {
  return {
    hang_doi: s.hang_doi
      .filter((y) => bayGio - y.luc < GIU_LICH_SU_MS)
      .slice(-TRAN_DONG_SO),
    moc_goi: s.moc_goi.filter((t) => bayGio - t < 60_000),
  };
}

/** Yêu cầu này còn dùng được không (chưa xử + chưa quá 3 phút). */
export function conDung(y: YeuCauDanhThuc, bayGio = Date.now()): boolean {
  return !y.da_xu && bayGio - y.luc < HAN_YEU_CAU_MS;
}

export type KetQuaXin =
  | { cho_qua: true; con_lai: number }
  | { cho_qua: false; ly_do: string; cho_giay: number };

/**
 * Xin một suất đánh thức. Chặn mức dùng ở ĐÂY, ⛔ không ở tầng trình duyệt —
 * trình duyệt là thứ dễ bỏ qua nhất (curl thẳng vào cổng là xong).
 *
 * ⭐ Trần đếm **LƯỢT GỌI**, ⛔ KHÔNG phải lượt xếp hàng thành công. Vì sao:
 *    thứ ta sợ là VÒNG LẶP — mà vòng lặp gọi hụt (ghế đích ⛔ không mở ô nào) vẫn quay
 *    hết tốc lực. Đếm theo "gọi thành công" thì cái vòng ồn ào nhất lại ⛔ không bị chặn.
 */
export function xinLuot(): KetQuaXin {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);

  if (s.moc_goi.length >= TRAN_MOI_PHUT) {
    const somNhat = Math.min(...s.moc_goi);
    const choGiay = Math.max(1, Math.ceil((somNhat + 60_000 - bayGio) / 1000));
    ghi(s);
    return {
      cho_qua: false,
      ly_do:
        `⛔ Quá ${TRAN_MOI_PHUT} lượt đánh thức mỗi phút cho CẢ máy chủ ` +
        `(đã dùng ${s.moc_goi.length}/${TRAN_MOI_PHUT}). ` +
        'Trần này chặn vòng lặp ghế-đánh-thức-ghế đốt tiền thật. ' +
        `Chờ ${choGiay} giây rồi gọi lại.`,
      cho_giay: choGiay,
    };
  }

  s.moc_goi.push(bayGio);
  ghi(s);
  return { cho_qua: true, con_lai: TRAN_MOI_PHUT - s.moc_goi.length };
}

/** Xếp hàng yêu cầu — gọi SAU khi đã xin được suất và đã tìm ra ô. */
export function xepHang(ts: {
  maO: string;
  maNhanSu: string;
  tuAi: string;
  cauHoi: string;
}): YeuCauDanhThuc {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);
  const yeuCau: YeuCauDanhThuc = {
    ma: randomUUID(),
    ma_o: ts.maO,
    ma_nhan_su: ts.maNhanSu,
    tu_ai: ts.tuAi,
    cau_hoi: ts.cauHoi,
    luc: bayGio,
    da_xu: false,
    xu_luc: null,
  };
  s.hang_doi.push(yeuCau);
  ghi(s);
  return yeuCau;
}

/**
 * Trình duyệt NHẬN việc cho một ô: lấy yêu cầu cũ nhất còn hạn rồi ĐÁNH DẤU ĐÃ XỬ ngay
 * trong cùng một lượt đọc-ghi.
 *
 * ⭐ Vì sao đánh dấu NGAY lúc trao chứ ⛔ không đợi trình duyệt báo lại: hai ô/hai tab
 *    cùng thăm dò sẽ nhận trùng một yêu cầu ⇒ chạy hai lượt = trả tiền hai lần.
 *    Mất một lượt đánh thức (tải lại trang đúng lúc) rẻ hơn chạy đúp.
 */
export function nhanYeuCau(maO: string): YeuCauDanhThuc | null {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);
  const y = s.hang_doi.find((x) => x.ma_o === maO && conDung(x, bayGio));
  if (!y) {
    ghi(s);
    return null;
  }
  y.da_xu = true;
  y.xu_luc = bayGio;
  ghi(s);
  return y;
}

/** Xem sổ (chỉ đọc) — để nghiệm thu / tra cứu, ⛔ không đụng gì. */
export function xemSo(): { hang_doi: YeuCauDanhThuc[]; con_lai: number; tran_moi_phut: number } {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);
  return {
    hang_doi: s.hang_doi,
    con_lai: Math.max(0, TRAN_MOI_PHUT - s.moc_goi.length),
    tran_moi_phut: TRAN_MOI_PHUT,
  };
}
