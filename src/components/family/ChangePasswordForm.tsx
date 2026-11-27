'use client';

import { useState, useTransition } from 'react';
import { changePassword } from '@/server/families';

/**
 * A new password for the signed-in person: after Vienne's "Reset password" (`forced`, the
 * temporary password goes in as the current one), or from the account panel.
 * Calls the real server even while `families` is on the mock: it's the account's own setting.
 */
export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = 'h-11 w-full rounded-md border border-input/70 bg-card px-3 text-field';
  return (
    <form
      className={forced ? 'rounded-lg border border-border bg-card p-5 shadow-card' : 'space-y-2'}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await changePassword({ currentPassword, newPassword });
          if (!r.ok) setError(r.error);
          else if (r.data.signInAgain) window.location.assign('/sign-in');
          // A full load right away: the action's own re-render still read the old session
          // cookie (now signed out) and asks for /sign-in. The new cookie is already set.
          else window.location.reload();
        });
      }}
    >
      {forced && (
        <>
          <p className="text-title">Choose a new password</p>
          <p className="mt-1 text-muted-foreground">Vienne reset your password. Enter the temporary one she gave you, then pick your own.</p>
        </>
      )}
      <div className={forced ? 'mt-4 space-y-3' : 'space-y-2'}>
        <label className="block">
          <span className="mb-1 block text-small font-medium text-muted-foreground">{forced ? 'Temporary password' : 'Current password'}</span>
          <input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-small font-medium text-muted-foreground">New password</span>
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={input} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-body font-medium text-critical">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || newPassword.length < 8}
        className={`rounded-md bg-primary text-body font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60 ${forced ? 'mt-4 h-12 w-full' : 'h-10 w-full'}`}
      >
        Save new password
      </button>
    </form>
  );
}
