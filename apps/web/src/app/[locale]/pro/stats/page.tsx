'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BarChart, BarList } from '@/components/charts';
import { Card, PageTitle, Select, Spinner, Stat, buttonClass } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmt } from '@/lib/translate';

export default function Stats() {
  const { locale, t } = useI18n();
  const [days, setDays] = useState(30);
  const { data, error, loading } = useApi<any>(`/pro/stats?days=${days}`);
  const mad = (n: number) => fmt.mad(n, locale);

  if (loading) return <Spinner />;
  if (error?.code === 'PLAN_FEATURE') {
    return (
      <>
        <PageTitle title={t('Statistiques')} />
        <Card className="p-8 text-center">
          <p className="font-medium">{t('Les statistiques sont incluses à partir de la formule Pro.')}</p>
          <Link href={`/${locale}/pro/billing`} className={`${buttonClass('brand')} mt-4`}>{t('Voir les formules')}</Link>
        </Card>
      </>
    );
  }
  if (!data) return null;
  // Série continue : un jour sans activité apparaît à zéro plutôt que de disparaître de l'axe.
  const byDay = new Map<string, any>(data.series.map((s: any) => [s.day, s]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = fmt.day(Date.now() - (days - 1 - i) * 86_400_000);
    return { day, label: `${day.slice(8)}/${day.slice(5, 7)}`, visits: byDay.get(day)?.visits ?? 0, revenueMad: byDay.get(day)?.revenueMad ?? 0 };
  });

  return (
    <>
      <PageTitle title={t('Statistiques')} action={
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto" aria-label={t('Période')}>
          {[7, 30, 90].map((n) => <option key={n} value={n}>{t('{n} derniers jours', { n })}</option>)}
        </Select>
      } />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('Chiffre d’affaires')} value={mad(data.totals.revenueMad)} />
        <Stat label={t('Clients servis')} value={data.totals.visits} hint={t('{a} rendez-vous · {b} tickets', { a: data.totals.appointments, b: data.totals.queueTickets })} />
        <Stat label={t('Taux d’absence')} value={`${data.totals.noShowRate} %`} hint={t('{n} absence(s), {c} annulation(s)', { n: data.totals.noShows, c: data.totals.cancellations })} />
        <Stat label={t('Note moyenne')} value={data.totals.ratingAvg ?? '—'} hint={t('{n} avis', { n: data.totals.reviews })} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5"><h2 className="mb-5 font-semibold">{t('Clients servis par jour')}</h2><BarChart title={t('Clients servis par jour')} data={series.map((s) => ({ label: s.label, value: s.visits }))} /></Card>
        <Card className="p-5"><h2 className="mb-5 font-semibold">{t('Chiffre d’affaires par jour')}</h2><BarChart title={t('Chiffre d’affaires par jour')} format={mad} data={series.map((s) => ({ label: s.label, value: s.revenueMad }))} /></Card>
        <Card className="p-5">
          <h2 className="mb-5 font-semibold">{t('Prestations les plus demandées')}</h2>
          {data.topServices.length ? <BarList data={data.topServices.map((s: any) => ({ label: s.name, value: s.visits, hint: mad(s.revenueMad) }))} /> : <p className="text-sm text-muted">{t('Pas encore de données sur cette période.')}</p>}
        </Card>
        {data.advanced ? (
          <>
            <Card className="p-5">
              <h2 className="mb-5 font-semibold">{t('Chiffre d’affaires par professionnel')}</h2>
              <BarList format={mad} data={data.advanced.byStaff.map((s: any) => ({ label: s.name, value: s.revenueMad, hint: t('{n} clients', { n: s.visits }) }))} />
            </Card>
            <Card className="p-5">
              <h2 className="mb-5 font-semibold">{t('Affluence par heure')}</h2>
              <BarChart title={t('Affluence par heure')} data={Array.from({ length: 16 }, (_, i) => i + 7).map((h) => ({ label: `${h}h`, value: data.advanced.byHour.find((x: any) => x.hour === h)?.visits ?? 0 }))} />
            </Card>
            <Stat label={t('Attente moyenne dans la file')} value={data.advanced.avgWaitMin != null ? `${data.advanced.avgWaitMin} min` : '—'} />
          </>
        ) : (
          <Card className="flex flex-col items-start justify-center gap-3 p-5">
            <p className="font-medium">{t('Statistiques avancées')}</p>
            <p className="text-sm text-muted">{t('Chiffre d’affaires par professionnel, affluence par heure et attente moyenne : inclus dans la formule Business.')}</p>
            <Link href={`/${locale}/pro/billing`} className={buttonClass('outline', 'sm')}>{t('Voir les formules')}</Link>
          </Card>
        )}
      </div>
    </>
  );
}
