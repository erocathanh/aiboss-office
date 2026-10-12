import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
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
  /** First valid recorded timestamp in the bounded prefix; may predate a fork. */
  started_at: number | null;
  /** Filesystem creation time, not necessarily the conversation start. */
  file_created_at: number | null;
  size_bytes: number;
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

// Read complete records only, with bounded memory even for very large transcripts.
// Missing, malformed or oversized prefixes remain unknown; never substitute birthtime.
function firstRecordedTimestamp(file: string, size: number): number | null {
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(size, 256 * 1024));
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const lines = buffer.subarray(0, count).toString('utf8').split('\n');
    if (count < size) lines.pop();
    for (const line of lines) {
      try {
        const value: unknown = JSON.parse(line)?.timestamp;
        if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) continue;
        const stamp = Date.parse(value);
        if (Number.isFinite(stamp)) return stamp;
      } catch { /* Skip records without a usable timestamp. */ }
    }
    return null;
  } finally { fs.closeSync(fd); }
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
      started_at: (() => { try { return firstRecordedTimestamp(p, st.size); } catch { return null; } })(),
      file_created_at: st.birthtimeMs > 0 ? st.birthtimeMs : null,
      size_bytes: st.size,
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
   * ⚠️ TUỲ CHỌN, và phải giữ tuỳ chọn. Ép kiểu bắt buộc là hoặc ném lỗi, hoặc phải
   *    BỊA một mốc — bịa thì dữ liệu sai mà số đo vẫn đẹp.
   *    📏 SỐ ĐO — chú ý ĐƠN VỊ, đây là chỗ cả đội đã đọc nhầm một lần (31/08):
   *       DÒNG thiếu `timestamp`   1.081/7.630 = 14,2%   ← 11,5% đo 19/08 ĐÃ TRÔI
   *       MẨU user/assistant thiếu     0/3.774 =  0,0%   ← thứ THỰC SỰ thành bong bóng
   *       14% kia là dòng `attachment` · `last-prompt` · `queue-operation` · `mode`.
   *    ⇒ Đọc «14%» thành «14% mẩu tin» là dựng một phép nghiệm thu ⛔ BAO GIỜ chạy được,
   *      vì ca đó ⛔ tồn tại trong dữ liệu thật. Muốn thử nhánh này thì phải DỰNG ca ra.
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
  /** ⚠️ FAIL 4: `0` là GIÁ TRỊ HỢP LỆ («đã ở đầu tệp»), ⛔ phải «⛔ truyền». */
  const met =
    Number.isFinite(truocByte) && (truocByte as number) >= 0
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
    /**
     * 🐛 FAIL 3 (Hermes lần 3): trả `batDau: met` là **KẸT VĨNH VIỄN** — con trỏ ⛔ tiến,
     *    bấm tiếp đọc lại ĐÚNG cửa sổ đó mãi mãi.
     * ✅ Con trỏ phải **TIẾN QUA** khúc ⛔ đọc nổi: trả `bd` (mép TRÁI cửa sổ).
     *    Mất khúc đó thì đành, nhưng phần CŨ HƠN vẫn tới được — và client được BÁO
     *    bằng cờ `cat_dong_qua_dai` để nói thật với Owner, ⛔ im lặng.
     * 📌 Cái phải chết là **KẸT IM LẶNG**, ⛔ phải nhánh nới.
     *    Nhánh nới ĐANG GÁNH VIỆC THẬT: quét ĐỦ 9.130 tệp ⇒ dòng dài nhất **5,99 MB**,
     *    2 dòng vượt trần cứng 4 MB (2db8f6a5 dòng 771-772), và 5 ghế khai
     *    thu_muc='/Users/erocathanh' đọc đúng kho đó. Xoá nhánh = mất hẳn 2 tin.
     *    ⚠️ Lần trước tôi định xoá nó vì quét 400/9.130 tệp = 4% rồi kết luận cho CẢ kho.
     */
    if (xd === -1) return { chu: '', batDau: bd };
    const giu = s.slice(xd + 1);
    // ⚠️ ĐẾM BYTE, ⛔ đếm ký tự — chữ Việt mỗi chữ nhiều byte, lệch là con trỏ trỏ sai chỗ.
    /**
     * 🐛 CHỖ THẬT SỰ GÂY KẸT — tôi tìm ra khi vá dòng Hermes chỉ mà nó VẪN kẹt.
     *    Hermes chỉ nhánh `xd === -1`. Nhưng cửa sổ cuối tệp **CÓ** một dấu xuống dòng:
     *    chính dấu kết tệp. ⇒ `xd !== -1`, rơi vào ĐÂY, `giu` rỗng, `batDau = met - 0 = met`
     *    ⇒ con trỏ ⛔ tiến ⇒ KẸT. **Vá đúng dòng được chỉ mà ⛔ kiểm dòng nào ĐANG CHẠY.**
     * ✅ `giu` rỗng nghĩa là cửa sổ ⛔ chứa nổi một dòng trọn vẹn ⇒ con trỏ phải TIẾN QUA.
     */
    if (!giu) return { chu: '', batDau: bd };
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
 * LỜI KHAI CŨ — đã bị bác vòng 4/4; giữ để tránh lặp, KHÔNG dùng làm mô tả hiện tại:
 * ⇒ So thêm với `mocKetThucCuaTa` (mốc ghi lại ngay sau lượt của ta):
 *      · tệp cũ hơn 5 phút                   → CỔNG NÀY mở (KHÔNG kết luận gì về «rảnh»)
 *      · tệp mới, nhưng ĐÚNG BẰNG mốc ta ghi → người sửa cuối là TA, đã xong → mở
 *      · tệp mới, và MỚI HƠN mốc của ta      → có kẻ khác vừa ghi → CHẶN
 * ĐÍNH CHÍNH: `dangChay` xét lần lượt: mtime null → MỞ; tuổi tệp đạt ngưỡng → MỞ;
 * `phienCoTienTrinhSong` trả true → CHẶN; còn lại mốc ta khác null → MỞ, null → CHẶN.
 * KHÔNG so độ mới của mốc ta với mtime. Mtime bằng mốc ta cũng KHÔNG chứng minh ai vừa ghi.
 */
/**
 * Có tiến trình nào đang sống mà KHAI Ý ĐỊNH nối đúng mã phiên này không.
 *
 * ⭐ Đây là bằng chứng khác hẳn phép suy từ mốc-sửa-tệp. Mốc tệp chỉ nói
 *    "vừa có ai đó ghi", KHÔNG nói ai — mà "ai" mới là thứ ta cần biết.
 *
 * 🔴 GIỚI HẠN CỦA THƯỚC — `ps` KHÔNG đủ dữ liệu để kết luận một phiên đang RẢNH.
 *    Nó trả lời được ĐÚNG MỘT câu, và câu đó chỉ có một chiều:
 *      TÌM THẤY một lời khai ý định                              ⇒ trả `true`
 *      KHÔNG tìm thấy — kể cả vì `ps` chạy hỏng, vì người giữ mở phiên
 *      KHÔNG kèm cờ, vì tiến trình chớp tắt giữa hai lần đo      ⇒ trả `false`
 * ⇒ `false` ở đây nghĩa là KHÔNG NHẬN DIỆN ĐƯỢC, KHÔNG phải "đã chứng minh là rảnh".
 * ⇒ Và KHÔNG nhận diện được thì quyền quyết KHÔNG nằm ở hàm này — nó rơi về `dangChay`.
 * 🔴 NHƯNG CÂU CŨ Ở ĐÂY SAI, người soi bác vòng 3 và bác đúng. Câu cũ:
 *      «tệp còn được ghi trong NGUONG_SONG_PHUT phút thì VẪN CHẶN, chẳng cần hàm này gật»
 *    Ba ca dưới đây KHÔNG phải toàn bộ nhánh của `dangChay`:
 *      tệp mới · ps KHÔNG nhận diện · `mocKetThucCuaTa` là null   ⇒ CHẶN     ✅ đúng như câu cũ
 *      đã bị bác vòng 4/4: «tệp mới · `mocKetThucCuaTa` CÓ, dù CŨ HƠN lần ghi mới nhất ⇒ **MỞ**»
 *      ĐÍNH CHÍNH: cần thêm `phienCoTienTrinhSong` trả false; nếu trả true thì VẪN CHẶN.
 *      `ps` NÉM LỖI · tệp mới · `mocKetThucCuaTa` CÓ              ⇒ **MỞ**   🔴 và ở đây
 * 🔑 Gốc: SAU cửa tuổi tệp và cửa `phienCoTienTrinhSong`, `dangChay` mới xét
 *    `mocKetThucCuaTa !== null` để trả false; KHÔNG so giá trị mốc ấy với lần ghi mới nhất.
 * ⚠️ Đó là ĐÁNH ĐỔI CÓ CHỦ Ý, chẳng phải quên — lý do gốc ghi ngay tại chỗ ấy: `claude` nhận
 *    SIGTERM rồi còn xả nốt bản ghi, nên phép so mốc từng chặn oan chính ghế mình (ca 14/08).
 *    Tôi KHÔNG tự lật đánh đổi đó ở vòng này — nó cần một quyết định, chẳng phải một bản vá.
 *    Ở đây tôi chỉ sửa LỜI KHAI cho khớp thứ mã thật sự làm.
 */
export function phienCoTienTrinhSong(maPhien: string): boolean {
  if (!maPhien) return false;
  try {
    const ra = execFileSync('ps', ['ax', '-o', 'command='], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    /**
     * 🅐 (Owner quyết round-16 lúc 09:18 · PM gật hướng lúc 10:42, 07/09/2026)
     *    THÔI HỎI «AI GIỮ». HỎI «CÓ AI KHAI Ý ĐỊNH NỐI ĐÚNG PHIÊN NÀY».
     *
     * 🕳 BA VÒNG TRƯỚC ĐỀU HỎI SAI CÂU, nên vòng nào cũng đẻ ra một danh sách DÀI HƠN:
     *   vòng 0  `ra.includes(maPhien)` — mã phiên nằm BẤT KỲ ĐÂU cũng chặn. Đo thật lúc
     *           09:2x trên máy này: 104 dòng `ps` chứa một mã phiên, phần lớn chỉ là
     *           ĐƯỜNG DẪN thư mục nháp (`tail -f …/<mã>/scratchpad/x.log`).
     *   vòng 1  thêm «mã đứng ở vị trí THAM SỐ» — hụt: mã nằm trong CÂU NHẮC
     *           (`claude -p "kiểm tra phiên <mã>"`) cũng đứng đúng vị trí đó.
     *   vòng 2  thêm «dòng phải có token tên `claude`» — CHÍNH ĐIỀU KIỆN ẤY LÀ DANH SÁCH.
     *           Người soi nêu ngay ba dạng người giữ THẬT mà nó bỏ sót:
     *               node cli.js --resume <mã>       (chạy qua trình thông dịch)
     *               claude-1.2.3 --resume <mã>      (nhị phân đặt tên theo phiên bản)
     *               /bin/zsh -c … --resume <mã> …   (vỏ bọc, tiến trình con)
     * 🔑 Hỏi «dòng lệnh này CÓ PHẢI claude KHÔNG» thì BẮT BUỘC phải kể tên mọi CÁCH KHỞI
     *    CHẠY — mà cách khởi chạy KHÔNG có biên, nên danh sách luôn thiếu. Cái CÓ biên là
     *    CỜ NỐI PHIÊN: nó là LỜI KHAI Ý ĐỊNH, và giống hệt nhau bất kể chạy bằng gì.
     *    ⇒ Vòng này XOÁ danh sách, KHÔNG nối dài nó.
     * Lời mô tả cũ, KHÔNG đầy đủ cho phép khớp hiện tại:
     * ⇒ Điều kiện DUY NHẤT: mã phiên đi ngay sau một cờ nối phiên (hoặc dính bằng dấu `=`).
     * Hiện tại còn nhận `-r<mã>` dính liền; đây là phép khớp token, KHÔNG phải bộ phân tích CLI.
     *    Ba dạng trên đều mang cờ đó ⇒ cả ba tự khớp mà KHÔNG phải kể tên chúng.
     *
     * 📏 Bộ cờ lấy từ ĐO, KHÔNG lấy từ trí nhớ — `claude --help` trên máy này 07/09/2026:
     *      d203  `-r, --resume [value]`        d217  `--session-id <uuid>`
     *    Đây là TỪ VỰNG CỜ của một chương trình (có biên, tra lại được bằng một lệnh),
     *    khác hẳn danh sách CÁCH KHỞI CHẠY (KHÔNG có biên) mà ba vòng trước đã sa vào.
     *
     * ⚠️ CÁC CA BẮT OAN CÒN LẠI — vòng 3 tôi khai «HAI ca», người soi đo thêm và ra NHIỀU HƠN.
     *    Khai ĐIỀU KIỆN, KHÔNG khai mức độ:
     *    ① câu nhắc chứa nguyên văn chuỗi cờ + mã (`claude -p "… --resume <mã> …"`)
     *    ② chương trình KHÁC dùng cờ ngắn `-r` với đối số đúng bằng mã (`grep -r <mã> …`)
     *    ③ chương trình KHÁC dùng `--resume <mã>` hoặc `--session-id <mã>` — cờ dài KHÔNG
     *       phải của riêng `claude`
     *    ④ `claude -- --resume <mã>` — sau `--` thì đó là ĐỐI SỐ, chẳng phải cờ
     *    ⑤ 🔑 CA ĐÁNG NHỚ NHẤT: `claude --resume <mã> --fork-session`. `claude --help` d98-100
     *       nói fork TẠO MÃ MỚI ⇒ **mang cờ nối phiên KHÔNG đồng nghĩa có ý định ghi lại bản
     *       gốc.** Chính fixture của bộ thử vòng 3 cũng chứa `--fork-session` — tôi đã nhìn nó
     *       mỗi lần chạy mà KHÔNG thấy.
     *    TẦN SUẤT ngoài đời của tất cả: CHƯA ĐO. Tôi chưa đếm ca thật lần nào, và người soi
     *    cũng ghi CHƯA ĐO — đừng ai đọc danh sách dài hơn này thành «hiếm» hay «hay gặp».
     *
     * 📏 VÀ MỘT DẠNG NGƯỜI SOI NÊU MÀ TÔI ĐO LẠI TRÊN `claude` THẬT, chẳng tin `ps` giả:
     *      `claude -r<mã>` DÍNH LIỀN      ⇒ claude THẬT NHẬN (báo đúng «No conversation found
     *                                       with session ID: <mã>») ⇒ đây là dạng THẬT, và
     *                                       phép khớp hiện tại BỎ SÓT nó
     *      Đính chính thời điểm: câu «BỎ SÓT» trên mô tả bản trước vòng 4; mã dưới đã nhận `-r<mã>`.
     *      `claude --resume=<mã>`         ⇒ cũng nhận
     *      `claude --continue`            ⇒ 🔴 KHÁC HẲN: `-c, --continue` KHÔNG nhận mã phiên
     *                                       nào (help d63: «Continue the most recent
     *                                       conversation in the current directory»).
     *                                       ⇒ KHÔNG một phép khớp theo MÃ nào có thể thấy nó,
     *                                         và thêm `--continue` vào bộ cờ chỉ đẻ ra bắt oan
     *                                         hàng loạt. Đây là GIỚI HẠN, chẳng phải lỗ để vá.
     * LỜI KHAI CŨ — đã bị bác vòng 4/4; KHÔNG còn là lời bảo đảm:
     * 🔑 Vì sao nghiêng về phía CHẶN: bắt oan CÓ HẠN — 🅑 dưới đây cho nó hết hạn sau
     *    NGUONG_SONG_PHUT phút. Còn BỎ SÓT thì KHÔNG có hạn: hai tiến trình cùng ghi một
     *    bản ghi phiên là hỏng bản ghi, và hỏng rồi thì KHÔNG tự lành.
     * ĐÍNH CHÍNH: 🅑 trả false khi `(Date.now() - mtime) / 60000 >= NGUONG_SONG_PHUT`.
     * KHÔNG lưu lúc bắt đầu chặn, nên KHÔNG có hạn tối đa tính từ lần chặn đầu.
     * Mtime làm mới mỗi 4 phút có thể giữ CHẶN ở phút 0·4·8·12; mtime tương lai 1 giờ
     * vẫn có thể giữ CHẶN sau 10 phút dù KHÔNG ai ghi. Cả hai ca cần cửa còn lại trả CHẶN.
     */
    const CO_NOI_PHIEN = ['--resume', '-r', '--session-id'];
    /**
     * Dòng lệnh này có KHAI ý định nối đúng mã phiên đang hỏi không.
     *
     * BA hình dạng, và cả ba đều ĐO ĐƯỢC trên `claude` THẬT (08/09/2026), chẳng lấy từ `ps` giả:
     *   `-r <mã>` rời      · `--resume=<mã>` dính bằng dấu bằng · `-r<mã>` DÍNH LIỀN
     * 🔴 Hình thứ ba là chỗ vòng 3 BỎ SÓT. Người soi nêu nó từ một `ps` GIẢ và tự khai CHƯA
     *    kiểm trên `claude` thật; tôi kiểm lại trước khi vá, và nó THẬT:
     *      `claude -r00000000-…-000000000000 -p x`
     *        ⇒ claude trả «No conversation found with session ID: 00000000-…» ⇒ nó ĐÃ PHÂN TÍCH
     *          mã ấy ra khỏi cờ ⇒ đây là một người giữ THẬT mà phép khớp cũ KHÔNG thấy.
     * ⚠️ CHỈ áp dạng dính liền cho CỜ NGẮN. `--resume<mã>` KHÔNG phải cú pháp hợp lệ, thêm nó
     *    vào chỉ mở thêm đường bắt oan mà chẳng bắt thêm người giữ nào.
     * GIỚI HẠN CHƯA VÁ (Owner chọn Ⓒ): phép khớp bỏ sót `-pr<mã>` và `-pr <mã>`,
     * nhưng nhận `-r=<mã>`. Người soi đã đo CLI 2.1.263 nhận hai dạng đầu, từ chối dạng cuối;
     * đây là số đo được dẫn lại, KHÔNG phải lần chạy CLI trong lượt sửa chú thích này.
     * KHÔNG coi các hình dạng nêu trên là danh sách đầy đủ cú pháp CLI hoặc người giữ thật.
     */
    const khaiYDinhNoiPhien = (tokens: string[]): boolean =>
      tokens.some((t, k) =>
        (CO_NOI_PHIEN.includes(t) && tokens[k + 1] === maPhien) ||
        CO_NOI_PHIEN.some((c) => t === `${c}=${maPhien}`
          || (c.length === 2 && c.startsWith('-') && t === `${c}${maPhien}`)));
    return ra.split('\n').some((dong) => khaiYDinhNoiPhien(dong.trim().split(/\s+/)));
  } catch {
    /* `ps` chạy KHÔNG được ⇒ KHÔNG nhận diện được ⇒ trả `false`, KHÔNG bịa "đang bận".
       `false` ở đây KHÔNG có nghĩa "rảnh" — nó nhường quyền quyết cho luật MỐC TỆP
       trong `dangChay`, đúng như phần GIỚI HẠN CỦA THƯỚC đã khai ở đầu hàm. */
    return false;
  }
}

export function dangChay(
  maNhanSu: string,
  maPhien: string,
  mocKetThucCuaTa: number | null,
): boolean {
  const mtime = mocTepPhien(maNhanSu, maPhien);
  if (mtime === null) return false;

  /**
   * 🅑 (Owner quyết round-16, 09:18 07/09/2026) — ĐỔI THỨ TỰ: ngưỡng 5 phút xét TRƯỚC.
   *
   * 🕳 Bản cũ đặt phép sờ-tiến-trình LÊN TRƯỚC và trả `true` NGAY, nên nhánh ấy KHÔNG có hạn.
   *    Người soi giả lập đồng hồ: tuổi tệp 1 phút · 1 tiếng · 1 ngày · 1 NĂM đều «đang chạy»,
   *    chừng nào còn một dòng lệnh chứa mã phiên. Đó là chặn VĨNH VIỄN — đúng thứ Owner chụp:
   *    «phiên thì im mà báo lỗi».
   * ⇒ Nay tuổi tệp `(Date.now() - mtime) / 60000` đạt ngưỡng thì trả `false` TRƯỚC khi xét ps.
   *
   * ⚠️ CÁI GIÁ, khai ĐÚNG mức đo được:
   *      ĐIỀU KIỆN mở nhầm: phiên ĐANG chạy thật + tuổi tệp đạt ngưỡng ⇒ cổng mtime mở
   *      HẬU QUẢ: hai bên cùng ghi một bản ghi phiên ⇒ hỏng bản ghi
   *      TẦN SUẤT ngoài đời: CHƯA ĐO — tôi chỉ chạy dữ liệu dựng sẵn, chẳng đếm ca thật.
   *    🔴 Vòng 1 tôi viết «diện hẹp» và «🅐 mua lại một phần». Người soi bác: cả hai là câu
   *       RỘNG HƠN thứ tôi đo. Bỏ. Chưa biết tần suất thì nói CHƯA BIẾT, đừng nói HẸP.
   * KHỐI LỜI KHAI CŨ DƯỚI ĐÂY: giữ làm lịch sử, KHÔNG dùng làm bảo đảm hoặc hướng dẫn lùi.
   * đã bị bác vòng 4/4: «🅐 VÀ 🅑 CHE ĐÚNG ĐIỂM YẾU CỦA NHAU — lùi MỘT vế mà giữ vế kia là hỏng cả hai».
   *      đã bị bác vòng 4/4: «🅐 làm ca bắt oan còn ÍT ĐƯỜNG VÀO hơn, nhưng CÒN hai điều kiện chưa bịt»
   *         (khai đủ ở `phienCoTienTrinhSong` phía trên)
   *      🅑 làm ca bắt oan hết hạn sau NGUONG_SONG_PHUT phút **KHI VÀ CHỈ KHI mốc tệp đứng yên**
   *         🔴 CÂU CŨ («làm MỌI ca bắt oan HẾT HẠN») SAI — người soi chạy và bác:
   *              mtime đứng yên, đồng hồ chạy   ⇒ 299.999ms còn chặn · 300.000ms mở   ✅ đúng
   *              một tác nhân KHÔNG giữ phiên làm mới mtime mỗi 4 phút
   *                                             ⇒ phút 0·4·8·12 VẪN CHẶN               🔴
   *              mtime nằm ở TƯƠNG LAI 1 giờ    ⇒ sau 10 phút giả lập VẪN CHẶN         🔴
   *         🔑 Gốc: mã KHÔNG lưu thời điểm BẮT ĐẦU bắt oan, nên chẳng có hạn tối đa tính từ
   *            lần chặn ĐẦU. Nó chỉ đo khoảng cách giữa `Date.now()` và mtime HIỆN TẠI —
   *            mà mtime thì người khác chạm được.
   *         ⇒ Câu hẹp ở `api/chat/route.ts` («riêng cổng mốc-tệp hết hạn sau N phút im») ĐÚNG
   *            cho ca mtime bình thường, và **KHÔNG được dùng để bảo lãnh cho lời hứa «MỌI ca»**.
   *    đã bị bác vòng 4/4: «lùi 🅐 : hai điều kiện oan kia mở lại thành nhiều đường vào hơn»
   *    ⇒ lùi 🅑 : ca oan còn sót của 🅐 quay về thành chặn VĨNH VIỄN — đúng thứ Owner chụp
   *    (mã thì vẫn lùi riêng từng cái được; đây là cảnh báo về HẬU QUẢ, KHÔNG phải cú pháp)
   * HẾT KHỐI CŨ. ĐÍNH CHÍNH: 🅐 khớp token trong đầu ra ps; 🅑 xét tuổi tệp trước 🅐.
   * Tuổi tệp đạt ngưỡng thì MỞ mà KHÔNG gọi 🅐; mtime liên tục làm mới hoặc ở tương lai
   * có thể giữ tuổi dưới ngưỡng. KHÔNG có bảo đảm hai vế bù điểm yếu hoặc giới hạn thời gian chặn.
   * Các ca oan liệt kê phía trên gồm câu nhắc, cờ của chương trình khác, đối số sau `--`,
   * `--fork-session` và `-r=<mã>`; KHÔNG phải chỉ «hai điều kiện», cũng KHÔNG khai là đã vét hết.
   * KHÔNG suy hậu quả của mọi cách lùi từ số ca này; lượt sửa chữ KHÔNG thử lùi 🅐 hay 🅑.
   */
  if ((Date.now() - mtime) / 60000 >= NGUONG_SONG_PHUT) return false;

  // Tệp CÒN TƯƠI (đã qua cửa trên) và có một lời khai ý định nối đúng phiên này ⇒ CHẶN.
  // Trả `false` ở hàm dưới KHÔNG có nghĩa "rảnh" — xem GIỚI HẠN CỦA THƯỚC tại hàm đó.
  if (phienCoTienTrinhSong(maPhien)) return true;

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
