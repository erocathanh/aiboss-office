import { NextRequest } from 'next/server';
import { chayAgent } from '@/lib/chay-agent';
import { CAU_HINH, loiDanHeThong } from '@/lib/cau-hinh';
import { xinLuot, moLuot, dongLuot, nhanDangKhach } from '@/lib/chan-muc-dung';
import { layO, datO, ghiMocKetThuc } from '@/lib/kho-phien';
import { thuMucAgent, dangChay, coPhien, mocTepPhien, NGUONG_SONG_PHUT, luuMetadataPhien } from '@/lib/doc-phien';
import { isViewerGoneGuardDisabledForTest, isBypassSlotGateForTest } from '@/lib/test-seams';
import { dangKyViec, xoaViec, dsViec, xacMinhDong, datCho, traCho, giayTuEp } from '@/lib/kho-tien-trinh';
import { generateRunOrWakeId, recordRun, updateRun } from '@/lib/runs-ledger';
import { ghiVetMatLienKet } from '@/lib/vet-mat-lien-ket';
import { timNhanSu } from '@/lib/nhan-su';
import { traChuoi } from '@/lib/tra-chuoi';
import { batMotLan } from '@/lib/khoi-dong-nen';
import { isSeatHeldByTerminal, claimSeat, updateSeatActivePid } from '@/lib/seat-active';

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
  batMotLan(); // 🚀 cửa Node có nhịp gọi dày nhất — hermes FAIL ⑤
  const khach = nhanDangKhach(req.headers);

  let than: { ma_o?: unknown; ma_nhan_su?: unknown; cau_hoi?: unknown; phien_moi?: unknown };
  try {
    than = await req.json();
  } catch {
    return Response.json({ loi: 'Thân yêu cầu không phải JSON.' }, { status: 400 });
  }

  const maO = typeof than.ma_o === 'string' && /^o-\d+$/.test(than.ma_o) ? than.ma_o : 'o-1';
  const maNhanSu = typeof than.ma_nhan_su === 'string' ? than.ma_nhan_su.trim() : '';
  const cauHoi = typeof than.cau_hoi === 'string' ? than.cau_hoi.trim() : '';
  const phienMoi = than.phien_moi === true;

  if (!maNhanSu) return Response.json({ loi: 'Thiếu nhân sự.' }, { status: 400 });
  if (!cauHoi) return Response.json({ loi: 'Câu hỏi trống.' }, { status: 400 });
  if (cauHoi.length > CAU_HINH.toiDaKyTu) {
    return Response.json({ loi: `Câu hỏi dài quá ${CAU_HINH.toiDaKyTu} ký tự.` }, { status: 413 });
  }

  const ns = timNhanSu(maNhanSu);
  if (!ns) return Response.json({ loi: 'Không có nhân sự này.' }, { status: 404 });

  // Phiên nào? Lấy từ SỔ TRÊN ĐĨA — ⛔ trình duyệt không tự chỉ định mã phiên.
  const o = layO(maO);
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

  // ⛔ Check if seat is currently claimed and active in terminal (5A-1)
  const { isHeld: giuTerminal, record: recTerminal } = isSeatHeldByTerminal(maNhanSu);
  if (giuTerminal) {
    return Response.json(
      {
        loi: `Seat '${maNhanSu}' is open in terminal (session: ${recTerminal?.session_id}). Turn skipped.`,
        skipped: 'terminal',
        tool: 'terminal',
        resume_cmd: recTerminal?.resume_cmd,
      },
      { status: 409 }
    );
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
      : `Phiên này vừa đổi trong ${NGUONG_SONG_PHUT} phút mà sổ tiến trình của app ⛔ có nó. ` +
        'Nhiều khả năng nó đang chạy ở NƠI KHÁC (cửa sổ dòng lệnh chẳng hạn) — đây là SUY ĐOÁN, ' +
        '⛔ phải điều app đo được. Nối vào lúc này sẽ hỏng bản ghi phiên; hãy mở phiên mới.';
    return Response.json({ loi, trong_app: !!dangTrongApp }, { status: 409 });
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
  if (!isBypassSlotGateForTest() && dongO.trang_thai !== 'trong' && dongO.trang_thai !== 'chet') {
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
      return Response.json({ loi: chung, trong_app: true }, { status: 409 });
    }
  }

  /**
   * 🔒 GIỮ CHỖ NGAY — đồng bộ, KHÔNG `await` nào xen vào giữa kiểm và đặt.
   *    Cổng `xacMinhDong` ở trên chặn được ca «đã có tiến trình chạy», nhưng nó KHÔNG chặn được
   *    HAI yêu cầu tới CÙNG LÚC: cả hai cùng thấy sổ trống, cả hai cùng đi tiếp, cả hai cùng sinh.
   */
  if (!isBypassSlotGateForTest() && !datCho(maO)) {
    return Response.json({
      loi: `Ô ${maO} đang mở một lượt khác ngay lúc này. Thử lại sau vài giây.`,
      trong_app: true,
    }, { status: 409 });
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
    return Response.json(
      { loi: chan.ly_do, cho_giay: chan.cho_giay },
      { status: 429, headers: { 'Retry-After': String(chan.cho_giay) } },
    );
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
  const runId = generateRunOrWakeId('run');
  let viewerGone = false;

  const luong = new ReadableStream<Uint8Array>({
    async start(dieu) {
      let childSpawned = false;
      let daThoat = false;
      let daCoLoi = false;
      let rejectReason: 'tu_choi_dong_cu_con_song' | null = null;

      const guiSSE = (chunk: Uint8Array) => {
        if (viewerGone) return;
        try {
          dieu.enqueue(chunk);
        } catch {
          if (!isViewerGoneGuardDisabledForTest()) {
            viewerGone = true;
          } else {
            throw new Error('SSE enqueue error after client disconnected');
          }
        }
      };

      // Nhịp giữ sống mỗi 20 giây (Cloudflare cắt kết nối rảnh ở 125 giây → 524).
      // Dòng bắt đầu bằng ':' là CHÚ THÍCH trong chuẩn SSE — trình duyệt bỏ qua.
      const nhip = setInterval(() => {
        guiSSE(new TextEncoder().encode(': nhip\n\n'));
      }, 20_000);

      try {
        guiSSE(goi({ loai: 'bat-dau', noi_tiep: Boolean(maPhienCu) }));
        // ⛔ Không im lặng: báo thẳng là đã mất bản ghi phiên cũ.
        if (matBanGhi) {
          guiSSE(goi({
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
            guiSSE(goi({
              loai: 'tra-chuoi', do_phu: tra.do_phu, so_tang: tra.so_tang,
              so_khop: tra.khop.length, tu_khoa: tra.tu_khoa,
            }));
          }
        } catch {
          /* tra hỏng thì ⛔ ĐỪNG chặn lượt chat — cứ gửi câu gốc */
        }
        const startedAt = new Date().toISOString();
        try {
          recordRun({
            runId,
            seatId: maNhanSu,
            startedAt,
            status: 'running',
            sessionId: maPhienCu ?? undefined,
          });
        } catch { /* bỏ qua lỗi ghi sổ phụ */ }
        for await (const mau of chayAgent({
          cauHoi: cauGui,
          maPhienCu,
          thuMuc: thuMucAgent(maNhanSu),
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
            childSpawned = true;
            if (tien.pid) {
              try { updateRun(runId, { pid: tien.pid }); } catch { /* bỏ qua */ }
            }
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
            tien.stdin?.on('error', (err: unknown) => {
              const code = (err as NodeJS.ErrnoException)?.code;
              if (code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') {
                // Expected when child process has been stopped or closed early
                return;
              }
              daCoLoi = true;
              const msg = err instanceof Error ? err.message : String(err);
              guiSSE(goi({
                loai: 'loi',
                thong_diep: `[stdin error] ${msg}`,
              }));
            });
            const ghi = dangKyViec(maO, tien, maNhanSu); // để nút DỪNG còn giết được
            traCho(maO);   // dòng sổ ĐÃ CÓ ⇒ cổng `xacMinhDong` tiếp quản ⇒ nhả khoá
            if (ghi.ket === 'tu_choi_dong_cu_con_song') {
              daCoLoi = true;
              rejectReason = 'tu_choi_dong_cu_con_song';
              // S15b: DO NOT write terminal run status here.
              // guiLenhDung(tien) only sends a stop signal to the child; the child has not terminated yet.
              // The khiChet exit handler alone decides the final run status upon child exit.
              guiSSE(goi({
                loai: 'loi',
                thong_diep:
                  `Ô này ĐANG CHẠY một lượt khác (${ghi.ma_nhan_su_cu}, pid ${ghi.pid_cu}, ` +
                  `đã chạy ${ghi.chay_duoc_giay} giây), nên tôi KHÔNG mở lượt mới đè lên nó.\n\n` +
                  `Lượt anh vừa gửi: tôi ĐÃ GỬI lệnh dừng cho nó và đang chờ nó đóng — nếu nó chưa ` +
                  `đóng trong ${giayTuEp()} giây thì tôi ép. Lượt ĐANG CHẠY thì **vẫn nguyên vẹn**, ` +
                  'nút Dừng của nó vẫn dùng được — anh KHÔNG mất gì cả.\n\n' +
                  'Chờ nó xong, hoặc bấm Dừng ở ô này rồi gửi lại.',
              }));
            }
          },
          // Remove from process registry when child exits and record final status in runs-ledger.
          // The khiChet exit handler alone decides the final status upon child process termination.
          khiChet: (tien, ma, signal) => {
            xoaViec(maO, tien);
            daThoat = true;
            const isClean = ma === 0 && !signal && !daCoLoi;
            const finalStatus = isClean ? 'finished' : 'failed';
            const errorKind = !isClean
              ? (rejectReason ? 'result_error' : (signal ? 'sigkill' : (ma !== 0 ? 'exit_nonzero' : 'result_error')))
              : undefined;
            try {
              updateRun(runId, {
                status: finalStatus,
                exitCode: ma ?? (isClean ? 0 : 1),
                finishedAt: new Date().toISOString(),
                ...(errorKind ? { errorKind } : {}),
                costStatus: 'unpriced',
                ...(maPhienDaDung ? { sessionId: maPhienDaDung } : {}),
              });
            } catch { /* ignore */ }
            if (!rejectReason) {
              updateSeatActivePid(maNhanSu, null);
            }
          },
        })) {
          if (mau.loai === 'phien') {
            // Persist session ID to disk immediately so it can be recovered even if server restarts
            maPhienDaDung = mau.ma_phien;
            if (!rejectReason) {
              datO(maO, maNhanSu, mau.ma_phien);
              claimSeat(maNhanSu, {
                tool: 'app',
                sessionId: mau.ma_phien,
                pid: process.pid,
                cwd: thuMucAgent(maNhanSu),
              });
              // Durable metadata persistence immediately upon session ID receipt (Hermes v2 finding 6)
              try { luuMetadataPhien(maNhanSu, mau.ma_phien, cauHoi, runId); } catch { /* ignore */ }
              guiSSE(goi({ loai: 'da-noi-mach', noi_tiep: Boolean(maPhienCu) }));
            }
            try { updateRun(runId, { sessionId: mau.ma_phien }); } catch { /* ignore */ }
          } else if (mau.loai === 'chu') {
            if (!rejectReason) {
              guiSSE(goi({ loai: 'chu', chu: mau.chu }));
            }
          } else if (mau.loai === 'loi') {
            daCoLoi = true;
            guiSSE(goi({ loai: 'loi', thong_diep: mau.thong_diep }));
          } else if (mau.loai === 'xong') {
            try { updateRun(runId, { costStatus: 'unpriced' }); } catch { /* ignore */ }
            if (!rejectReason) {
              guiSSE(goi({ loai: 'xong', chi_phi_usd: mau.chi_phi_usd, token: mau.token }));
            }
          }
        }
      } catch (e) {
        if (!viewerGone) {
          daCoLoi = true;
          // Valid exception (S15b): If the child has already exited or failed BEFORE spawn,
          // there is no living child process to wait for in khiChet, so terminal failure must be recorded here.
          if (daThoat || !childSpawned) {
            try {
              updateRun(runId, {
                status: 'failed',
                finishedAt: new Date().toISOString(),
                errorKind: 'result_error',
                costStatus: 'unpriced',
                ...(maPhienDaDung ? { sessionId: maPhienDaDung } : {}),
              });
            } catch { /* ignore */ }
            updateSeatActivePid(maNhanSu, null);
          }
          guiSSE(
            goi({ loai: 'loi', thong_diep: e instanceof Error ? e.message : 'Lỗi không rõ.' }),
          );
        }
      } finally {
        traCho(maO);   // phòng ca chết TRƯỚC khi kịp sinh ⇒ khoá vẫn được nhả
        clearInterval(nhip);
        /**
         * Record timestamp when our turn finished so subsequent turns don't get blocked.
         */
        if (maPhienDaDung && !rejectReason) {
          const maP = maPhienDaDung;
          const ghiLai = () => {
            luuMetadataPhien(maNhanSu, maP, cauHoi, runId);
            const m = mocTepPhien(maNhanSu, maP);
            if (m !== null) ghiMocKetThuc(maO, m);
          };
          ghiLai();
          for (const cho of [1_500, 5_000, 15_000]) {
            setTimeout(ghiLai, cho).unref?.();
          }
        }

        // The khiChet exit handler alone decides the final status upon child process termination.
        // In finally: Never record 'failed' or clear activePid while the child process is still alive (!daThoat).
        // Valid exception (S15b): Record terminal failure ONLY if the child was never spawned (!childSpawned && daCoLoi),
        // because there will be no child exit handler (khiChet) to ever record it.
        if (!childSpawned && daCoLoi) {
          try {
            updateRun(runId, {
              status: 'failed',
              finishedAt: new Date().toISOString(),
              errorKind: 'result_error',
              costStatus: 'unpriced',
            });
          } catch { /* ignore */ }
          updateSeatActivePid(maNhanSu, null);
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
      if (!isViewerGoneGuardDisabledForTest()) {
        viewerGone = true;
      }
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
