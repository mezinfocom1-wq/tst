'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { User, useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Alert, Button, Card, Field, Input } from './ui';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card className="p-7">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}

/** Destination après connexion : la page demandée (chemin interne uniquement) ou l'espace du rôle. */
function useAfterAuth() {
  const router = useRouter();
  const { locale } = useI18n();
  const next = useSearchParams().get('next');
  return (user: User) => {
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    router.push(safe ?? `/${locale}/${user.role === 'SUPER_ADMIN' ? 'admin' : user.role === 'PROFESSIONAL' ? 'pro' : 'account'}`);
  };
}

/** Bouton « Continuer avec Google », affiché uniquement si la connexion Google est configurée côté API. */
function GoogleButton({ onSession }: { onSession: (s: { accessToken: string; user: User }) => void }) {
  const { locale } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api('/auth/config').then((c) => setClientId(c.googleClientId)).catch(() => {}); }, []);
  useEffect(() => {
    if (!clientId) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const google = (window as any).google;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (res: { credential: string }) => {
          try { onSession(await api('/auth/google', { body: { idToken: res.credential, locale } })); } catch (e) { setError((e as Error).message); }
        },
      });
      if (el.current) google.accounts.id.renderButton(el.current, { theme: 'outline', size: 'large', width: 340, locale });
    };
    document.head.appendChild(script);
    return () => script.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!clientId) return null;
  return (
    <div className="mt-5 border-t border-line pt-5">
      <div ref={el} className="flex justify-center" />
      {error && <p className="mt-2 text-center text-sm text-danger">{error}</p>}
    </div>
  );
}

export function LoginForm() {
  const { locale, t } = useI18n();
  const { signIn } = useAuth();
  const after = useAfterAuth();
  const qs = useSearchParams().toString();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  const done = (s: { accessToken: string; user: User }) => { signIn(s); after(s.user); };

  return (
    <AuthShell title={t('Connexion')} subtitle={t('Heureux de vous revoir.')}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); action.run(async () => done(await api('/auth/login', { body: { email, password } }))); }}>
        <Field label={t('Adresse email')}><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field>
        <Field label={t('Mot de passe')}><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" /></Field>
        {action.error && <Alert>{action.error}</Alert>}
        <Button type="submit" className="w-full" busy={action.busy}>{t('Se connecter')}</Button>
      </form>
      <GoogleButton onSession={done} />
      <div className="mt-5 flex justify-between text-sm">
        <Link href={`/${locale}/forgot-password`} className="text-muted hover:text-ink">{t('Mot de passe oublié ?')}</Link>
        <Link href={`/${locale}/register${qs ? `?${qs}` : ''}`} className="font-medium text-brand-700 hover:underline">{t('Créer un compte')}</Link>
      </div>
    </AuthShell>
  );
}

export function RegisterForm() {
  const { locale, t } = useI18n();
  const { signIn } = useAuth();
  const after = useAfterAuth();
  const qs = useSearchParams().toString();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const action = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const done = (s: { accessToken: string; user: User }) => { signIn(s); after(s.user); };

  return (
    <AuthShell title={t('Créer un compte')} subtitle={t('Réservez et suivez votre file d’attente en quelques secondes.')}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        action.run(async () => done(await api('/auth/register', { body: { ...form, phone: form.phone || undefined, locale } })));
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Prénom')}><Input required value={form.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={60} /></Field>
          <Field label={t('Nom')}><Input required value={form.lastName} onChange={set('lastName')} autoComplete="family-name" maxLength={60} /></Field>
        </div>
        <Field label={t('Adresse email')}><Input type="email" required value={form.email} onChange={set('email')} autoComplete="email" dir="ltr" /></Field>
        <Field label={t('Téléphone (facultatif)')} hint="06XXXXXXXX"><Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" dir="ltr" /></Field>
        <Field label={t('Mot de passe')} hint={t('8 caractères minimum')}><Input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" dir="ltr" /></Field>
        {action.error && <Alert>{action.error}</Alert>}
        <Button type="submit" className="w-full" busy={action.busy}>{t('Créer mon compte')}</Button>
        <p className="text-xs text-muted">
          {t('En créant un compte, vous acceptez notre')} <Link href={`/${locale}/legal/privacy`} className="underline">{t('politique de confidentialité')}</Link>.
        </p>
      </form>
      <GoogleButton onSession={done} />
      <p className="mt-5 text-center text-sm text-muted">
        {t('Déjà inscrit ?')} <Link href={`/${locale}/login${qs ? `?${qs}` : ''}`} className="font-medium text-brand-700 hover:underline">{t('Connexion')}</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction();
  return (
    <AuthShell title={t('Mot de passe oublié')} subtitle={t('Recevez un lien pour choisir un nouveau mot de passe.')}>
      {sent ? <Alert tone="ok">{t('Si un compte existe avec cette adresse, un email vient de lui être envoyé.')}</Alert> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); action.run(async () => { await api('/auth/forgot-password', { body: { email } }); setSent(true); }); }}>
          <Field label={t('Adresse email')}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field>
          {action.error && <Alert>{action.error}</Alert>}
          <Button type="submit" className="w-full" busy={action.busy}>{t('Envoyer le lien')}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetForm() {
  const { locale, t } = useI18n();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  return (
    <AuthShell title={t('Nouveau mot de passe')}>
      {done ? (
        <>
          <Alert tone="ok">{t('Mot de passe modifié. Vous pouvez vous connecter.')}</Alert>
          <Link href={`/${locale}/login`} className="mt-4 block text-center font-medium text-brand-700 hover:underline">{t('Connexion')}</Link>
        </>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); action.run(async () => { await api('/auth/reset-password', { body: { token, password } }); setDone(true); }); }}>
          <Field label={t('Nouveau mot de passe')} hint={t('8 caractères minimum')}><Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" /></Field>
          {action.error && <Alert>{action.error}</Alert>}
          <Button type="submit" className="w-full" busy={action.busy}>{t('Enregistrer')}</Button>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmail() {
  const { locale, t } = useI18n();
  const { reload } = useAuth();
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api('/auth/verify-email', { body: { token } }).then(async () => { setState('ok'); await reload(); }).catch(() => setState('error'));
  }, [token, reload]);
  return (
    <AuthShell title={t('Vérification de l’adresse email')}>
      {state === 'pending' && <p className="text-sm text-muted">{t('Vérification en cours…')}</p>}
      {state === 'ok' && <Alert tone="ok">{t('Votre adresse email est confirmée.')}</Alert>}
      {state === 'error' && <Alert>{t('Lien invalide ou expiré. Demandez un nouveau lien depuis votre profil.')}</Alert>}
      <Link href={`/${locale}/account`} className="mt-4 block text-center font-medium text-brand-700 hover:underline">{t('Mon compte')}</Link>
    </AuthShell>
  );
}
