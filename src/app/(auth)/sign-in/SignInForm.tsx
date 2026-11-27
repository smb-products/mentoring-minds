'use client';

import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import { AuthHeading } from '@/components/auth/AuthScreen';
import { createAccount, signInWithGoogle, signInWithPassword } from './actions';

const input = 'h-12 w-full rounded-[12px] border border-input/70 bg-card px-3.5 text-field text-foreground';
const label = 'block text-body font-medium text-foreground';
const button = 'flex h-12 w-full items-center justify-center rounded-[12px] text-body font-semibold';
const link = 'font-semibold text-brand underline-offset-4 hover:underline';

export function SignInForm({ google, problem }: { google: boolean; problem?: string }) {
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [inState, inAction, inPending] = useActionState(signInWithPassword, undefined);
  const [newState, newAction, newPending] = useActionState(createAccount, undefined);
  const state = mode === 'in' ? inState : newState;
  // Kept in state: React resets a form after each submit, and retyping an email after a typo'd password is a pain.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const id = useId();

  return (
    <div>
      {mode === 'in' ? (
        <AuthHeading title="Sign in" lede="Families and Vienne sign in here." />
      ) : (
        <AuthHeading title="Create your account" lede="For families with an invite code from Vienne." />
      )}
      {problem && (
        <p role="alert" className="mb-5 rounded-md bg-critical-soft px-4 py-3 text-body font-medium text-critical-soft-foreground">
          {problem}
        </p>
      )}
      {google && (<>
      <form action={signInWithGoogle}>
        <button type="submit" className={`${button} gap-3 border border-input/70 bg-card text-foreground hover:bg-muted`}>
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
          Continue with Google
        </button>
      </form>
      <div className="my-[22px] flex items-center gap-3 text-small text-subtle-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
      </>)}

      <form action={mode === 'in' ? inAction : newAction} className="space-y-4">
        {mode === 'new' && (
          <div className="space-y-1.5">
            <label htmlFor={`${id}-name`} className={label}>Your name</label>
            <input id={`${id}-name`} name="name" autoComplete="name" className={input} required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor={`${id}-email`} className={label}>Email</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" className={input} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={`${id}-password`} className={label}>Password</label>
            {/* Its name is only "Show" or "Hide", so getByLabel('Password') still finds just the field. */}
            <button
              type="button"
              aria-pressed={showPassword}
              aria-controls={`${id}-password`}
              onClick={() => setShowPassword(!showPassword)}
              className="hit-area rounded-md text-body text-muted-foreground hover:text-foreground"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <input
            id={`${id}-password`}
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            className={input}
            required
            minLength={mode === 'new' ? 8 : 1}
          />
        </div>
        {state?.error && <p role="alert" className="text-body font-medium text-critical">{state.error}</p>}
        <button type="submit" disabled={inPending || newPending} className={`${button} bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60`}>
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {mode === 'in' && (
        <p className="mt-4 text-body text-muted-foreground">Forgot your password? Message or text Vienne and she’ll reset it.</p>
      )}

      <div className="mt-7 space-y-1 border-t border-border pt-[22px] text-body text-muted-foreground">
        {mode === 'in' ? (
          <>
            <p>
              New family with an invite code?{' '}
              <button type="button" onClick={() => setMode('new')} className={link}>Create an account</button>
            </p>
            <p>
              No code yet? <Link href="/#request-invite" className={link}>Request an invite</Link>
            </p>
          </>
        ) : (
          <>
            <p>
              Already have an account?{' '}
              <button type="button" onClick={() => setMode('in')} className={link}>Sign in</button>
            </p>
            <p className="text-small">After you sign up, enter the invite code Vienne sent you.</p>
          </>
        )}
      </div>
    </div>
  );
}
