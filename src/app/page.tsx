import UngDung from '@/components/UngDung';
import { dsNhanSu, dsPhongBan, tongSo } from '@/lib/nhan-su';

/**
 * Trang chủ — thành phần MÁY CHỦ.
 * Chỉ đẩy xuống trình duyệt đúng phần dữ liệu để vẽ danh bạ.
 * ⛔ KHÔNG có khoá, ⛔ không có mã phiên, ⛔ không có đường dẫn máy nào đi kèm.
 */
export default function Trang() {
  const nhanSu = dsNhanSu().map((n) => ({
    ten: n.ten,
    nhan: n.nhan,
    phong: n.phong,
    ten_phong: n.ten_phong,
    vai: n.vai,
    viet_tat: n.viet_tat,
    tim: n.tim,
  }));

  return <UngDung phongBan={dsPhongBan()} nhanSu={nhanSu} tong={tongSo()} />;
}
