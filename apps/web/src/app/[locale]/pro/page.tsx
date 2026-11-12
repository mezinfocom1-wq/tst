'use client';
import { Banknote, CalendarDays, Check, CircleAlert, Ticket, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, PageTitle, Spinner, Stat, buttonClass, cx } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { APPOINTMENT_STATUS, SALON_STATUS } from '@/lib/labels';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

export default function ProDashboard() {
  const { locale, t } = useI18n();
  const { salon } = usePro();
  const { data } = useApi<any>('/pro/dashboard', 30_000);
  const { data: appointments } = useApi<any[]>('/pro/appointments', 30_000);
  const base = `/${locale}/pro`;
  const steps = [
    { done: !!salon.description && !!salon.address, label: t('Compléter la fiche du salon'), href: `${base}/salon` },
    { done: salon.counts.services > 0, label: t('Ajouter vos prestations'), href: `${base}/services` },
    { done: !['DRAFT', 'INFO_REQUESTED', 'REJECTED'].includes(salon.status), label: t('Soumettre le salon à la validation'), href: `${base}/salon` },
    { done: salon.status === 'APPROVED', label: t('Validation par notre équipe'), href: `${base}/salon` },
    { done: !!salon.subscription, label: t('Activer votre abonnement'), href: `${base}/billing` },
  ];
  const upcoming = (appointments ?? []).filter((a) => ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status)).slice(0, 6);

  return (
    <>
      <PageTitle title={salon.name} subtitle={fmt.date(new Date(), locale)}
        action={<Badge tone={salon.published ? 'ok' : SALON_STATUS[salon.status][1]}>{salon.published ? t('Visible dans la marketplace') : t(SALON_STATUS[salon.status][0])}</Badge>} />

      {!salon.published && salon.isOwner && (
        <Card className="mb-6 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><CircleAlert className="size-5 text-warn" aria-hidden />{t('Votre salon n’est pas encore visible par les clients')}</h2>
          {salon.reviewNote && <p className="mt-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{t('Message de notre équipe')} : {salon.reviewNote}</p>}
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <li key={i}>
                <Link href={s.href} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-sand-deep">
                  <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.done ? 'bg-ok text-white' : 'bg-sand-deep text-muted')}>
                    {s.done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={s.done ? 'text-muted line-through' : 'text-ink'}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {!data ? <Spinner /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label={t('Rendez-vous aujourd’hui')} value={data.appointmentsToday} hint={t('{n} à venir', { n: data.upcomingToday })} icon={<CalendarDays className="size-5" />} />
          <Stat label={t('En attente dans la file')} value={data.waiting} icon={<Ticket className="size-5" />} />
          <Stat label={t('Clients servis aujourd’hui')} value={data.servedToday} hint={data.noShowsToday ? t('{n} absence(s)', { n: data.noShowsToday }) : undefined} icon={<UserCheck className="size-5" />} />
          <Stat label={t('Recette du jour')} value={fmt.mad(data.revenueToday, locale)} icon={<Banknote className="size-5" />} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t('Prochains rendez-vous')}</h2>
            <Link href={`${base}/agenda`} className="text-sm font-medium text-brand-700 hover:underline">{t('Planning')}</Link>
          </div>
          {!upcoming.length ? <p className="text-sm text-muted">{t('Aucun rendez-vous à venir aujourd’hui.')}</p> : (
            <ul className="divide-y divide-line">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-12 font-semibold tabular-nums">{fmt.time(a.startAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{a.clientName} · <span className="text-muted">{a.service.name} — {a.staff.displayName}</span></span>
                  <Badge tone={APPOINTMENT_STATUS[a.status][1]}>{t(APPOINTMENT_STATUS[a.status][0])}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">{t('File d’attente')}</h2>
            <p className="mt-1 text-sm text-muted">{t('Appelez le client suivant, ajoutez un client de passage et suivez les temps d’attente.')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/queue`} className={buttonClass('brand')}><Ticket className="size-4" />{t('Ouvrir la file')}</Link>
            <Link href={`${base}/salon#qr`} className={buttonClass('outline')}>{t('QR Code du salon')}</Link>
          </div>
          {data?.pendingRedemptions > 0 && (
            <Link href={`${base}/loyalty`} className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">
              <UserX className="hidden" aria-hidden />{t('{n} bon(s) de fidélité à valider', { n: data.pendingRedemptions })}
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}
