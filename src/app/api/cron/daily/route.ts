import { timingSafeEqual } from 'node:crypto';
import { cleanUp, sendSessionReminders } from '@/lib/jobs';

/**
 * GET /api/cron/daily — run by Vercel Cron (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; anything else is refused.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 });
  const reminders = await sendSessionReminders();
  const cleaned = await cleanUp();
  return Response.json({ reminders, ...cleaned });
}
