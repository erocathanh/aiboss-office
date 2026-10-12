interface PhongBan { ma: string; icon: string; ten: string; so_nhan_su: number }
interface NhanSu {
  ten: string; nhan: string; phong: string; ten_phong: string;
  vai: string; viet_tat: string; tim: string;
  /** 👑 Ghim đầu danh sách · ⛔ không nút tắt · ô 1 mọi chế độ chia ô. */
  ghim?: boolean;
  /**
   * Đường dẫn tệp LINH HỒN của ghế (7/218 ghế có, đo trong `du-lieu/nhan-su.json`).
   * ⚠️ Kiểu này là BẢN CHÉP của `src/lib/nhan-su.ts` — dữ liệu vẫn về đủ, chỉ là bản
   * chép thiếu trường nên TypeScript báo lỗi khi tôi hiện nó ra thẻ hồ sơ (17/08/2026).
   * 📌 Hai bản khai cùng một thứ thì sớm muộn cũng lệch; đáng gộp về một nguồn.
   */
  soul?: string;
  /**
   * 📌 Phiên ghim — tên chính thức «ghim ở đường bấm tên và bấm thẻ» (Owner chốt 16:26 06/09/2026).
   *    Xem chú thích đầy đủ, kèm PHẠM VI đo được, ở `src/lib/nhan-su.ts`.
   * ⚠️ Thêm ở CẢ HAI nơi vì kiểu này là BẢN CHÉP; chính chú thích trên đã cảnh báo
   *    bản chép sẽ lệch, và `thu_muc` đã lệch thật. Đây là lần thứ hai.
   */
  phien_ghim?: string;
  icon?: string;
  status?: string;
}
interface TomTatPhien {
  ma: string; moc: number; moc_doc: string;
  tin_cuoi: string; so_luot: number; dang_chay: boolean;
}
interface Tin {
  /** 🔑 Mã riêng do máy khách cấp — xem `datMa()`. ⛔ Đừng thay bằng chỉ số hay `luc`. */
  ma: string;
  /**
   * 📜 Tin này ĐẾN TỪ LỊCH SỬ (máy chủ đọc tệp phiên), ⛔ phải tin sinh ra trong lượt đang chạy.
   * Chỉ tin lịch sử mới hiện MỐC ĐẦY ĐỦ — khung đang sống giữ «HH:mm» cho khỏi lặp
   * hàng trăm lần cùng một ngày trên cỡ chữ 10px (mau09.css:312 · 9,5px ở bố cục 4 ô :383).
   */
  tuLichSu?: boolean;
  ai: 'toi' | 'ho'; chu: string; gio: string; loi?: boolean;
  /**
   * 🕐 MỐC THẬT (epoch ms) — việc ②A, 19/08/2026.
   * `gio` là chuỗi HIỂN THỊ "22:11" ⇒ ⛔ không suy ra được NGÀY. Ca 23:59 → 00:01 hỏng chắc.
   * ⚠️ TUỲ CHỌN: **14% dòng** trong tệp phiên thật ⛔ KHÔNG có `timestamp`.
   *    (đo lại 31/08/2026: app-pm 1.065/7.546 = 14,1% · eroca-boss 630/4.639 = 13,6%.
   *     Số cũ ghi 11,5% đo ngày 19/08 — ĐÃ TRÔI. Ai đọc lại thì ĐO LẠI, ⛔ tin con số này mãi.)
   *    Bong bóng cũ đang nằm trong bộ nhớ cũng ⛔ không có ⇒ mọi chỗ ĐỌC phải chịu được `undefined`.
   * 📌 Bước này CHỈ thêm dữ liệu — giao diện ⛔ KHÔNG đổi một ly (cổng ③ của việc ②A).
   */
  luc?: number;
  /**
   * 📍 Vị trí KẾT THÚC của từng mẩu máy chủ bắn về (Owner 17/08/2026:
   * «bắn mẩu nhỏ mới lên cần thêm xuống dòng cho tôi để biết mẩu mới»).
   * Giữ RIÊNG, ⛔ không nhét ký tự lạ vào `chu` — để tắt chế độ này là chữ sạch ngay,
   * và bôi đen chép đi ⛔ không dính rác.
   */
  ranh?: number[];
  /**
   * Bong bóng ĐANG chảy chữ của LƯỢT NÀY.
   *
   * 🪤 BẪY ĐÃ CẮN THẬT (14/08): bản trước dùng một biến cờ `daMoBong` NGOÀI hàm cập nhật
   *    để biết "đã mở bong bóng chưa". React ở chế độ nghiêm ngặt GỌI HÀM CẬP NHẬT HAI LẦN;
   *    lần một đặt cờ, lần hai thấy cờ đã bật nên NỐI CHỮ VÀO TIN CUỐI — mà tin cuối lúc đó
   *    là CÂU HỎI CỦA NGƯỜI DÙNG. Đo thật: bong bóng ra
   *    «Tra loi dung 3 chu: TOI LA O2TOI LA O2» — câu trả lời chui vào câu hỏi.
   * ⇒ Cờ phải nằm TRONG trạng thái để hàm cập nhật THUẦN (gọi mấy lần cũng ra một kết quả).
   */
  dang?: boolean;
  /**
   * 🔔 Câu này ⛔ KHÔNG do Owner gõ — một ghế khác đánh thức ô này qua cổng
   * `/api/danh-thuc`. Giữ TÊN KỸ THUẬT của ghế gửi để dựng nhãn «… đánh thức».
   * ⛔ Đừng bỏ nhãn: người xem phải phân biệt được câu Owner gõ với câu máy tự gửi.
   */
  tu_ai?: string;
}
type CapGheDungSan = { ten: string; phien: string | null; goiY?: string };
interface OChat {
  ns: NhanSu | null;
  tin: Tin[];
  soan: string;
  dangChay: boolean;
  dangNap: boolean;
  chiPhi: number | null;
  token: number | null;
  noiTiep: boolean;
  /** Còn phần lịch sử CŨ HƠN chưa nạp ⛔ — máy chủ trả về, dùng để hiện nút «xem thêm». */
  conNua: boolean;
  /** Máy chủ báo có khúc ⛔ đọc nổi (dòng dài hơn trần) — phải nói thật với Owner. */
  catDongDai: boolean;
  /** CON TRỎ: trang đang hiện bắt đầu ở byte nào. Xin trang cũ hơn thì gửi lại số này. */
  viTri: number;
  dsPhien: TomTatPhien[];
  phienHienTai: string | null;
  moChonPhien: boolean;
  moDan: boolean;
  chuoiDan: string;
  loiDan: string;
  /** 🧬 Mã phiên đọc được nhưng thuộc THƯ MỤC KHÁC — chờ Owner bấm «Fork về ghế này». */
  phienChoFork: string | null;
  dangFork: boolean;
  /**
   * 🗣 CÂU DẶN ĐẦU TIÊN gửi NGAY SAU khi fork xong. TUỲ CHỌN — bỏ trống là KHÔNG gửi gì.
   *
   * 🕳 Ca sinh ra nó (Owner 31/08): bản fork mang mạch cũ, nên nó vẫn xưng TÊN CŨ.
   *    Trước đây Owner phải fork xong rồi tự gõ lại câu dặn — mà lúc đó ô đã chuyển
   *    sang mạch mới, dễ quên, và quên thì ghế mang nhầm danh tính CẢ PHIÊN.
   * 🔒 Bỏ trống thì đường đi y hệt cũ — thêm cái này KHÔNG đổi hành vi của ai
   *    đang dùng fork theo nếp cũ.
   */
  cauDauFork: string;
  /** ¶ Hiện RANH GIỚI MẨU: mỗi mẩu máy chủ bắn về xuống một dòng. */
  hienMau: boolean;
  /** ℹ Mở thẻ hồ sơ ghế (gồm mã phiên · token · chi phí). */
  moHoSo: boolean;
  /** ⋯ Mở menu xổ ở góc phải ô (các việc ÍT DÙNG + đóng ô). */
  moMenu: boolean;
  /**
   * 🔴 Luồng vừa ĐỨT bất thường (mạng rớt · máy chủ tắt · khoá màn giữa chừng).
   * Owner 17/08 xin đèn báo «đang nối / mất kết nối» ⇒ đèn phải dựa vào SỰ THẬT ĐO ĐƯỢC,
   * ⛔ không phải suy từ việc ô có phiên hay chưa.
   */
  matKetNoi: boolean;
  /**
   * ⏭ HÀNG CHỜ — câu Owner gõ trong lúc ghế đang trả lời.
   * Owner 17/08: *«khi ai agent trả lời tôi vẫn chat tiếp và bấm gửi, nó nhồi vào
   * hàng chờ, ai agent gửi xong là nó gửi tiếp — giống trên terminal»*.
   * Trước đây bấm gửi lúc đang chạy là câu RƠI MẤT, ⛔ không báo gì.
   */
  hangCho: string[];
  /**
   * 🔽 THU KHUNG CHAT (Owner 18/08: «thêm nút thu khung chat ô 1 TỔNG GIÁM ĐỐC ở giao diện
   * mobile, sau khi thu sẽ đổi thành icon bấm để mở ra»).
   * ⛔ KHÔNG lưu localStorage: Owner vào app qua CẢ LAN lẫn Tailscale = HAI GỐC RIÊNG
   *    ⇒ mỗi đường nhớ một kiểu, rối hơn tiện. Đây là trạng thái NHÌN, mất là mất, ⛔ không sao.
   *    (Khác `KHOA_BO_CUC`/`KHOA_TIEU_DIEM` — hai cái đó là bố cục toàn app nên CÓ lưu.)
   */
  thuKhung: boolean;
}
export type { PhongBan, NhanSu, TomTatPhien, Tin, CapGheDungSan, OChat };
