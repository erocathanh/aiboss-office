/* ─────────────────────────────────────────────────────────────────────────────
   NỘI DUNG MÀN DEMO — tách hẳn khỏi mã, để đổi chữ là sửa ĐÚNG TỆP NÀY.

   Sinh 19/08/2026 theo lệnh Owner: cần 4 màn hình có tên phòng + kết quả trả ra,
   để CHỤP MÀN HÌNH đưa vào slide. Ý cần thể hiện, nguyên văn Owner:
   «Mỗi mảng việc một phòng, mỗi phòng một bạn ây ai — mà tất cả nói cùng một giọng.»

   ⚠️ CHỮ DƯỚI ĐÂY LÀ CHỮ DỰNG, ⛔ PHẢI bản ghi một lượt chạy thật.
      ⇒ Trên lớp gọi đúng tên: «màn hình dựng lại», ⛔ nói «máy vừa chạy ra».
      Muốn thành chữ thật: chạy 4 phòng trong app, chép kết quả vào đây, xoá dòng cảnh báo này.
───────────────────────────────────────────────────────────────────────────── */

export type OMan = {
  phong: string;
  nguoi: string;
  dangLam: string;
  trangThai: 'chay' | 'xong';
  ra: string[];
};

export const CHU_KY_GIONG = 'giọng: Eroca Thanh';

export const BON_O: OMan[] = [
  {
    phong: 'PHÒNG NỘI DUNG',
    nguoi: 'bạn viết bài',
    dangLam: 'viết bài fanpage — chủ đề công ty một người',
    trangThai: 'chay',
    ra: [
      'Thanh không thiếu người. Thanh thiếu cách giao việc.',
      'Người thì thuê được. Cái chưa chịu làm là lấy cách làm ra khỏi đầu mình rồi viết nó xuống cho đàng hoàng.',
      '› đang viết đoạn 3/5…',
    ],
  },
  {
    phong: 'PHÒNG BÁN HÀNG',
    nguoi: 'bạn soạn thư',
    dangLam: 'soạn thư chào cho người vừa để lại số',
    trangThai: 'chay',
    ra: [
      'Chào bạn, Thanh gửi bạn chỗ ngồi trong buổi tối nay.',
      'Bạn cứ mang việc thật của mình vào, mình sửa tại chỗ — khỏi học lý thuyết rồi về không biết bắt đầu từ đâu.',
      '› đang soạn bản cho nhóm chưa mở thư…',
    ],
  },
  {
    phong: 'PHÒNG CHĂM KHÁCH',
    nguoi: 'bạn trả tin',
    dangLam: 'trả 4 tin khách hỏi trong đêm',
    trangThai: 'chay',
    ra: [
      'Dạ có ạ, lớp có bản ghi hình, bạn xem lại lúc nào cũng được.',
      'Chỗ này Thanh để bạn hỏi thẳng trong buổi, đừng ngại — hỏi lúc đang vướng mới đáng tiền.',
      '› 4/4 đã có bản nháp, chờ bạn bấm gửi',
    ],
  },
  {
    phong: 'PHÒNG VẬN HÀNH',
    nguoi: 'bạn gom số',
    dangLam: 'gom số tuần rồi thành bảng đọc được',
    trangThai: 'xong',
    ra: [
      'Tuần rồi: 128 người để lại số · 41 người mở thư · 9 người vào lớp thử.',
      'Chỗ thiếu: 2 ngày không có số nguồn quảng cáo — mình ghi rõ «thiếu», không đoán cho đẹp.',
      '✓ xong, chờ bạn duyệt',
    ],
  },
];
