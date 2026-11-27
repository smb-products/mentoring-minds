import { greeting } from '../../lib/format';
import { PageHeader } from './Masthead';
import { useShell } from './ShellContext';

/** The wording in src/server/invites.ts (redeemInvite). */
export const PAUSED_MESSAGE = 'Your account is paused. Message Vienne to turn it back on.';

/**
 * 'PREVIEW' or 'PAUSED' for a parent whose account isn't active, else null.
 * The server refuses their child's data (NOT_ACTIVE), so parent pages show <LockedPage /> instead of waiting on it.
 */
export function useLocked() {
  const { role, user } = useShell();
  return role === 'parent' && user.status !== 'ACTIVE' ? user.status : null;
}

/**
 * A parent page while the account is locked: its masthead, nothing to load. What to do is above the page:
 * the invite code form (PREVIEW, from AppRoot) or <PausedNotice /> (PAUSED, from AppShell).
 */
export function LockedPage({ title, back }) {
  const locked = useLocked();
  return (
    <PageHeader
      back={back}
      title={title}
      subtitle={locked === 'PAUSED' ? 'This opens again when Vienne turns your account back on.' : 'This opens once you enter the invite code from Vienne.'}
    />
  );
}

/** The home page's title, for a locked account too. */
export function useGreeting() {
  const { user } = useShell();
  return `${greeting()}, ${user.name.split(' ')[0]}`;
}

/** Shown above every parent page while Vienne has the account paused. */
export function PausedNotice({ className }) {
  return (
    <div role="status" className={className}>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <p className="text-title">{PAUSED_MESSAGE}</p>
        <p className="mt-1 text-muted-foreground">Your child’s sessions and homework come back as soon as she does.</p>
      </div>
    </div>
  );
}
