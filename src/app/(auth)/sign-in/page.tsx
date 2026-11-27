import type { Metadata } from 'next';
import Link from 'next/link';
import { googleEnabled } from '@/lib/auth';
import { LogoMark } from '@/ui/components/brand/Logo';
import { SignInForm } from './SignInForm';
import { signInProblem } from './errors';

export const metadata: Metadata = { title: 'Sign in' };

/** The single sign-in screen: Google (once its keys are set), or email and password (sign in or create an account). */
export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { error } = await searchParams;
  const problem = signInProblem(error);
  return (
    <main className="grid min-h-dvh place-items-center bg-card px-5 py-10 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block rounded-md">
            <LogoMark size={64} className="mx-auto" />
          </Link>
          <h1 className="mt-4 text-page text-ink dark:text-foreground">Mentoring Minds</h1>
          <p className="mt-1 text-body text-muted-foreground">Math tutoring with Vienne Elliott</p>
        </div>
        <SignInForm google={googleEnabled} problem={problem} />
        <p className="mt-6 text-center text-small">
          <Link href="/privacy" className="text-brand underline-offset-4 hover:underline">Privacy</Link>
        </p>
      </div>
    </main>
  );
}
