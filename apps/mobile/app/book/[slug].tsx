import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { colors } from '../../src/theme';
import { Button, Card, Chips, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useAction, useApi } from '../../src/ui';

interface Slot { startAt: string; endAt: string }
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) | 8) | 0).toString(16));

function Wizard() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: salon } = useApi<any>(`/salons/${slug}`);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [day, setDay] = useState(fmt.day());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState('');
  const [done, setDone] = useState<any>(null);
  const [idempotencyKey] = useState(uuid);
  const action = useAction();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => fmt.day(Date.now() + i * 86_400_000)), []);

  useEffect(() => {
    setSlot('');
    if (!salon || !serviceId) return setSlots(null);
    let cancelled = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/salons/${salon.id}/availability`, { body: { date: day, items: [{ serviceId, ...(staffId ? { staffId } : {}) }] } })
      .then((r) => !cancelled && setSlots(r.slots)).catch(() => !cancelled && setSlots([]));
    return () => { cancelled = true; };
  }, [salon?.id, serviceId, staffId, day]);

  if (!salon) return <Loading />;
  if (done) {
    const a = done.appointments[0];
    return (
      <Card style={{ gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ok }}>{t('Réservation confirmée')}</Text>
        <Text style={styles.text}>{salon.name}</Text>
        <Muted>{fmt.date(a.startAt, locale)} · {fmt.time(a.startAt)}</Muted>
        <Muted>{a.service.name} — {a.staff.displayName} · {fmt.mad(done.totalPriceMad, locale)} ({t('à régler au salon')})</Muted>
        <Button title={t('Voir mes rendez-vous')} onPress={() => router.replace('/(client)/activity')} />
      </Card>
    );
  }
  const service = salon.services.find((s: any) => s.id === serviceId);
  return (
    <>
      <Subtitle>{t('Prestation')}</Subtitle>
      <Chips value={serviceId} onChange={(v) => { setServiceId(v); setStaffId(''); }}
        options={salon.services.map((s: any) => ({ value: s.id, label: s.name, hint: `${s.durationMin} min · ${fmt.mad(s.priceMad, locale)}` }))} />
      <Subtitle>{t('Professionnel')}</Subtitle>
      <Chips value={staffId} onChange={setStaffId} options={[{ value: '', label: t('Peu importe') },
        ...salon.staff.filter((m: any) => !serviceId || m.serviceIds.includes(serviceId)).map((m: any) => ({ value: m.id, label: m.displayName }))]} />
      <Subtitle>{t('Date et heure')}</Subtitle>
      <Chips value={day} onChange={setDay} options={days.map((d) => {
        const date = new Date(`${d}T12:00:00Z`);
        return { value: d, label: String(date.getUTCDate()), hint: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'short', timeZone: 'UTC' }).format(date) };
      })} />
      {!serviceId ? <Muted>{t('Choisissez d’abord une prestation.')}</Muted>
        : slots === null ? <Loading />
        : !slots.length ? <Muted>{t('Aucun créneau disponible ce jour-là. Essayez une autre date.')}</Muted>
        : <Chips value={slot} onChange={setSlot} options={slots.map((s) => ({ value: s.startAt, label: fmt.time(s.startAt) }))} />}
      {service && slot && (
        <Card style={{ gap: 4 }}>
          <Text style={[styles.text, { fontWeight: '700' }]}>{t('Récapitulatif')}</Text>
          <Muted>{service.name} · {fmt.date(slot, locale)} · {fmt.time(slot)}</Muted>
          <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.text}>{t('Total')}</Text><Text style={[styles.text, { fontWeight: '700' }]}>{fmt.mad(service.priceMad, locale)}</Text></View>
        </Card>
      )}
      {action.error && <Notice>{action.error}</Notice>}
      <Button title={t('Confirmer la réservation')} disabled={!slot} busy={action.busy} onPress={() => action.run(async () => {
        setDone(await api(`/salons/${salon.id}/bookings`, { body: { startAt: slot, idempotencyKey, items: [{ serviceId, ...(staffId ? { staffId } : {}) }] } }));
      })} />
      <Muted>{t('Annulation gratuite jusqu’à {n} h avant le rendez-vous.', { n: salon.cancelMinHours })}</Muted>
    </>
  );
}

export default function Book() {
  const { t } = useI18n();
  return <Screen><Title>{t('Réserver un rendez-vous')}</Title><RequireLogin message={t('Connectez-vous pour réserver')}><Wizard /></RequireLogin></Screen>;
}
