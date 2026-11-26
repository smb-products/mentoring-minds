import { redirect } from 'next/navigation';
import { AppRoot } from '@/ui/AppRoot';

/** Vienne only. (proxy.ts routes; this is the server-side check.) */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  if (!session?.user) redirect('/sign-in');
  if (session.user.role !== 'ADMIN') redirect('/parent/home');
  return <AppRoot user={session.user}>{children}</AppRoot>;
}
