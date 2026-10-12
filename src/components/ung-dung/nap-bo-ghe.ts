/**
 * 🎛 KẾT QUẢ CỦA MỘT LẦN NẠP BỘ GHẾ — và câu nhắc kể lại nó.
 *
 * 🕳 CA SINH RA TỆP NÀY (người soi bắt, 05/09/2026): `napBoGhe` `await` bốn hàm mạng
 *    (`ghiO` · `datNguoi` · `napLichSu` · `dongO`) rồi VỨT kết quả, và cuối vòng lặp luôn nói
 *    «Đã nạp xong bộ ghế.» — kể cả khi mọi lời gọi mạng đều hỏng.
 * 🔑 `await` chỉ hứa «tôi đã CHỜ XONG». Nó KHÔNG hứa «việc đã LÀM ĐƯỢC».
 *    Hai nghĩa đó khác nhau đúng bằng khoảng cách giữa một câu báo thật và một câu báo dối.
 * 📌 Và câu báo dối này thuộc loại tệ nhất: nó nói ĐÚNG THỨ người bấm muốn nghe, nên
 *    KHÔNG ai kiểm lại. Owner đóng máy, tưởng đội đã xếp xong.
 *
 * ⚖️ Vì sao TÁCH RA ĐÂY thay vì sửa tại chỗ trong `UngDung.tsx`: để thử được bằng MẠNG GIẢ.
 *    Muốn thử «ghi sổ hỏng thì câu nhắc nói gì» mà phải nạp ghế THẬT thì phép thử đó vừa chậm,
 *    vừa đụng sổ ô thật, vừa KHÔNG dựng lại được ca hỏng theo ý muốn.
 */

/** Ô bị BỎ QUA — có lý do chính đáng, KHÔNG phải hỏng. */
export type LyDoBoQua = 'dang-chay' | 'thieu-ghe' | 'trung-o' | 'o-mot' | 'loi-thoi';
/** Ô HỎNG THẬT — người bấm phải biết, vì thứ họ vừa yêu cầu đã KHÔNG xảy ra. */
export type LyDoHong = 'ghi-so' | 'doc-lich-su' | 'doc-ds-phien' | 'ghim-mat';

/**
 * 🔑 KẾT QUẢ CỦA MỘT LẦN `datNguoi` — và đây là chỗ đổi CÁCH NGHĨ, khôngphải đổi thêm một nhánh.
 *
 * 🕳 Ba vòng liền cùng một chỗ bị bác, vì mỗi vòng tôi vá THEO LỐI: thấy lối nào hụt thì vá lối đó.
 *    `datNguoi` có NĂM lối ra. Vá bốn thì vẫn còn một, và cái còn lại luôn là cái khôngai kể tên.
 * ⇒ Nay đảo chiều mặc định: hàm khai kiểu trả về là `KetQuaDatNguoi`, nên **mọi lối ra buộc phải
 *   TRẢ VỀ MỘT GIÁ TRỊ** — rơi khỏi cuối hàm là lỗi biên dịch, khôngphải là «ngầm hiểu thành công».
 * 📌 «Thành công» nay là thứ phải VIẾT RA `{ xong: true }`. Quên viết thì dựng KHÔNG QUA.
 *    Trước đây quên thì nó im lặng thành công — im lặng theo hướng dối người dùng.
 */
export type KetQuaDatNguoi =
  | { xong: true }
  | { xong: false; hong: LyDoHong }
  | { xong: false; boQua: LyDoBoQua };

export type KetQuaNapBoGhe = {
  boQua: { o: number; vi_sao: LyDoBoQua }[];
  hong: { o: number; vi_sao: LyDoHong }[];
  /** ô bị bỏ vì có lượt MỚI HƠN đè lên — KHÔNG phải hỏng, nhưng phải nói ra. */
  loiThoi: number[];
  daDat: number;
};

/**
 * 💬 CÂU BÁO CHO CHÍNH Ô ĐÓ — khôngphải câu tổng ở giữa màn.
 *
 * 🔑 Vì sao phải có bảng này, và vì sao nó `Record<LyDoHong, ...>`: thêm một lý do hỏng mà quên
 *    viết câu cho nó thì **tsc chặn**. Người dùng khôngbao giờ gặp một ô hỏng mà im lặng chỉ vì
 *    người viết mã quên một nhánh.
 */
export const CAU_LOI_O: Record<LyDoHong, string> = {
  'ghi-so': '🔴 KHÔNG ghi được vào sổ ô — tải lại trang là mất lựa chọn này. '
    + 'Kiểm mạng rồi chọn lại.',
  'doc-lich-su': '⚠️ Đã đổi ghế cho ô này, nhưng KHÔNG đọc được lịch sử. '
    + 'Bấm «Nạp lại» khi mạng ổn.',
  'doc-ds-phien': '⚠️ Đã chuyển ô sang ghế này, nhưng KHÔNG đọc được danh sách phiên '
    + '(mạng hoặc máy chủ). Lịch sử CHƯA nạp — bấm «Nạp lại» khi mạng ổn, hoặc chọn phiên bằng tay.',
  'ghim-mat': '🔴 Ghế này khai MỘT PHIÊN GHIM, mà phiên đó KHÔNG có trong kho của ghế. '
    + 'KHÔNG tự chọn phiên khác — chọn bừa là nối vào việc của ghế khác. '
    + 'Kiểm `phien_ghim` trong du-lieu/nhan-su.json.',
};

/** sổ kết quả cho ĐÚNG MỘT ô — để chỗ gọi lẻ dùng chung `cauNhacNapBoGhe`, khôngtự chế câu khác */
export function soMotO(o: number, r: KetQuaDatNguoi): KetQuaNapBoGhe {
  const kq = ketQuaTrong();
  ghiVaoSo(kq, o, r);
  return kq;
}

export const ketQuaTrong = (): KetQuaNapBoGhe => ({ boQua: [], hong: [], loiThoi: [], daDat: 0 });

const ds = (a: number[]) => a.slice().sort((x, y) => x - y).join(', ');

/**
 * 📥 MỘT CỬA DUY NHẤT đưa kết quả một ô vào sổ.
 * 🔑 Đây là «một chốt ở cuối» thay cho «vá từng nhánh»: lối ra MỚI của `datNguoi` sau này cũng
 *    phải đi qua đây, nên nó khôngthể lọt vào sổ dưới dạng «khôngghi gì cả».
 * ⚠️ `loi-thoi` cố ý KHÔNG nằm ở `boQua`: nó khôngphải lỗi và cũng khôngphải chuyện người bấm
 *    làm sai — nó là «có lượt mới hơn đè lên». Gộp nó vào `boQua` là bắt Owner đọc một cảnh
 *    báo về việc chính Owner vừa làm.
 */
export function ghiVaoSo(kq: KetQuaNapBoGhe, o: number, r: KetQuaDatNguoi): void {
  if (r.xong) { kq.daDat += 1; return; }
  if ('hong' in r) { kq.hong.push({ o, vi_sao: r.hong }); return; }
  if (r.boQua === 'loi-thoi') { kq.loiThoi.push(o); return; }
  kq.boQua.push({ o, vi_sao: r.boQua });
}

/**
 * 🗣 Kể lại kết quả. Luật DUY NHẤT phải giữ bằng mọi giá:
 *    **có bất kỳ ô nào HỎNG thì câu nhắc KHÔNG được chứa chữ «xong».**
 *    Bộ đo `thu-nhac-bo-ghe.test.mts` canh đúng câu đó trên MỌI tổ hợp.
 */
/**
 * 🗣 Kể lại kết quả. Luật DUY NHẤT phải giữ bằng mọi giá:
 *    **có bất kỳ ô nào HỎNG thì câu nhắc KHÔNG được chứa chữ «xong».**
 *
 * 🔑 Hai bảng dưới đây khai bằng `Record<...>`, cố ý: thêm một lý do vào `LyDoHong`/`LyDoBoQua`
 *    mà quên viết câu chữ cho nó thì **tsc chặn ngay**, khôngphải chờ người soi phát hiện ra
 *    một ô hỏng bị kể thành ô trống. Sổ bẫy: khai bằng KIỂU, đừng khai bằng chú thích.
 */
const LOI_HONG: Record<LyDoHong, string> = {
  'ghi-so': 'KHÔNG ghi được vào sổ ô',
  'doc-lich-su': 'nạp được ghế nhưng KHÔNG đọc được lịch sử',
  'doc-ds-phien': 'KHÔNG đọc được danh sách phiên (ghế đã đổi nhưng lịch sử chưa nạp)',
  'ghim-mat': 'phiên ghim KHÔNG có trong kho của ghế — KHÔNG tự chọn phiên khác',
};
const LOI_BO_QUA: Record<Exclude<LyDoBoQua, 'loi-thoi'>, string> = {
  'dang-chay': 'đang chạy — chưa đổi. Xong việc rồi bấm lại',
  'thieu-ghe': 'không tìm thấy ghế trong danh bạ',
  'trung-o': 'ghế này đã mở ở ô khác — đã chuyển tiêu điểm sang đó',
  'o-mot': 'là ô ông trùm, không đổi được',
};

export function cauNhacNapBoGhe(kq: KetQuaNapBoGhe): string {
  const gom = <T extends string>(ds_: { o: number; vi_sao: T }[]) => {
    const m = new Map<T, number[]>();
    for (const x of ds_) m.set(x.vi_sao, [...(m.get(x.vi_sao) ?? []), x.o]);
    return m;
  };
  const ve = [...gom(kq.hong)].map(([ly, os]) => `Ô ${ds(os)} ${LOI_HONG[ly]}`);
  if (ve.length) {
    // 🔴 Có hỏng ⇒ mở đầu bằng cảnh báo, và tuyệt đối KHÔNG nói «xong».
    const them = [...gom(kq.boQua)]
      .map(([ly, os]) => `ô ${ds(os)} ${LOI_BO_QUA[ly as Exclude<LyDoBoQua, 'loi-thoi'>]}`);
    return `🔴 ${ve.join('; ')}. Kiểm mạng rồi bấm lại.${them.length ? ` (Ngoài ra: ${them.join('; ')}.)` : ''}`;
  }
  const nhe = [...gom(kq.boQua)]
    .map(([ly, os]) => `Ô ${ds(os)} ${LOI_BO_QUA[ly as Exclude<LyDoBoQua, 'loi-thoi'>]}.`);
  if (nhe.length) return nhe.join(' ');
  if (kq.loiThoi.length) return `Đã nạp xong bộ ghế. (Ô ${ds(kq.loiThoi)} có lượt mới hơn đè lên.)`;
  return 'Đã nạp xong bộ ghế.';
}

/* ══════════════════════════════════════════════════════════════════════════
 * 🎛 ĐƯỜNG ĐIỀU PHỐI NẠP BỘ GHẾ — bóc ra khỏi component để THỬ ĐƯỢC.
 *
 * 🕳 Vì sao phải bóc (người soi bác vòng 2): tôi có thử `cauNhacNapBoGhe` bằng bảng 16 tổ hợp và
 *    nó xanh — nhưng đó là thử HÀM TẠO CÂU, khôngphải thử ĐƯỜNG ĐI. Cái hỏng nằm ở chỗ đường đi
 *    khôngchuyển kết quả tới hàm ấy. Một phép thử đúng trên sai vật thì nó bảo vệ đúng cái vật đó.
 * ⇒ Nay đường đi nhận PHỤ THUỘC qua tham số, nên bộ đo chạy được CHÍNH nó bằng mạng giả,
 *   khôngphải nạp ghế thật, khôngphải dựng React.
 * ══════════════════════════════════════════════════════════════════════════ */

export type CapGheNap = { ten: string | null; phien?: string | null; goiY?: string };

export type PhuThuocNap = {
  soO: number;
  docO: (i: number) => { ten: string | null; phien: string | null; dangChay: boolean };
  coTrongDanhBa: (ten: string) => boolean;
  datNguoi: (i: number, ten: string) => Promise<KetQuaDatNguoi>;
  dongO: (i: number) => Promise<boolean>;
  ghiO: (i: number, ten: string, phien: string) => Promise<boolean>;
  napLichSu: (i: number, ten: string, phien: string) => Promise<'xong' | 'loi-thoi' | 'hong'>;
  /** 🔒 Phiên GHIM của ghế, hoặc null. Tuỳ chọn: cổng cũ chẳng khai thì coi như KHÔNG ghim,
   *  nên mọi chỗ gọi sẵn có giữ nguyên nết. */
  phienGhimCua?: (ten: string) => string | null;
  moDan?: (i: number, goiY: string) => void;
  donTruocKhiGhi?: (i: number) => void;
};

export async function chayNapBoGhe(muc: CapGheNap[], pt: PhuThuocNap): Promise<KetQuaNapBoGhe> {
  const kq = ketQuaTrong();
  const ten = muc.map((m) => m.ten);

  const dangChay = new Set<number>();
  for (let k = 0; k < pt.soO; k += 1) if (pt.docO(k).dangChay) dangChay.add(k);

  // ⑤ dọn ô đang giữ ghế thuộc bộ ĐÍCH nhưng SAI CHỖ — gỡ chốt `trung` của datNguoi
  for (let k = 1; k < pt.soO; k += 1) {
    const dang = pt.docO(k).ten;
    if (!dang || dangChay.has(k)) continue;
    if (dang !== ten[k] && ten.includes(dang) && !(await pt.dongO(k))) {
      kq.hong.push({ o: k + 1, vi_sao: 'ghi-so' });
    }
  }

  for (let i = 1; i < pt.soO; i += 1) {
    if (dangChay.has(i)) { ghiVaoSo(kq, i + 1, { xong: false, boQua: 'dang-chay' }); continue; }
    const dich = ten[i] ?? null;
    const dang = pt.docO(i).ten;
    if (dang === dich) continue;                       // đã đúng chỗ ⇒ đừng đụng
    if (!dich) {
      if (!(await pt.dongO(i))) kq.hong.push({ o: i + 1, vi_sao: 'ghi-so' });
      continue;
    }
    if (!pt.coTrongDanhBa(dich)) { ghiVaoSo(kq, i + 1, { xong: false, boQua: 'thieu-ghe' }); continue; }

    // 🔑 ĐÂY là chỗ vòng 2 đứt: kết quả `datNguoi` bị vứt. Nay nó ĐI QUA đúng một cửa.
    const ketO = await pt.datNguoi(i, dich);
    ghiVaoSo(kq, i + 1, ketO);
    if (!ketO.xong) continue;

    const goiY = muc[i]?.goiY;
    if (goiY) pt.moDan?.(i, goiY);

    /**
     * 🔒 ㉘ 🅰 — GHẾ CÓ GHIM thì ẢNH CHỤP BỘ GHẾ KHÔNG được ghi chồng lên nó (Owner quyết 07/09).
     *
     * 🕳 Đường cũ: `datNguoi` phía trên ĐÃ nối ô vào đúng phiên ghim, rồi mấy dòng dưới lấy
     *    `phienLuu` — mã phiên chụp lúc LƯU BỘ GHẾ — thấy khác sổ nên GHI CHỒNG lên.
     *    Ô rơi về phiên cũ, và cả hai bước đều báo THÀNH CÔNG.
     * 🔑 Đây là đường Owner KHÔNG chủ động chọn phiên: anh ấy bấm «nạp bộ ghế», chẳng chọn
     *    phiên nào cả. Nên cái ghim phải thắng ảnh chụp.
     * ⚠️ `pt.phienGhimCua` là TUỲ CHỌN ⇒ cổng nào chẳng khai thì hành vi y hệt trước.
     */
    const ghim = pt.phienGhimCua?.(dich) ?? null;
    const phienLuu = ghim ? null : (muc[i]?.phien ?? null);
    if (phienLuu && pt.docO(i).phien !== phienLuu) {
      pt.donTruocKhiGhi?.(i);
      if (!(await pt.ghiO(i, dich, phienLuu))) { kq.hong.push({ o: i + 1, vi_sao: 'ghi-so' }); continue; }
      const trangThai = await pt.napLichSu(i, dich, phienLuu);
      if (trangThai === 'hong') kq.hong.push({ o: i + 1, vi_sao: 'doc-lich-su' });
      else if (trangThai === 'loi-thoi') kq.loiThoi.push(i + 1);
    }
  }
  return kq;
}

// Shared contract for both write adapters. Revisions distinguish A -> B -> A.
export type WriteBinding = Readonly<{ seat: string | null; session: string | null; generation: number }>;

export function bindingOf(row?: { ma_nhan_su: string | null; ma_phien: string | null; generation?: number } | null): WriteBinding {
  return { seat: row?.ma_nhan_su ?? null, session: row?.ma_phien ?? null, generation: row?.generation ?? 0 };
}

export function isWriteBinding(value: unknown): value is WriteBinding {
  if (!value || typeof value !== 'object') return false;
  const b = value as WriteBinding;
  return (b.seat === null || typeof b.seat === 'string') &&
    (b.session === null || typeof b.session === 'string') &&
    Number.isSafeInteger(b.generation) && b.generation >= 0;
}

export function sameBinding(current: WriteBinding, expected: WriteBinding): boolean {
  return isWriteBinding(expected) && current.generation === expected.generation &&
    current.seat === expected.seat && current.session === expected.session;
}

export function nextBinding(current: WriteBinding, seat: string | null, session: string | null): WriteBinding {
  if (current.generation >= Number.MAX_SAFE_INTEGER) throw new Error('Binding generation exhausted');
  return { seat, session, generation: current.generation + 1 };
}

export type ThanGhiO = {
  ma_o: string;
  ma_nhan_su: string | null;
  ma_phien: string | null;
  xoa_lien_ket: boolean;
  binding: WriteBinding;
};

/**
 * 📮 Ghi sổ ô — và TRẢ LỜI xem có ghi được không.
 * 🔴 Bản cũ (`UngDung.tsx` ~566) là `await fetch(...)` trần: KHÔNG xem `res.ok`, KHÔNG bắt lỗi
 *    mạng. Máy chủ trả 500 hay wifi rớt thì nó vẫn đi tiếp y như lúc thành công.
 * 📌 `fetch` chỉ ném khi KHÔNG GỬI ĐƯỢC. Gửi được rồi mà máy chủ chối thì nó trả về BÌNH THƯỜNG —
 *    nên `try/catch` một mình vẫn để lọt toàn bộ nhóm lỗi 4xx/5xx.
 */
export async function ghiSoO(than: ThanGhiO, goiMang: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await goiMang('/api/o', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(than),
    });
    return res.ok;
  } catch {
    return false;   // rớt mạng · huỷ giữa chừng · máy chủ chết
  }
}
