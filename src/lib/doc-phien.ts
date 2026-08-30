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
    if (bd <= 0) return s; // đọc từ đầu tệp ⇒ ⛔ có dòng nào bị cắt dở

    /**
     * 🐛 BA CA `s.indexOf('\n') + 1` LÀM SAI, Hermes bắt 30/08:
     *  ① đuôi ⛔ CÓ xuống dòng nào  ⇒ indexOf = -1 ⇒ +1 = 0 ⇒ slice(0) giữ NGUYÊN
     *     dòng cắt dở ⇒ JSON.parse ném lỗi ⇒ bị `catch { continue }` NUỐT IM LẶNG.
     *  ② điểm cắt rơi ĐÚNG đầu một dòng nguyên vẹn ⇒ cắt đi là BỎ OAN cả dòng đó.
     *  ③ ⇒ phải hỏi byte NGAY TRƯỚC điểm cắt: là `\n` thì chỗ cắt đã sạch, giữ nguyên.
     */
    let batDauSach = false;
    {
      const truoc = Buffer.alloc(1);
      const n = fs.readSync(fd, truoc, 0, 1, bd - 1);
      batDauSach = n === 1 && truoc[0] === 0x0a; // 0x0a = '\n'
    }
    if (batDauSach) return s;

    const xd = s.indexOf('\n');
    // ⛔ có xuống dòng nào ⇒ CẢ khúc này là một dòng bị cắt dở ⇒ ⛔ dùng được gì.
    return xd === -1 ? '' : s.slice(xd + 1);
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
 * 🚦 TRẦN CỨNG MỖI LẦN GỌI — ⛔ BAO GIỜ vượt, kể cả người gọi xin nhiều hơn.
 *
 * 🐛 BẢN TRƯỚC SAI TỪ GỐC (Hermes bác 30/08 lần 2): tôi bỏ trần rồi cho vòng TỰ NỚI
 *    3→6→12→24→48→96 MB **ngay trong MỘT lần gọi**, xong `readFileSync` đọc TRỌN tệp.
 *    Tôi biện hộ «mỗi bước nới là một cú bấm tay» — **SAI**, vòng đó tự chạy, ⛔ ai bấm.
 *    ⇒ Một lần gọi có thể nuốt trọn tệp 375 MB vào bộ nhớ.
 *
 * ✅ CÁCH ĐÚNG: **trần CỨNG cho mỗi lần gọi + CON TRỎ để đi ngược về trước.**
 *    Đi xa hơn ⇒ GỌI NHIỀU LẦN, mỗi lần vẫn chỉ đọc ≤ trần. ⛔ phải nới cửa sổ của một lần.
 *    Khác biệt cốt lõi: trần cũ hạn chế **cửa sổ**; trần mới hạn chế **bộ nhớ mỗi lần gọi**.
 */
export const TRAN_CUNG = 4 * 1024 * 1024;

/**
 * 🪟 Trần NỚI — dùng DUY NHẤT khi cửa sổ ⛔ chứa nổi một DÒNG TRỌN VẸN nào.
 * Ca thật: một dòng có thể dài hơn cả trần (đo được dòng 9,9 KB, cá biệt tới hàng trăm KB).
 * Lúc đó trả rỗng là **nói dối** — giao diện sẽ gọi phiên CÓ nội dung là «Phiên trống».
 * ⇒ Cho nới, nhưng **CÓ ĐÁY CỨNG**: tối đa 16 MB rồi thôi, và báo ra bằng `cat_dong_qua_dai`.
 * ⇒ Bộ nhớ tệ nhất mỗi lần gọi: 16 MB, ⛔ phải 375 MB.
 */
export const TRAN_TOI_DA = 16 * 1024 * 1024;

export type KetQuaLichSu = {
  tin: TinLichSu[];
  /** Còn phần cũ hơn ⛔ — tức con trỏ chưa về tới đầu tệp. */
  con_nua: boolean;
  /** CON TRỎ: trang này bắt đầu ở byte nào. Lần sau xin trang cũ hơn thì gửi đúng số này. */
  vi_tri: number;
  tong_byte: number;
  /** Cửa sổ đụng phải một dòng dài hơn trần — đã nới tới đáy cứng mà vẫn hụt. */
  cat_dong_qua_dai: boolean;
};

export async function lichSuPhien(
  maNhanSu: string,
  maPhien: string,
  truocByte?: number,
): Promise<KetQuaLichSu> {
  if (!/^[0-9a-fA-F-]{8,64}$/.test(maPhien)) throw new Error('Mã phiên không hợp lệ.');
  const p = path.join(khoPhienCua(maNhanSu), `${maPhien}.jsonl`);
  if (!fs.existsSync(p))
    return { tin: [], con_nua: false, vi_tri: 0, tong_byte: 0, cat_dong_qua_dai: false };

  const tong = fs.statSync(p).size;
  /** Mép PHẢI của cửa sổ. ⛔ truyền gì ⇒ lấy cuối tệp (mở phiên = xem phần mới nhất). */
  const met =
    Number.isFinite(truocByte) && (truocByte as number) > 0
      ? Math.min(truocByte as number, tong)
      : tong;

  let rong = Math.min(TRAN_CUNG, met);
  let cua = met > 0 ? docCuaSo(p, met - rong, met) : { chu: '', batDau: 0 };
  let catDai = false;

  // Cửa sổ ⛔ có dòng trọn vẹn ⇒ nới, nhưng CHẶN Ở ĐÁY CỨNG.
  while (!cua.chu.includes('\n') && rong < Math.min(TRAN_TOI_DA, met)) {
    rong = Math.min(rong * 2, TRAN_TOI_DA, met);
    cua = docCuaSo(p, met - rong, met);
  }
  if (met > 0 && !cua.chu.includes('\n')) catDai = true;

  const tho = cua.chu;
  /**
   * 🐛 MẤT ĐÚNG MỘT TIN — tôi tự bắt được bằng cách đối chiếu bản CON TRỎ với bản ĐỌC TRỌN
   *    (4.183 so với 4.184). Gốc: con trỏ trỏ vào **GIỮA MỘT DÒNG**.
   *    Dòng vắt ngang mép trang thì **CẢ HAI trang cùng bỏ nó**:
   *      trang mới bỏ vì đầu dòng bị cắt · trang cũ bỏ vì ĐUÔI dòng bị cắt (JSON.parse ném lỗi)
   *    ⇒ tin đó rơi vào khe giữa hai trang, ⛔ ai báo.
   * ✅ Chữa: con trỏ phải là **ĐẦU MỘT DÒNG**, ⛔ phải mép byte thô. `docCuaSo` trả về
   *    `batDau` = chỗ phần GIỮ LẠI thật sự bắt đầu; lấy đúng số đó làm con trỏ thì trang
   *    kế tiếp kết thúc ĐÚNG ở ranh dòng, ⛔ còn dòng nào bị cắt đuôi.
   */
  const viTri = met > 0 ? cua.batDau : 0;
  const ra: TinLichSu[] = [];
  for (const d of tho.split('\n')) {
    const st = d.trim();
    if (!st.startsWith('{')) continue;
    let j: DongPhien;
    try {
      j = JSON.parse(st) as DongPhien;
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
  return { tin: ra, con_nua: viTri > 0, vi_tri: viTri, tong_byte: tong, cat_dong_qua_dai: catDai };
}

/**
 * Đọc khúc [bd, met) của tệp. `boDongDau` = chỗ bắt đầu có thể rơi giữa một dòng.
 * ⚠️ Ba ca đã cắn (Hermes 30/08): ⛔ có `\n` ⇒ `indexOf` trả -1 ⇒ `+1` thành 0 ⇒ GIỮ NGUYÊN
 *    dòng cắt dở · và nếu chỗ cắt rơi ĐÚNG đầu một dòng nguyên vẹn thì cắt là BỎ OAN.
 *    ⇒ Hỏi byte NGAY TRƯỚC: là `\n` thì chỗ cắt đã sạch.
 */
function docCuaSo(p: string, bd: number, met: number): { chu: string; batDau: number } {
  const fd = fs.openSync(p, 'r');
  try {
    const dem = Buffer.alloc(Math.max(0, met - bd));
    if (dem.length) fs.readSync(fd, dem, 0, dem.length, bd);
    const s = dem.toString('utf8');
    if (bd <= 0) return { chu: s, batDau: 0 };

    const truoc = Buffer.alloc(1);
    const n = fs.readSync(fd, truoc, 0, 1, bd - 1);
    if (n === 1 && truoc[0] === 0x0a) return { chu: s, batDau: bd }; // chỗ cắt đã sạch

    const xd = s.indexOf('\n');
    if (xd === -1) return { chu: '', batDau: met }; // cả khúc là một dòng cắt dở
    const giu = s.slice(xd + 1);
    // ⚠️ ĐẾM BYTE, ⛔ đếm ký tự — chữ Việt mỗi chữ nhiều byte, lệch là con trỏ trỏ sai chỗ.
    return { chu: giu, batDau: met - Buffer.byteLength(giu, 'utf8') };
  } finally {
    fs.closeSync(fd);
  }
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
