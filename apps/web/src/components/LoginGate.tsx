'use client';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Card, Spinner, buttonClass } from './ui';

/** Affiche le contenu aux utilisateurs connectés (et, si précisé, au bon rôle) ; sinon propose de se connecter. */
export function LoginGate({ children, message, roles }: { children: React.ReactNode; message?: string; roles?: string[] }) {
  const { user, loading } = useAuth();
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  if (loading) return <Spinner />;
  if (user && (!roles || roles.includes(user.role))) return <>{children}</>;
  const next = encodeURIComponent(pathname + (search ? `?${search}` : ''));
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Lock className="size-6" aria-hidden /></span>
      {user ? (
        <p className="mt-4 font-medium">{t('Vous n’avez pas accès à cet espace.')}</p>
      ) : (
        <>
          <p className="mt-4 font-medium">{message ?? t('Connectez-vous pour continuer')}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Link href={`/${locale}/login?next=${next}`} className={buttonClass('primary')}>{t('Connexion')}</Link>
            <Link href={`/${locale}/register?next=${next}`} className={buttonClass('outline')}>{t('Créer un compte')}</Link>
          </div>
        </>
      )}
    </Card>
  );
}
