import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Loading } from '../../src/ui';

export default function ProTabs() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user?.role !== 'PROFESSIONAL') return <Redirect href="/" />;
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line } }}>
      <Tabs.Screen name="today" options={{ title: t('Planning'), tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="queue" options={{ title: t('File d’attente'), tabBarIcon: icon('people') }} />
      <Tabs.Screen name="more" options={{ title: t('Mon salon'), tabBarIcon: icon('storefront') }} />
    </Tabs>
  );
}
