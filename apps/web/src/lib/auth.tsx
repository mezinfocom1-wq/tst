'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from './api';

export interface User {
  id: string; email: string; firstName: string; lastName: string; phone: string | null;
  role: 'CLIENT' | 'PROFESSIONAL' | 'SUPER_ADMIN'; locale: string; emailVerified: boolean;
  notifPrefs: { push?: boolean; email?: boolean }; hasPassword: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (session: { accessToken: string; user: User }) => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, signIn: () => {}, signOut: async () => {}, reload: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try { setUser(await api('/me')); } catch { setUser(null); }
  }, []);

  useEffect(() => {
    (async () => {
      if (await refreshSession()) await reload();
      setLoading(false);
    })();
  }, [reload]);

  const signIn = useCallback((session: { accessToken: string; user: User }) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, signIn, signOut, reload }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
