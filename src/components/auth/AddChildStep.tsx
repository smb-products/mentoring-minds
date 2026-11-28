'use client';

import { useEffect, useRef, useState } from 'react';
import { signOutNow } from '@/app/(auth)/sign-in/actions';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AddChildrenForm } from '@/components/family/AddChildrenForm';
import { InviteCodeForm } from '@/components/family/InviteCodeForm';
import { api } from '@/ui/api';
import { takeSignupCode } from './signup-code';

const TITLE = 'Add your child';
const LEDE = 'Tell us who Vienne will be teaching. You can add more children later through Vienne.';

/**
 * J2: a signed-in parent with no children sees this before the app, in the auth screens' split layout (as the
 * forced new-password screen). They add their children, or enter Vienne's invite code to join the family she made.
 * `inline`: an old PREVIEW account keeps its locked view, with the step as a card at the top of it, where the invite
 * code form sat before.
 */
export function AddChildStep({ onAlreadyAdded, inline = false }: { onAlreadyAdded?: () => void; inline?: boolean }) {
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The code typed at sign-up (createAccount takes none): redeemed here, with redeemInvite's own limits and messages.
    const code = takeSignupCode();
    if (!code) return;
    setChecking(true);
    api.invites.redeemInvite({ code }).then((r: { ok: boolean; error?: string }) => {
      // A full load, as InviteCodeForm does: the layout reads the now-unlocked account again.
      if (r.ok) window.location.assign('/parent/home');
      else {
        setChecking(false);
        setCodeError(r.error ?? null);
      }
    });
  }, []);

  const body = (
    <>
      <AddChildrenForm onAlreadyAdded={onAlreadyAdded} />
      {/* Not labelled by its heading: getByLabel('Invite code') must find only the code field. */}
      <section className="mt-8 border-t border-border pt-[22px]">
        <h3 className="mb-3 text-body font-semibold text-foreground">Have an invite code?</h3>
        {checking && (
          <p role="status" className="mb-3 text-body text-muted-foreground">
            Checking your invite code…
          </p>
        )}
        {codeError && (
          <p role="alert" className="mb-3 text-body font-medium text-critical">
            {codeError}
          </p>
        )}
        <InviteCodeForm />
      </section>
    </>
  );
  if (inline) {
    return (
      <div className="max-w-[460px] rounded-lg border border-border bg-card p-5 shadow-card">
        <h2 className="text-title">{TITLE}</h2>
        <p className="mt-1 mb-5 text-muted-foreground">{LEDE}</p>
        {body}
      </div>
    );
  }
  return (
    <AuthScreen title={TITLE} lede={LEDE}>
      {body}
      {/* The app's account menu isn't here yet: the way out (a shared phone, the wrong account). */}
      <form action={signOutNow} className="mt-7 border-t border-border pt-[22px] text-body text-muted-foreground">
        Not your account?{' '}
        <button type="submit" className="font-semibold text-brand underline-offset-4 hover:underline">
          Sign out
        </button>
      </form>
    </AuthScreen>
  );
}
