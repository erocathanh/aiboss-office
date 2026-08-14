import duLieu from '../../du-lieu/nhan-su.json';
import { datNhanHangLoat } from './dat-nhan';

export interface PhongBan {
  ma: string;
  icon: string;
  ten: string;
  so_nhan_su: number;
}

export interface NhanSu {
  /** Tên kỹ thuật (slug) — mã định danh THẬT, dùng để nối phiên + tra cứu. */
  ten: string;
  /** Nhãn dễ hiểu — thứ hiện làm dòng CHÍNH cho người xem. */
  nhan: string;
  phong: string;
  ten_phong: string;
  vai: string;
  viet_tat: string;
  /** Chuỗi đã bỏ dấu, gộp cả nhãn lẫn slug — để tìm kiếm được CẢ HAI đường. */
  tim: string;
}

/** Bỏ dấu tiếng Việt để gõ "marketing" hay "phieu" đều ra. */
export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const PHONG: PhongBan[] = (duLieu as { phong_ban: PhongBan[] }).phong_ban;
const tenPhongTheoMa = new Map(PHONG.map((p) => [p.ma, p.ten]));

const coNhan = datNhanHangLoat(
  (duLieu as { nhan_su: Array<{ ten: string; phong: string; vai: string; viet_tat: string }> })
    .nhan_su,
);

const DS: NhanSu[] = coNhan.map((n) => ({
  ten: n.ten,
  nhan: n.nhan,
  phong: n.phong,
  ten_phong: tenPhongTheoMa.get(n.phong) ?? n.phong,
  vai: n.vai,
  viet_tat: n.viet_tat,
  // ⭐ Gộp nhãn + slug + vai + phòng ⇒ gõ "marketing" ra đúng người,
  //   gõ "web-funnel" cũng ra đúng người. ⛔ Đảo nhãn KHÔNG làm mất đường tra cũ.
  tim: boDau(`${n.nhan} ${n.ten} ${n.vai} ${tenPhongTheoMa.get(n.phong) ?? ''}`),
}));

const theoTen = new Map(DS.map((n) => [n.ten, n]));

export function dsPhongBan(): PhongBan[] {
  return PHONG;
}

export function dsNhanSu(): NhanSu[] {
  return DS;
}

export function timNhanSu(ten: string): NhanSu | undefined {
  return theoTen.get(ten);
}

export function tongSo() {
  return {
    nhan_su: DS.length,
    phong_ban: PHONG.length,
    truong_phong: DS.filter((n) => n.vai === 'Trưởng phòng').length,
  };
}
