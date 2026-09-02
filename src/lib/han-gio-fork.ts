/**
 * ⏱ HẠN GIỜ CHO MỘT LƯỢT FORK — **NGUỒN DUY NHẤT**, cả máy chủ lẫn máy khách đều nhập từ đây.
 *
 * 🕳 VÌ SAO TÁCH RA THÀNH MỘT TỆP RIÊNG (02/09/2026):
 *    Con số này từng có **BA bản** và KHÔNG bản nào nối với bản nào:
 * ```
 *    api/fork/route.ts:86   setTimeout(… , 180_000)      ⇐ số TRẦN, chưa từng có tên
 *    UngDung.tsx  «có thể tới 3 phút»                    ⇐ bản chép thứ hai
 *    UngDung.tsx  «🧬 Đang fork… (tới 3 phút)»            ⇐ bản chép thứ ba
 * ```
 *    Hôm nay cả ba khớp — **nhờ may**. Ai đổi `180_000` thì hai câu văn VẪN hứa 3 phút, và
 *    người đọc hai câu ấy là Owner.
 *
 * 🔑 `@claude-aiboss-app-pm` chốt 02/09: **viết việc theo LOẠI, đừng theo SỐ DÒNG.**
 *    Loại bệnh ở đây là «máy khách gõ cứng một con số do máy chủ SỞ HỮU» — và nó có BA chỗ,
 *    KHÔNG phải một. Vá một chỗ rồi đóng việc là chữa một phần ba rồi ghi sổ là đã xong.
 *
 * ⚖️ VÌ SAO LÀ MỘT TỆP DÙNG CHUNG, KHÔNG phải chở qua HTTP như `giay_tu_ep`:
 *      `giay_tu_ep`  ⇒ máy khách cần nó SAU khi bấm Dừng ⇒ có sẵn một phản hồi để chở theo
 *      hạn fork      ⇒ máy khách hiện nó TRƯỚC và TRONG lúc fork ⇒ KHÔNG có phản hồi nào tới kịp
 *    Tệp này chỉ chứa SỐ, KHÔNG nhập gì của Node, nên máy khách gói được an toàn.
 *
 * ⚠️ ĐỔI SỐ Ở ĐÂY LÀ ĐỔI CẢ BA CHỖ. Phép thử đi kèm (@app-pm ra 02/09): đổi thành một số khác
 *    thường (vd 77 giây) ⇒ **cả ba câu văn phải đổi theo**. Còn câu nào giữ số cũ là còn một
 *    bản chưa nối — và «đã nối» lúc đó chỉ là một lời khai.
 */
export const HAN_FORK_MS = 180_000;

/** Số PHÚT làm tròn, dùng cho câu chữ hiện cho Owner. */
export const PHUT_FORK = Math.round(HAN_FORK_MS / 60_000);

/**
 * Câu mô tả hạn giờ, dùng CHUNG cho mọi chỗ hiển thị.
 * 🔑 Gom thành MỘT hàm chứ KHÔNG để mỗi chỗ tự ghép chuỗi: dưới một phút thì «3 phút» đọc thành
 *    «0 phút», nên phép làm tròn cũng phải nằm ở MỘT chỗ.
 */
export function moTaHanFork(): string {
  return HAN_FORK_MS < 60_000
    ? `tới ${Math.round(HAN_FORK_MS / 1000)} giây`
    : `tới ${PHUT_FORK} phút`;
}
