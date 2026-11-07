import { NextResponse } from 'next/server';
import { api } from '@/server/http';
import { SESSION_COOKIE } from '@/server/services/auth';

export const POST = api({ public: true }, async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
});
