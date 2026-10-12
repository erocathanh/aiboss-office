// Hằng số, dữ liệu tĩnh và hàm phụ trợ cấp mô-đun của `UngDung.tsx` — TRỤC ②.
//
// 🔑 MỌI DÒNG DƯỚI ĐÂY DỜI NGUYÊN VĂN từ `UngDung.tsx` dòng 20-37, 47-298, 343-350, 356.
//    Chữ `export` KHÔNG gắn vào từng khai báo — gắn là SỬA, và `ai/so-diff.py` sẽ đỏ đúng như
//    nó phải đỏ. Xuất bằng MỘT câu `export { … }` ở cuối tệp.
//
// ⚠️ `let demMaTin` và `datMa` là MỘT CẶP: `datMa` đóng kín trên bộ đếm ấy. Tách ra hai tệp là
//    hỏng IM LẶNG. Đo trước khi dời: `demMaTin` chỉ xuất hiện 2 lần, cả hai ở dòng 71-72.
//
// 🔴 VÌ SAO `dungTruocKhiVe` KHÔNG nằm ở đây — PM chốt 🅐 ngày 04/09:
//    Nó là BÍ DANH của useEffect/useLayoutEffect. Bảng bí danh của bộ đo dựng THEO TỪNG TỆP,
//    nên dời nó khỏi `UngDung.tsx` làm thước MÙ 4 lời gọi bí danh: soMoc tụt 70 → 67 — ĐÚNG BẰNG
//    con số của bộ dò HỎNG ngày trước. Hai nguyên nhân khác nhau, cùng một con số, nên nếu hạ
//    mong đợi xuống 67 cho «xanh» thì đã tắt đúng cái chốt chặn bí danh tái diễn.
//    ⇒ Giữ nó lại. Nâng bảng bí danh thành XUYÊN TỆP là việc ⑪ riêng.
//
// 📌 Chú thích «MÃ RIÊNG của một bong bóng» tả `datMa` (dòng 71) nhưng bản gốc đặt ở dòng 20 —
//    đã LẠC KHỎI mã nó tả từ trước. Dời NGUYÊN TRẠNG, KHÔNG nắn: nắn là sửa.
import type { CapGheDungSan, OChat } from '@/components/ung-dung/kieu';
import {
  NumberOne, NumberTwo, NumberThree, NumberFour, NumberFive, NumberSix,
} from '@phosphor-icons/react/dist/ssr';

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

/**
 * 🏫 BỘ «QUẢN LÝ TRƯỜNG» — dựng lại 31/08 theo lệnh Owner. KHÁC «Quản Lý Cũ» ở CHỖ ĐỨNG:
 * ```
 * Quản Lý Cũ     thu_muc = /Users/erocathanh  ⇒ ĐỌC THẲNG phiên gốc ở kho nhà
 * Quản Lý Trường thư mục RIÊNG `~/<tên ghế>`  ⇒ chỗ để FORK clone tệp .jsonl vào
 * ```
 * 🔑 Hai bộ KHÔNG thay thế nhau — chúng là HAI BƯỚC của một việc:
 *    ① mở «Quản Lý Cũ» đọc phiên gốc   ② fork sang «Quản Lý Trường» thành phiên MỚI
 *      mà vẫn mang theo lịch sử.
 * ⚠️ Mã phiên ở đây đi vào `goiY` (mồi ô dán), KHÔNG vào `phien` — xem chú thích `CapGhe`.
 *    Nhét vào `phien` là ô mở ra TRỐNG và KHÔNG có nút Fork.
 */
const BO_QUAN_LY_TRUONG: CapGheDungSan[] = [
  { ten: 'claude-eroca-boss',       phien: null },
  { ten: 'claude-hieu-truong',      phien: null, goiY: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b' },
  { ten: 'claude-phong-dao-tao',    phien: null, goiY: '5956cd23-1533-4565-a7fc-0050769887dc' },
  { ten: 'claude-phong-cong-nghe',  phien: null, goiY: '7911258a-2109-4d48-8a53-5286836daef6' },
  { ten: 'claude-phong-tai-chinh',  phien: null, goiY: '823ce356-1bb7-4174-991f-8ccee76582fd' },
  { ten: 'claude-phong-hanh-chinh', phien: null, goiY: '1f08afd0-73d8-45e9-86b5-0a06417bf7e1' },
];

const BO_QUAN_LY_CU: CapGheDungSan[] = [
  { ten: 'claude-eroca-boss',            phien: null },
  { ten: 'claude-bos-funnel-pm',         phien: 'e888d879-dcfe-4dd5-87e1-3df4cc7bfe6b' },
  { ten: 'claude-giao-trinh-eeat',       phien: '5956cd23-1533-4565-a7fc-0050769887dc' },
  { ten: 'claude-web-funnel',            phien: '7911258a-2109-4d48-8a53-5286836daef6' },
  { ten: 'claude-email-funnel-pm-296',   phien: '823ce356-1bb7-4174-991f-8ccee76582fd' },
  { ten: 'claude-tro-ly-dieu-hanh',      phien: '1f08afd0-73d8-45e9-86b5-0a06417bf7e1' },
];

/**
 * 🏭 BỘ «PHÒNG CÔNG NGHỆ» — Owner xin lưu lại ĐỘI ĐANG NGỒI (02/09/2026).
 *
 * Đây KHÔNG phải một đội dựng ra để thử: đúng sáu ghế đã làm bản vá tay cầm hôm nay. Owner muốn
 * bấm một nút là gọi lại đủ đội, thay vì dán sáu mã phiên bằng tay.
 *
 * 🔒 GHIM SẴN MÃ PHIÊN (`phien`, KHÔNG phải `goiY`) — cùng kiểu `BO_QUAN_LY_CU`, và cố ý:
 *    sáu ghế này đứng ở THƯ MỤC GỐC `/Users/erocathanh`, tức phiên đọc thẳng được. Nhét vào
 *    `goiY` thì ô mở ra TRỐNG và Owner phải bấm «Nối phiên» sáu lần — hỏng đúng thứ nút này
 *    sinh ra để bỏ.
 *
 * 📏 ĐO SỐNG NGAY TRƯỚC KHI GÕ (`/api/o`, 02/09 15:2x), KHÔNG chép từ ảnh chụp trong tin nhắn:
 *    sáu ô · sáu mã phiên khớp từng ký tự với danh sách dưới đây.
 * ⚠️ Mã phiên là ẢNH CHỤP MỘT LÚC. Ghế nào fork sang phiên mới thì mục tương ứng thành ôi, và
 *    nó ôi trong IM LẶNG — ô sẽ mở ra một phiên cũ trông vẫn bình thường. Đo lại trước khi tin.
 */
const BO_CONG_NGHE: CapGheDungSan[] = [
  { ten: 'claude-eroca-boss',       phien: '9050b662-3b7f-41f9-b55f-cbb124588ceb' },
  { ten: 'claude-aiboss-app-pm',    phien: 'b195c209-d020-4720-83a7-8fe7c47140c8' },
  { ten: 'claude-phong-ban-pm',     phien: '73d7ce9a-4be9-4833-8759-e18c96762d83' },
  { ten: 'claude-aiboss-app-exe',   phien: '1b696a63-f02d-405d-918e-0a909d8d6ae4' },
  { ten: 'claude-zalo-bot',         phien: '93cdee4b-c31e-4484-a2ee-8b2385bb480b' },
  { ten: 'claude-tro-ly-dieu-hanh', phien: '1f08afd0-73d8-45e9-86b5-0a06417bf7e1' },
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
// ── SỔ ĐĂNG KÝ BỘ GHẾ — MỘT NGUỒN DUY NHẤT (việc ④, PM giao 04/09) ─────────────────
// 🕳 VÌ SAO GOM: trước đây thêm một bộ phải sửa HAI chỗ — khai mảng, rồi khai lại tên bộ đó
//    trong `LA_BO_DUNG_SAN`. Chú thích cũ ngay dưới đây đã cảnh báo, nguyên văn:
//    «THÊM BỘ MỚI thì PHẢI thêm vào đây. Quên = lỗi 20/08 quay lại: Owner bấm hai bộ liên tiếp
//     là đội THẬT của mình bị ghi đè, KHÔNG có đường về.»
//    Việc ④ còn vẽ 5 bộ ra menu cột danh bạ ⇒ nếu chép danh sách sang đó nữa thì thành BA chỗ,
//    và người thêm bộ thứ sáu sẽ quên một trong ba.
// 🔑 Hỏng kiểu này KHÔNG KÊU: menu vẫn hiện, nút vẫn chạy, chỉ đội thật của Owner bị ghi đè
//    lặng lẽ. Nên gom về một sổ là DỌN CÁI BẪY ĐANG CÓ, không phải việc phụ.
// ⚖️ Sổ chuẩn hoá luôn hình dạng: 5 bộ vốn KHÔNG cùng kiểu (2 bộ là mảng chuỗi, 3 bộ là mảng
//    `{ten, phien}`) nên chỗ gọi phải nhớ bộ nào cần `.map(phien: null)`. Nay sổ trả về MỘT kiểu.
// 🎨 `icon` để dạng KHOÁ chữ, KHÔNG để component: tệp này là `.ts`, KHÔNG chứa JSX.
type BoGheDungSan = {
  ma: string;
  ten: string;
  ghe: CapGheDungSan[];
  icon: 'vuong-mien' | 'danh-sach' | 'bang-ghi';
};

const chuoiThanhGhe = (ds: string[]): CapGheDungSan[] => ds.map((t) => ({ ten: t, phien: null }));

const SO_BO_GHE: BoGheDungSan[] = [
  { ma: 'marketing',      ten: 'Phòng Marketing',  ghe: chuoiThanhGhe(BO_MARKETING),  icon: 'vuong-mien' },
  { ma: 'van-hanh',       ten: 'Vận hành',         ghe: chuoiThanhGhe(BO_VAN_HANH),   icon: 'danh-sach' },
  { ma: 'quan-ly-cu',     ten: 'Quản Lý Cũ',       ghe: BO_QUAN_LY_CU,                icon: 'bang-ghi' },
  { ma: 'quan-ly-truong', ten: 'Quản Lý Trường',   ghe: BO_QUAN_LY_TRUONG,            icon: 'bang-ghi' },
  { ma: 'cong-nghe',      ten: 'Phòng Công Nghệ',  ghe: BO_CONG_NGHE,                 icon: 'bang-ghi' },
];

// Đọc TỪ SỔ. Thêm một bộ vào `SO_BO_GHE` là hàm này biết ngay — KHÔNG còn nửa sau phải nhớ.
const LA_BO_DUNG_SAN = (ten: (string | null)[]): boolean =>
  SO_BO_GHE.some((bo) => bo.ghe.map((g) => g.ten).every((x, i) => ten[i] === x));

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


const O_TRONG: OChat = {
  ns: null, tin: [], soan: '', dangChay: false, dangNap: false,
  chiPhi: null, token: null, noiTiep: false, conNua: false, catDongDai: false, viTri: 0, dsPhien: [],
  phienHienTai: null, moChonPhien: false, moDan: false, chuoiDan: '', loiDan: '', phienChoFork: null, dangFork: false, cauDauFork: '',
  // ¶ MẶC ĐỊNH TẮT (đổi 17/08/2026 sau phản hồi thật của Owner).
  // Bật mặc định ⇒ mọi câu in THÔ ⇒ Owner thấy nguyên dấu ** và tưởng markdown hỏng.
  // Tính năng giữ nguyên, chỉ đổi mặc định: cần xem nhịp mẩu thì bấm ¶.
  hienMau: false, hangCho: [], moHoSo: false, moMenu: false, matKetNoi: false, thuKhung: false,
};

function boDau(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function gioBayGio(): string {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const MAU_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export {
  LECH_COI_LA_DAY,
  mocDayDu,
  datMa,
  maOCua,
  NHIP_THAM_DO_MS,
  KHOA_BO_CUC,
  KHOA_TIEU_DIEM,
  KHOA_BO_GHE_CU,
  KHOA_AN_COT,
  BO_MARKETING,
  BO_VAN_HANH,
  BO_QUAN_LY_TRUONG,
  BO_QUAN_LY_CU,
  BO_CONG_NGHE,
  LA_BO_DUNG_SAN,
  SO_BO_GHE,
  ICON_SO_O,
  DAM_ICON,
  MAU_PHONG,
  O_TRONG,
  boDau,
  gioBayGio,
  MAU_UUID,
};
