import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';

export default function ClientTabs() {
  const { t } = useI18n();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line } }}>
      <Tabs.Screen name="explore" options={{ title: t('Trouver un salon'), tabBarIcon: icon('search') }} />
      <Tabs.Screen name="activity" options={{ title: t('Rendez-vous'), tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="loyalty" options={{ title: t('Fidélité'), tabBarIcon: icon('gift') }} />
      <Tabs.Screen name="profile" options={{ title: t('Profil'), tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
