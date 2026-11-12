'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

/** Charge une ressource de l'API ; `reload` la relit, `refreshMs` la relit périodiquement. */
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

  return { data, error, loading, reload, setData };
}

/** Exécute une action et expose son état (en cours, erreur). */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}
