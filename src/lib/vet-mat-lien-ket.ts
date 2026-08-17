import fs from 'node:fs';
import path from 'node:path';
import { khoPhienCua } from './doc-phien';

/**
 * 🔬 MÁY ĐO cho lỗi «app tự xoá liên kết phiên» (17/08/2026, claude-phong-ban-pm).
 *
 * VÌ SAO CÓ TỆP NÀY: ngày 17/08 Owner mở app trên điện thoại thì liên kết phiên
 * của ÔNG TRÙM biến mất, còn tệp `.jsonl` thì NGUYÊN VẸN. Nối tay lại là xong,
 * nhưng ⛔ KHÔNG ai biết gốc ⇒ nó sẽ tái diễn.
 *
 * Bài học đứng sau: **thứ không tái hiện được thì ⛔ không chẩn đoán được.**
 * ⇒ Đặt MÁY ĐO trước, đừng chữa cái mình chưa đo được.
 *
 * ⛔ HÀM NÀY KHÔNG ĐỔI HÀNH VI. Nó chỉ ghi lại. Quyết định xoá/không xoá vẫn do
 * chỗ gọi định, y như trước. Mọi lỗi bên trong đều bị nuốt — máy đo ⛔ KHÔNG
 * ĐƯỢC PHÉP làm sập thứ nó đang đo.
 *
 * ĐO GÌ, VÀ VÌ SAO ĐO CÁI ĐÓ:
 *   lan_1  kết quả `coPhien` mà chỗ gọi đã dùng để quyết (truyền vào).
 *   lan_2  ĐO LẠI ngay tại đây. Nếu lan_1=false mà lan_2=true ⇒ phép đo một-mẫu
 *          đã bắt trúng khoảnh khắc tệp không thấy được ⇒ xác nhận giả thuyết
 *          «existsSync bắt trúng lúc tệp bị thay/đổi tên». Đây là mấu chốt.
 *   kho_ton_tai / so_tep  phân biệt «kho sai đường» với «đúng kho, thiếu 1 tệp».
 *   tep_gan_giong  bắt ca tệp bị ĐỔI TÊN (mã phiên mới, 8 ký tự đầu vẫn trùng).
 */
export interface VetMatLienKet {
  moc: string;
  ma_o: string;
  ma_nhan_su: string;
  ma_phien: string;
  kho: string;
  duong_dan_tep: string;
  lan_1: boolean;
  lan_2: boolean | null;
  kho_ton_tai: boolean | null;
  so_tep_jsonl: number | null;
  tep_gan_giong: string[];
  moc_tep: string | null;
}

const TEN_TEP_VET = 'vet-mat-lien-ket.jsonl';

export function ghiVetMatLienKet(maO: string, maNhanSu: string, maPhien: string, lan1: boolean): void {
  try {
    let kho = '';
    try { kho = khoPhienCua(maNhanSu); } catch { kho = '(không suy được kho)'; }
    const duongDanTep = kho ? path.join(kho, `${maPhien}.jsonl`) : '';

    let lan2: boolean | null = null;
    let khoTonTai: boolean | null = null;
    let soTep: number | null = null;
    let mocTep: string | null = null;
    const ganGiong: string[] = [];

    try {
      // Mẫu thứ HAI — đo lại ngay, KHÔNG dùng để quyết, chỉ để ghi.
      lan2 = fs.existsSync(duongDanTep);
      khoTonTai = fs.existsSync(kho);
      if (khoTonTai) {
        const ds = fs.readdirSync(kho).filter((t) => t.endsWith('.jsonl'));
        soTep = ds.length;
        const dau = maPhien.slice(0, 8);
        for (const t of ds) if (dau && t.startsWith(dau)) ganGiong.push(t);
      }
      if (lan2) mocTep = new Date(fs.statSync(duongDanTep).mtimeMs).toISOString();
    } catch { /* đo được bao nhiêu ghi bấy nhiêu */ }

    const vet: VetMatLienKet = {
      moc: new Date().toISOString(),
      ma_o: maO,
      ma_nhan_su: maNhanSu,
      ma_phien: maPhien,
      kho,
      duong_dan_tep: duongDanTep,
      lan_1: lan1,
      lan_2: lan2,
      kho_ton_tai: khoTonTai,
      so_tep_jsonl: soTep,
      tep_gan_giong: ganGiong,
      moc_tep: mocTep,
    };

    // Vệt 1: ra log máy chủ — thấy ngay khi đang theo dõi.
    console.warn('[VET-MAT-LIEN-KET]', JSON.stringify(vet));

    // Vệt 2: ra đĩa — sống qua lần khởi động lại, vì lỗi này THOÁNG QUA.
    try {
      const thuMuc = path.join(process.cwd(), '.trang-thai');
      fs.mkdirSync(thuMuc, { recursive: true });
      fs.appendFileSync(path.join(thuMuc, TEN_TEP_VET), `${JSON.stringify(vet)}\n`, 'utf8');
    } catch { /* ⛔ hết đĩa / ⛔ không quyền ⇒ vẫn còn vệt ở log máy chủ */ }
  } catch { /* ⛔ TUYỆT ĐỐI không ném — máy đo ⛔ không được làm sập luồng chat */ }
}

/**
 * 🔬 VỆT cho ca THỨ HAI: có ai gọi `/api/o` xin ghi mã phiên RỖNG lên một ô
 * ĐANG CÓ mã phiên, mà ⛔ KHÔNG khai ý định xoá.
 *
 * Ca thật 17/08: Owner mở app trên điện thoại ⇒ liên kết phiên ÔNG TRÙM biến mất,
 * tệp `.jsonl` thì nguyên vẹn. Đường đi ⛔ KHÔNG qua `coPhien`:
 *   `fetch('/api/o')` thất bại → `catch` coi như SỔ TRẮNG → ô 1 (ghế ghim) thấy
 *   "sổ ghi người khác" → ghi lại với mã phiên rỗng ⇒ xoá liên kết ĐÚNG.
 * ⇒ Từ nay chặn lại và ghi vệt, thay vì xoá âm thầm.
 */
export function ghiVetGhiRong(maO: string, maNhanSu: string, maPhienDangCo: string): void {
  try {
    const vet = {
      loai: 'chan-ghi-rong',
      moc: new Date().toISOString(),
      ma_o: maO,
      ma_nhan_su: maNhanSu,
      ma_phien_dang_co: maPhienDangCo,
    };
    console.warn('[VET-CHAN-GHI-RONG]', JSON.stringify(vet));
    try {
      const thuMuc = path.join(process.cwd(), '.trang-thai');
      fs.mkdirSync(thuMuc, { recursive: true });
      fs.appendFileSync(path.join(thuMuc, TEN_TEP_VET), `${JSON.stringify(vet)}\n`, 'utf8');
    } catch { /* còn vệt ở log máy chủ */ }
  } catch { /* ⛔ không bao giờ ném */ }
}
