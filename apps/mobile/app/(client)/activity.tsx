import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Text, View } from 'react-native';
import { api } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { Ticket } from '../../src/Ticket';
import { Badge, Button, Card, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useAction, useApi } from '../../src/ui';

const STATUS: Record<string, [string, 'info' | 'brand' | 'warn' | 'ok' | 'neutral' | 'danger']> = {
  CONFIRMED: ['Confirmé', 'info'], CHECKED_IN: ['Arrivé', 'brand'], IN_PROGRESS: ['En cours', 'warn'],
  COMPLETED: ['Terminé', 'ok'], CANCELLED: ['Annulé', 'neutral'], NO_SHOW: ['Absent', 'danger'],
};

function Content() {
  const { locale, t } = useI18n();
  const appointments = useApi<any[]>('/me/appointments');
  const tickets = useApi<any[]>('/queue/tickets');
  const action = useAction();
  const reload = useCallback(async () => { await Promise.all([appointments.reload(), tickets.reload()]); }, [appointments.reload, tickets.reload]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  if (!appointments.data || !tickets.data) return <Loading />;
  const now = Date.now();
  const active = tickets.data.filter((x) => ['WAITING', 'CALLED', 'IN_SERVICE'].includes(x.status));
  const upcoming = appointments.data.filter((a) => ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status) && new Date(a.endAt).getTime() > now).reverse();
  const past = appointments.data.filter((a) => !upcoming.includes(a)).slice(0, 20);
  const row = (a: any, canAct: boolean) => (
    <Card key={a.id} style={{ gap: 6 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text style={[styles.text, { fontWeight: '700', flex: 1 }]}>{a.salon.name}</Text>
        <Badge tone={STATUS[a.status][1]}>{t(STATUS[a.status][0])}</Badge>
      </View>
      <Muted>{fmt.date(a.startAt, locale)} · {fmt.time(a.startAt)}</Muted>
      <Muted>{a.personName ? `${a.personName} · ` : ''}{a.service.name} — {a.staff.displayName} · {fmt.mad(a.priceMad, locale)}</Muted>
      {canAct && a.status === 'CONFIRMED' && new Date(a.startAt).getTime() - now > a.salon.cancelMinHours * 3_600_000 && (
        <Button small variant="outline" title={t('Annuler')} busy={action.busy} onPress={() => Alert.alert(t('Annuler ce rendez-vous ?'), undefined, [
          { text: t('Retour au salon'), style: 'cancel' },
          { text: t('Annuler'), style: 'destructive', onPress: () => action.run(async () => { await api(`/appointments/${a.id}/cancel`, { method: 'POST' }); await reload(); }) },
        ])} />
      )}
    </Card>
  );
  return (
    <>
      {action.error && <Notice>{action.error}</Notice>}
      {active.map((x) => <Ticket key={x.id} ticketId={x.id} onChange={reload} />)}
      <Subtitle>{t('À venir')}</Subtitle>
      {upcoming.length ? upcoming.map((a) => row(a, true)) : <Muted>{t('Aucun rendez-vous à venir')}</Muted>}
      {!!past.length && <Subtitle>{t('Historique')}</Subtitle>}
      {past.map((a) => row(a, false))}
    </>
  );
}

export default function Activity() {
  const { t } = useI18n();
  return <Screen><Title>{t('Rendez-vous')}</Title><RequireLogin><Content /></RequireLogin></Screen>;
}
