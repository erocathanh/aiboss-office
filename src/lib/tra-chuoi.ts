import fs from 'node:fs';
import path from 'node:path';
import { docGocTich, kiemChuoi, khoCua, doTep } from './goc-tich';

/**
 * 🔎 TRA CHUỖI ĐỜI CỦA GHẾ — dành riêng cho câu hỏi loại thứ BA.
 *
 * Ba loại câu hỏi (chốt round-122 (bos-funnel) sau 3 vòng phản biện):
 *   A. «chuyện đó THẾ NÀO / vì sao chọn A»  → tra bản ghi, thấy 1 chỗ là đủ
 *   B. «bây giờ RA SAO / tệp còn ⛔ không»   → ĐO MÁY, bản ghi ⛔ KHÔNG có thẩm quyền
 *   C. «tôi đã nói/giao/gửi… CHƯA»          → khẳng định VẮNG MẶT trên TOÀN CHUỖI ĐỜI
 *
 * 🔴 Loại C là loại nguy nhất: fork chỉ giữ **8,4%** (đo thật 805/9.616 dòng).
 *    ⇒ «⛔ không tìm thấy» **KHÁC** «Owner chưa nói».
 *    ⇒ Chỉ được nói «⛔ không có» khi ĐỘ PHỦ đã CHỨNG MINH ĐỦ; ⛔ không thì phải nói «chưa chắc».
 */

/** Mẫu câu loại C — Owner hỏi về sự CÓ MẶT của một chuyện trong quá khứ. */
const VIEC = 'nói|giao|gửi|bảo|dặn|nhắc|kể|đưa|báo|nhận|hỏi|chốt|duyệt';

/**
 * 🔴 BẪY ĐÃ CẮN (đo 15/08): `\b` của regex dựa trên `[A-Za-z0-9_]` ⇒ **⛔ KHÔNG hiểu chữ có dấu**.
 *    `/\bcó\b/.test('em có nhận')` trả **false** — vì sau «ó» là khoảng trắng, hai bên đều
 *    ⛔ không phải word-char nên ⛔ KHÔNG có ranh giới. Mẫu trông đúng mà im lặng ⛔ không bắt gì.
 * ⇒ Tự định nghĩa ranh giới bằng khoảng trắng / dấu câu, ⛔ ĐỪNG dùng `\b` cho tiếng Việt.
 */
/**
 * 🔴 HAI BẪY ĐÃ CẮN LIÊN TIẾP (đo 15/08) — ghi lại để ⛔ đừng lặp:
 *
 * ① `\b` của regex dựa trên `[A-Za-z0-9_]` ⇒ **⛔ KHÔNG hiểu chữ có dấu**.
 *    `/\bcó\b/.test('em có nhận')` trả **false** — sau «ó» là khoảng trắng, hai bên đều
 *    ⛔ không phải word-char nên ⛔ KHÔNG có ranh giới. Mẫu trông đúng mà im lặng ⛔ không bắt gì.
 *
 * ② Viết ranh giới bằng CHUỖI thì `'\s'` **rụng dấu chéo thành chữ `s`** (escape ⛔ không hợp lệ
 *    trong string literal ⇒ JS nuốt luôn). Đo được: `T` ra `(?:^|[s,;:«"'(])` — chỉ khớp chữ «s».
 *    ⇒ Dùng **lớp ký tự viết THẲNG** (khoảng trắng thật + dấu câu), ⛔ ĐỪNG dùng `\s` trong chuỗi.
 */
const NGAN =
  String.fromCharCode(32, 9, 10, 44, 59, 58, 34, 39, 40, 41, 63, 46, 33) + '«»';
const T = `(?:^|[${NGAN}])`;
const P = `(?=$|[${NGAN}])`;
const KT = `[${NGAN}]+`;

const MAU_LOAI_C: RegExp[] = [
  new RegExp(`${T}(đã|từng)${P}[^?.!]{0,120}${T}(chưa)${P}`, 'i'),
  new RegExp(`${T}(${VIEC})${P}[^?.!]{0,120}${T}(chưa)${P}`, 'i'),
  new RegExp(`${T}chưa${KT}(${VIEC})${P}`, 'i'),
  new RegExp(`${T}có${P}[^?.!]{0,80}${T}(${VIEC})${P}[^?.!]{0,80}${T}(không|chưa)${P}`, 'i'),
  new RegExp(`${T}nhớ${KT}(là${KT})?(đã${KT})?(${VIEC})${P}`, 'i'),
  new RegExp(`${T}(mấy|bao nhiêu)${KT}lần${P}`, 'i'),
  new RegExp(`${T}lần${KT}(cuối|gần nhất)${P}`, 'i'),
];




/**
 * Ba mẫu CẦN PHANH: chỉ số 4·5·6 ⇒ **mẫu 5 («nhớ…») · mẫu 6 («mấy/bao nhiêu lần») · mẫu 7 («lần cuối»)**.
 *
 * 🐛 Vì sao ba chứ ⛔ một: bản đầu chỉ phanh mẫu 5, `claude-aiboss-app-pm` chạy thật và bắt được
 *    **ba sai dương còn sống**: «lần cuối tôi gặp nó là hôm qua» · «đây là lần cuối tôi nhắc nhé»
 *    (mẫu 7) · «bao nhiêu lần cũng được» (mẫu 6). Bốn mẫu còn lại tự buộc «chưa»/«không» nên ⛔ cần.
 * ⛔ ĐỪNG cắm số rời rạc ở chỗ khác — chèn mẫu mới vào giữa là lệch âm thầm.
 */
const CAN_CONG_HOI = new Set([4, 5, 6]);

/**
 * 🚧 CỔNG «CÂU HỎI» — ba mẫu trên khớp THÔI CHƯA ĐỦ, câu còn phải có dấu hiệu ĐANG HỎI.
 *
 * 🐛 Ca gốc (Owner 23/08): «**Nhớ nhắc** tụi nó ở bước cuối nhé» — Owner đang **GIAO VIỆC**,
 *    mà app vẫn nối khối «🔎 APP ĐÃ TRA GIÚP» vào cuối câu rồi mới đưa ghế. Owner tự phát hiện:
 *    *«app này can thiệp vào nội dung tôi gửi à?»*
 *
 * 🔴 SÁU CHỮ ĐÃ THỬ RỒI LOẠI — trông như dấu hỏi nhưng đầy trong câu KỂ tiếng Việt.
 *    Mỗi chữ đều có CA THẬT chứng minh nó lọt, ⛔ phải suy đoán:
 *      «rồi»           ⇒ lọt «mấy lần trước tôi bỏ qua RỒI thôi» · «tôi nhắc nó RỒI mà nó quên»
 *      «bao nhiêu|mấy» ⇒ lọt «BAO NHIÊU lần cũng được»
 *      «ai|đâu|nào»    ⇒ lọt «…giao việc cho AI agent NÀO ở ô NÀO nhé» — CÂU KỂ của Owner
 *    Bỏ «bao nhiêu» ⛔ làm hụt mẫu 6: «anh nhắc nó bao nhiêu lần rồi?» vẫn qua nhờ dấu «?».
 *
 * 📐 ĐO TRÊN 594 CÂU THẬT của Owner (`~/Operations/scripts/.cau-that-owner-594.txt`),
 *    ⛔ phải trên câu tự nghĩ — bộ ca tự nghĩ đo được LOGIC, ⛔ đo được THÓI QUEN NGÔN NGỮ:
 *      chưa vá                    76 câu bị chèn
 *      phanh mỗi mẫu 5            73
 *      phanh 5·6·7 + bộ RỘNG      75   ← «ai|đâu|nào» MỞ LẠI đúng cái sai dương vừa chặn
 *      phanh 5·6·7 + bộ HẸP       72   ← BẢN NÀY. 72 câu còn lại đi cửa mẫu 1-4, ĐÚNG chủ đích.
 *    🕳 Lần bóc kho đầu tiên HỎNG: lọc bỏ câu >400 ký tự ⇒ ra 431 câu và mẫu 5·6·7 = 0.
 *       Nhưng câu ĐÃ BỊ CHÈN thì DÀI RA ⇒ bộ lọc ăn đúng những câu đã nổ. Số 0 đó vô giá trị.
 *
 * ⚠️ `?` (mã 63) NẰM SẴN TRONG `NGAN` ⇒ `${T}chưa${P}` khớp được cả «…chưa?». ⛔ cần liệt kê riêng.
 * ⚠️ PHẢI GIỮ NEO `${T}…${P}` — bỏ neo là «ai» khớp nhầm trong «h(ai)» · «ngo(ài)».
 *    Và ⛔ ĐƯỢC thay bằng `\b`: `\b` dựa trên [A-Za-z0-9_] nên ⛔ hiểu chữ có dấu (bẫy ghi ở đầu tệp).
 */
const CO_DAU_HOI = new RegExp(
  `[?]|${T}(chưa|khi nào|bao giờ|lúc nào|thế nào)${P}`,
  'i',
);

export function laLoaiC(cau: string): boolean {
  return MAU_LOAI_C.some((r, i) => {
    if (!r.test(cau)) return false;
    // Ba mẫu 5·6·7 khớp thôi CHƯA đủ — câu phải kèm dấu hiệu hỏi (xem CO_DAU_HOI).
    if (CAN_CONG_HOI.has(i) && !CO_DAU_HOI.test(cau)) return false;
    return true;
  });
}

/** Bóc từ khoá tra: bỏ từ nối, giữ từ có nghĩa. */
export function bocTuKhoa(cau: string): string[] {
  const BO = new Set(['tôi','em','anh','đã','chưa','rồi','này','cái','là','có','không','với','cho','mà','thì','và','ở','của','một','các','những','bạn','ông','giúp','giùm','nhé','ạ','à','ừ','hay','lần','mấy','bao','nhiêu','cuối','gần','nhất','nhớ','nói','giao','gửi','bảo','dặn','nhắc','kể','vụ','việc','hỏi','chữ','câu','cái','đó','ấy','nào','khi','file','tệp','trang','bài']);
  // ⚠️ Câu ⛔ KHÔNG có danh từ riêng (vd «tôi đã nói với em cái này chưa») ⇒ bóc ra RỖNG
  //    ⇒ ⛔ không tra được. Khi đó PHẢI hỏi lại Owner một chữ, ⛔ ĐỪNG im lặng đoán.
  return Array.from(
    new Set(
      cau
        .replace(/[?.!,;:«»"'()]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !BO.has(t.toLowerCase())),
    ),
  ).slice(0, 4);
}

export interface MauKhop {
  tang: number;
  ma_phien: string;
  luc: string | null;
  trich: string;
  la_owner: boolean;
}

/** Quét MỘT tệp trong ĐÚNG DẢI của nó — ⛔ không quét quá mốc cắt. */
function quetTep(duongDan: string, mocCat: number | null, tuKhoa: string[], gioiHan: number): MauKhop[] {
  const ra: MauKhop[] = [];
  let dong = 0;
  const fd = fs.openSync(duongDan, 'r');
  try {
    const dem = Buffer.alloc(1 << 20);
    let du = '';
    let doc = 0;
    while ((doc = fs.readSync(fd, dem, 0, dem.length, null)) > 0) {
      du += dem.subarray(0, doc).toString('utf8');
      let k: number;
      while ((k = du.indexOf('\n')) >= 0) {
        const l = du.slice(0, k);
        du = du.slice(k + 1);
        dong += 1;
        // ⭐ DẢI: phần sau mốc cắt là đời của NHÁNH KHÁC — quét vào là nhận vơ + đếm trùng.
        if (mocCat !== null && dong > mocCat) return ra;
        if (ra.length >= gioiHan) return ra;
        const thap = l.toLowerCase();
        // 🔴 BẪY ĐÃ CẮN (đo 15/08): bản đầu đòi `every()` — MỌI từ khoá phải cùng nằm trên
        //    MỘT dòng. Ca thật «anh đã gửi em chữ PONG chưa» ⇒ từ khoá [chữ, PONG]; dòng có
        //    «PONG» mà ⛔ không có «chữ» ⇒ **0 hit dù nội dung CÓ THẬT**.
        //    ⇒ Cỗ máy sẽ luôn trả «⛔ không thấy» — đúng kiểu sai nguy nhất ta đang chống.
        // ⇒ Đủ điều kiện: khớp **từ khoá DÀI NHẤT** (từ mang nghĩa nhất), ⛔ không đòi khớp hết.
        const chinh = [...tuKhoa].sort((a, b) => b.length - a.length)[0].toLowerCase();
        if (!thap.includes(chinh)) continue;
        try {
          const j = JSON.parse(l) as {
            type?: string; userType?: string; timestamp?: string;
            message?: { content?: unknown };
          };
          // ⭐ CHỈ tính lời Owner — ⛔ không tính câu máy nói, ⛔ không tính máy trích lại lời Owner.
          const laOwner = j.type === 'user' && j.userType === 'external';
          const c = j.message?.content;
          let chu = typeof c === 'string' ? c : '';
          if (Array.isArray(c)) {
            chu = c.map((b) => (b as { text?: string })?.text ?? '').join(' ');
          }
          chu = chu.replace(/\s+/g, ' ').trim();
          if (!chu || chu.length < 8) continue;
          const vt = chu.toLowerCase().indexOf(chinh);
          const dau = Math.max(0, vt - 90);
          ra.push({
            tang: 0, ma_phien: '', luc: j.timestamp ?? null,
            trich: (dau > 0 ? '…' : '') + chu.slice(dau, dau + 260),
            la_owner: laOwner,
          });
        } catch {
          /* dòng hỏng → bỏ */
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return ra;
}

export interface KetQuaTra {
  loai_c: boolean;
  tu_khoa: string[];
  do_phu: 'DU' | 'THIEU' | 'KHONG_CO_SO';
  so_tang: number;
  tang_hong: { ma: string; trang_thai: string }[];
  khop: MauKhop[];
  /** Câu dặn sẽ chèn vào lời hỏi — chữ đã chốt round-122 (bos-funnel). */
  loi_dan: string;
}

/**
 * 🔌 CỜ TẮT — `TRA_CHUOI=0` thì tính năng nghỉ hẳn, ⛔ nối thêm gì vào câu Owner.
 *
 * · MẶC ĐỊNH **BẬT**: chỉ đúng chuỗi `'0'` mới tắt. Thiếu biến / rỗng / giá trị lạ ⇒ VẪN BẬT
 *   (⛔ đổi nết đang chạy — người ⛔ biết cờ này tồn tại thì ⛔ thấy gì khác).
 * · Đọc LÚC GỌI chứ ⛔ lúc nạp mô-đun: để thử được CẢ HAI CHIỀU mà ⛔ phải nạp lại mô-đun.
 * · Đặt ở `chay-lan.sh` (cùng chỗ TRAN_DONG_THOI · SO_LUOT_MOI_PHUT).
 */
export function traChuoiDangBat(): boolean {
  return process.env.TRA_CHUOI !== '0';
}

export function traChuoi(maNhanSu: string, maPhien: string | null, cau: string): KetQuaTra | null {
  if (!traChuoiDangBat()) return null;
  if (!laLoaiC(cau)) return null;
  const tuKhoa = bocTuKhoa(cau);
  if (!tuKhoa.length) {
    // ⛔ ⛔ KHÔNG im lặng bỏ qua: câu loại C mà ⛔ không có chữ để tra thì phải HỎI LẠI.
    return {
      loai_c: true, tu_khoa: [], do_phu: 'KHONG_CO_SO', so_tang: 0, tang_hong: [], khop: [],
      loi_dan:
        '🔎 APP: câu này là loại «đã…chưa» nhưng ⛔ KHÔNG bóc được chữ nào để tra ' +
        '(toàn từ nối). ⇒ ⛔ ĐỪNG đoán. Hỏi lại Owner: «Anh cho em một chữ khoá cụ thể ' +
        '(tên việc / tên tệp / tên trang) để em tra đúng chỗ nhé?»',
    };
  }

  const so = docGocTich(maNhanSu);
  const gt = maPhien ? (so[maPhien] ?? null) : null;
  const kiem = kiemChuoi(gt);

  const khop: MauKhop[] = [];
  const daThay = new Set<string>();

  // Tầng 0: chính phiên hiện tại (⛔ không giới hạn dải).
  if (maPhien) {
    const tep = path.join(khoCua(maNhanSu), `${maPhien}.jsonl`);
    if (fs.existsSync(tep)) {
      for (const m of quetTep(tep, null, tuKhoa, 6)) {
        const khoa = `${m.luc}|${m.trich.slice(0, 60)}`;
        if (daThay.has(khoa)) continue;   // ⭐ gộp trùng: fork giữ UUID cũ ⇒ ⛔ không gộp là đếm đôi
        daThay.add(khoa);
        khop.push({ ...m, tang: 0, ma_phien: maPhien });
      }
    }
  }

  // Tầng 1..N: theo chuỗi tổ tiên, mỗi tầng CHỈ trong dải của nó.
  gt?.chuoi.forEach((mx, k) => {
    try {
      for (const m of quetTep(mx.duong_dan_cha, mx.moc_cat, tuKhoa, 6)) {
        const khoa = `${m.luc}|${m.trich.slice(0, 60)}`;
        if (daThay.has(khoa)) continue;
        daThay.add(khoa);
        khop.push({ ...m, tang: k + 1, ma_phien: mx.ma_cha });
      }
    } catch {
      /* tệp mất → kiemChuoi đã bắt */
    }
  });

  const cuaOwner = khop.filter((m) => m.la_owner);
  const doPhu: KetQuaTra['do_phu'] = !gt ? 'KHONG_CO_SO' : kiem.du ? 'DU' : 'THIEU';
  const hong = kiem.mat_xich.filter((m) => m.trang_thai !== 'OK').map((m) => ({ ma: m.ma.slice(0, 8), trang_thai: m.trang_thai }));

  let dan: string;
  if (cuaOwner.length) {
    const d = cuaOwner
      .slice(0, 3)
      .map((m) => `• [tầng ${m.tang} · ${m.luc?.slice(0, 19) ?? 'chưa rõ giờ'}] ${m.trich}`)
      .join('\n');
    dan =
      `🔎 APP ĐÃ TRA GIÚP (từ khoá: ${tuKhoa.join(' · ')}) — TÌM THẤY ${cuaOwner.length} chỗ:\n${d}\n` +
      `⇒ Trả lời: «Rồi anh — [trích] · tầng [N] · lúc [giờ]». Dẫn ĐÚNG mốc giờ ở trên.`;
  } else if (doPhu === 'DU') {
    dan =
      `🔎 APP ĐÃ TRA GIÚP (từ khoá: ${tuKhoa.join(' · ')}) — ⛔ KHÔNG thấy, và chuỗi ĐỦ (${kiem.mat_xich.length} tầng đều kiểm được).\n` +
      `⇒ Trả lời ĐÚNG khuôn này, ⛔ TUYỆT ĐỐI ⛔ không rút gọn thành «dạ chưa ạ»:\n` +
      `«Em quét đủ chuỗi ${kiem.mat_xich.length} tầng theo từ khoá [${tuKhoa.join(', ')}] — KHÔNG có trong đời ghế này. ` +
      `Anh nhớ đã nói thì khả năng ở kênh/ghế khác, hoặc anh cho em một chữ khác để quét lại.»`;
  } else {
    const thieu = hong.length ? hong.map((h) => `${h.ma}(${h.trang_thai})`).join(', ') : 'ghế này ⛔ chưa có sổ gốc tích';
    dan =
      `🔎 APP ĐÃ TRA GIÚP (từ khoá: ${tuKhoa.join(' · ')}) — ⛔ KHÔNG thấy, NHƯNG chuỗi THIẾU: ${thieu}.\n` +
      `⇒ ⛔ CẤM nói «chưa». Trả lời ĐÚNG khuôn:\n` +
      `«Em quét được phần có sổ — ⛔ không thấy. Nhưng chuỗi thiếu mắt xích (${thieu}) nên em ⛔ KHÔNG dám nói "chưa" — chưa chắc.»`;
  }

  return {
    loai_c: true, tu_khoa: tuKhoa, do_phu: doPhu,
    so_tang: (gt?.chuoi.length ?? 0) + 1, tang_hong: hong,
    khop: cuaOwner.slice(0, 6), loi_dan: dan,
  };
}
