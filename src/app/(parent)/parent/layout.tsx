import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { DEMO_MODE } from '@/lib/demo';
import { AppRoot } from '@/ui/AppRoot';

/**
 * Parents (kids use the parent's account).
 * PREVIEW accounts see <InviteCodeForm /> above the page until the code is redeemed (AppRoot).
 * <InstallPrompt /> (src/components/pwa) goes on the parent Home screen.
 */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  let user: Session['user'] | undefined;
  if (!DEMO_MODE) {
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (!session?.user) redirect('/sign-in');
    if (session.user.role === 'ADMIN') redirect('/admin/today');
    user = session.user;
  }
  return <AppRoot user={user}>{children}</AppRoot>;
}
