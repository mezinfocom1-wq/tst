import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Linking, Text, View } from 'react-native';
import { assetUrl } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Button, Card, Loading, Muted, Notice, Screen, Subtitle, Title, styles, useApi } from '../../src/ui';

export default function Salon() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: salon, loading, reload } = useApi<any>(`/salons/${slug}`);
  const { data: queue } = useApi<any>(salon ? `/salons/${salon.id}/queue` : null, 20_000);
  if (loading) return <Screen><Loading /></Screen>;
  if (!salon) return <Screen><Notice>{t('Salon introuvable')}</Notice><Button variant="outline" title={t('Trouver un salon')} onPress={() => router.replace('/')} /></Screen>;
  return (
    <Screen onRefresh={reload}>
      {salon.coverUrl && <Image source={{ uri: assetUrl(salon.coverUrl) }} style={{ height: 150, borderRadius: 18 }} />}
      <Title>{salon.name}</Title>
      <Muted>★ {salon.ratingCount ? `${salon.ratingAvg.toFixed(1)} (${salon.ratingCount})` : t('Nouveau')} · {[salon.address, salon.city].filter(Boolean).join(', ')}</Muted>
      {!!salon.description && <Text style={[styles.text, { color: colors.inkSoft, lineHeight: 22 }]}>{salon.description}</Text>}
      {queue?.enabled && (
        <Notice tone="brand">
          {t('{n} personne(s) en attente', { n: queue.waiting })} · {queue.estimatedWaitMin == null ? t('Plus de disponibilité aujourd’hui') : t('Attente estimée : environ {n} min', { n: queue.estimatedWaitMin })}
        </Notice>
      )}
      {salon.bookingEnabled && <Button title={t('Réserver un rendez-vous')} onPress={() => router.push({ pathname: '/book/[slug]', params: { slug: salon.slug } })} />}
      {salon.queueEnabled && <Button variant="brand" title={t('Rejoindre la file d’attente')} onPress={() => router.push({ pathname: '/queue/[slug]', params: { slug: salon.slug } })} />}

      <Subtitle>{t('Prestations et tarifs')}</Subtitle>
      <Card style={{ gap: 12 }}>
        {salon.services.map((s: any) => (
          <View key={s.id} style={[styles.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}><Text style={[styles.text, { fontWeight: '600' }]}>{s.name}</Text><Muted>{s.durationMin} min</Muted></View>
            <Text style={[styles.text, { fontWeight: '700' }]}>{fmt.mad(s.priceMad, locale)}</Text>
          </View>
        ))}
      </Card>

      <Subtitle>{t('L’équipe')}</Subtitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {salon.staff.map((m: any) => <Card key={m.id} style={{ paddingVertical: 10 }}><Text style={[styles.text, { fontWeight: '600' }]}>{m.displayName}</Text><Muted>{m.title ?? t('Coiffeur')}</Muted></Card>)}
      </View>

      {!!salon.reviews.length && <Subtitle>{t('Avis')}</Subtitle>}
      {salon.reviews.map((r: any) => (
        <Card key={r.id} style={{ gap: 4 }}>
          <Text style={[styles.text, { fontWeight: '600' }]}>{r.author} · {'★'.repeat(r.rating)}</Text>
          {r.comment && <Muted>{r.comment}</Muted>}
          {r.reply && <Muted style={{ color: colors.inkSoft }}>{t('Réponse du salon')} : {r.reply}</Muted>}
        </Card>
      ))}

      <View style={[styles.row, { gap: 8 }]}>
        {salon.phone && <View style={{ flex: 1 }}><Button variant="outline" title={salon.phone} onPress={() => Linking.openURL(`tel:${salon.phone}`)} /></View>}
        {salon.latitude != null && <View style={{ flex: 1 }}><Button variant="outline" title={t('Itinéraire')} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`)} /></View>}
      </View>
    </Screen>
  );
}
