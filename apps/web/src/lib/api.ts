/** Client HTTP du navigateur. Le jeton d'accès reste en mémoire ; le rafraîchissement passe par un cookie httpOnly. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };

async function parse(res: Response) {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(' · ') : body?.message ?? 'Une erreur est survenue';
    throw new ApiError(res.status, body?.code ?? 'ERROR', message);
  }
  return body;
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) { accessToken = null; return false; }
      accessToken = (await res.json()).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const send = () => fetch(`/api${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) res = await send();
  return parse(res);
}

/** Télécharge un fichier protégé (preuve de paiement) et renvoie une URL locale temporaire. */
export async function apiBlobUrl(path: string) {
  const res = await fetch(`/api${path}`, { headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, 'ERROR', 'Fichier indisponible');
  return URL.createObjectURL(await res.blob());
}
