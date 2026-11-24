'use client';

import { useActionState, useState } from 'react';
import { createAccount, signInWithGoogle, signInWithPassword } from './actions';

const input = 'h-12 w-full rounded-xl border border-input/70 bg-card px-4 text-base font-semibold text-foreground placeholder:text-subtle-foreground';

export function SignInForm() {
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [inState, inAction, inPending] = useActionState(signInWithPassword, undefined);
  const [newState, newAction, newPending] = useActionState(createAccount, undefined);
  const state = mode === 'in' ? inState : newState;
  // Kept in state: React resets a form after each submit, and retyping an email after a typo'd password is a pain.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div className="surface rounded-[18px] p-6">
      <form action={signInWithGoogle}>
        <button type="submit" className="chrome-secondary flex h-12 w-full items-center justify-center gap-3 rounded-xl text-base font-bold text-foreground">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
          Continue with Google
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-[13px] font-bold text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>

      <form action={mode === 'in' ? inAction : newAction} className="space-y-3">
        {mode === 'new' && <input name="name" autoComplete="name" placeholder="Your name" aria-label="Your name" className={input} required value={name} onChange={(e) => setName(e.target.value)} />}
        <input name="email" type="email" autoComplete="email" placeholder="Email" aria-label="Email" className={input} required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input name="password" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Password" aria-label="Password" className={input} required minLength={mode === 'new' ? 8 : 1} />
        {state?.error && <p role="alert" className="text-[15px] font-semibold text-critical">{state.error}</p>}
        <button type="submit" disabled={inPending || newPending} className="chrome-primary h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60">
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="mt-5 text-center text-[15px] text-muted-foreground">
        {mode === 'in' ? 'New here? ' : 'Already have an account? '}
        <button type="button" onClick={() => setMode(mode === 'in' ? 'new' : 'in')} className="font-bold text-brand underline-offset-4 hover:underline">
          {mode === 'in' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
      {mode === 'new' && <p className="mt-3 text-center text-[14px] text-muted-foreground">After you sign up, enter the invite code Vienne sent you.</p>}
    </div>
  );
}
