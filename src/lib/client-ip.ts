import 'server-only';
import { headers } from 'next/headers';

/**
 * The caller's IP, for a rate limit (L2's invite requests). Vercel sets these headers itself:
 * the first entry of x-forwarded-for, then x-real-ip. Null outside a request (tests, scripts)
 * or when neither is set. Never store it: hash it first.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const first = h.get('x-forwarded-for')?.split(',')[0]?.trim();
    return first || h.get('x-real-ip')?.trim() || null;
  } catch {
    return null;
  }
}
