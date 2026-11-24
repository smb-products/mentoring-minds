import { redirect } from 'next/navigation';
import { DEMO_MODE } from '@/lib/demo';
import { AppRoot } from '@/ui/AppRoot';

/**
 * Parents (kids use the parent's account).
 * Going live: PREVIEW accounts see <InviteCodeForm /> (src/components/family) above the
 * page until the code is redeemed — pass session.user.status into AppRoot for that.
 * <InstallPrompt /> (src/components/pwa) goes on the parent Home screen.
 */
export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  if (!DEMO_MODE) {
    const { auth } = await import('@/lib/auth');
    const session = await auth();
    if (!session?.user) redirect('/sign-in');
    if (session.user.role === 'ADMIN') redirect('/admin/today');
  }
  return <AppRoot>{children}</AppRoot>;
}
