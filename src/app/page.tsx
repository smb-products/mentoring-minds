import { redirect } from 'next/navigation';

export default async function Root() {
  const { auth } = await import('@/lib/auth');
  const session = await auth();
  redirect(!session?.user ? '/sign-in' : session.user.role === 'ADMIN' ? '/admin/today' : '/parent/home');
}
