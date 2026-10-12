/**
 * 🤖 BỘ CHẠY NỀN — Kế thừa từ aiboss-app-chat.
 *
 * ⚠️ Trong AIBOSS Office, office-runner (src/lib/office-runner.ts) là ĐỘNG CƠ DUY NHẤT.
 *    Bộ chạy nền này (may-chay-nen.ts) ĐÃ ĐƯỢC VÔ HIỆU HÓA HOÀN TOÀN (Pha 5C-b).
 *    raMotVong, raMotVongLoi, bat luôn trả về 0 / false và không bao giờ chạm vào nhanYeuCau
 *    hay giành chuông trong bất kỳ điều kiện nào.
 */

/** Mã người giữ mẩu, để phân biệt với trình duyệt trong sổ. */
export const NGUOI_GIU_NEN = 'may-chu-nen';

/** Ô im lâu hơn ngần này thì coi là KHÔNG có trình duyệt lái nó. */
export const IM_CAN_MS = 45_000;

/** Nhịp rà hàng đợi. */
export const NHIP_MS = 10_000;

let dangChay = false;
let donGio: ReturnType<typeof setInterval> | null = null;

/** Số đo tương thích — giữ nguyên cấu trúc để không làm gãy caller / test cũ. */
export const dem = {
  vong: 0,
  daChay: 0,
  boQuaDangChay: 0,
  boQuaCoTrinhDuyet: 0,
  loi: 0,
  mophienMoi: 0,
  boQuaKhongThayPhien: 0,
  boQuaChayNoiKhac: 0,
  buocOThatBai: 0,
  boQuaTaiNhap: 0,
};

/**
 * Rà MỘT vòng lõi.
 * Đã vô hiệu hóa: luôn trả về 0, không bao giờ lấy mẩu.
 */
export async function raMotVongLoi(_bayGio?: number): Promise<number> {
  void _bayGio;
  return 0;
}

/**
 * Rà MỘT vòng.
 * Đã vô hiệu hóa: luôn trả về 0, không bao giờ lấy mẩu.
 */
export async function raMotVong(_bayGio = Date.now()): Promise<number> {
  void _bayGio;
  if (process.env.CHAY_NEN === '1') {
    console.warn('[chay-nen] CHAY_NEN ignored: office-runner is the single engine');
  }
  return 0;
}

let layThamDo: ((maO: string) => number | undefined) | null = null;

/** Cho phép nơi khác cắm nguồn dấu vết thăm dò. */
export function datNguonThamDo(f: (maO: string) => number | undefined): void {
  layThamDo = f;
  void layThamDo;
}

/**
 * Bật bộ chạy nền.
 * Trong AIBOSS Office, office-runner là động cơ duy nhất; may-chay-nen luôn tắt.
 */
export function bat(): boolean {
  if (process.env.CHAY_NEN === '1') {
    console.warn('[chay-nen] CHAY_NEN ignored: office-runner is the single engine');
  }
  return false;
}

/** Tắt — cho nghiệm thu và cho lúc máy chủ đóng. */
export function tat(): void {
  if (donGio) clearInterval(donGio);
  donGio = null;
  dangChay = false;
}

/** Đang bật hay không. Luôn là false trong AIBOSS Office. */
export function dangBat(): boolean {
  return dangChay;
}
