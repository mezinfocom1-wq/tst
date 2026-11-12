import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { AuthProvider } from '@/lib/auth';
import { I18nProvider } from '@/lib/i18n';
import { LOCALES, dirOf, isLocale, translate } from '@/lib/translate';
import '../globals.css';

export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }));
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#17130f' };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = translate(isLocale(locale) ? locale : 'fr');
  return {
    title: { default: `Salonat — ${t('Coiffeurs et barbiers près de chez vous')}`, template: '%s — Salonat' },
    description: t('Réservez un rendez-vous ou prenez un ticket de file d’attente dans les meilleurs salons du Maroc.'),
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body className="flex min-h-screen flex-col">
        <I18nProvider locale={locale}>
          <AuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
