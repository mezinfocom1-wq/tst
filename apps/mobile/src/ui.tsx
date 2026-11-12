import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api } from './api';
import { Tone, colors, tones } from './theme';

export function Screen({ children, onRefresh, scroll = true }: { children: React.ReactNode; onRefresh?: () => Promise<unknown>; scroll?: boolean }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh && (
    <RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await onRefresh().catch(() => {}); setRefreshing(false); }} />
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={styles.content} refreshControl={refresh || undefined} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: React.ReactNode }) => <Text style={styles.title}>{children}</Text>;
export const Subtitle = ({ children }: { children: React.ReactNode }) => <Text style={styles.subtitle}>{children}</Text>;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: object }) => <Text style={[styles.muted, style]}>{children}</Text>;

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>
    : <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', busy, disabled, small }: {
  title: string; onPress: () => void; variant?: 'primary' | 'brand' | 'outline' | 'ghost'; busy?: boolean; disabled?: boolean; small?: boolean;
}) {
  const bg = { primary: colors.ink, brand: colors.brand, outline: colors.surface, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'brand' ? '#fff' : colors.ink;
  return (
    <Pressable
      accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, { backgroundColor: bg, borderColor: variant === 'outline' ? colors.line : bg, opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
    </View>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  const [bg, fg] = tones[tone];
  return <View style={[styles.badge, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{children}</Text></View>;
}

export function Notice({ tone = 'danger', children }: { tone?: Tone; children: React.ReactNode }) {
  const [bg, fg] = tones[tone];
  return <View style={[styles.notice, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 14 }}>{children}</Text></View>;
}

export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={colors.brand} size="large" /></View>;

/** Choix parmi quelques options (prestation, professionnel, date). */
export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: active }}
            style={[styles.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
            <Text style={{ color: active ? '#fff' : colors.ink, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
            {o.hint ? <Text style={{ color: active ? '#ffffffaa' : colors.muted, fontSize: 12 }}>{o.hint}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Charge une ressource de l'API, avec relecture manuelle et périodique. */
export function useApi<T = any>(path: string | null, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const current = useRef(path);
  current.current = path;
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api<T>(path);
      if (current.current === path) { setData(result); setError(null); }
    } catch (e) {
      if (current.current === path) setError(e as ApiError);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(!!path);
    reload();
    if (!refreshMs || !path) return;
    const id = setInterval(reload, refreshMs);
    return () => clearInterval(id);
  }, [path, reload, refreshMs]);
  return { data, error, loading, reload };
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try { return await fn(); } catch (e) { setError((e as Error).message); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, textAlign: 'left' },
  subtitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginTop: 8, textAlign: 'left' },
  muted: { fontSize: 14, color: colors.muted, textAlign: 'left' },
  text: { fontSize: 15, color: colors.ink, textAlign: 'left' },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16 },
  button: { height: 50, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonSmall: { height: 38, borderRadius: 11, paddingHorizontal: 12 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.inkSoft, marginBottom: 6, textAlign: 'left' },
  input: { height: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, fontSize: 16, color: colors.ink },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  notice: { borderRadius: 14, padding: 12 },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
