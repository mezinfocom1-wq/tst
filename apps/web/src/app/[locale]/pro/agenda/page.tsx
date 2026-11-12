'use client';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageTitle, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { APPOINTMENT_STATUS } from '@/lib/labels';
import { casablancaToIso, usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

const shift = (day: string, delta: number) => fmt.day(new Date(`${day}T12:00:00Z`).getTime() + delta * 86_400_000);

function NewAppointment({ open, onClose, day }: { open: boolean; onClose: (saved: boolean) => void; day: string }) {
  const { locale, t } = useI18n();
  const { data: services } = useApi<any[]>(open ? '/pro/services' : null);
  const { data: staff } = useApi<any[]>(open ? '/pro/staff' : null);
  const [form, setForm] = useState({ guestName: '', guestPhone: '', serviceId: '', staffId: '', date: day, time: '10:00' });
  const action = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal open={open} onClose={() => onClose(false)} title={t('Nouveau rendez-vous')}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Nom du client')}><Input value={form.guestName} onChange={set('guestName')} maxLength={60} /></Field>
          <Field label={t('Téléphone (facultatif)')}><Input type="tel" value={form.guestPhone} onChange={set('guestPhone')} dir="ltr" /></Field>
        </div>
        <Field label={t('Prestation')}>
          <Select value={form.serviceId} onChange={set('serviceId')}>
            <option value="">{t('Choisir…')}</option>
            {(services ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {fmt.mad(s.priceMad, locale)}</option>)}
          </Select>
        </Field>
        <Field label={t('Professionnel')}>
          <Select value={form.staffId} onChange={set('staffId')}>
            <option value="">{t('Peu importe')}</option>
            {(staff ?? []).filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Date')}><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label={t('Heure')}><Input type="time" step={300} value={form.time} onChange={set('time')} /></Field>
        </div>
        {action.error && <Alert>{action.error}</Alert>}
        <Button className="w-full" busy={action.busy} disabled={!form.guestName || !form.serviceId}
          onClick={() => action.run(async () => {
            await api('/pro/appointments', {
              body: {
                guestName: form.guestName, guestPhone: form.guestPhone || undefined, startAt: casablancaToIso(form.date, form.time),
                items: [{ serviceId: form.serviceId, ...(form.staffId ? { staffId: form.staffId } : {}) }],
              },
            });
            onClose(true);
          })}>{t('Enregistrer')}</Button>
      </div>
    </Modal>
  );
}

export default function Agenda() {
  const { locale, t } = useI18n();
  const { salon } = usePro();
  const [day, setDay] = useState(fmt.day());
  const [creating, setCreating] = useState(false);
  const { data, reload } = useApi<any[]>(`/pro/appointments?from=${day}&to=${day}`, 30_000);
  const action = useAction();
  const setStatus = (id: string, status: string) => action.run(async () => { await api(`/pro/appointments/${id}/status`, { body: { status } }); await reload(); });
  const staffNames = [...new Set((data ?? []).map((a) => a.staff.displayName))];

  const actions = (a: any) => {
    const list: [string, string, 'primary' | 'outline' | 'ghost'][] = [];
    if (a.status === 'CONFIRMED') list.push(['CHECKED_IN', t('Arrivé'), 'outline'], ['IN_PROGRESS', t('Démarrer'), 'primary']);
    if (a.status === 'CHECKED_IN') list.push(['IN_PROGRESS', t('Démarrer'), 'primary']);
    if (a.status === 'IN_PROGRESS') list.push(['COMPLETED', t('Terminer'), 'primary']);
    if (['CONFIRMED', 'CHECKED_IN'].includes(a.status)) list.push(['NO_SHOW', t('Absent'), 'ghost'], ['CANCELLED', t('Annuler'), 'ghost']);
    return list;
  };

  return (
    <>
      <PageTitle title={t('Planning')} action={<Button onClick={() => setCreating(true)}><Plus className="size-4" />{t('Nouveau rendez-vous')}</Button>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setDay(shift(day, -1))} aria-label={t('Jour précédent')}><ChevronLeft className="size-4 rtl:rotate-180" /></Button>
        <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 w-auto" />
        <Button variant="outline" size="sm" onClick={() => setDay(shift(day, 1))} aria-label={t('Jour suivant')}><ChevronRight className="size-4 rtl:rotate-180" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setDay(fmt.day())}>{t('Aujourd’hui')}</Button>
        <span className="ms-2 text-sm capitalize text-muted">{fmt.date(`${day}T12:00:00Z`, locale)}</span>
      </div>
      {action.error && <div className="mb-4"><Alert>{action.error}</Alert></div>}
      {!data ? <Spinner /> : !data.length ? <Empty title={t('Aucun rendez-vous ce jour-là')} /> : (
        <div className="grid gap-5 xl:grid-cols-2">
          {staffNames.map((name) => (
            <Card key={name} className="p-4">
              <h2 className="mb-3 font-semibold">{name}</h2>
              <ul className="space-y-2">
                {data.filter((a) => a.staff.displayName === name).map((a) => (
                  <li key={a.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-14 shrink-0 text-sm tabular-nums"><p className="font-semibold">{fmt.time(a.startAt)}</p><p className="text-muted">{fmt.time(a.endAt)}</p></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.clientName}</p>
                        <p className="text-sm text-muted">{a.service.name} · {fmt.mad(a.priceMad, locale)}{a.clientPhone ? <> · <span dir="ltr">{a.clientPhone}</span></> : null}</p>
                        {a.booking.note && <p className="mt-1 text-sm italic text-ink-soft">« {a.booking.note} »</p>}
                      </div>
                      <Badge tone={APPOINTMENT_STATUS[a.status][1]}>{t(APPOINTMENT_STATUS[a.status][0])}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 ps-[4.25rem]">
                      {actions(a).map(([status, label, variant]) => (
                        <Button key={status} size="sm" variant={variant} disabled={action.busy}
                          onClick={() => (status !== 'CANCELLED' || confirm(t('Annuler ce rendez-vous ?'))) && setStatus(a.id, status)}>{label}</Button>
                      ))}
                      {a.status === 'NO_SHOW' && salon.allowRequeue && salon.queueEnabled && (
                        <Button size="sm" variant="outline" disabled={action.busy}
                          onClick={() => action.run(async () => { await api(`/pro/appointments/${a.id}/to-queue`, { method: 'POST' }); await reload(); })}>{t('Replacer dans la file')}</Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <NewAppointment key={String(creating)} open={creating} day={day} onClose={(saved) => { setCreating(false); if (saved) reload(); }} />
    </>
  );
}
