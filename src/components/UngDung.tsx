'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
/**
 * 🎨 Bộ icon: `@phosphor-icons/react` — bộ ƯU TIÊN SỐ 1 trong skill `taste` (§3.C),
 * và `lucide-react` thì skill KHUYÊN TRÁNH. MỘT họ icon cho cả dự án, ⛔ không trộn.
 * Dùng bản `ssr` cho hợp Next. Độ đậm thống nhất `bold` — ⛔ đừng trộn nhiều độ đậm.
 */
import Link from 'next/link';
import {
  NumberOne, Info, DotsThreeVertical, ClockCounterClockwise, TextAlignLeft, X,
  Stop, Plus, ClipboardText, ArrowLeft, CornersOut, CornersIn, Crown, List, ChatCircleDots,
  CaretUp, CaretDown, ArrowsClockwise, GearSix,
} from '@phosphor-icons/react/dist/ssr';
import { SO_O } from '@/lib/so-o';
import type { PhongBan, NhanSu, TomTatPhien, Tin, OChat } from '@/components/ung-dung/kieu';

/* Bố cục + tên lớp CSS bê nguyên bản mẫu 09 Owner đã duyệt. ⛔ Không thiết kế lại. */

/**
 * ⚙️ Chạy TRƯỚC khi trình duyệt VẼ, nhưng ⛔ nổ cảnh báo lúc dựng phía máy chủ.
 * Trang này là thành phần máy khách nhưng Next VẪN dựng thử trên máy chủ, mà ở đó ⛔ có DOM
 * ⇒ chọn theo môi trường. Đặt ở tầng TỆP để thứ tự hook ⛔ bao giờ đổi giữa hai lần vẽ.
 * 📌 Cần «trước khi vẽ» vì việc neo chỗ đọc mà chạy SAU khi vẽ thì mắt Owner kịp thấy
 *    khung nhảy xuống đáy rồi mới bật ngược lên — vá xong vẫn còn giật.
 */
const dungTruocKhiVe = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

import { BongBong } from '@/components/ung-dung/bong-bong';
import {
  CAU_LOI_O, cauNhacNapBoGhe, chayNapBoGhe, ghiSoO, soMotO,
  type KetQuaDatNguoi, type LyDoHong,
} from '@/components/ung-dung/nap-bo-ghe';
import {
  LECH_COI_LA_DAY, mocDayDu, datMa, maOCua, NHIP_THAM_DO_MS,
  KHOA_BO_CUC, KHOA_TIEU_DIEM, KHOA_BO_GHE_CU, KHOA_AN_COT,
  LA_BO_DUNG_SAN, SO_BO_GHE, ICON_SO_O, DAM_ICON, MAU_PHONG, O_TRONG,
  boDau, gioBayGio, MAU_UUID,
} from '@/components/ung-dung/hang-so';

import type { ViSaoDung } from '@/lib/kho-tien-trinh';
// ⏱ Hạn fork: NHẬP từ nguồn duy nhất, KHÔNG gõ lại con số. Xem chú thích dài trong tệp đó.
import { moTaHanFork } from '@/lib/han-gio-fork';


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

  /* ⑲③ 05/09 — Owner: «vừa có trên dưới, vừa có TRÁI-PHẢI, KHÔNG phải bỏ trên-dưới đi».
     🔑 Vì sao KHÔNG nhét trái-phải thành một giá trị mới của `boCuc`: `boCuc` đang được đọc như
        SỐ Ô ở 15 chỗ (`k < boCuc`, `dsO.slice(0, boCuc)`, `tieuDiem >= bc`…). Thêm một giá trị
        khôngphải-số vào đó là bắt mọi phép so kia gánh thêm nghĩa thứ hai — đúng cái bệnh «một
        thứ gánh hai nghĩa» đã ăn ba vòng soi hôm 01/09.
     ⇒ Tách hẳn: `boCuc` = MẤY Ô · `kieuHai` = CHIA CHIỀU NÀO. Hai trục vuông góc, khôngphải một. */
  const [kieuHai, datKieuHai] = useState<'tren-duoi' | 'trai-phai'>('tren-duoi');

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
  /**
   * 🔴 LƯU CẶP (ghế, phiên) — ⛔ KHÔNG chỉ lưu mã ghế.
   * `claude-aiboss-app-pm` lần theo `/api/o` và bắt đúng chỗ tôi làm hụt:
   *   POST { ma_o, ma_nhan_su: 'ghế MỚI', ma_phien: null }
   *   → o/route.ts:56 chốt chống xoá CHỈ nổ khi CÙNG ghế ⇒ ca ĐỔI GHẾ nó ⛔ KHÔNG che
   *   → kho-phien.ts đặt ma_phien = null ⇒ LIÊN KẾT PHIÊN CŨ BỊ XOÁ
   * ⇒ lưu mỗi tên ghế thì «quay về» trả đúng TÊN mà ô RỖNG LỊCH SỬ — đúng vết đau 18/08.
   */
  /**
   * @property goiY MÃ PHIÊN GỢI Ý — mồi sẵn vào ô dán, KHÔNG nối thẳng.
   *
   * 🕳 Vì sao KHÔNG dùng `phien`: `phien` đi thẳng qua `ghiO` + `napLichSu`, mà `/api/o`
   *    CHỈ nhận phiên có thật trong kho của ĐÚNG ghế đó. Phiên «Quản Lý Cũ» nằm ở kho NHÀ
   *    ⇒ ghế «Quản Lý Trường» (thư mục RIÊNG) bị chặn ⇒ ô mở ra TRỐNG, và KHÔNG có nút Fork
   *    (nút đó chỉ hiện ở đường DÁN TAY).
   * ✅ `goiY` mồi vào ô dán ⇒ Owner bấm «Nối phiên» ⇒ app thấy phiên ở thư mục khác
   *    ⇒ chìa nút «Fork về ghế này» ⇒ tệp .jsonl được clone sang thư mục ghế mới.
   *    Đúng luồng Owner mô tả 31/08.
   */
  type CapGhe = { ten: string | null; phien: string | null; goiY?: string };
  const [boGheCu, datBoGheCu] = useState<CapGhe[] | null>(null);
  const [nhacBoGhe, datNhacBoGhe] = useState('');
  // 🔴 VERDICT VÒNG 2 ⑤: câu nhắc dạng `fixed` KHÔNG tự tắt ⇒ nó nằm lại vĩnh viễn trên màn.
  //    Một câu báo không biết biến mất thì nó thôi là câu BÁO, nó thành một vết bẩn cố định.
  // ⏱ Tự tắt sau 6 giây. Dọn bộ hẹn khi chữ đổi hoặc khi rời trang — KHÔNG để bộ hẹn cũ
  //    tắt mất câu nhắc MỚI vừa hiện (đó là lỗi hay gặp khi quên hàm dọn).
  useEffect(() => {
    if (!nhacBoGhe) return undefined;
    const h = setTimeout(() => datNhacBoGhe(''), 6000);
    return () => clearTimeout(h);
  }, [nhacBoGhe]);
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
  const [manHep, datManHep] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const mqHep = window.matchMedia('(max-width: 768px)');
    const doLai = () => {
      datCamUng(mq.matches);
      datManHep(mqHep.matches);
    };
    doLai();
    mq.addEventListener('change', doLai);
    mqHep.addEventListener('change', doLai);
    return () => {
      mq.removeEventListener('change', doLai);
      mqHep.removeEventListener('change', doLai);
    };
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

  /**
   * 💬 MỘT CỬA vừa NÓI cho ô đó, vừa TRẢ kết quả lên trên. VIỆC ㉑ 05/09.
   *
   * 🕳 Ba vòng trước tôi vá theo TẦNG: vòng 3 bắt caller của `ghiO`, rồi lỗi lộ ra ở caller của
   *    `datNguoi` — cao hơn một tầng. Vá tầng nào thì tầng TRÊN nó lại lọt, và luôn còn một tầng.
   * 🔑 Nên lớp vá thật sự nằm Ở ĐÂY, khôngphải ở chỗ gọi: **hàm tự nói cho ô của nó.** Chỗ gọi
   *    nào bỏ qua kết quả — hôm nay, hay do người khác thêm vào tháng sau, ở tầng nào cũng vậy —
   *    thì người dùng VẪN thấy một câu. Kết quả trả lên trên là để GỘP, khôngphải là đường duy nhất.
   * 📌 Đây là lý do tôi làm khác gợi ý «bắt mọi chỗ gọi phải đọc kết quả»: cách đó đúng nhưng nó
   *    phụ thuộc vào việc mình rà HẾT chỗ gọi — mà ba vòng vừa rồi đã chứng minh là rà khônghết.
   *    Tôi vẫn làm cả phần đó (lớp 2, dưới đây), nhưng khôngdựa vào nó làm phanh duy nhất.
   */
  const noiHong = useCallback((i: number, ly: LyDoHong) => {
    capNhat(i, { loiDan: CAU_LOI_O[ly] });
  }, [capNhat]);
  const baoHong = useCallback((i: number, ly: LyDoHong): KetQuaDatNguoi => {
    noiHong(i, ly);
    return { xong: false, hong: ly };
  }, [noiHong]);

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
  /**
   * 🔁 TRẢ VỀ KẾT QUẢ (P0 tab-tỉnh-lại · 01/09/2026) — trước đây hàm này trả `void`,
   *    nên NGƯỜI GỌI KHÔNG PHÂN BIỆT ĐƯỢC «đã nạp» với «trượt rồi im».
   *    Đường tỉnh-dậy cần thử lại, mà muốn thử lại thì phải BIẾT mình vừa trượt.
   * ⚠️ Ba kết quả, và hai cái KHÔNG-thành-công KHÁC HẲN nhau — gộp lại là thử lại oan:
   *      'xong'     nạp được
   *      'loi-thoi' lần gọi này BỊ LẦN MỚI HƠN VƯỢT MẶT ⇒ ĐÚNG như thiết kế, KHÔNG thử lại
   *      'hong'     gọi mạng/máy chủ trượt thật ⇒ MỚI đáng thử lại
   * 📌 Bốn đường gọi cũ (:931 :1075 :1152 :1262 :1278) đều BỎ QUA giá trị trả về
   *    ⇒ hành vi của chúng KHÔNG đổi một chút nào.
   */
  const napLichSu = useCallback(async (
    i: number, ten: string, maPhien: string,
  ): Promise<'xong' | 'loi-thoi' | 'hong'> => {
    const ma = xinMaMoi(i);
    capNhat(i, { dangNap: true });
    try {
      const kq = await docLichSu(ten, maPhien, undefined, () => conMoiNhat(i, ma));
      if (!kq) return 'loi-thoi'; // lỗi thời ⇒ bỏ im lặng, và KHÔNG đáng thử lại
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
      return 'xong';
    } catch {
      /* GIỮ NGUYÊN tin đang có — ⛔ BAO GIỜ gán tin: [] ở đây. */
      return 'hong';
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
    /* 🔴 VIỆC ㉑ — chỗ này NGOÀI hai điểm đề bài nêu; thước mới TỰ TÌM RA. `napLichSu` trả
       'hong' HOÀN TOÀN IM LẶNG (nhánh catch chỉ `return 'hong'`), mà đây là lúc Owner vừa BẤM
       «Nạp lại» ⇒ bấm xong khôngthấy gì, khôngbiết đang tải hay đã hỏng. */
    if (await napLichSu(i, o.ns.ten, o.phienHienTai) === 'hong') noiHong(i, 'doc-lich-su');
  }, [napLichSu, noiHong]);

  /**
   * Ghi sổ ô. `xoaLienKet` = KHAI Ý ĐỊNH xoá mã phiên đang có.
   * ⚠️ Máy chủ CHẶN ghi mã phiên rỗng lên ô đang có phiên nếu ⛔ không khai cờ này —
   * vì ca 17/08: đọc sổ thất bại ⇒ client tưởng sổ trắng ⇒ xoá liên kết THẬT của Owner.
   * ⇒ Chỉ truyền true ở nơi Owner THẬT SỰ muốn bỏ phiên (đóng ô · phiên mới · ghế chưa có phiên).
   */
  /* 🔴 VÒNG 2 ③ 05/09 — bản cũ ở đây là `await fetch(...)` TRẦN: khôngxem `res.ok`, khôngbắt
     lỗi mạng, khôngtrả về gì. Mọi nơi gọi nó chỉ biết «đã chờ xong», khôngbiết «đã ghi được».
     ⇒ nay trả `boolean`. Nơi nào khôngcần thì bỏ qua như cũ; nơi nào CẦN thì đọc được.
     📌 Đổi kiểu trả về từ `void` sang `boolean` khônglàm vỡ chỗ gọi cũ — nhưng nó làm chỗ gọi cũ
        HIỆN RA: từ nay bỏ qua kết quả là một LỰA CHỌN nhìn thấy được, khôngphải mặc định vô hình. */
  const ghiO = useCallback(
    (i: number, ten: string | null, maPhien: string | null, xoaLienKet = false): Promise<boolean> => ghiSoO({
      ma_o: maOCua(i), ma_nhan_su: ten, ma_phien: maPhien, xoa_lien_ket: xoaLienKet,
    }),
    [],
  );

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
    // Khai NGOÀI `try` vì `finally` phải đọc được nó. (tsc bắt đúng chỗ này khi tôi khai trong try.)
    let xacNhanDaDung = false;
    try {
      const r = await fetch('/api/dung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ma_o: maOCua(i) }),
      });
      /**
       * 🔴 BẢN TRƯỚC VỨT CÂU TRẢ LỜI ĐI — `await fetch(...)` rồi thôi, KHÔNG `.json()`,
       *    KHÔNG đọc `da_giet`, KHÔNG đọc `pid`. @app-pm mở mã ra đọc và bắt được 02/09.
       *
       * 🕳 VÌ SAO NÓ NGUY: máy chủ nay có ca «sống, mà KHÔNG xác minh được có đúng người cũ»
       *    ⇒ nó CỐ Ý KHÔNG bắn (thà mất một lần dừng còn hơn bắn nhầm tiến trình khác của Owner).
       *    Nhưng nếu máy khách vứt câu trả lời thì Owner **thấy y hệt lúc dừng THÀNH CÔNG**:
       *    nút bấm xong, đèn tắt, mọi thứ trông ngoan. Trong khi ghế VẪN CHẠY và VẪN TIÊU TIỀN.
       *
       * 🔑 Tôi từng biện hộ cho vế an toàn đó bằng câu «Owner còn dừng được từ cửa sổ dòng lệnh».
       *    Câu ấy SAI, và @app-pm chỉ đúng chỗ sai: **Owner KHÔNG thể lùi khi KHÔNG ai nói cho
       *    anh ấy biết là cần lùi.** Chọn «mất mát thay vì rủi ro» chỉ đúng khi cái mất được NÓI RA.
       *    Mất trong im lặng thì nó KHÔNG phải mất mát — nó là một lời nói dối MỚI, đúng con bệnh
       *    ta đang chữa, chỉ dời từ cuốn sổ sang cái nút.
       *
       * 📌 Và đây là lý do khối này đi CÙNG bản vá máy chủ, KHÔNG tách nhịp: vá lệch nhịp thì
       *    suốt quãng giữa, nút Dừng câm mà mặt vẫn tươi.
       */
      /**
       * 🔒 KIỂU DÙNG CHUNG VỚI MÁY CHỦ — `import type` nên nó BỊ XOÁ lúc dựng, KHÔNG kéo
       *    một tệp máy chủ vào gói máy khách.
       * 🕳 Bản trước tôi tự khai lại `vi_sao?: string` ở đây. `string` thì gõ sai một ký tự
       *    cũng qua, và thêm lý do THỨ NĂM thì máy khách im mà `tsc` KHÔNG báo.
       *    ⇒ Chặng ① có MÁY giữ (kiểu chặn 4/4), chặng ③ để NGƯỜI NHỚ.
       *    Đúng bất đối xứng đẻ ra `vi_sao_bo` rỗng 4/4, và là lần thứ BA trong hai ngày
       *    hai đầu một hợp đồng KHÔNG khớp nhau. @phong-ban-pm bắt được 02/09.
       * 📌 Một hợp đồng chỉ chặt bằng ĐẦU LỎNG NHẤT của nó.
       */
      const j = (await r.json().catch(() => null)) as
        | { da_giet?: boolean; vi_sao?: ViSaoDung; pid?: number | null; giay_tu_ep?: number }
        | null;
      const hienCau = (chu: string) => capNhat(i, (cu) => ({
        tin: [...cu.tin, { ma: datMa(), ai: 'ho', gio: gioBayGio(), luc: Date.now(), loi: true, chu }],
      }));
      /**
       * 🔒 MỘT CHỐT PHỦ MỌI ĐƯỜNG RA — @app-pm chốt 02/09 sau khi @phong-ban-pm bắt nhánh `default`.
       *
       * 🕳 Bản trước tôi vá TỪNG nhánh, và bỏ sót đúng nhánh dưới cùng. @app-pm đo tiếp và tìm ra
       *    KHÔNG PHẢI MỘT mà BA đường để cờ nằm dưới mà KHÔNG có bằng chứng gì:
       *      ① nhánh `default` (lý do lạ)
       *      ② `j` là null — thân KHÔNG phải JSON: máy chủ 500 · khởi động lại giữa yêu cầu · thân bị cắt
       *      ③ `catch` — mất mạng
       *    Hai ca sau CÓ SẴN từ trước, và chúng mở đúng lúc app đang có chuyện.
       *
       * 🔑 LUẬT, viết ra để lần sau khỏi cãi: **cờ «đã dừng» chỉ được GIỮ khi có bằng chứng DƯƠNG
       *    rằng tiến trình đã chết. Mọi trường hợp còn lại — kể cả KHÔNG BIẾT, kể cả MẤT MẠNG —
       *    phải trả cờ về BẬT.**
       * ⚖️ Cái giá TỰ DỌN: cờ bật thừa ⇒ Owner bấm lần nữa ⇒ `khong_co_viec` ⇒ cờ hạ.
       *    Cái giá bên kia — mất nút khi việc CÒN CHẠY — KHÔNG tự dọn.
       * 📌 Vá từng nhánh thì lần sau thêm nhánh lại quên. Một chốt ở cuối thì nhánh MỚI mặc định AN TOÀN.
       */
      const viSao = j?.vi_sao;
      if (viSao === undefined) {
        /* Cửa cũ chưa chở `vi_sao` ⇒ giữ nguyên nếp cũ, KHÔNG suy gì. */
      } else if (viSao === 'so_tu_mau_thuan') {
        /**
         * Sổ tiến trình TỰ MÂU THUẪN: hai ô cùng khai một tiến trình. Ta KHÔNG biết dòng nào đúng,
         * và tiến trình thì VẪN SỐNG ⇒ KHÔNG dám bắn, KHÔNG hạ cờ, và PHẢI nói ra.
         * 🔑 @app-pm quyết cho nó mã RIÊNG: đây là lỗi của CHÍNH cuốn sổ. Nuốt nó vào một mã chung
         *    thì ta KHÔNG BAO GIỜ biết nó có xảy ra hay KHÔNG.
         */
        const pid = typeof j?.pid === 'number' ? j.pid : null;
        hienCau(
          'KHÔNG dừng được, và lý do nằm ở chính app này, KHÔNG phải ở anh: sổ của máy chủ có HAI ô ' +
          'cùng giữ một tiến trình. Đây là LỖI CỦA APP — nó KHÔNG được phép xảy ra, nên nếu anh ' +
          'thấy câu này thì có một chỗ trong mã đang hỏng và cần báo lại.\n\n' +
          (pid === null
            ? 'Máy chủ KHÔNG trả về số hiệu tiến trình, nên chưa có gì để dừng tay.'
            : 'Ghế VẪN ĐANG CHẠY. Dừng tay bằng lệnh:\n\n`kill ' + pid + '`'),
        );
      } else if (viSao === 'da_gui_dung' || viSao === 'da_ep_dung') {
        /**
         * 🛑 MÁY CHỦ MỚI CHỈ GỬI TÍN HIỆU — nó CHƯA biết con đã thoát hay chưa.
         *
         * 🕳 `hermes-aiboss-app-reviewer` bác 02/09 (loại A) và exe đo lại xác nhận: con nuốt
         *    `SIGTERM` thì `kill()` vẫn trả `true` trong khi `ps` còn thấy nó sống sau 200 ms.
         * ⇒ KHÔNG có bằng chứng dương ⇒ **cờ phải trở về BẬT**, đúng luật đã viết ở chốt cuối.
         * ✅ Và nay lời khuyên có thật: dòng sổ CÒN, tay cầm CÒN ⇒ bấm lần nữa là ÉP được thật.
         *    Bản trước nói «bấm lại đi» trong khi tay cầm đã bị vứt — một lời khuyên rỗng.
         */
        const pid = typeof j?.pid === 'number' ? j.pid : null;
        hienCau(
          viSao === 'da_gui_dung'
            /**
             * ⏱ SỐ GIÂY LẤY TỪ MÁY CHỦ, KHÔNG gõ cứng — tôi tự soi ra 02/09 khi @app-pm đang
             *    trình Owner ĐỔI đúng ngưỡng này.
             * 🕳 Bản trước tôi viết thẳng «sau 10 giây». Owner chọn 30 thì máy chủ ép ở giây 30
             *    còn câu này vẫn hứa giây 10 — và **bản trôi là bản Owner ĐỌC**.
             * 🔑 Vắng con số thì nói vắng, ĐỪNG đoán: `giay_tu_ep` thiếu nghĩa là máy chủ cũ hơn
             *    trang đang mở ⇒ tôi bỏ hẳn vế «sau N giây» thay vì điền một số tôi tự nghĩ ra.
             */
            ? 'Đã gửi lệnh dừng, nhưng tôi **chưa** thấy ghế thoát. Tín hiệu đã đi — con có nhận ' +
              'hay không thì tôi chỉ biết khi nó thực sự đóng.\n\n' +
              'Bấm Dừng **lần nữa** để ép dừng ngay.' +
              (typeof j?.giay_tu_ep === 'number'
                ? ' Nếu anh không bấm, sau ' + j.giay_tu_ep + ' giây tôi tự ép.'
                : '') +
              (pid === null ? '' : '\n\nDừng tay: `kill -9 ' + pid + '`')
            : 'Đã **ép** dừng. Ghế sẽ đóng ngay, nhưng tôi giữ nút Dừng cho tới khi thấy nó đóng ' +
              'thật — tôi KHÔNG khai một điều tôi chưa nhìn thấy.' +
              (pid === null ? '' : '\n\nKiểm tay: `ps -p ' + pid + '`'),
        );
      } else if (viSao === 'dong_rac' || viSao === 'khong_co_viec') {
        /**
         * ✅ HAI ca này — và CHỈ hai ca này — là bằng chứng DƯƠNG rằng tiến trình KHÔNG còn chạy.
         *
         * 🔻 Bản trước gộp bốn mã vào đây, trong đó có `da_giet` — mà `da_giet` khai một điều máy
         *    chủ KHÔNG BAO GIỜ biết được tại lúc gọi. Nay `dong_rac` nghĩa là tay cầm đã báo
         *    `exitCode`, tức Node ĐÃ THU XÁC con.
         *
         * 🕳 VÀ ĐÂY LÀ CHỖ TÔI ĐÃ LÀM HỎNG, ghi lại vì nó là bài học đắt nhất hôm nay:
         *    tôi đổi một chú thích `//` thành khối `/**` và **quên dấu đóng**, nên dòng
         *    `xacNhanDaDung = true;` bị NUỐT vào chú thích ⇒ biến KHÔNG BAO GIỜ true ⇒ dừng
         *    thành công rồi nút Dừng vẫn hiện lại. `tsc` IM, vì một khối chú thích chưa đóng
         *    là cú pháp HỢP LỆ — máy KHÔNG thấy phần mã bị nuốt.
         * 🔑 Khối nuốt nó chính là khối đang KHOE rằng hợp đồng «được MÁY giữ, KHÔNG bằng trí nhớ».
         *    **Một chú thích tả cái phanh KHÔNG phải là cái phanh** — và ở đây nó còn ĂN mất cái phanh.
         * ⇒ Việc đã xếp hàng: cắm `eslint` + `prefer-const`. Một `let` KHÔNG bao giờ được gán lại
         *   sẽ bị kêu ngay — đó là cái máy DUY NHẤT bắt được lớp lỗi này, và ta đang KHÔNG có nó.
         */
        xacNhanDaDung = true;
        /**
         * Cả ba đều nghĩa là tiến trình KHÔNG còn chạy nữa ⇒ cờ đã hạ lạc quan ở đầu hàm là ĐÚNG,
         * và im lặng ở đây cũng ĐÚNG. Nhưng phải LIỆT KÊ RA, KHÔNG được để rơi vào `default` —
         * nếu để rơi thì cái bẫy dưới kia sẽ kêu oan ba lần một ngày rồi bị người ta tắt đi.
         * 📌 Một cái chuông kêu oan là một cái chuông sắp bị gỡ.
         */
      } else {
        /**
         * 🔒 CHỐT VÉT — `never` ở đây là MÁY GIỮ, KHÔNG phải lời nhắc.
         *    Thêm một lý do THỨ NĂM ở máy chủ mà quên xử ở đây ⇒ dòng dưới KHÔNG biên dịch được.
         * 🕳 Đây đúng thứ `vi_sao_bo` thiếu: nó khai «BẮT BUỘC» bằng chú thích, nên rỗng 4/4 mà
         *    KHÔNG ai biết. Chú thích chỉ ràng buộc người ĐÃ ĐỌC nó.
         * ⚠️ Và runtime vẫn phải NÓI RA: máy chủ có thể mới hơn máy khách (Owner chưa tải lại trang).
         *    Im lặng ở đây là dựng lại đúng con bệnh — một cái nút trông ngoan mà KHÔNG làm gì.
         */
        const chuaXu: never = viSao;
        /**
         * 🔴 BẬT LẠI CỜ — @phong-ban-pm bắt 02/09 (verdict 13:03:40), và họ đúng.
         *    Đầu hàm ta hạ cờ LẠC QUAN. Ở nhánh này ta vừa thừa nhận KHÔNG biết máy chủ trả lời gì
         *    ⇒ ta cũng KHÔNG biết nó có giết được hay KHÔNG ⇒ để cờ nằm dưới là ĐANG KHẲNG ĐỊNH
         *    một điều mình vừa nói là mình KHÔNG biết.
         * 🔑 Cùng một luật với nhánh `so_tu_mau_thuan` ngay trên, và tôi đã áp đúng ở đó rồi bỏ sót ở đây:
         *    **KHÔNG biết thì KHÔNG suy — và KHÔNG biết thì cũng KHÔNG được hạ cờ.**
         *    Hạ cờ mà việc còn chạy là dựng lại đúng câu ⑥: sổ nói rảnh trong khi ghế đang tiêu tiền.
         */
        hienCau(
          'Máy chủ trả lời bằng một lý do tôi CHƯA biết xử: «' + JSON.stringify(chuaXu) + '». ' +
          'Tôi KHÔNG dám đoán nó nghĩa gì, nên tôi nói ra thay vì im. ' +
          'Nhiều khả năng trang đang mở là bản CŨ hơn máy chủ — thử tải lại trang.',
        );
      }
    } catch {
      /* mạng chập ⇒ bấm lại; KHÔNG doạ người dùng bằng lỗi đỏ. Cờ do chốt dưới lo. */
    } finally {
      /**
       * 🔒 CHỐT CUỐI — chạy KỂ CẢ sau `catch`. Đây là chỗ DUY NHẤT trả cờ về BẬT, nên thêm một
       *    nhánh mới ở trên KHÔNG thể vô tình để cờ nằm dưới nữa.
       */
      if (!xacNhanDaDung) capNhat(i, { dangChay: true });
    }
  }, [huyLuong, capNhat]);

  /* ---------- Khôi phục nguyên trạng: bố cục + tiêu điểm + phiên TỪNG Ô ---------- */
  useEffect(() => {
    if (daKhoiPhuc.current) return;
    daKhoiPhuc.current = true;

    // Bố cục + tiêu điểm chỉ là chuyện giao diện ⇒ để ở localStorage.
    try {
      /* ⑲③ — MỘT khoá gánh cả hai kiểu 2 ô: '2' = trên-dưới · '2-tp' = trái-phải.
         Bản cũ đã ghi '2' ⇒ đọc ra trên-dưới, đúng thứ Owner đang thấy: KHÔNG đổi dưới chân người
         đang dùng. Dùng khoá thứ hai cũng chạy, nhưng hai khoá thì có ngày lệch nhau, và lúc đó
         KHÔNG bên nào tự biết mình là bên sai. */
      const thoBC = localStorage.getItem(KHOA_BO_CUC) ?? '';
      const laTraiPhai = thoBC.endsWith('-tp');
      const bc = Number(laTraiPhai ? thoBC.slice(0, -3) : thoBC);
      if (bc === 1 || bc === 2 || bc === 4 || bc === 6) datBoCuc(bc);
      if (bc === 2 && laTraiPhai) datKieuHai('trai-phai');
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
        /* `void` CÓ CHỦ Ý: đây là vòng KHÔI PHỤC lúc mở app, chạy cho cả 6 ô. Ghi hỏng một ô
           khôngđược chặn 5 ô còn lại, và Owner chưa bấm gì nên chưa có gì để báo. Bảng đóng
           băng `dong-bang-goi-ghi-o` giữ đúng hai chỗ này, thêm chỗ thứ ba là ĐỎ. */
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
  function doiBoCuc(bc: 1 | 2 | 4 | 6, kieu: 'tren-duoi' | 'trai-phai' = 'tren-duoi') {
    datBoCuc(bc);
    datKieuHai(kieu);
    try {
      localStorage.setItem(KHOA_BO_CUC, bc === 2 && kieu === 'trai-phai' ? '2-tp' : String(bc));
    } catch { /* bỏ qua */ }
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
  /**
   * 📣 LỚP 2 — chỗ gọi ĐỌC kết quả và đưa lên câu nhắc giữa màn.
   * 🔑 Dùng lại `cauNhacNapBoGhe`, khôngtự chế câu riêng: luật bất biến «có ô HỎNG thì câu nhắc
   *    KHÔNG được chứa chữ xong» đã được bộ đo canh ở đó. Chế câu riêng ở đây là mở một đường
   *    thứ hai ra màn hình mà khôngai canh.
   */
  const nhacNeuHong = useCallback((o: number, k: KetQuaDatNguoi) => {
    const kq = soMotO(o, k);
    if (kq.hong.length || kq.boQua.length) datNhacBoGhe(cauNhacNapBoGhe(kq));
  }, []);


  /**
   * 🔴 VÒNG 3 ① 05/09 — hàm này có NĂM lối ra, và ba vòng liền tôi vá THEO LỐI rồi vẫn hụt.
   * ⇒ Nay khai kiểu trả về là `KetQuaDatNguoi`: **rơi khỏi cuối hàm là LỖI BIÊN DỊCH.**
   *   Thành công phải VIẾT RA `{ xong: true }`; quên viết thì dựng KHÔNG QUA.
   * 📌 Trước đây quên thì nó im lặng thành công — im lặng theo đúng hướng dối người dùng.
   *    Đổi mặc định từ «thành công» sang «phải chứng minh» là thứ vá được CẢ LỐI CHƯA AI KỂ TÊN.
   */
  const datNguoi = useCallback(async (i: number, n: NhanSu): Promise<KetQuaDatNguoi> => {
    if (i === 0) return { xong: false, boQua: 'o-mot' };   // 👑 LUẬT CỨNG: khôngđổi được agent ô 1

    datAnKhu(false); // màn hẹp: chọn người xong thì mở khu trao đổi ra

    // Đã mở ở ô khác đang hiện → chuyển tiêu điểm, khôngmở trùng.
    const trung = dsORef.current.findIndex((o, k) => k < boCuc && k !== i && o.ns?.ten === n.ten);
    if (trung !== -1) { datTieuDiem(trung); return { xong: false, boQua: 'trung-o' }; }

    huyLuong(i); // cắt luồng cũ trước khi đổi người
    capNhat(i, { ...O_TRONG, ns: n });
    datTieuDiem(i);

    const ds = await napDsPhien(i, n.ten);
    /**
     * 🔴 `null` = KHÔNG đọc được, KHÔNG phải «khôngcó phiên». Hai thứ khác nhau một trời:
     *    đoán nhầm hướng này là ghi một phép XOÁ THẬT xuống sổ ô.
     */
    if (ds === null) {
      /**
       * 🐛 Lời nhắn cũ ở đây từng NÓI DỐI (Hermes vòng 5 bắt): nó ghi «khôngđổi gì cả» trong khi
       *    ngay phía trên ô đã bị xoá trắng và đổi sang ghế mới. Nay nói thật.
       * ⚠️ Sửa ĐÚNG phải là đọc danh sách TRƯỚC, đổi ô SAU — thuộc nhịp B, PM chưa gật.
       */
      return baoHong(i, 'doc-ds-phien');   // câu chữ nay ở CAU_LOI_O, một chỗ duy nhất
    }

    // Mặc định NỐI LẠI phiên gần nhất còn nối được — khôngmặc định đẻ phiên mới.
    /**
     * 📌 GHẾ CÓ PHIÊN GHIM ⇒ CHỈ nối vào ĐÚNG phiên đó. Owner quyết 🅐 lúc 15:10 06/09/2026.
     *
     * 🕳 VÌ SAO PHẢI ĐẶT Ở ĐÂY, KHÔNG đặt ở bộ ghế dựng sẵn hay ở sổ ô:
     *    · bộ ghế (`hang-so.ts`) chỉ che đường BẤM MỘT BỘ, và `nap-bo-ghe.ts:184` vẫn gọi
     *      `datNguoi` TRƯỚC rồi mới ghi đè phiên ghim ⇒ phiên sai đã kịp vào sổ một nhịp.
     *    · sổ ô ghim cho MỘT Ô, không ghim cho GHẾ ⇒ mở ghế ở ô khác là hết bảo hiểm.
     *    · dòng ngay dưới đây (`ds.find`) là chỗ RỦI RO THẬT: nó lấy phiên rảnh ĐẦU TIÊN
     *      trong kho `-Users-erocathanh` — kho DÙNG CHUNG của 6 ghế, hàng trăm phiên.
     *    ⇒ Ghim tại ĐÂY phủ MỌI đường đi qua `datNguoi`: bấm tên ở cột giữa · bấm một
     *      bộ ghế · chọn từ menu. Đó là đường Owner mua bảo hiểm.
     *
     * 🔴 NHƯNG NÓ KHÔNG PHỦ HẾT APP — câu «phủ MỌI đường» tôi viết ở bản trước là SAI,
     *    người soi bác 06/09/2026. Bốn đường dưới đây VẪN chưa tôn trọng phiên ghim:
     *      · nap-bo-ghe.ts  khôi phục bộ ghế GHI ĐÈ mã khác rồi báo «đã nạp xong»
     *      · UngDung.tsx:901-904   khôi phục lúc mở trang, dùng thẳng mã trong sổ ô
     *      · UngDung.tsx:1137-1152 `chonPhien` KHÔNG kiểm ghim
     *      · api/o/route.ts:35-38  chỉ kiểm phiên TỒN TẠI, KHÔNG kiểm trùng phien_ghim
     *    ⇒ đã tách thành việc ㉘. TÊN CHÍNH THỨC của thứ này, Owner chốt 16:26 06/09/2026:
     *      «ghim ở đường bấm tên và bấm thẻ». Tên cũ «ghim cứng» và «đường menu» đều đã BỎ:
     *      cái trước NÓI QUÁ phạm vi, cái sau NÓI THIẾU (bỏ sót đường bấm tên).
     *    Đừng đọc khối này rộng hơn thế.
     *
     * ⚠️ CỐ Ý nối kể cả khi phiên đang chạy (`dang_chay`): phiên ghim của ô 5 là phiên
     *    Owner đang gõ ở cửa sổ dòng lệnh, nên nó gần như LUÔN «đang chạy». Bỏ qua khi bận
     *    thì cái ghim gần như KHÔNG BAO GIỜ áp, và ta lại rơi xuống `ds.find` — tức là
     *    xoá đúng thứ Owner vừa mua. Nối ở đây là việc ĐỌC; chốt chặn GHI nằm ở
     *    `api/chat/route.ts:110` (trả 409 khi phiên đang sống nơi khác).
     *
     * 🔴 KHÔNG rơi về `ds.find` khi không tìm thấy phiên ghim — im lặng chọn phiên khác là
     *    nối ô vào việc của ghế khác. Thà HỎNG TO còn hơn nối nhầm.
     */
    if (n.phien_ghim) {
      const ghim = ds.find((p) => p.ma === n.phien_ghim);
      if (!ghim) return baoHong(i, 'ghim-mat');
      if (!(await ghiO(i, n.ten, ghim.ma))) return baoHong(i, 'ghi-so');
      const tt = await napLichSu(i, n.ten, ghim.ma);
      if (tt === 'hong') return baoHong(i, 'doc-lich-su');
      if (tt === 'loi-thoi') return { xong: false, boQua: 'loi-thoi' };
      return { xong: true };
    }

    const ganNhat = ds.find((p) => !p.dang_chay);
    if (ganNhat) {
      if (!(await ghiO(i, n.ten, ganNhat.ma))) return baoHong(i, 'ghi-so');
      const trangThai = await napLichSu(i, n.ten, ganNhat.ma);
      if (trangThai === 'hong') return baoHong(i, 'doc-lich-su');
      if (trangThai === 'loi-thoi') return { xong: false, boQua: 'loi-thoi' };
      return { xong: true };
    }
    // ý định THẬT: ghế này chưa có phiên nào nối được
    if (!(await ghiO(i, n.ten, null, true))) return baoHong(i, 'ghi-so');
    return { xong: true };
  }, [baoHong, boCuc, capNhat, datTieuDiem, ghiO, huyLuong, napDsPhien, napLichSu]);

  /* ---------- Bấm một tên ở cột giữa → nạp vào Ô ĐANG TIÊU ĐIỂM ---------- */
  /* 🔴 VIỆC ㉑ ① — hai lối dưới đây TRƯỚC LÀ `void datNguoi(...)`: ghi sổ hỏng thì ô đã đổi,
     nhân sự mới đã gán, lịch sử KHÔNG nạp, mà khôngmột chữ giải thích. Nay đọc kết quả. */
  async function chonNhanSu(n: NhanSu) {
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
      nhacNeuHong(trong + 1, await datNguoi(trong, n));
      return;
    }
    nhacNeuHong(tieuDiem + 1, await datNguoi(tieuDiem, n));
  }

  /** 🔴 VIỆC ㉑ ② — chỗ gọi ĐỌC kết quả. Trước là `void dongO(i)` ngay trong `onClick`. */
  async function dongOTuMenu(i: number) {
    capNhat(i, { moMenu: false });
    if (!(await dongO(i))) nhacNeuHong(i + 1, { xong: false, hong: 'ghi-so' });
  }

  /* ---------- Bỏ trống một ô (⛔ ô 1 không có nút này) ---------- */
  async function dongO(i: number): Promise<boolean> {
    if (i === 0) return true;
    huyLuong(i);
    capNhat(i, { ...O_TRONG });
    // ③ đóng ô mà khôngghi được sổ thì cũng là HỎNG — và ô đó phải tự nói ra
    if (await ghiO(i, null, null)) return true;
    noiHong(i, 'ghi-so');
    return false;
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

    /* 🔴 VÒNG 3 — thân vòng lặp ĐÃ BÓC sang `chayNapBoGhe` (nap-bo-ghe.ts).
       Vì sao: người soi bác vòng 2 đúng chỗ — tôi thử `cauNhacNapBoGhe` bằng bảng 16 tổ hợp và
       nó xanh, nhưng cái hỏng nằm ở ĐƯỜNG ĐI khôngchuyển kết quả tới hàm ấy.
       🔑 Một phép thử đúng trên SAI VẬT thì nó chỉ bảo vệ đúng cái vật đó.
       ⇒ nay đường đi nhận phụ thuộc qua tham số, nên bộ đo chạy được CHÍNH nó bằng mạng giả. */
    const kq = await chayNapBoGhe(muc, {
      soO: SO_O,
      docO: (k) => ({
        ten: dsORef.current[k]?.ns?.ten ?? null,
        phien: dsORef.current[k]?.phienHienTai ?? null,
        dangChay: !!dsORef.current[k]?.dangChay,
      }),
      coTrongDanhBa: (t) => nhanSu.some((x) => x.ten === t),
      datNguoi: async (k, t) => {
        const n = nhanSu.find((x) => x.ten === t);
        if (!n) return { xong: false, boQua: 'thieu-ghe' };
        return datNguoi(k, n);
      },
      dongO,
      ghiO: (k, t, ph) => ghiO(k, t, ph),
      napLichSu,
      /* 🏫 MỒI Ô DÁN — mở sẵn khối dán và điền mã phiên gợi ý. KHÔNG nối thẳng: phiên đó nằm ở
         kho THƯ MỤC KHÁC, `/api/o` sẽ chặn. Owner bấm «Nối phiên» ⇒ app chìa nút Fork. */
      moDan: (k, goiY) => capNhat(k, { moDan: true, chuoiDan: goiY, loiDan: '' }),
      donTruocKhiGhi: (k) => capNhat(k, { chiPhi: null, token: null }),
    });
    datNhacBoGhe(cauNhacNapBoGhe(kq));
  }, [nhanSu, datNguoi, doiBoCuc, capNhat, ghiO, napLichSu]);

  /* ---------- Bấm chọn một phiên trong danh sách của một ô ---------- */
  async function chonPhien(i: number, p: TomTatPhien) {
    const ns = dsO[i]?.ns;
    if (!ns || p.dang_chay) return; // ⛔ không nối vào phiên đang chạy nơi khác
    huyLuong(i);
    capNhat(i, { moChonPhien: false, chiPhi: null, token: null }); // ⚠️ ⛔ đặt phienHienTai — napLichSu lo
    /* 🔴 VÒNG 3 ② — trước đây là `await ghiO(...)` trần. Sau khi vòng 2 đổi hợp đồng của `ghiO`
       (ném ⇒ trả false), chỗ này NUỐT LỖI MẠNG: Owner bấm chọn phiên, app im, sổ ô khôngđược ghi,
       tải lại trang là mất. */
    if (!(await ghiO(i, ns.ten, p.ma))) {
      capNhat(i, {
        loiDan: '🔴 KHÔNG ghi được vào sổ ô — tải lại trang là mất phiên vừa chọn. '
          + 'Kiểm mạng rồi bấm lại.',
      });
      return;
    }
    if (await napLichSu(i, ns.ten, p.ma) === 'hong') noiHong(i, 'doc-lich-su');
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
    capNhat(i, { dangFork: true, loiDan: `🧬 Đang fork… Claude phải mở phiên gốc để tách — có thể ${moTaHanFork()}.` });
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
        // 🔴 `true` = ÉP «đã có phiên». Bỏ nó đi là câu dặn đẻ ra phiên THỨ BA
        //    khi ghế chưa từng có phiên — ref lúc này vẫn là bản CŨ.
        void guiRef.current(i, cauDau, undefined, true);
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
            /**
             * 🎨 SỬA 01/09/2026 (@app-pm khoanh, @exe làm) — ca thật: Owner bấm fork ở
             *    «Quản Lý Trường», thấy dòng này mở đầu bằng ký hiệu CẤM nên đọc thành
             *    «app hỏng», chụp màn hình gửi đi. Luồng chạy ĐÚNG; chỉ CHỮ nói sai việc.
             * 📌 Ba vế phải có, thiếu vế nào là Owner lại quyết sai:
             *    ① KHÔNG tô cảnh báo cho một trạng thái BÌNH THƯỜNG
             *    ② nói rõ Fork ĐÁNH ĐỔI GÌ — nó KHÔNG lùi lại được
             *    ③ chìa LỐI ĐÚNG trước, Fork sau
             */
            `Mã ${ma.slice(0, 8)}… đọc được. Bản ghi của phiên đó nằm ở kho của THƯ MỤC KHÁC, ` +
            'nên ghế này chưa đọc thẳng được — đây là trạng thái bình thường, KHÔNG phải app hỏng.\n' +
            '· Nối NGUYÊN VẸN (nên làm trước): khai `thu_muc` cho ghế trong `du-lieu/nhan-su.json` ' +
            'rồi dựng lại — giữ đủ nội dung, KHÔNG mất gì.\n' +
            '· Fork là đường CUỐI: bản mới chỉ mang theo khoảng 6,5% nội dung ' +
            '(đo 20/08: 19.305 → 1.257 dòng), và phần mất KHÔNG lấy lại được.',
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
      /* 🔴 VÒNG 3 ② — ĐÂY LÀ LỖ CHÍNH bản vá vòng 2 của tôi mở ra, và nó tệ hơn «nuốt lỗi»:
         · TRƯỚC vòng 2: `ghiO` là `await fetch(...)` trần ⇒ rớt mạng thì NÉM ⇒ rơi vào `catch`
           bên dưới ⇒ Owner thấy «Không gọi được máy chủ để kiểm phiên».
         · SAU vòng 2: `ghiSoO` bắt lỗi BÊN TRONG và trả `false` ⇒ `catch` KHÔNG bao giờ chạy,
           mà dòng `capNhat` ngay trên đã kịp hiện «✅ Đã nối phiên … đọc được N lượt».
         ⇒ Owner đọc được chữ XANH trong khi sổ ô chưa hề được ghi.
         🔑 Đổi hợp đồng của một hàm là đổi cả cách MỌI chỗ gọi nó xử lý thất bại — kể cả những
            chỗ xử lý bằng cách KHÔNG viết gì (dựa vào cú ném). Chỗ khôngviết gì là chỗ khó thấy
            nhất khi rà, vì nó khôngcó dòng nào để rà. */
      if (!(await ghiO(i, o.ns.ten, ma))) {
        capNhat(i, {
          loiDan: `⚠️ Đã đọc được ${lichSu.length} lượt, nhưng KHÔNG ghi được vào sổ ô — `
            + 'tải lại trang là mất. Kiểm mạng rồi bấm «Nối phiên» lại.',
        });
      }
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
    // ý định THẬT: Owner bấm mở PHIÊN MỚI (xoá liên kết phiên cũ trong sổ)
    if (!(await ghiO(i, ns.ten, null, true))) {
      capNhat(i, {
        loiDan: '🔴 KHÔNG ghi được vào sổ ô — phiên mới chưa được ghi nhận. Kiểm mạng rồi bấm lại.',
      });
    }
  }

  /* ---------- Gửi câu hỏi ở MỘT ô, đọc luồng SSE của riêng ô đó ----------
   *
   * `chuGoi` + `tuAi` chỉ có khi câu đến từ CỔNG ĐÁNH THỨC (ghế khác gửi sang).
   * Người gõ tay thì ⛔ không truyền gì — câu lấy từ ô soạn như cũ.
   */
  /**
   * @param daCoPhien ÉP «ô này ĐÃ có phiên», bỏ qua `o.phienHienTai` đọc từ ref.
   *
   * 🕳 CA THẬT 31/08 (Owner bắt, `claude-phong-ban-pm` truy ra, và tôi CHẶN KỊP trước khi nạp):
   *    `forkVeGhe` gọi `capNhat({phienHienTai: mã MỚI})` rồi gọi `gui()` NGAY.
   *    `capNhat` chỉ xếp một lần vẽ lại; `dsORef.current` gán trong THÂN component (:530)
   *    ⇒ giữa hai lệnh đó ⛔ có `await` nào ⇒ React CHƯA vẽ lại ⇒ **ref vẫn là bản CŨ**.
   * 📌 THỨ TỰ DÒNG đúng, THỨ TỰ THỰC THI thì ⛔. Tôi tự viết chú thích cảnh báo đúng chỗ này
   *    rồi vẫn ngã — vì tôi cho rằng `capNhat` làm ref mới ngay, mà nó ⛔.
   *
   * 🔬 HẬU QUẢ THẬT — tôi lần theo đường đi, và nó HẸP HƠN chẩn đoán ban đầu:
   * ```
   *   sổ ô SAU fork ĐÃ mang mã MỚI  (fork/route.ts:113 gọi `datO`)
   *   ca ① ghế ĐANG có phiên cũ ⇒ ref cũ ⛔ null ⇒ phien_moi=false
   *        ⇒ máy chủ lấy mã từ SỔ Ô = mã MỚI ⇒ ĐÚNG. Ca này KHÔNG hỏng.
   *   ca ② ghế CHƯA có phiên    ⇒ ref cũ = null ⇒ phien_moi=TRUE
   *        ⇒ chat/route.ts:59 ép maPhienCu=null ⇒ 🔴 ĐẺ RA PHIÊN THỨ BA
   * ```
   * ⇒ Đúng một ca hỏng, và nó hỏng IM LẶNG: ghế vẫn trả lời, Owner tưởng xong.
   *
   * ✅ Vì sao truyền tham số chứ ⛔ gán tay vào `dsORef`: gán tay là ghi đè một ref
   *    React cũng ghi ⇒ đẻ lỗi khác về sau. Tham số thì **⛔ phụ thuộc thời điểm** —
   *    mà thời điểm chính là thứ vừa lừa cả hai người soi.
   */
  async function gui(i: number, chuGoi?: string, tuAi?: string, daCoPhien?: boolean) {
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
    // ⭐ `daCoPhien` ĐÈ lên giá trị đọc từ ref — xem chú thích đầu hàm.
    const phienMoiKhong = daCoPhien === true ? false : o.phienHienTai === null;

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
  /**
   * 🔴 CỜ «TỈNH DẬY MÀ LẤY LẠI TIN CŨ KHÔNG ĐƯỢC» (P0 · 01/09/2026).
   * 📌 Owner chốt khi giao việc: *«hết lượt thử mà vẫn trượt thì phải HIỆN RA, KHÔNG được im —
   *    im lặng chính là bệnh, sửa xong mà vẫn im thì ta chỉ đổi một cái im này lấy cái im khác»*.
   */
  const [tinhLaiHong, datTinhLaiHong] = useState(false);
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

          /**
           * 🔴 P0-2d (31/08) — ĐẢO THỨ TỰ: **XÁC NHẬN TRƯỚC · CHẠY SAU**.
           *
           * 🕳 Bản cũ chạy `gui()` TRƯỚC rồi mới xác nhận, kèm chú thích tự nhận là đánh đổi
           *    «thà chạy lại còn hơn mất câu». Hermes chỉ ra vế đó nay SAI:
           *    cửa xác nhận đã biết từ chối (khác `giu_boi`), nhưng **lời từ chối tới SAU
           *    khi lượt đã chạy** ⇒ báo đúng mà vẫn thiệt tiền.
           * 🔑 **Một cái cổng đặt SAU hành động thì nó ⛔ phải cổng, nó là một bản báo cáo.**
           *
           * ⚖️ ĐÁNH ĐỔI ĐỔI CHIỀU, tôi nói thẳng:
           *      cũ : tab chết giữa chừng ⇒ mẩu QUAY LẠI ⇒ có thể chạy HAI LẦN (tốn tiền)
           *      nay: tab chết ngay sau khi xác nhận ⇒ mẩu MẤT (một câu ⛔ ai trả lời)
           *    Cửa sổ hỏng thu từ **30 giây** (hạn giữ chỗ) xuống còn khoảng cách giữa hai
           *    lệnh liền nhau ⇒ nhỏ hơn hàng vạn lần. Đổi một rủi ro rộng lấy một rủi ro hẹp.
           *
           * ⏱ ĐO TRƯỚC KHI ĐẢO (31/08, 5 lần): cửa xác nhận trả lời **1-2 mili-giây**.
           *    PM đặt ngưỡng «dưới 100ms thì cứ đảo» ⇒ dưới xa. Owner ⛔ cảm nhận được.
           * ⚠️ Ai đổi cửa này thành việc nặng thì phải ĐO LẠI — con số trên là điều kiện
           *    để đảo, ⛔ phải một hằng số của tự nhiên.
           */
          const rXn = await fetch('/api/danh-thuc/xac-nhan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ma: y.ma, ma_trinh_duyet: maTrinhDuyet.current }),
          }).catch(() => null);
          // Cửa ⛔ trả lời ⇒ ĐỪNG chạy. Mẩu còn hạn giữ chỗ, nhịp sau nhận lại.
          if (!rXn || !rXn.ok) continue;
          const jXn = await rXn.json().catch(() => null);
          // `xong: false` nghĩa là NGƯỜI KHÁC đã giao mẩu này ⇒ chạy nữa là chạy trùng.
          if (!jXn?.xong) continue;

          void guiRef.current(i, y.cau_hoi, y.tu_ai);
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
   * 👁 TAB TỈNH LẠI ⇒ ĐỌC LẠI TỆP PHIÊN (P0 · 01/09/2026, Owner giao).
   *
   * 🕳 TRIỆU CHỨNG: tab ngủ rồi mở lại, Owner MẤT tin cũ, phải F5 nhiều lần. XẢY RA MỖI NGÀY.
   * 🔬 GỐC — đo trước khi vá, và nó KHÔNG phải cái ta tưởng:
   *      vòng thăm dò gọi `napLichSu` **0 lần** (đối chứng dương cùng khối: datCuaHong 4 · fetch 2)
   *      `napLichSu` chỉ được gọi ở 5 chỗ, CẢ 5 đều là hành động MỞ ĐẦU
   *      `visibilitychange` · `pageshow` · `onfocus`: **0 chỗ** trong tệp này
   *    ⇒ Đây KHÔNG phải một cái HỎNG. Đây là một đường CHƯA TỪNG ĐƯỢC NỐI.
   *      Ai đi tìm chỗ hỏng sẽ KHÔNG bao giờ thấy — vì KHÔNG có chỗ nào hỏng cả.
   *
   * 🔥 CHỐNG NÓNG MÁY VẪN NGUYÊN: hiệu ứng này nằm NGOÀI `thamDoMotNhip`, và nó chỉ chạy đúng
   *    lúc tab CHUYỂN SANG HIỆN. Tab ẩn thì nó KHÔNG gọi mạng lần nào — yêu cầu Owner 17/08 KHÔNG rẻ đi.
   */
  const dangLamMoi = useRef(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const khiDoi = () => {
      if (document.visibilityState !== 'visible') return;
      if (dangLamMoi.current) return;          // đang chạy thì thôi, KHÔNG chồng lượt
      dangLamMoi.current = true;
      void (async () => {
        try {
          /**
           * 🔁 THỬ LẠI CÓ HẠN, GIÃN DẦN — Owner khoanh: chỉ cho ĐƯỜNG NÀY.
           *    Bốn đường gọi `napLichSu` còn lại KHÔNG đụng tới, chúng đang chạy đúng.
           * ⏱ 0ms · 1,5s · 4s: lần đầu ngay, hai lần sau chờ đủ để mạng/máy chủ hồi.
           */
          const CHO = [0, 1_500, 4_000];
          let conHong = false;
          /**
           * 🔴 VÁ VÒNG 2 (@phong-ban-pm soi 21:03, KHÔNG ĐẠT hai chỗ) — hai lỗi RIÊNG BIỆT,
           *    và cả hai đều nằm ở chỗ tab ẩn lại giữa chừng:
           *
           *  ① `break` cũ chỉ thoát vòng THỬ LẠI, KHÔNG thoát vòng DUYỆT Ô.
           *     Chú thích ghi «DỪNG», mã lại đi tiếp sang ô kế và VẪN gọi mạng cho từng ô.
           *     🔑 Một chú thích đúng ý định mà sai phạm vi thì nó CHE đúng chỗ nó tả — người soi
           *        sau đọc chú thích rồi tin, vì nó nói đúng thứ mình muốn nghe.
           *     ⇒ nay có cờ `boDo` để thoát CẢ HAI vòng.
           *
           *  ② nhãn `'loi-thoi'` bị tôi dùng cho HAI việc khác nghĩa:
           *        nghĩa gốc: có lần gọi MỚI HƠN vượt mặt ⇒ ĐÚNG thiết kế
           *        tôi thêm : tab vừa ẩn ⇒ tôi bỏ dở
           *     Hệ quả: nhánh `'hong'` KHÔNG chạy ⇒ cờ báo bị HẠ ⇒ KHÔNG có băng, dù ô đó
           *     THẬT SỰ chưa lấy được tin cũ. Đúng hình «mất LẶNG» mà bản vá này đi chữa,
           *     và cái im ấy còn ĐỘI LỐT một trạng thái thành-công-có-lý-do.
           *     ⇒ nay tách hẳn nhãn `'bo-do'`, và khi bỏ dở thì KHÔNG ĐỘNG tới cờ báo.
           */
          let boDo = false;
          for (let i = 0; i < dsORef.current.length; i += 1) {
            const o = dsORef.current[i];
            if (!o?.ns || !o.phienHienTai) continue;
            // KHÔNG giật lịch sử của ô ĐANG CHẢY CHỮ hoặc ĐANG NẠP — nó tự có tin mới rồi.
            if (o.dangChay || o.dangNap) continue;
            let ket: 'xong' | 'loi-thoi' | 'hong' | 'bo-do' = 'hong';
            for (let l = 0; l < CHO.length; l += 1) {
              if (CHO[l] > 0) await new Promise((r) => setTimeout(r, CHO[l]));
              // Tab ẩn lại giữa chừng ⇒ DỪNG HẲN, cả ô này lẫn mọi ô còn lại.
              if (document.visibilityState !== 'visible') { ket = 'bo-do'; boDo = true; break; }
              ket = await napLichSu(i, o.ns.ten, o.phienHienTai);
              // 'loi-thoi' = có lần gọi MỚI HƠN vượt mặt ⇒ ĐÚNG thiết kế, KHÔNG thử lại.
              if (ket === 'xong' || ket === 'loi-thoi') break;
            }
            if (ket === 'hong') conHong = true;
            if (boDo) break;   // ⇐ thoát vòng DUYỆT Ô, đúng thứ chú thích cũ đã hứa mà mã KHÔNG làm
          }
          /**
           * 🔴 HẾT LƯỢT MÀ VẪN TRƯỢT ⇒ NÓI RA. KHÔNG im.
           *    Cờ này TỰ TẮT ngay lần tỉnh dậy kế tiếp nếu lấy được — Owner KHÔNG phải tự tắt tay.
           * ⚠️ BỎ DỞ thì KHÔNG ĐỘNG tới cờ: ta chưa biết ô đó lấy được hay chưa, nên KHÔNG được
           *    hạ một cảnh báo đang hiện, cũng KHÔNG được dựng một cảnh báo chưa có cơ sở.
           *    Tab hiện lại là hiệu ứng này chạy lại từ đầu ⇒ nó tự trả lời ở lượt sau.
           *
           * 🔴 VÁ VÒNG BA (@phong-ban-pm soi 21:09) — bản trước ghi `if (!boDo)` và nó NUỐT một
           *    cái hỏng ĐÃ BIẾT CHẮC:
           *      ô 1 thử đủ 3 lượt, trượt cả 3  ⇒ conHong = true   ⇐ biết chắc
           *      ô 2 tab ẩn giữa chừng          ⇒ boDo = true ⇒ break
           *      `if (!boDo)` ⇒ KHÔNG báo, dù ô 1 hỏng thật.
           * 🔑 GỐC: `boDo` gánh HAI nghĩa ở chỗ RA QUYẾT ĐỊNH —
           *      nghĩa cần: «ô ĐANG XÉT chưa có kết luận» ⇒ đừng phán về NÓ
           *      nghĩa mã : «cả vòng chưa có kết luận»    ⇒ vứt luôn kết luận về ô ĐÃ xong
           *    Đây ĐÚNG cái hình tôi vừa gỡ khỏi nhãn `'loi-thoi'` ở vòng hai: tôi sửa chỗ ĐẶT
           *    TÊN mà chưa sửa chỗ RA QUYẾT ĐỊNH. Một nhãn sạch KHÔNG cứu được một điều kiện bẩn.
           */
          if (conHong || !boDo) datTinhLaiHong(conHong);
        } finally {
          dangLamMoi.current = false;
        }
      })();
    };
    document.addEventListener('visibilitychange', khiDoi);
    return () => document.removeEventListener('visibilitychange', khiDoi);
  }, [napLichSu]);

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
      {/**
        * 🔴 HAI THỨ NÀY PHẢI Ở TẦNG NGOÀI CÙNG — verdict vòng 1, lỗi ④ và ⑤ của tôi.
        *
        * Tôi từng đặt chúng bên trong `.de-khu` (nằm trong `.cot-3`) và `.cot-1`. Cả hai cái cha
        * đó TỰ ẨN trong đúng lúc cần con của nó:
        *   · mobile + anKhu=true ⇒ `.cot-3` KHÔNG có lớp `mo-khu` ⇒ `display:none`
        *     ⇒ nút «về khu chat» CÒN TRONG DOM mà Owner KHÔNG bấm được. Trên điện thoại đó là
        *       đường về DUY NHẤT — đúng lỗi Owner phàn nàn 18/08, tôi vừa dựng lại.
        *   · nạp bộ ghế LUÔN đổi sang bố cục 6 ⇒ `.khung` nhận `an-cot` ⇒ `.cot-1` ẩn
        *     ⇒ câu nhắc vừa sinh ra đã bị giấu.
        * 🔑 **Thứ phải thấy trong MỌI trạng thái thì KHÔNG được nằm trong một cái cha tự ẩn.**
        *    Tôi viết trong báo cáo là «giữ bằng mọi giá» rồi chôn nó — CÒN TRONG DOM khác BẤM ĐƯỢC.
        */}
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
            title="Return to conversation space"
            aria-label="Return to conversation space"
          >
            <ChatCircleDots size={17} weight={DAM_ICON} aria-hidden="true" />
          </button>
        )}
      {nhacBoGhe && (
        <div className="nhac-bo-ghe" role="status" aria-live="polite" title={nhacBoGhe}>
          {nhacBoGhe}
        </div>
      )}

      {(maCu || cuaHong || tinhLaiHong) && (
        <div className={`bang-ma-cu${maCu ? '' : ' bang-cua-hong'}`} ref={banRef} role="status">
          {maCu ? (
            <span>
              A new build is available on the server. This page is running an <b>OUTDATED</b> version.
            </span>
          ) : tinhLaiHong ? (
            <span>
              Tab resumed but <b>failed to retrieve previous history</b> (tried 3 times). New messages may not be displayed.
            </span>
          ) : (
            <span>
              Server connection <b>unresponsive after 3 attempts</b>. Messages dispatched to seats may be delayed.
            </span>
          )}
          <button
            type="button"
            className="nut-tai-lai"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )}

      <div className={`khung bc-${boCuc}${(anCot === null ? boCuc === 6 : anCot) ? ' an-cot' : ' hien-cot'}`}>
        {/* ===== Cột 1 — cây phòng ban ===== */}
        <aside className="cot cot-1">
          <div className="de-cot">Organization Structure</div>
          <div className="cay">
            <div className="goc nut-vao-pb de-muc">
              <span className="ic">🏢</span>
              <span className="nhan-ten">Enter department</span>
            </div>

            <div className="menu-vao-pb" role="menu">
              {/* ⬅️ ĐƯỜNG VỀ đứng đầu. Chỉ bật khi ĐÃ có bộ lưu — một nút KHÔNG làm gì thì
                  tệ hơn KHÔNG có nút, vì người bấm tưởng mình làm sai. */}
              <button
                className="muc-menu" type="button" role="menuitem"
                disabled={!boGheCu}
                title={boGheCu
                  ? boGheCu.map((m) => m.ten).filter(Boolean).join(' · ')
                  : 'No saved layout — select a department to save current layout'}
                onClick={() => { void napBoGhe(boGheCu ?? [], false); }}
              >
                <ClockCounterClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                {boGheCu ? 'Current Layout (Saved)' : 'No saved layout'}
              </button>

              {SO_BO_GHE.map((bo) => {
                const Icon = bo.icon === 'vuong-mien' ? Crown : bo.icon === 'danh-sach' ? List : ClipboardText;
                return (
                  <button
                    key={bo.ma}
                    className="muc-menu" type="button" role="menuitem"
                    title={bo.ghe.map((g) => g.ten).join(' · ')}
                    onClick={() => { void napBoGhe(bo.ghe, true); }}
                  >
                    <Icon size={15} weight={DAM_ICON} aria-hidden="true" />
                    {bo.ten} — {bo.ghe.length} slots
                  </button>
                );
              })}
            </div>

            {/* ⑳④ 05/09 — Owner: «cái tên category "Toàn bộ nhân sự" em để bên dưới section của
                "Vào phòng ban" nhé». Trước nó đứng ĐẦU cột (y=53), trên cả «Vào phòng ban» (y=87).
                🔑 Chỗ mới cũng ĐÚNG NGHĨA hơn: nó là bộ lọc «tất cả» của DANH SÁCH PHÒNG BAN ngay dưới
                   nó, khôngphải một mục ngang hàng với «Vào phòng ban». Một cái nút đứng tách khỏi thứ
                   nó điều khiển thì người dùng khôngcó cách nào đoán ra nó điều khiển cái gì. */}
            <div
              className={`goc${phongChon === null ? ' chon' : ''}`}
              onClick={() => { datPhongChon(null); datPhongMo(null); }}
            >
              <span className="ic">🏛</span>
              <span className="nhan-ten">All Seats</span>
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
                      onClick={() => void chonNhanSu(n)}
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

          {/* ⑳② 05/09 — Owner: «dòng sumary 225/9/67 thì hiển thị ở menu trái bên trên khu
              "tỷ trọng nhân sự"». Dời TỪ `.de-khu` (thanh trên, trong `.cot-3`) về ĐÂY.
              🔑 Dời nó đi cũng chính là thứ TRẢ CHỖ cho ⑳①: `.nhom-bo-cuc` nay là con duy nhất còn
                 `margin-left:auto` trong `.de-khu` ⇒ nó lên hàng 1 mà khôngcần đụng gì tới nó.
              📏 Cột trái rộng 264px, mà `.so-lieu` xếp một hàng ngang rộng 290px ⇒ KHÔNG vừa.
                 ⇒ đổi sang LƯỚI 3 CỘT — xem `.cot-1 .so-lieu` trong mau09.css. */}
          <div className="so-lieu">
            <div className="o-so"><b>{tong.nhan_su}</b><span>Seats</span></div>
            <div className="vach" />
            <div className="o-so"><b>{tong.phong_ban}</b><span>Departments</span></div>
            <div className="vach" />
            <div className="o-so"><b>{tong.truong_phong}</b><span>Leads</span></div>
          </div>

          <div className="thanh-mau">
            <div className="tieu">Seat Distribution</div>
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

        {/* ===== Column 2 — Seat Directory & Cards ===== */}
        <section className="cot cot-2">
          <div className="de-cot">
            <span>{phongChon ? phongBan.find((p) => p.ma === phongChon)?.ten : 'All Seats'}</span>
            <span className="dem">{dsHien.length}</span>
          </div>
          <div className="hop-tim">
            <input
              type="search" autoComplete="off" value={tuKhoa}
              onChange={(e) => datTuKhoa(e.target.value)}
              placeholder="Search by role or seat name…"
            />
          </div>
          <div className="ds">
            {dsHien.length === 0 && <div className="rong">No matching seats found.</div>}
            {dsHien.map((n) => (
              <div
                key={n.ten}
                className={`the-ns${tenTieuDiem === n.ten ? ' chon' : ''}${
                  tenDangMo.has(n.ten) && tenTieuDiem !== n.ten ? ' mo' : ''
                }`}
                data-vai={n.vai}
                onClick={() => void chonNhanSu(n)}
                title={`${n.nhan}\n${n.ten}`}
              >
                <div className="vuong">{n.viet_tat}</div>
                <div className="noi">
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
            {/**
              * ☰ NÚT GỘP — hướng A, Owner quyết round-8 04/09.
              * Trước đây là HAI nút: ☰ (mở danh bạ) trên `.thanh-de`, và «Ẩn/Hiện 2 cột» trong
              * `.nhom-bo-cuc`. Hướng A bỏ `.thanh-de` ⇒ gộp làm MỘT, mang CẢ HAI lớp.
              *
              * 🔴 TIÊU CHÍ CỨNG của Owner: nút này PHẢI CÒN NHÌN THẤY khi hai cột ĐANG ẨN.
              *    Ẩn cột = mất lối vào danh bạ; nút này là đường DUY NHẤT quay lại.
              *    «Thêm đường ĐI thì phải thêm đường VỀ trong CÙNG một lượt sửa.»
              *    Neo CSS: `.khung.an-cot .nut-danh-ba{display:inline-flex}` (globals) — ĐỪNG gỡ.
              */}
            <button
              className={`nut-tron nut-danh-ba nut-cot${(anCot === null ? boCuc === 6 : anCot) ? '' : ' chon'}`}
              type="button"
              onClick={() => {
                // 🔴 VERDICT ⑧ (vòng 1): bản trước quyết định CHỈ theo trạng thái ẩn cột DESKTOP.
                //    Ở bố cục 1/2/4 thì `anCot=null` ⇒ dangAn=false ⇒ bấm lần 1 chỉ ẩn cột,
                //    phải bấm LẦN HAI mới mở danh bạ. Nút CŨ chỉ cần MỘT lần ⇒ đây là ĐỔI HÀNH VI,
                //    không phải gộp hình thức.
                // ✅ Nay: việc chính của nút là ĐƯA NGƯỜI TỚI DANH BẠ. Chỉ khi danh bạ ĐANG mở
                //    và cột ĐANG hiện thì bấm mới là «ẩn đi».
                // 🔴 VERDICT VÒNG 2 ④: bản trước còn BẢY ô «bấm lần đầu không đổi gì» trên desktop.
                //    Gốc, đo được ở CSS: hai biến RỜI NHAU THEO BỀ RỘNG —
                //      `.khung.an-cot …`  nằm trong @media (min-width:1041px) ⇒ `anCot` chỉ thấy ở DESKTOP
                //      `.cot-3.mo-khu …`  nằm trong @media (max-width:1040px) ⇒ `anKhu` chỉ thấy ở MOBILE
                //    Handler cũ ở desktop chỉ đặt `anKhu` ⇒ đặt một thứ desktop KHÔNG hề nhìn thấy.
                // 🔑 Nên đây KHÔNG phải bảy lỗi lẻ — là MỘT lỗi: nút đặt biến của màn hình BÊN KIA.
                //    Vá từng ô sẽ sót, đúng như PM cảnh báo.
                // ✅ Cách chữa: MỘT lần bấm LẬT CẢ HAI biến, ngược chiều nhau.
                //    Nhờ vậy mọi ô trong bảng {bố cục}×{anCot}×{anKhu} đều đổi ÍT NHẤT một biến
                //    NHÌN THẤY ĐƯỢC ở bề rộng đang đứng. Bảng chứng minh: bai-thu/thu-nut-gop.mjs
                const dangAn = anCot === null ? boCuc === 6 : anCot;
                // ⚠️ Bản vá ĐẦU của tôi buộc `anKhu` theo trạng thái DESKTOP (`datAnKhu(dangAn)`)
                //    ⇒ bảng vẫn còn 12 ô no-op trên mobile. Buộc hai biến vào nhau là lại đem
                //    trạng thái của màn này quyết định cho màn kia — đúng cái bệnh vừa chữa.
                // ✅ MỖI MÀN LẬT BIẾN CỦA CHÍNH NÓ ⇒ 0 ô no-op, đúng theo cấu tạo chứ không do may.
                datAnCotLuu(!dangAn);   // desktop THẤY: hai cột hiện/ẩn
                datAnKhu(!anKhu);       // mobile  THẤY: vào/rời danh bạ
              }}
              title={(anCot === null ? boCuc === 6 : anCot)
                ? 'Show sidebar columns'
                : 'Hide sidebar columns'}
              aria-label="Toggle sidebar columns"
              aria-pressed={(anCot === null ? boCuc === 6 : anCot)}
            >
              <List size={17} weight={DAM_ICON} aria-hidden="true" />
            </button>
            <span className="nhan-khu ten-app" title="AIBOSS Office">AIBOSS Office</span>
            <span className="nhan-that">● Connected to Claude Code on this machine</span>
            {nhacO1 && (
              <span className="nhan-mau" title={nhacO1}>
                <Crown size={12} weight={DAM_ICON} aria-hidden="true" className="vuong-mien" /> {nhacO1}
              </span>
            )}
            <div className="nhom-bo-cuc">
              <button
                className={`nut-bc${boCuc === 1 ? ' chon' : ''}`} type="button" data-bc="1"
                onClick={() => doiBoCuc(1)}
                title="1 slot — single full conversation" aria-label="1 slot layout"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 2 && kieuHai === 'tren-duoi' ? ' chon' : ''}`}
                type="button" data-bc="2"
                onClick={() => doiBoCuc(2, 'tren-duoi')}
                title="2 slots — split top / bottom" aria-label="2 slots top bottom"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 2 && kieuHai === 'trai-phai' ? ' chon' : ''}`}
                type="button" data-bc="2-tp"
                onClick={() => doiBoCuc(2, 'trai-phai')}
                title="2 slots — split left / right" aria-label="2 slots left right"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1="9" y1=".8" x2="9" y2="13.2" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 4 ? ' chon' : ''}`} type="button" data-bc="4"
                onClick={() => doiBoCuc(4)}
                title="4 slots — 2×2 grid" aria-label="4 slots grid"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                  <line x1="9" y1=".8" x2="9" y2="13.2" />
                </svg>
              </button>
              <button
                className={`nut-bc${boCuc === 6 ? ' chon' : ''}`} type="button" data-bc="6"
                onClick={() => doiBoCuc(6)}
                title="6 slots — 3 columns, 2 rows" aria-label="6 slots grid"
              >
                <svg viewBox="0 0 18 14" aria-hidden="true">
                  <rect x=".8" y=".8" width="16.4" height="12.4" rx="2" />
                  <line x1="6.27" y1=".8" x2="6.27" y2="13.2" />
                  <line x1="11.73" y1=".8" x2="11.73" y2="13.2" />
                  <line x1=".8" y1="7" x2="17.2" y2="7" />
                </svg>
              </button>
              <div className="goi-y-phim">Keys <b>1</b>…<b>6</b> switch slot focus</div>
            </div>
            <div className="boc-menu boc-cai-dat">
              <Link
                href="/settings"
                className="nut-tron nut-menu nut-cai-dat"
                title="Office Settings"
                aria-label="Open Office Settings"
              >
                <GearSix size={17} weight={DAM_ICON} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className={`luoi bc-${boCuc}${boCuc === 2 && kieuHai === 'trai-phai' ? ' hai-ngang' : ''}${toanMan !== null ? ' toan-man' : ''}`}>
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
                        onClick={() => datAnKhu(true)} title="Back to team list"
                        aria-label="Back to team list"
                      >
                        <ArrowLeft size={17} weight={DAM_ICON} aria-hidden="true" />
                      </button>
                      <div className="anh-o trong-o">—</div>
                      <div className="tt-o">
                        <b>Empty Slot</b>
                        <div className="ma-ky-thuat">No seat selected</div>
                      </div>
                      <span className="so-o" title={`Slot ${i + 1}`} aria-label={`Slot ${i + 1}`}>
                        {(() => { const IconSo = ICON_SO_O[i] ?? NumberOne;
                          return <IconSo size={17} weight={DAM_ICON} aria-hidden="true" />; })()}
                      </span>
                    </div>
                    <div className="rong-o">
                      <div className="to">💬</div>
                      <b>Slot {i + 1} is empty</b>
                      <span>Click this slot and select a seat from the team list to begin.</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="de-o">
                      <div className="anh-o">
                        {o.ns.viet_tat}
                        <span
                          className={`den-o ${o.matKetNoi ? 'den-dut' : o.dangChay ? 'den-chay' : o.phienHienTai ? 'den-noi' : 'den-tat'}`}
                          title={o.matKetNoi ? 'Connection lost — stream interrupted, send to reconnect'
                            : o.dangChay ? 'Running — generating response'
                            : o.phienHienTai ? 'Ready — session active'
                            : 'Idle — no active session'}
                          aria-label={o.matKetNoi ? 'Connection lost' : o.dangChay ? 'Running' : o.phienHienTai ? 'Ready' : 'Idle'}
                        />
                      </div>
                      <div className="tt-o">
                        <b title={o.ns.nhan}>
                          {i === 0 && <Crown size={14} weight={DAM_ICON} aria-label="Lead Seat" className="vuong-mien" />}
                          {o.ns.nhan}
                        </b>
                        <div className="ma-ky-thuat" title={o.ns.ten}>{o.ns.ten}</div>
                      </div>
                      <button
                        className={`so-o nut-so${o.moHoSo ? ' bat' : ''}`} type="button"
                        onClick={() => capNhat(i, { moHoSo: !o.moHoSo })}
                        title={`Slot ${i + 1} — view seat profile · session · tokens · cost`}
                        aria-label={`Slot ${i + 1} — seat profile`}
                        aria-pressed={o.moHoSo}
                      >
                        {(() => { const IconSo = ICON_SO_O[i] ?? NumberOne;
                          return <IconSo size={17} weight={DAM_ICON} aria-hidden="true" />; })()}
                        <Info size={15} weight={DAM_ICON} aria-hidden="true" className="dau-i" />
                      </button>
                      {i === 0 && (
                        <button
                          className="nut-tron nut-thu" type="button"
                          onClick={() => capNhat(i, { thuKhung: !o.thuKhung })}
                          title={o.thuKhung ? 'Expand chat pane' : 'Collapse chat pane'}
                          aria-label={o.thuKhung ? 'Expand chat pane' : 'Collapse chat pane'}
                          aria-expanded={!o.thuKhung}
                        >
                          {o.thuKhung
                            ? <CaretDown size={18} weight={DAM_ICON} aria-hidden="true" />
                            : <CaretUp size={18} weight={DAM_ICON} aria-hidden="true" />}
                        </button>
                      )}
                      {o.conNua && o.phienHienTai && o.ns && (
                        <button
                          className="nut-tron nut-lich-su" type="button"
                          disabled={o.dangNap || o.dangChay}
                          onClick={() => keoThem(i, o.ns!.ten, o.phienHienTai!, o.viTri)}
                          title={o.dangNap ? 'Loading older history…' : 'Load older messages'}
                          aria-label="Load older messages"
                        >
                          <ClockCounterClockwise size={18} weight={DAM_ICON} aria-hidden="true" />
                        </button>
                      )}
                      <button
                        className={`nut-tron nut-toan${toanMan === i ? ' bat' : ''}`} type="button"
                        onClick={() => { ghiNhoDay(); datToanMan(toanMan === i ? null : i); }}
                        title={toanMan === i ? 'Return to grid' : 'View slot fullscreen'}
                        aria-label="View slot fullscreen"
                        aria-pressed={toanMan === i}
                      >
                        {toanMan === i
                          ? <CornersIn size={18} weight={DAM_ICON} aria-hidden="true" />
                          : <CornersOut size={18} weight={DAM_ICON} aria-hidden="true" />}
                      </button>
                      <div className="boc-menu">
                        <button
                          className={`nut-tron nut-menu${o.moMenu ? ' bat' : ''}`} type="button"
                          onClick={() => capNhat(i, { moMenu: !o.moMenu })}
                          title="Slot actions"
                          aria-label="Slot menu"
                          aria-expanded={o.moMenu}
                        >
                          <DotsThreeVertical size={18} weight={DAM_ICON} aria-hidden="true" />
                        </button>
                        {o.moMenu && (
                          <>
                            <button
                              className="man-che" type="button" aria-label="Close menu"
                              onClick={() => capNhat(i, { moMenu: false })}
                            />
                            <div className="menu-xo" role="menu">
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moHoSo: !o.moHoSo, moMenu: false })}
                              >
                                <Info size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.moHoSo ? 'Close Seat Profile' : 'Seat Profile · Session · Tokens'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moChonPhien: !o.moChonPhien, moMenu: false })}
                              >
                                <ClockCounterClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.dsPhien.length === 0
                                  ? 'No sessions yet'
                                  : `Session History (${o.dsPhien.length})`}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                disabled={o.dangChay || !o.phienHienTai}
                                onClick={() => { capNhat(i, { moMenu: false }); void napLaiChat(i); }}
                              >
                                <ArrowsClockwise size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.dangChay
                                  ? 'Running — reload later'
                                  : !o.phienHienTai
                                    ? 'No session to reload'
                                    : 'Reload Chat'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { hienMau: !o.hienMau, moMenu: false })}
                              >
                                <TextAlignLeft size={15} weight={DAM_ICON} aria-hidden="true" />
                                {o.hienMau ? 'Hide Chunk Boundaries' : 'Show Chunk Boundaries'}
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => { capNhat(i, { moMenu: false }); void phienMoi(i); }}
                              >
                                <Plus size={15} weight={DAM_ICON} aria-hidden="true" />
                                New Session
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => capNhat(i, { moDan: !o.moDan, loiDan: '', moMenu: false })}
                              >
                                <ClipboardText size={15} weight={DAM_ICON} aria-hidden="true" />
                                Paste Resume Command
                              </button>
                              <button
                                className="muc-menu" type="button" role="menuitem"
                                onClick={() => { capNhat(i, { soan: '', moMenu: false }); }}
                              >
                                <X size={15} weight={DAM_ICON} aria-hidden="true" />
                                Clear Input Text
                              </button>
                              {i > 0 && (
                                <>
                                  <div className="vach-menu" />
                                  <button
                                    className="muc-menu nguy" type="button" role="menuitem"
                                    onClick={() => { void dongOTuMenu(i); }}
                                  >
                                    <X size={15} weight={DAM_ICON} aria-hidden="true" />
                                    Close Slot — Clear
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {boCuc === 1 && (
                      <div className="nhac-phien">
                        {o.phienHienTai ? (
                          <>
                            Active session <code>{o.phienHienTai.slice(0, 8)}…</code>.{' '}
                            <button type="button" className="lien-ket" onClick={() => phienMoi(i)}>
                              Start new session
                            </button>{' '}
                            to reset conversational context.
                          </>
                        ) : (
                          <>New session — session ID assigned upon first message.</>
                        )}
                      </div>
                    )}

                    {o.moDan && (
                      <div className="hop-dan">
                        <div className="dan-nhan">
                          Paste command copied from session notebook (<code>resume.erocathanh.com</code>) — supports
                          <code>claude --resume &lt;id&gt;</code>, commands with <code>cd &quot;…&quot;</code>, or raw UUID.
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
                            Attach Session
                          </button>
                        </div>
                        {o.loiDan && <div className="dan-ket-qua">{o.loiDan}</div>}
                        {/* 🧬 App BIẾT bệnh thì app đưa THUỐC — ⛔ đừng dừng ở lời than (Owner chốt round-122 (bos-funnel)). */}
                        {o.phienChoFork && (
                          <div className="khoi-fork">
                            <button className="nut-chu manh" type="button" disabled={o.dangFork} onClick={() => forkVeGhe(i)}>
                              {o.dangFork ? `🧬 Forking… (${moTaHanFork()})` : '🧬 Fork to this seat'}
                            </button>
                            <span className="ghi-chu-fork">
                              Create a new session branch for this seat. The original session remains untouched.
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
                              placeholder="Initial prompt after fork (optional)"
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
                            <div className="rong">No sessions found. Send your first message to start a session.</div>
                          )}
                          {o.dsPhien.map((p) => (
                            <div
                              key={p.ma}
                              className={`mon${p.dang_chay ? ' dang-chay' : ''}`}
                              onClick={() => chonPhien(i, p)}
                              title={p.dang_chay
                                ? 'Running elsewhere — attaching may disrupt session state'
                                : p.ma}
                            >
                              <b>
                                {p.ma === o.phienHienTai ? '● ' : ''}
                                {p.tin_cuoi || '(empty)'}
                              </b>
                              <i>
                                {p.moc_doc} · {p.so_luot} turns
                                {p.dang_chay ? ' · ⛔ running elsewhere' : ''}
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
                        {o.dangNap && <div className="moc-ngay">Loading session history…</div>}
                        {!o.dangNap && o.tin.length === 0 && (
                          <div className="rong-o">
                            <div className="to">✨</div>
                            <b>{o.phienHienTai ? 'Empty Session' : 'New Session'}</b>
                            <span>Type your message below to get started.</span>
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
                            ⚠️ Unable to query running agent status from server — Stop button may not appear even if the seat is running. Reload the page to retry.
                          </div>
                        )}
                        {o.catDongDai && (
                          <div className="moc-ngay canh-hut">
                            ⚠️ Message truncated due to excessive length. Original content remains in session log.
                          </div>
                        )}
                        {o.tin.map((t) => (
                          <div key={t.ma} className={`dong-tin ${t.ai}`}>
                            <div className="anh-nho">{t.ai === 'toi' ? 'ET' : o.ns!.viet_tat}</div>
                            <div>
                              {/* 🔔 Câu này máy tự gửi, ⛔ KHÔNG phải Owner gõ — phải nói rõ ai gọi. */}
                              {t.tu_ai && (
                                <span className="nhan-danh-thuc" title={`Seat ${t.tu_ai} woke this seat`}>
                                  Woken by {nhanCua(t.tu_ai)}
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
                              ? `Queued message: ${o.hangCho[0]}`
                              : `Queued messages (will be sent in batch): ${o.hangCho.join(' / ')}`}
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
                            title="Return queued messages to input box to edit"
                          >
                            edit queue
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
                            ? 'Responding…'
                            : (camUng || manHep)
                              ? `Message ${o.ns ? o.ns.nhan : 'seat'}…`
                              : `Message ${o.ns ? o.ns.nhan : 'seat'}… (Enter to send)`}
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
                            title="Stop task running in this slot"
                            aria-label="Stop running task"
                          >
                            <Stop size={16} weight={DAM_ICON} aria-hidden="true" />
                          </button>
                        )}
                        <button
                          className="nut-clear-soan" type="button"
                          onClick={() => capNhat(i, { soan: '' })}
                          disabled={!o.soan.trim()}
                          title="Clear input text"
                        >
                          Clear
                        </button>
                        <button
                          className="nut-gui" type="button"
                          onClick={() => gui(i)} disabled={!o.soan.trim()}
                          title={o.dangChay ? 'Seat is responding — this message will be queued' : 'Send'}
                        >
                          Send
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
                            <span className="hs-nhan">Seat</span>
                            <span className="hs-gia"><b>{o.ns.nhan}</b> · <code>{o.ns.ten}</code></span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Role</span>
                            <span className="hs-gia">{o.ns.vai} · {o.ns.ten_phong}</span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Department</span>
                            <span className="hs-gia">{o.ns.ten_phong}</span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Status</span>
                            <span className="hs-gia"><span className={`seat-badge ${o.ns.status || 'idle'}`}>{o.ns.status || 'idle'}</span></span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Session</span>
                            <span className="hs-gia">
                              <span className={`cham-noi${o.phienHienTai ? '' : ' tat'}`} />
                              {o.phienHienTai
                                ? <><code>{o.phienHienTai}</code>{o.noiTiep ? ' · continuous' : ''}</>
                                : 'New session — no ID'}
                            </span>
                          </div>
                          <div className="hs-hang">
                            <span className="hs-nhan">Last Turn</span>
                            <span className="hs-gia">
                              {o.token === null && o.chiPhi === null
                                ? '— no measurements'
                                : <>
                                    {o.token !== null && <b style={{ color: 'var(--vang-sang)' }}>{o.token.toLocaleString('en-US')} tokens</b>}
                                    {o.token !== null && o.chiPhi !== null && ' · '}
                                    {o.chiPhi !== null && `≈ $${o.chiPhi.toFixed(4)}`}
                                  </>}
                            </span>
                          </div>
                          {o.ns.soul && (
                            <div className="hs-hang">
                              <span className="hs-nhan">Soul</span>
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
