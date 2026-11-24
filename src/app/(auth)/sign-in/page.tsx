import type { Metadata } from 'next';
import { SignInForm } from './SignInForm';

export const metadata: Metadata = { title: 'Sign in' };

/** The single sign-in screen: Google, or email and password (sign in or create an account). */
export default function SignInPage() {
  return (
    <main className="band grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto" />
          <h1 className="font-display mt-4 text-[30px] font-semibold text-ink-foreground">Mentoring Minds</h1>
          <p className="mt-1 text-ink-muted">Math tutoring with Vienne Elliott</p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
