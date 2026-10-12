/**
 * 🗣 CÂU DẶN ĐẦU SAU KHI FORK — **NGUỒN DUY NHẤT** của câu mẫu (Owner đặt 20/09/2026).
 *
 * Owner, nguyên văn: «khi fork tôi muốn điền sẵn gợi ý này, nếu tôi không đổi sẽ là câu mẫu này»
 * và bổ sung: «phải thêm câu này nữa ở cuối — từ bây giờ để không nhầm với phiên cũ tên em sẽ là …-app».
 *
 * 🔑 VÌ SAO CÂU NÀY CÓ HAI VẾ, và vế hai KHÔNG phải câu xã giao:
 *    Một phiên vừa fork xong mang tới BA cái tên cùng trỏ vào nó (đo ca 20/09):
 *      ① tên GHẾ trong app        claude-wiki-program-pm          (sổ ô · /api/o)
 *      ② tiêu đề app tự đặt       claude-wiki-program-pm <-- claude-aicos-wiki-zoom
 *      ③ tên agent TỰ XƯNG        vẫn là tên phiên NGUỒN, vì bản fork mang nguyên mạch cũ
 *    Vế một chữa ③ — bảo nó biết nó đang ngồi ghế nào.
 *    Vế hai chữa chỗ khác: kể cả khi đã biết mình là `<ghế>`, nó vẫn TRÙNG TÊN với phiên gốc đang
 *    sống ngoài cửa sổ dòng lệnh. Hai phiên sống, một cái tên, ghi chung một kênh — đuôi `-app`
 *    là chỗ tách hai cái đó ra.
 *
 * ⚠️ TÊN DÙNG Ở ĐÂY LÀ TÊN GHẾ NHẬN FORK, KHÔNG phải tên agent của phiên nguồn. Hai cái đó khác
 *    nhau trong đúng ca sinh ra việc này (ghế `claude-wiki-program-pm` nhận phiên của
 *    `claude-aicos-wiki-zoom`), nên đây là chỗ dễ làm sai mà số đo đã chốt hộ.
 *
 * ⚠️ GHÉP ĐUÔI MÁY MÓC, KHÔNG có bảng ngoại lệ: ghế nào trong tên đã có chữ «app» thì đọc hơi lạ
 *    (`claude-aiboss-app-exe-app`). Vẫn giữ luật ghép đều — bảng ngoại lệ thì lần sau thêm ghế mới
 *    là nó thiếu, và cái thiếu ấy KHÔNG kêu lên tiếng nào.
 *
 * 📌 Tệp riêng theo nếp `han-gio-fork.ts`: câu này hiện ở ô soạn, đi vào phiên mới, và sẽ còn được
 *    nhắc trong tài liệu. Ba chỗ chép tay là ba bản trôi mỗi bản một kiểu.
 */

/** Đuôi thêm vào tên ghế để phiên trong app KHÔNG trùng tên với phiên gốc ngoài terminal. */
export const DUOI_TEN_TRONG_APP = '-app';

/**
 * Câu mẫu điền sẵn cho ô «câu dặn đầu».
 * @param tenGhe tên ghế ĐANG NHẬN fork (vd `claude-wiki-program-pm`)
 */
export function cauDanDauFork(tenGhe: string): string {
  return (
    `bạn là ${tenGhe} phiên mới fork lên phần mềm aiboss-app-chat. ` +
    `từ bây giờ để không nhầm với phiên cũ tên em sẽ là ${tenGhe}${DUOI_TEN_TRONG_APP}`
  );
}

/** Phần ô bị sửa khi fork xong: ô soạn (chỉ khi đang trống) và dòng thông báo. */
export interface VaDienOSoan {
  soan: string;
  loiDan: string;
}

/**
 * 📝 FORK XONG ⇒ ĐIỀN SẴN câu dặn đầu vào Ô SOẠN của phiên mới. KHÔNG BAO GIỜ tự gửi (round-33 ①B).
 *
 * 🕳 Ba vòng bác trước (20/09) đều xoay quanh một câu: «app gửi hộ, lỡ hỏng thì ai biết». Mỗi vòng vá
 *    một đường mất câu thì lộ ra đường khác — quá hạn, đổi ghế, binding hết hiệu lực (Y1 · Y2 · Y8).
 * ✅ Owner chốt 21/09 18:08: bỏ hẳn tự gửi. Không gửi thì KHÔNG có đường nào gửi hỏng — cả lớp lỗi
 *    mất-câu-im-lặng biến mất bằng CẤU TẠO. Owner đọc câu, sửa nếu muốn, tự bấm Gửi.
 * 🔒 Ô soạn đang có chữ ⇒ KHÔNG đè: đó cũng là ý Owner. Câu gợi ý hiện ở dòng thông báo thay vào,
 *    nguyên văn, để Owner vẫn chép được.
 * 📌 Hàm THUẦN — bộ thước `dev/check-fork-notice.mjs` chạy thẳng hàm này, không chép lại.
 *
 * @param tenGhe   tên ghế ĐANG NHẬN fork
 * @param soanCu   chữ đang nằm trong ô soạn lúc bản ghi kết thúc được áp dụng
 * @param loiDanCu dòng thông báo «Fork xong …»
 */
export function vaDienCauDanDauVaoOSoan(tenGhe: string, soanCu: string, loiDanCu: string): VaDienOSoan {
  const cau = cauDanDauFork(tenGhe);
  if (soanCu.trim() === '') {
    return {
      soan: cau,
      loiDan: `${loiDanCu}\n📝 Câu dặn đầu đã điền SẴN vào ô soạn bên dưới — app KHÔNG tự gửi. Sửa nếu cần rồi bấm Gửi.`,
    };
  }
  return {
    soan: soanCu,
    loiDan: `${loiDanCu}\n📝 Ô soạn đang có chữ nên app KHÔNG đè. Câu dặn đầu gợi ý: «${cau}» — app KHÔNG tự gửi.`,
  };
}
