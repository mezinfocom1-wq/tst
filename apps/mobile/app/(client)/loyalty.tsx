import { Text, View } from 'react-native';
import { api } from '../../src/api';
import { useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { colors } from '../../src/theme';
import { Button, Card, Loading, Muted, Notice, Screen, Title, styles, useAction, useApi } from '../../src/ui';

function Content() {
  const { t } = useI18n();
  const { data, reload } = useApi<any[]>('/me/loyalty');
  const action = useAction();
  if (!data) return <Loading />;
  if (!data.length) return <Muted>{t('Vous cumulez des points après chaque prestation dans les salons qui proposent un programme de fidélité.')}</Muted>;
  return (
    <>
      {action.error && <Notice>{action.error}</Notice>}
      {data.map((x) => (
        <Card key={x.salon.id} style={{ gap: 10 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.text, { fontWeight: '700', fontSize: 17, flex: 1 }]}>{x.salon.name}</Text>
            <Text style={{ fontSize: 26, fontWeight: '700', color: colors.brand }}>{x.balance} <Text style={{ fontSize: 13, color: colors.muted }}>{t('points')}</Text></Text>
          </View>
          {x.redemptions.map((r: any) => (
            <View key={r.id} style={{ backgroundColor: colors.okSoft, borderRadius: 12, padding: 12 }}>
              <Text style={{ color: colors.ok }}>{r.reward.name} — {t('à présenter au salon')}</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: 4, color: colors.ink }}>{r.code}</Text>
            </View>
          ))}
          {x.rewards.map((r: any) => (
            <View key={r.id} style={[styles.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}><Text style={styles.text}>{r.name}</Text><Muted>{r.pointsCost} {t('points')}</Muted></View>
              <Button small variant="outline" title={t('Échanger')} disabled={x.balance < r.pointsCost} busy={action.busy}
                onPress={() => action.run(async () => { await api(`/loyalty/rewards/${r.id}/redeem`, { method: 'POST' }); await reload(); })} />
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

export default function Loyalty() {
  const { t } = useI18n();
  return <Screen><Title>{t('Fidélité')}</Title><RequireLogin><Content /></RequireLogin></Screen>;
}
