import 'server-only';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Lecture publique côté serveur (rendu des pages de la marketplace pour le référencement). */
export async function serverApi<T = any>(path: string, revalidate = 30): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}/api${path}`, { next: { revalidate } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
