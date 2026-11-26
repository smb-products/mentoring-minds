import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth, useQuery } from '../../api';
import { live } from '../../api/live';

/**
 * Signed-in user, their children (parents), the selected child and the layout mode.
 * `sessionUser` is the Auth.js session user AppRoot passes in (absent in demo mode, where
 * the mock's demo account is used). Selected child lives in state.
 */
const ShellContext = createContext(null);
const LayoutContext = createContext('desktop');

export function ShellProvider({ sessionUser, children }) {
  // Demo mode: re-read the mock's signed-in user on every change (text size, name…).
  const fresh = useQuery(() => (sessionUser ? null : { ...auth() }), [Boolean(sessionUser)]);
  const user = sessionUser ?? (fresh.data?.id === auth()?.id ? fresh.data : auth());
  useEffect(() => {
    const root = document.getElementById('mm-root');
    if (root) root.dataset.text = user.textSize || 'NORMAL';
  }, [user.textSize]);
  const role = user.role === 'ADMIN' ? 'admin' : 'parent';
  // The shell's own reads (family, badges, the bell). A signed-in person the mock doesn't
  // know (a new sign-up) reads them from the real server, so the shell still works for them.
  const source = sessionUser && auth()?.id !== sessionUser.id ? live : api;
  // Signed in: the account's own family always comes from the real server.
  const families = sessionUser ? live.families : api.families;
  const family = useQuery(() => (role === 'parent' ? families.getFamily({ parentId: user.id }) : null), [user.id, families]);
  const students = family.data?.students ?? [];
  const [activeStudentId, setActiveStudentId] = useState(null);

  useEffect(() => {
    setActiveStudentId(null);
  }, [user.id]);

  const value = useMemo(
    () => ({
      user,
      role,
      source,
      students,
      activeStudent: students.find((s) => s.id === activeStudentId) ?? students[0] ?? null,
      setActiveStudentId,
    }),
    [user, role, source, students, activeStudentId],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export const LayoutProvider = LayoutContext.Provider;

export function useShell() {
  const shell = useContext(ShellContext);
  const mode = useContext(LayoutContext);
  return { ...shell, mode };
}

/** Counts shown on nav items. */
export function useNavBadges() {
  const { role, source, activeStudent } = useShell();
  const { data } = useQuery(async () => {
    if (role === 'admin') {
      const [today, unread] = await Promise.all([source.dashboard.getAdminToday(), source.messages.unreadCount()]);
      return { requests: today.pendingRequests.length, toGrade: today.gradingQueue.length, unread };
    }
    if (!activeStudent) return {};
    const overview = await source.dashboard.getParentOverview({ studentId: activeStudent.id });
    return { todo: overview.todo.length, unread: overview.unreadMessages };
  }, [role, source, activeStudent?.id]);
  return data ?? {};
}

/** Theme, plus the demo user switch (demo mode only: `isDemo`). */
export const DemoContext = createContext({ isDemo: true, userId: 'u_admin', setUserId: () => {}, theme: 'light', setTheme: () => {} });
export const useDemo = () => useContext(DemoContext);
