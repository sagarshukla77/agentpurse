import { asEmail, asObject, asOptString, asString } from '@/core/validate';
import { api } from '@/server/http';
import { login, SESSION_COOKIE, SESSION_TTL_SEC } from '@/server/services/auth';
import { env } from '@/server/env';
import { NextResponse } from 'next/server';

export const POST = api({ public: true, limit: { max: 8, windowMs: 60_000 } }, async ({ body }) => {
  const b = asObject(body);
  const { user, cookie } = await login({ email: asEmail(b.email, 'email'), password: asString(b.password, 'password', 200), totp: asOptString(b.totp, 'totp', 10) ?? undefined });
  const res = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, cookie, { httpOnly: true, secure: env().isProd, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SEC });
  return res;
});
