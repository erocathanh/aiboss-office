import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { baoMauChet } from './bao-mau-chet';

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

/**
 * ⏳ TRẦN CỨNG khi mẩu đang được GIỮ vì ô bận (P0-2a, 30/08/2026).
 *
 * 🐛 Bệnh cũ: ô bận quá 3 phút thì mẩu hết hạn ÂM THẦM. Người gửi thấy `200` tưởng đã tới;
 *    người nhận ⛔ BAO GIỜ thấy. Đúng con bệnh «rơi im lặng» trong sổ bẫy.
 * ✅ Nay ô bận thì đồng hồ 3 phút được DỜI theo mỗi nhịp thăm dò báo bận.
 * ⚠️ Nhưng ⛔ được giữ vô hạn: ô bận vĩnh viễn thì mẩu sống mãi, mà **giữ mãi cũng là
 *    một kiểu im lặng** — chỉ khác chỗ nó im ở phía bên kia. Quá trần này thì BỎ,
 *    và mẩu rơi khỏi sổ với `da_xu = false` nên `baoMauChet` tự kêu + tự ghi sổ đếm.
 *
 * 🔴 CON SỐ 30 PHÚT LÀ SỐ ĐẶT RA, ⛔ PHẢI SỐ ĐO ĐƯỢC — đính chính 30/08 sau khi Hermes soi.
 *    Nó KHÔNG lấy từ đâu cả; ai đọc chú thích cũ dễ tưởng nó có căn cứ.
 *    Đo tại nguồn `~/Development/openclaw/src/infra/heartbeat-wake.ts:94`:
 *      DEFAULT_RETRY_MS = 1_000  ·  DEFAULT_COALESCE_MS = 250
 *      ⇒ openclaw **⛔ có hạn sống** cho mẩu bị chặn vì bận — họ THỬ LẠI sau 1 giây.
 *    ⇒ Cả cách «giữ rồi đặt trần» này còn đang chờ đề bài lại. ⛔ xây tiếp lên nó.
 */
export const TRAN_GIU_MS = 30 * 60_000;

/** Trần đánh thức cho CẢ MÁY CHỦ (mỗi phút) — phanh chống vòng lặp A↔B đốt tiền thật. */
export const TRAN_MOI_PHUT = 6;

/** Giữ lại lịch sử một lúc để còn tra được ai gọi ai; quá thì dọn. */
const GIU_LICH_SU_MS = 10 * 60_000;
const TRAN_DONG_SO = 60;

/**
 * 🏷 TRẠNG THÁI CÓ NHÃN — thay cho `da_xu: boolean` (P0-2b, 31/08/2026).
 *
 * 📐 HỌC HÌNH DẠNG openclaw `heartbeat-wake.ts:7-9`: kết quả của họ là HỢP CÓ NHÃN
 *    `{status:"ran"|"skipped"|"failed", reason}` — ⛔ phải boolean.
 * 🐛 VÌ SAO ĐỔI: `da_xu` là boolean nên nó ⛔ mang được LÝ DO. Mọi ca hỏng đều trông
 *    GIỐNG HỆT NHAU: hết hạn, lệch ghế, tab chết giữa chừng — cùng ra `false` rồi biến mất.
 *    Đó chính là gốc của «hỏng im lặng» mà đội này đuổi cả hai ngày.
 */
export type TrangThaiMau =
  | 'cho'       /** chờ giao */
  | 'dang_giu'  /** đã trao cho MỘT trình duyệt, đang chờ nó xác nhận */
  | 'da_giao'   /** trình duyệt xác nhận đã bắt đầu gửi vào ô */
  | 'bo';       /** bỏ — LUÔN kèm `ly_do`, ⛔ bao giờ bỏ trống */

/**
 * 📋 DANH SÁCH LÝ DO BỎ — tường minh, ⛔ phải chuỗi tự do.
 * 📐 Học `heartbeat-wake.ts:11-27`: họ khai HẰNG SỐ cho từng lý do rồi dựng một
 *    DANH SÁCH CHO PHÉP + một hàm hỏi. «Thử lại mọi thứ» sai; «bỏ mọi thứ» cũng sai.
 */
export const BO_QUA_HAN = 'qua-han';
export const BO_QUA_TRAN_GIU = 'qua-tran-giu';
export const BO_QUET_THEO_TUOI = 'quet-theo-tuoi';
const LY_DO_BIET = new Set([BO_QUA_HAN, BO_QUA_TRAN_GIU, BO_QUET_THEO_TUOI]);

/**
 * 📐 Học `heartbeat-reason.ts`: lý do rỗng được chuẩn hoá thành MỘT giá trị ổn định,
 *    ⛔ bao giờ để trống. Lý do trống thì cột «vì sao bỏ» thành vô dụng, mà đó đúng là
 *    cột ta dựng máy trạng thái này để có.
 */
export function chuanHoaLyDo(lyDo?: string): string {
  const s = (lyDo ?? '').trim();
  if (!s) return 'khong-ro';
  return LY_DO_BIET.has(s) ? s : s.slice(0, 60);
}

/** ⏳ Hạn GIỮ CHỖ khi đã trao mẩu cho một trình duyệt mà chưa được xác nhận.
 *  🔴 30 GIÂY LÀ SỐ ĐỀ XUẤT, CHƯA ĐO — PM ghi rõ trong đề bài, tôi ghi lại ở đây.
 *     ⛔ đóng đinh cho tới khi có số thật; ⛔ để nó thành «30 phút» thứ hai. */
export const HAN_GIU_CHO_MS = 30_000;

export interface YeuCauDanhThuc {
  ma: string;
  wakeId?: string;
  ma_o: string;
  ma_nhan_su: string;
  /** Ai đánh thức — tên kỹ thuật của ghế gửi. Hiện lên giao diện làm nhãn. */
  tu_ai: string;
  cau_hoi: string;
  luc: number;
  da_xu: boolean;
  xu_luc: number | null;
  /** 🏷 Trạng thái có nhãn. `da_xu` giữ song song cho sổ CŨ còn đọc được. */
  trang_thai?: TrangThaiMau;
  /** Vì sao bỏ — BẮT BUỘC khi `trang_thai === 'bo'`. */
  ly_do?: string;
  /** Mã trình duyệt đang GIỮ CHỖ mẩu này (⛔ phải mã phiên chat). */
  giu_boi?: string;
  /** Hạn giữ chỗ; quá hạn mà chưa xác nhận ⇒ TỰ TRẢ VỀ 'cho'. */
  giu_han?: number;
  /** Khoá chống trùng do người gửi cấp — cùng khoá ⇒ trả lại mẩu CŨ. */
  khoa?: string;
  /** Bỏ LÚC NÀO. ⛔ có trường này thì người đọc phải đi mượn mốc khác, và mốc khác nghĩa khác. */
  bo_luc?: number;
  /** Bỏ TỪ trạng thái nào. Ra 'da_giao' là mâu thuẫn TỰ KHAI, khỏi phải suy. */
  truoc_do?: TrangThaiMau;
  /**
   * ⏳ Lần gần nhất ô đích được BÁO LÀ ĐANG BẬN. Có mặt = mẩu đang được giữ chờ ô rảnh.
   * Đồng hồ 3 phút tính từ mốc này thay vì từ `luc` — nhưng vẫn chịu trần `TRAN_GIU_MS`
   * tính từ `luc` GỐC, ⛔ phải từ mốc đã dời (⛔ thì nó tự gia hạn vô tận).
   */
  giu_toi?: number;
}

interface So {
  hang_doi: YeuCauDanhThuc[];
  /** Mốc các lần đánh thức ĐÃ NHẬN — cửa sổ trượt 60 giây cho cả máy chủ. */
  moc_goi: number[];
}

const SO_TRONG: So = { hang_doi: [], moc_goi: [] };

/**
 * Sổ THĂM DÒ — chỉ trong bộ nhớ tiến trình, ⛔ ghi đĩa (⛔ thêm người ghi).
 * Dùng để tách cửa ② («có tab, riêng ô này ⛔ được hỏi») khỏi cửa ① («⛔ ai thăm dò»).
 * Mất khi khởi động lại ⇒ cửa sẽ lùi về `thieu-cua`, ⛔ bịa ra cửa sai.
 */
let thamDoCuoiToanCuc = 0;
const thamDoTheoO = new Map<string, number>();

/** Trình duyệt vừa hỏi ô này. Gọi ở ĐẦU mỗi lần nhận việc. */
export function ghiNhanThamDo(maO: string, bayGio = Date.now()): void {
  thamDoCuoiToanCuc = bayGio;
  thamDoTheoO.set(maO, bayGio);
}

/**
 * Trình duyệt thăm dò ô này lần cuối lúc nào (`undefined` = CHƯA lần nào kể từ khi máy chủ khởi).
 *
 * 🎯 Sinh ra cho bộ chạy nền (P0-2c): nó phải biết ô nào CÒN người lái để đứng ngoài.
 * ⚠️ Sổ nằm TRONG BỘ NHỚ. Máy chủ khởi lại là rỗng ⇒ `undefined` nghĩa là
 *    **«tôi KHÔNG BIẾT»**, KHÔNG phải «chắc chắn không ai mở app».
 *    Người đọc phải tự chọn phía an toàn cho ca của mình — xem `may-chay-nen.ts`.
 */
export function thamDoCuoiCua(maO: string): number | undefined {
  return thamDoTheoO.get(maO);
}

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
  // 🔴 Tên tệp tạm phải RIÊNG cho từng tiến trình + từng lần ghi.
  // Ca thật 29/08: hai máy chủ cùng sống (một cái mồ côi sau `bootout`) ⇒ cả hai dùng
  // chung đúng một tên `<tệp>.tam` ⇒ bên này ghi dở thì bên kia `rename` mất, và sổ
  // nhận nguyên một tệp JSON của người khác — hỏng IM LẶNG, ⛔ báo lỗi.
  const tam = `${TEP}.${process.pid}.${Date.now()}.tam`;
  try {
    fs.writeFileSync(tam, JSON.stringify(s, null, 2), 'utf8');
    fs.renameSync(tam, TEP);
  } catch (loi) {
    try { fs.unlinkSync(tam); } catch { /* tệp chưa kịp sinh ra */ }
    throw loi;
  }
}

function donDep(s: So, bayGio: number): So {
  /**
   * ↩️ BƯỚC 1 — TRẢ CHỖ TRƯỚC MỌI THỨ KHÁC.
   * ⚠️ Thứ tự ở đây là thứ dễ làm sai nhất: nếu hỏi «còn dùng được ⛔» TRƯỚC khi trả chỗ,
   *    mẩu đang giữ-quá-hạn vẫn mang nhãn 'dang_giu' ⇒ bị tính là đã xử ⇒ CHẾT OAN,
   *    đúng cái lỗ ta dựng lease để bịt.
   */
  traVeMauHetHan(s, bayGio);

  /**
   * 🗑 BƯỚC 2 — mẩu 'cho' mà đã quá hạn thì BỎ **CÓ LÝ DO**, ⛔ để nó lặng lẽ biến mất.
   *    Trước đây mẩu chỉ rơi khỏi danh sách; nay nó mang nhãn 'bo' + `ly_do` nên tra được.
   */
  for (const y of s.hang_doi) {
    if (trangThai(y) !== 'cho') continue;
    if (bayGio - y.luc >= TRAN_GIU_MS) { boMau(y, BO_QUA_TRAN_GIU, bayGio); continue; }
    if (!conDung(y, bayGio)) boMau(y, BO_QUA_HAN, bayGio);
  }

  const giu = s.hang_doi
    // ⏳ Mẩu đang được GIỮ vì ô bận phải sống quá mốc 10 phút — ⛔ thì trần 30 phút
    //    ⛔ bao giờ tới nơi, và mẩu vẫn chết âm thầm y như cũ, chỉ muộn hơn.
    .filter((y) => conDung(y, bayGio) || bayGio - y.luc < GIU_LICH_SU_MS)
    .slice(-TRAN_DONG_SO);

  // ⚰️ Mẩu RƠI KHỎI sổ mà `da_xu` vẫn false = chết ⛔ tới đích ⇒ KÊU + GHI SỔ ĐẾM.
  // Kêu ở ĐÂY vì đây đúng là chỗ mẩu biến mất ⇒ mỗi mẩu chỉ đi qua đúng MỘT lần.
  // (`baoMauChet` còn nhớ mã mẩu, nên `xemSo` đọc-mà-⛔-ghi cũng ⛔ làm kêu lặp.)
  for (const y of s.hang_doi) {
    if (trangThai(y) === 'cho' && !giu.includes(y)) boMau(y, BO_QUET_THEO_TUOI, bayGio);
  }

  return { hang_doi: giu, moc_goi: s.moc_goi.filter((t) => bayGio - t < 60_000) };
}

/**
 * 🏷 Đọc trạng thái của một mẩu, CHỊU ĐƯỢC sổ cũ ⛔ có trường `trang_thai`.
 * ⚠️ Sổ trên đĩa lúc nâng cấp vẫn còn mẩu kiểu CŨ. Đọc thẳng `y.trang_thai` là
 *    `undefined` ⇒ mọi so sánh đều sai âm thầm. Phải quy đổi từ `da_xu`.
 */
export function trangThai(y: YeuCauDanhThuc): TrangThaiMau {
  if (y.trang_thai) return y.trang_thai;
  return y.da_xu ? 'da_giao' : 'cho';
}

/**
 * Đặt trạng thái + GIỮ `da_xu` khớp theo, để mã cũ đọc sổ ⛔ hiểu sai.
 *
 * 🐛 BẢN ĐẦU CỦA TÔI SAI, và nó làm hỏng SỔ ĐẾM (ghế soi bắt 31/08):
 *      `y.da_xu = tt !== 'cho'`  ⇒ mẩu bị **BỎ** cũng mang `da_xu = true`
 *    Mà `bao-mau-chet.ts:132` suy «số lần thử» TỪ `da_xu` ⇒ sổ đếm khai «đã thử 1 lần»
 *    cho những mẩu **⛔ hề được trao cho tab nào**. Đo có ranh giới sạch:
 *      trước khi bản này lên: so_lan_thu = 0 · 3/3 mẩu
 *      sau  khi bản này lên: so_lan_thu = 1 · 7/7 mẩu, mà cả 7 đều ⛔ có `xu_luc`
 * ✅ `da_xu` phải giữ ĐÚNG nghĩa gốc: **đã trao cho một tab ⛔**, ⛔ phải «⛔ còn chờ».
 * 📌 Bài học: đổi nghĩa một trường CŨ thì phải đi tìm MỌI kẻ đọc nó. Tôi đổi nghĩa
 *    rồi mới nhớ ra `bao-mau-chet.ts` cũng đọc — và nó là cái thước cả đội đang cầm.
 */
function datTrangThai(y: YeuCauDanhThuc, tt: TrangThaiMau): void {
  y.trang_thai = tt;
  y.da_xu = tt === 'dang_giu' || tt === 'da_giao';
}

/**
 * 🗑 BỎ một mẩu — LUÔN kèm lý do, và LUÔN có tiếng.
 * 📌 Việc ⑤ của đề: mọi lần bỏ phải kêu. Bỏ im lặng là con bệnh gốc.
 */
function boMau(y: YeuCauDanhThuc, lyDo: string, bayGio: number): void {
  /**
   * ⚠️ KÊU **TRƯỚC** khi đổi trạng thái — thứ tự ở đây quyết định số đo đúng hay sai.
   *    `baoMauChet` suy «số lần thử» từ `da_xu`. Đổi trạng thái trước rồi mới kêu thì nó
   *    đọc `da_xu` của trạng thái MỚI, ⛔ phải của lúc mẩu còn sống.
   *    Kêu trước ⇒ mẩu chưa từng được trao ra 0, mẩu đã từng được trao ra 1. ĐÚNG cả hai.
   */
  baoMauChet(y, { toanCuc: thamDoCuoiToanCuc, cuaO: thamDoTheoO.get(y.ma_o) ?? 0 }, bayGio);
  // 📓 Ghi lại BỎ TỪ ĐÂU và BỎ LÚC NÀO — để lần sau bản ghi TỰ KỂ, ⛔ bắt ai ghép mảnh.
  //    Thiếu hai trường này chính là thứ đẩy người đọc sang mượn `xu_luc` (mốc GIAO)
  //    làm mốc chết — và đó là cách một báo động giả ra đời hôm nay.
  y.truoc_do = trangThai(y);
  y.bo_luc = bayGio;
  datTrangThai(y, 'bo');
  y.ly_do = chuanHoaLyDo(lyDo);
}

/**
 * ↩️ TRẢ VỀ những mẩu đã trao mà QUÁ HẠN GIỮ CHỖ mà chưa được xác nhận.
 *
 * 🐛 Lỗ Hermes tìm ra: bản cũ đánh dấu «đã xử» NGAY lúc trao. Tab chết giữa chừng
 *    (rớt mạng · đóng tab · lỗi phân tích) ⇒ mẩu coi như đã giao mà **⛔ ai nhận**.
 * ✅ Nay trao chỉ là GIỮ CHỖ. ⛔ xác nhận trong hạn ⇒ mẩu QUAY LẠI hàng đợi, ⛔ mất.
 */
function traVeMauHetHan(s: So, bayGio: number): number {
  let dem = 0;
  for (const y of s.hang_doi) {
    if (trangThai(y) !== 'dang_giu') continue;
    if ((y.giu_han ?? 0) > bayGio) continue;
    datTrangThai(y, 'cho');
    delete y.giu_boi;
    delete y.giu_han;
    dem += 1;
  }
  return dem;
}

/**
 * Yêu cầu này còn dùng được ⛔ — chưa xử, chưa quá hạn.
 *
 * 📌 HAI đồng hồ, ⛔ phải một:
 *    · đồng hồ 3 phút  — tính từ `giu_toi` nếu ô đang bận, ⛔ thì từ `luc`
 *    · TRẦN 30 phút    — LUÔN tính từ `luc` GỐC, ⛔ bao giờ dời
 *   Thiếu vế hai thì một ô bận liên tục sẽ gia hạn mẩu tới vô tận.
 */
export function conDung(y: YeuCauDanhThuc, bayGio = Date.now()): boolean {
  if (trangThai(y) !== 'cho') return false;
  if (bayGio - y.luc >= TRAN_GIU_MS) return false;
  const mocDem = Math.max(y.luc, y.giu_toi ?? 0);
  return bayGio - mocDem < HAN_YEU_CAU_MS;
}

/**
 * 🤚 GIỮ mẩu cho những ô ĐANG BẬN — gọi ở đầu mỗi nhịp thăm dò.
 *
 * ⚠️ Máy chủ ⛔ TỰ BIẾT ô nào bận: `dangChay` là trạng thái của TRÌNH DUYỆT.
 *    Nên trình duyệt phải khai ra, và đây là chỗ nhận lời khai đó.
 * 📌 Chỉ dời đồng hồ cho mẩu CHƯA xử và CHƯA quá trần — ⛔ hồi sinh mẩu đã chết.
 * Trả về số mẩu thực sự được giữ, để bên gọi ⛔ phải đoán.
 */
export function giuChoOBan(dsBan: string[], bayGio = Date.now()): number {
  if (dsBan.length === 0) return 0;
  const ban = new Set(dsBan);
  const s = donDep(doc(), bayGio);
  let dem = 0;
  for (const y of s.hang_doi) {
    if (trangThai(y) !== 'cho') continue;   // ⛔ đọc `da_xu` nữa — nó ⛔ còn nghĩa «đã xong»
    if (!ban.has(y.ma_o)) continue;
    if (bayGio - y.luc >= TRAN_GIU_MS) continue;   // quá trần ⇒ để nó chết đúng hẹn
    y.giu_toi = bayGio;
    dem += 1;
  }
  ghi(s);
  return dem;
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
/**
 * 🔑 TRA MẨU THEO KHOÁ CHỐNG TRÙNG.
 *
 * 🐛 Ca Hermes nêu: người gửi hết giờ chờ rồi gọi lại ⇒ **ghế chạy HAI LẦN, Owner trả
 *    tiền hai lần**. Cùng một khoá thì phải trả lại mẩu CŨ, ⛔ đẻ mẩu mới.
 * ⏱ Cửa sổ chống trùng = **đúng bằng đời của mẩu trong sổ** (`GIU_LICH_SU_MS`).
 *    Tôi ⛔ dựng cửa sổ riêng: thêm một con số nữa là thêm một con số phải đo,
 *    mà đội này vừa trả giá cho một con số ⛔ ai đo.
 */
export function timTheoKhoa(khoa: string, bayGio = Date.now()): YeuCauDanhThuc | null {
  if (!khoa) return null;
  const s = donDep(doc(), bayGio);
  const y = s.hang_doi.find((x) => x.khoa === khoa) ?? null;
  ghi(s);
  return y;
}

export type KetQuaXacNhan = { xong: true } | { xong: false; ly_do: string };

/**
 * ✅ TRÌNH DUYỆT XÁC NHẬN đã bắt đầu đưa câu vào ô.
 *
 * 🔄 **ĐÃ LẬT 31/08 (P0-2d) — chú thích cũ nay SAI, giữ lại để người sau khỏi tin nhầm:**
 *    *«gọi SAU KHI `gui()` đã chạy, KHÔNG phải trước — xác nhận trước là nói dối»*.
 *    Vế ấy ĐÚNG **khi cửa này chưa biết TỪ CHỐI**: lúc đó xác nhận chỉ là một lời khai,
 *    nên khai trước khi làm đúng là nói dối. Nay cửa BIẾT từ chối (`khac-trinh-duyet`),
 *    xác nhận thành một phép XIN PHÉP — mà xin phép thì phải xin TRƯỚC khi làm.
 * ⇒ Giao diện nay gọi **XÁC NHẬN TRƯỚC, CHẠY SAU** (`UngDung.tsx:1970-1981`). Đừng đảo lại.
 * 🔑 Bài học ghi kèm: **một lý do đúng lúc viết sẽ ÂM THẦM SAI ĐI khi thứ nó dựa vào đổi,
 *    và KHÔNG có phép thử nào báo.** Chú thích này từng sống sót qua cả một vòng soi.
 * 🔁 Xác nhận HAI LẦN là vô hại (trả `xong: true`) — mạng chập thì trình duyệt gửi lại,
 *    ⛔ nên phạt nó vì cẩn thận.
 * ⚠️ Nếu giữa lúc trao và lúc xác nhận mà hạn giữ chỗ đã hết, `donDep` đưa mẩu về 'cho'
 *    ⇒ ở đây trả về THẤT BẠI CÓ LÝ DO, ⛔ im lặng nuốt.
 */
export function xacNhanDaGiao(ma: string, maTrinhDuyet: string): KetQuaXacNhan {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);
  const y = s.hang_doi.find((x) => x.ma === ma);
  if (!y) { ghi(s); return { xong: false, ly_do: 'khong-thay-mau' }; }

  const tt = trangThai(y);
  if (tt === 'da_giao') {
    /**
     * 🔴 P0-2d (31/08) — Hermes FAIL ①. Bản cũ trả `xong: true` cho MỌI người gọi muộn.
     *
     * 🕳 ĐƯỜNG HỎNG, và nó CÓ TỪ TRƯỚC bộ chạy nền:
     *    ① tab A nhận mẩu ⇒ 'dang_giu' + giu_boi=A + hạn 30 giây
     *    ② tab A TREO / NGỦ / khoá màn trước khi kịp chạy
     *    ③ hết hạn ⇒ mẩu tự về 'cho'
     *    ④ B (tab khác, hoặc bộ nền) nhận lại và CHẠY THẬT
     *    ⑤ A tỉnh dậy, cầm bản mẩu CŨ, gọi xác nhận
     *    ⑥ bản cũ thấy 'da_giao' ⇒ trả «xong» cho A ⇒ **A cũng chạy** ⇒ HAI BÊN MỘT CÂU
     *
     * ✅ TÁCH HAI CA theo `giu_boi` — ⛔ bỏ hẳn nhánh này:
     *      CÙNG giu_boi  ⇒ chính người đó gọi LẦN HAI (mạng chập) ⇒ vẫn «xong».
     *                       Bỏ nhánh này là xác nhận ⛔ còn lặp lại được ⇒ đẻ lỗi khác.
     *      KHÁC giu_boi  ⇒ NGƯỜI KHÁC đã giao ⇒ người gọi PHẢI biết để ĐỪNG chạy.
     * ⚠️ `giu_boi` sống qua trạng thái 'da_giao' (chỉ `giu_han` bị xoá) nên so được.
     *    Ai đổi chỗ xoá `giu_boi` thì chốt này CHẾT LẶNG — nó lại trả «xong» cho mọi người.
     */
    if (y.giu_boi && maTrinhDuyet && y.giu_boi !== maTrinhDuyet) {
      ghi(s);
      return { xong: false, ly_do: 'khac-trinh-duyet' };
    }
    ghi(s);
    return { xong: true };
  }
  if (tt !== 'dang_giu') { ghi(s); return { xong: false, ly_do: `trang-thai-${tt}` }; }
  if (y.giu_boi && maTrinhDuyet && y.giu_boi !== maTrinhDuyet) {
    ghi(s);
    return { xong: false, ly_do: 'khac-trinh-duyet' };
  }

  datTrangThai(y, 'da_giao');
  y.xu_luc = bayGio;      // ⏱ mốc giao THẬT — chỉ đặt ở đây, ⛔ đặt lúc trao
  delete y.giu_han;
  ghi(s);
  return { xong: true };
}

export function xepHang(ts: {
  maO: string;
  maNhanSu: string;
  tuAi: string;
  cauHoi: string;
  khoa?: string;
  wakeId?: string;
}): YeuCauDanhThuc {
  const bayGio = Date.now();
  const s = donDep(doc(), bayGio);
  const yeuCau: YeuCauDanhThuc = {
    ma: randomUUID(),
    wakeId: ts.wakeId,
    ma_o: ts.maO,
    ma_nhan_su: ts.maNhanSu,
    tu_ai: ts.tuAi,
    cau_hoi: ts.cauHoi,
    luc: bayGio,
    da_xu: false,
    trang_thai: 'cho',
    ...(ts.khoa ? { khoa: ts.khoa } : {}),
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
export interface KetQuaNhan {
  y: YeuCauDanhThuc | null;
  /** Có mẩu hợp lệ cho ô này nhưng nhắm vào GHẾ KHÁC ⇒ TRẢ VỀ hàng đợi, ⛔ giao. */
  lechGhe: number;
  /** Trình duyệt ⛔ khai ghế đang ngồi ⇒ ⛔ dám giao (đóng cửa khi ⛔ chắc). */
  thieuKhai: boolean;
}

/**
 * 🎯 LẤY mẩu cho một ô — phải khớp **CẢ Ô LẪN GHẾ**.
 *
 * 🐛 CA THẬT (Hermes soi 30/08, xếp mức bảo mật/ngữ cảnh): mẩu ghi CẢ `ma_o` LẪN
 *    `ma_nhan_su` lúc xếp hàng, nhưng lúc lấy chỉ lọc theo `ma_o`.
 *    ⇒ Ghế trong ô ĐỔI giữa lúc xếp hàng và lúc giao thì **câu đi tới một Claude KHÁC**.
 *    Owner nói 30/08: «chuyển giao diện từ phòng Vận Hành qua các phòng khác là tôi HAY LÀM»
 *    ⇒ ⛔ phải ca hiếm. Người nhận đọc một câu ⛔ dành cho mình, và ⛔ ai biết đã nhầm.
 *
 * ✅ Lệch ghế thì **để nguyên trong hàng đợi** — ⛔ đánh dấu đã xử. Ghế đúng quay lại là
 *    nhận được. Bỏ đi mới là mất; giao nhầm còn tệ hơn mất.
 * ⚠️ `maNhanSu = null` (trình duyệt cũ ⛔ khai) ⇒ **⛔ GIAO**. Thà chậm còn hơn giao nhầm người.
 *    Mẩu ⛔ ai nhận sẽ tự chết theo hạn và `baoMauChet` kêu — nên ⛔ im lặng hoàn toàn.
 */
export function nhanYeuCau(
  maO: string,
  maNhanSu: string | null,
  maTrinhDuyet = '',
): KetQuaNhan {
  const bayGio = Date.now();
  // Ghi nhận TRƯỚC khi dọn: chính lượt thăm dò đang diễn ra này phải được tính.
  ghiNhanThamDo(maO, bayGio);
  const s = donDep(doc(), bayGio);
  const hop = s.hang_doi.filter((x) => x.ma_o === maO && conDung(x, bayGio));
  const y = maNhanSu ? hop.find((x) => x.ma_nhan_su === maNhanSu) ?? null : null;
  // Đếm mẩu BỊ GIỮ LẠI vì lệch ghế — để bên ngoài ĐO được, ⛔ phải suy từ «⛔ thấy gì».
  const lechGhe = hop.length - (y ? 1 : 0);
  if (!y) {
    ghi(s);
    return { y: null, lechGhe, thieuKhai: !maNhanSu && hop.length > 0 };
  }
  /**
   * 🤝 TRAO = GIỮ CHỖ, ⛔ phải «đã xong».
   * 🐛 Bản cũ đặt `da_xu = true` NGAY tại đây ⇒ tab chết giữa chừng là mẩu coi như đã giao
   *    mà **⛔ ai nhận**. Nay phải có XÁC NHẬN từ trình duyệt mới sang 'da_giao';
   *    quá hạn mà im ⇒ `traVeMauHetHan` đưa nó về 'cho'.
   * ⚠️ `xu_luc` CHỈ đặt lúc XÁC NHẬN — ⛔ đặt ở đây. Cột nghiệm thu ④ của ghế soi
   *    («đánh dấu đã giao mà ⛔ có mốc giao» = 0) chính là để bắt chỗ này.
   */
  datTrangThai(y, 'dang_giu');
  y.giu_boi = maTrinhDuyet || 'khong-ro';
  y.giu_han = bayGio + HAN_GIU_CHO_MS;
  ghi(s);
  return { y, lechGhe, thieuKhai: false };
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
