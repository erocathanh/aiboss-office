import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import {
  UI_LANGUAGE_COOKIE_KEY,
  resolveServerUiLanguage,
  setCurrentUiLanguage,
  t,
  type UiLanguage,
} from '@/i18n/core';
import { UiLanguageProvider } from '@/i18n';
import './globals.css';

async function detectRequestUiLanguage(): Promise<UiLanguage> {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const cookieValue = cookieStore.get(UI_LANGUAGE_COOKIE_KEY)?.value ?? null;
    const acceptLanguage = headerStore.get('accept-language');
    return resolveServerUiLanguage({ cookieValue, acceptLanguage });
  } catch {
    return resolveServerUiLanguage();
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const initialLang = await detectRequestUiLanguage();
  return {
    title: t('electron.windowTitle', undefined, initialLang),
    description: 'Autonomous AI operations workspace and management interface.',
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a1929',
};

export default async function BoCucGoc({ children }: { children: React.ReactNode }) {
  const initialLang = await detectRequestUiLanguage();
  setCurrentUiLanguage(initialLang);

  return (
    <html lang={initialLang} data-ui-lang={initialLang} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var v=localStorage.getItem('aiboss-office.text-size');var s=v==='medium'?'medium':'large';document.documentElement.setAttribute('data-text-size',s);document.documentElement.setAttribute('data-co-chu',s==='large'?'lon':'vua');}catch(e){document.documentElement.setAttribute('data-text-size','large');document.documentElement.setAttribute('data-co-chu','lon');}try{var l=localStorage.getItem('aiboss-office.ui-language');if(l==='en'||l==='vi'){document.cookie='aiboss-office.ui-language='+l+'; Path=/; Max-Age=31536000; SameSite=Lax';}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <UiLanguageProvider initialLang={initialLang}>{children}</UiLanguageProvider>
      </body>
    </html>
  );
}
