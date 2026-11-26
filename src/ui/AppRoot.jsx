'use client';

import { useEffect, useMemo, useState } from 'react';
import { InviteCodeForm } from '@/components/family/InviteCodeForm';
import { ChangePasswordForm } from '@/components/family/ChangePasswordForm';
import { NAV } from './config/nav';
import { usePathname, useRouter } from './lib/router';
import { useStoredState } from './lib/useStoredState';
import { AppShell } from './components/shell/AppShell';
import { DemoContext, ShellProvider } from './components/shell/ShellContext';

/** Demo mode only (no session): who the shell shows. The data itself comes from the server. */
const DEMO_NAMES = { u_admin: 'Vienne', u_ana: 'Ana', u_grace: 'Grace', u_monique: 'Monique' };

/**
 * Client root for every signed-in screen (both route groups render it from their layout).
 *
 * Signed in (`user` = the Auth.js session user from the layout): role, text size and the
 * shell's user come from the session.
 * Demo mode (no `user`): a demo account — Vienne on /admin, the parent chosen in the
 * account menu on /parent. Every area reads the real server, which needs a session.
 *
 * Nothing renders on the server (`mounted`): that avoids hydration mismatches from
 * "now"-relative dates.
 */
export function AppRoot({ user, children }) {
  const pathname = usePathname();
  const { navigate } = useRouter();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useStoredState('mm.demo.theme', 'light');
  const [parentId, setParentId] = useStoredState('mm.demo.parent', 'u_ana');
  const role = user ? (user.role === 'ADMIN' ? 'admin' : 'parent') : pathname.startsWith('/parent') ? 'parent' : 'admin';
  const userId = user ? user.id : role === 'parent' ? parentId : 'u_admin';
  const shellUser = useMemo(
    () => user ?? { id: userId, role: role === 'admin' ? 'ADMIN' : 'PARENT', status: 'ACTIVE', name: DEMO_NAMES[userId] ?? 'Demo parent', email: '', textSize: 'NORMAL' },
    [user, userId, role],
  );

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const demo = useMemo(
    () => ({
      isDemo: !user,
      userId,
      setUserId: (id) => {
        if (id !== 'u_admin') setParentId(id);
        navigate(NAV[id === 'u_admin' ? 'admin' : 'parent'].home);
      },
      theme,
      setTheme,
    }),
    [user, userId, theme, setTheme, navigate, setParentId],
  );

  let content = (
    <ShellProvider key={userId} sessionUser={shellUser}>
      <AppShell>
        {user?.status === 'PREVIEW' && (
          <div className="mb-5">
            <InviteCodeForm />
          </div>
        )}
        {children}
      </AppShell>
    </ShellProvider>
  );
  // After Vienne's "Reset password": a new password before anything else.
  if (user?.mustChangePassword) {
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
      {mounted && <DemoContext.Provider value={demo}>{content}</DemoContext.Provider>}
    </div>
  );
}
