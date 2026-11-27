import { useCallback, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NAV, isActive } from '../../config/nav';
import { cn } from '../../lib/cn';
import { Link, usePathname } from '../../lib/router';
import { Avatar } from '../ui/Display';
import { Popover } from '../ui/Overlay';
import { AccountPanel } from './AccountMenu';
import { NotificationsPanel, useUnreadNotifications } from './NotificationsPanel';
import { useNavBadges, useShell } from './ShellContext';

/** Badges that count work for Vienne to check use the amber tint; every other count is solid blue. */
const AMBER = new Set(['toGrade']);

const ROW = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-body transition-colors focus-visible:outline-sidebar-ring';

function Count({ n, amber }) {
  if (!n) return null;
  return (
    <span className={cn('tabular ml-auto grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full px-1.5 text-caption font-semibold leading-none', amber ? 'bg-tile-amber text-tile-amber-foreground' : 'bg-sidebar-primary text-sidebar-primary-foreground')}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

function RailLink({ item, active, count }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={item.title}
      className={cn(ROW, active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground font-medium hover:bg-accent hover:text-accent-foreground')}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Count n={count} amber={AMBER.has(item.badge)} />
    </Link>
  );
}

function RailButton({ icon: Icon, label, count, onClick, expanded, buttonRef }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className={cn(ROW, expanded ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-sidebar-foreground font-medium hover:bg-accent hover:text-accent-foreground')}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Count n={count} />
    </button>
  );
}

/** The white sidebar for tablet and desktop: the wordmark, the nav, then Settings, Alerts and the Account control. */
export function Rail() {
  const { role, user } = useShell();
  const pathname = usePathname();
  const badges = useNavBadges();
  const unreadAlerts = useUnreadNotifications();
  const [panel, setPanel] = useState(null);
  const alertsRef = useRef(null);
  const accountRef = useRef(null);
  const close = useCallback(() => setPanel(null), []);
  const nav = NAV[role];

  return (
    <aside aria-label="Main navigation" className="relative z-20 flex h-full w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3.5 pb-3 pt-5">
      {/* Text wordmark in the app; the brain logo is only on sign-in and the landing page. */}
      <Link href={nav.home} aria-label="Mentoring Minds home" className="mb-5 self-start rounded-md px-2 py-1 text-heading text-foreground focus-visible:outline-sidebar-ring">
        Mentoring Minds
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {nav.items.map((item) => (
          <RailLink key={item.key} item={item} active={isActive(pathname, item.href)} count={item.badge ? badges[item.badge] : 0} />
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        {nav.footer.map((item) => (
          <RailLink key={item.key} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="relative">
          <RailButton icon={Bell} label="Alerts" count={unreadAlerts} expanded={panel === 'alerts'} buttonRef={alertsRef} onClick={() => setPanel((p) => (p === 'alerts' ? null : 'alerts'))} />
          <Popover open={panel === 'alerts'} onClose={close} ignoreRef={alertsRef} className="bottom-0 left-full ml-3 w-[23rem]" label="Notifications">
            <NotificationsPanel onDone={close} />
          </Popover>
        </div>
        <div className="relative mt-1.5 border-t border-sidebar-border pt-1.5">
          <button
            ref={accountRef}
            type="button"
            onClick={() => setPanel((p) => (p === 'account' ? null : 'account'))}
            aria-expanded={panel === 'account'}
            aria-haspopup="dialog"
            className={cn(ROW, panel === 'account' ? 'bg-sidebar-accent' : 'hover:bg-accent')}
          >
            <span className="sr-only">Account: </span>
            <Avatar name={user.name} tone="brand" size="sm" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-semibold text-foreground">{user.name}</span>
              <span className="text-caption text-subtle-foreground">{role === 'admin' ? 'Admin' : 'Parent'}</span>
            </span>
          </button>
          <Popover open={panel === 'account'} onClose={close} ignoreRef={accountRef} className="bottom-0 left-full ml-3 w-[19rem]" label="Account">
            <AccountPanel onDone={close} />
          </Popover>
        </div>
      </div>
    </aside>
  );
}
