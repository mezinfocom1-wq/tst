'use client';
import { ChevronLeft, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LoginGate } from '@/components/LoginGate';
import { QueueStatus } from '@/components/QueueStatus';
import { TicketCard } from '@/components/TicketCard';
import { Alert, Button, Card, Field, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { fmt } from '@/lib/translate';
import type { SalonDetail } from '@/lib/types';

function Join() {
  const { locale, t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  const qrToken = useSearchParams().get('qr') ?? undefined;
  const { data: salon, loading } = useApi<SalonDetail>(`/salons/${slug}`);
  const { data: mine, reload } = useApi<any[]>('/queue/tickets');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const action = useAction();

  if (loading || !mine) return <Spinner />;
  if (!salon) return <Alert>{t('Salon introuvable')}</Alert>;
  const current = mine.find((x) => x.salon.id === salon.id && ['WAITING', 'CALLED', 'IN_SERVICE'].includes(x.status));
  if (current) return <div className="mx-auto max-w-md"><TicketCard ticketId={current.id} onChange={reload} /></div>;
  if (!salon.queueEnabled) return <Alert tone="info">{t('Ce salon n’utilise pas la file d’attente. Vous pouvez réserver un rendez-vous.')}</Alert>;

  return (
    <Card className="mx-auto max-w-md space-y-5 p-6">
      <QueueStatus salonId={salon.id} serviceId={serviceId || undefined} staffId={staffId || undefined} />
      {salon.queueOnsiteOnly && !qrToken && <Alert tone="warn">{t('Ce salon réserve la file aux clients sur place : scannez le QR Code affiché dans le salon.')}</Alert>}
      <Field label={t('Prestation')}>
        <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStaffId(''); }}>
          <option value="">{t('Choisir…')}</option>
          {salon.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {fmt.mad(s.priceMad, locale)}</option>)}
        </Select>
      </Field>
      <Field label={t('Professionnel')} hint={t('« Peu importe » vous attribue le premier professionnel disponible.')}>
        <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">{t('Peu importe')}</option>
          {salon.staff.filter((m) => !serviceId || m.serviceIds.includes(serviceId)).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
        </Select>
      </Field>
      {action.error && <Alert>{action.error}</Alert>}
      <Button className="w-full" size="lg" variant="brand" disabled={!serviceId} busy={action.busy}
        onClick={() => action.run(async () => { await api(`/salons/${salon.id}/queue/join`, { body: { serviceId, ...(staffId ? { staffId } : {}), ...(qrToken ? { qrToken } : {}) } }); await reload(); })}>
        <Ticket className="size-5" />{t('Prendre mon ticket')}
      </Button>
    </Card>
  );
}

export default function QueuePage() {
  const { locale, t } = useI18n();
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href={`/${locale}/salons/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft className="size-4 rtl:rotate-180" />{t('Retour au salon')}</Link>
      <h1 className="mb-6 text-center text-3xl font-semibold">{t('File d’attente')}</h1>
      <Suspense fallback={<Spinner />}>
        <LoginGate message={t('Connectez-vous pour prendre un ticket')}><Join /></LoginGate>
      </Suspense>
    </div>
  );
}
