'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Me } from './dto';

export function useApi<T>(path: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try { const d = await api<T>(path); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Failed to load'); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setLoading(!!path);
    load();
    const t = opts.refreshMs ? setInterval(load, opts.refreshMs) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, path, opts.refreshMs]);

  return { data, error, loading, reload: load };
}

export const useMe = () => useApi<Me>('/api/auth/me');

/** Wraps an async action with pending state and toast-friendly error capture. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (...a: A): Promise<R | undefined> => {
    setPending(true); setError(null);
    try { return await fn(...a); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); return undefined; }
    finally { setPending(false); }
  };
  return { run, pending, error, clearError: () => setError(null) };
}
