/**
 * 📇 SỔ TIẾN TRÌNH ĐANG CHẠY — mỗi ô nhiều nhất một `claude`.
 *
 * VÌ SAO CÓ TỆP NÀY (17/08/2026 · claude-phong-ban-pm):
 * Trước đây "dừng việc" xảy ra khi TRÌNH DUYỆT rời đi — đóng tab, khoá màn, rớt
 * wifi đều bắn `SIGTERM` vào `claude`. Owner tắt trình duyệt là việc chết dở.
 * ⇒ Nay bỏ nét đó: việc chạy tiếp, KHÔNG phụ thuộc ai đang xem.
 *
 * Nhưng bỏ mà KHÔNG thay gì thì mất luôn nút DỪNG — chữa một lỗi lấy một lỗi.
 * ⇒ Sổ này giữ TAY CẦM của tiến trình con theo ô, để nút Dừng (và CHỈ nút Dừng) còn giết được.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 🔄 ĐỔI HƯỚNG 02/09/2026 — GIỮ TAY CẦM, THÔI GIỮ SỐ HIỆU (Owner ra lệnh, đề bài
 *    `ai/DE-BAI-giu-tay-cam.md` của @claude-aiboss-app-pm).
 *
 * 🕳 Cả ngày 02/09 ta xây một toà nhà dấu vân — `ps` · `ppid` · `argv` · `lstart` · ghim
 *    `LC_ALL/TZ` — để trả lời câu «cái pid trong sổ CÓ CÒN là con của ô này KHÔNG». Mỗi lớp
 *    đều đúng, và mỗi lớp đều đẻ ra một cách hỏng mới. Owner dừng lại và nói thẳng: **hướng
 *    này SAI, đang đào sâu thêm hố sai.**
 * 🔑 Vì cả toà nhà đó dựng để cứu MỘT quyết định lỡ tay ở `chay-agent.ts:266`: ta có sẵn TAY
 *    CẦM của tiến trình con, và ta VỨT nó đi để chuyền một con số. Con số thì hệ điều hành
 *    cấp lại được cho người khác — nên mọi phép kiểm sau đó chỉ là đi đoán lại thứ ta vừa vứt.
 * 📌 **Một câu hỏi khó bất thường thường là dấu hiệu ta đã vứt mất câu trả lời ở bước trước.**
 *
 * ⚖️ NÓI CHO ĐÚNG SỨC — KHÔNG được viết «tay cầm MIỄN NHIỄM hoàn toàn với pid tái cấp».
 *    Câu đúng: **KHÔNG BAO GIỜ BẮN NHẦM — chứ KHÔNG phải LUÔN BIẾT ĐÚNG.**
 *    Đo (`claude-aiboss-app-exe`, 02/09 14:35): con đã thoát và Node đã thu ⇒ `exitCode` khác
 *    `null` ⇒ `kill()` trả **false**, Node TỪ CHỐI gửi tín hiệu ⇒ pid tái cấp KHÔNG chạm tới
 *    được. Nhưng NGAY SAU `spawn` và TRƯỚC sự kiện `close`, `exitCode` vẫn `null` ⇒ tay cầm
 *    khai «SỐNG» trong khi con có thể đã chết. Cửa sổ ấy hỏng về phía AN TOÀN (giữ cờ, giữ
 *    dòng sổ) nên nó KHÔNG chặn hướng này — nhưng nó CÓ THẬT, đừng viết là KHÔNG.
 *
 * ⚠️ THỨ ĐỔI HƯỚNG NÀY **KHÔNG** CHỮA — ghi ra để lần sau KHÔNG ai viết «nút Dừng đã kín»:
 *      · CHÁU: `tien.kill()` chỉ với tới CON, KHÔNG với tới tiến trình cháu do con sinh ra.
 *        Mã hôm qua cũng KHÔNG với tới (nó `process.kill(v.pid)`) ⇒ đây KHÔNG phải bước lùi,
 *        nhưng cũng KHÔNG phải thứ được chữa. Giết theo NHÓM là việc XẾP HÀNG riêng.
 *      · Sổ vẫn CHẾT khi máy chủ khởi động lại (Map trong bộ nhớ). Không đổi.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * 📌 Cùng một họ nguyên tắc với `xoa_lien_ket` ở `/api/o`: **phân biệt Ý ĐỊNH, đừng đoán ý
 *    từ một tín hiệu mơ hồ.** "Mất kết nối" KHÔNG phải "tôi muốn dừng".
 *
 * ⚠️ Sổ nằm trong BỘ NHỚ: khởi động lại app là mất. Chấp nhận ở bước này —
 *    tiến trình con cũng chết theo máy chủ, nên hai thứ mất cùng nhau, KHÔNG lệch pha.
 *    (Mức sau: cho tiến trình sống tách hẳn ⇒ lúc đó sổ PHẢI xuống đĩa.)
 */
import type { ChildProcess } from 'node:child_process';

export interface ViecDangChay {
  /**
   * 🖐 TAY CẦM của tiến trình con — ĐÂY LÀ DANH TÍNH, và là thứ DUY NHẤT được dùng để RA QUYẾT ĐỊNH.
   *
   * 🔑 Nó thay trọn bốn dấu vân (`ppid` · `comm` · `argv` · `lstart`) của bản 02/09 sáng, vì nó
   *    KHÔNG phải một phép đoán về danh tính — nó CHÍNH LÀ danh tính. Hai tay cầm khác nhau là
   *    hai tiến trình khác nhau, so bằng `===`, KHÔNG dung sai, KHÔNG lời gọi `ps`, KHÔNG môi
   *    trường nào phải ghim.
   * 📏 Giá đo được (exe, 02/09): giữ 40 tay cầm của con ĐÃ THOÁT ⇒ heap 4,2 → 4,3 MB. Không đáng kể.
   * ⚠️ NHƯNG nó đổi HẬU QUẢ của việc mất một dòng sổ: mất một SỐ thì mất một con số; mất một
   *    TAY CẦM thì app **VĨNH VIỄN KHÔNG dừng được tiến trình đó nữa**. Đó là lý do chốt cấm
   *    ghi đè mù ở `dangKyViec` là BẮT BUỘC chứ KHÔNG phải «nên có».
   */
  tien: ChildProcess;
  /**
   * 🔢 SỐ HIỆU CHỈ ĐỂ HIỂN THỊ — cho Owner tự gõ `kill <pid>` khi app bó tay. HỢP LỆ, và là
   *    lý do DUY NHẤT con số còn tồn tại trong tệp này.
   *
   * 🔴 CÁI TÊN LÀM VIỆC CANH GÁC, và đó là một PHẦN CỦA VIỆC chứ KHÔNG phải chuyện thẩm mỹ
   *    (@app-pm chốt 02/09): sau khi đổi tên, mọi chỗ dùng số hiệu để RA QUYẾT ĐỊNH sẽ đọc lên
   *    thấy sai ngay — `if (v.pid_de_hien_thi === x)` tự tố cáo nó đang làm sai việc.
   *    Học đúng chỗ openclaw đặt tên `isPidDefinitelyDead()`: tên gánh việc canh, KHÔNG giao
   *    cho kỷ luật của người viết.
   * ⚠️ Khai `number | null` chứ KHÔNG khai `?`: `?` cho phép QUÊN ở một lối ghi, còn `| null`
   *    bắt mọi lối ghi phải nói ra «tôi KHÔNG có số để hiện». Cùng phép đã hiệu quả với `vi_sao`.
   */
  pid_de_hien_thi: number | null;
  ma_nhan_su: string;
  bat_dau: number;
  /**
   * 🛑 ĐÃ GỬI LỆNH DỪNG LÚC NÀO — `null` = chưa ai bấm Dừng.
   *
   * 🕳 CA SINH RA NÓ (02/09, `hermes-aiboss-app-reviewer` NO-GO, loại A): bản trước gửi `SIGTERM`
   *    rồi `SO.delete(maO)` NGAY DÒNG SAU. Người soi ĐO được — và tôi đo lại xác nhận:
   *      con `bash -c "trap '' TERM; sleep 30"`  ⇒ `kill()` trả **true**
   *                                              ⇒ `ps` vẫn thấy nó sống sau 200 ms
   * 🔑 Mã cũ gộp BA trạng thái làm MỘT: **«đã gửi tín hiệu» ≠ «con đã nhận» ≠ «con đã thoát».**
   *    Đổi số sang tay cầm chữa được vế «bắn nhầm người». Nó KHÔNG chữa vế «biết nó đã chết» —
   *    và đây đúng là câu ⑥ quay lại qua cửa MỚI NHẤT, tức qua chính bản vá vừa dựng để chống nó.
   * 🔴 Hậu quả nặng nhất KHÔNG phải lời khai sai, mà là **MẤT PHANH**: xoá tay cầm trước `close`
   *    thì lần Huỷ SAU KHÔNG còn gì để nâng lên `SIGKILL`. Con nuốt `SIGTERM` sống mãi, và sổ
   *    lẫn giao diện đều khai đã dừng.
   * ✅ ⇒ Chốt vòng đời nằm ở sự kiện `close` (qua `khiChet` → `xoaViec`), KHÔNG nằm ở giá trị trả
   *    về của `kill()`. Dòng sổ SỐNG TIẾP sau khi bấm Dừng, chỉ mang thêm dấu «đang dừng».
   */
  xin_dung_luc: number | null;
  /** Bộ hẹn nâng lên `SIGKILL`. Giữ để `xoaViec` dọn — nó bám TAY CẦM nên KHÔNG bao giờ bắn lạc. */
  bo_hen_ep: ReturnType<typeof setTimeout> | null;
}

/**
 * ⏱ Bấm Dừng xong bao lâu thì TỰ nâng lên `SIGKILL`.
 * 🔑 Có thời hạn vì Owner ĐÃ BẤM DỪNG — ý định đã rõ ràng, KHÔNG phải suy từ tín hiệu mơ hồ.
 *    Để `SIGTERM` treo vô hạn là dựng lại đúng cái ta vừa chữa, chỉ chậm hơn.
 * ⚖️ 90 GIÂY — SỐ TẠM, và đây là toàn bộ căn cứ (@app-pm chốt 02/09 sau verdict soi delta vòng hai).
 *
 * 🔴 Bản 10 giây tôi chọn ban đầu là **TRỤC DUY NHẤT mà bản mới TỆ HƠN bản đang chạy**:
 *    hôm nay app KHÔNG có phép ép tự động nào cả (đường giết đã gỡ 17/08) ⇒ mọi ngưỡng ép là một
 *    RỦI RO MỚI, chứ không phải một phanh cũ được siết lại.
 * 📏 SỐ ĐO — thời gian `claude` còn xả bản ghi sau `SIGTERM`:
 * ```
 *    đo 14/08, ca xấu           51 giây
 *    Owner đo 3.541 lượt        trung vị 20s · phân vị 90 = 75s · dài nhất 384s
 * ```
 *    ⇒ ép ở giây 10 là cắt ngang **quá nửa số lượt** khi chúng đang ghi bản ghi phiên.
 *    ⇒ 90 giây qua được phân vị 90, mà vẫn chặn được ca treo vĩnh viễn.
 * 🔑 Tôi từng viết số đo «51 giây» NGAY CẠNH ngưỡng 10 giây rồi vẫn chọn 10 — @app-pm bắt đúng chỗ:
 *    **ghi lý do làm một quyết định MINH BẠCH, nó KHÔNG làm quyết định ấy ĐÚNG.** Số đo của chính
 *    tôi đang cãi lại lựa chọn của tôi, và tôi đọc lướt qua nó.
 * ⚠️ ĐÂY LÀ SỐ TẠM, chờ Owner chốt round về chính sách dữ liệu. Đổi thì đổi ĐÚNG DÒNG NÀY —
 *    `giayTuEp()` đã chở nó ra màn hình, nên câu chữ Owner đọc tự đổi theo. ĐỪNG gõ tay số ở đâu khác.
 */
const HAN_NANG_EP_MS = 90_000;

/**
 * 📤 CHỞ CON SỐ RA MÁY KHÁCH — để câu chữ Owner đọc KHÔNG phải một bản chép của hằng số này.
 *
 * 🕳 Bản trước gõ cứng «sau 10 giây» vào `UngDung.tsx`. Hai bản của cùng một con số, hai đầu,
 *    KHÔNG nối nhau — và @app-pm đang trình Owner ĐỔI đúng ngưỡng này ngay lúc tôi viết dòng này.
 *    Owner chọn 30 thì máy chủ ép ở giây 30 còn màn hình vẫn hứa giây 10.
 * 🔑 Cùng họ với `postbuild` · `vi_sao_bo` · `scripts.lint`: **một lời hứa được chép ra chỗ thứ
 *    hai rồi hai bản trôi mỗi bản một kiểu.** Khác một điều: bản trôi ở đây là bản OWNER ĐỌC.
 */
export function giayTuEp(): number {
  return Math.round(HAN_NANG_EP_MS / 1000);
}

const SO = new Map<string, ViecDangChay>();

/**
 * 🔒 CHỖ ĐÃ ĐẶT — khoá theo Ô, đóng CỬA THỨ HAI của lỗ ghi đè.
 *
 * 🕳 Người soi ngoài nhà tìm ra cửa này 02/09, KHÁC hẳn cửa cả ba ghế trong nhà tìm:
 *      cửa trong nhà : cổng ở `chat/route.ts` hỏi NHẦM NGUỒN (mốc tệp phiên)
 *      cửa ngoài nhà : KHÔNG ai giữ cửa khi HAI yêu cầu cùng đẩy một lúc
 *    Vá cổng mà KHÔNG có khoá thì cuộc đua VẪN LỌT: giữa lúc cổng kiểm và lúc `spawn` xong có
 *    nhiều `await`, đủ cho yêu cầu thứ hai đi qua cùng một cổng và CẢ HAI cùng sinh tiến trình.
 * 🔑 **Cùng một lỗ, hai lối vào, và ba ghế cùng hãng chỉ thấy một.** Đó đúng là lý do phải hỏi
 *    người ngoài — họ có điểm mù KHÁC, KHÔNG phải ít điểm mù hơn.
 *
 * 📌 `datCho` là phép KIỂM-VÀ-ĐẶT ĐỒNG BỘ: JS đơn luồng nên giữa `has` và `add` KHÔNG có chỗ chen.
 *    Đó là toàn bộ lý do nó chống được đua, và cũng là lý do nó PHẢI đồng bộ — thêm một `await`
 *    vào giữa là gỡ mất tính chất ấy.
 */
const CHO_DA_DAT = new Set<string>();

/** Giữ chỗ cho ô. Trả `false` nếu ô đó đã có người đang mở lượt. */
export function datCho(maO: string): boolean {
  if (CHO_DA_DAT.has(maO)) return false;
  CHO_DA_DAT.add(maO);
  return true;
}

/** Trả chỗ. PHẢI gọi trong `finally`, KHÔNG thì ô kẹt vĩnh viễn. */
export function traCho(maO: string): void {
  CHO_DA_DAT.delete(maO);
}

/**
 * 🔴 CẤM ĐÈ MÙ — @app-pm bắt 02/09 từ đầu mối người soi ngoài để lại («map overwrite»).
 *
 * 🕳 Bản trước: `SO.set` thẳng, KHÔNG nhìn dòng cũ. Trong khi `xoaViec` canh rất kỹ để khỏi xoá
 *    nhầm việc người khác. **Đường XOÁ canh kỹ, đường GHI thì đè thẳng.**
 * 🔴 Hậu quả: dòng sổ của một tiến trình CÒN SỐNG bị đè ⇒ nó biến khỏi sổ ⇒ `quetRac` KHÔNG
 *    thấy, `dsViec` KHÔNG thấy, `gietViec` KHÔNG với tới ⇒ **chạy mãi, tiêu tiền, mất nút Dừng.**
 *
 * 🔴 SAU KHI ĐỔI SANG TAY CẦM, MỤC NÀY LÊN HẠNG «quan trọng» → **BẮT BUỘC** (@app-pm 02/09,
 *    theo số đo của exe): trước đây đè mất một dòng là mất một CON SỐ — Owner còn `ps` mà tra
 *    lại. Nay đè mất một dòng là mất **TAY CẦM DUY NHẤT**, và app VĨNH VIỄN KHÔNG dừng được
 *    tiến trình ấy nữa. `pid_de_hien_thi` in ra trong câu cảnh báo dưới đây là đường lùi CUỐI
 *    CÙNG của Owner — đó chính là lý do trường ấy tồn tại.
 * 📌 Cùng hình với mọi thứ hôm nay: **vá một đầu làm đầu kia đắt hơn, và KHÔNG ai đi kiểm đầu kia.**
 *
 * ⇒ RÀNG BUỘC @app-pm đặt: đè xong mà IM LẶNG thì CẤM. Nên hàm này TRẢ VỀ chuyện gì đã xảy ra,
 *   và tự KÊU khi phải đè lên một dòng còn sống. Kêu ở TRONG hàm chứ KHÔNG giao cho người gọi nhớ.
 */
export type KetGhiSo =
  | { ket: 'ghi_moi' }
  | { ket: 'de_len_dong_chet'; pid_cu: number | null }
  /**
   * 🔴 TỪ CHỐI GHI — dòng cũ CÒN SỐNG. Con MỚI đã bị dừng, sổ GIỮ NGUYÊN dòng cũ.
   *
   * 🕳 Bản trước tên là `de_len_dong_song`: nó KÊU rồi vẫn ĐÈ. `hermes-aiboss-app-reviewer` bác
   *    02/09 và đúng: **kêu KHÔNG phải là chặn.** Kêu xong vẫn đè thì tiến trình cũ vẫn mất tay
   *    cầm, vẫn chạy, vẫn tiêu tiền — chỉ khác là có một dòng chữ trong sổ máy chủ mà Owner
   *    KHÔNG bao giờ mở.
   * 🔑 Fail-closed nay DỰNG ĐƯỢC chính nhờ tay cầm: ta cầm tay cầm của con MỚI, nên «từ chối»
   *    KHÔNG còn nghĩa là bỏ mặc một tiến trình lạc — ta dừng được nó tại chỗ.
   *    Trước đây chỉ có con SỐ thì từ chối là đẻ ra mồ côi, nên mới phải chọn đè.
   * 📌 **Một luật an toàn bất khả thi ở thiết kế cũ trở thành hiển nhiên ở thiết kế mới.**
   */
  | { ket: 'tu_choi_dong_cu_con_song'; pid_cu: number | null; ma_nhan_su_cu: string; chay_duoc_giay: number };

/**
 * 🛑 Gửi lệnh dừng cho MỘT tay cầm, kèm hẹn nâng `SIGKILL`. Dùng CHUNG cho `gietViec` và cho
 *    đường từ chối ghi sổ — MỘT luật dừng, KHÔNG hai.
 * 🔑 Bộ hẹn bám TAY CẦM chứ KHÔNG bám ô hay pid ⇒ nó KHÔNG BAO GIỜ bắn lạc sang tiến trình khác,
 *    kể cả khi ô đã đổi chủ hoặc pid đã được cấp lại. Đây là chỗ tay cầm trả lãi rõ nhất.
 */
function guiLenhDung(
  tien: import('node:child_process').ChildProcess,
  khiHetViec?: () => void,
): ReturnType<typeof setTimeout> {
  tien.kill('SIGTERM');
  const hen = setTimeout(() => {
    /**
     * 🔴 KIỂM TRƯỚC KHI ÉP — người soi ngoài nhà bắt 02/09 (soi delta).
     * 🕳 Bản trước bắn `SIGKILL` VÔ ĐIỀU KIỆN khi tới hạn. Con đã thoát rồi thì lệnh ấy rỗng
     *    (tay cầm đã thu ⇒ Node từ chối) nên nó KHÔNG nguy — nhưng nó là một lệnh bắn phát ra
     *    từ một chỗ KHÔNG kiểm gì cả, và đó là thói quen đã cắn ta suốt ngày hôm nay.
     * 📌 Hỏi tay cầm TRƯỚC khi bắn, ở MỌI chỗ bắn. Không có ngoại lệ «chỗ này vô hại».
     */
    if (tien.exitCode === null && tien.signalCode === null) tien.kill('SIGKILL');
    khiHetViec?.();
  }, HAN_NANG_EP_MS);
  hen.unref?.();
  /**
   * 🧹 DỌN BỘ HẸN KHI CON ĐÓNG — kể cả con KHÔNG nằm trong sổ.
   *
   * 🔑 Vì sao phải ở ĐÂY chứ KHÔNG chỉ ở `xoaViec`: đường TỪ CHỐI (`dangKyViec` fail-closed) dừng
   *    một con **chưa từng có dòng sổ**. `xoaViec` KHÔNG bao giờ chạm tới nó ⇒ bộ hẹn của nó
   *    sống mồ côi tới khi nổ. Vô hại vì nó bám tay cầm, nhưng nó là một sợi dây KHÔNG ai cầm.
   * 📌 Đúng nếp «một chốt ở cuối, đừng vá từng nhánh»: cắm vào chính tay cầm thì MỌI đường gọi
   *    hàm này đều được dọn, kể cả đường thêm sau này.
   *
   * ⚖️ ĐO ĐƯỢC 02/09 — HAI CHỐT NÀY ĐỘC LẬP ĐỦ, và tôi ghi ra vì người sau dễ gỡ nhầm:
   *      gỡ chốt `exitCode` · GIỮ dòng này  ⇒ vẫn ĐẠT  (dòng này một mình đã đủ)
   *      gỡ dòng này · GIỮ chốt `exitCode`  ⇒ vẫn ĐẠT  (chốt kia một mình cũng đủ)
   *      gỡ CẢ HAI                          ⇒ 🔴 bắn phát thứ hai vào một cái xác
   * 🔑 Nên ĐỪNG đọc «có hai chốt» thành «gỡ một cái vẫn còn cái kia canh» rồi gỡ dần. Mọi phép
   *    thử tôi dựng được đều thấy **dòng này** nổ trước, nên chốt `exitCode` ở trên là lớp phòng
   *    xa mà tôi KHÔNG làm cho nó chạy được lần nào. Theo luật nhà thì nó **chưa nghiệm thu**;
   *    tôi giữ vì nó rẻ và vì nó CỨU được đúng ca dòng này bị gỡ — nhưng tôi khai đúng hạng của nó.
   */
  tien.once('close', () => { clearTimeout(hen); khiHetViec?.(); });
  return hen;
}

export function dangKyViec(maO: string, tien: ChildProcess, maNhanSu: string): KetGhiSo {
  const truoc = xacMinhDong(maO);
  let ket: KetGhiSo = { ket: 'ghi_moi' };
  // So TAY CẦM, KHÔNG so số: cùng một tay cầm ghi lại là vô hại, khác tay cầm mới là ĐÈ.
  if (truoc.trang_thai !== 'trong' && truoc.v.tien !== tien) {
    const cu = truoc.v;
    if (truoc.trang_thai === 'song' || truoc.trang_thai === 'so_mau_thuan') {
      /**
       * 🔴 FAIL-CLOSED: KHÔNG ghi, và DỪNG con mới ngay tại đây.
       *
       * ⚖️ Ai thua trong hai con — tôi chọn con MỚI, và nói rõ vì sao: con CŨ đang có việc chạy
       *    dở của Owner và đã tiêu tiền; con MỚI vừa sinh, chưa làm gì. Giết con mới mất một
       *    lượt; giữ con mới thì mất PHANH của con cũ vĩnh viễn. Hai cái giá KHÔNG cùng hạng.
       * 🔑 Dừng NGAY TẠI ĐÂY chứ KHÔNG trả về cho người gọi lo: người gọi thì thay được, mà
       *    chính hàm này từng có một người gọi BỎ QUA giá trị trả về (ca 02/09). **Phanh phải
       *    nằm tại chỗ bắn.**
       */
      const bo = guiLenhDung(tien);
      ket = {
        ket: 'tu_choi_dong_cu_con_song',
        pid_cu: cu.pid_de_hien_thi,
        ma_nhan_su_cu: cu.ma_nhan_su,
        chay_duoc_giay: Math.round((Date.now() - cu.bat_dau) / 1000),
      };
      console.error(
        `[SO-TIEN-TRINH] TỪ CHỐI GHI ĐÈ — ô ${maO} đã có tiến trình CÒN SỐNG: pid ${cu.pid_de_hien_thi} ` +
        `(${cu.ma_nhan_su}, đã chạy ${ket.chay_duoc_giay}s). Tiến trình MỚI (pid ${tien.pid}, ` +
        `${maNhanSu}) ĐÃ BỊ DỪNG và KHÔNG vào sổ. Dòng cũ giữ nguyên, nút Dừng của nó vẫn còn. ` +
        'Tới được đây nghĩa là CỔNG Ở `chat/route.ts` ĐÃ BỊ LỌT — đó mới là chỗ cần soi.',
      );
      void bo;   // bộ hẹn bám tay cầm con MỚI, tự chạy; sổ KHÔNG giữ dòng nào cho nó
      return ket;
    }
    ket = { ket: 'de_len_dong_chet', pid_cu: cu.pid_de_hien_thi };   // dòng rác ⇒ đè đúng, im lặng đúng
  }
  /**
   * 🧹 DỌN BỘ HẸN CỦA DÒNG CŨ TRƯỚC KHI ĐÈ — tới đây thì dòng cũ chắc chắn là dòng CHẾT
   *    (đường `song`/`so_mau_thuan` đã trả về ở trên), nhưng nó vẫn có thể mang một bộ hẹn
   *    chưa nổ nếu ai đó bấm Dừng rồi con tự thoát trước hạn.
   * 🔑 Bỏ qua bước này thì bộ hẹn mất người cầm — vô hại về HÀNH VI (nó bám tay cầm cũ), nhưng
   *    nó là một sợi dây lủng lẳng, và ngày mai ai đó đổi `guiLenhDung` thành bắn theo NHÓM
   *    tiến trình thì sợi dây ấy thành có răng.
   */
  const cu = SO.get(maO);
  if (cu && cu.bo_hen_ep !== null) clearTimeout(cu.bo_hen_ep);
  SO.set(maO, {
    tien,
    pid_de_hien_thi: tien.pid ?? null,
    ma_nhan_su: maNhanSu,
    bat_dau: Date.now(),
    xin_dung_luc: null,
    bo_hen_ep: null,
  });
  return ket;
}

/**
 * ⛔ CHỈ xoá đúng dòng của TAY CẦM này — tránh xoá nhầm việc mới vừa thay chỗ.
 *
 * 🔑 So bằng tay cầm nên hàm này KHÔNG cần biết pid, và đó là lý do người gọi cũng KHÔNG cần
 *    chốt `if (tien.pid)` nữa ở đường XOÁ: tay cầm KHÔNG có pid thì cũng KHÔNG khớp dòng nào,
 *    lời gọi thành vô hại thay vì bị bỏ qua. Hỏng về phía an toàn ở CẢ HAI chiều.
 */
export function xoaViec(maO: string, tien?: ChildProcess): void {
  const v = SO.get(maO);
  if (!v) return;
  if (tien !== undefined && v.tien !== tien) return;
  // 🧹 Dọn bộ hẹn nâng `SIGKILL`. Để lại cũng VÔ HẠI (nó bám tay cầm, mà `kill` trên tay cầm đã
  //    thu là lệnh rỗng) — dọn cho sạch, KHÔNG phải để chống bắn lạc.
  if (v.bo_hen_ep !== null) clearTimeout(v.bo_hen_ep);
  SO.delete(maO);
}

/**
 * ⚠️ HÀM NÀY HIỆN CÓ **0 NGƯỜI GỌI** (đo 02/09 bằng grep toàn `src`, đo lại sau bản vá tay cầm).
 * ❓ GIỮ hay XOÁ là việc @app-pm xếp. Tôi giữ vì nó là một cửa đọc dùng chung hợp lý; nhưng nếu
 *    để lâu mà vẫn 0 người gọi thì nên xoá — mã chết mang theo một lời hứa cũng là một lời hứa.
 * 🧹 `quetRac()` vẫn giữ trong đây: nếu có ai gọi lại, họ phải nhận một cuốn sổ đã dọn.
 */
export function layViec(maO: string): ViecDangChay | null {
  quetRac();
  return SO.get(maO) ?? null;
}

/**
 * ⚰️ QUÉT DÒNG RÁC — bỏ khỏi sổ những dòng mà tiến trình ĐÃ CHẾT.
 *
 * 🕳 VÌ SAO CÓ (02/09/2026, P0 «sổ phải nói đúng», chiều NGƯỢC với câu ⑥):
 *    `@app-pm` đo được sổ khai `{ma_o: o-2, pid: 48197, chay_duoc_giay: 35}` trong khi
 *    `pgrep` ra 0 tiến trình (đối chứng âm: pgrep chuỗi bịa cũng ra 0 ⇒ thước phân biệt được).
 *    Cùng buổi, chiều kia cũng hỏng: sổ khai 0 mà hai tiến trình đang sống.
 * 🔑 Sổ lệch CẢ HAI CHIỀU và lệch liên tục ⇒ mọi câu «sổ hơi trễ một nhịp» đều SAI.
 *    Đường chính là `khiChet` (bắn từ `close` của con). Hàm này là LƯỚI THỨ HAI, cho ca
 *    `close` KHÔNG bao giờ tới — máy chủ dựng lại tay xử lý, con bị giết từ ngoài, v.v.
 *
 * 🔴 BẢN TAY CẦM GỠ LUÔN MỘT BẪY CŨ CỦA CHÍNH HÀM NÀY: trước đây nó hỏi `process.kill(pid, 0)`
 *    — một phép YẾU (chỉ biết «pid có tồn tại») chạy TRƯỚC lớp dấu vân MẠNH, nên nó xoá dòng
 *    rác trước và làm lớp mạnh MÙ (ca thật 02/09). Nay `quetRac` và `xacMinhDong` hỏi **CÙNG
 *    MỘT câu** trên cùng tay cầm ⇒ KHÔNG còn lớp nào che lớp nào.
 * 📌 Bài học giữ lại kể cả khi bẫy đã hết: **thêm một lớp bảo vệ KHÔNG phải lúc nào cũng cộng
 *    thêm an toàn** — đặt lớp yếu trước lớp mạnh là trừ đi.
 */
function quetRac(): void {
  for (const [maO, v] of [...SO.entries()]) {
    /**
     * 🧹 ĐI QUA `xoaViec`, KHÔNG `SO.delete` thẳng — người soi ngoài nhà bắt 02/09.
     * 🕳 `SO.delete` thẳng bỏ qua phép dọn bộ hẹn nằm trong `xoaViec` ⇒ dòng biến mất mà bộ hẹn
     *    còn treo. Lại đúng hình «hai đường làm cùng một việc, một đường quên một bước».
     * 🔑 Có MỘT cửa xoá thì thêm một bước dọn là sửa MỘT chỗ. Có hai cửa thì phải nhớ cả hai.
     */
    if (v.tien.exitCode !== null || v.tien.signalCode !== null) xoaViec(maO, v.tien);
  }
}

/**
 * 📋 LIỆT KÊ MỌI Ô ĐANG CHẠY — CHỈ ĐỌC, KHÔNG đụng vào tiến trình nào.
 *
 * 🐛 VÌ SAO CÓ (P0-7/P1-7, 31/08/2026): trình duyệt tải lại là MẤT SẠCH cờ «đang chạy»
 *    — nó nằm trong bộ nhớ của trang. Hậu quả nặng nhất KHÔNG phải cái đèn, mà là **NÚT DỪNG**:
 *    sau mỗi lần F5, Owner KHÔNG CÒN CÁCH NÀO dừng một ghế đang chạy và đang tiêu tiền.
 * 📌 Sổ này là NGUỒN SỰ THẬT vì nó nằm ở MÁY CHỦ — trang tải lại bao nhiêu lần cũng KHÔNG đụng tới.
 *
 * 🔴 KHÔNG TRẢ TAY CẦM RA NGOÀI — @claude-aiboss-app-exe siết 02/09 khi đổi sang tay cầm.
 * 🕳 Bản cũ trả `{ ma_o } & ViecDangChay`, tức nguyên dòng sổ. Trước đây dòng sổ chỉ có số nên
 *    vô hại; nay nó mang TAY CẦM, tức mang theo QUYỀN GIẾT. Một hàm tên là «liệt kê» mà phát
 *    ra quyền giết là sai hạng — và nó còn đi thẳng vào `Response.json` ở `/api/dung` GET nếu
 *    một ngày nào đó ai đó viết gọn lại thành `Response.json(dsViec())`.
 * 📌 Đúng bài học tôi tự ghi hôm nay: **một thói quen an toàn ở ca này là bề mặt tấn công ở ca
 *    khác.** Trả nguyên dòng từng là tiện; sau khi đổi kiểu, nó thành một cửa rò.
 * ⇒ Hàm này trả bản HIỂN THỊ, KHÔNG kèm tay cầm. Muốn giết thì đi `gietViec`, cửa duy nhất.
 */
export function dsViec(): Array<{
  ma_o: string;
  ma_nhan_su: string;
  bat_dau: number;
  pid_de_hien_thi: number | null;
}> {
  quetRac();
  return [...SO.entries()].map(([ma_o, v]) => ({
    ma_o,
    ma_nhan_su: v.ma_nhan_su,
    bat_dau: v.bat_dau,
    pid_de_hien_thi: v.pid_de_hien_thi,
  }));
}

/**
 * 🏷 VÌ SAO KHÔNG GIẾT ĐƯỢC — bắt buộc ở MỌI lối ra, KHÔNG có giá trị mặc định.
 *
 * 🕳 CA SINH RA NÓ (02/09/2026): `@app-pm` mở sổ chuông và thấy `kho-danh-thuc.ts:108` khai
 *    `vi_sao_bo` là **BẮT BUỘC** — mà sổ ghi rỗng **4 trên 4**. Một trường đẹp, rỗng, và làm
 *    người soi YÊN TÂM GIẢ. Chuông rơi mà KHÔNG ai biết vì sao, hai tiếng đồng hồ.
 * 🔑 Nên trường này khai KHÔNG có `?`: thiếu ở bất kỳ lối ra nào là `tsc` chặn ngay lúc dựng.
 *    **Máy kiểm hộ mạnh hơn người nhớ.** Đó là khác biệt giữa trường này với `vi_sao_bo`.
 *
 * 🔻 BẢN TAY CẦM RÚT TỪ SÁU MÃ XUỐNG BỐN. Hai mã bị xoá vì thứ sinh ra chúng đã KHÔNG CÒN:
 *      `khong_doc_duoc_dau_van`  ⇐ chỉ có nghĩa khi phải ĐỌC `ps`. Tay cầm KHÔNG đọc gì
 *                                  ⇒ KHÔNG có phép đọc nào hụt được ⇒ vùng «KHÔNG BIẾT» biến mất.
 *      `dau_van_lech`            ⇐ «xác minh được là KHÁC» chỉ có nghĩa khi danh tính là SUY LUẬN.
 *                                  Tay cầm KHÔNG suy luận danh tính ⇒ ca này gộp vào `dong_rac`.
 * 📌 Và `dong_rac` — vốn khai ra mà KHÔNG lối nào trả về (mã chết suốt bản trước) — NAY MỚI có
 *    người dùng thật. Xoá hai mã, làm sống một mã: đúng dấu hiệu bản vá này BỚT chứ không THÊM.
 */
export type ViSaoDung =
  /**
   * 🛑 ĐÃ GỬI `SIGTERM`, và **CHỈ CÓ THẾ**. Dòng sổ GIỮ NGUYÊN, tay cầm GIỮ NGUYÊN.
   *
   * 🔴 Mã này thay `da_giet` cũ, và đổi tên là NỬA VIỆC — nửa kia là thôi xoá dòng sổ.
   *    `da_giet` khai một điều ta KHÔNG BAO GIỜ biết được tại thời điểm gọi: `kill()` trả `true`
   *    nghĩa là **tín hiệu đã gửi đi**, KHÔNG nghĩa là con đã nhận, càng KHÔNG nghĩa là con đã thoát.
   *    Đo (exe 02/09, dựng lại lời bác của hermes): con nuốt `SIGTERM` ⇒ `kill()` trả `true`
   *    ⇒ `ps` vẫn thấy nó sống sau 200 ms.
   * ⚖️ ⇒ Máy khách phải coi đây là **KHÔNG có bằng chứng dương** ⇒ trả cờ về BẬT, và nói ra.
   */
  | 'da_gui_dung'
  /**
   * 🔨 ĐÃ NÂNG LÊN `SIGKILL` — lần bấm THỨ HAI, hoặc bộ hẹn tự nâng sau 10 giây.
   * ⚠️ Vẫn KHÔNG phải bằng chứng dương: `SIGKILL` gần như chắc chắn, nhưng «gần như» KHÔNG phải
   *    «đã». Bằng chứng dương chỉ có một chỗ duy nhất — sự kiện `close` của tiến trình con.
   */
  | 'da_ep_dung'
  | 'khong_co_viec'              // sổ KHÔNG có dòng nào cho ô này — im lặng là đúng
  | 'dong_rac'                   // tay cầm khai con ĐÃ THOÁT ⇒ BẰNG CHỨNG DƯƠNG ⇒ xoá dòng
  /**
   * Sổ TỰ MÂU THUẪN: hai ô cùng giữ MỘT tay cầm. Ta KHÔNG biết dòng nào đúng, và tiến trình
   * thì VẪN SỐNG ⇒ GIỮ sổ · cờ BẬT · NÓI RA.
   *
   * 🔴 ĐỔI HẠNG 02/09 (@app-pm nhận đề nghị của exe): sau khi đổi sang tay cầm, hai ô KHÔNG
   *    thể giữ cùng một tay cầm TRỪ KHI mã của CHÍNH TA hỏng ⇒ nhánh này gần như KHÔNG BAO GIỜ
   *    chạy ⇒ theo luật «nhánh chạy 0 lần thì chưa nghiệm thu được», để nguyên hình dạng cũ là
   *    tự tạo một nhánh VĨNH VIỄN không kiểm chứng được — đúng thứ mã-chết ta bỏ cả ngày để gỡ.
   * ⇒ Nó thôi làm một mã lý do BÌNH THƯỜNG. Nó là **CHỐT TỰ KIỂM**: chạy vào đó thì `console.error`
   *   kêu to («LỖI CỦA APP») **và vẫn chặn**. Chặn thì Owner thấy ⇒ nó KHÔNG im lặng chờ ai đó
   *   tình cờ mở sổ máy chủ ra đọc.
   * 📌 Nếp rút ra: **một phép kiểm mà ta MONG nó đừng bao giờ chạy thì nó KHÔNG cùng loại với
   *    một nhánh xử lý bình thường** — đừng xếp chung hạng, kẻo luật «phải thấy nó chạy» biến
   *    thành cái cớ để xoá một chốt an toàn.
   */
  | 'so_tu_mau_thuan';

/**
 * 🔎 XÁC MINH MỘT DÒNG SỔ — phép kiểm DUY NHẤT, dùng chung cho `gietViec` · `dangKyViec` · cổng chat.
 *
 * 🕳 VÌ SAO GOM (02/09): phép này từng nằm rải trong `gietViec`, còn `dangKyViec` thì ĐÈ MÙ và
 *    cổng ở `chat/route.ts` thì hỏi `dangChay()` — tức mốc tệp phiên, đúng cái nguồn cả ngày nay
 *    ta chứng minh là nói dối. **Ta hỏi nguồn nói dối để QUYẾT, rồi hỏi nguồn đáng tin để CHỌN CHỮ.**
 * 📌 Một luật viết ba lần là một luật sẽ trôi mất hai bản. Gom lại thì sửa một chỗ là cả ba đúng theo.
 *
 * 🔻 BỐN TRẠNG THÁI CÒN BA — `khong_ro` biến mất cùng với phép đọc `ps` sinh ra nó.
 *    Đây là phần LÃI lớn nhất của việc đổi hướng, KHÔNG phải phần rút gọn cho gọn mắt:
 *    `khong_ro` từng là một TÍNH CHẤT VĨNH VIỄN của dòng sổ (ghi hụt một lần là hỏng mãi),
 *    và nó kéo theo cả một đường thoát riêng cho Owner để ô khỏi chết cứng.
 *      'song'         tay cầm khai con còn chạy ⇒ đây ĐÚNG là con của ô, đang sống
 *      'chet'         tay cầm khai con đã thoát ⇒ dòng sổ là RÁC, xoá được
 *      'so_mau_thuan' ô khác cũng giữ tay cầm này ⇒ LỖI CỦA APP ⇒ giữ, kêu to, và NÓI RA
 *
 * ⚖️ Nhắc lại giới hạn để KHÔNG ai đọc hàm này rồi tin quá tay: `exitCode === null` nghĩa là
 *    **Node CHƯA thu xác con**, KHÔNG phải «con chắc chắn đang chạy». Xem khối đầu tệp.
 */
export function xacMinhDong(maO: string):
  { trang_thai: 'trong' } |
  { trang_thai: 'song' | 'chet' | 'so_mau_thuan'; v: ViecDangChay } {
  const v = SO.get(maO);
  if (!v) return { trang_thai: 'trong' };
  // Ô KHÁC cũng giữ TAY CẦM này ⇒ sổ tự mâu thuẫn. Xét TRƯỚC, vì lúc đó mọi câu khác đều vô nghĩa.
  const oKhacGiu = [...SO.entries()].find(([k, x]) => k !== maO && x.tien === v.tien);
  if (oKhacGiu) {
    /**
     * 🔔 CHỐT TỰ KIỂM — kêu to, ở TRONG hàm, KHÔNG giao cho người gọi nhớ.
     *    Ca này CHỈ xảy ra khi mã của chính ta hỏng, nên nó phải tự khai lúc nó chạy: một nhánh
     *    KHÔNG bao giờ được nghiệm thu mà lại IM LẶNG thì nó chỉ tồn tại trên giấy.
     */
    console.error(
      `[SO-TIEN-TRINH] SỔ TỰ MÂU THUẪN — ĐÂY LÀ LỖI CỦA APP, KHÔNG phải lỗi người dùng: ` +
      `ô ${maO} và ô ${oKhacGiu[0]} cùng giữ MỘT tay cầm (pid ${v.pid_de_hien_thi}). ` +
      'Hai ô KHÔNG thể cùng giữ một tay cầm nếu đường ghi sổ đúng ⇒ có một chỗ trong mã đang ' +
      'chuyền nhầm tay cầm. Nút Dừng của cả hai ô sẽ bị CHẶN cho tới khi tiến trình tự thoát.',
    );
    return { trang_thai: 'so_mau_thuan', v };
  }
  const conSong = v.tien.exitCode === null && v.tien.signalCode === null;
  return { trang_thai: conSong ? 'song' : 'chet', v };
}

/**
 * 🛑 Giết việc của một ô. Đây là cửa DUY NHẤT được phép gửi tín hiệu dừng.
 *
 * 🔴 ĐÂY LÀ HÀNH ĐỘNG NGUY HIỂM NHẤT TRONG CẢ TỆP, và @app-pm xếp nó TRÊN cả câu ⑥ (02/09).
 * 🕳 BẢN HÔM QUA gửi SIGTERM THẲNG tới một CON SỐ lấy từ sổ. Nếu dòng đó là rác và hệ điều hành
 *    đã cấp lại pid ấy cho tiến trình khác thì **nút Dừng của Owner bắn vào một tiến trình LẠ** —
 *    lỗi duy nhất trong tệp này ĐI RA KHỎI app và chạm vào máy Owner.
 * ✅ BẢN NÀY KHÔNG CÒN DỰNG ĐƯỢC CA ĐÓ: ta gọi `tien.kill()`, và Node từ chối gửi tín hiệu khi
 *    xác con đã được thu (đo: `kill()` trả `false`). Nó KHÔNG cần ta canh đúng — nó KHÔNG có
 *    đường để sai. **Phanh nằm TẠI CHỖ BẮN, KHÔNG nằm ở người gọi.**
 *
 * 🔴 ĐỌC GIÁ TRỊ TRẢ VỀ CỦA `kill()`, ĐỪNG BỎ: đây đúng hình «sinh một giá trị mà KHÔNG đầu nào
 *    đọc» đã cắn hai lần trong hai ngày (`vi_sao_bo` rỗng 4/4 · `dangKyViec` trả `KetGhiSo` mà
 *    người gọi bỏ qua). `kill()` trả `false` nghĩa là ta KHÔNG bắn được gì ⇒ khai `da_giet: true`
 *    lúc đó là một lời nói dối mới, đúng con bệnh cả ngày đang chữa.
 */
export function gietViec(
  maO: string,
): { da_giet: boolean; pid_de_hien_thi?: number | null; ma_nhan_su?: string; vi_sao: ViSaoDung } {
  const kq = xacMinhDong(maO);
  if (kq.trang_thai === 'trong') return { da_giet: false, vi_sao: 'khong_co_viec' };
  const { v } = kq;
  const chung = { pid_de_hien_thi: v.pid_de_hien_thi, ma_nhan_su: v.ma_nhan_su };

  if (kq.trang_thai === 'so_mau_thuan') {
    // LỖI CỦA APP ⇒ GIỮ dòng · KHÔNG bắn · NÓI RA. (`xacMinhDong` đã kêu to ở sổ máy chủ.)
    return { da_giet: false, ...chung, vi_sao: 'so_tu_mau_thuan' };
  }
  if (kq.trang_thai === 'chet') {
    /**
     * ✅ ĐÂY LÀ LỐI RA DUY NHẤT CÓ BẰNG CHỨNG DƯƠNG, và cũng là lối ra duy nhất được xoá dòng sổ.
     *    Tay cầm khai `exitCode`/`signalCode` khác `null` ⇒ Node ĐÃ THU XÁC con ⇒ nó CHẾT THẬT.
     */
    xoaViec(maO);
    return { da_giet: true, ...chung, vi_sao: 'dong_rac' };
  }

  /**
   * 🔴 ĐƯỜNG 'song' — GỬI TÍN HIỆU RỒI ĐỂ NGUYÊN DÒNG SỔ. Đây là chỗ bản trước hỏng.
   *
   * 🕳 Bản trước: `kill()` xong `SO.delete(maO)` ngay dòng sau, và khai `da_giet: true`.
   *    Ba thứ sai cùng lúc, mà chỉ một thứ nhìn thấy được:
   *      lời khai sai   ⇒ Owner tưởng đã dừng           (thấy được, tự dọn khi bấm lại)
   *      MẤT TAY CẦM    ⇒ lần bấm sau KHÔNG nâng SIGKILL được  ⇐ cái này KHÔNG tự dọn
   *      mất dòng sổ    ⇒ ghế biến khỏi mọi phép đếm, vẫn tiêu tiền
   * 🔑 **Cái nhìn thấy được là cái nhẹ nhất.** Ta suýt sửa đúng cái nhẹ rồi thôi.
   * ✅ Nay: dòng sổ SỐNG TIẾP tới `close`. Ai xoá nó? `khiChet` (bắn từ `close` của con) hoặc
   *    `quetRac` (lưới hai). KHÔNG phải hàm này.
   */
  if (v.xin_dung_luc === null) {
    v.xin_dung_luc = Date.now();
    // `khiHetViec` bỏ tham chiếu trên ĐÚNG đối tượng dòng này. Dòng bị thay thì `v` là đối tượng
    // CŨ ⇒ gán `null` lên nó KHÔNG chạm dòng mới. Tay cầm cứu ta ở đây lần nữa: danh tính là
    // đối tượng, KHÔNG phải mã ô.
    v.bo_hen_ep = guiLenhDung(v.tien, () => { v.bo_hen_ep = null; });
    return { da_giet: false, ...chung, vi_sao: 'da_gui_dung' };
  }
  /**
   * 🔨 Bấm lần thứ hai ⇒ Owner đã thấy câu «đã gửi lệnh, nó chưa thoát» và vẫn muốn dừng ⇒ ÉP.
   * 📌 Lần bấm thứ hai là một Ý ĐỊNH ĐƯỢC KHAI, cùng họ với `xoa_lien_ket` và với luật «Owner
   *    xác nhận hai lần». Ta KHÔNG suy ý định ép từ một cú bấm.
   */
  if (v.bo_hen_ep !== null) { clearTimeout(v.bo_hen_ep); v.bo_hen_ep = null; }
  v.tien.kill('SIGKILL');
  return { da_giet: false, ...chung, vi_sao: 'da_ep_dung' };
}

