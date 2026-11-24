import { redirect } from 'next/navigation';
import { DEMO_MODE } from '@/lib/demo';

export default async function Root() {
  if (DEMO_MODE) redirect('/admin/today');
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  redirect(!session?.user ? '/sign-in' : session.user.role === 'ADMIN' ? '/admin/today' : '/parent/home');
}
