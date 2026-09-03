/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * 🧪 THƯ MỤC DỰNG đọc từ biến môi trường — để bản DEV và bản CHẠY THẬT không giẫm nhau.
   *
   * 🕳 CA SINH RA (03/09/2026, tôi gây ra): tôi bật `next dev` cổng 4320 tưởng là đã cách ly
   *    (cổng riêng · `.trang-thai` riêng vì nó neo vào `process.cwd()` · claude giả).
   *    Nhưng `next dev` và `next start` DÙNG CHUNG `.next` ⇒ bản dev XOÁ SẠCH bản dựng mà
   *    cổng 4319 đang phục vụ. Đo lúc đó: 8/8 tài nguyên HTTP 400, `BUILD_ID` biến mất.
   *    App vẫn trả HTML 200 — nên nhìn từ ngoài nó KHÔNG giống một cái hỏng.
   * 🔑 Tôi kiểm BA đường cách ly rồi SUY đường thứ tư. Ba cái đúng không chứng minh cái thứ tư.
   *
   * ⚖️ MẶC-ĐỊNH-AN-TOÀN: biến KHÔNG đặt ⇒ `.next` ⇒ bản chạy thật cư xử Y HỆT trước dòng này.
   *    Khác hẳn một thay đổi phải NHỚ mới đúng — thứ đó sớm muộn cũng có người quên.
   * ⛔ ĐỪNG đổi thành `?? ` — chuỗi RỖNG phải rơi về `.next`, chứ không được thành thư mục ''.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Web NỘI BỘ — không cho công cụ tìm kiếm đánh chỉ mục.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
