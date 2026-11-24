import { useCallback, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { NAV, isActive } from '../../config/nav';
import { cn } from '../../lib/cn';
import { Link, usePathname } from '../../lib/router';
import { LogoMark } from '../brand/Logo';
import { Avatar } from '../ui/Display';
import { Popover } from '../ui/Overlay';
import { AccountPanel } from './AccountMenu';
import { NotificationsPanel, useUnreadNotifications } from './NotificationsPanel';
import { useNavBadges, useShell } from './ShellContext';

function Count({ n }) {
  if (!n) return null;
  return (
    <span className="tabular absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-sidebar-primary px-1 text-[10.5px] font-extrabold text-sidebar-primary-foreground ring-2 ring-sidebar">
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
      className="group flex w-[72px] flex-col items-center gap-1 rounded-xl py-1.5 outline-offset-0 focus-visible:outline-sidebar-ring"
    >
      <span
        className={cn(
          'relative grid h-8 w-12 place-items-center rounded-full transition-colors',
          active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground',
        )}
      >
        <Icon size={19} strokeWidth={active ? 2.4 : 2} aria-hidden />
        <Count n={count} />
      </span>
      <span className={cn('text-[11.5px] font-bold leading-none', active ? 'text-sidebar-accent-foreground' : 'text-sidebar-foreground group-hover:text-sidebar-accent-foreground')}>
        {item.label}
      </span>
    </Link>
  );
}

function RailButton({ icon: Icon, label, count, onClick, expanded, buttonRef, children }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      className="group flex w-[72px] flex-col items-center gap-1 rounded-xl py-1.5 focus-visible:outline-sidebar-ring"
    >
      <span className={cn('relative grid h-8 w-12 place-items-center rounded-full transition-colors', expanded ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground')}>
        {children ?? <Icon size={19} strokeWidth={2} aria-hidden />}
        <Count n={count} />
      </span>
      <span className="text-[11.5px] font-bold leading-none text-sidebar-foreground group-hover:text-sidebar-accent-foreground">{label}</span>
    </button>
  );
}

/** Navigation rail for tablet and desktop. */
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
    <aside aria-label="Main navigation" className="relative z-20 flex h-full w-[88px] shrink-0 flex-col items-center bg-sidebar pb-3 pt-4">
      <Link href={nav.home} aria-label="Mentoring Minds home" className="mb-5 rounded-full">
        <LogoMark size={50} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {nav.items.map((item) => (
          <RailLink key={item.key} item={item} active={isActive(pathname, item.href)} count={item.badge ? badges[item.badge] : 0} />
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1.5">
        <span className="mb-1 h-px w-10 bg-sidebar-border" aria-hidden />
        {nav.footer.map((item) => (
          <RailLink key={item.key} item={item} active={isActive(pathname, item.href)} />
        ))}
        <div className="relative">
          <RailButton icon={Bell} label="Alerts" count={unreadAlerts} expanded={panel === 'alerts'} buttonRef={alertsRef} onClick={() => setPanel((p) => (p === 'alerts' ? null : 'alerts'))} />
          <Popover open={panel === 'alerts'} onClose={close} ignoreRef={alertsRef} className="bottom-0 left-full ml-3 w-[23rem]" label="Notifications">
            <NotificationsPanel onDone={close} />
          </Popover>
        </div>
        <div className="relative mt-1">
          <RailButton label="Account" expanded={panel === 'account'} buttonRef={accountRef} onClick={() => setPanel((p) => (p === 'account' ? null : 'account'))}>
            <Avatar name={user.name} tone="rail" size="sm" />
          </RailButton>
          <Popover open={panel === 'account'} onClose={close} ignoreRef={accountRef} className="bottom-0 left-full ml-3 w-[19rem]" label="Account">
            <AccountPanel onDone={close} />
          </Popover>
        </div>
      </div>
    </aside>
  );
}
