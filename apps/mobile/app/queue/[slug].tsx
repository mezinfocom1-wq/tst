import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { api } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { Ticket } from '../../src/Ticket';
import { Button, Chips, Loading, Notice, Screen, Subtitle, Title, useAction, useApi } from '../../src/ui';

function Join() {
  const { locale, t } = useI18n();
  const { slug, qr } = useLocalSearchParams<{ slug: string; qr?: string }>();
  const { data: salon } = useApi<any>(`/salons/${slug}`);
  const { data: mine, reload } = useApi<any[]>('/queue/tickets');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const qs = new URLSearchParams({ ...(serviceId ? { serviceId } : {}), ...(staffId ? { staffId } : {}) }).toString();
  const { data: status } = useApi<any>(salon ? `/salons/${salon.id}/queue?${qs}` : null, 20_000);
  const action = useAction();
  if (!salon || !mine) return <Loading />;
  const current = mine.find((x) => x.salon.id === salon.id && ['WAITING', 'CALLED', 'IN_SERVICE'].includes(x.status));
  if (current) return <Ticket ticketId={current.id} onChange={reload} />;
  if (!salon.queueEnabled) return <Notice tone="info">{t('Ce salon n’utilise pas la file d’attente. Vous pouvez réserver un rendez-vous.')}</Notice>;
  return (
    <>
      {status?.enabled && (
        <Notice tone="brand">
          {t('{n} personne(s) en attente', { n: status.waiting })} · {status.estimatedWaitMin == null ? t('Plus de disponibilité aujourd’hui') : t('Attente estimée : environ {n} min', { n: status.estimatedWaitMin })}
        </Notice>
      )}
      {salon.queueOnsiteOnly && !qr && <Notice tone="warn">{t('Ce salon réserve la file aux clients sur place : scannez le QR Code affiché dans le salon.')}</Notice>}
      <Subtitle>{t('Prestation')}</Subtitle>
      <Chips value={serviceId} onChange={(v) => { setServiceId(v); setStaffId(''); }}
        options={salon.services.map((s: any) => ({ value: s.id, label: s.name, hint: `${s.durationMin} min · ${fmt.mad(s.priceMad, locale)}` }))} />
      <Subtitle>{t('Professionnel')}</Subtitle>
      <Chips value={staffId} onChange={setStaffId} options={[{ value: '', label: t('Peu importe') },
        ...salon.staff.filter((m: any) => !serviceId || m.serviceIds.includes(serviceId)).map((m: any) => ({ value: m.id, label: m.displayName }))]} />
      {action.error && <Notice>{action.error}</Notice>}
      <Button variant="brand" title={t('Prendre mon ticket')} disabled={!serviceId} busy={action.busy} onPress={() => action.run(async () => {
        await api(`/salons/${salon.id}/queue/join`, { body: { serviceId, ...(staffId ? { staffId } : {}), ...(qr ? { qrToken: qr } : {}) } });
        await reload();
      })} />
    </>
  );
}

export default function Queue() {
  const { t } = useI18n();
  return <Screen><Title>{t('File d’attente')}</Title><RequireLogin message={t('Connectez-vous pour prendre un ticket')}><Join /></RequireLogin></Screen>;
}
