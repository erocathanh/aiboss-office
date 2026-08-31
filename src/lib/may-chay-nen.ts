/**
 * 🤖 BỘ CHẠY NỀN — máy chủ TỰ rút mẩu khỏi hàng đợi và chạy lượt, KHÔNG cần trình duyệt.
 *    (P0-2c · Owner ưu tiên hàng đầu 31/08: *«phụ thuộc trình duyệt quá khó chịu»*)
 *
 * 🎯 ĐỔI CHỦ, KHÔNG PHẢI BỎ HTTP. Trình duyệt hôm nay là ĐỘNG CƠ (đo 31/08 19:18):
 *    `/api/chat` là đường DUY NHẤT spawn ghế, và nó được gọi từ ĐÚNG MỘT chỗ — `UngDung.tsx`.
 *    Tệp này thêm một người lái THỨ HAI, chạy ngay trong tiến trình máy chủ.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔴 BA CHỐT CHỐNG CHẠY TRÙNG — mỗi chốt chặn một ca ĐÃ đo được, đừng gỡ chốt nào
 * ═══════════════════════════════════════════════════════════════════════════════
 * ① CÙNG ĐƯỜNG GIAO MẨU với trình duyệt: gọi CHÍNH `nhanYeuCau()`.
 *    Nó đặt `dang_giu` + `giu_boi` + `giu_han` ⇒ trình duyệt KHÔNG lấy được mẩu đó nữa.
 *    ⚠️ Nếu tôi tự đọc sổ rồi tự chạy (không qua `nhanYeuCau`) thì hai bên cùng lấy
 *      MỘT mẩu ⇒ ghế chạy HAI LẦN ⇒ Owner trả tiền hai lần. Đây là ca đắt nhất.
 *
 * ② GHẾ ĐANG CHẠY thì BỎ QUA: tra `dsViec()` — cùng chốt mà `/api/chat:103` đang dùng.
 *
 * ③ CÒN TRÌNH DUYỆT THÌ NHƯỜNG: nếu ô này vừa được thăm dò trong `IM_CAN_MS` thì
 *    coi như CÓ người lái rồi, bộ nền đứng ngoài.
 *    📌 Vì sao nhường chứ không tranh: trình duyệt CÓ chỗ đổ chữ ra màn hình ngay;
 *      bộ nền thì không. Cùng làm được thì để người làm ĐẸP HƠN làm.
 *    ⚠️ GIỚI HẠN PHẢI BIẾT: dấu vết thăm dò nằm TRONG BỘ NHỚ (`thamDoTheoO`).
 *      Máy chủ khởi lại ⇒ sổ rỗng ⇒ bộ nền tưởng KHÔNG có trình duyệt nào.
 *      Vô hại vì chốt ① vẫn chặn chạy trùng — nhưng ĐỪNG đọc «0 thăm dò» thành
 *      «chắc chắn không ai mở app». Đó là loại rỗng «tôi KHÔNG CÒN BIẾT», đã ghi sổ 31/08.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔌 MẶC ĐỊNH **TẮT**. Bật bằng biến môi trường `CHAY_NEN=1`.
 *    Cố ý: nối tệp này vào máy chủ mà nó tự chạy ngay thì người duyệt KHÔNG có cơ hội
 *    nhìn nó chạy thử. Bật là một QUYẾT ĐỊNH nhìn thấy được, không phải hệ quả của việc nạp.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { chayMotLuot } from '@/lib/chay-mot-luot';
import { nhanYeuCau, xacNhanDaGiao, xemSo } from '@/lib/kho-danh-thuc';
import { dsViec } from '@/lib/kho-tien-trinh';
import { layO, ghiMocKetThuc } from '@/lib/kho-phien';
import { coPhien, dangChay as dangChayNoiKhac } from '@/lib/doc-phien';

/** Mã người giữ mẩu, để phân biệt với trình duyệt trong sổ. */
export const NGUOI_GIU_NEN = 'may-chu-nen';

/** Ô im lâu hơn ngần này thì coi là KHÔNG có trình duyệt lái nó. */
export const IM_CAN_MS = 45_000;

/** Nhịp rà hàng đợi. Thưa thôi — đây KHÔNG phải đường chính, nó là đường DỰ PHÒNG. */
export const NHIP_MS = 10_000;

let dangChay = false;
let donGio: ReturnType<typeof setInterval> | null = null;

/** Số đo để nghiệm thu — KHÔNG suy từ «không thấy gì». */
export const dem = {
  vong: 0, daChay: 0, boQuaDangChay: 0, boQuaCoTrinhDuyet: 0, loi: 0,
  /** phiên trong sổ đã hỏng ⇒ phải mở phiên mới */ mophienMoi: 0,
  /** ghế đang chạy Ở NƠI KHÁC (terminal) ⇒ đứng ngoài */ boQuaChayNoiKhac: 0,
};

/**
 * Rà MỘT vòng. Trả về số lượt đã khởi chạy trong vòng này.
 * Tách riêng để nghiệm thu gọi thẳng được, KHÔNG phải chờ đồng hồ.
 */
export async function raMotVong(bayGio = Date.now(), chophepKhiTat = false): Promise<number> {
  /**
   * 🔴 CHỐT CÔNG TẮC PHẢI Ở ĐÂY, KHÔNG CHỈ Ở `bat()` — hermes-aiboss-app-review FAIL ⑤, 31/08.
   *    `raMotVong` được EXPORT. Ai `import` rồi gọi thẳng là đi vòng qua `bat()` hoàn toàn.
   *    Và chính chú thích cũ của tôi MỜI GỌI làm thế («tách riêng để nghiệm thu gọi thẳng»).
   * 🔑 Câu tôi khai với Owner — «mặc định TẮT nên nạp vào KHÔNG đổi hành vi» — SAI ở biên mô-đun.
   *    Một công tắc chỉ gác cửa trước mà bỏ ngỏ cửa sau thì nó KHÔNG phải công tắc.
   * ⚠️ `chophepKhiTat` chỉ dành cho phép thử, và nó phải được TRUYỀN TỪNG LẦN — không có
   *    biến toàn cục nào bật nó vĩnh viễn.
   */
  if (process.env.CHAY_NEN !== '1' && !chophepKhiTat) return 0;
  dem.vong++;
  const so = xemSo();
  // Chỉ quan tâm mẩu ĐANG CHỜ. Mẩu 'dang_giu' là của người khác — kể cả của chính ta.
  const cho = so.hang_doi.filter((y) => y.trang_thai === 'cho');
  if (cho.length === 0) return 0;

  /**
   * 🔴 ẢNH CHỤP + SỔ NHẬN TRONG VÒNG — hai thứ, KHÔNG phải một.
   *
   * 🕳 LỖI THẬT (claude-phong-ban-pm bắt 31/08 20:23, tôi mô phỏng lại ra đúng 2 lượt):
   *    bản đầu chỉ có ẢNH CHỤP `dsViec()` lấy MỘT LẦN ngoài vòng, còn `chayMotLuot`
   *    thì gọi KHÔNG `await`. Hai mẩu CÙNG MỘT GHẾ trong cùng một vòng quét:
   *      mẩu 1 → ghế chưa có trong ảnh ⇒ qua chốt ⇒ khởi chạy
   *      mẩu 2 → ảnh VẪN CŨ (chưa kịp có pid) ⇒ qua chốt ⇒ **KHỞI CHẠY LẦN HAI**
   *    ⇒ ghế chạy hai lần, Owner trả tiền hai lần — đúng ca tôi tự gọi là ĐẮT NHẤT,
   *      và tôi để hở nó ngay trong cái chốt sinh ra để chặn nó.
   * 📌 `dangKyViec` chỉ xảy ra ở `khiSinh`, tức SAU khi tiến trình đã sinh. Giữa lúc quyết định
   *    và lúc có pid là một khoảng trống — ảnh chụp không bao giờ lấp được khoảng đó.
   *    Phải có một sổ RIÊNG của vòng này, cập nhật NGAY lúc quyết định.
   */
  const dangChayTheoGhe = new Set(dsViec().map((v) => v.ma_nhan_su));
  const daNhanTrongVong = new Set<string>();
  /**
   * 🔴 CHỤP DẤU THĂM DÒ TRƯỚC VÒNG — hermes-aiboss-app-review, phát hiện NGOÀI ĐỀ ①.
   *    `nhanYeuCau` LUÔN gọi `ghiNhanThamDo`, kể cả khi người gọi là chính bộ nền.
   *    ⇒ vừa nhận một mẩu là bộ nền TỰ ĐÓNG DẤU như một trình duyệt, rồi mẩu sau trong
   *      cùng vòng (và cả vòng kế) nhìn dấu của CHÍNH MÌNH mà kết luận «có trình duyệt».
   * 📌 Đây là lỗi TRÌ HOÃN, không phải chạy trùng — nhưng nó làm bộ nền tự trói tay 45 giây
   *    sau mỗi mẩu, đúng lúc lẽ ra nó phải làm việc nhiều nhất.
   */
  const dauThamDoDauVong = new Map<string, number | undefined>();
  for (const y of cho) {
    if (!dauThamDoDauVong.has(y.ma_o)) dauThamDoDauVong.set(y.ma_o, layThamDo(y.ma_o));
  }
  let daChay = 0;

  for (const y of cho) {
    // ── chốt ②: ghế đang chạy ở đâu đó rồi, HOẶC vừa được nhận trong CHÍNH vòng này
    if (dangChayTheoGhe.has(y.ma_nhan_su) || daNhanTrongVong.has(y.ma_nhan_su)) {
      dem.boQuaDangChay++;
      continue;
    }
    // ── chốt ③: còn trình duyệt lái ô này thì nhường
    //    (đọc qua `xemSo` KHÔNG có dấu thăm dò, nên hỏi thẳng kho)
    const imBaoLau = bayGio - (dauThamDoDauVong.get(y.ma_o) ?? 0);
    if (imBaoLau < IM_CAN_MS) {
      dem.boQuaCoTrinhDuyet++;
      continue;
    }
    // ── chốt ①: lấy mẩu qua CHÍNH đường của trình duyệt ⇒ không thể lấy trùng
    const ket = nhanYeuCau(y.ma_o, y.ma_nhan_su, NGUOI_GIU_NEN);
    if (!ket.y) continue; // ai đó nhanh tay hơn — đúng thứ ta muốn
    const xn = xacNhanDaGiao(ket.y.ma, NGUOI_GIU_NEN);
    if (!xn.xong) continue;

    // ⚠️ ĐÁNH DẤU NGAY, trước khi gọi — KHÔNG đợi tới lúc có pid.
    //    Đặt sau `nhanYeuCau` để mẩu bị người khác nhanh tay lấy mất thì KHÔNG khoá oan ghế.
    daNhanTrongVong.add(y.ma_nhan_su);

    const o = layO(y.ma_o);
    let maPhienCu = o && o.ma_nhan_su === y.ma_nhan_su ? (o.ma_phien ?? null) : null;

    /**
     * 🔴 HAI CHỐT MÀ ĐƯỜNG CŨ CÓ CÒN ĐƯỜNG NÀY THIẾU — hermes FAIL ⑥, 31/08.
     *
     * 🕳 Tôi viết trong `chay-mot-luot.ts` rằng «cố ý KHÔNG gói chốt vào lõi, NGƯỜI GỌI tự lo»,
     *    rồi người gọi là chính tôi, và tôi KHÔNG lo. Chú thích đó còn LIỆT KÊ chúng ra
     *    như thể đã có — ai đọc lướt sẽ thấy một danh sách chốt đầy đủ.
     * 🔑 **Khai một ranh giới KHÔNG phải là đã giữ ranh giới đó.**
     *
     * (a) `coPhien` — đường cũ kiểm bản ghi phiên còn sống TRƯỚC khi `--resume`
     *     (`api/chat/route.ts:68-87`). Thiếu nó ⇒ sổ ô giữ mã phiên đã hỏng ⇒ `--resume` MÙ.
     *     Vá: hỏng thì MỞ PHIÊN MỚI (`maPhienCu = null`) chứ KHÔNG bỏ mẩu — mẩu đã `da_giao` rồi,
     *     bỏ ở đây là mất câu của người ta.
     * (b) `dangChay` — đường cũ chặn ghế đang chạy Ở NƠI KHÁC (cửa sổ dòng lệnh), thứ mà
     *     `dsViec()` KHÔNG thấy vì nó chỉ biết tiến trình do app sinh.
     *     Thiếu nó ⇒ terminal đang `--resume P` mà bộ nền cũng `--resume P`
     *     ⇒ HAI tiến trình ghi CÙNG một `.jsonl`.
     */
    if (maPhienCu && !coPhien(y.ma_nhan_su, maPhienCu)) {
      dem.mophienMoi++;
      maPhienCu = null;
    }
    if (maPhienCu && dangChayNoiKhac(y.ma_nhan_su, maPhienCu, o?.moc_ket_thuc ?? null)) {
      dem.boQuaChayNoiKhac++;
      daNhanTrongVong.delete(y.ma_nhan_su); // trả ghế lại, KHÔNG khoá oan
      continue;
    }

    // KHÔNG `await` — một mẩu chạy chậm KHÔNG được chặn mẩu của ô khác.
    void chayMotLuot(
      { maO: y.ma_o, maNhanSu: y.ma_nhan_su, cauHoi: y.cau_hoi, maPhienCu },
      () => {
        /* KHÔNG có ai xem. Chữ tự nằm trong .jsonl của Claude Code — xem chú thích
           `chay-mot-luot.ts`. Cố ý ĐỂ TRỐNG chứ không ghi thêm một bản sao thứ hai:
           hai bản ghi cho cùng một lượt là hai thứ có thể lệch nhau. */
      },
    ).then(
      (kq) => {
        if (kq.loi) dem.loi++;
        /**
         * 🔴 GHI MỐC KẾT THÚC — hermes, phát hiện NGOÀI ĐỀ ②.
         *    Đường cũ ghi mốc này (`api/chat/route.ts:243`); đường nền thì KHÔNG.
         *    Thiếu nó ⇒ `dangChay` thấy phiên vừa sửa mà KHÔNG có mốc sở hữu
         *    ⇒ coi ghế là CÒN BẬN tới 5 phút sau khi nó đã xong.
         */
        // ⚠️ chữ ký là (maO, mocMs) — KHÔNG phải (maO, maPhien). tsc bắt đúng chỗ này.
        ghiMocKetThuc(y.ma_o, Date.now());
      },
      () => {
        dem.loi++;
      },
    );
    dem.daChay++;
    daChay++;
  }
  return daChay;
}

/**
 * Đọc mốc thăm dò của một ô.
 *
 * 🔴 MẶC ĐỊNH LÀ «CÓ TRÌNH DUYỆT», KHÔNG PHẢI «KHÔNG BIẾT ⇒ CỨ CHẠY».
 *    Nếu chưa ai cắm nguồn dấu vết thì ta KHÔNG BIẾT có trình duyệt hay không —
 *    và «không biết» phải nghiêng về phía KHÔNG chạy, chứ không phải phía chạy.
 * 🕳 Bản đầu tôi để `() => undefined` ⇒ `bayGio - 0` = một số khổng lồ
 *    ⇒ chốt ③ KHÔNG BAO GIỜ chặn được ai. Một chốt luôn cho qua thì nó không phải chốt.
 *    Đúng họ với «rỗng đọc thành 0» đã ghi sổ 31/08, chỉ khác cái áo.
 */
let layThamDo: (maO: string) => number | undefined = () => Date.now();
/** Cho phép nơi khác cắm nguồn dấu vết thăm dò (kho-danh-thuc giữ nó trong bộ nhớ). */
export function datNguonThamDo(f: (maO: string) => number | undefined): void {
  layThamDo = f;
}

/** Bật bộ chạy nền. Gọi nhiều lần cũng chỉ chạy MỘT bộ. */
export function bat(): boolean {
  if (dangChay) return false;
  if (process.env.CHAY_NEN !== '1') return false; // ⇦ mặc định TẮT, xem đầu tệp
  dangChay = true;
  donGio = setInterval(() => {
    void raMotVong().catch(() => {
      dem.loi++;
    });
  }, NHIP_MS);
  return true;
}

/** Tắt — cho nghiệm thu và cho lúc máy chủ đóng. */
export function tat(): void {
  if (donGio) clearInterval(donGio);
  donGio = null;
  dangChay = false;
}

/** Đang bật hay không — để cửa trạng thái khai thật, KHÔNG phải đoán. */
export function dangBat(): boolean {
  return dangChay;
}
