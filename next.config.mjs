/** @type {
  /**
   * 🔗 Cho phép mở trang tĩnh trong `public/` mà ⛔ KHÔNG phải gõ đuôi `/index.html`.
   *
   * 🔴 Ca thật 18/08: Owner mở `/round-3/` → 308 → `/round-3` → 404, trong khi
   *    `/round-3/index.html` trả 200. Next ở bản chạy thật ⛔ KHÔNG tự tìm index.html
   *    cho một THƯ MỤC — phải gọi đúng tên tệp. Owner ⛔ không có cách nào biết điều đó,
   *    và tôi thì gửi link kèm đuôi nên tưởng mọi thứ ổn.
   * ⇒ Viết lại đường: /round-3 và /round-3/ đều phục vụ /round-3/index.html.
   *   ⛔ Đừng dùng `trailingSlash: true` — nó đổi hành vi CẢ app (kể cả /api/*),
   *     đắt hơn nhiều so với việc chỉ sửa đúng chỗ cần.
   */
  async rewrites() {
    return [
      { source: '/round-:so', destination: '/round-:so/index.html' },
      { source: '/round-:so/', destination: '/round-:so/index.html' },
    ];
  },
import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
