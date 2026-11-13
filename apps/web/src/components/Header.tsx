'use client';
import { Bell, LayoutDashboard, LogOut, Menu, Scissors, User as UserIcon, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { buttonClass, cx } from './ui';

export function Header() {
  const { locale, t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const other = locale === 'fr' ? 'ar' : 'fr';
  const home = `/${locale}`;
  const space = user?.role === 'SUPER_ADMIN' ? `${home}/admin` : user?.role === 'PROFESSIONAL' ? `${home}/pro` : `${home}/account`;

  const switchLocale = () => {
    document.cookie = `locale=${other}; path=/; max-age=31536000; samesite=lax`;
    router.push(pathname.replace(new RegExp(`^/${locale}`), `/${other}`) + window.location.search);
  };
  const links = [
    { href: `${home}/salons`, label: t('Trouver un salon') },
    { href: `${home}/pricing`, label: t('Espace professionnel') },
  ];

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-sand/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6">
        <Link href={home} className="flex items-center gap-2 font-display text-xl font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-brand-300"><Scissors className="size-5" aria-hidden /></span>
          Salonat
        </Link>
        <nav className="hidden flex-1 items-center gap-6 text-sm md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={cx('transition hover:text-ink', pathname.startsWith(l.href) ? 'font-medium text-ink' : 'text-ink-soft')}>{l.label}</Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <button onClick={switchLocale} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-soft hover:bg-sand-deep" aria-label={t('Changer de langue')}>
            <span className="hidden sm:inline">{other === 'ar' ? 'العربية' : 'Français'}</span>
            <span className="sm:hidden">{other === 'ar' ? 'ع' : 'FR'}</span>
          </button>
          {!loading && !user && (
            <>
              <Link href={`${home}/login`} className={cx(buttonClass('ghost', 'sm'), 'hidden sm:inline-flex')}>{t('Connexion')}</Link>
              <Link href={`${home}/register`} className={cx(buttonClass('primary', 'sm'), 'hidden sm:inline-flex')}>{t('Créer un compte')}</Link>
            </>
          )}
          {user && (
            <>
              {user.role !== 'SUPER_ADMIN' && (
                <Link href={`${home}/account?tab=notifications`} className="hidden rounded-lg p-2 text-ink-soft hover:bg-sand-deep sm:block" aria-label={t('Notifications')}><Bell className="size-5" /></Link>
              )}
              <Link href={space} className={buttonClass('outline', 'sm')}>
                {user.role === 'CLIENT' ? <UserIcon className="size-4" /> : <LayoutDashboard className="size-4" />}
                <span className="hidden sm:inline">{user.role === 'CLIENT' ? user.firstName : t('Mon espace')}</span>
              </Link>
              <button onClick={async () => { await signOut(); router.push(home); }} className="rounded-lg p-2 text-ink-soft hover:bg-sand-deep" aria-label={t('Déconnexion')}>
                <LogOut className="size-5 rtl:-scale-x-100" />
              </button>
            </>
          )}
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 py-3 md:hidden">
          {[...links, ...(user ? (user.role === 'SUPER_ADMIN' ? [] : [{ href: `${home}/account?tab=notifications`, label: t('Notifications') }])
            : [{ href: `${home}/login`, label: t('Connexion') }, { href: `${home}/register`, label: t('Créer un compte') }])].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 text-sm text-ink-soft hover:bg-sand-deep">{l.label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
