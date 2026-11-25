import type { Metadata } from 'next';
import { googleEnabled } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/demo';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };

/** What a parent reads when Google sign-in comes back with ?error= (Auth.js error codes). */
const ERRORS: Record<string, string> = {
  AccessDenied: 'Google hasn’t confirmed that email address yet. Confirm it with Google, or use email and password.',
  OAuthAccountNotLinked: 'That email already signs in another way. Use your email and password, or ask Vienne.',
  Configuration: 'Google sign-in isn’t working right now. Use your email and password, or try again later.',
};

/** The single sign-in screen: Google (once its keys are set), or email and password (sign in or create an account). */
export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const { error } = await searchParams;
  const code = typeof error === 'string' ? error : undefined;
  const problem = code ? (ERRORS[code] ?? 'Signing in didn’t work. Please try again.') : undefined;
  return (
    <main className="band grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto" />
          <h1 className="font-display mt-4 text-[30px] font-semibold text-ink-foreground">Mentoring Minds</h1>
          <p className="mt-1 text-ink-muted">Math tutoring with Vienne Elliott</p>
        </div>
        <SignInForm google={googleEnabled || DEMO_MODE} problem={problem} />
      </div>
    </main>
  );
}
