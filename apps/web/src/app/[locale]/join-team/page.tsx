'use client';
import { UsersRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

function Invite() {
  const { locale, t } = useI18n();
  const { user, reload } = useAuth();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { data, error, loading } = useApi<{ salon: string; displayName: string; email: string }>(`/team-invites/${encodeURIComponent(token)}`);
  const action = useAction();
  if (loading) return <Spinner />;
  if (!data) return <Alert>{error?.message ?? t('Invitation invalide ou expirée')}</Alert>;
  const wrongAccount = user!.email.toLowerCase() !== data.email;
  return (
    <Card className="space-y-4 p-7 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><UsersRound className="size-6" aria-hidden /></span>
      <h1 className="text-2xl font-semibold">{t('Rejoindre {salon}', { salon: data.salon })}</h1>
      <p className="text-sm text-ink-soft">{t('Vous êtes invité à gérer votre planning et la file d’attente en tant que {name}.', { name: data.displayName })}</p>
      {wrongAccount && <Alert tone="warn">{t('Cette invitation est destinée à {email}. Connectez-vous avec cette adresse pour l’accepter.', { email: data.email })}</Alert>}
      {!wrongAccount && !user!.emailVerified && <Alert tone="warn">{t('Confirmez votre adresse email avant d’accepter l’invitation (lien reçu à l’inscription, ou depuis votre profil).')}</Alert>}
      {action.error && <Alert>{action.error}</Alert>}
      <Button className="w-full" size="lg" busy={action.busy} disabled={wrongAccount}
        onClick={() => action.run(async () => { await api('/team-invites/accept', { body: { token } }); await reload(); router.push(`/${locale}/pro`); })}>{t('Accepter l’invitation')}</Button>
    </Card>
  );
}

export default function JoinTeamPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Suspense fallback={<Spinner />}><LoginGate message={t('Connectez-vous ou créez un compte avec l’adresse qui a reçu l’invitation')}><Invite /></LoginGate></Suspense>
    </div>
  );
}
