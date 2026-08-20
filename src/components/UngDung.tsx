'use client';

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
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
interface Tin {
  ai: 'toi' | 'ho'; chu: string; gio: string; loi?: boolean;
  /**
   * 🕐 MỐC THẬT (epoch ms) — việc ②A, 19/08/2026.
   * `gio` là chuỗi HIỂN THỊ "22:11" ⇒ ⛔ không suy ra được NGÀY. Ca 23:59 → 00:01 hỏng chắc.
   * ⚠️ TUỲ CHỌN: 11,5% dòng trong tệp phiên thật ⛔ KHÔNG có `timestamp`.
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

const SO_O = 6;   // 4 → 6 (Owner 20/08: bố cục 6 ô, giấu 2 cột trái)
const maOCua = (i: number) => `o-${i + 1}`;
/**
 * 🔔 Nhịp thăm dò cổng đánh thức. 5 giây = giữa khoảng Owner chốt (4–6s).
 * Một lần gọi gộp CẢ 4 ô ⇒ 12 lượt gọi mỗi phút, ⛔ không phải 48.
 */
const NHIP_THAM_DO_MS = 5_000;
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
  [BO_MARKETING, BO_VAN_HANH].some((bo) => bo.every((x, i) => ten[i] === x));

/** Icon số ô — thay cho chữ «Ô 1/2/3/4» (Owner 17/08: nhãn chữ trông xấu). */
// Owner 17/08: bỏ KHUNG VUÔNG quanh số (NumberSquare*) để chữ số to hẳn ⇒ dùng số TRẦN.
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
  dsPhien: TomTatPhien[];
  phienHienTai: string | null;
  moChonPhien: boolean;
  moDan: boolean;
  chuoiDan: string;
  loiDan: string;
  /** 🧬 Mã phiên đọc được nhưng thuộc THƯ MỤC KHÁC — chờ Owner bấm «Fork về ghế này». */
  phienChoFork: string | null;
  dangFork: boolean;
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
  chiPhi: null, token: null, noiTiep: false, dsPhien: [],
  phienHienTai: null, moChonPhien: false, moDan: false, chuoiDan: '', loiDan: '', phienChoFork: null, dangFork: false,
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
  const huyRefs = useRef<Array<AbortController | null>>([null, null, null, null]);
  const dauVetCuon = useRef<string[]>(['', '', '', '']);
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

  /* ---------- Cuộn xuống đáy — CHỈ ô nào vừa có chữ mới ---------- */
  useEffect(() => {
    dsO.forEach((o, i) => {
      const cuoi = o.tin[o.tin.length - 1];
      const dau = `${o.tin.length}:${cuoi ? cuoi.chu.length : 0}`;
      if (dau === dauVetCuon.current[i]) return;
      dauVetCuon.current[i] = dau;
      const b = bangTinRefs.current[i];
      if (b) b.scrollTop = b.scrollHeight;
    });
  }, [dsO]);

  /* Đổi bố cục → ô cao thấp khác nhau, phải neo lại đáy hội thoại. */
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      bangTinRefs.current.forEach((b) => { if (b) b.scrollTop = b.scrollHeight; });
    });
    return () => cancelAnimationFrame(t);
  }, [boCuc]);

  /* ---------- Nạp danh sách phiên thật của một ô ---------- */
  const napDsPhien = useCallback(async (i: number, ten: string): Promise<TomTatPhien[]> => {
    try {
      const r = await fetch(`/api/phien?ma_o=${maOCua(i)}&ma_nhan_su=${encodeURIComponent(ten)}`);
      const j = await r.json();
      const ds: TomTatPhien[] = Array.isArray(j.phien) ? j.phien : [];
      capNhat(i, { dsPhien: ds });
      return ds;
    } catch { capNhat(i, { dsPhien: [] }); return []; }
  }, [capNhat]);

  /* ---------- Nạp LỊCH SỬ THẬT của một phiên vào một ô ---------- */
  const napLichSu = useCallback(async (i: number, ten: string, maPhien: string) => {
    capNhat(i, { dangNap: true });
    try {
      const r = await fetch(
        `/api/phien?ma_nhan_su=${encodeURIComponent(ten)}&ma_phien=${encodeURIComponent(maPhien)}`,
      );
      const j = await r.json();
      capNhat(i, { tin: Array.isArray(j.lich_su) ? j.lich_su : [], noiTiep: true });
    } catch { capNhat(i, { tin: [] }); } finally { capNhat(i, { dangNap: false }); }
  }, [capNhat]);

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
    if (!o?.ns || !o.phienHienTai || o.dangChay) return;   // chốt ②: nút khoá rồi vẫn chặn lần nữa
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
        capNhat(i, { ns });
        void napDsPhien(i, ten);

        const khopNguoi = ghi?.ma_nhan_su === ten;
        if (khopNguoi && ghi?.ma_phien) {
          capNhat(i, { phienHienTai: ghi.ma_phien });
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
    // Mặc định NỐI LẠI phiên gần nhất còn nối được — ⛔ không mặc định đẻ phiên mới.
    const ganNhat = ds.find((p) => !p.dang_chay);
    if (ganNhat) {
      capNhat(i, { phienHienTai: ganNhat.ma });
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
        capNhat(i, { phienHienTai: phienLuu, chiPhi: null, token: null });
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
    capNhat(i, { moChonPhien: false, phienHienTai: p.ma, chiPhi: null, token: null });
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
      const r2 = await fetch(
        `/api/phien?ma_nhan_su=${encodeURIComponent(o.ns.ten)}&ma_phien=${encodeURIComponent(String(j.ma_moi))}`,
      );
      const j2 = await r2.json();
      const lichSu = Array.isArray(j2.lich_su) ? j2.lich_su : [];
      capNhat(i, {
        dangFork: false, phienChoFork: null, chuoiDan: '',
        phienHienTai: String(j.ma_moi), tin: lichSu, noiTiep: true, chiPhi: null, token: null,
        loiDan:
          `✅ Fork xong — mã MỚI ${String(j.ma_moi).slice(0, 8)}… · đọc được ${lichSu.length} lượt · chuỗi ${tang} tầng. ` +
          `Bản gốc ${dc?.nguyen_ven ? 'NGUYÊN VẸN' : '⚠️ ĐÃ ĐỔI — báo ngay'} ` +
          `(${dc?.so_dong_truoc} dòng · ${dc?.byte_truoc} byte).`,
      });
      void napDsPhien(i, o.ns.ten);
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
      const r = await fetch(
        `/api/phien?ma_nhan_su=${encodeURIComponent(o.ns.ten)}&ma_phien=${encodeURIComponent(ma)}`,
      );
      const j = await r.json();
      const lichSu = Array.isArray(j.lich_su) ? j.lich_su : [];
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
    capNhat(i, {
      moChonPhien: false, phienHienTai: null, tin: [], noiTiep: false, chiPhi: null, token: null,
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
      tin: [...cu.tin, { ai: 'toi', chu: cauHoi, gio: gioBayGio(), luc: Date.now(), ...(tuAi ? { tu_ai: tuAi } : {}) }],
    }));

    // ⚠️ Hàm cập nhật phải THUẦN — mọi thứ nó cần đều đọc từ `cu`, ⛔ không đọc cờ bên ngoài.
    const veChu = (c: string) => {
      capNhat(i, (cu) => {
        const n = [...cu.tin];
        const cuoi = n[n.length - 1];
        if (cuoi && cuoi.ai === 'ho' && cuoi.dang) {
          n[n.length - 1] = { ...cuoi, chu: cuoi.chu + c, ranh: [...mocMau] };
        } else {
          n.push({ ai: 'ho', chu: c, gio: gioBayGio(), luc: Date.now(), dang: true, ranh: [...mocMau] });
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
      capNhat(i, (cu) => ({ tin: [...cu.tin, { ai: 'ho', chu, gio: gioBayGio(), luc: Date.now(), loi: true }] }));
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

  const oGoRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const tuCao = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const guiRef = useRef(gui);
  guiRef.current = gui;
  const dangThamDo = useRef(false);

  useEffect(() => {
    const hen = setInterval(async () => {
      // ⛔ Nhịp trước chưa về thì bỏ nhịp này — ⛔ đừng chồng yêu cầu lên nhau.
      if (dangThamDo.current) return;

      /**
       * 🔥 CHỐNG NÓNG MÁY (Owner 17/08: «điện thoại nóng hơn bình thường»).
       * Tab ẩn / khoá màn ⇒ NGỦ. Bản cũ vẫn gọi mạng 12 lần mỗi phút kể cả khi
       * Owner ⛔ không nhìn — mỗi lần là một nhịp bật sóng, tốn pin và sinh nhiệt
       * mà ⛔ chẳng ai đọc kết quả. Mở lại tab là nhịp sau chạy tiếp ngay.
       */
      if (typeof document !== 'undefined' && document.hidden) return;

      // Chỉ hỏi hộ ô ĐANG CÓ GHẾ và ⛔ KHÔNG đang chạy (ô bận thì đánh thức cũng vô ích).
      const dsHoi = dsORef.current
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => o.ns && !o.dangChay && !o.dangNap)
        .map(({ i }) => maOCua(i));
      if (dsHoi.length === 0) return;

      dangThamDo.current = true;
      try {
        const r = await fetch('/api/danh-thuc/nhan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ds_o: dsHoi }),
        });
        if (!r.ok) return;
        const j = await r.json();
        const nhan = (j?.nhan ?? {}) as Record<string, { tu_ai: string; cau_hoi: string }>;

        for (const [maO, y] of Object.entries(nhan)) {
          const i = Number(maO.slice(2)) - 1;
          if (!Number.isInteger(i) || i < 0 || i >= SO_O) continue;
          const o = dsORef.current[i];
          // Ô vừa bận đi trong lúc chờ mạng → bỏ lượt này, ⛔ đừng chen vào phiên đang chạy.
          if (!o?.ns || o.dangChay) continue;
          void guiRef.current(i, y.cau_hoi, y.tu_ai);
        }
      } catch {
        /* mất mạng một nhịp — nhịp sau thử lại, ⛔ đừng làm ồn */
      } finally {
        dangThamDo.current = false;
      }
    }, NHIP_THAM_DO_MS);
    return () => clearInterval(hen);
  }, []);

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
                      <div className="anh-o">{o.ns.viet_tat}</div>
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
                        {/**
                          * 🚦 ĐÈN TRẠNG THÁI (Owner 17/08). Gắn vào chính nút số ô ⇒ ⛔ không tốn
                          * thêm chỗ trên thanh vốn chỉ còn 3 thứ.
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
                      <button
                        className={`nut-tron nut-toan${toanMan === i ? ' bat' : ''}`} type="button"
                        onClick={() => datToanMan(toanMan === i ? null : i)}
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
                        {o.tin.map((t, k) => (
                          <div key={k} className={`dong-tin ${t.ai}`}>
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
                              <span className="gio">{t.gio}</span>
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
