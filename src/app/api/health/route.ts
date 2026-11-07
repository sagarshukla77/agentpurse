import { NextResponse } from 'next/server';
import { pool } from '@/server/db';

export async function GET() {
  try { await pool().query('select 1'); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
