import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Next.js 16 proxy (formerly middleware). Signed-out visitors go to /sign-in;
 * parents can't open /admin and Vienne lands on /admin. Every server function
 * still checks permissions itself (lib/guards.ts): this is only routing.
 * In demo mode (the scaffold) there is no sign-in, so everything passes through.
 */
export async function proxy(req: NextRequest) {
  if (DEMO_MODE) return NextResponse.next();
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  const user = session?.user;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith('/sign-in');

  if (!user) return isAuthPage ? NextResponse.next() : NextResponse.redirect(new URL('/sign-in', req.nextUrl));
  const home = user.role === 'ADMIN' ? '/admin/today' : '/parent/home';
  if (isAuthPage || pathname === '/') return NextResponse.redirect(new URL(home, req.nextUrl));
  if (pathname.startsWith('/admin') && user.role !== 'ADMIN') return NextResponse.redirect(new URL('/parent/home', req.nextUrl));
  return NextResponse.next();
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
