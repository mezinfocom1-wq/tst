'use client';
import { Banknote, CreditCard, FileCheck, MessageSquareWarning, Store, Users } from 'lucide-react';
import Link from 'next/link';
import { BarChart, BarList } from '@/components/charts';
import { Card, PageTitle, Spinner, Stat } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { SALON_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';

export default function AdminHome() {
  const { locale } = useI18n();
  const { data } = useApi<any>('/admin/stats', 60_000);
  if (!data) return <Spinner />;
  const base = `/${locale}/admin`;
  const todo = [
    { n: data.todo.pendingApplications, label: 'Demandes professionnelles à traiter', href: `${base}/applications`, icon: FileCheck },
    { n: data.todo.pendingSalons, label: 'Salons à valider', href: `${base}/salons`, icon: Store },
    { n: data.todo.paymentsToVerify, label: 'Paiements à vérifier', href: `${base}/payments`, icon: CreditCard },
    { n: data.todo.openComplaints, label: 'Réclamations ouvertes', href: `${base}/complaints`, icon: MessageSquareWarning },
  ];
  const signups = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { label: `${day.slice(8)}/${day.slice(5, 7)}`, value: data.signups.find((s: any) => s.day === day)?.count ?? 0 };
  });
  return (
    <>
      <PageTitle title="Vue d’ensemble" subtitle="Activité de la plateforme" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {todo.map((x) => (
          <Link key={x.href} href={x.href} className={`flex items-center gap-4 rounded-2xl border p-4 transition hover:border-brand-300 ${x.n ? 'border-brand-300 bg-brand-50' : 'border-line bg-surface'}`}>
            <span className="flex size-11 items-center justify-center rounded-xl bg-surface text-brand-700"><x.icon className="size-5" /></span>
            <span><span className="block text-2xl font-semibold tabular-nums">{x.n}</span><span className="text-sm text-ink-soft">{x.label}</span></span>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Abonnements actifs" value={data.subscriptions.active} icon={<CreditCard className="size-5" />} />
        <Stat label="Revenu mensuel récurrent" value={fmt.mad(data.subscriptions.monthlyRecurringMad, 'fr')} hint="Estimation ramenée à 30 jours" icon={<Banknote className="size-5" />} />
        <Stat label="Encaissé sur 30 jours" value={fmt.mad(data.last30Days.revenueMad, 'fr')} hint="Paiements validés" icon={<Banknote className="size-5" />} />
        <Stat label="Clients inscrits" value={data.users.CLIENT ?? 0} hint={`${data.users.PROFESSIONAL ?? 0} professionnels`} icon={<Users className="size-5" />} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2"><h2 className="mb-5 font-semibold">Nouvelles inscriptions par jour (30 jours)</h2><BarChart title="Nouvelles inscriptions par jour" data={signups} /></Card>
        <Card className="p-5">
          <h2 className="mb-5 font-semibold">Activité sur 30 jours</h2>
          <BarList data={[{ label: 'Rendez-vous pris', value: data.last30Days.appointments }, { label: 'Tickets de file', value: data.last30Days.tickets }]} />
          <h2 className="mb-4 mt-8 font-semibold">Abonnements par formule</h2>
          {data.subscriptions.byPlan.length ? <BarList data={data.subscriptions.byPlan.map((p: any) => ({ label: p.plan, value: p.count }))} /> : <p className="text-sm text-muted">Aucun abonnement actif.</p>}
          <h2 className="mb-4 mt-8 font-semibold">Salons par statut</h2>
          <BarList data={Object.entries(data.salons).map(([k, v]) => ({ label: SALON_STATUS[k]?.[0] ?? k, value: v as number }))} />
        </Card>
      </div>
    </>
  );
}
