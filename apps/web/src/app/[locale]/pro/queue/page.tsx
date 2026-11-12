'use client';
import { Clock, Plus, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageTitle, Select, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { TICKET_STATUS } from '@/lib/labels';
import { usePro } from '@/lib/pro';
import { fmt } from '@/lib/translate';

function WalkIn({ open, onClose }: { open: boolean; onClose: (saved: boolean) => void }) {
  const { locale, t } = useI18n();
  const { data: services } = useApi<any[]>(open ? '/pro/services' : null);
  const { data: staff } = useApi<any[]>(open ? '/pro/staff' : null);
  const [form, setForm] = useState({ guestName: '', serviceId: '', staffId: '' });
  const action = useAction();
  return (
    <Modal open={open} onClose={() => onClose(false)} title={t('Ajouter un client de passage')}>
      <div className="space-y-4">
        <Field label={t('Nom du client')}><Input value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} maxLength={60} autoFocus /></Field>
        <Field label={t('Prestation')}>
          <Select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
            <option value="">{t('Choisir…')}</option>
            {(services ?? []).filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {fmt.mad(s.priceMad, locale)}</option>)}
          </Select>
        </Field>
        <Field label={t('Professionnel')}>
          <Select value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            <option value="">{t('Peu importe')}</option>
            {(staff ?? []).filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </Select>
        </Field>
        {action.error && <Alert>{action.error}</Alert>}
        <Button className="w-full" busy={action.busy} disabled={!form.guestName || !form.serviceId}
          onClick={() => action.run(async () => { await api('/pro/queue', { body: { guestName: form.guestName, serviceId: form.serviceId, ...(form.staffId ? { staffId: form.staffId } : {}) } }); onClose(true); })}>{t('Ajouter à la file')}</Button>
      </div>
    </Modal>
  );
}

export default function QueueBoard() {
  const { t } = useI18n();
  const { salon } = usePro();
  const { data, reload } = useApi<any>('/pro/queue', 20_000);
  const [adding, setAdding] = useState(false);
  const action = useAction();

  useEffect(() => {
    const source = new EventSource(`/api/salons/${salon.id}/queue/stream`);
    source.addEventListener('update', () => reload());
    return () => source.close();
  }, [salon.id, reload]);

  const act = (path: string, body?: object) => action.run(async () => { await api(`/pro/queue/${path}`, { method: 'POST', body }); await reload(); });
  /** Appelle le suivant ; si la prestation empiète sur un rendez-vous, demande une confirmation explicite. */
  const call = (staffId: string, ticketId?: string) => action.run(async () => {
    try {
      await api('/pro/queue/call', { body: { staffId, ticketId } });
    } catch (e) {
      if ((e as ApiError).code !== 'WOULD_OVERLAP_APPOINTMENT' || !confirm((e as ApiError).message)) throw e;
      await api('/pro/queue/call', { body: { staffId, ticketId, force: true } });
    }
    await reload();
  });

  if (!data) return <Spinner />;
  return (
    <>
      <PageTitle title={t('File d’attente')} subtitle={t('{n} personne(s) en attente', { n: data.waiting.length })}
        action={<Button onClick={() => setAdding(true)}><Plus className="size-4" />{t('Client de passage')}</Button>} />
      {!salon.queueEnabled && <div className="mb-4"><Alert tone="warn">{t('La file d’attente est désactivée dans les réglages du salon.')}</Alert></div>}
      {action.error && <div className="mb-4"><Alert>{action.error}</Alert></div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.staff.map((m: any) => (
          <Card key={m.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold"><UserRound className="size-4 text-muted" aria-hidden />{m.displayName}</h2>
              <Badge tone={m.current ? 'warn' : m.working ? 'ok' : 'neutral'}>{m.current ? t('Occupé') : m.working ? t('Disponible') : t('Hors horaires')}</Badge>
            </div>
            {m.current ? (
              <div className="rounded-xl bg-sand-deep p-3">
                <p className="font-medium"><span className="font-display text-xl tabular-nums text-brand-700">{String(m.current.number).padStart(3, '0')}</span> · {m.current.clientName}</p>
                <p className="text-sm text-muted">{m.current.service.name} · {t(TICKET_STATUS[m.current.status][0])}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.current.status === 'CALLED' && <Button size="sm" disabled={action.busy} onClick={() => act(`${m.current.id}/start`)}>{t('Démarrer')}</Button>}
                  {m.current.status === 'CALLED' && <Button size="sm" variant="outline" disabled={action.busy} onClick={() => act(`${m.current.id}/no-show`)}>{t('Absent')}</Button>}
                  {m.current.status === 'IN_SERVICE' && <Button size="sm" variant="brand" disabled={action.busy} onClick={() => act(`${m.current.id}/finish`)}>{t('Terminer')}</Button>}
                </div>
              </div>
            ) : (
              <Button variant="brand" disabled={action.busy || !data.waiting.length} onClick={() => call(m.id)}>{t('Appeler le suivant')}</Button>
            )}
            {m.nextAppointmentAt && <p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="size-3.5" aria-hidden />{t('Prochain rendez-vous à {time}', { time: fmt.time(m.nextAppointmentAt) })}</p>}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{t('En attente')}</h2>
      {!data.waiting.length ? <Empty title={t('La file est vide')} /> : (
        <div className="space-y-2">
          {data.waiting.map((x: any) => (
            <Card key={x.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="font-display text-3xl font-semibold tabular-nums text-brand-700">{String(x.number).padStart(3, '0')}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{x.clientName}{x.clientPhone ? <span className="ms-2 text-sm font-normal text-muted" dir="ltr">{x.clientPhone}</span> : null}</p>
                <p className="text-sm text-muted">{x.service.name} · {x.staff ? x.staff.displayName : t('Peu importe')} · {t('arrivé à {time}', { time: fmt.time(x.joinedAt) })}</p>
              </div>
              <div className="text-end text-sm">
                <p className="font-medium tabular-nums">{x.estimate?.estimatedWaitMin != null ? `≈ ${x.estimate.estimatedWaitMin} min` : t('Après la fermeture')}</p>
                <p className="text-xs text-muted">{t('attente estimée')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select className="h-9 w-auto" value="" disabled={action.busy} onChange={(e) => e.target.value && call(e.target.value, x.id)} aria-label={t('Appeler pour')}>
                  <option value="">{t('Appeler pour…')}</option>
                  {data.staff.filter((m: any) => !m.current && (!x.staffId || x.staffId === m.id)).map((m: any) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </Select>
                <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => act(`${x.id}/no-show`)}>{t('Absent')}</Button>
                <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => confirm(t('Annuler ce ticket ?')) && act(`${x.id}/cancel`)}>{t('Annuler')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!!data.history.length && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">{t('Tickets traités aujourd’hui ({n})', { n: data.history.length })}</summary>
          <div className="mt-3 space-y-2">
            {data.history.map((x: any) => (
              <div key={x.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
                <span className="w-10 font-semibold tabular-nums">{String(x.number).padStart(3, '0')}</span>
                <span className="min-w-0 flex-1 truncate">{x.clientName} · <span className="text-muted">{x.service.name}{x.staff ? ` — ${x.staff.displayName}` : ''}</span></span>
                <Badge tone={TICKET_STATUS[x.status][1]}>{t(TICKET_STATUS[x.status][0])}</Badge>
                {x.status === 'NO_SHOW' && salon.allowRequeue && <Button size="sm" variant="outline" disabled={action.busy} onClick={() => act(`${x.id}/requeue`)}>{t('Réintégrer')}</Button>}
              </div>
            ))}
          </div>
        </details>
      )}
      <WalkIn key={String(adding)} open={adding} onClose={(saved) => { setAdding(false); if (saved) reload(); }} />
    </>
  );
}
