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
import { coPhien, dangChay as dangChayNoiKhac, mocTepPhien } from '@/lib/doc-phien';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 🔴 GHI XUỐNG ĐĨA mẩu bị bỏ qua vì KHÔNG tìm thấy bản ghi phiên.
 *    (claude-phong-ban-pm bắt vòng 5 — cửa do CHÍNH bản vá vòng 4 của tôi mở ra)
 *
 * 🕳 Vòng 4 tôi sửa «vứt phiên» thành «bỏ qua mẩu». Nhưng mẩu bỏ qua giữ nguyên `cho`,
 *    mà `conDung()` cho mẩu `cho` chết sau `HAN_YEU_CAU_MS` = **3 phút**
 *    ⇒ câu của Owner biến mất LẶNG. Tôi chỉ dời cái mất từ PHIÊN sang CÂU.
 * 🔑 Đây là lần thứ BA cùng một hình trong một đêm: **vá một cái mất vô hình bằng một cái
 *    mất vô hình khác.** Chỉ đếm trong bộ nhớ thì tắt máy chủ là mất sạch, và Owner
 *    KHÔNG có cách nào biết mình vừa mất một câu.
 * ✅ Nên: ghi XUỐNG ĐĨA, nối thêm, KHÔNG bao giờ ném — một việc phụ trợ ⛔ được chặn vòng chạy.
 */
function ghiCanNguoi(y: { ma: string; ma_o: string; ma_nhan_su: string; cau_hoi: string }, maPhien: string): void {
  try {
    const thuMuc = path.join(process.cwd(), '.trang-thai');
    fs.mkdirSync(thuMuc, { recursive: true });
    fs.appendFileSync(
      path.join(thuMuc, 'can-nguoi.jsonl'),
      JSON.stringify({
        luc: new Date().toISOString(),
        ly_do: 'khong-thay-ban-ghi-phien',
        ma_mau: y.ma,
        ma_o: y.ma_o,
        ma_nhan_su: y.ma_nhan_su,
        ma_phien_trong_so: maPhien,
        cau_hoi: y.cau_hoi.slice(0, 300),
        ghi_chu: 'Mẩu BỎ QUA, giữ nguyên "cho". Nó sẽ HẾT HẠN sau 3 phút nếu KHÔNG ai xử.',
      }) + '\n',
      'utf8',
    );
  } catch {
    /* ghi sổ hỏng thì KỆ — ⛔ được chặn vòng chạy vì một việc phụ trợ */
  }
}

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
  /** KHÔNG thấy bản ghi phiên ⇒ BỎ QUA, ⛔ tự ý mở phiên mới (vứt lịch sử là ⛔ lùi được) */
  boQuaKhongThayPhien: 0,
  /** ghế đang chạy Ở NƠI KHÁC (terminal) ⇒ đứng ngoài */ boQuaChayNoiKhac: 0,
  /** lượt CHẠY THẬT mà `datO` từ chối buộc vào ô ⇒ «lượt vô hình» */ buocOThatBai: 0,
  /** vòng bị bỏ vì vòng trước CHƯA xong ⇒ chốt tái nhập đã chặn */ boQuaTaiNhap: 0,
};

/**
 * 🔴 CHỐT TÁI NHẬP — MỨC MÔ-ĐUN, ⛔ để trong hàm.
 *    (claude-phong-ban-pm bắt vòng 3, 01/09 — lỗi P0 THẬT, đúng chỗ tôi tự khai là ngờ nhất)
 *
 * 🧾 ĐÃ BỊ TRANH CÃI RỒI ĐO LẠI (01/09): `claude-aiboss-app-exe` rút lại lời buộc tội, nói cửa
 *    KHÔNG hở. Tôi dựng lại ĐÚNG commit 9d41d87 bằng lệnh claude GIẢ và ĐẾM:
 * ```
 * 9d41d87 (KHÔNG chốt) → SPAWN 2 LẦN   ⇐ cửa MỞ THẬT
 * 8f4e1ac (CÓ chốt)    → SPAWN 0 LẦN   · boQuaTaiNhap=1
 * đối chứng dương thước đếm: gọi tay 1 phát → 1
 * ```
 *    Cửa CHỈ mở khi có `await` TRƯỚC spawn — đường duy nhất tới đó là nhánh `coPhien` hỏng.
 *    Phép thử nào ⛔ ép được nhánh ấy sẽ ra «1 lần» một cách rất thuyết phục.
 * ⚠️ ĐỪNG gỡ chốt này vì đọc thấy ai đó bảo «cửa đóng». Chạy lại phép đếm trước đã.
 *
 * 🕳 ĐƯỜNG HỎNG:
 * ```
 * `daNhanTrongVong` là biến CỤC BỘ, sinh mới mỗi lần gọi `raMotVong`.
 * Nhịp 10 giây + tôi vừa thêm `await` 1,5 giây vào giữa vòng ⇒ hai vòng CHỒNG NHAU.
 * vòng A: mẩu ①  của ghế X → sổ RIÊNG của A → qua chốt → chạy
 * vòng B: mẩu ②  của ghế X → sổ RIÊNG của B (RỖNG) → qua chốt → CHẠY LẦN HAI
 * ```
 * 🔑 `nhanYeuCau` ⛔ cứu được: nó chặn HAI NGƯỜI GIÀNH MỘT MẨU,
 *    ⛔ chặn MỘT GHẾ nhận HAI MẨU KHÁC NHAU.
 * 📌 Tôi ngờ đúng chỗ mà ⛔ đi tới cùng: tôi ghi «chưa có chốt chặn tái nhập» vào đề bài
 *    rồi vẫn nộp. **Nêu một chỗ ngờ ⛔ phải là đã xử nó.**
 */
let dangRaVong = false;

/**
 * Rà MỘT vòng. Trả về số lượt đã khởi chạy trong vòng này.
 * Tách riêng để nghiệm thu gọi thẳng được, KHÔNG phải chờ đồng hồ.
 */
async function raMotVongLoi(bayGio: number): Promise<number> {
  /**
   * 🔴 CHỐT CÔNG TẮC PHẢI Ở ĐÂY, KHÔNG CHỈ Ở `bat()` — hermes-aiboss-app-review FAIL ⑤, 31/08.
   *    `raMotVong` được EXPORT. Ai `import` rồi gọi thẳng là đi vòng qua `bat()` hoàn toàn.
   *    Và chính chú thích cũ của tôi MỜI GỌI làm thế («tách riêng để nghiệm thu gọi thẳng»).
   * 🔑 Câu tôi khai với Owner — «mặc định TẮT nên nạp vào KHÔNG đổi hành vi» — SAI ở biên mô-đun.
   *    Một công tắc chỉ gác cửa trước mà bỏ ngỏ cửa sau thì nó KHÔNG phải công tắc.
   */
  if (process.env.CHAY_NEN !== '1') return 0;
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
    /**
     * 🔴 HAI CHỐT PHIÊN PHẢI CHẠY **TRƯỚC** KHI NHẬN MẨU — hermes vòng 2, FAIL ①, 31/08.
     *
     * 🕳 BẢN TRƯỚC CỦA TÔI ĐẶT CHÚNG SAU `xacNhanDaGiao`, và đó là một lỗi THẬT:
     * ```
     * ① nhận mẩu → ② xác nhận ⇒ mẩu thành 'da_giao'
     * ③ mới kiểm dangChayNoiKhac → thấy bận → `continue`
     * ⇒ mẩu nằm lại 'da_giao' VĨNH VIỄN. Bộ dọn chỉ đụng mẩu 'cho' (kho-danh-thuc.ts:216-220).
     *   Câu của Owner biến mất, KHÔNG ai chạy, KHÔNG ai canh.
     * ```
     * 🔑 Hermes gọi đúng tên: **«KHÔNG phải cửa sổ mili-giây — nó xảy ra CÓ CHỦ Ý mỗi khi
     *    phiên đích đang chạy nơi khác.»** Tôi đã đổi «chạy hai lần» lấy «mất hẳn một câu»,
     *    mà lần này cái mất là **VÔ HÌNH** — đúng thứ tôi vẫn đi bắt ở người khác.
     * ✅ Luật rút ra: **ĐỪNG NHẬN thứ mình chưa chắc sẽ làm.** Kiểm đủ điều kiện rồi mới lấy mẩu.
     */
    const o = layO(y.ma_o);
    /* 🔴 ⑭ 06/09 — `let` → `const`. Người soi bắt: pha lint THẬT của `next build` trả
       `isError: true` ở đúng dòng này ⇒ từ khi kho có cấu hình eslint, MỌI bản dựng đều ĐỎ.
       🔑 Việc ⑭ khôngphải là thêm một lệnh chạy tay — nó ĐỔI VẬT LÝ CỦA BẢN DỰNG.
       📏 Đo trước khi sửa: 5 chỗ dùng `maPhienCu` (216 · 218 · 245 · 254 · 271) đều chỉ ĐỌC.
          Phép gán duy nhất khác nằm ở dòng ~228 — nhưng nó ở TRONG CHÚ THÍCH, tả một hành vi
          ĐÃ BỊ GỠ CÓ CHỦ Ý ở vòng 4. Cái `let` là hoá thạch của hành vi đã chết.
       ⚠️ Đổi sang `const` KHÔNG đụng hành vi — chỉ khai đúng thứ đang thật. */
    const maPhienCu = o && o.ma_nhan_su === y.ma_nhan_su ? (o.ma_phien ?? null) : null;

    /**
     * (a) `coPhien` — **HAI MẪU CÁCH NHAU**, đúng như đường HTTP (`api/chat/route.ts:69-80`).
     *     🔴 Bản trước tôi chỉ đo MỘT mẫu. Hermes vòng 2 bắt: một mẫu đơn KHÔNG đủ để
     *        tuyên một phiên là mất — dễ bắt nhầm đúng lúc tệp đang được thay/đổi tên.
     *        Chép chốt mà bỏ mất điều kiện của nó thì chốt chỉ còn cái tên.
     *     Nhánh này chỉ chạy trong ca hiếm nên 1,5 giây KHÔNG làm chậm đường thường.
     */
    if (maPhienCu && !coPhien(y.ma_nhan_su, maPhienCu)) {
      await new Promise((r) => setTimeout(r, 1_500));
      if (!coPhien(y.ma_nhan_su, maPhienCu)) {
        /**
         * 🔴 ĐỔI HẲN Ở VÒNG 4 — `claude-phong-ban-pm` bắt, và đây là lỗi NẶNG NHẤT cả ba vòng.
         *
         * 🕳 BẢN TRƯỚC TÔI ĐẶT `maPhienCu = null` ⇒ MỞ PHIÊN MỚI. Đo trên dữ liệu sống 01/09:
         * ```
         * claude-hieu-truong       kho CÓ · 2 tệp
         * claude-phong-dao-tao     KHÔNG có kho
         * claude-phong-cong-nghe   KHÔNG có kho
         * claude-phong-tai-chinh   KHÔNG có kho
         * claude-phong-hanh-chinh  KHÔNG có kho
         * đối chứng dương: claude-aiboss-app-exe 8 tệp ⇒ thước SỐNG
         * ```
         * `coPhien` chỉ tìm trong kho CỦA CHÍNH GHẾ ĐÓ — một thư mục duy nhất. Mà 4/5 ghế
         * «Quản Lý Trường» KHÔNG có kho, đúng lúc Owner vừa nạp 5 mã phiên vào 5 ô ấy.
         * ⇒ Bật bộ nền lên là nó VỨT ĐÚNG CÁI MÃ Owner vừa nạp, và chỉ `dem.mophienMoi++`.
         *   Owner thấy ghế mất trí nhớ mà KHÔNG có một dòng nào chỉ ra vì sao.
         *
         * 🔑 **VỨT LỊCH SỬ thì KHÔNG LÙI ĐƯỢC. BỎ QUA thì LÙI ĐƯỢC.**
         *   Bộ nền KHÔNG đủ tư cách quyết một việc không lùi được — nó chỉ thấy MỘT thư mục,
         *   trong khi phiên có thể nằm ở thư mục khác (đúng ca ghế «Quản Lý Trường» tự khai).
         * ⇒ Bỏ qua mẩu, để nguyên trạng thái `cho`, đếm riêng. Người thật quyết.
         */
        dem.boQuaKhongThayPhien++;
        // 🔴 GHI XUỐNG ĐĨA — bộ đếm nằm trong bộ nhớ, tắt máy chủ là mất sạch.
        //    Mẩu này sẽ HẾT HẠN sau 3 phút (kho-danh-thuc.ts `conDung` · HAN_YEU_CAU_MS)
        //    ⇒ nếu ⛔ ghi ra thì câu của Owner mất mà ⛔ ai biết.
        ghiCanNguoi(y, maPhienCu);
        continue;
      }
    }

    /**
     * (b) `dangChay` — ghế đang chạy Ở NƠI KHÁC (cửa sổ dòng lệnh) thì ĐỨNG NGOÀI.
     *     Đặt ở đây ⇒ mẩu vẫn nguyên trạng thái `cho`, vòng sau lấy lại được.
     */
    if (maPhienCu && dangChayNoiKhac(y.ma_nhan_su, maPhienCu, o?.moc_ket_thuc ?? null)) {
      dem.boQuaChayNoiKhac++;
      continue; // ⚠️ CHƯA nhận mẩu ⇒ KHÔNG có gì để trả lại. Đó là điểm của cả bản vá này.
    }

    // ── chốt ①: lấy mẩu qua CHÍNH đường của trình duyệt ⇒ không thể lấy trùng
    const ket = nhanYeuCau(y.ma_o, y.ma_nhan_su, NGUOI_GIU_NEN);
    if (!ket.y) continue; // ai đó nhanh tay hơn — đúng thứ ta muốn
    const xn = xacNhanDaGiao(ket.y.ma, NGUOI_GIU_NEN);
    if (!xn.xong) continue;

    // ⚠️ ĐÁNH DẤU NGAY, trước khi gọi — KHÔNG đợi tới lúc có pid.
    //    Đặt sau `nhanYeuCau` để mẩu bị người khác nhanh tay lấy mất thì KHÔNG khoá oan ghế.
    daNhanTrongVong.add(y.ma_nhan_su);

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
        // 🔴 lượt chạy mà KHÔNG buộc được vào ô ⇒ đếm riêng, đừng trộn vào `loi`.
        if (kq.buocOThatBai) dem.buocOThatBai++;
        /**
         * 🔴 GHI MỐC KẾT THÚC — hermes, phát hiện NGOÀI ĐỀ ②.
         *    Đường cũ ghi mốc này (`api/chat/route.ts:243`); đường nền thì KHÔNG.
         *    Thiếu nó ⇒ `dangChay` thấy phiên vừa sửa mà KHÔNG có mốc sở hữu
         *    ⇒ coi ghế là CÒN BẬN tới 5 phút sau khi nó đã xong.
         */
        /**
         * 🔴 SỬA vòng 2 (hermes FAIL ⑥): tham số là **MỐC SỬA TỆP**, KHÔNG phải giờ tường.
         * ```
         * chữ ký      kho-phien.ts:93   ghiMocKetThuc(maO, mocTep)
         * đường HTTP  api/chat:241-247  mocTepPhien(...) rồi ghi LẠI ở 1,5s · 5s · 15s
         * bản trước   Date.now()        ⇒ giờ tường. Claude/hook xả tệp muộn thì mốc SAI,
         *                                 và `dangChay` chỉ cần moc_ket_thuc !== null là bỏ
         *                                 phép chặn mtime (doc-phien.ts:487-494).
         * ```
         * ⚠️ Và CHỈ đóng dấu khi THỰC SỰ có phiên — `if (maPhienDaDung)` của đường HTTP.
         *    Lượt chưa từng spawn mà đóng dấu «ta vừa chạy xong» là khai khống.
         */
        if (kq.maPhien) {
          const maP = kq.maPhien;
          const ghiLai = () => {
            /**
             * 🔴 KIỂM Ô CÒN LÀ CỦA MÌNH ⛔ (claude-phong-ban-pm bắt vòng 3).
             *    Mốc này ghi lại tới 15 giây SAU khi lượt xong. Trong 15 giây đó Owner
             *    có thể đổi ghế trong ô, hoặc mở phiên khác ⇒ đóng dấu «lượt của TA vừa
             *    chạy xong» lên một ô ĐÃ ĐỔI CHỦ ⇒ `dangChay` đọc mốc ấy mà tưởng ô rảnh.
             * 🔑 Một phép ghi có HẸN GIỜ phải kiểm lại điều kiện LÚC NÓ NỔ, ⛔ lúc nó được hẹn.
             */
            const oNay = layO(y.ma_o);
            if (!oNay || oNay.ma_nhan_su !== y.ma_nhan_su || oNay.ma_phien !== maP) return;
            const m = mocTepPhien(y.ma_nhan_su, maP);
            if (m !== null) ghiMocKetThuc(y.ma_o, m);
          };
          ghiLai();
          for (const cho2 of [1_500, 5_000, 15_000]) setTimeout(ghiLai, cho2).unref?.();
        }
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
 * Rà MỘT vòng. Vỏ ngoài giữ CHỐT TÁI NHẬP — vòng trước chưa xong thì vòng này ĐỨNG NGOÀI.
 * `try/finally` để một cú ném giữa chừng ⛔ khoá kẹt cửa mãi mãi.
 */
export async function raMotVong(bayGio = Date.now()): Promise<number> {
  if (dangRaVong) {
    dem.boQuaTaiNhap++;
    return 0;
  }
  dangRaVong = true;
  try {
    return await raMotVongLoi(bayGio);
  } finally {
    dangRaVong = false;
  }
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

/** Bật bộ chạy nền. Trong AIBOSS Office, office-runner là động cơ duy nhất; may-chay-nen luôn tắt. */
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

/** Đang bật hay không — để cửa trạng thái khai thật, KHÔNG phải đoán. */
export function dangBat(): boolean {
  return dangChay;
}
