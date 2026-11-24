import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth, useQuery } from '../../api';

/**
 * Signed-in user, their children (parents), the selected child and the layout mode.
 * PORTING: user = Auth.js session; selected child lives in the URL (?child=<id>).
 */
const ShellContext = createContext(null);
const LayoutContext = createContext('desktop');

export function ShellProvider({ children }) {
  // Re-read the signed-in user on every change (text size, name…).
  const fresh = useQuery(() => ({ ...auth() }), []);
  const user = fresh.data?.id === auth()?.id ? fresh.data : auth();
  useEffect(() => {
    const root = document.getElementById('mm-root');
    if (root) root.dataset.text = user.textSize || 'NORMAL';
  }, [user.textSize]);
  const role = user.role === 'ADMIN' ? 'admin' : 'parent';
  const family = useQuery(() => (role === 'parent' ? api.families.getFamily({ parentId: user.id }) : null), [user.id]);
  const students = family.data?.students ?? [];
  const [activeStudentId, setActiveStudentId] = useState(null);

  useEffect(() => {
    setActiveStudentId(null);
  }, [user.id]);

  const value = useMemo(
    () => ({
      user,
      role,
      students,
      activeStudent: students.find((s) => s.id === activeStudentId) ?? students[0] ?? null,
      setActiveStudentId,
    }),
    [user, role, students, activeStudentId],
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
  const { role, activeStudent } = useShell();
  const { data } = useQuery(async () => {
    if (role === 'admin') {
      const [today, unread] = await Promise.all([api.dashboard.getAdminToday(), api.messages.unreadCount()]);
      return { requests: today.pendingRequests.length, toGrade: today.gradingQueue.length, unread };
    }
    if (!activeStudent) return {};
    const overview = await api.dashboard.getParentOverview({ studentId: activeStudent.id });
    return { todo: overview.todo.length, unread: overview.unreadMessages };
  }, [role, activeStudent?.id]);
  return data ?? {};
}

/** Prototype-only: demo user switch + theme. */
export const DemoContext = createContext({ userId: 'u_admin', setUserId: () => {}, theme: 'light', setTheme: () => {} });
export const useDemo = () => useContext(DemoContext);
