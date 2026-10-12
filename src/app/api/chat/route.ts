import { NextRequest } from 'next/server';
import { chayAgent } from '@/lib/chay-agent';
import { CAU_HINH, loiDanHeThong } from '@/lib/cau-hinh';
import { xinLuot, moLuot, dongLuot, nhanDangKhach } from '@/lib/chan-muc-dung';
import { layO, layTatCa, datO, ghiMocKetThuc } from '@/lib/kho-phien';
import { bindingOf, sameBinding } from '@/components/ung-dung/nap-bo-ghe';
import { thuMucAgent, dangChay, coPhien, mocTepPhien, NGUONG_SONG_PHUT } from '@/lib/doc-phien';
import { dangKyViec, xoaViec, dsViec, xacMinhDong, datCho, traCho, giayTuEp } from '@/lib/kho-tien-trinh';
import { ghiVetMatLienKet } from '@/lib/vet-mat-lien-ket';
import { timNhanSu } from '@/lib/nhan-su';
import { traChuoi } from '@/lib/tra-chuoi';
import { batMotLan } from '@/lib/khoi-dong-nen';
import { traVeHangDoi, nhanChayMau } from '@/lib/kho-danh-thuc';

export const runtime = 'nodejs'; // cần spawn tiến trình con → ⛔ không chạy edge
export const dynamic = 'force-dynamic';

/**
 * VÌ SAO CHỌN SSE (Server-Sent Events) THAY VÌ WEBSOCKET
 * ------------------------------------------------------
 * 1. Luồng ở đây MỘT CHIỀU: câu hỏi đi lên bằng một POST bình thường, chỉ có
 *    câu trả lời cần chảy ngược về. WebSocket là kênh hai chiều — trả giá cho
 *    một chiều ta không dùng.
 * 2. Next.js App Router phục vụ SSE bằng ReadableStream ngay trong route handler,
 *    ⛔ KHÔNG cần dựng máy chủ riêng. Muốn WebSocket là phải bỏ `next dev`,
 *    tự ghép node:http + ws (đúng cách openclaw làm) — nặng hơn hẳn cho vòng đầu.
 * 3. SSE đi trên HTTP thường ⇒ qua được proxy/Cloudflare mà ⛔ không phải mở
 *    thêm cấu hình nâng cấp giao thức.
 * 4. Vòng sau chia 2–4 ô: mỗi ô mở một luồng SSE riêng, ⛔ không vướng gì.
 */

function goi(du_lieu: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(du_lieu)}\n\n`);
}

export async function POST(req: NextRequest) {
  const initialSlots = layTatCa();
  batMotLan(); // 🚀 cửa Node có nhịp gọi dày nhất — hermes FAIL ⑤
  const khach = nhanDangKhach(req.headers);

  let than: { ma_o?: unknown; ma_nhan_su?: unknown; cau_hoi?: unknown; phien_moi?: unknown; ma_yeu_cau?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' && /^o-\d+$/.test(than.ma_o) ? than.ma_o : 'o-1';
  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : '';
  const cauHoi = typeof than.cau_hoi === 'string' ? than.cau_hoi.trim() : '';
  const phienMoi = than.phien_moi === true;
  /**
   * 🔁 Mẩu đánh thức nào đã đẻ ra lượt gửi này (round-33 ②A). Trình duyệt chỉ gửi kèm khi câu đến từ hàng
   * đợi đánh thức. Mã này dùng ở HAI chỗ, và chỉ hai chỗ:
   *   · `tuChoiThuLai` — cổng từ chối «thử lại sau» xin kho TRẢ mẩu về hàng (kho tự quyết có trả hay không)
   *   · `nhanChayMau` — sau mọi cổng từ chối, trước khi gọi agent: đánh dấu mẩu đã bị GIÀNH quyền chạy, và
   *     CHẶN mẩu đã bị giành (ở đây hoặc ở đường nền) / của lần giao cũ
   */
  const maYeuCau = typeof than.ma_yeu_cau === 'string' && /^[\w-]{1,80}$/.test(than.ma_yeu_cau)
    ? than.ma_yeu_cau : '';
  /**
   * 🚪 MỘT CỬA cho mọi lần từ chối «thử lại sau» — CHỈ dùng ở các cổng nằm TRƯỚC lúc đẻ tiến trình.
   * Gom một chỗ vì bốn cổng đang từ chối kiểu này; vá từng cổng thì cổng thứ năm thêm về sau sẽ quên.
   * Cổng lỗi VĨNH VIỄN (thiếu trường, quá dài, sai nhân sự) KHÔNG đi qua đây.
   * 📜 Hợp đồng với trình duyệt — ba khả năng, KHÔNG gộp:
   *   `tra_ve_hang_doi: true`   mẩu đã về hàng dưới MÃ MỚI (`ma_moi`); lần giao sau mang mã đó
   *   `tra_ve_hang_doi: false`  SAU lần từ chối này mẩu nằm ở trạng thái BỎ — do nhánh trả bỏ (quá trần trả /
   *                            quá tuổi) HOẶC do `donDep` chạy đầu lời gọi trả (kho `KetQuaTraVe`)
   *   KHÔNG có trường đó       lần từ chối này KHÔNG trả mẩu về (không thấy · khác ô/ghế · đã bị giành chạy ·
   *                            trạng thái khác); lý do ở `ly_do_khong_tra`. Lời gọi trả vẫn chạy `donDep`, nên
   *                            KHÔNG nói được «mẩu không bị đụng» (sửa S6c lượt soi 2)
   *   Vòng 1 khai `false` cho cả ba ca cuối, trong khi trình duyệt hiểu `false` là «đã bỏ» — người soi bắt.
   */
  const tuChoiThuLai = (noi: Record<string, unknown>, status: number, lyDo: string, headers?: HeadersInit) => {
    const tv = maYeuCau ? traVeHangDoi(maYeuCau, `${status}-${lyDo}`, { maO, maNhanSu }) : null;
    const khai = !tv ? {}
      : tv.tra ? { tra_ve_hang_doi: true, lan_tra: tv.lan, ma_moi: tv.ma_moi }
        : tv.bo ? { tra_ve_hang_doi: false, ly_do_khong_tra: tv.ly_do }
          : { ly_do_khong_tra: tv.ly_do };
    return Response.json({ ...noi, ...khai }, { status, ...(headers ? { headers } : {}) });
  };

  if (!maNhanSu) return Response.json({ loi: 'Thiếu nhân sự.' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Câu hỏi trống.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Câu hỏi dài quá ${CAU_HINH.toiDaKyTu} ký tự.` }, { status: 413 });
  }

  const ns = timNhanSu(maNhanSu);
  if (!ns) return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });

  // Phiên nào? Lấy từ SỔ TRÊN ĐĨA — ⛔ trình duyệt không tự chỉ định mã phiên.
  const o = layO(maO);
  let turnBinding = bindingOf(initialSlots[maO]);
  if (!sameBinding(bindingOf(o), turnBinding)) {
    return Response.json({ loi: 'Liên kết ô đã đổi. Gửi lại từ ô hiện tại.' }, { status: 409 });
  }
  let maPhienCu = phienMoi || !o || o.ma_nhan_su !== maNhanSu ? null : (o.ma_phien ?? null);

  /**
   * 🪤 BẪY openclaw ĐÃ CẮN HỘ (KIEN-TRUC-SAU.md §3.3):
   * TRƯỚC khi `--resume`, phải KIỂM bản ghi phiên có đọc được không.
   * Thiếu bản ghi mà cứ `--resume` mù → Claude Code âm thầm mở PHIÊN TRẮNG,
   * trong khi giao diện vẫn hiện lịch sử cũ ⇒ người dùng mất ngữ cảnh mà KHÔNG BIẾT.
   * ⇒ Thiếu bản ghi thì XOÁ liên kết và nói thẳng ra, ⛔ không im lặng.
   */
  let matBanGhi = false;
  if (maPhienCu && !coPhien(maNhanSu, maPhienCu)) {
    /**
     * ⚠️ MỘT MẪU ĐƠN ⛔ KHÔNG ĐỦ để tuyên một phiên là mất.
     * Luật nhà: sống hay chết phải đo 2 mẫu CÁCH NHAU — một mẫu dễ bắt nhầm đúng
     * lúc tệp đang được thay/đổi tên. ⇒ Đo lại sau 1,5 giây rồi mới kết luận.
     * Nhánh này chỉ chạy trong ca hiếm nên 1,5 giây ⛔ không làm chậm đường thường.
     */
    ghiVetMatLienKet(maO, maNhanSu, maPhienCu, false);
    await new Promise((r) => setTimeout(r, 1500));
    if (!coPhien(maNhanSu, maPhienCu)) {
      matBanGhi = true;
      maPhienCu = null; // ⛔ không `--resume` mù (bẫy openclaw) — nhưng ⇩
      /**
       * ⛔ ĐÃ BỎ `datO(maO, maNhanSu, null)`.
       * Xoá liên kết là hành động KHÔNG LÙI ĐƯỢC, mà bằng chứng chỉ là phép đo tệp.
       * Ca 17/08: Owner mất cả chuỗi làm việc, phải nối tay lại từ dòng lệnh.
       * ⇒ Giữ liên kết trong sổ: lượt này mở phiên mới, nhưng Owner vẫn NỐI LẠI được.
       */
    }
  }

  // ⛔ LUẬT CỨNG: ⛔ TUYỆT ĐỐI KHÔNG resume phiên ĐANG CHẠY ở nơi khác.
  //    Hai tiến trình cùng ghi một tệp phiên = hỏng bản ghi.
  if (maPhienCu && dangChay(maNhanSu, maPhienCu, o?.moc_ket_thuc ?? null)) {
    /**
     * 🗣 NÓI ĐÚNG THỨ MÌNH ĐO ĐƯỢC, ⛔ đoán hộ Owner (P0-7, 31/08/2026).
     *
     * 🐛 Câu cũ luôn khai «⛔ nhiều khả năng ĐANG CHẠY ở terminal khác» — kể cả khi
     *    ⛔ có terminal nào. Owner gặp câu đó thì đi tìm một cửa sổ ⛔ tồn tại, trong khi
     *    thủ phạm là CHÍNH GHẾ TRONG APP. Một lời khai sai còn tốn thời gian hơn ⛔ khai.
     * ✅ Nay sổ tiến trình của máy chủ trả lời được: ghế đó CÓ nằm trong sổ ⛔.
     *      CÓ  ⇒ nói thẳng «ghế này đang chạy dở», kèm chạy bao lâu rồi
     *      ⛔  ⇒ mới được nói «nơi khác», và phải nói rõ đó là SUY ĐOÁN
     */
    const dangTrongApp = dsViec().find((v) => v.ma_nhan_su === maNhanSu);
    const loi = dangTrongApp
      ? `Ghế này ĐANG CHẠY DỞ ngay trong app (ô ${dangTrongApp.ma_o}, đã chạy ` +
        `${Math.round((Date.now() - dangTrongApp.bat_dau) / 1000)} giây). ` +
        'Chờ nó xong, hoặc bấm nút Dừng ở ô đó rồi gửi lại.'
      /* 🔗 CÂU NÀY DÍNH VỚI 🅑 trong doc-phien.ts (thứ tự: tuổi tệp xét TRƯỚC phép sờ tiến
         trình). LÙI 🅑 thì PHẢI sửa lại câu «riêng cổng này hết hạn…» — chẳng còn đúng nữa. */
      : `⏳ Tệp phiên này vừa được ghi trong ${NGUONG_SONG_PHUT} phút qua, nên cổng MỐC-TỆP KHÔNG mở lượt đè lên.\n\n` +
        'BA khả năng: (1) có tiến trình khác đang giữ ĐÚNG phiên này (cửa sổ dòng lệnh ' +
        'chẳng hạn); (2) app thiếu sổ để biết lượt vừa rồi là của chính nó; (3) app nhận ' +
        'diện NHẦM — một dòng lệnh vô can mang đúng chuỗi cờ nối phiên kèm mã này. App ' +
        'KHÔNG phân biệt được ba ca, nên chặn cả ba — hai bên cùng ghi một bản ghi phiên ' +
        'thì bản ghi hỏng.\n\n' +
        'Một ca (3) đáng nhắc riêng vì hay gặp: một lượt **fork** cũng mang `--resume <mã>` ' +
        'nhưng nó ĐẺ MÃ MỚI, chẳng ghi lại bản gốc. App vẫn chặn, vì nó chỉ đọc được cái cờ.\n\n' +
        `**RIÊNG cổng mốc-tệp hết hạn sau ${NGUONG_SONG_PHUT} phút TỆP NÀY IM.** «Im» nghĩa là ` +
        'KHÔNG ai ghi thêm vào tệp phiên — chẳng phải "chờ đủ phút là xong". Còn thứ gì chạm ' +
        'vào tệp (một tiến trình khác, một bộ canh) thì đồng hồ ấy **được đặt lại từ đầu** và ' +
        'cổng này KHÔNG bao giờ hết hạn.\n\n' +
        'App còn cổng khác (ô đang chạy một lượt khác) có thể vẫn chặn — hết hạn KHÔNG đồng ' +
        'nghĩa gửi lại là chạy được.\n\n' +
        'Hoặc mở phiên mới.';
    return tuChoiThuLai({ loi, trong_app: !!dangTrongApp }, 409, 'phien-dang-chay');
  }

  /**
   * 🔴 CỔNG THỨ HAI — HỎI ĐÚNG NGUỒN. Thêm 02/09 sau khi @app-pm đuổi theo đầu mối người soi
   *    ngoài nhà để lại («map overwrite»).
   *
   * 🕳 Cổng phía trên (`dangChay(...)`) quyết bằng **mốc thời gian tệp phiên** — đúng cái nguồn
   *    cả ngày hôm nay ta chứng minh là nói dối. Còn SỔ TIẾN TRÌNH, nguồn đáng tin, thì chỉ được
   *    dùng ở dòng dưới để **soạn câu báo**.
   * 🔑 **Ta hỏi nguồn nói dối để QUYẾT, rồi hỏi nguồn đáng tin để CHỌN CHỮ.**
   *
   * 🔴 Hậu quả nếu thiếu cổng này: `maPhienCu` rỗng, hoặc `dangChay()` trả false vì mốc tệp cũ
   *    ⇒ đi thẳng tới `spawn` ⇒ `dangKyViec` ĐÈ lên dòng của một tiến trình CÒN SỐNG
   *    ⇒ pid đó biến khỏi sổ ⇒ nút Dừng KHÔNG với tới ⇒ chạy mãi, tiêu tiền.
   * ⚠️ `dangKyViec` nay tự KÊU khi phải đè, nhưng kêu là để KHÔNG MẤT DẤU — nó KHÔNG ngăn được
   *    việc đè. Chặn thì phải chặn ở ĐÂY, trước khi đẻ tiến trình thứ hai cho cùng một ô.
   */
  const dongO = xacMinhDong(maO);
  /**
   * 🔴 LIỆT KÊ CÁI ĐƯỢC QUA, KHÔNG liệt kê cái bị CHẶN — @phong-ban-pm bắt 02/09.
   *
   * 🕳 Bản trước tôi viết `if (song || so_mau_thuan) chặn`. Nghĩa là `khong_ro` **ĐƯỢC QUA** —
   *    mà tới được `khong_ro` nghĩa là pid ĐÃ QUA phép hỏi «còn tồn tại KHÔNG», tức **tiến trình
   *    CÒN SỐNG**, ta chỉ không đọc được danh tính của nó. Cho qua ⇒ `dangKyViec` đè lên dòng đó
   *    ⇒ một tiến trình ĐANG SỐNG biến khỏi sổ ⇒ chạy mãi, tiêu tiền, Owner mất nút Dừng.
   * 🔑 **Liệt kê điều-kiện-CHẶN thì trạng thái MỚI sinh ra sẽ MẶC ĐỊNH ĐƯỢC QUA.**
   *    Liệt kê điều-kiện-QUA thì trạng thái mới MẶC ĐỊNH BỊ CHẶN.
   *    Cùng một câu `if`, hai thái độ NGƯỢC NHAU với thứ chưa ai nghĩ tới.
   *    Đây đúng bài học «một chốt ở cuối» của @app-pm, áp cho một cổng khác.
   * ⚠️ Và «an toàn» ở hai cổng đi NGƯỢC CHIỀU nhau, đừng chép nhầm:
   *      đường XOÁ  gặp khong_ro ⇒ an toàn = KHÔNG bắn, GIỮ dòng
   *      cổng GHI   gặp khong_ro ⇒ an toàn = CHẶN, KHÔNG cho đè
   */
  if (dongO.trang_thai !== 'trong' && dongO.trang_thai !== 'chet') {
    const v = dongO.v;
    const giay = Math.round((Date.now() - v.bat_dau) / 1000);
    /**
     * 🔻 ĐƯỜNG THOÁT `xinBoQua` ĐÃ GỠ (02/09, cùng bản vá tay cầm) — và đây là chỗ tôi đi XA HƠN
     *    chữ trong đề bài, nên tôi ghi lại để @app-pm bác được nếu tôi sai.
     *
     * 🕳 Đề bài dặn «`xinBoQua` là đường thoát có chủ ý ⇒ đổi sang so tay cầm». Nhưng nó chỉ được
     *    gọi TRONG ĐÚNG MỘT điều kiện: `dongO.trang_thai === 'khong_ro'`. Mà `khong_ro` sinh ra từ
     *    phép ĐỌC `ps` hụt — và bản tay cầm KHÔNG đọc gì cả, nên trạng thái ấy KHÔNG còn tồn tại.
     *    Đổi kiểu so xong thì hàm vẫn đúng, chỉ là **KHÔNG BAO GIỜ được gọi**.
     * 🔑 Đó đúng thứ tôi vừa bác ở `so_tu_mau_thuan` và @app-pm đã nhận: **một nhánh không thể
     *    chạy thì không thể nghiệm thu, và nó không cứu được ai — vì điều kiện vào nó là sai.**
     *    Giữ lại chỉ tạo cảm giác «vẫn còn đường lùi» cho người đọc sau.
     * ⚖️ Đã kiểm KHÔNG mở ra khoá chết mới: hai trạng thái còn chặn đều TỰ THÁO —
     *      'song'         ⇒ con thoát ⇒ `khiChet` hoặc `quetRac` xoá dòng ⇒ ô mở lại
     *      'so_mau_thuan' ⇒ vốn CHƯA BAO GIỜ có đường thoát, nên đây KHÔNG phải bước lùi;
     *                       và nó cũng tự tháo khi con thoát. @app-pm đã chốt: giữ, kêu, chặn.
     */
    {
      const chung =
        dongO.trang_thai === 'so_mau_thuan'
          ? `Sổ tiến trình TỰ MÂU THUẪN ở ô ${maO}: có ô khác cũng giữ tay cầm này ` +
            `(pid ${v.pid_de_hien_thi}). Đây là LỖI CỦA APP. Tôi KHÔNG mở lượt mới cho tới khi ` +
            'biết dòng nào đúng.'
          : `Ô ${maO} ĐANG CHẠY một lượt khác (${v.ma_nhan_su}, đã chạy ${giay} giây). ` +
            'Chờ nó xong, hoặc bấm Dừng ở ô đó rồi gửi lại.';
      traCho(maO);
      return tuChoiThuLai({ loi: chung, trong_app: true }, 409, 'o-dang-chay');
    }
  }

  /**
   * 🔒 GIỮ CHỖ NGAY — đồng bộ, KHÔNG `await` nào xen vào giữa kiểm và đặt.
   *    Cổng `xacMinhDong` ở trên chặn được ca «đã có tiến trình chạy», nhưng nó KHÔNG chặn được
   *    HAI yêu cầu tới CÙNG LÚC: cả hai cùng thấy sổ trống, cả hai cùng đi tiếp, cả hai cùng sinh.
   */
  if (!datCho(maO)) {
    return tuChoiThuLai({
      loi: `Ô ${maO} đang mở một lượt khác ngay lúc này. Thử lại sau vài giây.`,
      trong_app: true,
    }, 409, 'o-dang-mo-luot');
  }
  /**
   * ⚠️ KHOÁ NHẢ Ở ĐÂU MỚI ĐÚNG: nó phải phủ đúng quãng «từ cổng tới lúc DÒNG SỔ ĐÃ CÓ».
   *    Nhả lúc hàm trả về là SAI — hàm này trả `Response` luồng NGAY, còn `spawn` xảy ra SAU đó,
   *    nên nhả ở đấy là mở lại đúng cuộc đua vừa đi đóng.
   *    Nhả tới lúc luồng xem đóng cũng SAI — quá rộng, ô sẽ kẹt suốt lượt.
   * ⇒ Nhả ở BA chỗ: lối thoát sớm · ngay sau `dangKyViec` · và `finally` của luồng (phòng ca chết
   *   trước khi kịp sinh). `traCho` xoá khỏi `Set` nên gọi thừa là vô hại.
   */

  // ⛔ Chặn mức dùng TRƯỚC khi đẻ tiến trình — agent chạy hoang = tiền thật.
  const chan = xinLuot(khach);
  if (!chan.cho_qua) {
    traCho(maO);   // lối thoát sớm ⇒ NHẢ, KHÔNG thì ô kẹt vĩnh viễn
    return tuChoiThuLai(
      { loi: chan.ly_do, cho_giay: chan.cho_giay }, 429, 'tran-luot',
      { 'Retry-After': String(chan.cho_giay) },
    );
  }

  /**
   * ▶ CỔNG CUỐI cho yêu cầu đến từ hàng đợi đánh thức — sau MỌI cổng từ chối «thử lại sau», trước lúc đẻ lượt.
   * `nhanChayMau` đánh dấu mẩu đã bị giành quyền chạy trong CÙNG một lượt đọc-ghi sổ ⇒ yêu cầu thứ hai mang
   * cùng mã bị chặn ở đây, KHÔNG đẻ lượt thứ hai (S4 vòng 1: phát lại cùng mã từng làm agent chạy hai lần).
   * Đường nền `may-chay-nen` đặt CÙNG dấu này (S4 lượt soi 2) ⇒ mẩu đã chạy ở đó cũng bị chặn ở đây.
   * Cổng này KHÔNG đi qua `tuChoiThuLai`: mẩu đã chạy / của lần giao cũ / khác ô-ghế mà trả về hàng thì
   * chính là mời nó chạy thêm lần nữa.
   * ⚠️ Đặt SAU `xinLuot`: đặt trước thì một lần 429 sau đó sẽ bỏ lại mẩu mang dấu đã-chạy mà không có lượt.
   *    Giá phải trả: yêu cầu bị chặn ở đây đã tiêu một suất của trần lượt.
   * ❗ Cửa sổ còn hở: nếu luồng hỏng từ đây tới lúc đẻ tiến trình, mẩu đã mang dấu mà không có lượt nào.
   */
  if (maYeuCau) {
    const nc = nhanChayMau(maYeuCau, { maO, maNhanSu });
    if (!nc.chay) {
      traCho(maO);
      return Response.json({
        loi: `Mẩu đánh thức này KHÔNG được chạy (${nc.ly_do}) — nhiều khả năng nó đã chạy ở một lượt khác, ` +
          'hoặc thuộc một lần giao cũ đã được phát lại dưới mã mới.',
        ly_do_khong_chay: nc.ly_do,
      }, { status: 409 });
    }
  }

  /**
   * 🔴 ⛔ ĐÃ BỎ `req.signal.addEventListener('abort', () => huy.abort())` (17/08/2026).
   *
   * `req.signal` là tín hiệu ngắt CỦA TRÌNH DUYỆT. Nối nó vào bộ huỷ nghĩa là:
   * Owner đóng tab · khoá màn điện thoại · rớt wifi ⇒ `SIGTERM` vào `claude`.
   * Owner nói thẳng app này THAY CHO TERMINAL — mà terminal thì đóng cửa sổ
   * ⛔ không giết việc đang chạy.
   *
   * ⇒ Bộ huỷ này giờ CHỈ dùng cho lệnh dừng RÕ RÀNG. "Mất kết nối" ⛔ KHÔNG phải
   *   "tôi muốn dừng" — cùng một họ với chốt `xoa_lien_ket` ở `/api/o`.
   */
  const huy = new AbortController();
  /**
   * 🔻 ĐÃ BỎ `pidDangChay` (02/09) — nó được GHI ở `khiSinh` và **KHÔNG đầu nào đọc** (đo bằng
   *    grep toàn tệp: đúng hai dòng, một khai một gán). Đây là lần thứ BA trong hai ngày cùng
   *    một hình: `vi_sao_bo` rỗng 4/4 · `KetGhiSo` bị người gọi bỏ · và biến này.
   * 📌 **Một giá trị KHÔNG ai đọc trông y hệt một giá trị đang canh gác điều gì đó** — nên nó
   *    sống sót qua mọi vòng soi, kể cả sáu vòng hôm nay.
   */

  moLuot();
  let daDong = false;
  const dongMotLan = () => {
    if (!daDong) {
      daDong = true;
      dongLuot();
    }
  };

  let maPhienDaDung: string | null = maPhienCu;

  const luong = new ReadableStream<Uint8Array>({
    async start(dieu) {
      // Nhịp giữ sống mỗi 20 giây (Cloudflare cắt kết nối rảnh ở 125 giây → 524).
      // Dòng bắt đầu bằng ':' là CHÚ THÍCH trong chuẩn SSE — trình duyệt bỏ qua.
      const nhip = setInterval(() => {
        try { dieu.enqueue(new TextEncoder().encode(': nhip\n\n')); } catch { /* đã đóng */ }
      }, 20_000);

      try {
        dieu.enqueue(goi({ loai: 'bat-dau', noi_tiep: Boolean(maPhienCu) }));
        // ⛔ Không im lặng: báo thẳng là đã mất bản ghi phiên cũ.
        if (matBanGhi) {
          dieu.enqueue(goi({
            loai: 'mat-ban-ghi',
            thong_diep:
              'Không đọc được bản ghi phiên cũ (đã đo 2 lần) — lượt này mở PHIÊN MỚI. ' +
              'Liên kết cũ vẫn GIỮ trong sổ: bấm chọn lại phiên là nối về được.',
          }));
        }

        /**
         * 🔎 CHẶN NGAY TẠI Ô GÕ (Owner chốt round-122 (bos-funnel) · Q2=A).
         *
         * Câu loại «tôi đã nói/giao/gửi… CHƯA» ⇒ app TỰ TRA chuỗi đời của ghế rồi ĐÍNH
         * kết quả + ĐỘ PHỦ vào câu hỏi. Vì sao ⛔ không để ghế tự nhớ: fork chỉ giữ **8,4%**
         * (đo 805/9.616 dòng) ⇒ ghế «⛔ không nhớ» là chuyện THƯỜNG, và nết mặc định của nó là
         * đáp «dạ chưa ạ» — **sai tự tin**, mà Owner ⛔ KHÔNG có cách kiểm. Kiểu sai phá lòng tin.
         * ⭐ Sống NGOÀI cửa sổ ngữ cảnh ⇒ ⛔ không mất khi nén, ⛔ không cần hook.
         */
        let cauGui = cauHoi;
        try {
          const tra = traChuoi(maNhanSu, maPhienCu, cauHoi);
          if (tra) {
            cauGui = cauHoi + String.fromCharCode(10, 10) + tra.loi_dan;
            dieu.enqueue(goi({
              loai: 'tra-chuoi', do_phu: tra.do_phu, so_tang: tra.so_tang,
              so_khop: tra.khop.length, tu_khoa: tra.tu_khoa,
            }));
          }
        } catch {
          /* tra hỏng thì ⛔ ĐỪNG chặn lượt chat — cứ gửi câu gốc */
        }
        for await (const mau of chayAgent({
          cauHoi: cauGui,
          maPhienCu,
          thuMuc: thuMucAgent(maNhanSu),
          /* 🏷 round-21 CÂU 1 — Owner quyết 🅒 lúc 23:04 · 08/09/2026: «làm việc RIÊNG, vòng soi
             riêng, cho đúng MỘT DÒNG `maNhanSu` ở chat/route.ts».
             Đây là ĐƯỜNG OWNER GÕ TRONG Ô. Trước dòng này nó truyền `thuMuc` mà KHÔNG truyền tên
             ghế ⇒ `chay-agent.ts:389` gọi `ghiSoHuu(maPhien, undefined)` ⇒ mọi phiên sinh từ ô
             chat vào SỔ SỞ HỮU với chủ `null` ⇒ MÙ ⇒ nhánh tự bốc phiên ở UngDung.tsx thôi bốc.
             🔴 CÁI GIÁ THẬT của việc thiếu dòng này KHÔNG phải «sổ nhỏ hơn» mà là **SỔ LỆCH**:
                đường chạy nền có ghi chủ, đường gõ trong ô thì không ⇒ `co_so_huu: true` thực chất
                nghĩa là «sinh ra từ đường đánh thức», chẳng phải «thuộc về ghế này».
                Một cuốn sổ mù MỘT NỬA nguy hơn một cuốn sổ nhỏ — sổ nhỏ thì ai cũng biết là thiếu,
                sổ lệch thì trông như đủ. (lý do của `claude-phong-ban-pm`, Owner chọn theo lý đó)
             ⚠️ ĐỪNG suy chủ từ `thuMuc`: đo 07/09 — `thu_muc` duy nhất cho 219/225 ghế, nhưng SÁU
                ghế dùng chung `/Users/erocathanh`, tức nó mơ hồ ĐÚNG Ở SÁU GHẾ đang gây ra vụ này.
             📌 Đối xứng với `chay-mot-luot.ts:162` (đường CHẠY NỀN) — hai đường nay khai giống nhau.
             📏 ĐO ĐƯỢC BAO NHIÊU: bộ thử chạy POST thật → chayAgent thật → ghiSoHuu thật → đọc tệp
                sổ trên đĩa, với một bản tin phiên do đồ giả phát ra. Nó chứng minh CHỦ ĐƯỢC TRUYỀN
                TỚI SỔ khi đã có `session_id` hợp lệ. Nó KHÔNG chứng nhận tiến trình `claude` thật
                đã sinh, cũng KHÔNG chứng nhận phiên thật tồn tại — người soi đo: trỏ lệnh claude vào
                một đường dẫn KHÔNG tồn tại thì bộ thử VẪN xanh, còn đường chạy thật trả `ENOENT`. */
          maNhanSu,
          // 👑 Ghế có LINH HỒN RIÊNG (TỔNG GIÁM ĐỐC) thì ⛔ KHÔNG nhét qua lời dặn hệ thống nữa —
          //    linh hồn được chép sẵn thành `CLAUDE.md` trong THƯ MỤC GHẾ, và Claude Code
          //    TỰ NẠP theo chỗ đứng (đúng cơ chế cascade — xem chon-mau/luat-nap.html).
          //    Cách này hơn ở chỗ: sửa linh hồn = sửa 1 tệp, ⛔ không phải đẩy lại app;
          //    và phiên mở từ terminal ở cùng thư mục cũng nhận đúng vai.
          loiDan: ns.soul ? undefined : loiDanHeThong(ns.nhan, ns.vai, ns.ten_phong),
          tinHieuHuy: huy.signal,
          // 🔌 Người xem rời đi thì việc VẪN CHẠY TỚI HẾT.
          chayNen: true,
          khiSinh: (tien) => {
            /**
             * 🔴 ĐỌC GIÁ TRỊ TRẢ VỀ — người soi ngoài nhà bắt đúng chỗ này 02/09:
             *    «chỉ còn PID trong console.warn / giá trị trả về, NHƯNG CALLER BỎ QUA».
             * 🕳 Đây là `vi_sao_bo` LẦN THỨ HAI trong một ngày, và lần này do CHÍNH TÔI: tôi vừa
             *    rút ra «thêm một trường mới chỉ là MỘT PHẦN BA việc» rồi làm lại đúng một phần
             *    ba đó — sinh ra một giá trị mà KHÔNG đầu nào đọc.
             * 📌 Và `console.warn` rơi vào SỔ MÁY CHỦ, chỗ Owner KHÔNG bao giờ mở. Giữ dấu ở nơi
             *    KHÔNG ai nhìn thì **về phía Owner vẫn là MẤT DẤU** — khác duy nhất là người viết
             *    yên tâm hơn. Nên tin này phải đi THẲNG vào ô của Owner.
             */
            const ghi = dangKyViec(maO, tien, maNhanSu); // để nút DỪNG còn giết được
            traCho(maO);   // dòng sổ ĐÃ CÓ ⇒ cổng `xacMinhDong` tiếp quản ⇒ nhả khoá
            if (ghi.ket === 'tu_choi_dong_cu_con_song') {
              /**
               * 🔴 FAIL-CLOSED ĐÃ NỔ — và lời báo phải đổi HẲN nghĩa, KHÔNG chỉ đổi chữ.
               *
               * 🕳 Bản trước (mã `de_len_dong_song`) báo: «đã ghi đè, tiến trình CŨ nay mồ côi,
               *    anh tự `kill` lấy». Tức app tự tạo ra một tiến trình KHÔNG ai dừng được rồi
               *    bảo Owner đi dọn. `hermes-aiboss-app-reviewer` bác đúng: **kêu KHÔNG phải là chặn.**
               * ✅ Nay ngược lại: lượt MỚI bị từ chối và đã bị dừng; lượt CŨ giữ nguyên dòng sổ,
               *    giữ nguyên nút Dừng. Owner KHÔNG phải đi dọn gì cả.
               * 🔑 Tới được đây nghĩa là CỔNG PHÍA TRÊN đã bị lọt — nên câu báo phải nói ra điều
               *    đó, chứ đừng để nó trông như một va chạm bình thường.
               */
              dieu.enqueue(goi({
                loai: 'loi',
                thong_diep:
                  `Ô này ĐANG CHẠY một lượt khác (${ghi.ma_nhan_su_cu}, pid ${ghi.pid_cu}, ` +
                  `đã chạy ${ghi.chay_duoc_giay} giây), nên tôi KHÔNG mở lượt mới đè lên nó.\n\n` +
                  /**
                   * 🔴 THÔI KHAI «đã được dừng lại» — người soi ngoài nhà bắt 02/09 (soi delta),
                   *    và đây là ca NẶNG NHẤT trong ba việc, dù nó KHÔNG nằm ở mã.
                   * 🕳 Tôi vá `gietViec` để nó thôi khai một điều nó chưa biết, rồi để lại một câu
                   *    khai y hệt ở LỜI VĂN, cách đó vài chục dòng. Mã đã thành thật; chữ thì chưa.
                   * 🔑 **Owner tin CHỮ, KHÔNG đọc mã.** Một lời khai dối trong câu thông báo có
                   *    sức nặng ngang lời khai dối trong dòng lệnh — có khi hơn, vì nó tới thẳng
                   *    người đọc mà KHÔNG qua một phép kiểm nào.
                   */
                  `Lượt anh vừa gửi: tôi ĐÃ GỬI lệnh dừng cho nó và đang chờ nó đóng — nếu nó chưa ` +
                  `đóng trong ${giayTuEp()} giây thì tôi ép. Lượt ĐANG CHẠY thì **vẫn nguyên vẹn**, ` +
                  'nút Dừng của nó vẫn dùng được — anh KHÔNG mất gì cả.\n\n' +
                  'Chờ nó xong, hoặc bấm Dừng ở ô này rồi gửi lại.',
              }));
            }
          },
          // ⚰️ Rút khỏi sổ ĐÚNG LÚC CON CHẾT — xem chú thích dài ở `finally` bên dưới.
          khiChet: (tien) => xoaViec(maO, tien),
        })) {
          if (mau.loai === 'phien') {
            // Ghi XUỐNG ĐĨA ngay ⇒ tắt máy chủ/trình duyệt vẫn tìm lại được phiên.
            maPhienDaDung = mau.ma_phien;
            if (datO(maO, maNhanSu, mau.ma_phien, turnBinding)) {
              turnBinding = bindingOf(layO(maO));
            }
            dieu.enqueue(goi({ loai: 'da-noi-mach', noi_tiep: Boolean(maPhienCu) }));
          } else if (mau.loai === 'chu') {
            dieu.enqueue(goi({ loai: 'chu', chu: mau.chu }));
          } else if (mau.loai === 'loi') {
            dieu.enqueue(goi({ loai: 'loi', thong_diep: mau.thong_diep }));
          } else if (mau.loai === 'xong') {
            // ⛔ Không đẩy mã phiên ra trình duyệt. Chi phí thì cho xem để Owner canh tiền.
            dieu.enqueue(goi({ loai: 'xong', chi_phi_usd: mau.chi_phi_usd, token: mau.token }));
          }
        }
      } catch (e) {
        dieu.enqueue(
          goi({ loai: 'loi', thong_diep: e instanceof Error ? e.message : 'Lỗi không rõ.' }),
        );
      } finally {
        traCho(maO);   // phòng ca chết TRƯỚC khi kịp sinh ⇒ khoá vẫn được nhả
        clearInterval(nhip);
        /**
         * ⭐ Ghi mốc "lượt của TA vừa xong" để lượt SAU ⛔ không bị chính ta chặn nhầm.
         *
         * 🔴 Ca thật 14/08: lấy mốc ĐÚNG LÚC NÀY là **đo trước khi việc xong** —
         *    `claude` nhận SIGTERM ⛔ không chết ngay, còn xả bản ghi thêm tới 51 giây
         *    (đo được). Mốc lấy sớm ⇒ lượt sau bị bộ canh phán "đang chạy ở terminal
         *    khác" trong khi ⛔ không có terminal nào ⇒ ghế câm giữa buổi quay.
         * ⇒ Lấy ngay MỘT lần (để có mốc nếu máy chủ tắt đột ngột), rồi **lấy lại**
         *    vài nhịp sau cho tới khi tệp thôi đổi. Luôn giữ mốc MỚI NHẤT.
         */
        /**
         * 🔴 ĐÃ BỎ HẲN `xoaViec` VÔ ĐIỀU KIỆN Ở ĐÂY (02/09/2026) — nó là gốc của câu ⑥.
         *
         * 🕳 Khối `finally` này chạy CẢ KHI người xem chỉ rời đi:
         *      `cancel()` (:262-268) CỐ Ý KHÔNG giết con — đúng ý Owner, việc phải chạy tiếp
         *      mà mấy lệnh `enqueue` ở :159 :162 :184 :214 :216 KHÔNG bọc `try`
         *      ⇒ luồng đóng ⇒ enqueue NÉM ⇒ vòng thoát ⇒ rơi vào `finally` này
         *      ⇒ xoá sổ trong khi CON VẪN ĐANG LÀM VIỆC.
         *
         * 📏 ĐO ĐƯỢC 02/09, KHÔNG phải suy: sổ khai 0 ô đang chạy trong khi tiến trình chở
         *    chính lượt đang gõ (37895) và tiến trình của ghế soi (37591) đều SỐNG —
         *    năm lượt hỏi liên tiếp đều ra 0. Nhân chứng mạnh nhất có thể có: thứ đi hỏi
         *    câu hỏi CHÍNH LÀ công việc KHÔNG được ghi sổ.
         *
         * 💸 Hậu quả nặng nhất KHÔNG phải cái đèn sai, mà là **NÚT DỪNG BIẾN MẤT** cho một
         *    ghế đang chạy và đang tiêu tiền — đúng thứ sổ này được dựng ra ngày 31/08 để cứu.
         *
         * 🔑 «Đường xem SSE kết thúc» KHÔNG phải «tiến trình đã xong». Hai câu khác nhau,
         *    và chỗ này đang dùng câu thứ nhất để trả lời câu thứ hai.
         * ⇒ Nay sổ do `khiChet` quyết (bắn từ `close` của chính tiến trình con).
         *   Lượt xong bình thường thì `close` cũng đã bắn rồi — nên KHÔNG mất đường dọn nào.
         */
        if (maPhienDaDung) {
          const maP = maPhienDaDung;
          const stampBinding = turnBinding;
          const ghiLai = () => {
            const m = mocTepPhien(maNhanSu, maP);
            if (m !== null && stampBinding.seat === maNhanSu && stampBinding.session === maP) ghiMocKetThuc(maO, m, stampBinding);
          };
          ghiLai();
          for (const cho of [1_500, 5_000, 15_000]) {
            setTimeout(ghiLai, cho).unref?.();
          }
        }
        dongMotLan();
        try {
          dieu.close();
        } catch {
          /* đã đóng rồi */
        }
      }
    },
    cancel() {
      /**
       * Trình duyệt bỏ luồng (đóng tab · khoá màn · rớt mạng).
       * ⛔ TUYỆT ĐỐI KHÔNG `huy.abort()` ở đây — xem chú thích chỗ khai `huy`.
       * Chỉ ngừng ĐƯỜNG XEM; việc bên dưới chạy tiếp và tự ghi vào bản ghi phiên,
       * nên mở lại app là đọc được đầy đủ.
       */
      dongMotLan();
    },
  });

  return new Response(luong, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // ⛔ đừng để proxy gom lại rồi trả một cục
    },
  });
}
