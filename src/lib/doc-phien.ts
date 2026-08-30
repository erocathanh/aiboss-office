import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { CAU_HINH } from './cau-hinh';
import { timNhanSu } from './nhan-su';

/**
 * ĐỌC KHO PHIÊN THẬT của Claude Code trên máy.
 *
 * Kho nằm ở `~/.claude/projects/<thư-mục-đã-mã-hoá>/<uuid>.jsonl`.
 * Quy tắc mã hoá ĐO TẠI MÁY (⛔ không suy đoán):
 *     `/` → `-`   và   `.` → `-`
 *   ví dụ  /Users/erocathanh/.claude/projects
 *       →  -Users-erocathanh--claude-projects        (dấu `--` là do `/.`)
 *
 * ⛔ KHÔNG gọi `claude --resume` rỗng rồi bóc chữ màn hình — đọc thẳng .jsonl sạch hơn.
 *
 * ⭐ Mỗi nhân sự có THƯ MỤC LÀM VIỆC RIÊNG (`agent-ws/<slug>`) ⇒ phiên của ai
 *    nằm gọn kho của người đó, ⛔ không lẫn vào nhau.
 */

const GOC_KHO = path.join(os.homedir(), '.claude', 'projects');

/** Ngưỡng coi là "đang chạy nơi khác" — lấy đúng ngưỡng sổ phiên của Owner: 5 phút. */
export const NGUONG_SONG_PHUT = 5;

export function thuMucAgent(maNhanSu: string): string {
  // Chỉ nhận ký tự an toàn — ⛔ chặn đường leo thư mục (../).
  const sach = maNhanSu.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!sach || sach !== maNhanSu) throw new Error('Mã nhân sự không hợp lệ.');

  /**
   * 📁 Ghế khai `thu_muc` thì ĐỨNG ĐÚNG CHỖ ĐÓ, ⛔ đẻ thư mục con theo tên ghế.
   * Vì kho phiên suy TỪ chỗ đứng, đây là cách DUY NHẤT nối một ghế vào phiên
   * đã có sẵn ở thư mục khác (bộ «Quản Lý Trường», 30/08).
   * ⛔ nhận đường tương đối / có `..` — chỉ đường TUYỆT ĐỐI đã chuẩn hoá.
   */
  const rieng = timNhanSu(sach)?.thu_muc;
  if (rieng) {
    const chuan = path.normalize(rieng);
    if (path.isAbsolute(chuan) && !chuan.split(path.sep).includes('..')) return chuan;
    throw new Error('thu_muc của ghế phải là đường TUYỆT ĐỐI và ⛔ chứa "..".');
  }

  return path.join(CAU_HINH.thuMucLamViec, sach);
}

/** Mã hoá đường dẫn thành tên thư mục kho — đúng luật đã đo. */
export function maHoaDuongDan(p: string): string {
  return p.replace(/[/.]/g, '-');
}

export function khoPhienCua(maNhanSu: string): string {
  return path.join(GOC_KHO, maHoaDuongDan(thuMucAgent(maNhanSu)));
}

export interface TomTatPhien {
  ma: string;
  /** Mốc sửa cuối (mili-giây). */
  moc: number;
  moc_doc: string;
  /** Vài chữ đầu của tin cuối. */
  tin_cuoi: string;
  so_luot: number;
  /** Đang chạy ở nơi khác → ⛔ KHÔNG cho nối vào. */
  dang_chay: boolean;
}

interface DongPhien {
  type?: string;
  userType?: string;
  timestamp?: string;
  message?: { content?: unknown };
}

function bocChu(m: unknown): string {
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) {
    return m
      .filter(
        (x): x is { type: string; text: string } =>
          typeof x === 'object' && x !== null && (x as { type?: string }).type === 'text',
      )
      .map((x) => x.text)
      .join(' ');
  }
  return '';
}

/** Đọc ĐUÔI tệp cho nhanh — ⛔ đừng nuốt cả tệp có thể tới hàng chục MB. */
function docDuoi(p: string, soByte = 256 * 1024): string {
  const cd = fs.statSync(p).size;
  const bd = Math.max(0, cd - soByte);
  const fd = fs.openSync(p, 'r');
  try {
    const dem = Buffer.alloc(cd - bd);
    fs.readSync(fd, dem, 0, dem.length, bd);
    const s = dem.toString('utf8');
    return bd > 0 ? s.slice(s.indexOf('\n') + 1) : s; // bỏ dòng đầu bị cắt dở
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Liệt kê mọi phiên của một nhân sự.
 *
 * `phienCuaTa` = { mã phiên ô đang giữ, mốc kết thúc lượt của ta } — để KHÔNG
 * gắn nhãn "đang chạy nơi khác" lên chính phiên mà ô này vừa chạy xong.
 * (Đã cắn thật lúc nghiệm thu: phiên đang mở bị tự gắn cờ rồi hoá ra bấm không được.)
 */
export function dsPhien(
  maNhanSu: string,
  phienCuaTa?: { ma: string | null; mocKetThuc: number | null },
): TomTatPhien[] {
  let kho: string;
  try {
    kho = khoPhienCua(maNhanSu);
  } catch {
    return [];
  }
  if (!fs.existsSync(kho)) return [];

  const bayGio = Date.now();
  const ra: TomTatPhien[] = [];

  for (const t of fs.readdirSync(kho)) {
    if (!t.endsWith('.jsonl')) continue;
    const p = path.join(kho, t);
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size === 0) continue;

    let tinCuoi = '';
    let soLuot = 0;
    try {
      for (const d of docDuoi(p).split('\n')) {
        const s = d.trim();
        if (!s.startsWith('{')) continue;
        let j: DongPhien;
        try {
          j = JSON.parse(s) as DongPhien;
        } catch {
          continue;
        }
        if (j.type === 'user' && j.userType === 'external') {
          soLuot += 1;
          const c = bocChu(j.message?.content).trim();
          if (c) tinCuoi = c;
        }
      }
    } catch {
      /* tệp hỏng thì bỏ qua, ⛔ đừng làm sập cả danh sách */
    }

    const ma = t.replace(/\.jsonl$/, '');
    const phutTuoi = (bayGio - st.mtimeMs) / 60000;

    // ⛔ LUẬT CỨNG: phiên vừa đổi trong 5 phút coi như ĐANG SỐNG ở terminal khác.
    //    Hai tiến trình cùng ghi một tệp phiên = hỏng bản ghi.
    // ⚠️ Luật ở đây PHẢI khớp `dangChay()` bên dưới — hai chỗ lệch nhau thì danh sách
    //    hiện một đằng, cổng chặn làm một nẻo (đã cắn: đo bằng danh sách tưởng cổng còn hỏng).
    let dang_chay = phutTuoi < NGUONG_SONG_PHUT;
    if (dang_chay && phienCoTienTrinhSong(ma)) {
      dang_chay = true; // sờ tận tay có tiến trình cầm ⇒ bận thật
    } else if (dang_chay && phienCuaTa?.ma === ma && phienCuaTa.mocKetThuc !== null) {
      // Ta sở hữu phiên này ⇒ mốc-sửa-tệp ⛔ không còn quyền chặn (xem lý do ở `dangChay`).
      dang_chay = false;
    }

    ra.push({
      ma,
      moc: st.mtimeMs,
      moc_doc: new Date(st.mtimeMs).toLocaleString('vi-VN', { hour12: false }),
      tin_cuoi: tinCuoi.slice(0, 90),
      so_luot: soLuot,
      dang_chay,
    });
  }

  return ra.sort((a, b) => b.moc - a.moc);
}

export interface TinLichSu {
  ai: 'toi' | 'ho';
  chu: string;
  /** Chuỗi HIỂN THỊ "22:11". ⛔ Đừng dùng để tính toán — xem `luc`. */
  gio: string;
  /**
   * 🕐 MỐC THẬT (epoch ms) — thêm 19/08/2026 (việc ②A).
   *
   * Vì sao cần: `gio` là CHUỖI "22:11", ⛔ không phải mốc. Muốn biết bong bóng thuộc
   * NGÀY nào thì so chuỗi ⛔ không ra — và ca 23:59 → 00:01 thì HỎNG chắc chắn.
   *
   * ⚠️ TUỲ CHỌN, và phải giữ tuỳ chọn: đo tệp phiên thật (1.364 dòng) có **157 dòng
   *    ⛔ KHÔNG có `timestamp`** (11,5%). Ép kiểu bắt buộc là hoặc ném lỗi, hoặc phải
   *    BỊA một mốc — bịa thì dữ liệu sai mà số đo vẫn đẹp.
   * 📌 `gio` GIỮ NGUYÊN, ⛔ không bỏ: bong bóng cũ trong bộ nhớ ⛔ không vỡ, và giao diện
   *    ⛔ chưa đổi một ly nào ở bước này.
   */
  luc?: number;
}

/**
 * Mốc ISO → epoch ms. Trả `undefined` cho MỌI ca ⛔ không chắc chắn.
 * ⛔ ĐỪNG trả `Date.now()` khi thiếu `ts` — đó là BỊA, và nó làm hỏng chính phép
 * đối chứng dương của việc này («tin ⛔ không có luc phải > 0»).
 */
function mocMs(ts?: string): number | undefined {
  if (!ts) return undefined;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? undefined : t;
}

/** Đọc LỊCH SỬ THẬT của một phiên — ⛔ không phải hội thoại mẫu. */
/**
 * 🚦 TRẦN BYTE MẶC ĐỊNH khi mở một phiên — **đo mà chọn, ⛔ đoán.**
 *
 * 🐛 Ca thật 30/08: bộ ghế «Quản Lý Trường» khai `thu_muc` là THƯ MỤC NHÀ ⇒ kho phiên của
 *    chúng là kho chung, trong đó có tệp **375 MB**. Cách cũ đọc TRỌN tệp:
 * ```
 *   đọc trọn 375 MB   0,68 giây  →  29.041 TIN đẩy về trình duyệt   ← chỗ Owner thấy «lắc»
 *   đọc đuôi 1,5 MB   0,01 giây  →     299 tin                       nhanh gấp 134 lần
 * ```
 * 📌 Nút thắt **⛔ phải thời gian máy chủ** (0,68 giây vẫn nhanh) mà là **SỐ TIN trình duyệt
 *    phải dựng**. Nên trần đặt theo BYTE ĐỌC VÀO, ⛔ theo số dòng — đo thật: một dòng của
 *    ghế `web-demo` nặng tới ~9,9 KB, cắt 200 dòng vẫn ra ~2 MB.
 * 📊 CHỌN MỨC BẰNG BẢNG ĐO, ⛔ bằng cảm giác — chạy trên đúng 6 ô Owner đang mở:
 * ```
 *   trần        tin (cả 6 ô)   byte gửi   thời gian     tin/ô ÍT NHẤT
 *   ⛔ trần        ~10.900       8,60 MB       —          (nết cũ, gây lắc)
 *   1,5 MB            685        0,54 MB     45 ms        50   ← quá mỏng
 *   3   MB          1.225        1,15 MB     72 ms        79   ← CHỌN CÁI NÀY
 *   5   MB          2.080        1,69 MB    124 ms       162
 * ```
 * ⇒ Lấy **3 MB**: vẫn nhẹ hơn nết cũ **9 lần về số tin** và **7,5 lần về byte**, mà mỗi ô còn
 *   ~79-283 tin — đủ để đọc lại mạch việc. 1,5 MB rẻ hơn nhưng ô mỏng nhất chỉ còn **50 tin**,
 *   mỏng quá thì Owner phải bấm «xem thêm» ngay, tức là ⛔ giải quyết được gì.
 * 📌 Đề bài ghi «~1,5 MB HOẶC ~200 tin». Đo ra: mức cho ~200 tin/ô là **3 MB**, ⛔ phải 1,5 MB.
 *   Hai con số trong đề bài ⛔ trỏ cùng một chỗ — tôi lấy theo SỐ TIN vì đó mới là thứ gây lắc.
 */
export const TRAN_BYTE_MAC_DINH = 3 * 1024 * 1024;

export type KetQuaLichSu = {
  tin: TinLichSu[];
  /** Còn phần cũ hơn chưa nạp ⛔ — để trình duyệt biết có nên hiện nút «xem thêm». */
  con_nua: boolean;
  /** Đã đọc bao nhiêu byte / tổng tệp bao nhiêu — để lần kéo sau xin nhiều hơn. */
  da_doc: number;
  tong_byte: number;
};

export async function lichSuPhien(
  maNhanSu: string,
  maPhien: string,
  tranByte: number = TRAN_BYTE_MAC_DINH,
): Promise<KetQuaLichSu> {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(maPhien)) throw new Error('Mã phiên không hợp lệ.');
  const p = path.join(khoPhienCua(maNhanSu), `${maPhien}.jsonl`);
  if (!fs.existsSync(p)) return { tin: [], con_nua: false, da_doc: 0, tong_byte: 0 };

  const tong = fs.statSync(p).size;
  const tran = Number.isFinite(tranByte) && tranByte > 0 ? tranByte : TRAN_BYTE_MAC_DINH;
  const conNua = tong > tran;

  const ra: TinLichSu[] = [];
  /**
   * Tệp NHỎ hơn trần ⇒ đọc dòng như cũ (rẻ, và giữ nguyên nết đã chạy 3 tuần).
   * Tệp LỚN hơn ⇒ dùng `docDuoi` — bộ đọc ĐUÔI đã có sẵn trong tệp này, nó tự bỏ
   * dòng đầu bị cắt dở. ⛔ viết bộ đọc thứ hai.
   */
  const nguon = conNua
    ? (async function* () { for (const d of docDuoi(p, tran).split('\n')) yield d; })()
    : readline.createInterface({
        input: fs.createReadStream(p, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });

  for await (const d of nguon) {
    const s = d.trim();
    if (!s.startsWith('{')) continue;
    let j: DongPhien;
    try {
      j = JSON.parse(s) as DongPhien;
    } catch {
      continue;
    }
    const chu = bocChu(j.message?.content).trim();
    if (!chu) continue;

    if (j.type === 'user' && j.userType === 'external') {
      ra.push({ ai: 'toi', chu, gio: gioNgan(j.timestamp), luc: mocMs(j.timestamp) });
    } else if (j.type === 'assistant') {
      ra.push({ ai: 'ho', chu, gio: gioNgan(j.timestamp), luc: mocMs(j.timestamp) });
    }
  }
  return { tin: ra, con_nua: conNua, da_doc: Math.min(tran, tong), tong_byte: tong };
}

function gioNgan(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Phiên này có THẬT trong kho của ĐÚNG nhân sự đó không.
 * Chốt chặn: trình duyệt ⛔ không trỏ được sang phiên của dự án khác trên máy.
 */
export function coPhien(maNhanSu: string, maPhien: string): boolean {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(maPhien)) return false;
  try {
    return fs.existsSync(path.join(khoPhienCua(maNhanSu), `${maPhien}.jsonl`));
  } catch {
    return false;
  }
}

/** Mốc sửa của tệp phiên, hoặc null nếu chưa có tệp. */
export function mocTepPhien(maNhanSu: string, maPhien: string): number | null {
  try {
    return fs.statSync(path.join(khoPhienCua(maNhanSu), `${maPhien}.jsonl`)).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Phiên này có đang được tiến trình KHÁC dùng không.
 *
 * 🪤 Chỉ nhìn mtime là SAI: sau khi CHÍNH TA chạy xong, tệp cũng vừa mới đổi
 *    ⇒ câu hỏi thứ hai của Owner sẽ bị chính ta chặn. Đã cắn thật lúc nghiệm thu.
 * ⇒ So thêm với `mocKetThucCuaTa` (mốc ghi lại ngay sau lượt của ta):
 *      · tệp cũ hơn 5 phút            → chắc chắn rảnh
 *      · tệp mới, nhưng ĐÚNG BẰNG mốc ta ghi → người sửa cuối là TA, đã xong → rảnh
 *      · tệp mới, và MỚI HƠN mốc của ta      → có kẻ khác đang ghi → CHẶN
 */
/**
 * Có tiến trình NÀO đang sống mà cầm đúng mã phiên này không.
 *
 * ⭐ Đây là BẰNG CHỨNG THẬT, khác hẳn phép suy từ mốc-sửa-tệp. Mốc tệp chỉ nói
 *    "vừa có ai đó ghi", ⛔ không nói ai — mà "ai" mới là thứ ta cần biết.
 * ⚠️ Đo được KHÔNG có ⇒ chắc chắn rảnh (⛔ không tiến trình nào giữ). Đo được CÓ
 *    ⇒ chắc chắn bận. Phiên mở KHÔNG kèm `--resume` thì mã ⛔ không nằm trong dòng
 *    lệnh — nên đây là bằng chứng MỘT CHIỀU: thấy là chắc, ⛔ không thấy chưa đủ kết luận.
 */
export function phienCoTienTrinhSong(maPhien: string): boolean {
  if (!maPhien) return false;
  try {
    const ra = execFileSync('ps', ['ax', '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return ra.includes(maPhien);
  } catch {
    return false; // ⛔ đo không được thì ⛔ đừng bịa "đang bận" — trả về để nhánh dưới quyết.
  }
}

export function dangChay(
  maNhanSu: string,
  maPhien: string,
  mocKetThucCuaTa: number | null,
): boolean {
  const mtime = mocTepPhien(maNhanSu, maPhien);
  if (mtime === null) return false;

  // ⛔ CHẶN CỨNG: sờ tận tay có tiến trình đang cầm phiên này ⇒ bận, khỏi bàn.
  if (phienCoTienTrinhSong(maPhien)) return true;

  if ((Date.now() - mtime) / 60000 >= NGUONG_SONG_PHUT) return false;

  /**
   * 🔴 Ca thật 14/08 — bộ canh này TỰ KHOÁ GHẾ CỦA CHÍNH NÓ.
   *
   * Đo tại chỗ: sổ ghi ta chạy xong lúc 13:39:05, nhưng tệp phiên còn bị ghi tới
   * 13:39:56 — **chậm 51 giây**, trong khi ngưỡng tha chỉ 1 giây. ⇒ Lượt sau của
   * Owner bị chặn bằng câu "đang chạy ở terminal khác", mà terminal đó ⛔ KHÔNG hề
   * tồn tại. Owner đứng trước máy quay, ghế câm.
   *
   * 🔴 LẦN THỨ HAI — 20/08, ca FORK. Cùng bộ canh này, cùng kiểu «chặn oan», khác đường vào:
   *    fork chép tệp gốc sang mã mới ⇒ tệp VỪA CÓ NỘI DUNG VỪA CÓ mtime MỚI TINH,
   *    mà `datO` đổi mã phiên nên `moc_ket_thuc` bị xoá về null (`kho-phien.ts:62` —
   *    cố ý, và ĐÚNG cho ca đổi ghế). ⇒ cửa 2 chặn vì mtime mới, cửa 3 chặn vì mốc null.
   *    Owner fork xong ⛔ gõ được câu nào trong 5 phút. Nguyên văn: «⛔ không vá tôi ⛔ resume được».
   *    ⇒ Đã vá tại `api/fork/route.ts` (khai mốc ngay sau `datO`), ⛔ KHÔNG nới ngưỡng ở đây.
   * 📌 Hai lần rồi. Lần thứ ba, ai đọc tới đây thì nhớ: bộ canh này chỉ có BẰNG CHỨNG
   *    GIÁN TIẾP (mtime + sổ). Thêm đường nào sinh ra tệp «vừa mới vừa có nội dung»
   *    là lại chặn oan — hãy hỏi «đường mới này có khai mốc ⛔ không?» TRƯỚC KHI ship.
   *
   * 📌 Vì sao chậm: ta lấy mốc ngay khi vòng đọc kết thúc, nhưng `claude` nhận
   *    SIGTERM ⛔ không chết ngay — nó còn xả nốt bản ghi (kể cả dòng
   *    «[Request interrupted by user]»). Lấy mốc lúc đó = **đo trước khi việc xong**.
   *
   * ⇒ Sổ đã ghi nhận TA sở hữu phiên này (`mocKetThucCuaTa !== null`) thì mốc-sửa-tệp
   *   ⛔ KHÔNG còn quyền chặn — chỉ bằng chứng tiến trình sống ở trên mới chặn được.
   *   Bỏ hẳn phép so mốc mong manh, ⛔ đừng nới ngưỡng rồi lại trúng ca chậm hơn.
   */
  if (mocKetThucCuaTa !== null) return false;

  // ⛔ Ta ⛔ không có sổ về phiên này (ô vừa được gán, hoặc sổ mất) ⇒ giữ nết thận trọng cũ.
  return true;
}
