/**
 * 🚀 CHẠY MỘT LẦN LÚC MÁY CHỦ KHỞI — Next gọi `register()` đúng một lần cho mỗi tiến trình.
 *
 * 🎯 Đây là chỗ DUY NHẤT trong app có «lúc máy chủ khởi». Trước tệp này, mọi thứ đều
 *    khởi động theo LỜI GỌI của trình duyệt — nên máy chủ không có đời sống riêng.
 *    (P0-2c · Owner ưu tiên hàng đầu 31/08: *«phụ thuộc trình duyệt quá khó chịu»*)
 *
 * ⚠️ HAI CHỖ DỄ NGÃ, ghi ra để người sau khỏi mò:
 * ① `register()` chạy CẢ ở runtime `edge` lẫn `nodejs`. Bộ chạy nền spawn tiến trình con
 *    ⇒ CHỈ chạy được ở `nodejs`. Không lọc runtime là nổ ở edge, và nổ lúc khởi máy chủ
 *    thì cả app không lên.
 * ② `import` ở ĐẦU TỆP sẽ kéo `chay-agent` (và `node:child_process`) vào CẢ bó edge.
 *    ⇒ phải `await import(...)` BÊN TRONG nhánh nodejs, không phải ở đầu tệp.
 *
 * 🔌 Bộ chạy nền vẫn MẶC ĐỊNH TẮT (`CHAY_NEN=1` mới bật) — xem `may-chay-nen.ts`.
 *    Nạp tệp này KHÔNG làm app đổi hành vi. Bật là một quyết định riêng, nhìn thấy được.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { bat, datNguonThamDo } = await import('@/lib/may-chay-nen');
  const { thamDoCuoiCua } = await import('@/lib/kho-danh-thuc');

  // Cắm nguồn dấu vết thăm dò TRƯỚC khi bật — nếu không, chốt ③ chạy bằng mặc định
  // «coi như có trình duyệt» và bộ nền sẽ đứng ngoài mãi mãi (an toàn, nhưng vô dụng).
  datNguonThamDo(thamDoCuoiCua);

  const daBat = bat();
  // Một dòng ra nhật ký máy chủ — để người đọc log biết CHẮC nó bật hay tắt,
  // thay vì phải suy từ việc «không thấy gì xảy ra».
  console.log(
    daBat
      ? '[chay-nen] ĐÃ BẬT — máy chủ sẽ tự rút mẩu khỏi hàng đợi khi không có trình duyệt lái.'
      : '[chay-nen] TẮT (đặt CHAY_NEN=1 để bật). App chạy y như cũ.',
  );
}
