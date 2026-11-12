'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmt } from '@/lib/translate';
import { Alert, Button, Modal, Spinner, cx } from './ui';

interface Target { id: string; salonId: string; serviceId: string; staffId: string; startAt: string }

/** Déplacement d'un rendez-vous par le client : même prestation, même professionnel, nouveau créneau. */
export function RescheduleModal({ target, onClose }: { target: Target | null; onClose: (moved: boolean) => void }) {
  const { locale, t } = useI18n();
  const [day, setDay] = useState(fmt.day());
  const [slots, setSlots] = useState<{ startAt: string }[] | null>(null);
  const [slot, setSlot] = useState('');
  const action = useAction();
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => fmt.day(Date.now() + i * 86_400_000)), []);

  useEffect(() => { if (target) { setDay(fmt.day(new Date(target.startAt))); setSlot(''); } }, [target]);
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setSlots(null);
    setSlot('');
    api(`/salons/${target.salonId}/availability`, { body: { date: day, items: [{ serviceId: target.serviceId, staffId: target.staffId }] } })
      .then((r) => !cancelled && setSlots(r.slots)).catch(() => !cancelled && setSlots([]));
    return () => { cancelled = true; };
  }, [target, day]);

  return (
    <Modal open={!!target} onClose={() => onClose(false)} title={t('Déplacer le rendez-vous')} wide>
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
      <div className="mt-4 min-h-24">
        {slots === null ? <Spinner /> : !slots.length ? <p className="text-sm text-muted">{t('Aucun créneau disponible ce jour-là. Essayez une autre date.')}</p> : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots.map((s) => (
              <button key={s.startAt} onClick={() => setSlot(s.startAt)}
                className={cx('rounded-xl border py-2.5 text-sm font-medium tabular-nums', slot === s.startAt ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface hover:border-brand-300')}>
                {fmt.time(s.startAt)}
              </button>
            ))}
          </div>
        )}
      </div>
      {action.error && <div className="mt-3"><Alert>{action.error}</Alert></div>}
      <Button className="mt-4 w-full" disabled={!slot} busy={action.busy}
        onClick={() => action.run(async () => { await api(`/appointments/${target!.id}/reschedule`, { body: { startAt: slot } }); onClose(true); })}>
        {slot ? t('Déplacer au {date} à {time}', { date: fmt.shortDate(slot, locale), time: fmt.time(slot) }) : t('Choisissez un créneau')}
      </Button>
    </Modal>
  );
}
