'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
/**
 * 🎨 Bộ icon: `@phosphor-icons/react` — bộ ƯU TIÊN SỐ 1 trong skill `taste` (§3.C),
 * và `lucide-react` thì skill KHUYÊN TRÁNH. MỘT họ icon cho cả dự án, ⛔ không trộn.
 * Dùng bản `ssr` cho hợp Next. Độ đậm thống nhất `bold` — ⛔ đừng trộn nhiều độ đậm.
 */
import {
  NumberOne, NumberTwo, NumberThree, NumberFour, NumberFive, NumberSix, Info, DotsThreeVertical, ClockCounterClockwise, TextAlignLeft, X,
  Stop, Plus, ClipboardText, ArrowLeft, CornersOut, CornersIn, Crown, List, ChatCircleDots,
  CaretUp, CaretDown, ArrowsClockwise,
} from '@phosphor-icons/react/dist/ssr';
import { dungMarkdown } from '@/lib/dung-markdown';
import { SO_O } from '@/lib/so-o';

/* Bố cục + tên lớp CSS bê nguyên bản mẫu 09 Owner đã duyệt. ⛔ Không thiết kế lại. */

interface PhongBan { ma: string; icon: string; ten: string; so_nhan_su: number }
interface NhanSu {
  ten: string; nhan: string; phong: string; ten_phong: string;
  vai: string; viet_tat: string; tim: string;
  /** 👑 Ghim đầu danh sách · ⛔ không nút tắt · ô 1 mọi chế độ chia ô. */
  ghim?: boolean;
  /**
   * Đường dẫn tệp LINH HỒN của ghế (7/218 ghế có, đo trong `du-lieu/nhan-su.json`).
   * ⚠️ Kiểu này là BẢN CHÉP của `src/lib/nhan-su.ts` — dữ liệu vẫn về đủ, chỉ là bản
   * chép thiếu trường nên TypeScript báo lỗi khi tôi hiện nó ra thẻ hồ sơ (17/08/2026).
   * 📌 Hai bản khai cùng một thứ thì sớm muộn cũng lệch; đáng gộp về một nguồn.
   */
  soul?: string;
}
interface TomTatPhien {
  ma: string; moc: number; moc_doc: string;
  tin_cuoi: string; so_luot: number; dang_chay: boolean;
}
/**
 * 🔑 MÃ RIÊNG của một bong bóng — dùng làm `key` cho React.
 *
 * 🐛 VÌ SAO PHẢI CÓ (FAIL ② Hermes, 30/08): trước đây `key={k}` lấy CHỈ SỐ trong mảng.
 *    Nạp phần cũ hơn là NỐI VÀO ĐẦU ⇒ chỉ số của MỌI tin cũ đều đổi ⇒ React coi mọi dòng
 *    là dòng mới ⇒ dựng lại hàng trăm bong bóng + vẽ lại markdown. Đúng cái GIẬT mà
 *    phân trang sinh ra để chữa — vá một đầu, mở lại ở đầu kia.
 *
 * 🔬 VÌ SAO ⛔ DÙNG `luc` (mốc mili-giây) — ĐO THẬT 30/08, 6 ghế · 11.620 tin:
 *      luc trơn  KHÔNG độc nhất   (nặng nhất 4.111/4.184)
 *      luc + ai  VẪN KHÔNG độc nhất — 4/6 ghế có trùng, nặng nhất 3.810/3.863
 *    Hai tin trong CÙNG một mili-giây là chuyện có thật, ⛔ phải giả thuyết.
 *    ⇒ Khoá phải do MÌNH cấp, ⛔ suy từ nội dung. Đếm tăng dần là đủ: React chỉ cần
 *      ĐỘC NHẤT và ỔN ĐỊNH, ⛔ cần có thứ tự hay ý nghĩa.
 *
 * ⚠️ Nối vào đầu GIỮ NGUYÊN vật cũ (`[...moi, ...cu]`) ⇒ tin cũ giữ nguyên mã ⇒ ⛔ dựng lại.
 *    Lúc chảy chữ cũng an toàn vì chỗ cập nhật dùng `{ ...cuoi }` — mã đi theo.
 */
/**
 * ⚙️ Chạy TRƯỚC khi trình duyệt VẼ, nhưng ⛔ nổ cảnh báo lúc dựng phía máy chủ.
 * Trang này là thành phần máy khách nhưng Next VẪN dựng thử trên máy chủ, mà ở đó ⛔ có DOM
 * ⇒ chọn theo môi trường. Đặt ở tầng TỆP để thứ tự hook ⛔ bao giờ đổi giữa hai lần vẽ.
 * 📌 Cần «trước khi vẽ» vì việc neo chỗ đọc mà chạy SAU khi vẽ thì mắt Owner kịp thấy
 *    khung nhảy xuống đáy rồi mới bật ngược lên — vá xong vẫn còn giật.
 */
const dungTruocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Lệch dưới ngần này pixel thì coi như ĐANG Ở ĐÁY — chưa tới một dòng chữ.
 *  Để ở tầng TỆP: nó là hằng số, ⛔ phải thứ đổi theo mỗi lần vẽ, nên ⛔ được nằm trong
 *  danh sách phụ thuộc của hook nào cả. */
const LECH_COI_LA_DAY = 8;

/**
 * 🕐 MỐC ĐẦY ĐỦ «HH:mm dd/mm/yyyy» dựng TỪ `luc` (epoch ms).
 *
 * 🔴 ⛔ CÓ `luc` ⇒ trả CHUỖI RỖNG. TUYỆT ĐỐI ⛔ suy ngày từ chỗ khác:
 *    ⛔ lấy hôm nay · ⛔ lấy mốc sửa tệp · ⛔ đoán từ tin liền kề.
 *    Bịa một lần là Owner đọc SAI LỊCH SỬ mà ⛔ có cách nào biết.
 *    ⚠️ ⛔ ghi «14% mẩu tin thiếu mốc» ở đây — ĐÓ LÀ SAI ĐƠN VỊ (xem chú thích `luc` bên dưới):
 *       14% là của DÒNG trong tệp phiên; MẨU thành bong bóng thì 0/3.774 = 0%.
 *       Nhánh này vẫn phải giữ, nhưng giữ vì **⛔ ai bảo đảm mãi mãi 0%**, ⛔ phải vì «14%».
 * ⚠️ ⛔ dựng từ `gio`: `gio` là chuỗi HIỂN THỊ «22:11», cộng ngày vào đó chính là bịa.
 */
function mocDayDu(luc?: number): string {
  if (typeof luc !== 'number' || !Number.isFinite(luc)) return '';
  const d = new Date(luc);
  if (Number.isNaN(d.getTime())) return '';
  const hai = (x: number) => String(x).padStart(2, '0');
  return `${hai(d.getHours())}:${hai(d.getMinutes())} ${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

let demMaTin = 0;
const datMa = () => `t${++demMaTin}`;

interface Tin {
  /** 🔑 Mã riêng do máy khách cấp — xem `datMa()`. ⛔ Đừng thay bằng chỉ số hay `luc`. */
  ma: string;
  /**
   * 📜 Tin này ĐẾN TỪ LỊCH SỬ (máy chủ đọc tệp phiên), ⛔ phải tin sinh ra trong lượt đang chạy.
   * Chỉ tin lịch sử mới hiện MỐC ĐẦY ĐỦ — khung đang sống giữ «HH:mm» cho khỏi lặp
   * hàng trăm lần cùng một ngày trên cỡ chữ 10px (mau09.css:312 · 9,5px ở bố cục 4 ô :383).
   */
  tuLichSu?: boolean;
  ai: 'toi' | 'ho'; chu: string; gio: string; loi?: boolean;
  /**
   * 🕐 MỐC THẬT (epoch ms) — việc ②A, 19/08/2026.
   * `gio` là chuỗi HIỂN THỊ "22:11" ⇒ ⛔ không suy ra được NGÀY. Ca 23:59 → 00:01 hỏng chắc.
   * ⚠️ TUỲ CHỌN: **14% dòng** trong tệp phiên thật ⛔ KHÔNG có `timestamp`.
   *    (đo lại 31/08/2026: app-pm 1.065/7.546 = 14,1% · eroca-boss 630/4.639 = 13,6%.
   *     Số cũ ghi 11,5% đo ngày 19/08 — ĐÃ TRÔI. Ai đọc lại thì ĐO LẠI, ⛔ tin con số này mãi.)
   *    Bong bóng cũ đang nằm trong bộ nhớ cũng ⛔ không có ⇒ mọi chỗ ĐỌC phải chịu được `undefined`.
   * 📌 Bước này CHỈ thêm dữ liệu — giao diện ⛔ KHÔNG đổi một ly (cổng ③ của việc ②A).
   */
  luc?: number;
  /**
   * 📍 Vị trí KẾT THÚC của từng mẩu máy chủ bắn về (Owner 17/08/2026:
   * «bắn mẩu nhỏ mới lên cần thêm xuống dòng cho tôi để biết mẩu mới»).
   * Giữ RIÊNG, ⛔ không nhét ký tự lạ vào `chu` — để tắt chế độ này là chữ sạch ngay,
   * và bôi đen chép đi ⛔ không dính rác.
   */
  ranh?: number[];
  /**
   * Bong bóng ĐANG chảy chữ của LƯỢT NÀY.
   *
   * 🪤 BẪY ĐÃ CẮN THẬT (14/08): bản trước dùng một biến cờ `daMoBong` NGOÀI hàm cập nhật
   *    để biết "đã mở bong bóng chưa". React ở chế độ nghiêm ngặt GỌI HÀM CẬP NHẬT HAI LẦN;
   *    lần một đặt cờ, lần hai thấy cờ đã bật nên NỐI CHỮ VÀO TIN CUỐI — mà tin cuối lúc đó
   *    là CÂU HỎI CỦA NGƯỜI DÙNG. Đo thật: bong bóng ra
   *    «Tra loi dung 3 chu: TOI LA O2TOI LA O2» — câu trả lời chui vào câu hỏi.
   * ⇒ Cờ phải nằm TRONG trạng thái để hàm cập nhật THUẦN (gọi mấy lần cũng ra một kết quả).
   */
  dang?: boolean;
  /**
   * 🔔 Câu này ⛔ KHÔNG do Owner gõ — một ghế khác đánh thức ô này qua cổng
   * `/api/danh-thuc`. Giữ TÊN KỸ THUẬT của ghế gửi để dựng nhãn «… đánh thức».
   * ⛔ Đừng bỏ nhãn: người xem phải phân biệt được câu Owner gõ với câu máy tự gửi.
   */
  tu_ai?: string;
}

/* ============================================================================
 * CHIA Ô 1 / 2 / 4
 * ----------------------------------------------------------------------------
 * · Bốn ô LUÔN được dựng sẵn, đổi bố cục chỉ ẩn/hiện bằng CSS
 *   (`.luoi.bc-1 .o-chat:nth-child(n+2)` · `.luoi.bc-2 .o-chat:nth-child(n+3)`).
 *   ⇒ 4 ô → 2 ô → 4 ô thì phiên từng ô GIỮ NGUYÊN, ⛔ không phải nạp lại.
 * · Phiên nằm ở SỔ TRÊN ĐĨA theo `ma_o` (`o-1`…`o-4`) ⇒ tải lại trang vẫn đúng ô nào phiên nấy.
 *   Trình duyệt chỉ nhớ thêm BỐ CỤC + TIÊU ĐIỂM (localStorage) — hai thứ thuần giao diện.
 * · Trần kết nối HTTP/1.1 của trình duyệt là ~6 luồng cùng lúc tới một máy chủ.
 *   4 ô × 1 luồng SSE = 4 ⇒ CÒN AN TOÀN vòng này. Nhưng ô đóng / đổi agent thì
 *   PHẢI cắt luồng ngay (`huyLuong`) — ⛔ đừng để luồng rác tích lại.
 * ==========================================================================*/

// 🔢 SỐ Ô: nhập từ NGUỒN DUY NHẤT `src/lib/so-o.ts` — ⛔ tự khai lại ở đây nữa.
//    (21/08: khai hai nơi ⇒ máy chủ mù ⇒ sổ đẻ mục ngoài tầm ⇒ TIN MẤT IM LẶNG.)
const maOCua = (i: number) => `o-${i + 1}`;
/**
 * 🔔 Nhịp thăm dò cổng đánh thức. 5 giây = giữa khoảng Owner chốt (4–6s).
 * Một lần gọi gộp CẢ 4 ô ⇒ 12 lượt gọi mỗi phút, ⛔ không phải 48.
 */
const NHIP_THAM_DO_MS = 5_000;
/**
 * 🔴 BỐN KHOÁ DƯỚI ĐÂY: **CẤM ĐỔI TÊN** — kể cả khi đổi tên kho/dự án.
 *
 * Chúng là **khoá lưu TRONG TRÌNH DUYỆT của Owner**, ⛔ phải tên hiển thị, ⛔ phải tên thư mục.
 * Chữ «phong-ban-ai» ở đây chỉ là **tiền tố định danh kho lưu**, ⛔ liên quan tên dự án.
 *
 * 🕳 Đổi chúng thì app VẪN CHẠY, ⛔ báo lỗi dòng nào — nhưng Owner mở lên sẽ thấy:
 *      · bố cục về mặc định (mất kiểu chia ô đang dùng)
 *      · mất ô đang chọn
 *      · mất đường quay về bộ ghế cũ
 *      · hai cột trái hiện lại dù đã ẩn
 *    Tức là **mọi thứ Owner tự tay xếp bị xoá sạch, mà ⛔ ai báo.**
 *
 * 📌 Ghi 29/08/2026 khi cả nhà chuẩn bị đổi tên kho sang `aiboss-app-chat`.
 *    `claude-aiboss-app-pm` cảnh báo có HAI khoá · `claude-phong-ban-pm` đếm ra BỐN ·
 *    `claude-aiboss-app-exe` đo lại: **ĐÚNG 4**, đều nằm ở đây, ⛔ chỗ nào khác trong mã
 *    (đối chứng dương: thước vẫn thấy 12 chỗ gọi localStorage ⇒ ⛔ mù).
 * ⇒ Ai đổi tên kho: **bỏ qua bốn dòng này.** Muốn đổi thật thì phải viết mã CHUYỂN
 *    dữ liệu cũ sang khoá mới trước, ⛔ đổi trần.
 */
const KHOA_BO_CUC = 'phong-ban-ai.bo-cuc';
const KHOA_TIEU_DIEM = 'phong-ban-ai.tieu-diem';
const KHOA_BO_GHE_CU = 'phong-ban-ai.bo-ghe-cu';
const KHOA_AN_COT = 'phong-ban-ai.an-cot';

/**
 * 🎛 BỘ GHẾ DỰNG SẴN — «Phòng Marketing» (Owner 20/08, cho lớp 19h30).
 * Sáu ghế này là SÁU GHẾ DUY NHẤT có hồ sơ `soul` mà ⛔ không phải ghế nội bộ
 * (`claude-phong-ban-pm` · `claude-aiboss-app-pm` · `claude-aiboss-app-exe`).
 * ⇒ nạp vào ô là CHẠY THẬT được, ⛔ không phải ô trống.
 * ⚠️ ⛔ ĐỪNG lấy từ `demo-man-hinh.ts` — tệp đó ⛔ KHÔNG chứa mã ghế nào, chỉ có nhãn nút.
 * 👑 Ô 1 để `claude-eroca-boss` cho ĐÚNG SỔ, nhưng `datNguoi` vốn đã chặn đổi ô 1
 *    ⇒ dòng này là để ĐỌC HIỂU, ⛔ không phải để ghi.
 */
const BO_MARKETING: string[] = [
  'claude-eroca-boss', 'claude-marketing', 'claude-ketoan',
  'claude-cskh', 'claude-sales', 'claude-web-demo',
];

/**
 * 🎛 BỘ GHẾ DỰNG SẴN — «Vận hành» (Owner 20/08).
 *
 * 🔴 ĐỌC KỸ MỘT CHỮ: «ghế hiện tại» ở đây là **ẢNH CHỤP**, ⛔ KHÔNG phải «động».
 *    Mục «Ghế hiện tại» vốn đã ĐỘNG (bộ Owner đang xếp, được cất lại khi đổi sang bộ khác).
 *    Nếu bộ này cũng lấy động thì Owner có **hai nút làm y hệt một việc**.
 *    ⇒ Chụp bộ ghế lúc 10:49 20/08 rồi ĐÓNG CỨNG, giống hệt cách `BO_MARKETING` làm.
 *
 * ⚠️ Ô 5-6 (`claude-zalo-bot` · `claude-chat-channels`) ⛔ KHÔNG có hồ sơ `soul` và
 *    ⛔ không có `~/<ghế>/CLAUDE.md` ⇒ chạy được nhưng ⛔ KHÔNG có linh hồn riêng.
 *    📌 Đó là TRẠNG THÁI THẬT Owner xin chụp ⇒ ⛔ ĐỪNG «sửa cho đẹp» bằng cách thay ghế khác.
 *    Vì sao vẫn nạp được: `POST /api/o` chỉ đòi `timNhanSu()` (có trong `nhan-su.json` là qua),
 *    còn `spawn` cần THƯ MỤC làm chỗ đứng — cả sáu đều có. Và ô 5-6 ĐANG chạy thật.
 */
const BO_VAN_HANH: string[] = [
  'claude-eroca-boss', 'claude-aiboss-app-pm', 'claude-phong-ban-pm',
  'claude-aiboss-app-exe', 'claude-zalo-bot', 'claude-chat-channels',
];

/**
 * 🎛 BỘ GHẾ DỰNG SẴN — «Quản Lý Trường» (Owner 30/08).
 *
 * 🔴 KHÁC HẲN hai bộ trên ở MỘT điểm sống còn: bộ này MANG THEO MÃ PHIÊN.
 *    Hai bộ kia nạp ghế rồi để `phien: null` ⇒ `datNguoi` tự nối phiên GẦN NHẤT của ghế.
 *    Ở đây Owner chỉ đích danh 5 CUỘC NÓI CHUYỆN đã có ⇒ phải ghim mã, ⛔ để máy đoán.
 *    ♻️ Dùng đúng đường mà nút «quay về» vẫn đi (`muc[i].phien`), ⛔ đẻ đường song song.
 *
 * 📁 Vì sao 5 ghế này chạy được: chúng khai `thu_muc: "/Users/erocathanh"` trong
 *    `du-lieu/nhan-su.json`. Kho phiên suy TỪ chỗ đứng, nên đứng ở thư mục NHÀ thì
 *    kho là `-Users-erocathanh` — đúng chỗ 5 phiên này nằm. Bỏ `thu_muc` đi là ghế
 *    đứng ở `~/claude-hieu-truong`, kho khác, và cả 5 ô mở ra TRỐNG TRƠN.
 *
 * 🛡 An toàn: `/api/o` chỉ nhận phiên CÓ THẬT trong kho của ĐÚNG ghế đó (o/route.ts:37)
 *    ⇒ mã phiên bị xoá thì máy chủ chặn, ⛔ ghi bậy vào sổ ô.
 */
/**
 * 🗄 ĐỔI TÊN 31/08/2026 — «Quản Lý Trường» → «QUẢN LÝ CŨ», và 5 ghế đổi sang TÊN THẬT.
 *
 * 🕳 Ca: bộ này dựng ngày 30/08 với năm cái tên BỊA («Hiệu Trưởng», «Phòng Tài Chính»…).
 *    Năm mã phiên thì ĐÚNG, nhưng ghế đeo nhãn sai ⇒ ghế nối phiên xong tự xưng tên trong
 *    mạch cũ, KHÔNG phải tên trên nhãn. Owner tự nhận: *«lỗi ở tôi chưa hiểu cách đưa phiên
 *    vào ghế nên yêu cầu bị sai tên ghế»*.
 *
 * 🔎 CÁCH TÌM RA TÊN THẬT — tra mã phiên trong `~/Operations/phien-chat/INDEX.md`:
 * ```
 *   e888d879 → bos-funnel-pm-r3           ⇒ ghế claude-bos-funnel-pm   (Owner gọi đích danh)
 *   5956cd23 → claude-giao-trinh-eeat     ⇒ ghế cùng tên
 *   7911258a → web-funnel                 ⇒ ghế claude-web-funnel
 *   823ce356 → claude-email-funnel-pm-296 ⇒ ghế cùng tên
 *   1f08afd0 → claude-tro-ly-dieu-hanh    ⇒ ghế cùng tên
 * ```
 * 📌 Bốn tên khớp CHÍNH XÁC một ghế trong `nhan-su.json`. Tên thứ năm (`…-r3`) là nhãn của
 *    PHIÊN chứ ⛔ phải tên ghế — ghế thật là `claude-bos-funnel-pm`, đúng cái Owner gọi.
 * ⚠️ MÃ PHIÊN GIỮ NGUYÊN TỪNG KÝ TỰ. Đổi nhãn ghế là việc này; đụng mã phiên là việc KHÁC,
 *    và đụng nhầm thì ô mở ra TRỐNG.
 * 🛡 Cả 5 ghế phải khai `thu_muc: /Users/erocathanh` trong `nhan-su.json` — kho phiên suy TỪ
 *    chỗ đứng, ⛔ khai thì `--resume` tìm ở kho khác và KHÔNG BAO GIỜ thấy.
 */
const BO_QUAN_LY_CU: { ten: string; phien: string | null }[] = [
  { ten: 'claude-eroca-boss',            phien: null },
  { ten: 'claude-bos-funnel-pm',         phien: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b' },
  { ten: 'claude-giao-trinh-eeat',       phien: '5956cd23-1533-4565-a7fc-0050769887dc' },
  { ten: 'claude-web-funnel',            phien: '7911258a-2109-4d48-8a53-5286836daef6' },
  { ten: 'claude-email-funnel-pm-296',   phien: '823ce356-1bb7-4174-991f-8ccee76582fd' },
  { ten: 'claude-tro-ly-dieu-hanh',      phien: '1f08afd0-73d8-45e9-86b5-0a06417bf7e1' },
];

/**
 * 🔴 Bộ đang xếp có PHẢI một bộ dựng sẵn ⛔ không?
 *
 * 🕳 LỖI PHÉP ĐO BẮT ĐƯỢC (20/08, khi thêm bộ «Vận hành»): `napBoGhe` cất bộ cũ MỖI LẦN
 *    Owner bấm một bộ dựng sẵn ⇒ bấm hai bộ liên tiếp là **bộ RIÊNG của Owner bị ghi đè
 *    bởi bộ dựng sẵn trước đó**, và «Ghế hiện tại» trả về bộ dựng sẵn — ⛔ KHÔNG phải đội
 *    Owner đang ngồi. Đo thật: Vận hành → Marketing → Vận hành → «Ghế hiện tại»
 *    ⇒ ra bộ MARKETING. Đội thật của Owner mất, ⛔ không có đường về.
 *
 * ⇒ CHỈ cất khi bộ đang xếp **⛔ KHÔNG phải** bộ dựng sẵn. Nhờ vậy «Ghế hiện tại» luôn
 *   là đội THẬT của Owner, bấm qua lại bao nhiêu bộ cũng ⛔ mất.
 */
const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  // ⚠️ THÊM BỘ MỚI thì PHẢI thêm vào đây. Quên = lỗi 20/08 quay lại: Owner bấm hai bộ
  //    liên tiếp là đội THẬT của mình bị ghi đè, ⛔ có đường về.
  [BO_MARKETING, BO_VAN_HANH, BO_QUAN_LY_CU.map((m) => m.ten)]
    .some((bo) => bo.every((x, i) => ten[i] === x));

/** Icon số ô — thay cho chữ «Ô 1/2/3/4» (Owner 17/08: nhãn chữ trông xấu). */
// Owner 17/08: bỏ KHUNG VUÔNG quanh số (NumberSquare*) để chữ số to hẳn ⇒ dùng số TRẦN.
/**
 * ⚠️ MẢNG NÀY PHẢI DÀI ĐÚNG BẰNG `SO_O` (lib/so-o.ts). Nay khớp: 6 icon / 6 ô.
 * 🔗 Cùng họ với lỗi đã sửa ở `huyRefs`/`dauVetCuon` — mảng gõ tay theo số ô thì trôi lúc nào
 *    KHÔNG ai hay. Khác một điều: chỗ này hỏng chỉ ra ICON SAI (có nhánh `?? NumberOne` đỡ),
 *    nên tôi CỐ Ý KHÔNG dựng chốt nổ ở đây — chốt nổ giết cả app để đổi lấy một cái icon
 *    là đánh đổi tồi. Nâng `SO_O` thì nhớ thêm icon tại đây.
 */
const ICON_SO_O = [NumberOne, NumberTwo, NumberThree, NumberFour, NumberFive, NumberSix];
const DAM_ICON = 'bold' as const;   // ⛔ MỘT độ đậm cho cả dự án

const MAU_PHONG = ['#c89425', '#5b8def', '#3fb27f', '#e0724a', '#9b6bd6', '#d94f70', '#4bb3c4'];

interface OChat {
  ns: NhanSu | null;
  tin: Tin[];
  soan: string;
  dangChay: boolean;
  dangNap: boolean;
  chiPhi: number | null;
  token: number | null;
  noiTiep: boolean;
  /** Còn phần lịch sử CŨ HƠN chưa nạp ⛔ — máy chủ trả về, dùng để hiện nút «xem thêm». */
  conNua: boolean;
  /** Máy chủ báo có khúc ⛔ đọc nổi (dòng dài hơn trần) — phải nói thật với Owner. */
  catDongDai: boolean;
  /** CON TRỎ: trang đang hiện bắt đầu ở byte nào. Xin trang cũ hơn thì gửi lại số này. */
  viTri: number;
  dsPhien: TomTatPhien[];
  phienHienTai: string | null;
  moChonPhien: boolean;
  moDan: boolean;
  chuoiDan: string;
  loiDan: string;
  /** 🧬 Mã phiên đọc được nhưng thuộc THƯ MỤC KHÁC — chờ Owner bấm «Fork về ghế này». */
  phienChoFork: string | null;
  dangFork: boolean;
  /**
   * 🗣 CÂU DẶN ĐẦU TIÊN gửi NGAY SAU khi fork xong. TUỲ CHỌN — bỏ trống là KHÔNG gửi gì.
   *
   * 🕳 Ca sinh ra nó (Owner 31/08): bản fork mang mạch cũ, nên nó vẫn xưng TÊN CŨ.
   *    Trước đây Owner phải fork xong rồi tự gõ lại câu dặn — mà lúc đó ô đã chuyển
   *    sang mạch mới, dễ quên, và quên thì ghế mang nhầm danh tính CẢ PHIÊN.
   * 🔒 Bỏ trống thì đường đi y hệt cũ — thêm cái này KHÔNG đổi hành vi của ai
   *    đang dùng fork theo nếp cũ.
   */
  cauDauFork: string;
  /** ¶ Hiện RANH GIỚI MẨU: mỗi mẩu máy chủ bắn về xuống một dòng. */
  hienMau: boolean;
  /** ℹ Mở thẻ hồ sơ ghế (gồm mã phiên · token · chi phí). */
  moHoSo: boolean;
  /** ⋯ Mở menu xổ ở góc phải ô (các việc ÍT DÙNG + đóng ô). */
  moMenu: boolean;
  /**
   * 🔴 Luồng vừa ĐỨT bất thường (mạng rớt · máy chủ tắt · khoá màn giữa chừng).
   * Owner 17/08 xin đèn báo «đang nối / mất kết nối» ⇒ đèn phải dựa vào SỰ THẬT ĐO ĐƯỢC,
   * ⛔ không phải suy từ việc ô có phiên hay chưa.
   */
  matKetNoi: boolean;
  /**
   * ⏭ HÀNG CHỜ — câu Owner gõ trong lúc ghế đang trả lời.
   * Owner 17/08: *«khi ai agent trả lời tôi vẫn chat tiếp và bấm gửi, nó nhồi vào
   * hàng chờ, ai agent gửi xong là nó gửi tiếp — giống trên terminal»*.
   * Trước đây bấm gửi lúc đang chạy là câu RƠI MẤT, ⛔ không báo gì.
   */
  hangCho: string[];
  /**
   * 🔽 THU KHUNG CHAT (Owner 18/08: «thêm nút thu khung chat ô 1 TỔNG GIÁM ĐỐC ở giao diện
   * mobile, sau khi thu sẽ đổi thành icon bấm để mở ra»).
   * ⛔ KHÔNG lưu localStorage: Owner vào app qua CẢ LAN lẫn Tailscale = HAI GỐC RIÊNG
   *    ⇒ mỗi đường nhớ một kiểu, rối hơn tiện. Đây là trạng thái NHÌN, mất là mất, ⛔ không sao.
   *    (Khác `KHOA_BO_CUC`/`KHOA_TIEU_DIEM` — hai cái đó là bố cục toàn app nên CÓ lưu.)
   */
  thuKhung: boolean;
}

const O_TRONG: OChat = {
  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,
  chiPhi: null, token: null, noiTiep: false, conNua: false, catDongDai: false, viTri: 0, dsPhien: [],
  phienHienTai: null, moChonPhien: false, moDan: false, chuoiDan: '', loiDan: '', phienChoFork: null, dangFork: false, cauDauFork: '',
  // ¶ MẶC ĐỊNH TẮT (đổi 17/08/2026 sau phản hồi thật của Owner).
  // Bật mặc định ⇒ mọi câu in THÔ ⇒ Owner thấy nguyên dấu ** và tưởng markdown hỏng.
  // Tính năng giữ nguyên, chỉ đổi mặc định: cần xem nhịp mẩu thì bấm ¶.
  hienMau: false, hangCho: [], moHoSo: false, moMenu: false, matKetNoi: false, thuKhung: false,
};

/**
 * Chèn xuống dòng tại mốc ranh giới mẩu.
 * ⚠️ Chỉ dùng để HIỂN THỊ. Chuỗi gốc `chu` giữ nguyên ⇒ tắt chế độ là sạch ngay.
 */
/**
 * 💬 MỘT bong bóng — MEMO HOÁ. Đây là chỗ chữa gốc chuyện «nóng máy + markdown vỡ».
 *
 * 🔴 GỐC THẬT (đo 17/08/2026, sau khi đọc mã `openclaw` trên máy Owner):
 *    Bản cũ gọi `dungMarkdown(t.chu)` THẲNG trong vòng lặp vẽ danh sách. React vẽ lại
 *    ô sau MỖI mẩu chữ ⇒ **MỌI bong bóng cũ cũng dựng lại markdown**, ⛔ không riêng
 *    bong bóng đang chảy. Ô có 40 tin ⇒ mỗi nhịp dựng 40 lần, mà một câu có hàng nghìn
 *    nhịp. Đó mới là thứ đốt CPU, ⛔ KHÔNG phải bản thân việc dựng markdown.
 *
 * 📌 `openclaw` (Owner chat qua điện thoại KHÔNG bị lỗi) ⛔ KHÔNG in thô lúc đang chảy —
 *    nó LUÔN dựng markdown. Nó nhẹ nhờ: giữ tối đa 60 tin gần nhất (`slice(-60)` — đo
 *    được trong `dist/control-ui/assets/chat-page-*.js`) và cập nhật entry THEO ID nên
 *    tin cũ giữ nguyên tham chiếu ⇒ ⛔ không vẽ lại.
 * ⇒ Ta làm đúng thứ đó: memo theo nội dung. Tin cũ ⛔ không đổi chữ ⇒ ⛔ không dựng lại.
 *    Nhờ vậy BỎ được kiểu «đang chảy thì in thô» — thứ Owner vừa phàn nàn.
 */
const BongBong = memo(function BongBong(
  { chu, ranh, hienMau, loi, dangChay }:
  { chu: string; ranh?: number[]; hienMau: boolean; loi?: boolean; dangChay: boolean },
) {
  const lop = `bong${loi ? ' loi' : ''}${dangChay ? ' dang-chay' : ''}`;
  // ¶ bật ⇒ in thô có xuống dòng theo mẩu (⛔ markdown ⛔ không dựng được khi đã cắt dòng giữa câu)
  const thoTheoMau = useMemo(() => (hienMau ? chenRanh(chu, ranh) : ''), [hienMau, chu, ranh]);
  // Dựng markdown chỉ khi CHỮ đổi — tin cũ đứng yên thì ⛔ không tốn gì
  const html = useMemo(() => (hienMau ? '' : dungMarkdown(chu)), [hienMau, chu]);
  if (hienMau) return <div className={`${lop} tho`}>{thoTheoMau}</div>;
  return <div className={lop} dangerouslySetInnerHTML={{ __html: html }} />;
});

function chenRanh(chu: string, ranh?: number[]): string {
  if (!ranh || ranh.length === 0) return chu;
  const moc = ranh.filter((v) => v > 0 && v < chu.length);
  if (moc.length === 0) return chu;
  let ra = '';
  let truoc = 0;
  for (const m of moc) { ra += chu.slice(truoc, m) + '\n'; truoc = m; }
  return ra + chu.slice(truoc);
}

function boDau(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function gioBayGio(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const MAU_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function UngDung({
  phongBan, nhanSu, tong,
}: {
  phongBan: PhongBan[];
  nhanSu: NhanSu[];
  tong: { nhan_su: number; phong_ban: number; truong_phong: number };
}) {
  /* 👑 Ghế ghim (TỔNG GIÁM ĐỐC) — LUẬT CỨNG: ô 1 là nó, ở CẢ 3 chế độ. */
  const ongTrum = useMemo(() => nhanSu.find((n) => n.ghim) ?? null, [nhanSu]);

  const [phongMo, datPhongMo] = useState<string | null>(null);
  const [phongChon, datPhongChon] = useState<string | null>(null);
  const [tuKhoa, datTuKhoa] = useState('');

  const [dsO, datDsO] = useState<OChat[]>(() =>
    Array.from({ length: SO_O }, (_, i) => (i === 0 ? { ...O_TRONG, ns: ongTrum } : { ...O_TRONG })),
  );
  const [boCuc, datBoCuc] = useState<1 | 2 | 4 | 6>(1);

  /**
   * 📱 MÁY CẢM ỨNG hay máy có BÀN PHÍM RỜI? (Owner 18/08: «cần biến nó thành xuống hàng
   * vì có nút gửi rồi»).
   *
   * 🕳 GỐC ĐO ĐƯỢC: điều kiện cũ là `Enter && !e.shiftKey` ⇒ gửi. Điện thoại
   *    ⛔ KHÔNG CÓ phím Shift khi gõ ⇒ `!e.shiftKey` LUÔN đúng ⇒ Enter LUÔN gửi,
   *    và Owner ⛔ không có cách nào xuống dòng. Trên máy tính thì Shift+Enter vẫn xuống
   *    dòng nên lỗi này ⛔ không lộ ra ở đó.
   *
   * ⚠️ ⛔ ĐỪNG tính bằng `navigator.userAgent` — nó nói MÁY GÌ, ⛔ không nói CÁCH NHẬP.
   *    `pointer: coarse` hỏi đúng câu cần hỏi: ngón tay hay con trỏ.
   * ⚠️ Khởi tạo `false` và chỉ đổi trong `useEffect` ⇒ lần dựng ĐẦU ở máy chủ và ở trình
   *    duyệt GIỐNG NHAU, ⛔ không vỡ bước ráp lại (hydration). Đọc `matchMedia` ngay lúc
   *    dựng là lỗi ráp-lại kinh điển.
   * 🔁 Có nghe `change`: máy gập / máy có cả chuột lẫn cảm ứng đổi kiểu giữa chừng được.
   */
  /* 🎛 Menu «Giao diện» — bộ ghế dựng sẵn (Owner 20/08) */
  const [moMenuGD, datMoMenuGD] = useState(false);
  /**
   * 🔴 LƯU CẶP (ghế, phiên) — ⛔ KHÔNG chỉ lưu mã ghế.
   * `claude-aiboss-app-pm` lần theo `/api/o` và bắt đúng chỗ tôi làm hụt:
   *   POST { ma_o, ma_nhan_su: 'ghế MỚI', ma_phien: null }
   *   → o/route.ts:56 chốt chống xoá CHỈ nổ khi CÙNG ghế ⇒ ca ĐỔI GHẾ nó ⛔ KHÔNG che
   *   → kho-phien.ts đặt ma_phien = null ⇒ LIÊN KẾT PHIÊN CŨ BỊ XOÁ
   * ⇒ lưu mỗi tên ghế thì «quay về» trả đúng TÊN mà ô RỖNG LỊCH SỬ — đúng vết đau 18/08.
   */
  type CapGhe = { ten: string | null; phien: string | null };
  const [boGheCu, datBoGheCu] = useState<CapGhe[] | null>(null);
  const [nhacGD, datNhacGD] = useState('');
  useEffect(() => {
    try {
      const s = localStorage.getItem(KHOA_BO_GHE_CU);
      if (s) {
        const j = JSON.parse(s) as unknown;
        // ⛔ Bản lưu đời cũ là mảng CHUỖI — bỏ qua, ⛔ đừng khôi phục nửa vời rồi mất lịch sử.
        if (Array.isArray(j) && j.every((x) => x && typeof x === 'object')) datBoGheCu(j as CapGhe[]);
      }
    } catch { /* hỏng thì coi như chưa lưu, ⛔ đừng để vỡ cả trang */ }
  }, []);

  const [camUng, datCamUng] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const doLai = () => datCamUng(mq.matches);
    doLai();
    mq.addEventListener('change', doLai);
    return () => mq.removeEventListener('change', doLai);
  }, []);
  const [tieuDiem, datTieuDiemThuan] = useState(0);
  const [nhacO1, datNhacO1] = useState('');
  /**
   * Màn HẸP: khu trao đổi phủ kín màn hình (bản mẫu 09 quy định `.cot-3{display:none}`
   * và chỉ hiện khi có lớp `mo-khu`). ⛔ Thiếu cờ này thì trên màn hẹp khu chat BIẾN MẤT
   * — đã đo thật ở khung rộng 816px. Nút ← trong mỗi ô trả về danh bạ.
   * Màn rộng ⛔ không dùng tới cờ này (CSS chỉ đọc `mo-khu` dưới 1040px).
   */
  const [anKhu, datAnKhu] = useState(false);

  /**
   * 📕 ẨN/HIỆN HAI CỘT TRÁI (Owner chốt 20/08, hướng Ⓑ: nút bấm được ở MỌI bố cục).
   *
   * 🔴 ⛔ TUYỆT ĐỐI ⛔ KHÔNG tái dùng `anKhu`. `anKhu` sinh cho MÀN HẸP và nó **TỰ ĐẶT LẠI false**
   *    ngay trong `datNguoi` (dòng ~548) và `chonNhanSu` (~574) — tức là Owner ẩn cột xong,
   *    **chọn một người là cột TỰ HIỆN LẠI** mà ⛔ không hiểu vì sao. Phải là trạng thái RIÊNG.
   *
   * `null` = CHƯA chọn tay ⇒ theo bố cục (6 ô thì ẩn, còn lại hiện) — giữ đúng nếp `claude-phong-ban-pm`
   * đã dựng cho bc-6. Owner bấm một lần thì ý ĐỊNH của Owner thắng, ở MỌI bố cục.
   */
  const [anCot, datAnCot] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KHOA_AN_COT);
      if (v === '1' || v === '0') datAnCot(v === '1');
    } catch { /* ⛔ không đọc được thì cứ theo bố cục */ }
  }, []);
  const datAnCotLuu = useCallback((v: boolean) => {
    datAnCot(v);
    try { localStorage.setItem(KHOA_AN_COT, v ? '1' : '0'); } catch { /* thôi */ }
  }, []);

  /**
   * Bản sao MỚI NHẤT của trạng thái 4 ô, đọc được từ trong hàm bất đồng bộ.
   * ⚠️ Hàm `async` chạy sau `await` thì biến bao đóng đã CŨ — đọc `dsO` ở đó sẽ
   *    ra ảnh chụp lúc bấm, ⛔ không phải hiện trạng. Ref này gán ngay lúc dựng
   *    nên luôn là bản vừa rồi.
   */
  const dsORef = useRef(dsO);
  dsORef.current = dsO;

  const bangTinRefs = useRef<Array<HTMLDivElement | null>>([]);
  /**
   * 🐛 KHAI CỨNG 4 PHẦN TỬ CHO 6 Ô (bắt được 30/08 · claude-aiboss-app-pm).
   *    `SO_O` là 6 (lib/so-o.ts:21) nhưng hai mảng này gõ tay 4 ⇒ ô 5·6 KHÔNG có chỗ.
   *    Hệ quả NẶNG NHẤT ở `huyRefs`: `huyRefs.current[4]?.abort()` là **lệnh RỖNG** cho tới
   *    khi có phép gán đầu tiên ⇒ đổi ghế · đóng ô · mở phiên khác ở ô 5·6 có thể
   *    **KHÔNG cắt được luồng đang chảy**. Lỗi im lặng: KHÔNG ai thấy, chỉ tốn tiền chạy tiếp.
   *    `dauVetCuon` nhẹ hơn vì JS tự nới mảng — nhưng khai 4 cho 6 vẫn là SAI TỪ LÚC VIẾT.
   * ✅ Sinh theo `SO_O`, ⛔ gõ tay con số. Đổi số ô sau này thì hai dòng này tự đúng theo.
   */
  const huyRefs = useRef<Array<AbortController | null>>(Array.from({ length: SO_O }, () => null));
  const dauVetCuon = useRef<string[]>(Array.from({ length: SO_O }, () => ''));
  /**
   * 📌 CHỖ ĐANG ĐỌC, ghi lại NGAY TRƯỚC khi nối phần cũ vào đầu (FAIL ① Hermes 30/08).
   * Ô nào có mục ở đây nghĩa là «lần đổi độ dài sắp tới là do NỐI VÀO ĐẦU, ⛔ phải tin mới».
   */
  const neoKeo = useRef<Record<number, { top: number; cao: number }>>({});
  /**
   * 📌 «Ô NÀY CÓ ĐANG Ở ĐÁY KHÔNG» — ghi lại NGAY TRƯỚC khi phóng to / thu lại.
   * 🐛 Vì sao cần (PM đo 30/08 trên WEBKIT): phóng to một ô thì NĂM ô kia bị ẩn
   *    (`clientHeight` = 0). Thu lại, chúng hiện ra với chiều cao MỚI nhưng giữ nguyên
   *    `scrollTop` CŨ ⇒ trỏ vào giữa hội thoại. Đo thật 6 ô: ô5 cách đáy 8.325px
   *    ≈ 30 màn hình. Chromium tự bám mép đáy nên CHE MẤT lỗi; WebKit ⛔ bám ⇒ lộ.
   * ⚠️ Mặc định `true` (coi như đang ở đáy) vì lúc mở ô lần đầu app luôn đưa xuống đáy.
   */
  const oODay = useRef<boolean[]>(Array.from({ length: SO_O }, () => true));
  const daKhoiPhuc = useRef(false);

  const capNhat = useCallback((i: number, vá: Partial<OChat> | ((o: OChat) => Partial<OChat>)) => {
    datDsO((truoc) => truoc.map((o, k) => (k === i ? { ...o, ...(typeof vá === 'function' ? vá(o) : vá) } : o)));
  }, []);

  /** ⛔ Cắt luồng SSE của một ô — gọi khi đóng ô / đổi agent / mở phiên khác. */
  const huyLuong = useCallback((i: number) => {
    huyRefs.current[i]?.abort();
    huyRefs.current[i] = null;
  }, []);

  const datTieuDiem = useCallback((i: number) => {
    datTieuDiemThuan(i);
    datNhacO1('');
    try { localStorage.setItem(KHOA_TIEU_DIEM, String(i)); } catch { /* chế độ riêng tư */ }
  }, []);

  /* ---------- Danh sách nhân sự sau lọc ---------- */
  const dsHien = useMemo(() => {
    const k = boDau(tuKhoa.trim());
    const loc = nhanSu.filter((n) => {
      // 👑 Ghế ghim (TỔNG GIÁM ĐỐC) LỌT QUA MỌI BỘ LỌC PHÒNG BAN — nó là ghế trùm toàn quyền,
      //    ⛔ không thuộc riêng phòng nào. Vẫn chịu bộ lọc tìm kiếm để gõ tên là ra.
      if (n.ghim) return !k || n.tim.includes(k);
      if (phongChon && n.phong !== phongChon) return false;
      // ⭐ `n.tim` gộp CẢ nhãn dễ hiểu LẪN tên kỹ thuật ⇒ gõ "marketing" ra đúng người,
      //    gõ "web-funnel" cũng ra đúng người.
      return !k || n.tim.includes(k);
    });
    // 👑 Ghim luôn đứng ĐẦU, kể cả khi đang lọc theo phòng khác.
    return loc.sort((a, b) => Number(b.ghim ?? false) - Number(a.ghim ?? false));
  }, [nhanSu, phongChon, tuKhoa]);

  /* ---------- Cuộn xuống đáy — CHỈ ô nào vừa có chữ mới ----------
   *
   * 🐛 FAIL ① (Hermes 30/08): độ dài mảng đổi vì HAI nguyên nhân trái ngược nhau,
   *    mà dấu vết ở đây ⛔ phân biệt được:
   *      · tin MỚI về            ⇒ ĐÚNG là phải xuống đáy
   *      · nối phần CŨ vào đầu   ⇒ SAI hoàn toàn: Owner bấm để ĐỌC PHẦN CŨ mà bị ném
   *                                 xuống tin mới nhất ⇒ tính năng thành VÔ DỤNG.
   * ✅ Nên `keoThem` để lại một cái NEO trước khi nối; thấy neo thì giữ chỗ đọc, ⛔ xuống đáy.
   *    ⛔ Gỡ hẳn lệnh xuống đáy — tin mới về thì vẫn phải xuống.
   */
  dungTruocKhiVe(() => {
    dsO.forEach((o, i) => {
      const cuoi = o.tin[o.tin.length - 1];
      const dau = `${o.tin.length}:${cuoi ? cuoi.chu.length : 0}`;
      if (dau === dauVetCuon.current[i]) return;
      dauVetCuon.current[i] = dau;
      const b = bangTinRefs.current[i];
      if (!b) return;
      const neo = neoKeo.current[i];
      if (neo) {
        // 🔑 Tiêu neo TRƯỚC khi dùng — lỡ dòng dưới ném lỗi thì neo cũ ⛔ nằm lại
        //    để cướp nhầm lần cuộn sau.
        delete neoKeo.current[i];
        // Phần cũ đẩy nội dung xuống đúng bằng (cao_sau − cao_truoc) ⇒ cộng bù thì
        // mắt người đọc đứng NGUYÊN chỗ cũ.
        b.scrollTop = neo.top + (b.scrollHeight - neo.cao);
        return;
      }
      b.scrollTop = b.scrollHeight;
    });
  }, [dsO]);

  /* Đổi bố cục → ô cao thấp khác nhau, phải neo lại đáy hội thoại. */
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      bangTinRefs.current.forEach((b) => { if (b) b.scrollTop = b.scrollHeight; });
    });
    return () => cancelAnimationFrame(t);
  }, [boCuc]);

  /**
   * 📷 GHI NHỚ ô nào đang ở đáy — gọi NGAY TRƯỚC khi bấm phóng to / thu lại.
   * ⚠️ Ô đang ẨN (`clientHeight` = 0) thì GIỮ NGUYÊN giá trị cũ, ⛔ ghi đè:
   *    lúc thu lại chỉ còn MỘT ô nhìn thấy được, năm ô kia phải giữ trạng thái đã ghi
   *    từ lúc phóng to. Ghi đè ở đây là xoá mất đúng thứ mình cần.
   */
  const ghiNhoDay = useCallback(() => {
    bangTinRefs.current.forEach((b, i) => {
      if (!b || b.clientHeight === 0) return;
      oODay.current[i] = b.scrollHeight - b.scrollTop - b.clientHeight <= LECH_COI_LA_DAY;
    });
  }, []);


  /* ---------- Nạp danh sách phiên thật của một ô ---------- */
  /**
   * 🔴 THỨ NẶNG NHẤT CẢ BUỔI (Hermes vòng 4) — hàm này từng biến LỖI ĐỌC thành PHÉP XOÁ THẬT.
   *
   * Bản cũ: mọi lỗi ⇒ `dsPhien: []` rồi TRẢ VỀ `[]`. Người gọi ở đường ĐỔI GHẾ dùng chính
   * mảng rỗng đó kết luận «ghế này ⛔ có phiên nào» rồi gọi `ghiO(…, null, true)`
   * ⇒ **RỚT MẠNG lúc liệt kê phiên = XOÁ LIÊN KẾT PHIÊN trên máy chủ.**
   *
   * ⚠️ Khác hẳn mọi lỗi khác hôm nay: mấy cái kia xoá thứ đang HIỂN THỊ (tải lại là về);
   *    cái này **GHI MỘT PHÉP XOÁ XUỐNG SỔ** — ⛔ lấy lại được.
   * 📌 Cùng lớp bệnh với lỗi sống 13 ngày: **⛔ đọc được ⇒ coi là RỖNG ⇒ ghi xoá thật.**
   *
   * ✅ Chữa: trả `null` khi ⛔ đọc được, `[]` khi máy chủ THẬT SỰ nói rỗng. Hai thứ đó
   *    ⛔ được phép trông giống nhau nữa — người gọi buộc phải phân biệt.
   */
  const napDsPhien = useCallback(async (i: number, ten: string): Promise<TomTatPhien[] | null> => {
    try {
      const r = await fetch(`/api/phien?ma_o=${maOCua(i)}&ma_nhan_su=${encodeURIComponent(ten)}`);
      if (!r.ok) throw new Error(`máy chủ trả ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j.phien)) throw new Error('máy chủ ⛔ trả về danh sách phiên');
      capNhat(i, { dsPhien: j.phien as TomTatPhien[] });
      return j.phien as TomTatPhien[];
    } catch {
      // GIỮ NGUYÊN dsPhien đang có. ⛔ đặt [] — [] nghĩa là «⛔ có phiên», mà ta ⛔ biết điều đó.
      return null;
    }
  }, [capNhat]);

  /**
   * 🧹 LỌC DANH SÁCH TIN — **MỘT chốt, dùng ở MỌI đường**.
   *
   * 🐛 Hai lượt liền tôi khai «đã kiểm hình dạng dữ liệu» trong khi chốt chỉ nằm ở MỘT đường.
   *    Hermes bắt cả hai lần. Nay tách hàm ra để **⛔ thể khai rộng hơn cái mình làm** —
   *    ai muốn biết có mấy đường được che thì đếm chỗ gọi `locTin`, ⛔ phải tin lời tôi.
   * ⚠️ Kiểm TỪNG PHẦN TỬ, ⛔ chỉ kiểm cái hộp: thân `{lich_su:[null]}` là mảng HỢP LỆ,
   *    lọt qua `Array.isArray` rồi VỠ lúc vẽ.
   */
  /**
   * 🎫 MÃ YÊU CẦU THEO Ô — chữa FAIL 7 (Hermes lần 3).
   *
   * 🐛 Bệnh: nhiều lần gọi dùng CHUNG một biến `dangNap`. Lần nào về TRƯỚC cũng hạ cờ,
   *    dù lần kia còn đang bay ⇒ vòng xoay tắt sớm, và phản hồi tới sau vẫn được nhận.
   * ✅ Mỗi lần gọi lấy một mã. Chỉ mã MỚI NHẤT được quyền ghi kết quả và hạ cờ.
   *    ⛔ dùng AbortController vì ta ⛔ CẦN huỷ mạng — ta chỉ cần **bỏ qua kết quả cũ**,
   *    và một con số so sánh thì rẻ hơn, ⛔ đẻ thêm đường lỗi mới.
   */
  const maYeuCau = useRef<number[]>([]);
  const xinMaMoi = useCallback((i: number) => {
    maYeuCau.current[i] = (maYeuCau.current[i] ?? 0) + 1;
    return maYeuCau.current[i];
  }, []);
  const conMoiNhat = useCallback((i: number, ma: number) => maYeuCau.current[i] === ma, []);

  const locTin = useCallback((th: unknown): Tin[] => {
    /**
     * 🐛 Hermes vòng 4: bản trước **LỌC** — thân `{lich_su:[null]}` bị lọc thành `[]`
     *    rồi VẪN được gán ⇒ **vẫn XOÁ TRẮNG lịch sử**, chỉ là xoá một cách lịch sự hơn.
     * ✅ Phải **BÁC**: thấy một phần tử hỏng ⇒ coi CẢ phản hồi là hỏng ⇒ ném lỗi
     *    ⇒ khối `catch` giữ nguyên tin đang có.
     * 📌 Lọc là «tôi tự sửa dữ liệu của anh»; bác là «dữ liệu anh sai, tôi ⛔ dùng».
     *    Với lịch sử hội thoại, tự sửa **⛔ bao giờ** đúng.
     */
    if (!Array.isArray(th)) throw new Error('máy chủ ⛔ trả về danh sách tin');
    for (const t of th) {
      const ok = !!t && typeof t === 'object' &&
        typeof (t as Tin).chu === 'string' &&
        ((t as Tin).ai === 'toi' || (t as Tin).ai === 'ho');
      if (!ok) throw new Error('danh sách tin có phần tử hỏng — BÁC cả phản hồi');
    }
    // 🔑 Đóng dấu mã NGAY TẠI CỬA VÀO — mọi tin trong bộ nhớ đều phải có mã.
    // 📜 Đóng dấu «đến từ lịch sử» NGAY TẠI CỬA VÀO — đây là chỗ DUY NHẤT tin từ máy chủ đi qua.
    return (th as Tin[]).map((t) => ({ ...t, ma: datMa(), tuLichSu: true }));
  }, []);

  /**
   * 🚪 CỬA ĐỌC LỊCH SỬ — **MỘT chỗ duy nhất** gọi `/api/phien` để lấy lịch sử.
   *
   * 🐛 Vì sao phải có: 5 vòng soi, điểm ⛔ hội tụ (3/7 → 5/7 → 2/7 → 1/7 → 2/7).
   *    Mỗi vòng vá đúng chỗ được chỉ rồi lộ chỗ KẾ BÊN — vì chốt nằm RẢI RÁC ở 4 nơi,
   *    và tôi phải NHỚ mới khai đúng. Tôi khai rộng hơn việc làm **4 lần**, cả bốn đều
   *    vì lý do đó.
   * ✅ Có một cửa thì **số đường ĐẾM ĐƯỢC**, ⛔ cần ai nhớ. Đây là luật «khai chốt kèm
   *    SỐ ĐƯỜNG» của tôi, nhưng ép vào MÃ thay vì vào LỜI KHAI.
   *
   * ⚠️ NHỊP A: hàm này **⛔ đổi hành vi một dòng nào** — nó gom đúng thứ 4 đường đang làm.
   *    Mọi phép đo cũ phải ra Y SỐ CŨ. Lệch một số = đã đổi hành vi = nhịp A hỏng.
   *    Việc kiểm mã yêu cầu vẫn để NGƯỜI GỌI lo: đó là trạng thái của Ô, ⛔ phải của cửa.
   */
  const docLichSu = useCallback(
    async (
      ten: string,
      maPhien: string,
      truocByte?: number,
      conHieuLuc?: () => boolean,
    ): Promise<{ tin: Tin[]; conNua: boolean; viTri: number; catDai: boolean } | null> => {
      const q =
        `/api/phien?ma_nhan_su=${encodeURIComponent(ten)}&ma_phien=${encodeURIComponent(maPhien)}` +
        (truocByte === undefined ? '' : `&truoc_byte=${truocByte}`);
      const r = await fetch(q);
      if (!r.ok) throw new Error(`máy chủ trả ${r.status}`);
      /**
       * 🐛 Hermes vòng 6: bản nhịp A đầu của tôi parse JSON + locTin **TRƯỚC** chốt lỗi-thời.
       *    Bản CHA bỏ phản hồi lỗi-thời TRƯỚC khi parse ⇒ phản hồi lỗi-thời có JSON hỏng
       *    trước thì **im lặng bị bỏ**, sau thì **SINH THÔNG BÁO LỖI NHÌN THẤY**.
       *    Đó là ĐỔI HÀNH VI — đúng thứ nhịp A cấm.
       * ✅ Chốt vào TRONG cửa, chạy ngay sau fetch. Trả `null` (⛔ ném lỗi) để người gọi
       *    `return` im lặng Y NHƯ bản cha — ném lỗi là rơi vào catch, và catch của resume
       *    có sinh chẩn đoán nhìn thấy được.
       */
      if (conHieuLuc && !conHieuLuc()) return null;
      const j = await r.json();
      return {
        tin: locTin(j.lich_su), // locTin BÁC khi hình dạng sai — ⛔ lọc
        conNua: !!j.con_nua,
        viTri: Number(j.vi_tri) || 0,
        catDai: !!j.cat_dong_qua_dai,
      };
    },
    [locTin],
  );


  /* ---------- Nạp LỊCH SỬ THẬT của một phiên vào một ô ---------- */
  const napLichSu = useCallback(async (i: number, ten: string, maPhien: string) => {
    const ma = xinMaMoi(i);
    capNhat(i, { dangNap: true });
    try {
      const kq = await docLichSu(ten, maPhien, undefined, () => conMoiNhat(i, ma));
      if (!kq) return; // lỗi thời ⇒ bỏ im lặng
      /**
       * 🐛 ĐÂY LÀ CHỖ XOÁ LỊCH SỬ ĐANG SỐNG TRÊN MÁY OWNER — có từ `d359bb6` 17/08.
       *    Ba lỗi trong một hàm: ⛔ kiểm `r.ok` · `isArray(…) : []` biến thân lỗi thành RỖNG ·
       *    `catch { tin: [] }` xoá sạch khi rớt mạng. **5 đường vào** gọi hàm này
       *    (mở ô · Nạp lại · đổi phiên · fork · resume) — nặng hơn hẳn `keoThem` (1 đường).
       * 📌 Tôi đã vá đúng mẫu này ở `keoThem` rồi yên tâm — nhưng `keoThem` là mã CHƯA
       *    BAO GIỜ CHẠY. Cái cắn Owner nằm ở đây, và tôi đứng ngay cạnh mà ⛔ nhìn sang.
       */

      /**
       * 🐛 Hermes vòng 4: bốn đường gọi đều đặt `phienHienTai` **TRƯỚC** khi đọc.
       *    Đọc lỗi ⇒ lịch sử phiên CŨ nằm dưới mã phiên MỚI — app hiện một thứ **⛔ có thật**.
       * ✅ Chữa tại GỐC: `phienHienTai` và `tin` phải đi CÙNG MỘT NHỊP. Nay chính hàm đọc
       *    đặt cả hai, và chỉ khi ĐỌC ĐƯỢC. Bốn nơi gọi ⛔ đặt trước nữa.
       * 📌 Hai giá trị phải-luôn-khớp thì ⛔ được để hai chỗ khác nhau đặt.
       */
      capNhat(i, {
        phienHienTai: maPhien,
        tin: kq.tin,
        noiTiep: true,
        conNua: kq.conNua,
        viTri: kq.viTri,
        catDongDai: kq.catDai,
      });
    } catch {
      /* GIỮ NGUYÊN tin đang có — ⛔ BAO GIỜ gán tin: [] ở đây. */
    } finally {
      // Chỉ lần gọi MỚI NHẤT được hạ cờ — ⛔ thì vòng xoay tắt trong khi lần kia còn bay.
      if (conMoiNhat(i, ma)) capNhat(i, { dangNap: false });
    }
  }, [capNhat, docLichSu, xinMaMoi, conMoiNhat]);

  /**
   * ⬆️ KÉO THÊM PHẦN CŨ HƠN — đi bằng CON TRỎ, mỗi lần một trang.
   *
   * 🔄 ĐỔI SO VỚI BẢN TRƯỚC: bản trước NỚI cửa sổ rồi THAY TRỌN mảng. Nay các trang
   *    **⛔ đè lên nhau** (trang cũ nằm hẳn TRƯỚC con trỏ) ⇒ phải **NỐI VÀO ĐẦU**,
   *    và nối thế **⛔ đẻ tin trùng**. Chú thích cũ dặn «thay trọn, ⛔ nối» — nay SAI, đã bỏ.
   */
  const keoThem = useCallback(async (i: number, ten: string, maPhien: string, viTri: number) => {
    const o0 = dsORef.current[i];
    if (!o0 || o0.dangChay || o0.dangNap || viTri <= 0) return;
    const ma = xinMaMoi(i);
    capNhat(i, { dangNap: true });
    try {
      // 🔴 CHỐT NÀY BẢN CHA CÓ (:618) mà nhịp A đầu của tôi ĐÁNH RƠI — Hermes vòng 6 bắt.
      //    Rơi chốt = yêu cầu cũ về sau VẪN ghi được đè lên kết quả mới.
      const kq = await docLichSu(ten, maPhien, viTri, () => conMoiNhat(i, ma));
      if (!kq) return; // lỗi thời ⇒ bỏ im lặng, Y NHƯ bản cha
      const sach = kq.tin;
      /**
       * 🐛 Hermes chỉ ra race CÒN SÓT (có TỪ TRƯỚC, ⛔ do lượt này): chốt «đang chảy» chỉ
       * kiểm TRƯỚC khi gọi. Bấm xong rồi gửi câu mới thì phản hồi cũ về sau sẽ ĐÈ.
       * ⇒ Kiểm LẠI lúc phản hồi về: đổi phiên, hoặc đã bắt đầu chảy chữ ⇒ VỨT phản hồi này.
       */
      const o1 = dsORef.current[i];
      /**
       * 🐛 FAIL 1 (Hermes lần 3): chốt cũ kiểm «cùng phiên + chưa chảy chữ» nhưng **⛔ kiểm
       *    CON TRỎ**. Ca thủng: kéo trang cũ ở con trỏ S → giữa chừng «Nạp lại» chạy, đặt
       *    con trỏ mới S′ > S → phản hồi cũ VẪN được nối vào ⇒ **THỦNG khoảng [S, S′)**.
       *    Lỗi là **MẤT ĐOẠN**, ⛔ phải tin trùng — nên ⛔ ai thấy, chỉ là lịch sử khuyết.
       * ✅ Con trỏ đổi = nền dưới chân đã đổi ⇒ phản hồi này VÔ GIÁ TRỊ, vứt.
       *    ⛔ cố ghép lại: ghép sai còn tệ hơn ⛔ ghép, vì trông như đủ.
       */
      if (!o1 || o1.phienHienTai !== maPhien || o1.dangChay || o1.viTri !== viTri) return;
      /**
       * 📌 ĐO NGAY TRƯỚC KHI NỐI — sau khi nối thì `scrollHeight` đã là số MỚI, ⛔ còn gì để trừ.
       * ⚠️ Chỉ đặt neo khi THẬT SỰ có tin nối vào: `sach` rỗng thì độ dài ⛔ đổi ⇒ hiệu ứng
       *    cuộn ⛔ chạy tới nhánh tiêu neo ⇒ neo sẽ nằm lại và cướp nhầm lần cuộn sau.
       */
      const bang = bangTinRefs.current[i];
      if (bang && sach.length > 0) {
        neoKeo.current[i] = { top: bang.scrollTop, cao: bang.scrollHeight };
      }
      capNhat(i, {
        tin: [...sach, ...o1.tin],
        conNua: kq.conNua,
        viTri: kq.viTri,
        // 🔴 CỘNG DỒN, ⛔ ghi đè: trang trước đọc hụt thì cảnh báo phải Ở LẠI.
        catDongDai: o1.catDongDai || kq.catDai,
      });
    } catch {
      /* GIỮ NGUYÊN tin đang có — ⛔ BAO GIỜ gán tin: [] ở đây. */
      /**
       * 🧹 TIÊU NEO KHI HỎNG (ghế soi nêu 30/08). Neo đặt ở trên; nếu `capNhat` ném lỗi thì
       *    `tin` ⛔ đổi ⇒ dấu vết cuộn ⛔ đổi ⇒ hiệu ứng cuộn ⛔ chạy tới nhánh tiêu neo
       *    ⇒ neo NẰM LẠI và CƯỚP lần cuộn sau (tin mới về mà bị kéo lên giữa hội thoại).
       *    Hỏng im lặng: ⛔ báo lỗi, ⛔ ai thấy, chỉ Owner thấy khung nhảy bậy.
       * 📌 Xoá cái ⛔ có là vô hại — `delete` trên khoá ⛔ tồn tại ⛔ ném lỗi.
       */
      delete neoKeo.current[i];
    } finally {
      if (conMoiNhat(i, ma)) capNhat(i, { dangNap: false });
    }
  }, [capNhat, docLichSu, xinMaMoi, conMoiNhat]);

  /**
   * 🔄 NẠP LẠI đoạn chat của MỘT ô — "F5 riêng cho ô này" (Owner 18/08).
   *
   * Vì sao cần: ghế ghi thêm tin từ chỗ khác (cổng đánh thức · terminal · ghế khác gọi sang)
   * thì trang đang mở ⛔ KHÔNG tự biết. Trước đây muốn thấy phải tải lại CẢ trang —
   * mà tải cả trang thì MỌI ô cùng nạp lại, và câu đang gõ dở ở ô khác bay mất.
   *
   * 🔒 BỐN CHỐT (mỗi cái là một đường hỏng đã được nêu trước khi gõ):
   *   ① `o.dangChay` ⇒ ⛔ KHÔNG nạp. Nạp giữa lúc chữ đang chảy = đè mất khúc vừa về.
   *      Chốt ở CẢ hai đầu: nút bị khoá, và hàm này tự chặn lần nữa (nút khoá vẫn có thể
   *      bị gọi bằng bàn phím / lệnh, ⛔ đừng tin mỗi lớp giao diện).
   *   ② ⛔ KHÔNG đụng `soan` và `hangCho` ⇒ câu Owner đang gõ dở và hàng chờ CÒN NGUYÊN.
   *      Được miễn phí vì `capNhat` là GỘP (`{...o, ...vá}`), ⛔ không phải thay cả ô.
   *   ③ ⛔ TUYỆT ĐỐI ⛔ không đụng `daKhoiPhuc` — nó là ref DÙNG CHUNG, chỉ cho khôi phục
   *      MỘT LẦN lúc mở app. Đụng vào là lần mở sau khôi phục sai.
   *   ④ Nạp ĐÚNG ô được bấm: lấy chỉ số `i` truyền vào, ⛔ KHÔNG dùng ô đang chọn (`tieuDiem`).
   *
   * ✅ ⛔ KHÔNG ghi sổ ô: `napLichSu` chỉ gọi `capNhat`, ⛔ không hề POST `/api/o`.
   *    (Đã đọc tận nơi trước khi gõ — vì ca chiều 18/08 mất liên kết ô 2 đúng vì một chỗ ghi sổ ngoài ý.)
   */
  const napLaiChat = useCallback(async (i: number) => {
    const o = dsORef.current[i];
    // ⚠️ FAIL 7: thêm `dangNap` — bấm «Nạp lại» lúc còn lần gọi đang bay thì đẻ hai lần gọi
    //    chồng nhau, lần về trước hạ cờ của lần kia.
    if (!o?.ns || !o.phienHienTai || o.dangChay || o.dangNap) return;
    await napLichSu(i, o.ns.ten, o.phienHienTai);
  }, [napLichSu]);

  /**
   * Ghi sổ ô. `xoaLienKet` = KHAI Ý ĐỊNH xoá mã phiên đang có.
   * ⚠️ Máy chủ CHẶN ghi mã phiên rỗng lên ô đang có phiên nếu ⛔ không khai cờ này —
   * vì ca 17/08: đọc sổ thất bại ⇒ client tưởng sổ trắng ⇒ xoá liên kết THẬT của Owner.
   * ⇒ Chỉ truyền true ở nơi Owner THẬT SỰ muốn bỏ phiên (đóng ô · phiên mới · ghế chưa có phiên).
   */
  const ghiO = useCallback(async (i: number, ten: string | null, maPhien: string | null, xoaLienKet = false) => {
    await fetch('/api/o', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ma_o: maOCua(i), ma_nhan_su: ten, ma_phien: maPhien, xoa_lien_ket: xoaLienKet }),
    });
  }, []);

  /**
   * 🛑 DỪNG THẬT việc đang chạy của một ô.
   *
   * VÌ SAO CÓ HÀM NÀY (17/08/2026): trước đây "dừng" xảy ra khi TRÌNH DUYỆT rời đi —
   * đóng tab, khoá màn, rớt wifi đều giết `claude`. Owner tắt trình duyệt là mất
   * việc đang chạy dở. Nay việc chạy tiếp dù ⛔ không ai xem ⇒ phải có đường DỪNG
   * bằng Ý ĐỊNH RÕ RÀNG, ⛔ nếu không thì gỡ một lỗi mà mất luôn cái phanh.
   */
  const dungViec = useCallback(async (i: number) => {
    huyLuong(i);                       // cắt đường xem trước cho khỏi chảy thêm chữ
    capNhat(i, { dangChay: false });
    try {
      await fetch('/api/dung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_o: maOCua(i) }),
      });
    } catch { /* mạng chập ⇒ bấm lại; ⛔ đừng doạ người dùng bằng lỗi đỏ */ }
  }, [huyLuong, capNhat]);

  /* ---------- Khôi phục nguyên trạng: bố cục + tiêu điểm + phiên TỪNG Ô ---------- */
  useEffect(() => {
    if (daKhoiPhuc.current) return;
    daKhoiPhuc.current = true;

    // Bố cục + tiêu điểm chỉ là chuyện giao diện ⇒ để ở localStorage.
    try {
      const bc = Number(localStorage.getItem(KHOA_BO_CUC));
      if (bc === 1 || bc === 2 || bc === 4 || bc === 6) datBoCuc(bc);
      const td = Number(localStorage.getItem(KHOA_TIEU_DIEM));
      if (Number.isInteger(td) && td >= 0 && td < SO_O && td < (bc === 2 || bc === 4 || bc === 6 ? bc : 1)) {
        datTieuDiemThuan(td);
      }
    } catch { /* chế độ riêng tư → dùng mặc định */ }

    (async () => {
      let so: Record<string, { ma_nhan_su?: string | null; ma_phien?: string | null }> = {};
      /**
       * 🔴 GỐC LỖI 17/08 NẰM Ở ĐÂY (⛔ đừng quay lại kiểu cũ).
       * Bản cũ: đọc sổ thất bại → `catch` coi như SỔ TRẮNG → ô 1 thấy "sổ ghi người
       * khác" → ghi lại với mã phiên rỗng ⇒ XOÁ liên kết ĐÚNG của Owner.
       * Mà đọc thất bại là chuyện thường: máy chủ đang khởi động lại · wifi LAN chập ·
       * Safari treo tab nền.
       * ⇒ Luật: KHÔNG ĐỌC ĐƯỢC SỔ thì ⛔ KHÔNG SUY GÌ, và ⛔ TUYỆT ĐỐI không ghi.
       */
      let docSoOk = false;
      for (let lan = 0; lan < 2 && !docSoOk; lan++) {
        if (lan > 0) await new Promise((r) => setTimeout(r, 1500)); // chập một nhịp thì thử lại
        try {
          const r = await fetch('/api/o');
          const j = await r.json();
          so = j?.o ?? {};
          docSoOk = true;
        } catch { /* thử lần nữa */ }
      }
      if (!docSoOk) {
        daKhoiPhuc.current = false; // cho lần mở sau khôi phục lại
        return;                    // ⛔ chưa biết sổ ghi gì thì ⛔ không được sửa sổ
      }

      /**
       * 🏃 HỎI MÁY CHỦ «Ô NÀO ĐANG CHẠY» — nguồn sự thật nằm ở MÁY CHỦ, ⛔ ở trang.
       *
       * 🐛 Bệnh (P0-7/P1-7): cờ «đang chạy» sống trong bộ nhớ TRANG. Owner bấm F5 là mất,
       *    và mất theo nó là **NÚT DỪNG** — ⛔ còn cách nào chặn một ghế đang tiêu tiền.
       * ⚠️ ĐỀ BÀI CHỈ SAI CHỖ, tôi làm đúng Ý nhưng đặt đúng NƠI:
       *    đề ghi «đổi cờ-đang-chạy về false ở :1453». Nhưng ba chỗ mang chuỗi ấy đều ⛔ phải khối này —
       * 🔤 (Chú thích này CỐ Ý ⛔ viết nguyên chuỗi cần đếm. Ghế soi đo 31/08: viết nguyên vào
       *    chú thích thì mọi phép ĐẾM CHUỖI ra 4 thay vì 3, và người sau đi tìm chỗ thứ tư ⛔ có.
       *    Họ hàng với bẫy «bộ rút gọn đổi hình dạng câu lệnh» — thước dính vào thứ ⛔ phải mã.)
       *      :300  giá trị khởi tạo ô TRỐNG      · :863 lúc CHỦ ĐỘNG dừng
       *      :1453 lúc chảy chữ XONG (hạ cờ)     ← đổi chỗ này là hạ cờ sai lúc kết thúc lượt
       *    Khối khôi phục ⛔ HỀ đặt cờ-đang-chạy — nó thừa hưởng giá trị sai từ mặc định.
       * 🔤 (Chú thích này CỐ Ý ⛔ viết nguyên chuỗi «cờ hạ» ở dạng mã — ghế soi đo 31/08:
       *    viết nguyên vào chú thích thì mọi phép ĐẾM CHUỖI đều ra 4 thay vì 3, và người sau
       *    đi tìm một chỗ thứ tư ⛔ tồn tại. Bẫy họ hàng với «bộ rút gọn đổi hình dạng câu lệnh».)
       *    ⇒ Phải THÊM ở đây, và ⛔ đụng vào cả ba chỗ kia. (Đúng dặn dò «chỉ một chỗ».)
       * 🛟 Hỏng cửa này ⇒ coi như ⛔ ai chạy, y như trước. ⛔ để một lỗi mạng chặn cả việc khôi phục.
       */
      let dangChayTheoO = new Set<string>();
      /**
       * 🔴 HAI LOẠI RỖNG, ⛔ được gộp làm một (ghế soi bắt 31/08 — lỗ do CHÍNH TÔI đào):
       *      rỗng vì THẬT SỰ ⛔ ai chạy    ⇒ hiện rảnh là ĐÚNG
       *      rỗng vì ⛔ HỎI ĐƯỢC cửa      ⇒ hiện rảnh là NÓI DỐI, và nó **lấy mất nút Dừng**
       *                                     trên một ô đang chạy thật
       * 🕳 Tôi thêm `so_o_dang_chay` ở cổng CHỈ để phân biệt hai loại đó, rồi bên đọc
       *    (chính đây) **⛔ hề dùng tới**. Hai đầu của một hợp đồng ⛔ khớp nhau.
       *    Đúng con bệnh P0-7 đang chữa — «giao diện nói dối và lấy mất cái phanh» — chỉ khác lối vào.
       * ✅ Nay: hỏng thì VẪN khôi phục (⛔ chặn), nhưng phải NÓI RA.
       */
      let hoiDuocAiChay = false;
      try {
        const rc = await fetch('/api/dung');
        if (rc.ok) {
          const jc = await rc.json();
          // ⚠️ Đòi CẢ HAI trường mới coi là hỏi được. Chỉ có mảng thì ⛔ phân biệt được
          //    «cửa mới trả rỗng» với «cửa CŨ ⛔ có trường đó» — lại một loại rỗng thứ ba.
          if (Array.isArray(jc?.dang_chay) && typeof jc?.so_o_dang_chay === 'number') {
            hoiDuocAiChay = true;
            dangChayTheoO = new Set(
              (jc.dang_chay as Array<{ ma_o?: unknown }>)
                .map((v) => (typeof v?.ma_o === 'string' ? v.ma_o : ''))
                .filter(Boolean),
            );
          }
        }
      } catch { /* ⛔ hỏi được thì thôi — lùi về «⛔ ai chạy», ⛔ chặn khôi phục */ }
      datChuaBietAiChay(!hoiDuocAiChay);

      const daDung = new Set<string>();
      for (let i = 0; i < SO_O; i++) {
        const ghi = so[maOCua(i)];
        // 👑 Ô 1 LUÔN là TỔNG GIÁM ĐỐC — sổ ghi ai cũng KHÔNG đổi được điều đó.
        const ten = i === 0 ? (ongTrum?.ten ?? null) : (ghi?.ma_nhan_su ?? null);
        if (!ten) continue;
        const ns = nhanSu.find((x) => x.ten === ten);
        // ⛔ Không nhân bản một agent ra nhiều ô — ô sau trùng thì bỏ trống + xoá sổ.
        if (!ns || daDung.has(ten)) { if (i > 0) void ghiO(i, null, null); continue; }
        daDung.add(ten);
        // 🏃 Đặt cờ theo SỰ THẬT ở máy chủ, ⛔ mặc định false nữa.
        //    Ghế đang chạy ⇒ nút Dừng hiện lại + đèn nháy lại, mà Owner ⛔ phải gõ gì.
        capNhat(i, { ns, dangChay: dangChayTheoO.has(maOCua(i)) });
        void napDsPhien(i, ten);

        const khopNguoi = ghi?.ma_nhan_su === ten;
        if (khopNguoi && ghi?.ma_phien) {
          // ⚠️ ⛔ đặt phienHienTai ở đây — napLichSu tự đặt CÙNG NHỊP với tin
          void napLichSu(i, ten, ghi.ma_phien);
        } else if (!khopNguoi) {
          // Ô 1 vừa bị ép về TỔNG GIÁM ĐỐC mà sổ đang ghi người khác → ghi lại cho khớp.
          void ghiO(i, ten, null);
        }
      }
    })();
  }, [nhanSu, ongTrum, capNhat, napDsPhien, napLichSu, ghiO]);

  /* ---------- Đổi bố cục ---------- */
  function doiBoCuc(bc: 1 | 2 | 4 | 6) {
    datBoCuc(bc);
    try { localStorage.setItem(KHOA_BO_CUC, String(bc)); } catch { /* bỏ qua */ }
    if (tieuDiem >= bc) datTieuDiem(0);
    datNhacO1('');
  }

  /* ---------- Phím 1–4 nhảy tiêu điểm ---------- */
  useEffect(() => {
    function bam(e: KeyboardEvent) {
      const t = document.activeElement;
      // ⛔ Đang gõ trong ô nhập thì số 1–6 là CHỮ, không phải phím tắt.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '6') {
        const i = Number(e.key) - 1;
        if (i < boCuc) { e.preventDefault(); datTieuDiem(i); }
      }
    }
    document.addEventListener('keydown', bam);
    return () => document.removeEventListener('keydown', bam);
  }, [boCuc, datTieuDiem]);

  /* ---------- Nạp một nhân sự vào MỘT ô ---------- */
  const datNguoi = useCallback(async (i: number, n: NhanSu) => {
    if (i === 0) return; // 👑 LUẬT CỨNG: ⛔ không đổi được agent của ô 1.

    datAnKhu(false); // màn hẹp: chọn người xong thì mở khu trao đổi ra

    // Đã mở ở ô khác đang hiện → chuyển tiêu điểm, ⛔ không mở trùng.
    const trung = dsORef.current.findIndex((o, k) => k < boCuc && k !== i && o.ns?.ten === n.ten);
    if (trung !== -1) { datTieuDiem(trung); return; }

    huyLuong(i); // ⛔ cắt luồng cũ trước khi đổi người
    capNhat(i, {
      ...O_TRONG, ns: n,
    });
    datTieuDiem(i);

    const ds = await napDsPhien(i, n.ten);
    /**
     * 🔴 `null` = ⛔ ĐỌC ĐƯỢC, **⛔ phải «⛔ có phiên»**. Hai thứ đó khác nhau một trời:
     *    đoán nhầm hướng này là ghi một phép XOÁ THẬT xuống sổ ô.
     * ⇒ ⛔ đọc được thì DỪNG, giữ nguyên mọi thứ, để Owner thử lại.
     */
    if (ds === null) {
      /**
       * 🐛 LỜI NHẮN CŨ NÓI DỐI — và chính tôi viết ra nó (Hermes vòng 5 bắt).
       *    Tôi ghi «⛔ đổi gì cả», nhưng ngay phía TRÊN (huyLuong + O_TRONG + datTieuDiem)
       *    ô đã bị **xoá trắng và đổi sang ghế mới rồi**. Owner nhìn màn hình thấy ĐÃ ĐỔI
       *    mà app bảo chưa — tệ hơn im lặng, vì nó dạy Owner ⛔ tin lời app.
       * ⚠️ Sửa ĐÚNG phải là **đọc danh sách TRƯỚC, đổi ô SAU** — nhưng đó là đảo thứ tự,
       *    thuộc nhịp B mà `claude-aiboss-app-pm` CHƯA gật. Lượt này chỉ cho lời nhắn
       *    NÓI THẬT, ⛔ đụng hành vi. Ghi rõ ở đây để nhịp B ⛔ quên chỗ này.
       */
      capNhat(i, {
        loiDan:
          '⚠️ Đã chuyển ô sang ghế này, nhưng ⛔ đọc được danh sách phiên (mạng hoặc máy chủ). ' +
          'Lịch sử CHƯA nạp — bấm «Nạp lại» khi mạng ổn, hoặc chọn phiên bằng tay.',
      });
      return;
    }
    // Mặc định NỐI LẠI phiên gần nhất còn nối được — ⛔ không mặc định đẻ phiên mới.
    const ganNhat = ds.find((p) => !p.dang_chay);
    if (ganNhat) {
      // ⚠️ ⛔ đặt phienHienTai ở đây — napLichSu tự đặt CÙNG NHỊP với tin
      await ghiO(i, n.ten, ganNhat.ma);
      await napLichSu(i, n.ten, ganNhat.ma);
      return;
    }
    await ghiO(i, n.ten, null, true); // ý định THẬT: ghế này chưa có phiên nào nối được
  }, [boCuc, capNhat, datTieuDiem, ghiO, huyLuong, napDsPhien, napLichSu]);

  /* ---------- Bấm một tên ở cột giữa → nạp vào Ô ĐANG TIÊU ĐIỂM ---------- */
  function chonNhanSu(n: NhanSu) {
    datAnKhu(false);
    if (tieuDiem === 0) {
      // 👑 Ô 1 là TỔNG GIÁM ĐỐC. Có ô trống khác đang hiện thì dùng ô đó, không thì nói thẳng.
      const trong = dsO.findIndex((o, k) => k > 0 && k < boCuc && !o.ns);
      if (trong === -1) {
        datNhacO1(boCuc === 1
          ? 'Ô 1 là TỔNG GIÁM ĐỐC — bấm nút 2 ô / 4 ô để có chỗ cho agent khác'
          : 'Ô 1 là TỔNG GIÁM ĐỐC — bấm vào ô 2/3/4 rồi chọn lại');
        return;
      }
      void datNguoi(trong, n);
      return;
    }
    void datNguoi(tieuDiem, n);
  }

  /* ---------- Bỏ trống một ô (⛔ ô 1 không có nút này) ---------- */
  async function dongO(i: number) {
    if (i === 0) return;
    huyLuong(i);
    capNhat(i, { ...O_TRONG });
    await ghiO(i, null, null);
  }

  /* ---------- 🎛 NẠP MỘT BỘ GHẾ vào 6 ô (menu «Giao diện») ----------
   *
   * Owner 20/08: một menu chọn giao diện — «ghế hiện tại» và «phòng marketing
   * load sẵn các ghế vào các ô». Dùng cho lớp: cần cảnh 6 ô có ghế để quay.
   *
   * ♻️ DÙNG LẠI `datNguoi` + `dongO`, ⛔ KHÔNG viết đường ghi sổ mới.
   *    Lý do quan trọng: `datNguoi` đã xử đúng phần khó nhất — nó **NỐI LẠI PHIÊN
   *    GẦN NHẤT** của ghế mới rồi nạp lịch sử. ⇒ đổi ghế ⛔ KHÔNG mất lịch sử chat.
   *    (Bẫy ④: tôi ĐỌC `ghiO`/`xoa_lien_ket` trước khi gõ. `ghiO(..., true)` chỉ được
   *    gọi khi ghế mới ⛔ CHƯA có phiên nào nối được — đó là ý định THẬT, ⛔ không phải xoá mù.)
   *
   * 🪤 NĂM BẪY — bốn của PM, cái thứ NĂM tôi tự đo ra:
   *   ① ⛔ Đè mất bộ Owner đang xếp ⇒ LƯU bộ cũ TRƯỚC khi nạp (cả localStorage để
   *      tải lại trang vẫn quay về được).
   *   ② Ô ĐANG CHẠY ⇒ BỎ QUA + NÓI RA, ⛔ đừng im lặng bỏ qua (đè là giết việc đang chảy).
   *   ③ Nạp ghế = GHI SỔ Ô ⇒ sau khi nạp phải đọc lại sổ, so CẶP ô→ghế (⛔ không dùng md5).
   *   ④ Phiên cũ ⇒ xem đoạn ♻️ trên.
   *   ⑤ 🆕 `datNguoi` có chốt `trung`: ghế đã mở ở ô KHÁC thì nó chỉ CHUYỂN TIÊU ĐIỂM,
   *      ⛔ KHÔNG nạp. Bộ Marketing có ghế trùng với bộ đang xếp nhưng KHÁC CHỖ
   *      (vd `ketoan` đang ở ô 6, đích là ô 3) ⇒ chốt đó sẽ làm nạp HỤT MÀ ⛔ KHÔNG BÁO.
   *      ⇒ phải DỌN mấy ô giữ ghế-đích-sai-chỗ TRƯỚC, rồi mới nạp.
   */
  const napBoGhe = useCallback(async (muc: CapGhe[], luuBoCu: boolean) => {
    datMoMenuGD(false);
    const ten = muc.map((m) => m.ten);

    // ① B1 — CẤT bộ hiện tại (CẶP ghế+phiên) TRƯỚC KHI đụng vào bất cứ ô nào
    if (luuBoCu) {
      const cu: CapGhe[] = dsORef.current.slice(0, SO_O)
        .map((o) => ({ ten: o.ns?.ten ?? null, phien: o.phienHienTai ?? null }));
      // 🔴 ⛔ ĐỪNG cất đè khi bộ đang xếp CHÍNH LÀ một bộ dựng sẵn — xem `LA_BO_DUNG_SAN`.
      //    Cất đè = Owner bấm hai bộ liên tiếp là mất đội thật, ⛔ không có đường về.
      if (!LA_BO_DUNG_SAN(cu.map((m) => m.ten))) {
        datBoGheCu(cu);
        try { localStorage.setItem(KHOA_BO_GHE_CU, JSON.stringify(cu)); } catch { /* ⛔ không lưu được thì thôi */ }
      }
    }

    doiBoCuc(6);
    await new Promise((r) => setTimeout(r, 80));   // để React vẽ xong 6 ô rồi mới nạp

    const dangChay = new Set(
      dsORef.current.map((o, k) => (o.dangChay ? k : -1)).filter((k) => k >= 0),
    );

    // ⑤ dọn ô đang giữ ghế thuộc bộ ĐÍCH nhưng SAI CHỖ — gỡ chốt `trung`
    for (let k = 1; k < SO_O; k++) {
      const dang = dsORef.current[k]?.ns?.ten;
      if (!dang || dangChay.has(k)) continue;
      if (dang !== ten[k] && ten.includes(dang)) await dongO(k);
    }

    const boQua: number[] = [];
    for (let i = 1; i < SO_O; i++) {
      if (dangChay.has(i)) { boQua.push(i + 1); continue; }   // ② ⛔ không đè ô đang chạy
      const dich = ten[i] ?? null;
      const dang = dsORef.current[i]?.ns?.ten ?? null;
      if (dang === dich) continue;                            // đã đúng chỗ ⇒ ⛔ đừng đụng
      if (!dich) { await dongO(i); continue; }
      const n = nhanSu.find((x) => x.ten === dich);
      if (!n) { boQua.push(i + 1); continue; }                // ghế ⛔ không có trong danh bạ
      await datNguoi(i, n);

      /* 🔴 NỐI ĐÚNG PHIÊN ĐÃ LƯU. `datNguoi` nối phiên GẦN NHẤT của ghế — đúng cho bộ
         dựng sẵn, nhưng SAI cho «quay về»: ghế có nhiều phiên thì gần-nhất ⛔ chưa chắc
         là phiên ô đó đang mở. ⇒ khôi phục phải chỉ ĐÍCH DANH.
         An toàn: `/api/o` chỉ nhận phiên CÒN THẬT trong kho của ĐÚNG ghế đó (o/route.ts:37)
         ⇒ phiên đã bị xoá thì máy chủ chặn, ⛔ không ghi bậy. */
      const phienLuu = muc[i]?.phien ?? null;
      if (phienLuu && dsORef.current[i]?.phienHienTai !== phienLuu) {
        capNhat(i, { chiPhi: null, token: null }); // ⚠️ ⛔ đặt phienHienTai — hàm đọc lo
        await ghiO(i, dich, phienLuu);
        await napLichSu(i, dich, phienLuu);
      }
    }

    datNhacGD(boQua.length
      ? `Ô ${boQua.join(', ')} đang chạy — ⛔ chưa đổi. Xong việc rồi bấm lại.`
      : '');
  }, [nhanSu, datNguoi, doiBoCuc, capNhat, ghiO, napLichSu]);

  /* ---------- Bấm chọn một phiên trong danh sách của một ô ---------- */
  async function chonPhien(i: number, p: TomTatPhien) {
    const ns = dsO[i]?.ns;
    if (!ns || p.dang_chay) return; // ⛔ không nối vào phiên đang chạy nơi khác
    huyLuong(i);
    capNhat(i, { moChonPhien: false, chiPhi: null, token: null }); // ⚠️ ⛔ đặt phienHienTai — napLichSu lo
    await ghiO(i, ns.ten, p.ma);
    await napLichSu(i, ns.ten, p.ma);
  }

  /* ---------- Dán lệnh resume chép từ sổ phiên (resume.erocathanh.com) ----------
   *
   * Nhận cả 3 dạng hay gặp: `claude --resume <uuid>` · có `cd "…" &&` · mã trần.
   *
   * 🔴 Vì sao phải KIỂM trước khi nối, ⛔ đừng nối mù: nối vào mã ⛔ không có bản ghi
   *    thì Claude ⛔ KHÔNG báo lỗi — nó lặng lẽ mở một phiên TRẮNG, và người dùng
   *    tưởng mình đang tiếp mạch cũ.
   */
  /**
   * 🧬 Fork phiên từ thư mục khác VỀ ghế này.
   *
   * ⛔ KHÔNG chép trần: chép giữ nguyên mã ⇒ cùng một mã ở hai kho ⇒ bộ canh báo bận nhầm,
   *    và Owner nhìn hai chỗ đều thấy cùng một mã. `--fork-session` cấp MÃ MỚI (ca thật 15/08).
   */
  async function forkVeGhe(i: number) {
    const o = dsORef.current[i];
    const ma = o?.phienChoFork;
    if (!o?.ns || !ma) return;
    capNhat(i, { dangFork: true, loiDan: '🧬 Đang fork… Claude phải mở phiên gốc để tách — có thể tới 3 phút.' });
    try {
      const r = await fetch('/api/fork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ma_nhan_su: o.ns.ten, ma_phien: ma, ma_o: `o-${i + 1}` }),
      });
      const j = await r.json();
      if (!r.ok || j.loi) {
        capNhat(i, { dangFork: false, loiDan: `⛔ ${j.loi ?? 'Fork thất bại.'}` });
        return;
      }
      const dc = j.doi_chung as { nguyen_ven: boolean; so_dong_truoc: number; byte_truoc: number };
      const tang = (j.goc_tich as { chuoi: unknown[] })?.chuoi?.length ?? 0;
      // 🐛 Hermes vòng 4: đường fork ⛔ kiểm `r2.ok` ⇒ HTTP 400 có thân JSON hợp lệ vẫn
      //    parse ngon ⇒ lichSu = [] ⇒ ghi `tin: []` ⇒ XOÁ TRẮNG. Cùng mẫu 3 đường kia.
      const maFork = xinMaMoi(i);
      const kq2 = await docLichSu(o.ns.ten, String(j.ma_moi), undefined, () => conMoiNhat(i, maFork));
      if (!kq2) return; // lỗi thời ⇒ bỏ im lặng, TRƯỚC khi parse — Y NHƯ bản cha
      const lichSu = kq2.tin;
      capNhat(i, {
        dangFork: false, phienChoFork: null, chuoiDan: '',
        phienHienTai: String(j.ma_moi), tin: lichSu, noiTiep: true, chiPhi: null, token: null,
        conNua: kq2.conNua, viTri: kq2.viTri,
        catDongDai: kq2.catDai,
        loiDan:
          `✅ Fork xong — mã MỚI ${String(j.ma_moi).slice(0, 8)}… · đọc được ${lichSu.length} lượt · chuỗi ${tang} tầng. ` +
          `Bản gốc ${dc?.nguyen_ven ? 'NGUYÊN VẸN' : '⚠️ ĐÃ ĐỔI — báo ngay'} ` +
          `(${dc?.so_dong_truoc} dòng · ${dc?.byte_truoc} byte).`,
      });
      void napDsPhien(i, o.ns.ten);
      /**
       * 🗣 GỬI CÂU DẶN ĐẦU — sau khi `capNhat` đã đặt `phienHienTai` = mã MỚI.
       * ⚠️ THỨ TỰ QUAN TRỌNG: gửi TRƯỚC lúc đó là câu đi vào phiên CŨ.
       * 🔒 Rỗng ⇒ ⛔ gửi gì. Và xoá ô sau khi gửi để lần fork sau ⛔ gửi lại câu cũ
       *    cho một ghế khác — đúng loại lỗi âm thầm khó truy nhất.
       */
      const cauDau = (dsORef.current[i]?.cauDauFork ?? '').trim();
      if (cauDau) {
        capNhat(i, { cauDauFork: '' });
        void guiRef.current(i, cauDau);
      }
    } catch {
      capNhat(i, { dangFork: false, loiDan: '⛔ Không gọi được máy chủ để fork.' });
    }
  }

  async function danLenhResume(i: number) {
    const o = dsO[i];
    if (!o?.ns) return;
    const ma = (o.chuoiDan.match(MAU_UUID) ?? [])[0];
    if (!ma) {
      capNhat(i, { loiDan: '⛔ Không thấy mã phiên trong chuỗi vừa dán. Cần một mã dạng 8-4-4-4-12 chữ số/chữ cái.' });
      return;
    }
    capNhat(i, { loiDan: 'Đang kiểm bản ghi phiên…' });
    try {
      /**
       * 🐛 Hermes vòng 4: đường resume ⛔ kiểm `r.ok` ⇒ lỗi MÁY CHỦ bị biến thành
       *    **chẩn đoán SAI** «phiên nằm ở thư mục khác» — app nói dối về nguyên nhân,
       *    và Owner đi tìm sai chỗ. Sai kiểu này tệ hơn báo lỗi trần.
       */
      const maResume = xinMaMoi(i);
      const kq = await docLichSu(o.ns.ten, ma, undefined, () => conMoiNhat(i, maResume));
      if (!kq) return; // lỗi thời ⇒ bỏ im lặng, TRƯỚC khi parse — Y NHƯ bản cha
      const lichSu = kq.tin;
      if (!lichSu.length) {
        // ⛔ KHÔNG im lặng mở phiên trắng — nói thẳng, để Owner còn biết mà tra lại.
        // 🧬 ⛔ Đừng dừng ở lời than: app BIẾT bệnh thì app phải đưa THUỐC.
        //    Chìa ra nút Fork ngay tại đây (Owner chốt round-122 (bos-funnel) · 15/08).
        capNhat(i, {
          phienChoFork: ma,
          loiDan:
            `⛔ Đọc được mã ${ma.slice(0, 8)}… nhưng KHÔNG thấy nội dung ở kho của ghế này. ` +
            'Phiên đó mở từ THƯ MỤC KHÁC — bản ghi tra theo nơi phiên được mở.',
        });
        return;
      }
      huyLuong(i);
      capNhat(i, {
        phienHienTai: ma, tin: lichSu, noiTiep: true, chiPhi: null, token: null,
        conNua: kq.conNua, viTri: kq.viTri,
        catDongDai: kq.catDai,
        loiDan: `✅ Đã nối phiên ${ma.slice(0, 8)}… — đọc được ${lichSu.length} lượt.`, chuoiDan: '',
      });
      await ghiO(i, o.ns.ten, ma);
      void napDsPhien(i, o.ns.ten);
    } catch {
      capNhat(i, { loiDan: '⛔ Không gọi được máy chủ để kiểm phiên.' });
    }
  }

  /* ---------- Mở phiên mới cho một ô ---------- */
  async function phienMoi(i: number) {
    const ns = dsO[i]?.ns;
    if (!ns) return;
    huyLuong(i);
    /**
     * 🐛 FAIL ③ (Hermes 30/08): bản cũ xoá `tin` mà GIỮ NGUYÊN con trỏ phân trang.
     *    Ca thủng: phiên cũ còn trang trước (`conNua`=true, `viTri`>0) → Owner mở phiên MỚI →
     *    sau lượt đầu mã phiên mới hiện ra nhưng CON TRỎ VẪN THUỘC PHIÊN CŨ
     *    ⇒ nút «nạp phần cũ» mọc lên ở phiên trắng, bấm vào là ĐỌC NHẦM PHIÊN.
     *    Cảnh báo `catDongDai` của phiên cũ cũng mọc sang theo.
     * 🔎 Đã quét MỌI chỗ đặt `tin: []` trong tệp: chỉ chỗ này thủng, ⛔ có lỗ thứ hai.
     *    Họ trạng thái phân trang đúng ba trường — khai ở `OChat`, mặc định ở `O_TRONG`.
     */
    delete neoKeo.current[i];   // neo chỗ đọc của phiên CŨ ⛔ được sống sang phiên mới
    capNhat(i, {
      moChonPhien: false, phienHienTai: null, tin: [], noiTiep: false, chiPhi: null, token: null,
      conNua: false, viTri: 0, catDongDai: false,
    });
    await ghiO(i, ns.ten, null, true); // ý định THẬT: Owner bấm mở PHIÊN MỚI
  }

  /* ---------- Gửi câu hỏi ở MỘT ô, đọc luồng SSE của riêng ô đó ----------
   *
   * `chuGoi` + `tuAi` chỉ có khi câu đến từ CỔNG ĐÁNH THỨC (ghế khác gửi sang).
   * Người gõ tay thì ⛔ không truyền gì — câu lấy từ ô soạn như cũ.
   */
  async function gui(i: number, chuGoi?: string, tuAi?: string) {
    // ⚠️ Đọc `dsORef` chứ ⛔ đừng đọc `dsO`: hàm này còn được gọi từ bộ thăm dò
    //    (hẹn giờ), nơi bao đóng giữ ảnh chụp CŨ của trạng thái.
    const o = dsORef.current[i];
    if (!o?.ns) return;
    const ns = o.ns;
    const tuGo = chuGoi === undefined;
    const cauHoi = (tuGo ? o.soan : chuGoi).trim();
    if (!cauHoi) return;

    /**
     * ⏭ Ghế đang bận ⇒ XẾP HÀNG, ⛔ đừng đánh rơi câu.
     * Bản cũ `return` thẳng: Owner bấm gửi mà ⛔ không có gì xảy ra, câu bay mất
     * và ⛔ chẳng ai báo. Terminal thì gõ tiếp được, xong lượt là chạy tiếp —
     * app THAY CHO TERMINAL nên phải như vậy.
     */
    if (o.dangChay) {
      capNhat(i, (cu) => ({
        ...(tuGo ? { soan: '' } : {}),
        hangCho: [...cu.hangCho, cauHoi],
      }));
      if (tuGo) setTimeout(() => tuCao(oGoRefs.current[i]), 0); // ô gõ co lại sau khi xếp hàng
      return;
    }
    const phienMoiKhong = o.phienHienTai === null;

    if (tuGo) setTimeout(() => tuCao(oGoRefs.current[i]), 0); // ô gõ co lại sau khi gửi
    capNhat(i, (cu) => ({
      // ⛔ Câu do ghế khác đánh thức thì ⛔ KHÔNG được xoá bản nháp Owner đang gõ dở.
      ...(tuGo ? { soan: '' } : {}),
      chiPhi: null, token: null, dangChay: true, matKetNoi: false,   // gửi được ⇒ đèn về xanh
      tin: [...cu.tin, { ma: datMa(), ai: 'toi', chu: cauHoi, gio: gioBayGio(), luc: Date.now(), ...(tuAi ? { tu_ai: tuAi } : {}) }],
    }));

    // ⚠️ Hàm cập nhật phải THUẦN — mọi thứ nó cần đều đọc từ `cu`, ⛔ không đọc cờ bên ngoài.
    const veChu = (c: string) => {
      capNhat(i, (cu) => {
        const n = [...cu.tin];
        const cuoi = n[n.length - 1];
        if (cuoi && cuoi.ai === 'ho' && cuoi.dang) {
          n[n.length - 1] = { ...cuoi, chu: cuoi.chu + c, ranh: [...mocMau] };
        } else {
          n.push({ ma: datMa(), ai: 'ho', chu: c, gio: gioBayGio(), luc: Date.now(), dang: true, ranh: [...mocMau] });
        }
        return { tin: n };
      });
    };

    /**
     * ⌨️ NHẢ CHỮ ĐỀU TAY — Owner: *«chữ bắn ra đều và mượt như đánh máy»* (17/08/2026).
     *
     * HAI BỆNH ĐO ĐƯỢC, ⛔ không phải một:
     *  ① **Nhịp đến ⛔ KHÔNG đều.** Máy chủ đã gửi từng `text_delta` (`chay-agent.ts:274-276`,
     *     cờ `--include-partial-messages` bật ở dòng 140) — nhưng mô hình nhả theo CỤM:
     *     lúc 1 ký tự, lúc cả câu, và im hẳn khi nó đang nghĩ hoặc gọi công cụ.
     *     Vẽ thẳng mỗi mẩu ⇒ mắt thấy GIẬT CỤC, ⛔ không phải lỗi mạng.
     *  ② **Mỗi mẩu vẽ lại CẢ Ô.** `veChu` sao chép trọn mảng `tin` mỗi lần gọi.
     *     Câu dài có hàng nghìn mẩu ⇒ hàng nghìn lần sao chép, và càng về cuối càng ì
     *     vì mảng càng dài. Đây là lý do đoạn cuối bao giờ cũng vẽ chậm hơn đoạn đầu.
     *
     * THUỐC: chữ đến thì xếp vào KHO CHỜ; một vòng theo KHUNG HÌNH rút ra đều tay.
     *  · gộp vẽ: 60 lần/giây thay vì mỗi mẩu một lần ⇒ chữa luôn bệnh ②
     *  · tốc độ THÍCH ỨNG: nhắm tiêu hết kho trong ~320ms — kho nhiều thì nhả nhanh hơn,
     *    ⛔ không để Owner ngồi xem chữ bò khi máy đã trả lời xong từ lâu
     *  · có SÀN (≥2 ký tự/khung) để ⛔ không lê thê, có TRẦN để còn ra dáng gõ phím
     *  · xong luồng ⇒ xả nốt thật nhanh, ⛔ không bắt chờ phần đuôi
     *  · tab ẩn ⇒ trình duyệt DỪNG `requestAnimationFrame` ⇒ xả thẳng, ⛔ không ai nhìn mà mượt
     *  · Owner bật «giảm chuyển động» ⇒ bỏ hiệu ứng, vẽ thẳng
     */
    let khoCho = '';
    let dangNha = false;
    let luongDaXong = false;
    /** 📍 Mốc kết thúc của từng mẩu — cộng dồn theo ĐỘ DÀI ĐÃ NHẬN, ⛔ không theo nhịp vẽ. */
    let tongDaNhan = 0;
    const mocMau: number[] = [];
    const giamChuyenDong =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

    const nhaDeu = () => {
      dangNha = true;
      const buoc = () => {
        if (khoCho.length === 0) { dangNha = false; return; }

        // Tab ẩn: rAF bị trình duyệt treo ⇒ đừng giả vờ mượt, xả hết cho khỏi dồn cục.
        if (typeof document !== 'undefined' && document.hidden) {
          veChu(khoCho); khoCho = ''; dangNha = false; return;
        }

        const KHUNG_MOI_GIAY = 60;
        const MUC_TIEU_MS = luongDaXong ? 120 : 320;
        const soKhung = Math.max(1, Math.round((MUC_TIEU_MS / 1000) * KHUNG_MOI_GIAY));
        const tran = luongDaXong ? 600 : 90;
        const n = Math.max(2, Math.min(tran, Math.ceil(khoCho.length / soKhung)));

        veChu(khoCho.slice(0, n));
        khoCho = khoCho.slice(n);
        requestAnimationFrame(buoc);
      };
      requestAnimationFrame(buoc);
    };

    const themChu = (c: string) => {
      tongDaNhan += c.length;
      mocMau.push(tongDaNhan);
      if (giamChuyenDong) { veChu(c); return; }
      khoCho += c;
      if (!dangNha) nhaDeu();
    };

    /** Xả nốt kho chờ rồi mới coi là hết — ⛔ đừng tắt con trỏ khi chữ còn đang ra. */
    const xaNotKho = async () => {
      luongDaXong = true;
      if (giamChuyenDong || khoCho.length === 0) return;
      if (!dangNha) nhaDeu();
      // chờ kho cạn, có trần 3 giây để ⛔ không treo mãi nếu tab bị đóng băng
      const han = Date.now() + 3000;
      while (khoCho.length > 0 && Date.now() < han) {
        await new Promise((r) => setTimeout(r, 30));
      }
      if (khoCho.length > 0) { veChu(khoCho); khoCho = ''; }
    };
    const themLoi = (chu: string) => {
      capNhat(i, (cu) => ({ tin: [...cu.tin, { ma: datMa(), ai: 'ho', chu, gio: gioBayGio(), luc: Date.now(), loi: true }] }));
    };

    huyLuong(i);
    const huy = new AbortController();
    huyRefs.current[i] = huy;

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: huy.signal,
        body: JSON.stringify({
          ma_o: maOCua(i),
          ma_nhan_su: ns.ten,
          cau_hoi: cauHoi,
          phien_moi: phienMoiKhong,
        }),
      });

      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({ loi: `Máy chủ trả mã ${r.status}.` }));
        themLoi(j.loi ?? 'Lỗi không rõ.');
        return;
      }

      const doc = r.body.getReader();
      const giai = new TextDecoder();
      let dem = '';

      for (;;) {
        const { done, value } = await doc.read();
        if (done) break;
        dem += giai.decode(value, { stream: true });
        const khoi = dem.split('\n\n');
        dem = khoi.pop() ?? '';
        for (const k of khoi) {
          const d = k.split('\n').find((x) => x.startsWith('data: '));
          if (!d) continue;
          let j: Record<string, unknown>;
          try { j = JSON.parse(d.slice(6)); } catch { continue; }

          if (j.loai === 'chu') themChu(String(j.chu));
          else if (j.loai === 'da-noi-mach') capNhat(i, { noiTiep: Boolean(j.noi_tiep) });
          else if (j.loai === 'mat-ban-ghi') {
            // ⛔ KHÔNG im lặng — người dùng phải biết mình vừa mất ngữ cảnh.
            capNhat(i, { noiTiep: false });
            themLoi(String(j.thong_diep));
          } else if (j.loai === 'loi') {
            themLoi(String(j.thong_diep));
          } else if (j.loai === 'xong') {
            capNhat(i, {
              ...(typeof j.chi_phi_usd === 'number' ? { chiPhi: j.chi_phi_usd } : {}),
              ...(typeof j.token === 'number' ? { token: j.token } : {}),
            });
          }
        }
      }
    } catch (e) {
      // Ô bị đóng / đổi agent giữa chừng thì luồng bị CẮT CÓ CHỦ Ý — ⛔ đừng báo như lỗi.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        themLoi(e instanceof Error ? e.message : 'Mất kết nối.');
      }
    } finally {
      if (huyRefs.current[i] === huy) huyRefs.current[i] = null;
      /**
       * ⛔ CHỐT CHẶN: giữa chừng Owner có thể ĐÓNG ô hoặc ĐỔI agent — lúc đó luồng bị cắt
       * và khối này vẫn chạy nốt. Ghi bừa vào ô sẽ dán danh sách phiên của NGƯỜI CŨ lên
       * NGƯỜI MỚI. Chỉ ghi khi ô vẫn đúng người đã gửi.
       */
      if (dsORef.current[i]?.ns?.ten === ns.ten) {
        // ⌨️ Xả nốt kho chờ TRƯỚC khi hạ cờ — ⛔ đừng cắt ngang lúc chữ còn đang ra.
        await xaNotKho();
        // Hạ cờ "đang chảy chữ" — lượt sau phải MỞ bong bóng mới, ⛔ không nối tiếp lượt cũ.
        capNhat(i, (cu) => ({
          dangChay: false,
          tin: cu.tin.map((t) => (t.dang ? { ...t, dang: false } : t)),
        }));
        /**
         * ⏭ Còn câu xếp hàng ⇒ GỬI TIẾP — nhưng GỘP CẢ HÀNG THÀNH MỘT LƯỢT.
         *
         * Owner 17/08: *«gửi 2,3 tin liên tiếp thì khi nhả xong nó nạp MỘT LẦN tất cả
         * vào cho agent đọc trong 1 prompt, ⛔ không tách từng lần như hiện nay»*.
         *
         * 📌 Lý do sâu hơn là TIỀN, ⛔ không chỉ tiện: mỗi lượt là một tiến trình `claude`
         *    mới, nạp lại trọn CLAUDE.md + hook + MCP (đo thật: ~15.000 token chỉ để
         *    khởi động). Ba câu tách ba lượt = trả ba lần cái giá đó. Gộp còn MỘT.
         * 📌 Và ghế đọc được cả ba ý CÙNG LÚC nên trả lời liền mạch hơn — thay vì
         *    trả lời câu 1 xong mới thấy câu 2 phủ định câu 1.
         *
         * Nối bằng dòng trống — đúng như người gõ nhiều đoạn liền tay, ⛔ không thêm
         * nhãn "tin 1/tin 2" (thêm chữ là thêm token, mà ghế cũng ⛔ không cần).
         */
        const conCho = dsORef.current[i]?.hangCho ?? [];
        if (conCho.length > 0) {
          const gopHangCho = conCho.join('\n\n');
          capNhat(i, { hangCho: [] });   // dọn sạch NGAY: ⛔ đừng để câu nào xếp hàng hai lần
          setTimeout(() => { void guiRef.current(i, gopHangCho); }, 80);
        }
        void napDsPhien(i, ns.ten);
        // Phiên vừa tạo → hỏi máy chủ xem ô đang giữ mã nào.
        try {
          const r = await fetch('/api/o');
          const j = await r.json();
          const m = j?.o?.[maOCua(i)]?.ma_phien;
          if (m && dsORef.current[i]?.ns?.ten === ns.ten) capNhat(i, { phienHienTai: m });
        } catch { /* bỏ qua */ }
      }
    }
  }

  /* ============================================================================
   * 🔔 CỔNG ĐÁNH THỨC — ô tự nhận việc do ghế KHÁC gửi sang
   * ----------------------------------------------------------------------------
   * VÌ SAO PHẢI LÀ TRÌNH DUYỆT LÀM: ghế chạy `claude -p` ⇒ sống MỘT LƯỢT rồi tắt.
   * ⛔ KHÔNG ghế nào canh kênh được, ⛔ không có mắt canh nào ở phía máy chủ.
   * Trang web là thứ DUY NHẤT sống liên tục ⇒ nó thăm dò hộ, rồi bấm nút hộ.
   *
   * ⛔ Máy chủ KHÔNG tự chạy lượt chat (xem `api/danh-thuc/route.ts`): hai nơi cùng
   *    gọi một phiên = hai tiến trình cùng ghi một tệp `.jsonl` = HỎNG BẢN GHI.
   *
   * ⚠️ Thăm dò CẢ ô đang ẩn (chế độ 1 ô / 2 ô vẫn dựng đủ 4 ô). Lý do: cổng trả lời
   *    theo SỔ TRÊN ĐĨA — sổ nói "ô 3 đang mở ghế đó" thì ô 3 phải nhận thật, ⛔ không
   *    thì câu trả lời của cổng thành lời nói dối. Đổi lại: một lượt có thể chạy ở ô
   *    đang khuất ⇒ Owner bấm sang ô đó là thấy, ⛔ không mất.
   * ==========================================================================*/
  /**
   * 📱 Ô gõ TỰ CAO THEO NỘI DUNG (Owner 17/08: «gõ nhiều thì ô tự to lên thêm dòng»).
   * Đặt `auto` trước rồi mới đo `scrollHeight` — ⛔ không làm vậy thì ô chỉ phình ra
   * mà ⛔ không bao giờ co lại được sau khi xoá chữ.
   */
  /**
   * ⛶ MỘT Ô CHIẾM TRỌN KHUNG (Owner 17/08: «nút full screen cuộc hội thoại của 1 ô
   * trong 4 ô chưa thấy có»). ⛔ KHÔNG đổi bố cục 1/2/4 — bấm lại là về đúng chỗ cũ,
   * phiên từng ô giữ nguyên vì ⛔ không ô nào bị tháo khỏi cây giao diện.
   */
  const [toanMan, datToanMan] = useState<number | null>(null);
  /**
   * 🚩 «Tôi ⛔ hỏi được máy chủ ai đang chạy» — app phải NÓI RA, ⛔ im lặng hiện rảnh.
   * 📌 Im lặng ở đây ⛔ phải chuyện thẩm mỹ: nó lấy mất NÚT DỪNG trên ô đang tiêu tiền,
   *    mà Owner ⛔ có cách nào biết vì sao nút biến mất.
   */
  const [chuaBietAiChay, datChuaBietAiChay] = useState(false);

  /**
   * 🔖 «TRANG NÀY ĐANG CHẠY MÃ CŨ» (P1-8 · 31/08/2026 · đích do ô 1 nêu).
   *
   * 🎯 Owner nạp lại 30-40 lần/tuần ⇒ tab cũ phải TỰ LỘ RA, ⛔ nằm im chờ người phát hiện.
   * 🔑 Tab **⛔ cần biết mã của chính nó**. Nó chỉ cần thấy con số phía máy chủ ĐỔI trong
   *    lúc nó còn mở. Đó là thứ tab tự quan sát được, ⛔ cần ai cấp lúc dựng.
   * ⚠️ Rỗng = «⛔ biết» ⇒ IM (xem hở ① ở route.ts). Hụt còn hơn báo nhầm.
   */
  const [maCu, datMaCu] = useState(false);
  // `null` = CHƯA đo lần nào. ⛔ dùng chuỗi rỗng làm mốc «chưa đo»: rỗng là một GIÁ TRỊ
  //   hợp lệ thật (`next dev`), gộp hai thứ đó là đẻ lại đúng chỗ hở thứ ba.
  const banDungDauTien = useRef<string | null>(null);

  /**
   * 🔴 CỬA HỎNG PHẢI NÓI RA (@aiboss-app-pm xếp mức CAO, 31/08 16:40).
   *
   * 🕳 Trước đây `if (!r.ok) return` bỏ qua lặng lẽ. Tôi từng cãi «chỉ trễ một nhịp rồi tự khỏi»
   *    — SAI CHỖ: lời gọi lỗi ⛔ MANG dấu vân nào cả, nên ⛔ có gì để so. Việc phải làm ⛔ phải
   *    là so tiếp, mà là **cho cái hỏng LÊN TIẾNG**, đúng khuôn P1-7.
   * 📌 Vế @app-pm nêu mà tôi nghĩ chưa tới: **cửa hỏng và mã cũ hay đi cùng nhau.**
   *    Đúng lúc app trục trặc là lúc tab cần biết nhất, mà lại là lúc nó câm nhất.
   * ⏱ Ngưỡng 3 lần LIÊN TIẾP (≈15 giây). Vì sao ⛔ phải 1:
   *    mỗi lần nạp lại máy chủ đều có vài giây chết (đo 31/08: đổi pid mất 3-6 giây)
   *    ⇒ ngưỡng 1 là băng nhấp nháy mỗi lần nạp. **Một băng kêu sai thì người ta học cách bỏ qua nó**,
   *    và thế là mất luôn cả những lần nó kêu đúng.
   * 🔄 Thành công MỘT lần là xoá sạch — ⛔ cộng dồn qua các đợt hỏng rời rạc.
   */
  const HONG_LIEN_TIEP_MAX = 3;
  const demHong = useRef(0);
  const [cuaHong, datCuaHong] = useState(false);
  const banRef = useRef<HTMLDivElement | null>(null);

  /**
   * 📏 ĐO chiều cao băng rồi ghi vào biến CSS `--cao-bang` — ⛔ ĐOÁN bằng số cứng.
   *
   * 🕳 VÌ SAO PHẢI ĐO, ⛔ gõ đại «44px»: băng xuống dòng khác nhau theo bề ngang máy và
   *    theo cỡ chữ hệ thống. Gõ số cứng là hoặc chừa thừa, hoặc chừa HỤT — mà chừa hụt
   *    ở đây nghĩa là **ô gõ và nút Gửi bị cắt khỏi màn**, vì `body` ghim `100vh;overflow:hidden`.
   * 🪤 Bẫy đã đo 31/08: trên màn hẹp `.cot-3.mo-khu` là `position:fixed;inset:0;z-index:60`
   *    ⇒ băng nằm trong dòng chảy sẽ bị che SẠCH đúng trên máy Owner đang dùng.
   *    ⇒ băng phải `fixed` + z-index TRÊN 60, và `--cao-bang` dùng để đẩy lớp phủ đó xuống.
   * 📌 Mặc định `--cao-bang: 0px` ⇒ ⛔ có băng thì mọi phép `calc` thành phép trừ 0,
   *    tức bố cục hiện tại ⛔ đổi một ly. Đây là chỗ đáng giá nhất của cách làm này.
   */
  dungTruocKhiVe(() => {
    const goc = document.documentElement;
    const el = banRef.current;
    if (!maCu || !el) {
      goc.style.setProperty('--cao-bang', '0px');
      return;
    }
    const doLai = () => goc.style.setProperty('--cao-bang', `${el.offsetHeight}px`);
    doLai();
    // Xoay máy / đổi cỡ chữ ⇒ băng xuống dòng lại ⇒ phải đo lại, ⛔ giữ số cũ.
    if (typeof ResizeObserver === 'undefined') return;
    const rinh = new ResizeObserver(doLai);
    rinh.observe(el);
    return () => rinh.disconnect();
  }, [maCu]);

  /**
   * 🔭 PHÓNG TO / THU LẠI đổi chiều cao MỌI ô ⇒ phải neo lại — nhưng CHỈ ô nào TRƯỚC ĐÓ
   *    đang ở đáy. Ném một ô đang đọc giữa chừng xuống đáy là mở lại đúng loại lỗi
   *    vừa vá ở nút «nạp phần cũ».
   * 🔁 Đặt lại HAI NHỊP (ngay lập tức + một khung hình sau): trên WebKit, đọc kích thước
   *    ngay sau khi đổi lớp CSS có thể còn ra số CŨ. Gán hai lần là vô hại vì cùng một đích.
   * 📌 Duyệt TOÀN BỘ ô, ⛔ chỉ ô vừa thu — lỗi đo được nằm ở NĂM ô kia.
   */
  dungTruocKhiVe(() => {
    const datLai = () => {
      bangTinRefs.current.forEach((b, i) => {
        if (!b || b.clientHeight === 0) return;
        if (oODay.current[i]) b.scrollTop = b.scrollHeight;
      });
    };
    datLai();
    const t = requestAnimationFrame(datLai);
    return () => cancelAnimationFrame(t);
  }, [toanMan]);

  const oGoRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const tuCao = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const guiRef = useRef(gui);
  guiRef.current = gui;
  const dangThamDo = useRef(false);
  /**
   * 🪪 MÃ CỦA TAB NÀY — để máy chủ biết mẩu đang được GIỮ CHỖ bởi ai (P0-2b).
   * ⚠️ Sinh MỘT LẦN cho mỗi lần mở trang, ⛔ lấy mã phiên chat: hai ô khác nhau vẫn
   *    chung một tab, mà thứ giữ chỗ là TAB chứ ⛔ phải ô.
   * 🔁 Tải lại trang ⇒ mã mới ⇒ mẩu tab cũ đang giữ sẽ hết hạn và QUAY LẠI hàng đợi.
   *    Đó là ý đồ, ⛔ phải lỗi.
   */
  const maTrinhDuyet = useRef<string>('');
  if (!maTrinhDuyet.current) {
    maTrinhDuyet.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `td-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * 📡 MỘT NHỊP THĂM DÒ — tách khỏi đồng hồ để ô VỪA RẢNH gọi được NGAY,
   *    ⛔ phải ngồi đợi hết nhịp 5 giây (việc ③ của P0-2a).
   * ⚠️ Chỉ đọc qua `ref` nên phụ thuộc rỗng là ĐÚNG — ⛔ phải cẩu thả.
   */
  const thamDoMotNhip = useCallback(async () => {
      // ⛔ Nhịp trước chưa về thì bỏ nhịp này — ⛔ đừng chồng yêu cầu lên nhau.
      if (dangThamDo.current) return;

      /**
       * 🔥 CHỐNG NÓNG MÁY (Owner 17/08: «điện thoại nóng hơn bình thường»).
       * Tab ẩn / khoá màn ⇒ NGỦ. Bản cũ vẫn gọi mạng 12 lần mỗi phút kể cả khi
       * Owner ⛔ không nhìn — mỗi lần là một nhịp bật sóng, tốn pin và sinh nhiệt
       * mà ⛔ chẳng ai đọc kết quả. Mở lại tab là nhịp sau chạy tiếp ngay.
       */
      if (typeof document !== 'undefined' && document.hidden) return;

      /**
       * 🗣 KHAI CẢ HAI DANH SÁCH (P0-2a, 30/08/2026).
       *
       * 🕳 Chú thích cũ ở đây ghi «ô bận thì đánh thức cũng vô ích» — **DẠY SAI**.
       *    Đánh thức ô bận ⛔ hề vô ích: nó chỉ cần ĐỢI. Câu đó khiến cả đội tưởng
       *    mẩu rơi là chuyện đương nhiên, trong khi thật ra mẩu HẾT HẠN ÂM THẦM sau
       *    3 phút — người gửi thấy `200` tưởng đã tới, người nhận ⛔ BAO GIỜ thấy.
       *
       * 📌 Ô CÓ ghế thì phải nằm ĐÚNG MỘT trong hai danh sách:
       *      ds_o   = sẵn sàng NHẬN ngay
       *      ds_ban = có ghế nhưng đang chạy / đang nạp ⇒ máy chủ GIỮ mẩu, ⛔ để hết hạn
       *    Ô ⛔ CÓ ghế thì ⛔ vào danh sách nào — «trống» KHÁC «bận». Xếp nhầm ô trống
       *    vào `ds_ban` là giữ một mẩu suốt 30 phút cho một chỗ ⛔ ai ngồi.
       */
      const coGhe = dsORef.current.map((o, i) => ({ o, i })).filter(({ o }) => o.ns);
      // 🎯 KHAI LUÔN GHẾ đang ngồi trong ô. Máy chủ khớp CẢ ô LẪN ghế mới dám giao —
      //    ô đổi ghế giữa chừng mà chỉ khớp theo ô thì câu đi tới một Claude KHÁC.
      const khai = ({ o, i }: { o: OChat; i: number }) =>
        ({ ma_o: maOCua(i), ma_nhan_su: o.ns!.ten });
      const dsHoi = coGhe.filter(({ o }) => !o.dangChay && !o.dangNap).map(khai);
      const dsBan = coGhe.filter(({ o }) => o.dangChay || o.dangNap).map(khai);
      /**
       * 🔴 CỬA THOÁT CŨ ĐÃ GỠ (P1-8 · 31/08/2026) — trước đây:
       *      if (dsHoi.length === 0 && dsBan.length === 0) return;
       *
       * 🪤 Tab ⛔ có ghế nào ⇒ ⛔ gọi cửa ⇒ **⛔ BAO GIỜ biết mình cũ**. Mà tab mở suốt
       *    ngày ⛔ có ghế đúng là tab dễ cũ nhất.
       * 📌 Đây là họ lỗi cả đội cắn cả ngày 31/08: **một chốt chặn nằm SAU cửa thoát
       *    thì nó ⛔ chặn được gì.** Phép so bản dựng phải chạy ⛔ phụ thuộc có ghế hay ⛔.
       * 💰 Giá phải trả, đã cân: một yêu cầu rỗng mỗi 5 giây cho MỘT tab (⛔ phải mỗi ô —
       *    cả 4 ô gộp chung một lời gọi). Cửa `/nhan` ⛔ có phanh nhịp (đã đo), thân rỗng
       *    chạy qua vòng lặp ⛔ làm gì. Và `document.hidden` vẫn chặn ở trên: tab ẩn thì ngủ.
       */

      dangThamDo.current = true;
      try {
        const r = await fetch('/api/danh-thuc/nhan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ds_o: dsHoi, ds_ban: dsBan, ma_trinh_duyet: maTrinhDuyet.current }),
        });
        if (!r.ok) {
          // Cửa trả mã lỗi ⇒ ⛔ có dấu vân để so. Đếm, và im cho tới khi đủ ngưỡng.
          demHong.current += 1;
          if (demHong.current >= HONG_LIEN_TIEP_MAX) datCuaHong(true);
          return;
        }
        const j = await r.json();

        /**
         * 🔖 SO BẢN DỰNG — chạy TRƯỚC phần chia mẩu, để nó ⛔ dính số phận của phần đó.
         * · lần trả lời ĐẦU TIÊN sau khi tải trang ⇒ NHỚ, ⛔ báo (tab mới ⛔ cũ).
         * · sau đó khác giá trị đã nhớ ⇒ máy chủ đã đổi BẢN ⇒ báo.
         * · GIỐNG ⇒ im. Máy chủ nạp lại mà CÙNG bản dựng thì mã tab vẫn đúng — ⛔ làm phiền.
         *   👆 Chính vế này là thứ phân biệt «so BẢN DỰNG» với «so máy chủ có khởi lại ⛔»,
         *      và là đối chứng ÂM của cổng nghiệm thu ①.
         * 🔒 ⛔ hạ cờ xuống lại: bản đã cũ thì ⛔ tự mới lại được. Chỉ tải trang mới xoá.
         */
        /**
         * 🔴 CHỖ HỞ THỨ BA — @phong-ban-pm bắt được lúc 16:09, và nó ĐANG BẬT lúc đó.
         *
         * 🕳 CA THẬT sẽ xảy ra ở CHÍNH lần nạp đưa P1-8 lên:
         *    ① máy chủ đang chạy là bản CŨ ⇒ trả về ⛔ CÓ khoá `ban_dung`
         *    ② tab Owner mở từ trước ⇒ mọi lời gọi tới giờ đều ⛔ thấy khoá ⇒ ô nhớ RỖNG
         *    ③ nạp bản mới ⇒ tab nhận `ban_dung` LẦN ĐẦU ⇒ mã cũ coi là «lần đầu ⇒ nhớ, im»
         *    ⇒ Tab Owner đang chạy mã CŨ mà ⛔ được báo. **Im lặng đúng lần nạp quan trọng nhất.**
         * 📌 Gốc: vế «lần đầu thì nhớ» ngầm giả định lần đầu đó xảy ra NGAY SAU khi tải trang.
         *    Ở lần nạp đầu tiên, «lần đầu» bị dời tới tận SAU khi nạp — lúc tab đã cũ rồi.
         *    ⇒ Cơ chế chỉ chạy đúng TỪ LẦN THỨ HAI. Một cái báo động ⛔ kêu ở lần đầu thì
         *      nó ⛔ phải báo động, nó là một lời hứa.
         *
         * ✅ CHỮA: phân biệt «CHƯA TỪNG có khoá» với «có khoá mà giá trị rỗng».
         *    Gộp thành MỘT dấu vân để so — ⛔ giữ hai biến rồi phải nhớ ghép chúng đúng cách.
         *      ⛔ có khoá        → '(khong-co-khoa)'   (máy chủ bản CŨ, trước P1-8)
         *      có khoá, rỗng    → ''                   (`next dev` ⛔ sinh BUILD_ID)
         *      có khoá, có giá  → chính mã bản dựng
         * 🔑 Chuỗi mốc chứa dấu ngoặc nên nó ⛔ BAO GIỜ trùng một BUILD_ID thật (chữ và số).
         * ✅ Đối chứng âm VẪN GIỮ: cùng bản dựng ⇒ dấu vân y hệt ⇒ IM. Nạp lại mà ⛔ dựng lại
         *    thì Owner ⛔ bị làm phiền — đó là vế chứng minh ta so BẢN DỰNG, ⛔ phải so
         *    «máy chủ có khởi lại ⛔».
         */
        // ✅ Một lần trả lời được là cửa còn sống ⇒ xoá sạch, ⛔ để vết hỏng cũ dồn lại.
        demHong.current = 0;
        // ⛔ cần `ref` để soi trạng thái hiện thời: React BỎ QUA lần đặt cùng giá trị,
        // nên gọi thẳng `datCuaHong(false)` mỗi nhịp là vô hại và ⛔ đẻ lần vẽ thừa.
        // (Bản đầu tôi bịa ra một `cuaHongRef` ⛔ hề tồn tại — thước `tsc` bắt được ngay.)
        datCuaHong(false);

        const coKhoa = j != null && Object.prototype.hasOwnProperty.call(j, 'ban_dung');
        const vanBan = !coKhoa
          ? '(khong-co-khoa)'
          : (typeof j.ban_dung === 'string' ? j.ban_dung : '');
        if (banDungDauTien.current === null) banDungDauTien.current = vanBan;
        else if (banDungDauTien.current !== vanBan) datMaCu(true);

        const nhan = (j?.nhan ?? {}) as Record<
          string,
          { ma: string; ma_nhan_su: string; tu_ai: string; cau_hoi: string }
        >;

        for (const [maO, y] of Object.entries(nhan)) {
          const i = Number(maO.slice(2)) - 1;
          if (!Number.isInteger(i) || i < 0 || i >= SO_O) continue;
          const o = dsORef.current[i];
          // Ô vừa bận đi trong lúc chờ mạng → bỏ lượt này, ⛔ đừng chen vào phiên đang chạy.
          if (!o?.ns || o.dangChay) continue;
          /**
           * 🎯 CHỐT CUỐI: ô có thể ĐỔI GHẾ trong lúc phản hồi đang bay về.
           *    Máy chủ đã khớp ghế rồi, đây là lớp thứ hai cho đúng khoảnh khắc đó.
           * ⚠️ NÓI THẲNG CHỖ CÒN HỞ: máy chủ ĐÃ đánh dấu mẩu là đã-xử trước khi trả về,
           *    nên bỏ ở đây là **mẩu MẤT**. Cửa sổ chỉ vài mili-giây và mất còn hơn giao
           *    nhầm người — nhưng đây đúng là chỗ mà việc «máy trạng thái + xác nhận đã nhận»
           *    (đang chờ đề bài) sẽ vá. ⛔ tự dựng nửa vời ở đây.
           */
          if (o.ns.ten !== y.ma_nhan_su) continue;
          void guiRef.current(i, y.cau_hoi, y.tu_ai);
          /**
           * ✅ XÁC NHẬN — gọi NGAY SAU KHI `gui()` đã bắt đầu, ⛔ phải trước.
           *    Xác nhận trước là khai «đã giao» trong khi việc còn chưa chạy.
           * 🔒 Trước khi có cổng này, máy chủ đánh dấu «đã xử» ngay lúc TRAO ⇒ tab chết
           *    giữa chừng là mẩu mất mà ⛔ ai biết. Nay ⛔ xác nhận ⇒ mẩu QUAY LẠI.
           * ⚠️ CHỖ CÒN HỞ, tôi ⛔ giấu: nếu `gui()` đã chạy mà lời xác nhận này rớt mạng,
           *    mẩu sẽ quay lại hàng đợi và được giao LẦN NỮA ⇒ ghế chạy hai lần.
           *    Cửa sổ rất hẹp (xác nhận đi ngay, hạn giữ chỗ 30 giây) và đây là đánh đổi
           *    có chủ ý: **thà chạy lại còn hơn mất câu**. Muốn triệt thì phải có khoá
           *    chống trùng ở tầng `gui()` — việc khác, ⛔ nhét vào đợt này.
           */
          void fetch('/api/danh-thuc/xac-nhan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ma: y.ma, ma_trinh_duyet: maTrinhDuyet.current }),
          }).catch(() => { /* rớt một nhịp — mẩu sẽ quay lại, ⛔ làm ồn */ });
        }
      } catch {
        /**
         * Mất mạng / máy chủ đang khởi lại. Một nhịp thì im — nhịp sau thử lại.
         * Nhưng LIÊN TIẾP đủ ngưỡng thì phải nói: đây ⛔ còn là «một nhịp xui».
         */
        demHong.current += 1;
        if (demHong.current >= HONG_LIEN_TIEP_MAX) datCuaHong(true);
      } finally {
        dangThamDo.current = false;
      }
  }, []);

  useEffect(() => {
    const hen = setInterval(() => { void thamDoMotNhip(); }, NHIP_THAM_DO_MS);
    return () => clearInterval(hen);
  }, [thamDoMotNhip]);

  /**
   * ⚡ Ô vừa BẬN → RẢNH ⇒ thăm dò NGAY, ⛔ ngồi đợi hết nhịp 5 giây (việc ③ của P0-2a).
   *
   * 🔤 «Vết bận» là một chuỗi 0/1 theo ô. Dùng chuỗi thay vì mảng để React so được bằng
   *    `===` — mảng thì lần vẽ nào cũng là vật mới ⇒ hiệu ứng chạy mọi lần vẽ.
   * ⏱ Hoãn 200ms rồi mới hỏi, CÓ LÝ DO: ngay sau khi hạ cờ bận, ô có thể GỬI TIẾP câu
   *    đang xếp hàng của chính nó (:1456). Hỏi ngay là chen vào giữa hai việc đó.
   *    200ms đủ để việc xếp hàng giành lại cờ bận, mà vẫn xa dưới mức 2 giây đề bài đòi.
   */
  const vetBan = dsO.map((o) => (o.ns && (o.dangChay || o.dangNap) ? '1' : '0')).join('');
  const vetBanTruoc = useRef(vetBan);
  useEffect(() => {
    const truoc = vetBanTruoc.current;
    vetBanTruoc.current = vetBan;
    const vuaRanh = [...vetBan].some((c, i) => truoc[i] === '1' && c === '0');
    if (!vuaRanh) return;
    const t = setTimeout(() => { void thamDoMotNhip(); }, 200);
    return () => clearTimeout(t);
  }, [vetBan, thamDoMotNhip]);

  /** Nhãn dễ đọc của ghế đã đánh thức — ⛔ đừng hiện tên kỹ thuật trơ trọi. */
  const nhanCua = useCallback(
    (slug: string) => {
      const n = nhanSu.find((x) => x.ten === slug);
      // Hàm này trả về CHUỖI (nhãn «… đánh thức») nên ⛔ không gắn icon vào được.
      // ⇒ Bỏ emoji thay vì để lẫn một 👑 lạc lõng giữa các icon bộ; tên ghế đã đủ nghĩa.
      return n ? n.nhan : slug;
    },
    [nhanSu],
  );

  const demTheoPhong = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nhanSu) m.set(n.phong, (m.get(n.phong) ?? 0) + 1);
    return m;
  }, [nhanSu]);

  const tenTieuDiem = dsO[tieuDiem]?.ns?.ten ?? null;
  const tenDangMo = useMemo(
    () => new Set(dsO.slice(0, boCuc).map((o) => o.ns?.ten).filter(Boolean) as string[]),
    [dsO, boCuc],
  );

  return (
    <>
      <header className="thanh-de">
        <div className="dau-an">ET</div>
        <div className="khoi-de">
          <b>AIBOSS.VN</b>
          <span>Phòng ban AI · nói chuyện thật với trợ lý AI · Eroca Thanh</span>
        </div>
        <div className="so-lieu">
          <div className="o-so"><b>{tong.nhan_su}</b><span>Nhân sự</span></div>
          <div className="vach" />
          <div className="o-so"><b>{tong.phong_ban}</b><span>Phòng ban</span></div>
          <div className="vach" />
          <div className="o-so"><b>{tong.truong_phong}</b><span>Trưởng phòng</span></div>
        </div>
        {/**
          * 💬 QUAY LẠI KHU CHAT (Owner 18/08: «về danh bạ xong ⛔ không có nút quay lại ô chat»).
          * Tôi thêm đường ĐI mà quên đường VỀ ⇒ Owner kẹt ở danh bạ, chỉ thoát được bằng
          * cách chọn lại một ghế — mà đôi khi Owner chỉ muốn xem danh bạ rồi quay lại chỗ cũ.
          * Chỉ hiện ở màn hẹp và CHỈ khi đang đứng ở danh bạ.
          */}
        {anKhu && (
          <button
            className="nut-tron nut-ve-chat" type="button"
            onClick={() => datAnKhu(false)}
            title="Quay lại khu trò chuyện"
            aria-label="Quay lại khu trò chuyện"
          >
            <ChatCircleDots size={17} weight={DAM_ICON} aria-hidden="true" />
          </button>
        )}
      </header>

      {/**
        * 🔖 BĂNG «TRANG NÀY ĐANG CHẠY MÃ CŨ» (P1-8 · 31/08/2026)
        *
        * ⛔ NÓI QUÁ THỨ BIẾT CHẮC: ta CHƯA đo được cơ chế hỏng (giả thuyết 404 đã bị BÁC
        *    bằng số — xem route.ts). Nên câu chữ chỉ khai đúng một điều kiểm được:
        *    **mã trang này cũ hơn mã máy chủ.** ⛔ hứa «vì thế nên app im».
        * ⛔ TỰ TẢI LẠI: Owner đang gõ dở một câu là mất trắng. Băng DÍNH, ⛔ tự tắt,
        *    ⛔ chặn thao tác — để Owner chọn LÚC.
        * ♿ `role="status"` để trình đọc màn hình đọc lên khi băng xuất hiện.
        */}
      {(maCu || cuaHong) && (
        <div className={`bang-ma-cu${maCu ? '' : ' bang-cua-hong'}`} ref={banRef} role="status">
          {/**
            * 🔀 MỘT BĂNG, HAI CÂU — ⛔ dựng băng thứ hai.
            *    Hai băng thì chúng giành nhau chỗ trên đỉnh màn, và biến `--cao-bang` chỉ đo
            *    được MỘT cái ⇒ cái kia đẩy đáy ra ngoài. Đúng thứ vừa vá xong ở cổng ⑥.
            * 🥇 `maCu` ĐI TRƯỚC: «mã của bạn cũ» là việc Owner LÀM ĐƯỢC ngay (bấm Tải lại).
            *    «cửa ⛔ trả lời» thì anh ấy ⛔ làm gì được — báo trước cái làm được.
            */}
          {maCu ? (
            <span>
              Bản mới đã lên máy chủ. Trang này đang chạy mã <b>CŨ</b>.
            </span>
          ) : (
            /**
             * ⚠️ NÓI ĐÚNG THỨ BIẾT CHẮC. Ta biết: đã hỏi 3 lần liên tiếp mà ⛔ ai trả lời.
             *    Ta ⛔ biết vì sao, và ⛔ biết app có còn chạy việc ⛔ ⇒ ⛔ hứa hộ điều đó.
             */
            <span>
              Đã hỏi máy chủ <b>3 lần liên tiếp</b> mà chưa nhận được trả lời. Câu gửi tới các ghế
              có thể chưa đi được.
            </span>
          )}
          <button
            type="button"
            className="nut-tai-lai"
            onClick={() => window.location.reload()}
          >
            Tải lại
          </button>
        </div>
      )}

      <div className={`khung bc-${boCuc}${(anCot === null ? boCuc === 6 : anCot) ? ' an-cot' : ' hien-cot'}`}>
        {/* ===== Cột 1 — cây phòng ban ===== */}
        <aside className="cot cot-1">
          <div className="de-cot">Cơ cấu tổ chức</div>
          <div className="cay">
            <div
              className={`goc${phongChon === null ? ' chon' : ''}`}
              onClick={() => { datPhongChon(null); datPhongMo(null); }}
            >
              <span className="ic">🏛</span>
              <span className="nhan-ten">Toàn bộ nhân sự</span>
              <span className="dem-nho">{nhanSu.length}</span>
            </div>

            {phongBan.map((p) => (
              <div key={p.ma}>
                <div
                  className={`nut${phongMo === p.ma ? ' mo' : ''}${phongChon === p.ma ? ' chon' : ''}`}
                  onClick={() => {
                    datPhongChon(p.ma);
                    datPhongMo(phongMo === p.ma ? null : p.ma);
                  }}
                >
                  <span className="caret">▶</span>
                  <span className="ic">{p.icon}</span>
                  <span className="nhan-ten">{p.ten}</span>
                  <span className="dem-nho">{demTheoPhong.get(p.ma) ?? 0}</span>
                </div>
                <div className="con">
                  {nhanSu.filter((n) => n.phong === p.ma).slice(0, 40).map((n) => (
                    <div
                      key={n.ten}
                      className={`la${tenTieuDiem === n.ten ? ' chon' : ''}`}
                      onClick={() => chonNhanSu(n)}
                      title={n.ten}
                    >
                      <span className="cham" />
                      <span className="nhan-ten">{n.nhan}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="thanh-mau">
            <div className="tieu">Tỉ trọng nhân sự</div>
            <div className="thanh-ty">
              {phongBan.map((p, i) => (
                <i key={p.ma} style={{
                  width: `${(p.so_nhan_su / nhanSu.length) * 100}%`,
                  background: MAU_PHONG[i % MAU_PHONG.length],
                }} />
              ))}
            </div>
            <div className="chu-thich">
              {phongBan.map((p, i) => (
                <div key={p.ma}>
                  <i style={{ background: MAU_PHONG[i % MAU_PHONG.length] }} />
                  {p.ten}<b>{p.so_nhan_su}</b>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ===== Cột 2 — danh sách nhân sự ===== */}
        <section className="cot cot-2">
          <div className="de-cot">
            <span>{phongChon ? phongBan.find((p) => p.ma === phongChon)?.ten : 'Toàn bộ nhân sự'}</span>
            <span className="dem">{dsHien.length}</span>
          </div>
          <div className="hop-tim">
            <input
              type="search" autoComplete="off" value={tuKhoa}
              onChange={(e) => datTuKhoa(e.target.value)}
              placeholder="Tìm theo việc hoặc theo tên kỹ thuật…"
            />
          </div>
          <div className="ds">
            {dsHien.length === 0 && <div className="rong">Không có ai khớp.</div>}
            {dsHien.map((n) => (
              <div
                key={n.ten}
                className={`the-ns${tenTieuDiem === n.ten ? ' chon' : ''}${
                  tenDangMo.has(n.ten) && tenTieuDiem !== n.ten ? ' mo' : ''
                }`}
                data-vai={n.vai}
                onClick={() => chonNhanSu(n)}
                title={`${n.nhan}\n${n.ten}`}
              >
                <div className="vuong">{n.viet_tat}</div>
                <div className="noi">
                  {/* ⭐ Dòng CHÍNH = nhãn dễ hiểu · dòng PHỤ = tên kỹ thuật (nhỏ, mờ) */}
                  <div className="ten">{n.nhan}</div>
                  <div className="ma-ky-thuat">{n.ten}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Cột 3 — khu trao đổi, chia 1 / 2 / 4 ô ===== */}
        <section className={`cot cot-3${anKhu ? '' : ' mo-khu'}`}>
          <div className="de-khu">
            {/**
              * ☰ MỞ DANH BẠ trên màn hẹp (Owner 18/08: «mobile chỗ AIBOSS.VN thiếu menu
              * bấm để mở ra các menu tìm phòng ban như trên máy tính»).
              * Vì sao thiếu: màn ≤1040px thì khu trao đổi PHỦ TOÀN MÀN, che mất cột danh bạ
              * và cột phòng ban. Trước đó đường về chỉ nằm trong menu ⋯ của TỪNG Ô — Owner
              * ⛔ không tìm ra, mà đó lại là đường DUY NHẤT để đổi ghế trên điện thoại.
              * ⇒ Đặt ngay cạnh tên app: chỗ mắt nhìn đầu tiên. Màn rộng thì ẩn (danh bạ luôn hiện).
              */}
            <button
              className="nut-tron nut-danh-ba" type="button"
              onClick={() => { datAnKhu(true); datAnCotLuu(false); }}
              title="Mở danh bạ — tìm phòng ban, đổi ghế"
              aria-label="Mở danh bạ"
            >
              <List size={17} weight={DAM_ICON} aria-hidden="true" />
            </button>
            <span className="nhan-khu ten-app" title="AIBOSS.VN — phòng ban AI của Eroca Thanh">AIBOSS.VN</span>
            <span className="nhan-that">● Nối thẳng Claude Code trên máy</span>
            {nhacO1 && (
              <span className="nhan-mau" title={nhacO1}>
                <Crown size={12} weight={DAM_ICON} aria-hidden="true" className="vuong-mien" /> {nhacO1}
              </span>
            )}
            <div className="nhom-bo-cuc">
              {/**
                * 📕 NÚT ẨN/HIỆN HAI CỘT TRÁI (Owner chốt 20/08 — hướng Ⓑ).
                * Nhãn NÓI RÕ việc sẽ xảy ra khi bấm, ⛔ không phải nói trạng thái hiện tại —
                * nút mà đọc xong còn phải đoán thì Owner bấm thử mới biết.
                * ⚠️ Ẩn cột = mất lối vào danh bạ ⇒ luật bật nút ☰ phải áp cho CẢ trạng thái này,
                *    ⛔ không chỉ bc-6. «Ẩn thứ gì thì chừa đường quay lại TRONG CÙNG lượt sửa.»
                */}
              <button
                className={`nut-bc nut-cot${(anCot === null ? boCuc === 6 : anCot) ? '' : ' chon'}`}
                type="button"
                onClick={() => datAnCotLuu(!(anCot === null ? boCuc === 6 : anCot))}
                title={(anCot === null ? boCuc === 6 : anCot)
                  ? 'Hiện lại hai cột danh bạ + phòng ban'
                  : 'Ẩn hai cột trái để khung trò chuyện rộng thêm 584px'}
                aria-pressed={(anCot === null ? boCuc === 6 : anCot)}
              >
                {(anCot === null ? boCuc === 6 : anCot) ? 'Hiện 2 cột' : 'Ẩn 2 cột'}
              </button>
              {/**
                * 🎛 MENU «GIAO DIỆN» — bộ ghế dựng sẵn (Owner 20/08, cho lớp).
                * Đặt trong `.nhom-bo-cuc` vì khối đó đã có `position:relative` (mau09:221)
                * ⇒ menu xổ bám đúng chỗ, ⛔ không phải thêm vỏ bọc mới.
                * ⛔ Mục «Ghế hiện tại» CHỈ hiện khi ĐÃ có bộ lưu — hiện một nút ⛔ không làm gì
                *   thì tệ hơn ⛔ không có nút (đúng bài học nút ☰ chết sáng nay).
                */}
              <button
                className={`nut-bc nut-gd${moMenuGD ? ' chon' : ''}`} type="button"
                onClick={() => datMoMenuGD((v) => !v)}
                title="Chọn bộ ghế dựng sẵn cho 6 ô"
                aria-label="Menu giao diện" aria-expanded={moMenuGD}
              >
                Giao diện <CaretDown size={12} weight={DAM_ICON} aria-hidden="true" />
              </button>
              {moMenuGD && (
                <div className="menu-xo menu-gd" role="menu">
                  <button
                    className="muc-menu" type="button" role="menuitem"
                    disabled={!boGheCu}
                    title={boGheCu
                      ? boGheCu.map((m) => m.ten).filter(Boolean).join(' · ')
                      : 'Chưa lưu bộ nào — bấm «Phòng Marketing» thì bộ đang xếp sẽ được cất lại'}
                    onClick={() => { void napBoGhe(boGheCu ?? [], false); }}
                  >
                    <ClockCounterClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                    {boGheCu ? 'Ghế hiện tại (bộ đã lưu)' : 'Chưa có bộ nào để quay về'}
                  </button>
                  <button
                    className="muc-menu" type="button" role="menuitem"
                    title={BO_MARKETING.join(' · ')}
                    onClick={() => { void napBoGhe(BO_MARKETING.map((t) => ({ ten: t, phien: null })), true); }}
                  >
                    <Crown size={15} weight={DAM_ICON} aria-hidden="true" />
                    Phòng Marketing — 6 ô
                  </button>
                  {/* 🎛 «Vận hành» — ẢNH CHỤP bộ ghế 10:49 20/08, ⛔ KHÔNG lấy động
                      (lấy động thì trùng y hệt mục «Ghế hiện tại» ở trên).
                      ♻️ Dùng ĐÚNG `napBoGhe` của bộ Marketing — cùng bốn chốt, cùng đường ghi sổ.
                      ⛔ Đẻ đường song song thì lần sau sửa một chỗ, chỗ kia âm thầm lệch. */}
                  <button
                    className="muc-menu" type="button" role="menuitem"
                    title={BO_VAN_HANH.join(' · ')}
                    onClick={() => { void napBoGhe(BO_VAN_HANH.map((t) => ({ ten: t, phien: null })), true); }}
                  >
                    <List size={15} weight={DAM_ICON} aria-hidden="true" />
                    Vận hành — 6 ô
                  </button>
                  {/* 🗄 «Quản Lý Cũ» — Owner 30/08, đổi tên + tên ghế THẬT 31/08.
                      Bộ DUY NHẤT ghim sẵn mã phiên ⇒ truyền THẲNG `BO_QUAN_LY_CU`,
                      ⛔ map `phien: null` như hai bộ trên. */}
                  <button
                    className="muc-menu" type="button" role="menuitem"
                    title={BO_QUAN_LY_CU.map((m) => m.ten).join(' · ')}
                    onClick={() => { void napBoGhe(BO_QUAN_LY_CU, true); }}
                  >
                    <ClipboardText size={15} weight={DAM_ICON} aria-hidden="true" />
                    Quản Lý Cũ — 6 ô
                  </button>
                </div>
              )}
              {nhacGD && <span className="nhan-mau" title={nhacGD}>{nhacGD}</span>}
              <button
                className={`nut-bc${boCuc === 1 ? ' chon' : ''}`} type="button" data-bc="1"
                onClick={() => doiBoCuc(1)}
                title="1 ô — một cuộc trò chuyện toàn khung" aria-label="Bố cục 1 ô"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 2 ? ' chon' : ''}`} type="button" data-bc="2"
                onClick={() => doiBoCuc(2)}
                title="2 ô — chia trên / dưới" aria-label="Bố cục 2 ô trên dưới"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 4 ? ' chon' : ''}`} type="button" data-bc="4"
                onClick={() => doiBoCuc(4)}
                title="4 ô — lưới 2×2" aria-label="Bố cục 4 ô"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                  <line x1="9" y1=".8" x2="9" y2="13.2" />
                </svg>
              </button>
              {/* 🆕 Bố cục 6 ô (Owner 20/08). Ở 6 ô thì GIẤU hai cột trái để lấy chỗ —
                  xem `.khung.bc-6` trong mau09.css. Đường vào danh bạ giữ bằng nút ☰. */}
              <button
                className={`nut-bc${boCuc === 6 ? ' chon' : ''}`} type="button" data-bc="6"
                onClick={() => doiBoCuc(6)}
                title="6 ô — ba cột, hai hàng (ẩn hai cột trái để lấy chỗ)" aria-label="Bố cục 6 ô"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1="6.27" y1=".8" x2="6.27" y2="13.2" />
                  <line x1="11.73" y1=".8" x2="11.73" y2="13.2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                </svg>
              </button>
              <div className="goi-y-phim">Phím <b>1</b>…<b>6</b> — nhảy tiêu điểm sang ô tương ứng</div>
            </div>
          </div>

          <div className={`luoi bc-${boCuc}${toanMan !== null ? ' toan-man' : ''}`}>
            {dsO.map((o, i) => (
              <div
                key={i}
                className={`o-chat${i === tieuDiem ? ' tieu-diem' : ''}${toanMan === i ? ' toan' : ''}${o.thuKhung ? ' thu-khung' : ''}`}
                data-o={i}
                onMouseDown={() => datTieuDiem(i)}
              >
                {!o.ns ? (
                  <>
                    <div className="de-o">
                      <button
                        className="nut-tron nut-lui" type="button"
                        onClick={() => datAnKhu(true)} title="Quay lại danh bạ"
                        aria-label="Quay lại danh bạ"
                      >
                        <ArrowLeft size={17} weight={DAM_ICON} aria-hidden="true" />
                      </button>
                      <div className="anh-o trong-o">—</div>
                      <div className="tt-o">
                        <b>Ô trống</b>
                        <div className="ma-ky-thuat">Chưa chọn nhân sự</div>
                      </div>
                      <span className="so-o" title={`Ô ${i + 1}`} aria-label={`Ô ${i + 1}`}>
                        {(() => { const IconSo = ICON_SO_O[i] ?? NumberOne;
                          return <IconSo size={17} weight={DAM_ICON} aria-hidden="true" />; })()}
                      </span>
                    </div>
                    <div className="rong-o">
                      <div className="to">💬</div>
                      <b>Ô {i + 1} đang trống</b>
                      <span>Bấm vào ô này rồi chọn một nhân sự ở cột giữa.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="de-o">
                      <div className="anh-o">
                        {o.ns.viet_tat}
                        {/**
                        * 🚦 ĐÈN TRẠNG THÁI (Owner 17/08 · DỜI sang ẢNH ĐẠI DIỆN 30/08 theo Owner).
                        * Nằm ở góc ảnh — thứ TRÁI CÙNG trên thanh, mắt bắt được ngay.
                        * ⚠️ NEO của nó là `position:relative` trên `.anh-o` (mau09:256). Gỡ dòng neo đó
                        *    thì đèn văng lên tổ tiên khác, ra SAI CHỖ mà ⛔ báo lỗi dòng nào.
                        * Bốn mức, mỗi mức dựa vào một SỰ THẬT ĐO ĐƯỢC — ⛔ không đèn trang trí:
                        *   cam nhấp nháy = luồng vừa ĐỨT (matKetNoi)
                        *   xanh nhấp nháy = ĐANG chảy chữ (dangChay)
                        *   xanh = có phiên, rảnh
                        *   xám = CHƯA nối phiên nào
                        */}
                        <span
                        className={`den-o ${o.matKetNoi ? 'den-dut' : o.dangChay ? 'den-chay' : o.phienHienTai ? 'den-noi' : 'den-tat'}`}
                        title={o.matKetNoi ? 'Mất kết nối — luồng vừa đứt, gửi lại để nối'
                        : o.dangChay ? 'Đang chạy — chữ đang về'
                        : o.phienHienTai ? 'Đã nối phiên — sẵn sàng'
                        : 'Chưa nối phiên nào'}
                        aria-label={o.matKetNoi ? 'Mất kết nối' : o.dangChay ? 'Đang chạy' : o.phienHienTai ? 'Đã nối phiên' : 'Chưa nối phiên'}
                        />
                      </div>
                      <div className="tt-o">
                        {/* ⭐ nhãn to · slug nhỏ mờ */}
                        <b title={o.ns.nhan}>
                          {/* 👑 → icon bộ (skill taste §3.D: hạn chế emoji, dùng glyph thư viện).
                              Giữ nguyên NGHĨA «ghế trùm», chỉ đổi cách vẽ. */}
                          {i === 0 && <Crown size={14} weight={DAM_ICON} aria-label="Ghế trùm" className="vuong-mien" />}
                          {o.ns.nhan}
                        </b>
                        <div className="ma-ky-thuat" title={o.ns.ten}>{o.ns.ten}</div>
                      </div>
                      {/**
                        * 🔢ℹ SỐ Ô KIÊM NÚT HỒ SƠ (Owner 17/08: «ghép icon i vào cạnh số 2
                        * cho gọn và dễ bấm»). Gộp hai thứ ⇒ bớt một nút trên thanh chật,
                        * và vùng chạm rộng hơn nút tròn — hợp ngón tay hơn.
                        * ⚠️ Nút ℹ riêng trước đó bị TÔI XOÁ NHẦM khi dọn nút ¶: biểu thức
                        *    xoá dùng `.*?` trên JSX lồng nhau nên nuốt luôn nút đứng trước.
                        *    📌 ⛔ Đừng xoá khối JSX bằng biểu thức nhiều dòng — cắt theo mốc rõ.
                        */}
                      <button
                        className={`so-o nut-so${o.moHoSo ? ' bat' : ''}`} type="button"
                        onClick={() => capNhat(i, { moHoSo: !o.moHoSo })}
                        title={`Ô ${i + 1} — bấm xem hồ sơ ghế · mã phiên · token · chi phí`}
                        aria-label={`Ô ${i + 1} — hồ sơ ghế`}
                        aria-pressed={o.moHoSo}
                      >
                        {(() => { const IconSo = ICON_SO_O[i] ?? NumberOne;
                          return <IconSo size={17} weight={DAM_ICON} aria-hidden="true" />; })()}
                        <Info size={15} weight={DAM_ICON} aria-hidden="true" className="dau-i" />
                      </button>
                      {/**
                        * 🔽 NÚT THU KHUNG — CHỈ ô 1 (TỔNG GIÁM ĐỐC), CHỈ màn hẹp (CSS lo phần ẩn/hiện).
                        * Owner: «sau khi thu sẽ đổi thành icon bấm để mở ra» ⇒ icon ĐỔI CHIỀU,
                        * ⛔ không phải hai nút. Đang mở → mũi tên LÊN (bấm là thu lên);
                        * đã thu → mũi tên XUỐNG (bấm là mở xuống).
                        * ⚠️ Ô 1 ⛔ KHÔNG có nút đóng và ⛔ KHÔNG đổi được ghế — hai luật đó GIỮ NGUYÊN.
                        *    Thu khung chỉ là chuyện NHÌN nên ⛔ không đụng vào chúng.
                        */}
                      {i === 0 && (
                        <button
                          className="nut-tron nut-thu" type="button"
                          onClick={() => capNhat(i, { thuKhung: !o.thuKhung })}
                          title={o.thuKhung ? 'Mở lại khung trò chuyện' : 'Thu khung trò chuyện, chỉ chừa thanh tên'}
                          aria-label={o.thuKhung ? 'Mở lại khung trò chuyện' : 'Thu khung trò chuyện'}
                          aria-expanded={!o.thuKhung}
                        >
                          {o.thuKhung
                            ? <CaretDown size={18} weight={DAM_ICON} aria-hidden="true" />
                            : <CaretUp size={18} weight={DAM_ICON} aria-hidden="true" />}
                        </button>
                      )}
                      {/**
                        * ⏱ NÚT NẠP LỊCH SỬ CŨ HƠN — đứng trên THANH ĐẦU Ô, ⛔ trong luồng chat.
                        *
                        * 🐛 Hai thiết kế trước đều hỏng, và hỏng ở GỐC chứ ⛔ ở chi tiết:
                        *    nút trong luồng + ghim  ⇒ dải ĐÈ LÊN CHỮ (Owner chụp ảnh 14:46)
                        *    nút trong luồng + ⛔ ghim ⇒ đẩy chữ xuống rồi TRÔI MẤT khi cuộn
                        * ✅ Lên thanh thì ⛔ phải chọn giữa hai cái dở: thanh vốn cố định, ⛔ chồng chữ,
                        *    ⛔ ăn chỗ khung chat, và luôn nhìn thấy dù cuộn tới đâu. (Owner đề xuất.)
                        * ⚠️ ⛔ dùng CaretUp — trùng nút thu khung ngay bên cạnh, người nhìn sẽ lẫn.
                        */}
                      {o.conNua && o.phienHienTai && o.ns && (
                        <button
                          /* 📌 `nut-lich-su` CỐ Ý ⛔ CÓ LUẬT CSS RIÊNG — hình dáng đã do
                             `nut-tron` lo trọn (kể cả lúc bị khoá: `.nut-tron[disabled]`).
                             Giữ tên vì nó là CÁI MÓC để phép đo trình duyệt tìm đúng nút này
                             ở cổng nghiệm thu. ⛔ Đi tìm luật cho nó — ⛔ có luật là ĐÚNG Ý. */
                          className="nut-tron nut-lich-su" type="button"
                          disabled={o.dangNap || o.dangChay}
                          onClick={() => keoThem(i, o.ns!.ten, o.phienHienTai!, o.viTri)}
                          title={o.dangNap ? 'Đang nạp phần cũ hơn…' : 'Nạp thêm phần trò chuyện cũ hơn'}
                          aria-label="Nạp thêm phần cũ hơn"
                        >
                          <ClockCounterClockwise size={18} weight={DAM_ICON} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        className={`nut-tron nut-toan${toanMan === i ? ' bat' : ''}`} type="button"
                        onClick={() => { ghiNhoDay(); datToanMan(toanMan === i ? null : i); }}
                        title={toanMan === i ? 'Thu về lưới' : 'Xem ô này TRỌN khung'}
                        aria-label="Xem trọn khung"
                        aria-pressed={toanMan === i}
                      >
                        {/* Icon ĐỔI THEO TRẠNG THÁI: đang trọn khung thì mũi tên thu vào,
                            chưa thì mũi tên mở ra — nhìn là biết bấm sẽ ra sao. */}
                        {toanMan === i
                          ? <CornersIn size={18} weight={DAM_ICON} aria-hidden="true" />
                          : <CornersOut size={18} weight={DAM_ICON} aria-hidden="true" />}
                      </button>
                      {/**
                        * ⋯ MENU XỔ — gom việc ÍT DÙNG (Owner 17/08: «tôi ít khi bấm nút đóng ô;
                        * gom nút đóng ô và mấy nút vừa đưa vào hồ sơ thành menu bên phải»).
                        * 📌 Nguyên tắc xếp: thanh giữ thứ bấm THƯỜNG XUYÊN, menu chứa thứ THỈNH THOẢNG.
                        * 👑 Ô 1 vẫn CÓ menu (còn cần ranh giới mẩu · danh sách phiên) — chỉ ⛔ không có
                        *    mục «Đóng ô», vì TỔNG GIÁM ĐỐC luôn ngồi đó.
                        */}
                      <div className="boc-menu">
                        <button
                          className={`nut-tron nut-menu${o.moMenu ? ' bat' : ''}`} type="button"
                          onClick={() => capNhat(i, { moMenu: !o.moMenu })}
                          title="Thêm việc khác"
                          aria-label="Menu ô"
                          aria-expanded={o.moMenu}
                        >
                          <DotsThreeVertical size={18} weight={DAM_ICON} aria-hidden="true" />
                        </button>
                        {o.moMenu && (
                          <>
                            {/* Nền trong suốt phủ toàn màn: chạm ra ngoài là ĐÓNG.
                                ⛔ Đừng bắt người dùng bấm đúng cái nút mới đóng được. */}
                            <button
                              className="man-che" type="button" aria-label="Đóng menu"
                              onClick={() => capNhat(i, { moMenu: false })}
                            />
                            <div className="menu-xo" role="menu">
                              {/* 🛑 DỪNG lên ĐẦU MENU — việc gấp nhất phải ở chỗ ngón tay tới trước.
                                  ⚠️ Đánh đổi Owner cần biết: dừng gấp nay mất HAI chạm (⋯ rồi Dừng),
                                     trước là một. Đổi lại thanh chỉ còn 2 nút như Owner muốn. */}
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moHoSo: !o.moHoSo, moMenu: false })}
                              >
                                <Info size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.moHoSo ? 'Đóng hồ sơ ghế' : 'Hồ sơ ghế · phiên · token'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moChonPhien: !o.moChonPhien, moMenu: false })}
                              >
                                <ClockCounterClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.dsPhien.length === 0
                                  ? 'Chưa có phiên nào'
                                  : `Danh sách phiên (${o.dsPhien.length})`}
                              </button>
                              {/* 🔄 NẠP LẠI ĐOẠN CHAT của RIÊNG ô này (Owner 18/08: «giống kiểu F5
                                  trình duyệt… nút load thì CHỈ load mới chat của ô mình bấm»).
                                  ⛔ Khoá khi ô đang chạy (nạp giữa lúc chữ đang chảy = mất chữ) và khi
                                  ô chưa có phiên (⛔ không có gì để nạp). Nhãn NÓI RÕ vì sao khoá —
                                  nút mờ mà ⛔ không nói lý do thì Owner bấm hoài rồi tưởng app hỏng. */}
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                disabled={o.dangChay || !o.phienHienTai}
                                onClick={() => { capNhat(i, { moMenu: false }); void napLaiChat(i); }}
                              >
                                <ArrowsClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.dangChay
                                  ? 'Đang chạy — nạp lại sau'
                                  : !o.phienHienTai
                                    ? 'Chưa có phiên để nạp lại'
                                    : 'Nạp lại đoạn chat'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { hienMau: !o.hienMau, moMenu: false })}
                              >
                                <TextAlignLeft size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.hienMau ? 'Tắt ranh giới mẩu' : 'Hiện ranh giới mẩu'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => { capNhat(i, { moMenu: false }); void phienMoi(i); }}
                              >
                                <Plus size={15} weight={DAM_ICON} aria-hidden="true" />
                                Mở phiên mới
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moDan: !o.moDan, loiDan: '', moMenu: false })}
                              >
                                <ClipboardText size={15} weight={DAM_ICON} aria-hidden="true" />
                                Dán lệnh resume
                              </button>
                              {i > 0 && (
                                <>
                                  <div className="vach-menu" />
                                  <button
                                    className="muc-menu nguy" type="button" role="menuitem"
                                    onClick={() => { capNhat(i, { moMenu: false }); void dongO(i); }}
                                  >
                                    <X size={15} weight={DAM_ICON} aria-hidden="true" />
                                    Đóng ô — bỏ trống
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Dòng nhắc chỉ hiện ở 1 ô — 2/4 ô đã có vạch trạng thái dưới đáy. */}
                    {boCuc === 1 && (
                      <div className="nhac-phien">
                        {o.phienHienTai ? (
                          <>
                            Đang nối phiên <code>{o.phienHienTai.slice(0, 8)}…</code> — phiên cũ giữ nguyên
                            bối cảnh lúc nó được mở.{' '}
                            <button type="button" className="lien-ket" onClick={() => phienMoi(i)}>
                              Mở phiên mới
                            </button>{' '}
                            nếu vừa đổi cấu hình mà chưa thấy tác dụng.
                          </>
                        ) : (
                          <>Phiên mới — sẽ có mã sau lượt gửi đầu tiên.</>
                        )}
                      </div>
                    )}

                    {o.moDan && (
                      <div className="hop-dan">
                        <div className="dan-nhan">
                          Dán lệnh chép từ sổ phiên (<code>resume.erocathanh.com</code>) — nhận cả
                          <code>claude --resume &lt;mã&gt;</code>, lệnh có <code>cd &quot;…&quot;</code>, hoặc mã trần.
                        </div>
                        <div className="dan-hang">
                          <input
                            className="o-dan"
                            value={o.chuoiDan}
                            onChange={(e) => capNhat(i, { chuoiDan: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') danLenhResume(i); }}
                            placeholder='claude --resume 4766aa5e-…'
                            spellCheck={false}
                          />
                          <button className="nut-chu manh" type="button" onClick={() => danLenhResume(i)}>
                            Nối phiên
                          </button>
                        </div>
                        {o.loiDan && <div className="dan-ket-qua">{o.loiDan}</div>}
                        {/* 🧬 App BIẾT bệnh thì app đưa THUỐC — ⛔ đừng dừng ở lời than (Owner chốt round-122 (bos-funnel)). */}
                        {o.phienChoFork && (
                          <div className="khoi-fork">
                            <button className="nut-chu manh" type="button" disabled={o.dangFork} onClick={() => forkVeGhe(i)}>
                              {o.dangFork ? '🧬 Đang fork… (tới 3 phút)' : '🧬 Fork về ghế này'}
                            </button>
                            <span className="ghi-chu-fork">
                              Tạo bản MỚI mang mã riêng cho ghế này. Bản gốc ⛔ KHÔNG bị đụng — app đo lại và báo số.
                            </span>
                            {/**
                              * 🗣 CÂU DẶN ĐẦU — tuỳ chọn. Gửi NGAY sau khi fork xong.
                              *    Bản fork mang mạch cũ nên nó vẫn xưng tên cũ; câu này là chỗ dặn lại.
                              *    Bỏ trống ⇒ ⛔ gửi gì, đường đi y hệt trước.
                              */}
                            <input
                              className="o-dan o-cau-dau"
                              value={o.cauDauFork}
                              onChange={(e) => capNhat(i, { cauDauFork: e.target.value })}
                              placeholder="Câu dặn đầu sau khi fork — bỏ trống cũng được"
                              spellCheck={false}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {o.moChonPhien && (
                      <div className="chon-nhanh">
                        <div className="ds-nhanh">
                          {o.dsPhien.length === 0 && (
                            <div className="rong">Chưa có phiên nào. Gửi câu đầu tiên để mở phiên.</div>
                          )}
                          {o.dsPhien.map((p) => (
                            <div
                              key={p.ma}
                              className={`mon${p.dang_chay ? ' dang-chay' : ''}`}
                              onClick={() => chonPhien(i, p)}
                              title={p.dang_chay
                                ? 'Đang chạy ở nơi khác — nối vào sẽ hỏng bản ghi phiên'
                                : p.ma}
                            >
                              <b>
                                {p.ma === o.phienHienTai ? '● ' : ''}
                                {p.tin_cuoi || '(chưa có tin)'}
                              </b>
                              <i>
                                {p.moc_doc} · {p.so_luot} lượt
                                {p.dang_chay ? ' · ⛔ đang chạy nơi khác' : ''}
                              </i>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="than">
                      <div
                        className="bang-tin"
                        ref={(el) => { bangTinRefs.current[i] = el; }}
                      >
                        {o.dangNap && <div className="moc-ngay">Đang nạp lịch sử phiên…</div>}
                        {!o.dangNap && o.tin.length === 0 && (
                          <div className="rong-o">
                            <div className="to">✨</div>
                            <b>{o.phienHienTai ? 'Phiên trống' : 'Phiên mới'}</b>
                            <span>Gõ câu hỏi bên dưới để bắt đầu.</span>
                          </div>
                        )}
                        {/**
                          * 🐛 Máy chủ ĐÃ báo `cat_dong_qua_dai` từ lâu, nhưng ⛔ ai vẽ nó ra
                          * ⇒ Owner thấy lịch sử khuyết mà **⛔ được nói vì sao**.
                          * 📌 App BIẾT mình đọc hụt thì app phải NÓI RA. Im lặng khuyết còn tệ
                          *    hơn báo lỗi: Owner sẽ tưởng hội thoại đó ⛔ từng tồn tại.
                          */}
                        {/**
                          * 🚩 KHAI RA khi ⛔ hỏi được «ai đang chạy». Hiện ở MỌI ô có ghế, vì hậu quả
                          *    là của TỪNG ô: ô này có thể đang chạy mà nút Dừng ⛔ hiện.
                          * ⛔ gộp «⛔ ai chạy» với «⛔ hỏi được» — hai thứ trông giống hệt nhau trên
                          *    màn hình, mà một cái là sự thật còn một cái là lời nói dối.
                          */}
                        {chuaBietAiChay && (
                          <div className="moc-ngay canh-hut">
                            ⚠️ Chưa hỏi được máy chủ xem ghế nào đang chạy — nút Dừng có thể chưa hiện
                            dù ghế đang chạy thật. Tải lại trang để hỏi lại.
                          </div>
                        )}
                        {o.catDongDai && (
                          <div className="moc-ngay canh-hut">
                            ⚠️ Có một đoạn quá lớn nên app đọc hụt — phần trên đây khuyết một khúc.
                            Bản gốc vẫn còn nguyên trong tệp phiên.
                          </div>
                        )}
                        {o.tin.map((t) => (
                          <div key={t.ma} className={`dong-tin ${t.ai}`}>
                            <div className="anh-nho">{t.ai === 'toi' ? 'ET' : o.ns!.viet_tat}</div>
                            <div>
                              {/* 🔔 Câu này máy tự gửi, ⛔ KHÔNG phải Owner gõ — phải nói rõ ai gọi. */}
                              {t.tu_ai && (
                                <span className="nhan-danh-thuc" title={`Ghế ${t.tu_ai} gọi qua cổng đánh thức`}>
                                  {nhanCua(t.tu_ai)} đánh thức
                                </span>
                              )}
                              {/* 💬 Bong bóng MEMO HOÁ — markdown dựng NGAY CẢ khi đang chảy.
                                  Tin cũ ⛔ không đổi chữ ⇒ ⛔ không dựng lại ⇒ hết nóng máy.
                                  (Học từ `openclaw` trên máy Owner: nó cũng luôn dựng markdown.) */}
                              <BongBong
                                chu={t.chu}
                                ranh={t.ranh}
                                hienMau={o.hienMau && t.ai === 'ho' && !t.loi}
                                loi={t.loi}
                                dangChay={o.dangChay && Boolean(t.dang)}
                              />
                              {(() => {
                                /**
                                 * 🕐 Tin LỊCH SỬ hiện mốc ĐẦY ĐỦ · tin đang sống giữ «HH:mm».
                                 * Cả hai đều gắn mốc đầy đủ vào `title` ⇒ rê chuột là thấy,
                                 * ⛔ tốn một dòng chữ nào trên màn.
                                 * 🔴 Thiếu `luc` ⇒ `dayDu` rỗng ⇒ lùi về `t.gio`, và ⛔ có ngày nào
                                 *    được vẽ ra. Đó là ý đồ: thà thiếu còn hơn BỊA.
                                 */
                                const dayDu = mocDayDu(t.luc);
                                const hien = t.tuLichSu && dayDu ? dayDu : t.gio;
                                return (
                                  <span className="gio" title={dayDu || undefined}>{hien}</span>
                                );
                              })()}
                            </div>
                          </div>
                        ))}
                        {o.dangChay && o.tin[o.tin.length - 1]?.ai === 'toi' && (
                          <div className="dong-tin ho">
                            <div className="anh-nho">{o.ns.viet_tat}</div>
                            <div className="cham-go"><i /><i /><i /></div>
                          </div>
                        )}
                      </div>

                      {/* ⏭ Owner phải THẤY câu mình vừa xếp — ⛔ đừng để bấm gửi mà ⛔ không có gì nhúc nhích */}
                      {o.hangCho.length > 0 && (
                        <div className="dai-hang-cho">
                          <span className="so-cho">⏭ {o.hangCho.length}</span>
                          <span className="chu-cho" title={o.hangCho.join('\n———\n')}>
                            {o.hangCho.length === 1
                              ? `câu đang chờ: ${o.hangCho[0]}`
                              : `câu — sẽ gửi GỘP làm một lượt: ${o.hangCho.join(' / ')}`}
                          </span>
                          <button
                            className="lien-ket" type="button"
                            onClick={() => {
                              /**
                               * ✏️ SỬA HÀNG CHỜ — đổ câu đang chờ NGƯỢC về ô soạn rồi dọn hàng.
                               * Owner 17/08 đổi tên nút từ «bỏ hàng chờ» sang «sửa hàng chờ».
                               * ⚠️ Tôi ⛔ KHÔNG chỉ đổi chữ: nút ghi «sửa» mà bấm vào XOÁ SẠCH thì
                               *    nó NÓI DỐI, và Owner mất luôn câu đã gõ — kiểu mất im lặng.
                               * ⇒ Nay thật sự sửa được: chữ về ô soạn, Owner sửa rồi gửi lại.
                               *    Muốn bỏ hẳn thì xoá trong ô soạn — một thao tác quen thuộc,
                               *    và có thể hoàn tác bằng Ctrl/Cmd+Z, khác hẳn xoá thẳng.
                               */
                              const o2 = dsORef.current[i];
                              const gop = [...(o2?.hangCho ?? []), o2?.soan ?? '']
                                .map((x) => x.trim()).filter(Boolean).join('\n\n');
                              capNhat(i, { soan: gop, hangCho: [] });
                              setTimeout(() => {
                                const el = oGoRefs.current[i];
                                tuCao(el);
                                el?.focus();
                              }, 0);
                            }}
                            title="Đưa các câu đang chờ về ô soạn để sửa lại"
                          >
                            sửa hàng chờ
                          </button>
                        </div>
                      )}

                      <div className="soan">
                        <textarea
                          ref={(el) => { oGoRefs.current[i] = el; }}
                          value={o.soan}
                          onChange={(e) => capNhat(i, { soan: e.target.value })}
                          onInput={(e) => tuCao(e.currentTarget)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            /**
                             * 🇻🇳 BỘ GÕ TIẾNG VIỆT đang soạn dở ⇒ Enter là để CHỐT ÂM,
                             * ⛔ KHÔNG phải để gửi. (Owner 20/08: dính MỖI câu lệnh.)
                             *
                             * Đường đi của lỗi khi ⛔ không chặn:
                             *   âm cuối còn TRONG bộ gõ, ⛔ chưa vào state → Enter chốt âm
                             *   → keydown mang isComposing=true → gui(i) đọc `o.soan` THIẾU âm cuối
                             *   → GỬI CÂU CỤT → bộ gõ chốt xong, onChange đặt soan = âm còn sót
                             *   → ô đang chạy ⇒ âm đó rơi vào HÀNG CHỜ ⇒ bị gửi LẦN HAI.
                             *
                             * ⚠️ PHẢI CÓ CẢ HAI VẾ: `isComposing` là chuẩn; `keyCode === 229`
                             *    là đường lùi cho bộ gõ/trình duyệt cũ ⛔ không đặt isComposing.
                             *    Thiếu một vế là còn máy dính.
                             * 📌 Trả về TRƯỚC `preventDefault` — vì chặn mặc định lúc đang soạn
                             *    còn cản luôn việc chốt âm ở một số trình duyệt.
                             */
                            if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing
                              || e.keyCode === 229) return;
                            // 📱 Máy cảm ứng: Enter là XUỐNG DÒNG. Gửi đã có nút Gửi ngay cạnh.
                            if (camUng) return;
                            // 💻 Máy có bàn phím rời: giữ nguyên nếp cũ — Enter gửi, Shift+Enter xuống dòng.
                            if (e.shiftKey) return;
                            e.preventDefault(); gui(i);
                          }}
                          /**
                           * 🔴 ⛔ ĐÃ BỎ `disabled={o.dangChay}` (17/08/2026).
                           * Owner: *«trong lúc đọc câu trả lời, ⛔ không bấm vào ô để gõ được»*.
                           * Khoá ô lúc ghế đang trả lời khiến HÀNG CHỜ vừa làm thành vô dụng —
                           * ⛔ không gõ được thì lấy gì mà xếp hàng. Terminal cũng ⛔ không khoá bàn phím.
                           */
                          rows={1}
                          /* Ô hẹp thì lời nhắc dài sẽ xuống dòng rồi bị cắt cụt — rút gọn. */
                          placeholder={o.dangChay
                            ? 'Đang trả lời — cứ gõ, gửi là xếp hàng'
                            : boCuc === 1 && !camUng
                              ? `Nhắn cho ${o.ns.nhan}… (Enter để gửi)`
                              : `Nhắn cho ${o.ns.nhan}…`}
                        />
                        {/**
                          * 🛑 NÚT DỪNG — Owner 18/08: «nút stop hiện ngay sau khi bấm nút gửi
                          *    và nằm BÊN TRÁI NÚT GỬI lúc AI đang chạy».
                          * 📌 Trước nó nằm trên thanh đề `.de-o`; đã GỠ HẲN khỏi đó — hai chỗ
                          *    cùng một việc là chỗ để trạng thái lệch nhau mà ⛔ không ai thấy.
                          * ⛔ TUYỆT ĐỐI KHÔNG `disabled` (khác nút Gửi): nó chỉ hiện lúc đang
                          *    chạy, mà đang chạy thì LUÔN phải bấm được.
                          * 📐 Lớp riêng `nut-dung-soan`, cao BẰNG nút Gửi (36px · bc-4 30px).
                          *    ⛔ Đừng tái dùng `.nut-tron` — nó 30/26px, đo cho THANH ĐỀ,
                          *    dùng ở đây là thấp hơn nút Gửi 6px (bc-1/2) và 4px (bc-4).
                          * ♻️ Dùng lại `dungViec(i)` sẵn có, ⛔ không viết hàm mới.
                          */}
                        {o.dangChay && (
                          <button
                            className="nut-dung nut-dung-soan" type="button"
                            onClick={() => dungViec(i)}
                            title="Dừng việc đang chạy ở ô này"
                            aria-label="Dừng việc đang chạy"
                          >
                            <Stop size={16} weight={DAM_ICON} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          className="nut-gui" type="button"
                          onClick={() => gui(i)} disabled={!o.soan.trim()}
                          title={o.dangChay ? 'Ghế đang trả lời — câu này sẽ xếp hàng, xong là gửi tiếp' : 'Gửi'}
                        >
                          {/* Owner 17/08: nhãn về «Gửi» như ban đầu — CHỈ đổi chữ,
                              hành vi giữ nguyên (đang chạy thì vẫn xếp hàng).
                              Ý nghĩa vẫn nói rõ ở tooltip + dải hàng chờ bên dưới. */}
                          Gửi
                        </button>
                      </div>

                      {/**
                        * ℹ THẺ HỒ SƠ — thay cho vạch trạng thái cũ chạy suốt dưới ô chat.
                        * Owner 17/08: *«bỏ phần hiển thị token và tiền đi cho nó có chỗ hiện mấy
                        * nút khác; token và mã phiên đưa vào chữ i ⇒ bấm mở»*.
                        * ⛔ KHÔNG xoá dữ liệu — chỉ dời chỗ. Token vẫn là thứ ăn vào hạn mức tuần,
                        * Owner phải xem được khi cần; chỉ là ⛔ không chiếm chỗ thường trực nữa.
                        */}
                      {o.moHoSo && (
                        <div className="the-ho-so">
                          <div className="hs-hang">
                            <span className="hs-nhan">Ghế</span>
                            <span className="hs-gia"><b>{o.ns.nhan}</b> · <code>{o.ns.ten}</code></span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Vai</span>
                            <span className="hs-gia">{o.ns.vai} · phòng {o.ns.ten_phong}</span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Phiên</span>
                            <span className="hs-gia">
                              <span className={`cham-noi${o.phienHienTai ? '' : ' tat'}`} />
                              {o.phienHienTai
                                ? <><code>{o.phienHienTai}</code>{o.noiTiep ? ' · giữ mạch' : ''}</>
                                : 'Phiên mới — chưa có mã'}
                            </span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Lượt vừa rồi</span>
                            <span className="hs-gia">
                              {o.token === null && o.chiPhi === null
                                ? '— chưa có số đo'
                                : <>
                                    {o.token !== null && <b style={{ color: 'var(--vang-sang)' }}>{o.token.toLocaleString('vi-VN')} token</b>}
                                    {o.token !== null && o.chiPhi !== null && ' · '}
                                    {o.chiPhi !== null && `≈ ${o.chiPhi.toFixed(4)} USD`}
                                  </>}
                            </span>
                          </div>
                          {o.ns.soul && (
                            <div className="hs-hang">
                              <span className="hs-nhan">Linh hồn</span>
                              <span className="hs-gia"><code>{o.ns.soul}</code></span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
