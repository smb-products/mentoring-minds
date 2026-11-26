import { BellOff, CalendarCheck, CalendarClock, CalendarX, ClipboardCheck, FileBarChart, MessageSquare, RotateCcw, UserRoundCheck, Inbox } from 'lucide-react';
import { useQuery } from '../../api';
import { cn } from '../../lib/cn';
import { fmtAgo } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { useShell } from './ShellContext';

const ICONS = {
  SESSION_REQUESTED: Inbox,
  SESSION_CONFIRMED: CalendarCheck,
  SESSION_DECLINED: CalendarX,
  SESSION_CHANGED: CalendarClock,
  SESSION_CANCELLED_BY_PARENT: CalendarX,
  SESSION_REMINDER: CalendarClock,
  MESSAGE_RECEIVED: MessageSquare,
  SUBMISSION_RECEIVED: ClipboardCheck,
  INVITE_REDEEMED: UserRoundCheck,
  REPORT_PUBLISHED: FileBarChart,
  WORK_RETURNED: RotateCcw,
};

export function useUnreadNotifications() {
  const { source: api } = useShell();
  const { data } = useQuery(() => api.notifications.listForUser(), [api]);
  return (data ?? []).filter((n) => !n.readAt).length;
}

/** Notification list. Clicking an item marks it read and opens where it points. */
export function NotificationsPanel({ onDone }) {
  const { navigate } = useRouter();
  const { source: api } = useShell();
  const { data = [] } = useQuery(() => api.notifications.listForUser(), [api]);
  const unread = data.filter((n) => !n.readAt).length;

  return (
    <div className="flex max-h-[min(34rem,80vh)] w-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-extrabold">Notifications</h2>
        {unread > 0 && (
          <button type="button" onClick={() => api.notifications.markAllRead()} className="text-[13px] hit-area font-bold text-brand hover:underline">
            Mark all as read
          </button>
        )}
      </div>
      {data.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6 text-[14px] text-muted-foreground">
          <BellOff size={18} aria-hidden /> Nothing new.
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {data.map((n) => {
            const Icon = ICONS[n.type] ?? Inbox;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    api.notifications.markRead({ notificationId: n.id });
                    if (n.href) navigate(n.href);
                    onDone?.();
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60"
                >
                  <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', n.readAt ? 'bg-muted text-muted-foreground' : 'bg-brand-soft text-brand-soft-foreground')}>
                    <Icon size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-[14px] leading-snug', n.readAt ? 'font-semibold text-muted-foreground' : 'font-bold text-foreground')}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{n.body}</span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                    <span className="text-[12px] font-semibold text-subtle-foreground">{fmtAgo(n.createdAt)}</span>
                    {!n.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
