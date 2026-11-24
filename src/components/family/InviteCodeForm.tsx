'use client';

import { useState, useTransition } from 'react';
import { redeemInvite } from '@/server/invites';

/** Shown to PREVIEW parents: enter the code from Vienne to unlock the app. */
export function InviteCodeForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="surface rounded-[14px] p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await redeemInvite({ code });
          if (!r.ok) setError(r.error);
          // A full load, not router.refresh(): every screen's data was fetched while the account was locked.
          else window.location.assign('/parent/home');
        });
      }}
    >
      <p className="text-[18px] font-extrabold">Enter your invite code</p>
      <p className="mt-1 text-muted-foreground">Vienne sent you a code like MM-4D8F. It unlocks booking and homework.</p>
      <div className="mt-4 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Invite code" placeholder="MM-" className="tabular h-12 flex-1 rounded-xl border border-input/70 bg-card px-4 text-lg font-extrabold tracking-wider" />
        <button type="submit" disabled={pending || code.length < 6} className="chrome-primary h-12 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground disabled:opacity-60">Unlock</button>
      </div>
      {error && <p role="alert" className="mt-2 font-semibold text-critical">{error}</p>}
    </form>
  );
}
