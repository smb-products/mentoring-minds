import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { DEMO_MODE } from '@/lib/demo';
import { AppRoot } from '@/ui/AppRoot';

/** Vienne only. (proxy.ts routes; this is the server-side check.) */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user: Session['user'] | undefined;
  if (!DEMO_MODE) {
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (!session?.user) redirect('/sign-in');
    if (session.user.role !== 'ADMIN') redirect('/parent/home');
    user = session.user;
  }
  return <AppRoot user={user}>{children}</AppRoot>;
}
