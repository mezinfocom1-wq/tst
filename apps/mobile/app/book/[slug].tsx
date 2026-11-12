import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { colors } from '../../src/theme';
import { Button, Card, Chips, Field, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useAction, useApi } from '../../src/ui';

interface Slot { startAt: string; endAt: string }
interface Person { serviceId: string; staffId: string; personName: string }
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) | 8) | 0).toString(16));

function Wizard() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: salon } = useApi<any>(`/salons/${slug}`);
  const [people, setPeople] = useState<Person[]>([{ serviceId: '', staffId: '', personName: '' }]);
  const [mode, setMode] = useState<'CONSECUTIVE' | 'PARALLEL'>('CONSECUTIVE');
  const [day, setDay] = useState(fmt.day());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState('');
  const [done, setDone] = useState<any>(null);
  const [idempotencyKey] = useState(uuid);
  const action = useAction();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => fmt.day(Date.now() + i * 86_400_000)), []);

  const ready = people.every((p) => p.serviceId);
  const items = people.map((p) => ({ serviceId: p.serviceId, ...(p.staffId ? { staffId: p.staffId } : {}) }));
  const itemsKey = JSON.stringify(items) + mode;
  const patch = (i: number, p: Partial<Person>) => setPeople(people.map((x, j) => (j === i ? { ...x, ...p } : x)));

  useEffect(() => {
    setSlot('');
    if (!salon || !ready) return setSlots(null);
    let cancelled = false;
    setSlots(null);
    api<{ slots: Slot[] }>(`/salons/${salon.id}/availability`, { body: { date: day, mode, items } })
      .then((r) => !cancelled && setSlots(r.slots)).catch(() => !cancelled && setSlots([]));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon?.id, itemsKey, ready, day]);

  if (!salon) return <Loading />;
  if (done) {
    return (
      <Card style={{ gap: 10, alignItems: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ok }}>{t('Réservation confirmée')}</Text>
        <Text style={styles.text}>{salon.name}</Text>
        <Muted>{fmt.date(done.appointments[0].startAt, locale)}</Muted>
        {done.appointments.map((a: any) => (
          <Muted key={a.id}>{fmt.time(a.startAt)} · {a.personName ? `${a.personName} · ` : ''}{a.service.name} — {a.staff.displayName}</Muted>
        ))}
        <Muted>{t('Total')} : {fmt.mad(done.totalPriceMad, locale)} ({t('à régler au salon')})</Muted>
        <Button title={t('Voir mes rendez-vous')} onPress={() => router.replace('/(client)/activity')} />
      </Card>
    );
  }
  const service = (id: string) => salon.services.find((s: any) => s.id === id);
  const total = people.reduce((sum, p) => sum + (service(p.serviceId)?.priceMad ?? 0), 0);
  return (
    <>
      {people.map((p, i) => (
        <Card key={i} style={{ gap: 10 }}>
          {people.length > 1 && (
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text style={[styles.text, { fontWeight: '700' }]}>{t('Personne {n}', { n: i + 1 })}</Text>
              <Button small variant="ghost" title={t('Retirer')} onPress={() => setPeople(people.filter((_, j) => j !== i))} />
            </View>
          )}
          {people.length > 1 && <Field label={t('Prénom (enfant, ami…)')} value={p.personName} onChangeText={(v) => patch(i, { personName: v })} maxLength={60} />}
          <Text style={styles.label}>{t('Prestation')}</Text>
          <Chips value={p.serviceId} onChange={(v) => patch(i, { serviceId: v, staffId: '' })}
            options={salon.services.map((s: any) => ({ value: s.id, label: s.name, hint: `${s.durationMin} min · ${fmt.mad(s.priceMad, locale)}` }))} />
          <Text style={styles.label}>{t('Professionnel')}</Text>
          <Chips value={p.staffId} onChange={(v) => patch(i, { staffId: v })} options={[{ value: '', label: t('Peu importe') },
            ...salon.staff.filter((m: any) => !p.serviceId || m.serviceIds.includes(p.serviceId)).map((m: any) => ({ value: m.id, label: m.displayName }))]} />
        </Card>
      ))}
      {people.length < 6 && <Button small variant="outline" title={t('Ajouter une personne')} onPress={() => setPeople([...people, { serviceId: '', staffId: '', personName: '' }])} />}
      {people.length > 1 && (
        <Chips value={mode} onChange={setMode} options={[{ value: 'CONSECUTIVE', label: t('L’un après l’autre') }, { value: 'PARALLEL', label: t('En même temps') }]} />
      )}
      <Subtitle>{t('Date et heure')}</Subtitle>
      <Chips value={day} onChange={setDay} options={days.map((d) => {
        const date = new Date(`${d}T12:00:00Z`);
        return { value: d, label: String(date.getUTCDate()), hint: new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'short', timeZone: 'UTC' }).format(date) };
      })} />
      {!ready ? <Muted>{t('Choisissez d’abord une prestation.')}</Muted>
        : slots === null ? <Loading />
        : !slots.length ? <Muted>{t('Aucun créneau disponible ce jour-là. Essayez une autre date.')}</Muted>
        : <Chips value={slot} onChange={setSlot} options={slots.map((s) => ({ value: s.startAt, label: fmt.time(s.startAt) }))} />}
      {ready && !!slot && (
        <Card style={{ gap: 4 }}>
          <Text style={[styles.text, { fontWeight: '700' }]}>{t('Récapitulatif')}</Text>
          <Muted>{fmt.date(slot, locale)} · {fmt.time(slot)}</Muted>
          {people.map((p, i) => <Muted key={i}>{p.personName ? `${p.personName} · ` : ''}{service(p.serviceId)?.name}</Muted>)}
          <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.text}>{t('Total')}</Text><Text style={[styles.text, { fontWeight: '700' }]}>{fmt.mad(total, locale)}</Text></View>
        </Card>
      )}
      {action.error && <Notice>{action.error}</Notice>}
      <Button title={t('Confirmer la réservation')} disabled={!slot} busy={action.busy} onPress={() => action.run(async () => {
        setDone(await api(`/salons/${salon.id}/bookings`, {
          body: { startAt: slot, mode, idempotencyKey, items: people.map((p, i) => ({ ...items[i], ...(p.personName ? { personName: p.personName } : {}) })) },
        }));
      })} />
      <Muted>{t('Annulation gratuite jusqu’à {n} h avant le rendez-vous.', { n: salon.cancelMinHours })}</Muted>
    </>
  );
}

export default function Book() {
  const { t } = useI18n();
  return <Screen><Title>{t('Réserver un rendez-vous')}</Title><RequireLogin message={t('Connectez-vous pour réserver')}><Wizard /></RequireLogin></Screen>;
}
