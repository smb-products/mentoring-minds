import { useEffect, useMemo, useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { cn } from '../../lib/cn';
import { addDays, dayOfMonth, fmtDay, fmtLongDay, fmtTime, fmtWeekday, hourOf, sameDay, startOfDay } from '../../lib/format';
import { Button } from '../ui/Button';
import { Empty } from '../ui/Display';
import { Field, Input, Segmented, Textarea } from '../ui/Form';
import { Drawer } from '../ui/Overlay';
import { useResultToast } from '../ui/Toast';

/** One numbered step of the booking flow (the steps are a real sequence). */
function Step({ n, title, done, children }) {
  return (
    <section className="relative pl-10">
      <span className={cn('tabular absolute left-0 top-0 grid size-7 place-items-center rounded-md text-small font-semibold', done ? 'bg-brand-soft text-brand-soft-foreground' : 'bg-muted text-muted-foreground')}>{n}</span>
      <h3 className="pt-1 text-heading">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Parent booking flow. Slots come from scheduling.getOpenSlots (availability minus
 * time off and booked sessions). Writes: scheduling.requestSession.
 */
export function RequestSessionDrawer({ open, onClose, student }) {
  const show = useResultToast();
  const { data: locations = [] } = useQuery(() => api.scheduling.listLocations(), []);
  const [form, setForm] = useState({ mode: 'IN_PERSON', durationMin: 45, locationId: 'loc_studio', address: '', parentNote: '' });
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [sent, setSent] = useState(null);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const [request, sending] = useAction(api.scheduling.requestSession);

  useEffect(() => {
    if (open && student) {
      setForm((f) => ({ ...f, durationMin: student.grade === 0 ? 30 : 45 }));
      setSent(null);
      setSlot(null);
    }
  }, [open, student?.id]);

  const from = startOfDay(addDays(new Date(), 1)).toISOString();
  const to = addDays(new Date(), 28).toISOString();
  const { data: slots = [] } = useQuery(
    () => (open ? api.scheduling.getOpenSlots({ durationMin: form.durationMin, mode: form.mode, locationId: form.locationId, address: form.address, from, to }) : []),
    [open, form.durationMin, form.mode, form.locationId],
  );
  const days = useMemo(() => {
    const map = new Map();
    slots.forEach((s) => {
      const key = startOfDay(s.startsAt).toISOString();
      map.set(key, [...(map.get(key) ?? []), s]);
    });
    return [...map.entries()].map(([key, list]) => ({ day: new Date(key), slots: list }));
  }, [slots]);

  useEffect(() => {
    if (days.length && (!day || !days.some((d) => sameDay(d.day, day)))) setDay(days[0].day);
    setSlot(null);
  }, [days]);

  if (!student) return null;
  const location = locations.find((l) => l.id === form.locationId);
  const daySlots = days.find((d) => day && sameDay(d.day, day))?.slots ?? [];
  const groups = [
    ['Morning', daySlots.filter((s) => hourOf(s.startsAt) < 12)],
    ['Afternoon', daySlots.filter((s) => hourOf(s.startsAt) >= 12 && hourOf(s.startsAt) < 17)],
    ['Evening', daySlots.filter((s) => hourOf(s.startsAt) >= 17)],
  ].filter(([, l]) => l.length);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="w-[520px]"
      title={sent ? 'Request sent' : `Request a session for ${student.firstName}`}
      subtitle={sent ? null : 'Vienne confirms every request. You’ll get a notification when she does.'}
      footer={
        sent ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            <div className="mr-auto min-w-0">
              {slot ? (
                <>
                  <p className="truncate text-body font-medium">{fmtDay(slot.startsAt)} at {fmtTime(slot.startsAt)}</p>
                  <p className="truncate text-small text-muted-foreground">{form.durationMin} minutes, {form.mode === 'VIDEO' ? 'video call' : location?.kind === 'HOME' ? 'at your home' : location?.name}</p>
                </>
              ) : (
                <p className="text-small font-medium text-muted-foreground">Choose a time to continue</p>
              )}
            </div>
            <Button
              variant="primary"
              disabled={!slot || sending || (form.mode === 'IN_PERSON' && location?.kind === 'HOME' && !form.address.trim())}
              onClick={async () => {
                const data = show(await request({ studentId: student.id, mode: form.mode, locationId: form.locationId, address: form.address, startsAt: slot.startsAt, durationMin: form.durationMin, parentNote: form.parentNote }));
                if (data) setSent(data);
              }}
            >
              Send request
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="space-y-3">
          <p className="text-body">
            You asked for <span className="font-semibold">{fmtLongDay(sent.startsAt)} at {fmtTime(sent.startsAt)}</span>, {sent.durationMin} minutes{sent.mode === 'VIDEO' ? ' by video call' : ''} for {student.firstName}.
          </p>
          <p className="text-body text-muted-foreground">The time is held for you until Vienne answers. You can see it under Sessions, in Waiting on Vienne.</p>
        </div>
      ) : (
        <div className="space-y-7">
          <Step n={1} title="How long" done>
            <Segmented label="Length" value={form.durationMin} onChange={(durationMin) => set({ durationMin })} className="w-full" options={[30, 45, 60].map((m) => ({ value: m, label: `${m} min` }))} />
          </Step>
          <Step n={2} title="How" done>
            <Segmented label="How" value={form.mode} onChange={(mode) => set({ mode })} className="w-full" options={[{ value: 'IN_PERSON', label: 'In person' }, { value: 'VIDEO', label: 'Video call' }]} />
            {form.mode === 'VIDEO' ? (
              <p className="mt-3 text-body text-muted-foreground">1-on-1 with Vienne. {student.firstName} joins on your phone or tablet, and a Join call button appears just before it starts.</p>
            ) : (
            <>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Where">
              {locations.map((l) => {
                const sel = form.locationId === l.id;
                return (
                  <button key={l.id} type="button" role="radio" aria-checked={sel} onClick={() => set({ locationId: l.id })} className={cn('rounded-md border px-2.5 py-2.5 text-left transition-colors', sel ? 'border-primary bg-brand-soft ring-1 ring-primary' : 'border-border bg-card hover:bg-accent')}>
                    <span className={cn('block text-small font-medium leading-tight', sel && 'text-brand-soft-foreground')}>{l.kind === 'HOME' ? 'Our home' : l.kind === 'TUTOR' ? 'Vienne’s studio' : 'Library'}</span>
                    <span className="mt-0.5 block truncate text-caption font-normal text-muted-foreground">{l.kind === 'HOME' ? 'Vienne comes to you' : l.address}</span>
                  </button>
                );
              })}
            </div>
            {location?.kind === 'HOME' && <div className="mt-3"><Field label="Your address">{(id) => <Input id={id} value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street address" />}</Field></div>}
            </>
            )}
          </Step>
          <Step n={3} title="Day" done={!!day}>
            {days.length === 0 ? (
              <div className="rounded-lg border border-border"><Empty icon={CalendarSearch} title="No open times in the next four weeks">Try a shorter session or another place, or message Vienne.</Empty></div>
            ) : (
              <div className="scrollbar-none -mr-5 flex gap-2 overflow-x-auto pb-1 pr-5" role="radiogroup" aria-label="Day">
                {days.map(({ day: d, slots: list }) => {
                  const selected = day && sameDay(d, day);
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setDay(d);
                        setSlot(null);
                      }}
                      className={cn('flex w-[4.25rem] shrink-0 flex-col items-center rounded-md border py-2 transition-colors', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}
                    >
                      <span className={cn('text-caption', selected ? 'text-primary-foreground' : 'text-muted-foreground')}>{fmtWeekday(d)}</span>
                      <span className="tabular text-title leading-tight">{dayOfMonth(d)}</span>
                      <span className={cn('text-caption', selected ? 'text-primary-foreground' : 'text-muted-foreground')}>{list.length} open</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Step>
          <Step n={4} title="Time" done={!!slot}>
            <div className="space-y-3">
              {groups.map(([label, list]) => (
                <div key={label}>
                  <p className="mb-1.5 text-caption text-muted-foreground">{label}</p>
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={`${label} times`}>
                    {list.map((s) => {
                      const selected = slot?.startsAt === s.startsAt;
                      return (
                        <button
                          key={s.startsAt}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setSlot(s)}
                          className={cn('tabular h-10 rounded-md border text-body font-medium transition-colors', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent')}
                        >
                          {fmtTime(s.startsAt)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Step>
          <Field label="Anything Vienne should know? (optional)">
            {(id) => <Textarea id={id} rows={2} value={form.parentNote} onChange={(e) => set({ parentNote: e.target.value })} placeholder="Math quiz on Friday…" />}
          </Field>
        </div>
      )}
    </Drawer>
  );
}
