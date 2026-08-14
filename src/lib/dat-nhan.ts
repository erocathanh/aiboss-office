/**
 * SINH NHÃN DỄ HIỂU TỪ TÊN KỸ THUẬT
 * ==================================
 * Owner: tên slug là tên của terminal — người xem ⛔ không hiểu ngay đó là ai.
 * ⇒ dòng CHÍNH phải là nhãn tiếng Việt đọc-ra-việc; tên slug xuống dòng phụ.
 *
 * ⛔ KHÔNG bỏ tên kỹ thuật — nó vẫn là mã định danh thật để nối phiên và tra cứu.
 *
 * Luật:
 *  1. Bỏ tiền tố `claude-`, tách theo dấu gạch.
 *  2. Rút "dấu vai" (pm/exec/review/guide) ra làm tiền tố vai.
 *  3. Dịch từ khoá kỹ thuật sang tiếng Việt đời thường bằng bảng tra.
 *  4. Từ ⛔ không dịch được (mã số, tên riêng lạ) → GIỮ NGUYÊN, ⛔ không bịa nghĩa.
 *  5. Nhãn phải ỔN ĐỊNH (cùng tên → cùng nhãn) và ⛔ KHÔNG TRÙNG trong cùng phòng.
 *
 * Bảng tra lập SAU KHI đọc hết 224 từ khoá có thật trong 211 tên, ⛔ không đoán mò.
 */

/** Cụm nhiều từ — tra TRƯỚC khi tra từng từ. */
const CUM_TU: Array<[string[], string]> = [
  [['cham', 'bai'], 'chấm bài'],
  [['giao', 'trinh'], 'giáo trình'],
  [['toi', 'uu'], 'tối ưu'],
  [['dieu', 'hanh'], 'điều hành'],
  [['can', 'lam'], 'cần làm'],
  [['quan', 'ly'], 'quản lý'],
  [['tro', 'ly'], 'trợ lý'],
  [['token', 'quota'], 'hạn mức token'],
  [['lead', 'capture'], 'thu khách tiềm năng'],
  [['multi', 'hub'], 'trạm đa kênh'],
  [['omni', 'ads'], 'quảng cáo đa kênh'],
  [['so', 'do'], 'sơ đồ'],
  [['ai', 'content', 'os'], 'AI Content OS'],
  [['ai', 'business', 'os'], 'AI Business OS'],
];

/** Từ khoá → tiếng Việt đời thường. */
const TU_DIEN: Record<string, string> = {
  // hạ tầng & kỹ thuật
  web: 'web', site: 'trang', landing: 'trang đích', salepage: 'trang bán',
  build: 'dựng', builder: 'dựng', rebuild: 'dựng lại', deploy: 'đưa lên mạng',
  server: 'máy chủ', platform: 'nền tảng', engine: 'bộ máy', eng: 'bộ máy',
  ui: 'giao diện', fe: 'giao diện', ccui: 'giao diện Claude Code',
  cc: 'Claude Code', code: 'mã', mcp: 'MCP', api: 'API',
  auth: 'xác thực', oauth: 'OAuth', token: 'token', quota: 'hạn mức',
  hardening: 'gia cố', guard: 'canh gác', monitor: 'mắt canh', test: 'kiểm thử',
  fixes: 'sửa lỗi', mvp: 'bản chạy thử', prd: 'bản đặc tả', spine: 'xương sống',
  pipeline: 'đường ống', bridge: 'cầu nối', embed: 'nhúng', ingest: 'nạp',
  batch: 'theo lô', remote: 'từ xa', rotate: 'xoay vòng', filter: 'lọc',
  chain: 'chuỗi', loop: 'vòng lặp', hook: 'móc tự động', wizard: 'trình hướng dẫn',
  tach: 'tách', hop: 'gộp', speed: 'tốc độ', tong: 'tổng', general: 'chung',
  os: 'OS', tab: 'thẻ', view: 'xem', panel: 'bảng', ws: 'workshop',

  // bán hàng & tiếp thị
  funnel: 'phễu bán hàng', sales: 'bán hàng', ban: 'bán', marketing: 'marketing',
  lead: 'khách tiềm năng', crm: 'khách hàng', leadmagnet: 'quà thu khách',
  lm: 'quà thu khách', offer: 'chào giá', pitch: 'chào hàng', ad: 'quảng cáo',
  ads: 'quảng cáo', swipe: 'sưu tầm quảng cáo', b2b: 'B2B', strategy: 'chiến lược',
  survey: 'khảo sát', postpay: 'trả sau', deposit: 'đặt cọc', payment: 'thanh toán',
  orders: 'đơn hàng', booking: 'đặt lịch', subcription: 'thuê bao',
  tmdt: 'thương mại điện tử', shop: 'cửa hàng', online: 'trực tuyến',

  // nội dung & kênh
  content: 'nội dung', blog: 'blog', wiki: 'wiki', docs: 'tài liệu',
  social: 'mạng xã hội', reel: 'reel', video: 'video', audio: 'âm thanh',
  image: 'ảnh', anh: 'ảnh', slide: 'trang chiếu', story: 'câu chuyện',
  email: 'thư', comms: 'liên lạc', channels: 'kênh', chat: 'trò chuyện',
  zalo: 'Zalo', skool: 'Skool', lark: 'Lark', zoom: 'Zoom', chrome: 'Chrome',
  youtube: 'YouTube', ytm: 'YouTube', wp: 'WordPress', salekit: 'Salekit',
  dmarc: 'DMARC', tts: 'đọc thành tiếng', omnivoice: 'giọng đa kênh',
  info: 'thông tin', report: 'báo cáo', reports: 'báo cáo', eeat: 'EEAT',

  // đào tạo
  cohort: 'lớp học', lop: 'lớp', hoc: 'học', hocvien: 'học viên',
  khoahoc: 'khoá học', course: 'khoá học', teaching: 'giảng dạy',
  homework: 'bài tập', program: 'chương trình', workshop: 'workshop',
  plan: 'kế hoạch', seed: 'gieo mầm',

  // vận hành nội bộ
  lich: 'lịch', state: 'sổ trạng thái', memory: 'trí nhớ', skill: 'kỹ năng',
  sanskill: 'kỹ năng', adskill: 'kỹ năng quảng cáo', kaizen: 'cải tiến',
  auto: 'tự động', autopilot: 'tự lái', org: 'sơ đồ tổ chức', rule: 'luật',
  policy: 'chính sách', viec: 'việc', moi: 'mới', tuan: 'tuần', chang: 'chặng',
  research: 'nghiên cứu', launch: 'ra mắt', setup: 'cài đặt', share: 'chia sẻ',
  account: 'tài khoản', may: 'máy', mac: 'máy Mac', tech: 'kỹ thuật',
  rieng: 'riêng', trung: 'trùng', luon: 'luôn', retired: 'đã nghỉ',
  services: 'dịch vụ', ceo: 'CEO', hub: 'trạm', multi: 'đa', omni: 'đa kênh',

  // tên riêng — giữ dạng đẹp
  ai: 'AI', agent: 'agent', bot: 'bot', aiboss: 'AIBOSS', bos: 'AIBOSS',
  bcls: 'BCLS', claude: 'Claude', allsessions: 'mọi phiên', aicons: 'Aicons',
  aicos: 'AI Content OS', aicontentos: 'AI Content OS', maracafi: 'Maracafi',
  hermes: 'Hermes', kiro: 'Kiro', sonnet: 'Sonnet', veo: 'Veo',
  i2global: 'i2Global', glamorous: 'Glamorous', storyfit: 'StoryFit',
  ocathanh: 'Ocathanh', gstack: 'GStack', nail: 'tiệm nail', oto: 'ô tô',
  alpha: 'Alpha', en: 'Anh', vn: 'Việt', truong: 'trường',
};

/** Dấu vai nằm trong slug → tiền tố vai của nhãn. */
const DAU_VAI: Record<string, string> = {
  pm: 'Trưởng phòng',
  exec: 'Thực thi',
  exe: 'Thực thi',
  review: 'Kiểm định',
  reviewer: 'Kiểm định',
  guide: 'Cố vấn',
};

/** Từ chỉ là nhiễu định danh — không mang nghĩa, chỉ dùng khi cần phân biệt. */
const LA_NHIEU = (t: string): boolean =>
  /^\d+$/.test(t) || /^r\d+$/.test(t) || /^g\d+[a-z]?$/.test(t);

/**
 * Nhiễu → chữ đọc được. `r2` là "đợt 2" (vòng làm việc), số trần là mã định danh.
 * ⛔ Không bịa nghĩa: mã số vẫn giữ nguyên con số, chỉ thêm dấu # cho rõ đó là mã.
 */
function docNhieu(t: string): string {
  const dot = /^r(\d+)$/.exec(t);
  if (dot) return `đợt ${dot[1]}`;
  if (/^\d+$/.test(t)) return `#${t}`;
  return t;
}

/**
 * Bỏ phần lặp: "giao diện Claude Code" + "giao diện" → "giao diện Claude Code".
 * Bỏ cả trùng nguyên si LẪN trùng-nằm-trong (một từ đã nằm sẵn trong cụm trước).
 */
function boLap(tu: string[]): string[] {
  /** `con` có nằm gọn trong `cha` theo ĐÚNG chuỗi từ liền nhau không. */
  const namTrong = (cha: string, con: string): boolean => {
    const a = cha.toLowerCase().split(' ');
    const b = con.toLowerCase().split(' ');
    if (b.length > a.length) return false;
    for (let i = 0; i + b.length <= a.length; i++) {
      if (b.every((w, k) => a[i + k] === w)) return true;
    }
    return false;
  };

  const ra: string[] = [];
  for (const t of tu) {
    if (ra.some((c) => namTrong(c, t))) continue;
    ra.push(t);
  }
  return ra;
}

function hoaDauCau(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

interface NhanTho {
  vaiTuSlug: string | null;
  chuDe: string[];
  nhieu: string[];
}

function boc(slug: string): NhanTho {
  const tho = slug.replace(/^claude-/, '').toLowerCase();
  const tu = tho.split('-').filter(Boolean);

  let vaiTuSlug: string | null = null;
  const conLai: string[] = [];
  const nhieu: string[] = [];

  for (const t of tu) {
    if (DAU_VAI[t] && !vaiTuSlug) {
      vaiTuSlug = DAU_VAI[t]!;
      continue;
    }
    if (DAU_VAI[t]) continue; // dấu vai lặp → bỏ
    if (LA_NHIEU(t)) {
      nhieu.push(t);
      continue;
    }
    conLai.push(t);
  }

  // Tra cụm nhiều từ trước
  const chuDe: string[] = [];
  let i = 0;
  while (i < conLai.length) {
    let trung = false;
    for (const [cum, nghia] of CUM_TU) {
      if (cum.every((c, k) => conLai[i + k] === c)) {
        chuDe.push(nghia);
        i += cum.length;
        trung = true;
        break;
      }
    }
    if (trung) continue;
    const t = conLai[i]!;
    chuDe.push(TU_DIEN[t] ?? t); // ⛔ không dịch được thì GIỮ NGUYÊN
    i += 1;
  }

  return { vaiTuSlug, chuDe: boLap(chuDe), nhieu };
}

/** Nhãn cơ sở — chưa xét trùng. */
function nhanCoSo(slug: string, vaiDuLieu: string): string {
  const { vaiTuSlug, chuDe, nhieu } = boc(slug);
  const vai = vaiTuSlug ?? (vaiDuLieu === 'Trưởng phòng' ? 'Trưởng phòng' : null);
  const de = chuDe.slice(0, 4).join(' ').trim();

  // ⛔ Không có chủ đề nào (vd `claude-501`) → mượn mã số làm chỗ nhận mặt.
  if (!de) {
    const ma = nhieu[0] ? ` ${docNhieu(nhieu[0]!)}` : '';
    return `${vai ?? vaiDuLieu}${ma}`;
  }
  return vai ? `${vai} ${de}` : hoaDauCau(de);
}

export interface NguoiCoNhan {
  ten: string;
  phong: string;
  vai: string;
  nhan: string;
}

/**
 * Sinh nhãn cho CẢ danh sách — phải làm theo lô vì luật "⛔ không trùng
 * trong cùng phòng" chỉ kiểm được khi nhìn toàn bộ.
 */
export function datNhanHangLoat<T extends { ten: string; phong: string; vai: string }>(
  ds: T[],
): Array<T & { nhan: string }> {
  const thoBanDau = ds.map((n) => ({ n, co: nhanCoSo(n.ten, n.vai) }));

  // Đếm trùng theo (phòng + nhãn)
  const dem = new Map<string, number>();
  for (const { n, co } of thoBanDau) {
    const k = `${n.phong}::${co.toLowerCase()}`;
    dem.set(k, (dem.get(k) ?? 0) + 1);
  }

  const daDung = new Set<string>();
  return thoBanDau.map(({ n, co }) => {
    const k = `${n.phong}::${co.toLowerCase()}`;
    let nhan = co;

    if ((dem.get(k) ?? 0) > 1) {
      // Trùng → thêm chữ phân biệt lấy từ chính phần còn lại của slug.
      const { nhieu, chuDe } = boc(n.ten);
      const them = nhieu[0] ? docNhieu(nhieu[0]!) : chuDe.slice(4).join(' ');
      nhan = them ? `${co} ${them}` : co;
    }

    // Chốt chặn cuối: vẫn đụng nhau thì gắn đuôi slug cho khỏi lẫn.
    let khoaCuoi = `${n.phong}::${nhan.toLowerCase()}`;
    if (daDung.has(khoaCuoi)) {
      const duoi = n.ten.replace(/^claude-/, '').split('-').slice(-1)[0]!;
      nhan = `${nhan} ${duoi}`;
      khoaCuoi = `${n.phong}::${nhan.toLowerCase()}`;
      let dem2 = 2;
      while (daDung.has(khoaCuoi)) {
        khoaCuoi = `${n.phong}::${nhan.toLowerCase()} ${dem2}`;
        nhan = `${nhan} ${dem2}`;
        dem2 += 1;
      }
    }
    daDung.add(khoaCuoi);

    return { ...n, nhan };
  });
}
