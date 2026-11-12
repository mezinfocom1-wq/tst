'use client';
import { BarChart3, CalendarDays, CreditCard, Gift, LayoutDashboard, MessageSquare, Scissors, Store, Ticket, Users, UsersRound } from 'lucide-react';
import { Suspense, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Sidebar } from '@/components/Sidebar';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { CITIES, SALON_TYPE } from '@/lib/labels';
import { ProContext, ProSalon } from '@/lib/pro';

function CreateSalon({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', type: 'MEN', city: 'Casablanca', address: '' });
  const action = useAction();
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card className="space-y-4 p-7">
        <h1 className="text-2xl font-semibold">{t('Créez votre salon')}</h1>
        <p className="text-sm text-muted">{t('Vous pourrez compléter la fiche, ajouter vos prestations et vos horaires ensuite.')}</p>
        <Field label={t('Nom du salon')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Type de salon')}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{Object.entries(SALON_TYPE).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</Select>
          </Field>
          <Field label={t('Ville')}><Select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>{CITIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label={t('Adresse')}><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={200} /></Field>
        {action.error && <Alert>{action.error}</Alert>}
        <Button className="w-full" busy={action.busy} disabled={form.name.length < 2} onClick={() => action.run(async () => { await api('/pro/salon', { body: form }); onCreated(); })}>{t('Créer mon salon')}</Button>
      </Card>
    </div>
  );
}

function ProShell({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n();
  const { data: salon, error, loading, reload } = useApi<ProSalon>('/pro/salon');
  if (loading) return <Spinner />;
  if (error?.code === 'NO_SALON') return <CreateSalon onCreated={reload} />;
  if (!salon) return <div className="mx-auto max-w-lg p-8"><Alert>{error?.message}</Alert></div>;
  const base = `/${locale}/pro`;
  const items = [
    { href: base, label: t('Tableau de bord'), icon: LayoutDashboard },
    { href: `${base}/agenda`, label: t('Planning'), icon: CalendarDays },
    { href: `${base}/queue`, label: t('File d’attente'), icon: Ticket },
    { href: `${base}/services`, label: t('Prestations'), icon: Scissors },
    { href: `${base}/team`, label: t('Équipe et horaires'), icon: UsersRound },
    ...(salon.isOwner ? [{ href: `${base}/clients`, label: t('Clients'), icon: Users }] : []),
    { href: `${base}/reviews`, label: t('Avis'), icon: MessageSquare },
    { href: `${base}/loyalty`, label: t('Fidélité'), icon: Gift },
    ...(salon.isOwner ? [{ href: `${base}/stats`, label: t('Statistiques'), icon: BarChart3 }] : []),
    { href: `${base}/salon`, label: t('Mon salon'), icon: Store },
    ...(salon.isOwner ? [{ href: `${base}/billing`, label: t('Abonnement'), icon: CreditCard }] : []),
  ];
  return (
    <ProContext.Provider value={{ salon, reload: async () => { await reload(); } }}>
      <div className="lg:flex">
        <Sidebar items={items} base={base} />
        <div className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</div>
      </div>
    </ProContext.Provider>
  );
}

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}><LoginGate roles={['PROFESSIONAL']}><ProShell>{children}</ProShell></LoginGate></Suspense>;
}
