import { Alert, Text, View } from 'react-native';
import { api } from './api';
import { fmt, useI18n } from './i18n';
import { colors } from './theme';
import { Badge, Button, Card, Loading, Muted, Notice, styles, useAction, useApi } from './ui';

const STATUS: Record<string, [string, 'info' | 'brand' | 'warn' | 'ok' | 'neutral' | 'danger']> = {
  WAITING: ['En attente', 'info'], CALLED: ['Appelé', 'brand'], IN_SERVICE: ['En cours', 'warn'],
  DONE: ['Terminé', 'ok'], CANCELLED: ['Annulé', 'neutral'], NO_SHOW: ['Absent', 'danger'],
};

/** Ticket numérique, relu toutes les dix secondes tant qu'il est actif. */
export function Ticket({ ticketId, onChange }: { ticketId: string; onChange?: () => void }) {
  const { t } = useI18n();
  const { data: ticket, reload } = useApi<any>(`/queue/tickets/${ticketId}`, 10_000);
  const action = useAction();
  if (!ticket) return <Loading />;
  const [label, tone] = STATUS[ticket.status];
  const e = ticket.estimate;
  const stat = (value: string | number, text: string) => (
    <View style={{ flex: 1, backgroundColor: colors.sandDeep, borderRadius: 14, padding: 12, alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.ink }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ backgroundColor: colors.ink, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: '#ffffff99', fontSize: 12, letterSpacing: 2 }}>{t('Ticket').toUpperCase()}</Text>
          <Text style={{ color: colors.brandLight, fontSize: 48, fontWeight: '700' }}>{String(ticket.number).padStart(3, '0')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{ticket.salon.name}</Text>
          <Text style={{ color: '#ffffff99' }}>{ticket.service.name}</Text>
          <Badge tone={tone}>{t(label)}</Badge>
        </View>
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        {ticket.status === 'CALLED' && <Notice tone="brand">{t('C’est votre tour ! Présentez-vous auprès de {name}.', { name: ticket.staff?.displayName ?? '' })}</Notice>}
        {ticket.status === 'WAITING' && e && (
          <View style={[styles.row, { gap: 8 }]}>
            {stat(e.position, t('Position'))}
            {stat(e.peopleAhead, t('Devant vous'))}
            {stat(e.estimatedWaitMin ?? '—', t('Minutes (estimation)'))}
          </View>
        )}
        {ticket.status === 'WAITING' && e?.estimatedStart && <Muted>{t('Passage estimé vers {time}.', { time: fmt.time(e.estimatedStart) })}</Muted>}
        <Muted>{ticket.staff ? t('Professionnel : {name}', { name: ticket.staff.displayName }) : t('Professionnel : premier disponible')}</Muted>
        {action.error && <Notice>{action.error}</Notice>}
        {['WAITING', 'CALLED'].includes(ticket.status) && (
          <Button variant="outline" small busy={action.busy} title={t('Quitter la file')} onPress={() => Alert.alert(t('Quitter la file d’attente ?'), undefined, [
            { text: t('Annuler'), style: 'cancel' },
            { text: t('Quitter la file'), style: 'destructive', onPress: () => action.run(async () => { await api(`/queue/tickets/${ticket.id}/cancel`, { method: 'POST' }); await reload(); onChange?.(); }) },
          ])} />
        )}
      </View>
    </Card>
  );
}
