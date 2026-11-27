import type { Metadata } from 'next';
import Link from 'next/link';
import { googleEnabled } from '@/lib/auth';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { SignInForm } from './SignInForm';
import { signInProblem } from './errors';

export const metadata: Metadata = { title: 'Sign in' };

/** The single sign-in screen: Google (once its keys are set), or email and password (sign in or create an account). */
export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { error } = await searchParams;
  const problem = signInProblem(error);
  return (
    <AuthScreen>
      <SignInForm google={googleEnabled} problem={problem} />
      <p className="mt-7 text-small">
        <Link href="/privacy" className="text-subtle-foreground underline-offset-4 hover:text-foreground hover:underline">Privacy</Link>
      </p>
    </AuthScreen>
  );
}
