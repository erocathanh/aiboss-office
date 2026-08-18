/** @type {import('next').NextConfig} */
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
