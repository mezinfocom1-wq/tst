'use client';
import { Suspense, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Alert, Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { COMPLAINT_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

function Complaints() {
  const { locale, t } = useI18n();
  const { data, reload } = useApi<any[]>('/me/complaints');
  const [form, setForm] = useState({ subject: '', message: '' });
  const action = useAction();
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <Field label={t('Objet')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={150} /></Field>
        <Field label={t('Votre message')}><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={4000} className="min-h-32" /></Field>
        {action.error && <Alert>{action.error}</Alert>}
        <Button busy={action.busy} disabled={form.subject.length < 3 || form.message.length < 10}
          onClick={() => action.run(async () => { await api('/complaints', { body: form }); setForm({ subject: '', message: '' }); await reload(); })}>{t('Envoyer')}</Button>
      </Card>
      {!data ? <Spinner /> : data.map((c) => (
        <Card key={c.id} className="space-y-2 p-5">
          <div className="flex items-center justify-between gap-3"><p className="font-medium">{c.subject}</p><Badge tone={COMPLAINT_STATUS[c.status][1]}>{t(COMPLAINT_STATUS[c.status][0])}</Badge></div>
          <p className="whitespace-pre-line text-sm text-ink-soft">{c.message}</p>
          <p className="text-xs text-muted">{fmt.dateTime(c.createdAt, locale)}</p>
          {c.adminReply && <Alert tone="info">{c.adminReply}</Alert>}
        </Card>
      ))}
    </div>
  );
}

export default function SupportPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold">{t('Réclamation')}</h1>
      <p className="mb-6 mt-2 text-ink-soft">{t('Un problème avec une réservation, un salon ou votre compte ? Écrivez-nous.')}</p>
      <Suspense fallback={<Spinner />}><LoginGate><Complaints /></LoginGate></Suspense>
    </div>
  );
}
