/* Danh sách câu soạn sẵn cho từng khách — nội dung màn demo, tách khỏi mã.
   Nguồn khung: KICH-BAN-5-O-DEMO.md ô ③ (claude-giao-trinh-eeat 20/8).
   ⚠️ Tên khách là TÊN DỰNG, ⛔ phải khách thật — ảnh này lên slide trước 200 người.  */
export type TinKhach = {
  ten: string; hoi: string; loai: 'giá' | 'giao hàng' | 'đổi trả';
  traLoi: string; canDoc?: string;
};
export const DS_TIN: TinKhach[] = [
  { ten: 'chị Hạnh', loai: 'giá', hoi: 'Bộ này bao nhiêu vậy shop?',
    traLoi: 'Dạ bộ này 480.000đ chị, đã gồm phí giao. Chị lấy màu nào để em giữ hàng ạ?' },
  { ten: 'anh Kiên', loai: 'giao hàng', hoi: 'Đặt hôm nay mai có kịp không?',
    traLoi: 'Dạ đơn trước 15h thì mai anh nhận được trong nội thành. Anh cho em địa chỉ để em báo giờ giao cụ thể nhé.' },
  { ten: 'chị Vy', loai: 'đổi trả', hoi: 'Mua về không vừa thì đổi được không?',
    traLoi: '', canDoc: 'Chính sách đổi trả chưa có trong hồ sơ shop — để trống chờ anh chị quyết, ⛔ tự chế.' },
  { ten: 'anh Dũng', loai: 'giá', hoi: 'Mua 3 bộ có bớt không?',
    traLoi: 'Dạ mua 3 bộ em gửi anh mức 450.000đ/bộ.',
    canDoc: 'Mức giá sỉ này cần anh chị xác nhận trước khi gửi.' },
];
