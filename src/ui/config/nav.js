import { BookOpen, CalendarCheck, CalendarDays, ClipboardCheck, House, LibraryBig, MessagesSquare, Settings, Sprout, Sun, UsersRound } from 'lucide-react';

/**
 * Navigation per role. `href` = real Next.js route. `badge` names a count from useNavBadges().
 *   app/(admin)/admin/<page>/page.jsx   app/(parent)/parent/<page>/page.jsx
 */
export const NAV = {
  admin: {
    home: '/admin/today',
    items: [
      { key: 'today', label: 'Today', href: '/admin/today', icon: Sun },
      { key: 'schedule', label: 'Schedule', href: '/admin/schedule', icon: CalendarDays, badge: 'requests' },
      { key: 'families', label: 'Families', href: '/admin/families', icon: UsersRound },
      { key: 'content', label: 'Content', href: '/admin/content', icon: LibraryBig },
      { key: 'assignments', label: 'Work', href: '/admin/assignments', icon: ClipboardCheck, badge: 'toGrade', title: 'Assignments' },
      { key: 'messages', label: 'Messages', href: '/admin/messages', icon: MessagesSquare, badge: 'unread' },
    ],
    footer: [{ key: 'settings', label: 'Settings', href: '/admin/settings', icon: Settings }],
    phoneTabs: ['today', 'schedule', 'families', 'messages'],
  },
  parent: {
    home: '/parent/home',
    items: [
      { key: 'home', label: 'Home', href: '/parent/home', icon: House },
      { key: 'sessions', label: 'Sessions', href: '/parent/sessions', icon: CalendarCheck },
      { key: 'learning', label: 'Learning', href: '/parent/learning', icon: BookOpen, badge: 'todo' },
      { key: 'progress', label: 'Progress', href: '/parent/progress', icon: Sprout },
      { key: 'messages', label: 'Messages', href: '/parent/messages', icon: MessagesSquare, badge: 'unread' },
    ],
    footer: [],
    phoneTabs: ['home', 'sessions', 'learning', 'progress', 'messages'],
  },
};

export const allNavItems = (role) => [...NAV[role].items, ...NAV[role].footer];
export const isActive = (pathname, href) => pathname === href || pathname.startsWith(`${href}/`);
