import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, useQuery } from '../../api';

/**
 * Signed-in user, their children (parents), the selected child and the layout mode.
 * `sessionUser` is the Auth.js session user AppRoot passes in. Selected child lives in state.
 */
const ShellContext = createContext(null);

/**
 * For the shell's own reads, which render outside the page's error boundary: an account that isn't
 * active (PREVIEW, PAUSED, or paused while signed in) gets `fallback` instead of a thrown NOT_ACTIVE.
 * Use as `.catch(unlessLocked([]))`.
 */
export const unlessLocked = (fallback = null) => (error) => {
  if (error?.code === 'NOT_ACTIVE') return fallback;
  throw error;
};
const LayoutContext = createContext('desktop');

export function ShellProvider({ sessionUser, children }) {
  const user = sessionUser;
  useEffect(() => {
    const root = document.getElementById('mm-root');
    if (root) root.dataset.text = user.textSize || 'NORMAL';
  }, [user.textSize]);
  const role = user.role === 'ADMIN' ? 'admin' : 'parent';
  // The shell's own reads (family, badges, the bell).
  const source = api;
  const families = api.families;
  const family = useQuery(() => (role === 'parent' ? families.getFamily({ parentId: user.id }).catch(unlessLocked()) : null), [user.id, families]);
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
  const { role, user, source, activeStudent } = useShell();
  const active = role === 'admin' || user.status === 'ACTIVE';
  const { data } = useQuery(async () => {
    if (role === 'admin') {
      const [today, unread] = await Promise.all([source.dashboard.getAdminToday(), source.messages.unreadCount()]);
      return { requests: today.pendingRequests.length, toGrade: today.gradingQueue.length, unread };
    }
    if (!activeStudent || !active) return {};
    const overview = await source.dashboard.getParentOverview({ studentId: activeStudent.id }).catch(unlessLocked());
    return overview ? { todo: overview.todo.length, unread: overview.unreadMessages } : {};
  }, [role, source, activeStudent?.id, active]);
  return data ?? {};
}

/** Light or dark (the account menu's Appearance). */
export const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);
