import { Building2, Home, Library, MapPin, Video } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtAgo, fmtDateWith, fmtTime, fullName } from '../../lib/format';
import { Avatar, StatusBadge, subjectBg } from '../ui/Display';

export const LOCATION_ICON = { TUTOR: Building2, HOME: Home, LIBRARY: Library, VIDEO: Video };

/** In person sessions use the brand series, video calls the second series, everywhere. */
export const sessionColor = (s) => (s.mode === 'VIDEO' ? 'chart-2' : 'chart-1');
export const sessionBg = (s) => subjectBg(sessionColor(s));

/** Is the Join call button live? (opens `joinOpensMin` before the start, closes at the end) */
export const joinOpen = (s, opensMin = 15, now = Date.now()) =>
  s.mode === 'VIDEO' && s.status === 'CONFIRMED' && now >= new Date(s.startsAt).getTime() - opensMin * 60000 && now <= new Date(s.endsAt).getTime();

/** Where a session happens, in words. */
export function placeLabel(session, { forParent } = {}) {
  if (session.mode === 'VIDEO') return 'Video call';
  const kind = session.location?.kind;
  if (kind === 'HOME') return forParent ? 'At your home' : `Home visit, ${session.address}`;
  if (kind === 'LIBRARY') return session.location.name;
  return forParent ? 'Vienne’s studio' : 'Studio';
}

export function Place({ session, forParent, className }) {
  const Icon = session.mode === 'VIDEO' ? Video : LOCATION_ICON[session.location?.kind] ?? MapPin;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-small text-muted-foreground', className)}>
      <Icon size={14} strokeWidth={1.75} className="shrink-0" aria-hidden />
      <span className="truncate">{placeLabel(session, { forParent })}</span>
    </span>
  );
}

/**
 * One session as a row: time column, colored subject edge, who/what/where, status, trailing actions.
 */
export function SessionRow({ session, onClick, actions, showDate, forParent, className }) {
  const s = session;
  const muted = ['CANCELLED', 'DECLINED'].includes(s.status);
  const Comp = onClick ? 'button' : 'div';
  return (
    // The row sizes itself to its own column, not the page, so half-width lists stack their actions.
    <div className="@container/row">
    <div className={cn('flex flex-wrap items-stretch gap-x-3 gap-y-2 px-4 py-3 @2xl/row:flex-nowrap @3xl/page:px-5', className)}>
      <Comp
        {...(onClick && { type: 'button', onClick })}
        className={cn('flex min-w-0 flex-1 items-stretch gap-3 text-left', onClick && 'group')}
      >
        <div className="tabular w-[4.6rem] shrink-0 pt-0.5">
          {showDate && <p className="text-small font-medium text-muted-foreground">{fmtDateWith(s.startsAt, { weekday: 'short', day: 'numeric' })}</p>}
          <p className={cn('text-body font-semibold', muted ? 'text-subtle-foreground line-through' : 'text-foreground')}>{fmtTime(s.startsAt)}</p>
          <p className="text-small text-subtle-foreground">{s.durationMin} min</p>
        </div>
        <span className={cn('w-[3px] shrink-0 rounded-xs', muted ? 'bg-border' : sessionBg(s))} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!forParent && <Avatar name={fullName(s.student)} tone={s.student.avatarColor} size="xs" />}
            <p className={cn('truncate text-heading group-hover:underline group-hover:decoration-border group-hover:underline-offset-4', muted && 'text-muted-foreground')}>
              {forParent ? `${s.student.firstName} with Vienne` : fullName(s.student)}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Place session={s} forParent={forParent} />
          </div>
          {s.status === 'REQUESTED' && !forParent && (
            <p className="mt-1 text-small text-subtle-foreground">Asked {fmtAgo(s.createdAt).toLowerCase()} by {s.requestedBy?.name}</p>
          )}
          {s.parentNote && s.status === 'REQUESTED' && <p className="mt-1.5 max-w-prose rounded-md bg-muted/70 px-2.5 py-1.5 text-small text-muted-foreground">“{s.parentNote}”</p>}
        </div>
      </Comp>
      {(s.status !== 'CONFIRMED' || actions) && (
        <div className={cn('flex shrink-0 items-center gap-2', actions ? 'w-full justify-end @2xl/row:w-auto' : 'self-start @2xl/row:self-center')}>
          {s.status !== 'CONFIRMED' && <StatusBadge status={s.status} className={actions ? 'mr-auto @2xl/row:mr-0' : ''} />}
          {actions}
        </div>
      )}
    </div>
    </div>
  );
}
