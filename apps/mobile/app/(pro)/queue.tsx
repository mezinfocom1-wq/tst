import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ApiError, api } from '../../src/api';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Badge, Button, Card, Chips, Field, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useAction, useApi } from '../../src/ui';

export default function ProQueue() {
  const { t } = useI18n();
  const { data, error, reload } = useApi<any>('/pro/queue', 10_000);
  const { data: services } = useApi<any[]>('/pro/services');
  const [guestName, setGuestName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const action = useAction();
  const act = (path: string) => action.run(async () => { await api(`/pro/queue/${path}`, { method: 'POST' }); await reload(); });

  /** Appelle le suivant ; si la prestation empiète sur un rendez-vous, une confirmation est demandée. */
  const call = (staffId: string) => action.run(async () => {
    try {
      await api('/pro/queue/call', { body: { staffId } });
    } catch (e) {
      if ((e as ApiError).code !== 'WOULD_OVERLAP_APPOINTMENT') throw e;
      const confirmed = await new Promise<boolean>((resolve) => Alert.alert(t('File d’attente'), (e as ApiError).message, [
        { text: t('Annuler'), style: 'cancel', onPress: () => resolve(false) }, { text: t('Appeler le suivant'), onPress: () => resolve(true) },
      ]));
      if (!confirmed) return;
      await api('/pro/queue/call', { body: { staffId, force: true } });
    }
    await reload();
  });

  if (error) return <Screen><Notice>{error.message}</Notice></Screen>;
  if (!data) return <Screen><Loading /></Screen>;
  return (
    <Screen onRefresh={reload}>
      <Title>{t('File d’attente')}</Title>
      <Muted>{t('{n} personne(s) en attente', { n: data.waiting.length })}</Muted>
      {action.error && <Notice>{action.error}</Notice>}
      {data.staff.map((m: any) => (
        <Card key={m.id} style={{ gap: 10 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.text, { fontWeight: '700', fontSize: 17 }]}>{m.displayName}</Text>
            <Badge tone={m.current ? 'warn' : m.working ? 'ok' : 'neutral'}>{m.current ? t('Occupé') : m.working ? t('Disponible') : t('Hors horaires')}</Badge>
          </View>
          {m.current ? (
            <>
              <Text style={styles.text}><Text style={{ color: colors.brand, fontWeight: '700', fontSize: 20 }}>{String(m.current.number).padStart(3, '0')}</Text> · {m.current.clientName} · {m.current.service.name}</Text>
              <View style={[styles.row, { gap: 8 }]}>
                {m.current.status === 'CALLED' && <Button small title={t('Démarrer')} busy={action.busy} onPress={() => act(`${m.current.id}/start`)} />}
                {m.current.status === 'CALLED' && <Button small variant="outline" title={t('Absent')} busy={action.busy} onPress={() => act(`${m.current.id}/no-show`)} />}
                {m.current.status === 'IN_SERVICE' && <Button small variant="brand" title={t('Terminer')} busy={action.busy} onPress={() => act(`${m.current.id}/finish`)} />}
              </View>
            </>
          ) : <Button variant="brand" title={t('Appeler le suivant')} disabled={!data.waiting.length} busy={action.busy} onPress={() => call(m.id)} />}
        </Card>
      ))}

      <Subtitle>{t('En attente')}</Subtitle>
      {!data.waiting.length ? <Muted>{t('La file est vide')}</Muted> : data.waiting.map((x: any) => (
        <Card key={x.id} style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 24 }}>{String(x.number).padStart(3, '0')}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.text, { fontWeight: '600' }]}>{x.clientName}</Text>
            <Muted>{x.service.name} · {x.staff ? x.staff.displayName : t('Peu importe')}</Muted>
          </View>
          <Muted>{x.estimate?.estimatedWaitMin != null ? `≈ ${x.estimate.estimatedWaitMin} min` : '—'}</Muted>
        </Card>
      ))}

      <Subtitle>{t('Ajouter un client de passage')}</Subtitle>
      <Card>
        <Field label={t('Nom du client')} value={guestName} onChangeText={setGuestName} />
        <Chips value={serviceId} onChange={setServiceId} options={(services ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} />
        <View style={{ height: 12 }} />
        <Button title={t('Ajouter à la file')} disabled={!guestName.trim() || !serviceId} busy={action.busy} onPress={() => action.run(async () => {
          await api('/pro/queue', { body: { guestName: guestName.trim(), serviceId } });
          setGuestName('');
          await reload();
        })} />
      </Card>
    </Screen>
  );
}
