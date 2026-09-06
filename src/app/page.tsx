import UngDung from '@/components/UngDung';
import { dsNhanSu, dsPhongBan, tongSo } from '@/lib/nhan-su';

/**
 * Trang chủ — thành phần MÁY CHỦ.
 * Chỉ đẩy xuống trình duyệt đúng phần dữ liệu để vẽ danh bạ.
 * ⛔ KHÔNG có khoá, ⛔ không có mã phiên, ⛔ không có đường dẫn máy nào đi kèm.
 *
 * 🔴 KHỐI `nhanSu` DƯỚI ĐÂY LÀ MỘT DANH SÁCH CHO PHÉP, KHÔNG phải một phép chép.
 *    Trường nào KHÔNG có tên trong đó thì KHÔNG sang được trình duyệt — im lặng:
 *    không lỗi kiểu, không lỗi lint, `tsc` vẫn xanh, `next build` vẫn xanh.
 *    ⇒ Thêm trường mới vào `du-lieu/nhan-su.json` mà quên khối đó ⇒ tính năng thành MÃ CHẾT.
 *
 * 🕳 ĐÃ CẮN HAI LẦN, cả hai đều đo được hậu quả:
 *      `ghim`       thiếu ⇒ TỔNG GIÁM ĐỐC rơi xuống vị trí 126/212 giữa danh sách
 *      `phien_ghim` thiếu ⇒ nhánh ghim phiên thành mã chết, việc ô 5 trượt vòng 2/3 (06/09/2026)
 *    Lần thứ hai xảy ra CÁCH tấm biển của lần thứ nhất đúng MỘT DÒNG.
 * 🔑 Vì sao biển cũ không cứu được: nó dặn «đừng quên `ghim`» — tức nói về MỘT TRƯỜNG CÓ TÊN.
 *    Muốn che được những trường CHƯA RA ĐỜI thì phải nói về CÁI DANH SÁCH. Đó là khối này.
 * 📌 CỐ Ý bỏ lại ngoài danh sách: đường dẫn tệp danh tính và `thu_muc` — chuyện phía máy chủ.
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
    // 👑 PHẢI mang sang giao diện — thiếu trường này thì UI ⛔ không biết ghế nào được ghim,
    //    và TỔNG GIÁM ĐỐC rơi tuột xuống giữa danh sách (đo thật: vị trí 126/212).
    //    ⛔ Đừng đưa `soul` ra đây — đường dẫn tệp là chuyện phía máy chủ.
    ghim: n.ghim ?? false,
    /**
     * 📌 PHIÊN GHIM (ghim ở đường bấm tên và bấm thẻ) — PHẢI có mặt ở đây, cùng lý do với `ghim` ngay trên.
     *    ⚠️ Tên này do Owner chốt 16:26 06/09/2026. Tên cũ «ghim cứng» là NÓI QUÁ —
     *    xem phạm vi thật ở `UngDung.tsx` khối trên `datNguoi`.
     * 🕳 Ca thật 06/09/2026: tôi thêm `phien_ghim` vào dữ liệu, vào kiểu, và vào chỗ
     *    QUYẾT ĐỊNH trong `datNguoi` — nhưng KHÔNG thêm vào đây. Danh sách trường này
     *    là một BỘ LỌC CHO PHÉP: thiếu tên trong danh sách thì trường bị đánh rơi ở
     *    ranh giới máy chủ → trình duyệt, và nhánh `if (n.phien_ghim)` thành MÃ CHẾT.
     * 🔑 `tsc` XANH và `eslint` XANH suốt lúc đó — vì kiểu `optional` KHÔNG tự sinh dữ
     *    liệu. Kiểu chỉ nói «được phép vắng», nó KHÔNG nói «có mặt».
     */
    phien_ghim: n.phien_ghim,
  }));

  return <UngDung phongBan={dsPhongBan()} nhanSu={nhanSu} tong={tongSo()} />;
}
