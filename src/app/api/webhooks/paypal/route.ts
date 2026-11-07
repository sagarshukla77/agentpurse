import { NextResponse } from 'next/server';
import { api } from '@/server/http';
import { handleWebhook } from '@/server/services/webhooks';

export const POST = api({ public: true, csrf: false, limit: { max: 300, windowMs: 60_000 } }, async ({ req }) => {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: 'too large' }, { status: 413 });
  const r = await handleWebhook(raw, req.headers);
  return NextResponse.json({ outcome: r.outcome }, { status: r.status });
});
