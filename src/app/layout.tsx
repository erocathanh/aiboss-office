import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIBOSS.VN — Phòng ban AI',
  description: 'Nói chuyện thật với trợ lý AI qua trình duyệt.',
  robots: { index: false, follow: false }, // web NỘI BỘ
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1929',
};

export default function BoCucGoc({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
