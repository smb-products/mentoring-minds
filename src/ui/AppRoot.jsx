'use client';

import { useEffect, useMemo, useState } from 'react';
import { InviteCodeForm } from '@/components/family/InviteCodeForm';
import { ChangePasswordForm } from '@/components/family/ChangePasswordForm';
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

  let content = (
    <ShellProvider key={user.id} sessionUser={user}>
      <AppShell>
        {user.status === 'PREVIEW' && (
          <div className="mb-5">
            <InviteCodeForm />
          </div>
        )}
        {children}
      </AppShell>
    </ShellProvider>
  );
  // After Vienne's "Reset password": a new password before anything else.
  if (user.mustChangePassword) {
    content = (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-background p-4">
        <div className="w-full max-w-md">
          <ChangePasswordForm forced />
        </div>
      </div>
    );
  }

  return (
    <div id="mm-root" className="app-root">
      {mounted && <ThemeContext.Provider value={themeValue}>{content}</ThemeContext.Provider>}
    </div>
  );
}
