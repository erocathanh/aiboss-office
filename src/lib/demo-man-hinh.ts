/* ─────────────────────────────────────────────────────────────────────────────
   NỘI DUNG MÀN DEMO — tách khỏi mã, đổi chữ là sửa ĐÚNG TỆP NÀY.

   📋 NGUỒN CHỮ: `~/idea/inbox/aiboss-business-os-org/KICH-BAN-5-O-DEMO.md`
      do claude-giao-trinh-eeat soạn 20/8, lấy TỪ BẢN ĐỌC (d.857 · d.858 · d.859 · Nhịp 4b).
      ⛔ TÔI KHÔNG BỊA — bản trước tôi tự viết và Owner chê đúng:
      «tôi đâu thấy thể hiện được sức mạnh công việc chuyên môn của nó?»

   🔒 HAI CHỖ eeat KHOÁ CỨNG, ⛔ được nới:
      ① 5 dòng phải đọc như MÁY BÁO VIỆC, ⛔ như quảng cáo.
         ⛔ «tiết kiệm thời gian» · ⛔ con số hiệu quả · ⛔ «tuyệt vời».
         Sức mạnh nằm ở chỗ nó KỂ ĐÚNG VIỆC VỪA LÀM.
      ② Ô nào ⛔ có đường dẫn THẬT thì ⛔ dựng ô đó — ⛔ để lời hứa suông.

   👑 Ô 1 = TỔNG GIÁM ĐỐC, đúng luật app thật (`i === 0 ? ongTrum`) và đúng danh tính
      trong `du-lieu/nhan-su.json`: claude-eroca-boss · dieu-hanh · viết tắt ÔT.
───────────────────────────────────────────────────────────────────────────── */

export type KetQua = { nhan: string; duong: string; ghi?: string };
export type OMan = {
  phong: string; nguoi: string; owner: string;
  trangThai: 'chay' | 'xong';
  ra: string[]; ketQua?: KetQua;
};

export const CHU_KY_GIONG = 'giọng: Eroca Thanh';

export const SAU_O: OMan[] = [
  {
    phong: 'TỔNG GIÁM ĐỐC',
    nguoi: 'ÔT · điều hành',
    owner: 'Bạn thứ nhất — viết bài đăng cho tôi. Bạn thứ hai — gom cục số bán hàng tuần này lại, dựng cái báo cáo. Bạn thứ ba — coi mấy tin khách nhắn hỏi, soạn câu trả lời.',
    trangThai: 'chay',
    ra: [
      '· Đã nhận một lần ba việc, tách ra ba phòng',
      '· Đã giao: nội dung · sổ sách · chăm khách',
      '· Ba phòng chạy cùng lúc, ⛔ chờ nhau',
      '· Đang canh từng phòng, xong cái nào báo cái đó',
      '· Việc nào cần anh chị quyết thì tôi giữ lại, ⛔ tự quyết thay',
    ],
    ketQua: { nhan: '🧭 Xem tiến độ các phòng', duong: '#', ghi: 'ô này là chỗ Owner gõ MỘT câu' },
  },
  {
    phong: 'PHÒNG NỘI DUNG',
    nguoi: 'bạn viết bài',
    owner: 'Bạn thứ nhất — viết bài đăng cho tôi.',
    trangThai: 'xong',
    ra: [
      '· Đã đọc bối cảnh: bán gì · bán cho ai · khách hay thắc mắc gì · giọng chân chất',
      '· Đang dựng dàn bài — mở bằng chuyện thật, ⛔ mở bằng «trong cuộc sống bận rộn ngày nay»',
      '· Đã viết xong bản nháp, giọng bám đúng cách anh chị hay nói',
      '· Đã tự soi lại: ⛔ hứa điều gì ⛔ có trong bối cảnh',
      '· Xong. Bài nằm ở đường dẫn bên dưới, sửa thẳng trên đó được',
    ],
    ketQua: { nhan: '📄 Mở bài viết nháp', duong: '#', ghi: '⚠️ chờ đường dẫn thật' },
  },
  {
    phong: 'PHÒNG SỔ SÁCH',
    nguoi: 'bạn gom số',
    owner: 'Bạn thứ hai — gom cục số bán hàng tuần này lại, dựng cái báo cáo.',
    trangThai: 'xong',
    ra: [
      '· Đã gom số từ chỗ anh chị để — ⛔ phải gõ lại bằng tay',
      '· Đang cộng theo từng ngày, tách đơn đã giao và đơn còn treo',
      '· Có ba chỗ số ⛔ khớp — đã đánh dấu, ⛔ tự đoán bừa',
      '· Đã dựng bảng: tổng thu · tổng chi · còn lại',
      '· Xong. Chỗ nào nghi thì bấm vô ô đó là thấy nó lấy số từ đâu',
    ],
    ketQua: { nhan: '📊 Mở bản báo cáo', duong: '#', ghi: '⚠️ chờ đường dẫn thật' },
  },
  {
    phong: 'PHÒNG CHĂM KHÁCH',
    nguoi: 'bạn trả tin',
    owner: 'Bạn thứ ba — coi mấy tin khách nhắn hỏi, soạn câu trả lời.',
    trangThai: 'xong',
    ra: [
      '· Đã đọc tin của từng khách, tách ra ai hỏi giá, ai hỏi giao hàng, ai hỏi đổi trả',
      '· Soạn riêng cho từng người — ⛔ dùng một mẫu chung',
      '· Chỗ nào dính chính sách đổi trả thì để trống, chờ anh chị quyết',
      '· Câu nào cần anh chị đọc kỹ trước khi gửi thì đã đánh dấu',
      '· Xong. Mỗi dòng có nút DUYỆT VÀ GỬI, anh chị bấm từng cái',
    ],
    ketQua: {
      nhan: '💬 Mở danh sách câu soạn sẵn',
      duong: '/demo/tin-khach',
      ghi: 'nút gửi CHƯA nối — bấm vào nó nói thẳng',
    },
  },
  {
    phong: 'ĐI LÀM, ⛔ PHẢI VIẾT',
    nguoi: 'bạn mở trang',
    owner: 'Bạn nào rảnh mở giùm tôi cái video hướng dẫn cài đặt, cho cả lớp coi.',
    trangThai: 'xong',
    ra: [
      '· Đã hiểu: ⛔ phải viết, mà là ĐI MỞ',
      '· Đang tìm đúng video hướng dẫn cài đặt',
      '· Đã thấy. Mở trình duyệt',
      '· Đang bật trang, để nguyên chỗ cần xem',
      '· Xong. Màn hình lớp đang thấy đó',
    ],
    /* Đường dẫn này CHỜ Owner Allow đẩy (xin từ 19/8). Chưa live thì để '#'
       — eeat khoá cứng: ⛔ để lời hứa suông, mà cũng ⛔ trỏ vào chỗ chết. */
    ketQua: { nhan: '▶️ Mở video hướng dẫn cài đặt', duong: '#', ghi: '⚠️ chờ /cai-claude-code lên mạng' },
  },
  {
    phong: 'TRANG BÁN',
    nguoi: 'bạn mở trang',
    owner: 'Bạn nào rảnh mở giùm tôi trang khoá học Claude Master, cho cả lớp coi luôn.',
    trangThai: 'xong',
    ra: [
      '· Đã hiểu: mở trang, ⛔ phải viết gì',
      '· Đang mở trang khoá học',
      '· Trang đã lên',
      '· Đang đưa tới đúng khúc anh chị cần cho lớp coi',
      '· Xong. Cả lớp đang nhìn thấy',
    ],
    /* 🔴 ĐƯỜNG DẪN THẬT — Owner bấm mở NGAY trên lớp.
       Đo 20/08 07:2x: 200 · thân 39.798 byte · neo «Thanh» 25 lần ⇒ sống thật.
       ⚠️ ĐO LẠI trước buổi: mã 200 một mình ⛔ chứng minh gì, phải có neo. */
    ketQua: { nhan: '🌐 Mở trang Claude Master', duong: 'https://claudemaster.aiboss.vn', ghi: '✅ trang thật, đã đo' },
  },
];

export const MUC_CHIA_O = [1, 2, 4, 6] as const;
