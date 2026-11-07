import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { can, type Permission } from '@/core/security/rbac';
import { RateLimiter } from '@/core/security/rate-limit';
import { ValidationError } from '@/core/validate';
import { MoneyError } from '@/core/money';
import { IllegalTransition } from '@/core/state-machine';
import { SESSION_COOKIE, userFromCookie } from './services/auth';
import type { User } from './repos/users';
import { forbidden, HttpError, tooMany, unauthorized } from './errors';

const limiter = ((globalThis as any).__apLimiter ??= new RateLimiter()) as RateLimiter;

export interface Ctx { req: NextRequest; user: User; params: Record<string, string>; body: any; ip: string }
export interface PublicCtx extends Omit<Ctx, 'user'> { user: User | null }

interface Opts {
  perm?: Permission;
  /** No session needed (login, webhooks, MCP, worker). These must authenticate themselves. */
  public?: boolean;
  /** Mutations from a browser must carry the custom header. Disabled only for machine-to-machine routes. */
  csrf?: boolean;
  limit?: { max: number; windowMs: number };
  maxBodyBytes?: number;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Every API route goes through this wrapper, so rate limiting, CSRF, authentication, authorisation,
 * body limits and error handling are applied uniformly rather than remembered route by route.
 */
export function api(opts: Opts, fn: (c: any) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const ip = clientIp(req);
      const lim = opts.limit ?? { max: 120, windowMs: 60_000 };
      const hit = limiter.hit(`${new URL(req.url).pathname}:${ip}`, lim.max, lim.windowMs);
      if (!hit.ok) throw tooMany(hit.retryAfterSec);

      const mutating = MUTATING.has(req.method);
      if (mutating && opts.csrf !== false) {
        const origin = req.headers.get('origin');
        if (origin && new URL(origin).host !== req.headers.get('host')) throw forbidden('Cross-origin request blocked');
        if (req.headers.get('x-requested-with') !== 'agentpurse') throw forbidden('Missing CSRF header');
      }

      let user: User | null = null;
      if (!opts.public) {
        user = await userFromCookie((await cookies()).get(SESSION_COOKIE)?.value);
        if (!user) throw unauthorized();
        if (opts.perm && !can(user.role, opts.perm)) throw forbidden();
      }

      let body: unknown = undefined;
      if (mutating && req.headers.get('content-type')?.includes('application/json')) {
        const text = await req.text();
        if (text.length > (opts.maxBodyBytes ?? 3_000_000)) throw new HttpError(413, 'too_large', 'Request body is too large');
        try { body = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'bad_json', 'Request body is not valid JSON'); }
      }

      const out = await fn({ req, user, params: await routeCtx.params, body, ip });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status, headers: e.status === 429 ? { 'Retry-After': String(e.extra?.retryAfterSec ?? 30) } : {} });
  }
  if (e instanceof ValidationError || e instanceof MoneyError) return NextResponse.json({ error: { code: 'bad_request', message: e.message } }, { status: 400 });
  if (e instanceof IllegalTransition) return NextResponse.json({ error: { code: 'conflict', message: e.message } }, { status: 409 });
  console.error('Unhandled error', e); // details stay in the server log...
  // ...except in local development, where showing the cause on screen saves a lot of time.
  const detail = process.env.NODE_ENV !== 'production' && e instanceof Error ? `: ${e.message}` : '';
  return NextResponse.json({ error: { code: 'internal', message: `Something went wrong${detail}` } }, { status: 500 });
}
