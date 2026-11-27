import { useState } from 'react';
import { Bell, Ellipsis } from 'lucide-react';
import { NAV, allNavItems, isActive } from '../../config/nav';
import { cn } from '../../lib/cn';
import { Link, usePathname } from '../../lib/router';
import { Avatar } from '../ui/Display';
import { Drawer } from '../ui/Overlay';
import { AccountPanel } from './AccountMenu';
import { NotificationsPanel, useUnreadNotifications } from './NotificationsPanel';
import { useNavBadges, useShell } from './ShellContext';

function Dot({ n }) {
  if (!n) return null;
  return <span className="tabular absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sidebar-primary px-1 text-caption font-semibold leading-none text-sidebar-primary-foreground ring-2 ring-sidebar">{n > 9 ? '9+' : n}</span>;
}

/** One tab of the white phone nav: the selected one soft blue with blue text, like the sidebar. */
function TabInner({ icon: Icon, label, active, count }) {
  return (
    <>
      <span className={cn('relative grid h-7 w-12 place-items-center rounded-md transition-colors', active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground')}>
        <Icon size={18} strokeWidth={1.75} aria-hidden />
        <Dot n={count} />
      </span>
      <span className={cn('text-caption leading-none', active ? 'font-semibold text-sidebar-accent-foreground' : 'font-medium text-sidebar-foreground')}>{label}</span>
    </>
  );
}

/** Phone: top row on the light page (scrolls with it, not a fixed bar). The app shows a text wordmark, not the brain logo. */
export function PhoneTop() {
  const { user } = useShell();
  const unread = useUnreadNotifications();
  const [panel, setPanel] = useState(null);
  return (
    <>
      <div className="relative flex items-center gap-2.5 px-4 pt-3">
        <span className="text-heading text-foreground">Mentoring Minds</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setPanel('alerts')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Bell size={18} strokeWidth={1.75} aria-hidden />
            {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" />}
          </button>
          <button type="button" onClick={() => setPanel('account')} className="grid size-10 place-items-center rounded-md">
            <span aria-hidden><Avatar name={user.name} tone="brand" size="sm" /></span>
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

/** Phone: bottom navigation bar, white with a top border. Sits in the layout flow, so it never covers content. */
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
      <nav aria-label="Main navigation" className="shrink-0 border-t border-sidebar-border bg-sidebar pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + (overflow.length ? 1 : 0)}, minmax(0,1fr))` }}>
          {tabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.key}>
                <Link href={item.href} aria-current={active ? 'page' : undefined} className="flex flex-col items-center gap-1 rounded-md py-1 focus-visible:outline-sidebar-ring">
                  <TabInner icon={item.icon} label={item.label} active={active} count={item.badge ? badges[item.badge] : 0} />
                </Link>
              </li>
            );
          })}
          {overflow.length > 0 && (
            <li>
              <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex w-full flex-col items-center gap-1 rounded-md py-1 focus-visible:outline-sidebar-ring">
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
                  className={cn('flex items-center gap-3 rounded-md px-2 py-2.5 text-body font-medium', active ? 'bg-brand-soft text-brand-soft-foreground' : 'text-foreground hover:bg-muted')}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden className={active ? '' : 'text-muted-foreground'} />
                  <span className="flex-1">{title ?? label}</span>
                  {badge && badges[badge] > 0 && <span className="tabular rounded-md bg-primary px-1.5 text-caption font-semibold text-primary-foreground">{badges[badge]}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </Drawer>
    </>
  );
}
