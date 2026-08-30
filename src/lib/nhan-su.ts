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
  /** 👑 Ghim đầu danh sách · ⛔ không có nút tắt · luôn chiếm ô 1 khi chia 2/4 ô. */
  ghim?: boolean;
  /** Đường dẫn tệp linh hồn — nạp làm lời dặn hệ thống cho phiên của ghế này. */
  soul?: string;
  /**
   * 📁 CHỖ ĐỨNG riêng của ghế (tuỳ chọn). ⛔ có thì ghế đứng ở
   * `<thuMucLamViec>/<tên ghế>` như thường lệ.
   *
   * 🎯 Sinh ra 30/08 cho bộ «Quản Lý Trường»: 5 phiên Owner muốn nối vào nằm ở kho
   *    `-Users-erocathanh` (thư mục NHÀ). Mà kho phiên được suy TỪ chỗ đứng
   *    (`khoPhienCua` → `thuMucAgent`) ⇒ ⛔ đặt được chỗ đứng thì `--resume` tìm
   *    trong `-Users-erocathanh-claude-hieu-truong` và ⛔ BAO GIỜ thấy — ghế mở ra TRỐNG.
   */
  thu_muc?: string;
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

type NhanSuTho = {
  ten: string; phong: string; vai: string; viet_tat: string;
  /** Nhãn VIẾT TAY — có thì thắng nhãn máy tự sinh. */
  nhan?: string;
  /** 👑 Ghim đầu danh sách · ⛔ không tắt được · ô 1 ở mọi chế độ chia ô. */
  ghim?: boolean;
  /** Đường dẫn tệp linh hồn — nạp làm lời dặn hệ thống cho phiên của ghế này. */
  soul?: string;
  /** Chỗ đứng riêng — xem chú thích ở `NhanSu.thu_muc`. */
  thu_muc?: string;
};

const THO = (duLieu as { nhan_su: NhanSuTho[] }).nhan_su;
const coNhan = datNhanHangLoat(THO);
const thoTheoTen = new Map(THO.map((n) => [n.ten, n]));

const DS: NhanSu[] = coNhan.map((n) => ({
  ten: n.ten,
  // ⭐ Nhãn viết tay trong dữ liệu THẮNG nhãn máy sinh — «TỔNG GIÁM ĐỐC» phải hiện đúng chữ đó,
  //    ⛔ không để bộ sinh nhãn dịch slug thành thứ khác.
  nhan: thoTheoTen.get(n.ten)?.nhan ?? n.nhan,
  ghim: thoTheoTen.get(n.ten)?.ghim === true,
  soul: thoTheoTen.get(n.ten)?.soul,
  thu_muc: thoTheoTen.get(n.ten)?.thu_muc,
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
  // 👑 Ghế ghim luôn đứng ĐẦU, bất kể lọc theo phòng nào — Owner chốt 14/08.
  return [...DS].sort((a, b) => Number(b.ghim ?? false) - Number(a.ghim ?? false));
}

/** 👑 Ghế ghim đầu — dùng cho luật “ô 1 luôn là nó” ở chế độ chia 2/4 ô. */
export function gheGhim(): NhanSu | undefined {
  return DS.find((n) => n.ghim);
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
