'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Textarea, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { APPLICATION_STATUS, CITIES } from '@/lib/labels';

function Application() {
  const { locale, t } = useI18n();
  const { user, reload: reloadUser } = useAuth();
  const { data, loading, reload } = useApi<any>('/pro-application');
  const [form, setForm] = useState({ businessName: '', city: 'Casablanca', phone: user?.phone ?? '', profession: 'BARBER', message: '' });
  const action = useAction();

  if (user!.role === 'PROFESSIONAL') {
    return <Card className="p-6 text-center"><p className="font-medium">{t('Votre accès professionnel est actif.')}</p><Link href={`/${locale}/pro`} className={`${buttonClass('primary')} mt-4`}>{t('Ouvrir mon espace')}</Link></Card>;
  }
  if (loading) return <Spinner />;
  const editable = !data || ['REJECTED', 'INFO_REQUESTED'].includes(data.status);

  return (
    <div className="space-y-5">
      {data && (
        <Card className="space-y-2 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{data.businessName} · {data.city}</p>
            <Badge tone={APPLICATION_STATUS[data.status][1]}>{t(APPLICATION_STATUS[data.status][0])}</Badge>
          </div>
          {data.status === 'PENDING' && <p className="text-sm text-muted">{t('Votre demande est en cours d’examen. Vous recevrez un email dès qu’elle sera traitée.')}</p>}
          {data.adminNote && <Alert tone={data.status === 'REJECTED' ? 'danger' : 'info'}>{data.adminNote}</Alert>}
          {data.status === 'APPROVED' && <Button onClick={async () => { await api('/auth/refresh', { method: 'POST', body: {} }).catch(() => {}); await reloadUser(); }}>{t('Ouvrir mon espace')}</Button>}
        </Card>
      )}
      {editable && (
        <Card className="space-y-4 p-6">
          {!user!.emailVerified && <Alert tone="warn">{t('Confirmez votre adresse email avant de déposer une demande (lien reçu par email, ou depuis votre profil).')}</Alert>}
          <Field label={t('Nom du salon')}><Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} maxLength={100} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Ville')}><Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>{CITIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label={t('Téléphone')} hint="06XXXXXXXX"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" /></Field>
          </div>
          <Field label={t('Votre métier')}>
            <Select value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })}>
              <option value="BARBER">{t('Barbier')}</option><option value="HAIRDRESSER">{t('Coiffeur / Coiffeuse')}</option><option value="STYLIST">{t('Styliste')}</option>
            </Select>
          </Field>
          <Field label={t('Présentez votre activité (facultatif)')}><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={1000} /></Field>
          {action.error && <Alert>{action.error}</Alert>}
          <Button busy={action.busy} disabled={!form.businessName || !form.phone}
            onClick={() => action.run(async () => { await api('/pro-application', { body: { ...form, message: form.message || undefined } }); await reload(); })}>{t('Envoyer ma demande')}</Button>
        </Card>
      )}
    </div>
  );
}

export default function BecomeProPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{t('Devenir professionnel')}</h1>
      <p className="mb-6 mt-2 text-ink-soft">{t('Chaque demande est vérifiée par notre équipe avant l’ouverture de l’espace professionnel.')}</p>
      <Suspense fallback={<Spinner />}><LoginGate message={t('Créez un compte ou connectez-vous pour déposer votre demande')}><Application /></LoginGate></Suspense>
    </div>
  );
}
