'use client';

import { useEffect, useMemo, useState } from 'react';
import { InviteCodeForm } from '@/components/family/InviteCodeForm';
import { ChangePasswordForm } from '@/components/family/ChangePasswordForm';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { AddChildStep } from '@/components/auth/AddChildStep';
import { api } from './api';
import { useStoredState } from './lib/useStoredState';
import { AppShell } from './components/shell/AppShell';
import { ShellProvider, ThemeContext } from './components/shell/ShellContext';

/**
 * Client root for every signed-in screen (both route groups render it from their layout).
 *
 * `user` is the Auth.js session user from the layout: role, text size and the shell's user
 * come from the session.
 *
 * Nothing renders on the server (`mounted`): that avoids hydration mismatches from
 * "now"-relative dates.
 */
export function AppRoot({ user, children }) {
  const [mounted, setMounted] = useState(false);
  // The key predates S6; keeping it keeps everyone's saved theme.
  const [theme, setTheme] = useStoredState('mm.demo.theme', 'light');

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const themeValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  // J2, open sign-up: a parent with no children yet (a new sign-up, or an old PREVIEW row) adds them first.
  // Read once per full load (the step ends with one). The app shows meanwhile, so nothing waits on it, and a failed
  // read leaves the app as before. PAUSED stays as it is.
  const asks = user.role === 'PARENT' && user.status !== 'PAUSED' && !user.mustChangePassword;
  const [kids, setKids] = useState({ for: null, count: null });
  useEffect(() => {
    if (!asks) return undefined;
    let alive = true;
    api.families
      .getFamily({ parentId: user.id })
      .then((f) => f.students.length, () => -1)
      .then((count) => alive && setKids({ for: user.id, count }));
    return () => {
      alive = false;
    };
  }, [asks, user.id]);
  const [skipped, setSkipped] = useState(false);
  const known = kids.for === user.id;
  const noChildren = asks && known && kids.count === 0 && !skipped;

  let content = (
    <ShellProvider key={user.id} sessionUser={user}>
      <AppShell>
        {/* Old PREVIEW rows keep their locked view; with no children, the step sits on top, holding the code form. */}
        {user.status === 'PREVIEW' && (
          <div className="mb-5">{noChildren ? <AddChildStep inline onAlreadyAdded={() => setSkipped(true)} /> : <InviteCodeForm />}</div>
        )}
        {children}
      </AppShell>
    </ShellProvider>
  );
  if (noChildren && user.status !== 'PREVIEW') {
    content = (
      <div className="h-full w-full overflow-y-auto">
        <AddChildStep onAlreadyAdded={() => setSkipped(true)} />
      </div>
    );
  }
  // After Vienne's "Reset password": a new password before anything else.
  if (user.mustChangePassword) {
    content = (
      <div className="h-full w-full overflow-y-auto">
        <AuthScreen
          main={false}
          title="Choose a new password"
          lede="Vienne reset your password. Enter the temporary one she gave you, then pick your own."
        >
          <ChangePasswordForm forced />
        </AuthScreen>
      </div>
    );
  }

  return (
    <div id="mm-root" className="app-root">
      {mounted && <ThemeContext.Provider value={themeValue}>{content}</ThemeContext.Provider>}
    </div>
  );
}
