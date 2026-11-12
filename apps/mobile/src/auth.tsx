import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api, refreshSession, storeSession } from './api';

export interface User {
  id: string; email: string; firstName: string; lastName: string; phone: string | null;
  role: 'CLIENT' | 'PROFESSIONAL' | 'SUPER_ADMIN'; emailVerified: boolean;
}
type Session = { accessToken: string; refreshToken: string; user: User };

const Ctx = createContext<{ user: User | null; loading: boolean; signIn: (s: Session) => Promise<void>; signOut: () => Promise<void> }>(null as never);

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/** Enregistre l'appareil pour les notifications push. Sans effet sur simulateur ou si l'utilisateur refuse. */
async function registerPush() {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.HIGH });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('/me/devices', { body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
  } catch (e) {
    console.warn('Notifications push indisponibles', e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (await refreshSession()) {
        try { setUser(await api('/me')); registerPush(); } catch { /* session invalide */ }
      }
      setLoading(false);
    })();
  }, []);

  const signIn = useCallback(async (s: Session) => {
    await storeSession(s);
    setUser(s.user);
    registerPush();
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { body: {} }).catch(() => {});
    await storeSession(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
