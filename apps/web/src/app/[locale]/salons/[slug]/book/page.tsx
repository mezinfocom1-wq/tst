'use client';
import { CalendarCheck, Check, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { Alert, Button, Card, Field, Input, Select, Spinner, Textarea, buttonClass, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmt } from '@/lib/translate';
import type { SalonDetail } from '@/lib/types';

interface Person { serviceId: string; staffId: string; personName: string }
interface Slot { startAt: string; endAt: string }

function Wizard() {
  const { locale, t } = useI18n();
  const { user, reload } = useAuth();
  const { slug } = useParams<{ slug: string }>();
  const preselected = useSearchParams().get('service') ?? '';
  const { data: salon, loading } = useApi<SalonDetail>(`/salons/${slug}`);
  const [people, setPeople] = useState<Person[]>([{ serviceId: preselected, staffId: '', personName: '' }]);
  const [mode, setMode] = useState<'CONSECUTIVE' | 'PARALLEL'>('CONSECUTIVE');
  const [day, setDay] = useState(fmt.day());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<any>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const action = useAction();

  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => fmt.day(Date.now() + i * 86_400_000)), []);
  const ready = people.every((p) => p.serviceId);
  const itemsKey = JSON.stringify(people.map((p) => [p.serviceId, p.staffId])) + mode;

  useEffect(() => {
    setSlot(null);
    if (!salon || !ready) return setSlots(null);
    let cancelled = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/salons/${salon.id}/availability`, {
      body: { date: day, mode, items: people.map((p) => ({ serviceId: p.serviceId, ...(p.staffId ? { staffId: p.staffId } : {}) })) },
    }).then((r) => !cancelled && setSlots(r.slots)).catch(() => !cancelled && setSlots([]));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon?.id, day, itemsKey, ready]);

  if (loading) return <Spinner />;
  if (!salon) return <Alert>{t('Salon introuvable')}</Alert>;

  const service = (id: string) => salon.services.find((s) => s.id === id);
  const total = people.reduce((sum, p) => sum + (service(p.serviceId)?.priceMad ?? 0), 0);
  const patch = (i: number, p: Partial<Person>) => setPeople(people.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const confirm = () => action.run(async () => {
    const booking = await api(`/salons/${salon.id}/bookings`, {
      body: {
        startAt: slot!.startAt, mode, note: note || undefined, idempotencyKey,
        items: people.map((p) => ({ serviceId: p.serviceId, ...(p.staffId ? { staffId: p.staffId } : {}), ...(p.personName ? { personName: p.personName } : {}) })),
      },
    });
    setDone(booking);
  });

  if (done) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok-soft text-ok"><Check className="size-7" aria-hidden /></span>
        <h1 className="mt-4 text-2xl font-semibold">{t('Réservation confirmée')}</h1>
        <p className="mt-2 text-ink-soft">{salon.name} · <span className="capitalize">{fmt.date(done.appointments[0].startAt, locale)}</span></p>
        <ul className="mt-5 space-y-2 text-start text-sm">
          {done.appointments.map((a: any) => (
            <li key={a.id} className="flex justify-between gap-3 rounded-xl bg-sand-deep px-4 py-3">
              <span>{a.personName ? `${a.personName} · ` : ''}{a.service.name} — {a.staff.displayName}</span>
              <span className="font-medium tabular-nums">{fmt.time(a.startAt)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-semibold">{t('Total')} : {fmt.mad(done.totalPriceMad, locale)} <span className="font-normal text-muted">({t('à régler au salon')})</span></p>
        <Link href={`/${locale}/account`} className={cx(buttonClass('primary'), 'mt-6 w-full')}>{t('Voir mes rendez-vous')}</Link>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">1. {t('Prestations')}</h2>
          <div className="space-y-4">
            {people.map((p, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
                {people.length > 1 && (
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Field label={t('Personne {n}', { n: i + 1 })}>
                      <Input value={p.personName} onChange={(e) => patch(i, { personName: e.target.value })} placeholder={i === 0 ? t('Moi') : t('Prénom (enfant, ami…)')} maxLength={60} />
                    </Field>
                    <Button variant="ghost" size="sm" onClick={() => setPeople(people.filter((_, j) => j !== i))} aria-label={t('Retirer')}><Trash2 className="size-4" /></Button>
                  </div>
                )}
                <Field label={t('Prestation')}>
                  <Select value={p.serviceId} onChange={(e) => patch(i, { serviceId: e.target.value, staffId: '' })}>
                    <option value="">{t('Choisir…')}</option>
                    {salon.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {fmt.mad(s.priceMad, locale)}</option>)}
                  </Select>
                </Field>
                <Field label={t('Professionnel')}>
                  <Select value={p.staffId} onChange={(e) => patch(i, { staffId: e.target.value })}>
                    <option value="">{t('Peu importe')}</option>
                    {salon.staff.filter((m) => !p.serviceId || m.serviceIds.includes(p.serviceId)).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                  </Select>
                </Field>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {people.length < 6 && (
              <Button variant="outline" size="sm" onClick={() => setPeople([...people, { serviceId: '', staffId: '', personName: '' }])}>
                <Plus className="size-4" />{t('Ajouter une personne')}
              </Button>
            )}
            {people.length > 1 && (
              <div className="flex gap-1 rounded-xl bg-sand-deep p-1 text-sm">
                {(['CONSECUTIVE', 'PARALLEL'] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={cx('rounded-lg px-3 py-1.5', mode === m ? 'bg-surface font-medium shadow-sm' : 'text-muted')}>
                    {m === 'CONSECUTIVE' ? t('L’un après l’autre') : t('En même temps')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold">2. {t('Date et heure')}</h2>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((d) => {
              const date = new Date(`${d}T12:00:00Z`);
              return (
                <button key={d} onClick={() => setDay(d)}
                  className={cx('flex w-16 shrink-0 flex-col items-center rounded-xl border py-2 text-sm', d === day ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-brand-300')}>
                  <span className="text-xs capitalize opacity-70">{new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'short', timeZone: 'UTC' }).format(date)}</span>
                  <span className="text-lg font-semibold tabular-nums">{date.getUTCDate()}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4">
            {!ready ? <p className="text-sm text-muted">{t('Choisissez d’abord une prestation.')}</p>
              : slots === null ? <Spinner />
              : !slots.length ? <p className="text-sm text-muted">{t('Aucun créneau disponible ce jour-là. Essayez une autre date.')}</p>
              : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {slots.map((s) => (
                    <button key={s.startAt} onClick={() => setSlot(s)}
                      className={cx('rounded-xl border py-2.5 text-sm font-medium tabular-nums', slot?.startAt === s.startAt ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface hover:border-brand-300')}>
                      {fmt.time(s.startAt)}
                    </button>
                  ))}
                </div>
              )}
          </div>
        </Card>
      </div>

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold">{t('Récapitulatif')}</h2>
        <p className="font-medium">{salon.name}</p>
        <ul className="space-y-2 text-sm">
          {people.filter((p) => p.serviceId).map((p, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-ink-soft">{p.personName ? `${p.personName} · ` : ''}{service(p.serviceId)?.name}</span>
              <span className="tabular-nums">{fmt.mad(service(p.serviceId)?.priceMad, locale)}</span>
            </li>
          ))}
        </ul>
        {slot && <p className="rounded-xl bg-sand-deep px-3 py-2 text-sm"><span className="capitalize">{fmt.date(slot.startAt, locale)}</span> · {fmt.time(slot.startAt)} – {fmt.time(slot.endAt)}</p>}
        <div className="flex justify-between border-t border-line pt-3 font-semibold"><span>{t('Total')}</span><span className="tabular-nums">{fmt.mad(total, locale)}</span></div>
        <Field label={t('Message pour le salon (facultatif)')}><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-16" /></Field>
        {user && !user.emailVerified && (
          <Alert tone="warn">
            {t('Confirmez votre adresse email pour réserver.')}{' '}
            <button className="underline" onClick={async () => { await api('/auth/resend-verification', { method: 'POST' }); await reload(); }}>{t('Renvoyer le lien')}</button>
          </Alert>
        )}
        {action.error && <Alert>{action.error}</Alert>}
        <Button className="w-full" size="lg" disabled={!slot} busy={action.busy} onClick={confirm}><CalendarCheck className="size-5" />{t('Confirmer la réservation')}</Button>
        <p className="text-xs text-muted">{t('Annulation gratuite jusqu’à {n} h avant le rendez-vous.', { n: salon.cancelMinHours })}</p>
      </Card>
    </div>
  );
}

export default function BookPage() {
  const { locale, t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href={`/${locale}/salons/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4 rtl:rotate-180" />{t('Retour au salon')}</Link>
      <h1 className="mb-6 text-3xl font-semibold">{t('Réserver un rendez-vous')}</h1>
      <Suspense fallback={<Spinner />}>
        <LoginGate message={t('Connectez-vous pour réserver')}><Wizard /></LoginGate>
      </Suspense>
    </div>
  );
}
