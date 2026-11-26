import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { fmtTime, hourOf, minuteOf } from '../../lib/format';
import { sessionBg, sessionColor } from './SessionParts';

/**
 * The day on a real time axis. Blocks are placed by start time and sized by length;
 * a line marks the current time. Shown on wide containers only.
 */
export function DayTimeline({ sessions, onSelect }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);

  const hoursOf = (iso) => hourOf(iso) + minuteOf(iso) / 60;
  const first = Math.min(...sessions.map((s) => Math.floor(hoursOf(s.startsAt))));
  const last = Math.max(...sessions.map((s) => Math.ceil(hoursOf(s.endsAt))));
  const startH = Math.max(0, Math.min(first - 1, 14));
  const endH = Math.min(24, Math.max(last + 1, startH + 8));
  const span = endH - startH;
  const pct = (h) => `${((h - startH) / span) * 100}%`;
  const nowH = hoursOf(now);
  const ticks = Array.from({ length: span + 1 }, (_, i) => startH + i);

  return (
    <div className="hidden px-5 pb-2 pt-5 @3xl/page:block">
      <div className="relative h-[86px]">
        {ticks.map((h) => (
          <div key={h} className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: pct(h) }}>
            <span className="tabular absolute -top-5 -translate-x-1/2 text-[11.5px] font-bold text-subtle-foreground">
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? 'a' : 'p'}
            </span>
          </div>
        ))}
        {sessions.map((s) => {
          const done = s.status !== 'CONFIRMED';
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className={cn(
                '@container absolute top-2 bottom-2 flex min-w-0 flex-col justify-center overflow-hidden rounded-lg border-l-[3px] pl-2 pr-1 text-left transition-[filter] hover:brightness-[0.97]',
                done ? 'border-border bg-muted text-muted-foreground' : 'border-transparent text-foreground',
              )}
              style={{
                ...(!done && { background: `color-mix(in oklch, var(--${sessionColor(s)}) var(--tint), var(--card))` }), left: `calc(${pct(hoursOf(s.startsAt))} + 2px)`, width: `calc(${((hoursOf(s.endsAt) - hoursOf(s.startsAt)) / span) * 100}% - 4px)` }}
            >
              {!done && <span className={cn('absolute inset-y-0 left-0 w-[3px]', sessionBg(s))} aria-hidden />}
              <span className="truncate text-[13px] font-extrabold">{s.student.firstName}</span>
              <span className="tabular sr-only truncate text-[11.5px] font-semibold opacity-80 @[3.5rem]:not-sr-only">{fmtTime(s.startsAt)}</span>
              <span className="sr-only">{s.mode === 'VIDEO' ? ', video call' : ''}</span>
            </button>
          );
        })}
        {nowH >= startH && nowH <= endH && (
          <div className="pointer-events-none absolute -bottom-1 -top-1 w-0.5 rounded-full bg-primary" style={{ left: pct(nowH) }} aria-hidden>
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
