import { NextResponse, type NextRequest } from 'next/server';

/**
 * Pages anyone can open, signed in or not: the privacy page and the Open Graph image.
 * Whole paths only, never a prefix: '/privacyx' and '/privacy/anything' still need a sign-in.
 */
const OPEN_TO_ALL = new Set(['/privacy', '/opengraph-image']);

/**
 * Where a page request goes: null lets it through, a path redirects there.
 * Signed out, '/' is the landing page; signed in, it sends you home.
 */
export function redirectFor(pathname: string, user: { role?: string } | null | undefined): string | null {
  if (OPEN_TO_ALL.has(pathname)) return null;
  const isAuthPage = pathname.startsWith('/sign-in');
  if (!user) return isAuthPage || pathname === '/' ? null : '/sign-in';
  const home = user.role === 'ADMIN' ? '/admin/today' : '/parent/home';
  if (isAuthPage || pathname === '/') return home;
  if (pathname.startsWith('/admin') && user.role !== 'ADMIN') return '/parent/home';
  return null;
}

/**
 * Next.js 16 proxy (formerly middleware). Signed-out visitors go to /sign-in, except
 * for the landing page at '/' and the pages in OPEN_TO_ALL; parents can't open /admin
 * and Vienne lands on /admin. Every server function still checks permissions itself
 * (lib/guards.ts): this is only routing.
 */
export async function proxy(req: NextRequest) {
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  const to = redirectFor(req.nextUrl.pathname, session?.user);
  return to ? NextResponse.redirect(new URL(to, req.nextUrl)) : NextResponse.next();
}

/**
 * Pages only. API routes check access themselves, right next to the data: the cron
 * (CRON_SECRET), file downloads (session + permission), Blob upload tokens (session),
 * and Blob's own upload callback (signed). Redirecting them to /sign-in would break
 * the cron (Vercel doesn't follow redirects) and Blob's callback.
 */
export const config = {
  // Must stay a literal: Next.js reads it at build time. tests/proxy.test.ts checks it.
  matcher: ['/((?!api/|_next/static|_next/image|sw.js|offline.html|manifest.webmanifest|icons/|logo-|icon.png|favicon.ico).*)'],
};
