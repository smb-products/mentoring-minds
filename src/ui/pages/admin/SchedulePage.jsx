'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarOff, CalendarPlus, ChevronLeft, ChevronRight, Inbox, Trash2 } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { AddSessionDrawer } from '../../components/sessions/AddSessionDrawer';
import { AdminSessionDrawer } from '../../components/sessions/AdminSessionDrawer';
import { SessionRow, sessionBg, sessionColor } from '../../components/sessions/SessionParts';
import { useShell } from '../../components/shell/ShellContext';
import { Button, IconButton } from '../../components/ui/Button';
import { Empty, PageHeader, Row, Section } from '../../components/ui/Display';
import { Field, Input } from '../../components/ui/Form';
import { useResultToast, useUndoToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { addDays, dayOfMonth, fmtDate, fmtDateWith, fmtDateYear, fmtLongDay, fmtTime, fmtWeekday, hourOf as zonedHour, isToday, minuteOf, minutesToLabel, sameDay, startOfWeek, weekdayOf } from '../../lib/format';

const HOUR_PX = 50;

/** /admin/schedule — data: scheduling.listSessions, getAvailability, listTimeOff */
export default function SchedulePage() {
  const { mode } = useShell();
  const [tab, setTab] = useState('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(null);
  const [showCancelled, setShowCancelled] = useState(false);

  const weekEnd = addDays(weekStart, 7);
  const { data: sessions = [] } = useQuery(() => api.scheduling.listSessions({ from: weekStart.toISOString(), to: weekEnd.toISOString() }), [weekStart.getTime()]);
  const { data: requests = [] } = useQuery(() => api.scheduling.listSessions({ status: 'REQUESTED' }), []);
  const { data: availability = [] } = useQuery(() => api.scheduling.getAvailability(), []);
  const { data: timeOff = [] } = useQuery(() => api.scheduling.listTimeOff(), []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visible = sessions.filter((s) => showCancelled || !['CANCELLED', 'DECLINED'].includes(s.status));
  const booked = sessions.filter((s) => ['CONFIRMED', 'COMPLETED'].includes(s.status));
  const hours = booked.reduce((n, s) => n + s.durationMin, 0) / 60;

  return (
    <>
      <PageHeader
        tabs={{ label: 'Schedule views', value: tab, onChange: setTab, items: [
          { value: 'week', label: 'Week' },
          { value: 'requests', label: 'Requests', count: requests.length },
          { value: 'timeoff', label: 'Time off' },
        ] }}
        title="Schedule"
        subtitle={`${booked.length} sessions this week, ${hours % 1 ? hours.toFixed(1) : hours} hours of teaching.`}
        actions={<Button variant="primary" icon={CalendarPlus} onClick={() => setAdding(true)}>Add session</Button>}
      >
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="glass flex items-center rounded-[10px]">
            <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} className="text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground" />
            <button type="button" onClick={() => setWeekStart(startOfWeek())} className="h-9 px-3 text-[14px] font-bold text-ink-foreground hover:bg-ink-foreground/10 @max-3xl/app:h-10">This week</button>
            <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} className="text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground" />
          </div>
          <p className="text-[16px] font-extrabold text-ink-foreground">{fmtDate(weekStart)} – {fmtDateYear(addDays(weekStart, 6))}</p>
          <div className="ml-auto flex items-center gap-4 text-[12.5px] font-bold text-ink-muted">
            <span className="hidden items-center gap-1.5 @3xl/page:flex"><span className="h-3 w-4 rounded-[3px] bg-ink-foreground/25" />Open hours</span>
            <span className="hidden items-center gap-1.5 @3xl/page:flex"><span className="h-3 w-1 rounded-full bg-chart-1" />In person</span>
            <span className="hidden items-center gap-1.5 @3xl/page:flex"><span className="h-3 w-1 rounded-full bg-chart-2" />Video call</span>
            <span className="hidden items-center gap-1.5 @3xl/page:flex"><span className="h-3 w-4 rounded-[3px] border-[1.5px] border-dashed border-reward" />Requested</span>
            <button type="button" role="switch" aria-checked={showCancelled} onClick={() => setShowCancelled(!showCancelled)} className="glass flex h-9 items-center gap-2 rounded-[10px] px-3 text-ink-foreground @max-3xl/app:h-10">
              <span className={cn('relative h-4 w-7 rounded-full transition-colors', showCancelled ? 'bg-reward' : 'bg-ink-foreground/25')}>
                <span className={cn('absolute top-0.5 size-3 rounded-full bg-ink-foreground transition-[left]', showCancelled ? 'left-3.5' : 'left-0.5')} />
              </span>
              Show cancelled
            </button>
          </div>
        </div>
      </PageHeader>

      {tab === 'week' && (
        <>
          {mode === 'desktop' ? (
            <HourGrid days={days} sessions={visible} availability={availability} timeOff={timeOff} onSelect={setSelected} onAdd={(d) => setAdding(d)} />
          ) : (
            <DayAgenda days={days} sessions={visible} timeOff={timeOff} availability={availability} onSelect={setSelected} />
          )}
        </>
      )}

      {tab === 'requests' && (
        <Section title="Waiting for you" description="Confirming tells the family right away. Declining lets you suggest another time.">
          {requests.length === 0 ? (
            <Empty icon={Inbox} title="No requests waiting">When a family asks for a time, it shows up here.</Empty>
          ) : (
            requests.map((s) => <SessionRow key={s.id} session={s} showDate onClick={() => setSelected(s)} actions={<Button size="sm" onClick={() => setSelected(s)}>Review</Button>} />)
          )}
        </Section>
      )}

      {tab === 'timeoff' && <TimeOff timeOff={timeOff} />}

      <AdminSessionDrawer session={selected} onClose={() => setSelected(null)} />
      <AddSessionDrawer open={!!adding} defaultDate={adding instanceof Date ? adding : undefined} onClose={() => setAdding(null)} />
    </>
  );
}

const offOn = (timeOff, day) => timeOff.find((o) => new Date(o.startsAt) < addDays(day, 1) && new Date(o.endsAt) >= day);
const hourOf = (iso) => zonedHour(iso) + minuteOf(iso) / 60;

/** Week as a true time grid: open hours shaded, sessions placed by time and length. */
function HourGrid({ days, sessions, availability, timeOff, onSelect, onAdd }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const starts = [...availability.map((a) => a.startMin / 60), ...sessions.map((s) => hourOf(s.startsAt))];
  const ends = [...availability.map((a) => a.endMin / 60), ...sessions.map((s) => hourOf(s.endsAt))];
  const START_H = Math.max(0, Math.floor(Math.min(15, ...starts)));
  const END_H = Math.min(24, Math.ceil(Math.max(18, ...ends)));
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const top = (h) => (h - START_H) * HOUR_PX;

  return (
    <div className="surface overflow-hidden rounded-[14px]">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border/80">
        <div />
        {days.map((d) => {
          const today = isToday(d);
          const count = sessions.filter((s) => sameDay(s.startsAt, d) && !['CANCELLED', 'DECLINED'].includes(s.status)).length;
          return (
            <div key={d.toISOString()} className={cn('border-l border-border/80 px-3 py-2.5', today && 'bg-brand-soft')}>
              <div className="flex items-baseline gap-1.5">
                <span className={cn('text-[12.5px] font-bold', today ? 'text-brand-soft-foreground' : 'text-muted-foreground')}>{fmtWeekday(d)}</span>
                <span className={cn('tabular text-[18px] font-extrabold', today && 'text-brand-soft-foreground')}>{dayOfMonth(d)}</span>
              </div>
              <p className="text-[12px] font-semibold text-subtle-foreground">{count ? `${count} session${count > 1 ? 's' : ''}` : '—'}</p>
            </div>
          );
        })}
      </div>
      <div className="max-h-[640px] overflow-y-auto">
        <div className="relative grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: hours.length * HOUR_PX }}>
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[11.5px] font-bold text-subtle-foreground" style={{ top: top(h) }}>
                {h === START_H ? '' : `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const off = offOn(timeOff, d);
            const windows = availability.filter((a) => a.weekday === weekdayOf(d));
            const list = sessions.filter((s) => sameDay(s.startsAt, d));
            const today = isToday(d);
            return (
              <div key={d.toISOString()} className={cn('relative border-l border-border/80', off && 'bg-[repeating-linear-gradient(-45deg,transparent_0_7px,var(--border)_7px_8px)]')}>
                {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: top(h) }} />)}
                {!off &&
                  windows.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onAdd(d)}
                      aria-label={`Add a session on ${fmtDateWith(d, { month: 'numeric', day: 'numeric', year: 'numeric' })}`}
                      className="absolute inset-x-1 rounded-md bg-[color-mix(in_oklch,var(--primary)_9%,transparent)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_16%,transparent)]"
                      style={{ top: top(w.startMin / 60) + 1, height: ((w.endMin - w.startMin) / 60) * HOUR_PX - 2 }}
                    />
                  ))}
                {off && (
                  <span className="absolute inset-x-2 top-3 rounded-md bg-card px-2 py-1 text-center text-[12px] font-bold text-muted-foreground shadow-raised">{off.reason || 'Time off'}</span>
                )}
                {list.map((s) => {
                  const muted = ['CANCELLED', 'DECLINED'].includes(s.status);
                  const requested = s.status === 'REQUESTED';
                  const h = ((hourOf(s.endsAt) - hourOf(s.startsAt)) * HOUR_PX) - 3;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onSelect(s)}
                      className={cn(
                        'absolute inset-x-1.5 z-10 overflow-hidden rounded-lg py-1 pl-2.5 pr-1.5 text-left shadow-raised transition-[filter] hover:brightness-[0.97]',
                        requested && 'border-[1.5px] border-dashed border-warning',
                        muted && 'opacity-55',
                      )}
                      style={{ top: top(hourOf(s.startsAt)) + 1.5, height: h, background: muted ? 'var(--muted)' : requested ? 'var(--warning-soft)' : `color-mix(in oklch, var(--${sessionColor(s)}) var(--tint), var(--card))` }}
                    >
                      {!requested && <span className={cn('absolute inset-y-0 left-0 w-[3px]', muted ? 'bg-border' : sessionBg(s))} aria-hidden />}
                      <p className={cn('truncate text-[13px] font-extrabold leading-tight', muted && 'line-through')}>{s.student.firstName} {s.student.lastName[0]}.</p>
                      {h > 34 && <p className="tabular truncate text-[11.5px] font-bold text-muted-foreground">{fmtTime(s.startsAt)}{requested ? ', requested' : s.mode === 'VIDEO' ? ', video' : ''}</p>}
                    </button>
                  );
                })}
                {today && hourOf(now.toISOString()) > START_H && hourOf(now.toISOString()) < END_H && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary" style={{ top: top(hourOf(now.toISOString())) }}>
                    <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Narrow screens: pick a day, see its sessions. */
function DayAgenda({ days, sessions, timeOff, availability, onSelect }) {
  const [day, setDay] = useState(() => days.find((d) => isToday(d)) ?? days[0]);
  useEffect(() => setDay(days.find((d) => isToday(d)) ?? days[0]), [days[0].getTime()]);
  const list = sessions.filter((s) => sameDay(s.startsAt, day));
  const off = offOn(timeOff, day);
  const windows = availability.filter((a) => a.weekday === weekdayOf(day));
  return (
    <>
      <div className="scrollbar-none -mx-4 mb-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Day">
        {days.map((d) => {
          const sel = sameDay(d, day);
          const n = sessions.filter((s) => sameDay(s.startsAt, d) && !['CANCELLED', 'DECLINED'].includes(s.status)).length;
          return (
            <button key={d.toISOString()} type="button" role="tab" aria-selected={sel} onClick={() => setDay(d)} className={cn('flex w-14 shrink-0 flex-col items-center rounded-xl py-2', sel ? 'bg-ink text-ink-foreground shadow-raised' : 'surface text-foreground')}>
              <span className={cn('text-[12px] font-bold', sel ? 'text-ink-muted' : 'text-muted-foreground')}>{fmtWeekday(d)}</span>
              <span className="tabular text-[19px] font-extrabold leading-tight">{dayOfMonth(d)}</span>
              <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', n ? (sel ? 'bg-reward' : 'bg-primary') : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
      <Section title={fmtLongDay(day)} description={off ? off.reason || 'Time off' : windows.length ? `Open ${windows.map((w) => `${minutesToLabel(w.startMin)} – ${minutesToLabel(w.endMin)}`).join(', ')}` : 'Not available'}>
        {list.length === 0 ? <Empty title="No sessions" /> : list.map((s) => <SessionRow key={s.id} session={s} onClick={() => onSelect(s)} />)}
      </Section>
    </>
  );
}

function TimeOff({ timeOff }) {
  const show = useResultToast();
  const undoable = useUndoToast();
  const [form, setForm] = useState({ start: '', end: '', reason: '' });
  const [add, adding] = useAction(api.scheduling.addTimeOff);
  const [remove] = useAction(api.scheduling.removeTimeOff);
  const upcoming = useMemo(() => timeOff.filter((o) => new Date(o.endsAt) >= new Date()), [timeOff]);

  return (
    <div className="grid gap-5 @4xl/page:grid-cols-[1.3fr_1fr]">
      <Section title="Blocked dates" description="Families can’t request sessions on these days.">
        {upcoming.length === 0 ? (
          <Empty icon={CalendarOff} title="No time off planned" />
        ) : (
          upcoming.map((o) => (
            <Row key={o.id}>
              <CalendarOff size={18} className="shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold">{fmtDate(o.startsAt)} – {fmtDateYear(o.endsAt)}</p>
                {o.reason && <p className="text-[13px] text-muted-foreground">{o.reason}</p>}
              </div>
              <Button size="sm" variant="ghost" icon={Trash2} onClick={async () => undoable(await remove({ timeOffId: o.id }), 'Time off removed', () => add({ startsAt: o.startsAt, endsAt: o.endsAt, reason: o.reason }))}>Remove</Button>
            </Row>
          ))
        )}
      </Section>
      <Section title="Add time off">
        <form
          className="space-y-4 p-4 @3xl/page:p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await add({ startsAt: new Date(`${form.start}T00:00`).toISOString(), endsAt: new Date(`${form.end}T23:59`).toISOString(), reason: form.reason });
            if (show(res, 'Time off added')) setForm({ start: '', end: '', reason: '' });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">{(id) => <Input id={id} type="date" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />}</Field>
            <Field label="Until">{(id) => <Input id={id} type="date" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />}</Field>
          </div>
          <Field label="Reason (optional)">{(id) => <Input id={id} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Spring break" />}</Field>
          <Button type="submit" variant="primary" disabled={adding}>Block these dates</Button>
        </form>
      </Section>
    </div>
  );
}
