'use client';

import { useEffect, useMemo, useState } from 'react';
import { setSessionUser } from './api';
import { NAV } from './config/nav';
import { usePathname, useRouter } from './lib/router';
import { useStoredState } from './lib/useStoredState';
import { AppShell } from './components/shell/AppShell';
import { DemoContext, ShellProvider } from './components/shell/ShellContext';

/**
 * Client root for every signed-in screen (both route groups render it from their layout).
 *
 * SCAFFOLD (demo mode): the signed-in user is a demo account from the mock data —
 * Vienne on /admin, the parent chosen in the account menu on /parent.
 * GOING LIVE: pass the Auth.js session user in from the layout and drop DemoContext.
 *
 * The mock data is created in the browser, so nothing renders on the server
 * (`mounted`): that avoids hydration mismatches from "now"-relative demo dates.
 */
export function AppRoot({ children }) {
  const pathname = usePathname();
  const { navigate } = useRouter();
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useStoredState('mm.demo.theme', 'light');
  const [parentId, setParentId] = useStoredState('mm.demo.parent', 'u_ana');
  const role = pathname.startsWith('/parent') ? 'parent' : 'admin';
  const userId = role === 'parent' ? parentId : 'u_admin';
  setSessionUser(userId, { silent: true }); // the shell remounts (key) when the demo user changes

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const demo = useMemo(
    () => ({
      userId,
      setUserId: (id) => {
        if (id !== 'u_admin') setParentId(id);
        navigate(NAV[id === 'u_admin' ? 'admin' : 'parent'].home);
      },
      theme,
      setTheme,
    }),
    [userId, theme, setTheme, navigate, setParentId],
  );

  return (
    <div id="mm-root" className="app-root">
      {mounted && (
        <DemoContext.Provider value={demo}>
          <ShellProvider key={userId}>
            <AppShell>{children}</AppShell>
          </ShellProvider>
        </DemoContext.Provider>
      )}
    </div>
  );
}
