'use client';
import { BellRing, Clock, Users } from 'lucide-react';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { TICKET_STATUS } from '@/lib/labels';
import { fmt } from '@/lib/translate';
import { Alert, Badge, Button, Card, Spinner } from './ui';

/** Ticket numérique suivi en direct : flux SSE du salon, avec relecture périodique en secours. */
export function TicketCard({ ticketId, onChange }: { ticketId: string; onChange?: () => void }) {
  const { locale, t } = useI18n();
  const { data: ticket, reload } = useApi<any>(`/queue/tickets/${ticketId}`, 20_000);
  const action = useAction();
  const active = ticket && ['WAITING', 'CALLED', 'IN_SERVICE'].includes(ticket.status);
  const salonId = ticket?.salon.id;

  useEffect(() => {
    if (!salonId || !active) return;
    const source = new EventSource(`/api/salons/${salonId}/queue/stream`);
    source.addEventListener('update', () => reload());
    return () => source.close();
  }, [salonId, active, reload]);

  if (!ticket) return <Spinner />;
  const [label, tone] = TICKET_STATUS[ticket.status];
  const e = ticket.estimate;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 bg-ink px-5 py-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/60">{t('Ticket')}</p>
          <p className="font-display text-5xl font-semibold tabular-nums text-brand-300">{String(ticket.number).padStart(3, '0')}</p>
        </div>
        <div className="text-end">
          <p className="font-medium">{ticket.salon.name}</p>
          <p className="text-sm text-white/60">{ticket.service.name}</p>
          <div className="mt-1"><Badge tone={tone}>{t(label)}</Badge></div>
        </div>
      </div>
      <div className="space-y-4 p-5">
        {ticket.status === 'CALLED' && (
          <Alert tone="brand"><span className="flex items-center gap-2 font-medium"><BellRing className="size-5" aria-hidden />{t('C’est votre tour ! Présentez-vous auprès de {name}.', { name: ticket.staff?.displayName ?? '' })}</span></Alert>
        )}
        {ticket.status === 'WAITING' && e && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-sand-deep p-3"><p className="text-2xl font-semibold tabular-nums">{e.position}</p><p className="text-xs text-muted">{t('Position')}</p></div>
            <div className="rounded-xl bg-sand-deep p-3">
              <p className="flex items-center justify-center gap-1 text-2xl font-semibold tabular-nums"><Users className="size-4 text-muted" aria-hidden />{e.peopleAhead}</p>
              <p className="text-xs text-muted">{t('Devant vous')}</p>
            </div>
            <div className="rounded-xl bg-sand-deep p-3">
              <p className="flex items-center justify-center gap-1 text-2xl font-semibold tabular-nums"><Clock className="size-4 text-muted" aria-hidden />{e.estimatedWaitMin ?? '—'}</p>
              <p className="text-xs text-muted">{t('Minutes (estimation)')}</p>
            </div>
          </div>
        )}
        {ticket.status === 'WAITING' && e?.estimatedStart && (
          <p className="text-sm text-ink-soft">{t('Passage estimé vers {time}.', { time: fmt.time(e.estimatedStart) })} {t('L’estimation se met à jour automatiquement.')}</p>
        )}
        <p className="text-sm text-muted">
          {ticket.staff ? t('Professionnel : {name}', { name: ticket.staff.displayName }) : t('Professionnel : premier disponible')} · {fmt.dateTime(ticket.joinedAt, locale)}
        </p>
        {action.error && <Alert>{action.error}</Alert>}
        {['WAITING', 'CALLED'].includes(ticket.status) && (
          <Button variant="outline" size="sm" busy={action.busy}
            onClick={() => confirm(t('Quitter la file d’attente ?')) && action.run(async () => { await api(`/queue/tickets/${ticket.id}/cancel`, { method: 'POST' }); await reload(); onChange?.(); })}>
            {t('Quitter la file')}
          </Button>
        )}
      </div>
    </Card>
  );
}
