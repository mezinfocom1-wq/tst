import { Text, View } from 'react-native';
import { api } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { Badge, Button, Card, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useAction, useApi } from '../../src/ui';

const STATUS: Record<string, [string, 'info' | 'brand' | 'warn' | 'ok' | 'neutral' | 'danger']> = {
  CONFIRMED: ['Confirmé', 'info'], CHECKED_IN: ['Arrivé', 'brand'], IN_PROGRESS: ['En cours', 'warn'],
  COMPLETED: ['Terminé', 'ok'], CANCELLED: ['Annulé', 'neutral'], NO_SHOW: ['Absent', 'danger'],
};
const NEXT: Record<string, [string, string][]> = {
  CONFIRMED: [['IN_PROGRESS', 'Démarrer'], ['NO_SHOW', 'Absent']],
  CHECKED_IN: [['IN_PROGRESS', 'Démarrer']],
  IN_PROGRESS: [['COMPLETED', 'Terminer']],
};

export default function Today() {
  const { locale, t } = useI18n();
  const dash = useApi<any>('/pro/dashboard', 30_000);
  const list = useApi<any[]>('/pro/appointments', 30_000);
  const action = useAction();
  const reload = async () => { await Promise.all([dash.reload(), list.reload()]); };
  const tile = (value: string | number, label: string) => (
    <Card style={{ flex: 1, padding: 12 }}><Text style={{ fontSize: 22, fontWeight: '700' }}>{value}</Text><Muted>{label}</Muted></Card>
  );
  return (
    <Screen onRefresh={reload}>
      <Title>{t('Planning')}</Title>
      <Muted>{fmt.date(Date.now(), locale)}</Muted>
      {dash.error?.code === 'NO_SALON' && <Notice tone="info">{t('Créez votre salon depuis le site Web pour commencer.')}</Notice>}
      {dash.data && (
        <View style={[styles.row, { gap: 8 }]}>
          {tile(dash.data.appointmentsToday, t('Rendez-vous aujourd’hui'))}
          {tile(dash.data.waiting, t('En attente dans la file'))}
          {tile(fmt.mad(dash.data.revenueToday, locale), t('Recette du jour'))}
        </View>
      )}
      {action.error && <Notice>{action.error}</Notice>}
      <Subtitle>{t('Rendez-vous aujourd’hui')}</Subtitle>
      {list.loading ? <Loading /> : !list.data?.length ? <Muted>{t('Aucun rendez-vous ce jour-là')}</Muted> : list.data.map((a) => (
        <Card key={a.id} style={{ gap: 6 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.text, { fontWeight: '700' }]}>{fmt.time(a.startAt)} · {a.clientName}</Text>
            <Badge tone={STATUS[a.status][1]}>{t(STATUS[a.status][0])}</Badge>
          </View>
          <Muted>{a.service.name} — {a.staff.displayName} · {fmt.mad(a.priceMad, locale)}</Muted>
          <View style={[styles.row, { gap: 8 }]}>
            {(NEXT[a.status] ?? []).map(([status, label]) => (
              <Button key={status} small variant={status === 'NO_SHOW' ? 'outline' : 'primary'} title={t(label)} busy={action.busy}
                onPress={() => action.run(async () => { await api(`/pro/appointments/${a.id}/status`, { body: { status } }); await reload(); })} />
            ))}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
