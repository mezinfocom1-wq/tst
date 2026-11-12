import * as SecureStore from 'expo-secure-store';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const REFRESH_KEY = 'refreshToken';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

/** Le jeton de rafraîchissement est conservé dans le stockage sécurisé du téléphone (Keychain / Keystore). */
export async function storeSession(session: { accessToken: string; refreshToken: string } | null) {
  accessToken = session?.accessToken ?? null;
  if (session) await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
  else await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const headers = (json: boolean) => ({
  'x-client': 'mobile',
  ...(json ? { 'content-type': 'application/json' } : {}),
  ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
});

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', headers: headers(true), body: JSON.stringify({ refreshToken }) });
      if (!res.ok) { await storeSession(null); return false; }
      await storeSession(await res.json());
      return true;
    } catch {
      return false;
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const send = () => fetch(`${API_URL}/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers: headers(!!opts.body), body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) res = await send();
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? 'ERROR', Array.isArray(body?.message) ? body.message.join(' · ') : body?.message ?? 'Une erreur est survenue');
  }
  return body;
}

export const assetUrl = (url: string | null | undefined) => (!url ? undefined : url.startsWith('http') ? url : `${API_URL}${url}`);
