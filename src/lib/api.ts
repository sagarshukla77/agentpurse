'use client';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

/** Single place the browser talks to the server. Adds the CSRF header and normalises errors. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', 'x-requested-with': 'agentpurse' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/login') && typeof window !== 'undefined') window.location.assign('/login');
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Request failed', e);
  }
  return json as T;
}
