import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AIBOSS Office — Marketing Department',
  description: 'Autonomous AI operations workspace and management interface.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1929',
};

export default function BoCucGoc({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var v=localStorage.getItem('aiboss-office.text-size');var s=v==='medium'?'medium':'large';document.documentElement.setAttribute('data-text-size',s);document.documentElement.setAttribute('data-co-chu',s==='large'?'lon':'vua');}catch(e){document.documentElement.setAttribute('data-text-size','large');document.documentElement.setAttribute('data-co-chu','lon');}try{var l=localStorage.getItem('aiboss-office.ui-language');if(l!=='en'&&l!=='vi'){var nav=(typeof navigator!=='undefined'&&navigator.language)?navigator.language:'';l=nav.toLowerCase().indexOf('vi')===0?'vi':'en';}document.documentElement.setAttribute('data-ui-lang',l);document.documentElement.lang=l;}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
