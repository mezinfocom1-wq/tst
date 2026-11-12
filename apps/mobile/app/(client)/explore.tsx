import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { assetUrl } from '../../src/api';
import { fmt, useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Badge, Button, Card, Chips, Loading, Muted, Screen, Title, styles, useApi } from '../../src/ui';

const CITIES = ['', 'Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir'];
const TYPES: Record<string, string> = { MEN: 'Homme', WOMEN: 'Femme', MIXED: 'Mixte', KIDS: 'Enfants' };

export default function Explore() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const query = new URLSearchParams({ pageSize: '30', ...(search ? { q: search } : {}), ...(city ? { city } : {}) }).toString();
  const { data, loading, reload } = useApi<{ total: number; items: any[] }>(`/salons?${query}`);
  return (
    <Screen onRefresh={reload}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Title>{t('Trouver un salon')}</Title>
        <Button small variant="outline" title="QR" onPress={() => router.push('/scan')} />
      </View>
      <View style={[styles.input, styles.row, { gap: 8 }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q.trim())} returnKeyType="search" placeholder={t('Salon, prestation, coiffeur…')}
          placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 16, color: colors.ink }} />
      </View>
      <Chips value={city} onChange={setCity} options={CITIES.map((c) => ({ value: c, label: c || t('Toutes les villes') }))} />
      {loading ? <Loading /> : !data?.items.length ? <Muted>{t('Aucun salon ne correspond à votre recherche')}</Muted> : data.items.map((s) => (
        <Card key={s.id} onPress={() => router.push({ pathname: '/salon/[slug]', params: { slug: s.slug } })}>
          <View style={styles.row}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {s.logoUrl ? <Image source={{ uri: assetUrl(s.logoUrl) }} style={{ width: 56, height: 56 }} /> : <Ionicons name="cut" size={24} color={colors.brand} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.text, { fontWeight: '700', fontSize: 16 }]}>{s.name}</Text>
              <Muted>{[s.district, s.city].filter(Boolean).join(', ')}</Muted>
              <Muted>
                ★ {s.ratingCount ? `${s.ratingAvg.toFixed(1)} (${s.ratingCount})` : t('Nouveau')}
                {s.minPrice != null ? ` · ${t('À partir de {price}', { price: fmt.mad(s.minPrice, locale) })}` : ''}
              </Muted>
            </View>
          </View>
          <View style={[styles.row, { marginTop: 10, gap: 6 }]}>
            <Badge>{t(TYPES[s.type])}</Badge>
            {s.openNow && <Badge tone="ok">{t('Ouvert')}</Badge>}
            {s.queueEnabled && <Badge tone="brand">{t('File d’attente')}</Badge>}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
