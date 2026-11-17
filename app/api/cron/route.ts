import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { runAutomations } from '@/lib/logic';

export const dynamic = 'force-dynamic';

// Vercel Cron calls this daily (see vercel.json). Protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  await ensureDb();
  const log = await runAutomations();
  return NextResponse.json({ ok: true, log });
}
