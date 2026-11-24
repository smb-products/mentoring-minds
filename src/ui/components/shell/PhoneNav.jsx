import { useState } from 'react';
import { Bell, Ellipsis } from 'lucide-react';
import { NAV, allNavItems, isActive } from '../../config/nav';
import { cn } from '../../lib/cn';
import { Link, usePathname } from '../../lib/router';
import { LogoMark } from '../brand/Logo';
import { Avatar } from '../ui/Display';
import { Drawer } from '../ui/Overlay';
import { AccountPanel } from './AccountMenu';
import { NotificationsPanel, useUnreadNotifications } from './NotificationsPanel';
import { useNavBadges, useShell } from './ShellContext';

function Dot({ n }) {
  if (!n) return null;
  return <span className="tabular absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-primary-foreground ring-2 ring-card">{n > 9 ? '9+' : n}</span>;
}

function TabInner({ icon: Icon, label, active, count }) {
  return (
    <>
      <span className={cn('relative grid h-7 w-12 place-items-center rounded-full transition-colors', active ? 'bg-brand-soft text-brand-soft-foreground' : 'text-muted-foreground')}>
        <Icon size={19} strokeWidth={active ? 2.4 : 2} aria-hidden />
        <Dot n={count} />
      </span>
      <span className={cn('text-[11px] leading-none', active ? 'font-extrabold text-foreground' : 'font-bold text-muted-foreground')}>{label}</span>
    </>
  );
}

/** Phone: top row (scrolls with the page, not a fixed bar). */
export function PhoneTop() {
  const { user } = useShell();
  const unread = useUnreadNotifications();
  const [panel, setPanel] = useState(null);
  return (
    <>
      <div className="relative flex items-center gap-2.5 px-4 pt-3">
        <LogoMark size={36} />
        <span className="font-display text-[16px] font-semibold text-ink-foreground">Mentoring Minds</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPanel('alerts')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid size-10 place-items-center rounded-[10px] text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground">
            <Bell size={20} strokeWidth={2} aria-hidden />
            {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-reward ring-2 ring-ink" />}
          </button>
          <button type="button" onClick={() => setPanel('account')} className="grid size-10 place-items-center rounded-[10px]">
            <span aria-hidden><Avatar name={user.name} tone="rail" size="sm" /></span>
            <span className="sr-only">Account</span>
          </button>
        </div>
      </div>
      <Drawer open={panel === 'alerts'} onClose={() => setPanel(null)} title="Notifications">
        <div className="-mx-5 -my-5">
          <NotificationsPanel onDone={() => setPanel(null)} />
        </div>
      </Drawer>
      <Drawer open={panel === 'account'} onClose={() => setPanel(null)} title="Account">
        <div className="-mx-5 -my-5">
          <AccountPanel onDone={() => setPanel(null)} />
        </div>
      </Drawer>
    </>
  );
}

/** Phone: bottom navigation bar. Sits in the layout flow, so it never covers content. */
export function PhoneNav() {
  const { role } = useShell();
  const pathname = usePathname();
  const badges = useNavBadges();
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = NAV[role];
  const items = allNavItems(role);
  const tabs = nav.phoneTabs.map((key) => items.find((i) => i.key === key));
  const overflow = items.filter((i) => !nav.phoneTabs.includes(i.key));

  return (
    <>
      <nav aria-label="Main navigation" className="shrink-0 border-t border-border bg-card pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + (overflow.length ? 1 : 0)}, minmax(0,1fr))` }}>
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.key}>
                <Link href={item.href} aria-current={active ? 'page' : undefined} className="flex flex-col items-center gap-1 rounded-xl py-1">
                  <TabInner icon={item.icon} label={item.label} active={active} count={item.badge ? badges[item.badge] : 0} />
                </Link>
              </li>
            );
          })}
          {overflow.length > 0 && (
            <li>
              <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex w-full flex-col items-center gap-1 rounded-xl py-1">
                <TabInner icon={Ellipsis} label="More" active={overflow.some((i) => isActive(pathname, i.href))} count={overflow.reduce((n, i) => n + (i.badge ? badges[i.badge] || 0 : 0), 0)} />
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="-mx-2 -mt-2 space-y-0.5">
          {overflow.map(({ key, href, label, title, icon: Icon, badge }) => {
            const active = isActive(pathname, href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-[15px] font-bold', active ? 'bg-brand-soft text-brand-soft-foreground' : 'text-foreground hover:bg-muted')}
                >
                  <Icon size={19} strokeWidth={2.1} aria-hidden className={active ? '' : 'text-muted-foreground'} />
                  <span className="flex-1">{title ?? label}</span>
                  {badge && badges[badge] > 0 && <span className="tabular rounded-md bg-primary px-1.5 text-[12px] font-extrabold text-primary-foreground">{badges[badge]}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </>
  );
}
