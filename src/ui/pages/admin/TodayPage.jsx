'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CalendarClock, CalendarPlus, CalendarRange, ClipboardCheck, ExternalLink, Flag, Inbox, MailQuestion, Sun, Video } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { AddSessionDrawer } from '../../components/sessions/AddSessionDrawer';
import { AdminSessionDrawer } from '../../components/sessions/AdminSessionDrawer';
import { DayTimeline } from '../../components/sessions/DayTimeline';
import { joinOpen, Place, SessionRow, sessionBg } from '../../components/sessions/SessionParts';
import { Button } from '../../components/ui/Button';
import { Avatar, Empty, Figures, PageHeader, Row, Section } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { useResultToast } from '../../components/ui/Toast';
import { useShell } from '../../components/shell/ShellContext';
import { cn } from '../../lib/cn';
import { addDays, fmtAgo, fmtLongDay, fmtRelativeDay, fmtTime, fmtTimeRange, fullName, gradeLabel, greeting, isToday, mapsUrl, sameDay, startOfWeek } from '../../lib/format';
import { useRouter } from '../../lib/router';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const until = (iso, now) => {
  const min = Math.round((new Date(iso) - now) / 60000);
  if (min <= 0) return 'Happening now';
  if (min < 60) return `Starts in ${min} min`;
  if (min < 24 * 60) return `Starts in ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
  return fmtRelativeDay(iso);
};

/** /admin/today — data: dashboard.getAdminToday, scheduling.listSessions (this week) */
export default function TodayPage() {
  const { user } = useShell();
  const { navigate } = useRouter();
  const show = useResultToast();
  const now = useNow();
  const { data } = useQuery(() => api.dashboard.getAdminToday(), []);
  const weekStart = startOfWeek();
  const { data: week = [] } = useQuery(() => api.scheduling.listSessions({ from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString(), status: ['CONFIRMED', 'COMPLETED', 'REQUESTED'] }), []);
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [confirm] = useAction(api.scheduling.confirmSession);
  if (!data) return <PageLoading />;

  const remaining = data.sessionsToday.filter((s) => s.status === 'CONFIRMED' && new Date(s.endsAt) > now);
  const next = remaining[0] ?? data.nextUp[0] ?? null;
  const oldest = [...data.pendingRequests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  return (
    <>
      <PageHeader
        overlap
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`${fmtLongDay(now)}. ${remaining.length ? `${remaining.length} session${remaining.length > 1 ? 's' : ''} still to go today.` : 'Nothing else on today.'}`}
        actions={<Button variant="glass" icon={CalendarPlus} onClick={() => setAdding(true)}>Add session</Button>}
      >
        <Figures
          variant="band"
          className="mt-6"
          items={[
            { label: 'Sessions today', value: data.sessionsToday.length, icon: CalendarClock, note: remaining.length ? `Next at ${fmtTime(remaining[0].startsAt)}` : 'All done for today' },
            { label: 'Requests', value: data.pendingRequests.length, icon: MailQuestion, highlight: data.pendingRequests.length > 0, onClick: () => navigate('/admin/schedule'), note: oldest ? `Oldest asked ${fmtAgo(oldest.createdAt).toLowerCase()}` : 'Nothing waiting' },
            { label: 'To check', value: data.gradingQueue.length, icon: ClipboardCheck, highlight: data.gradingQueue.length > 0, onClick: () => navigate('/admin/assignments'), note: data.gradingQueue.length ? data.gradingQueue.map((g) => g.student.firstName).join(', ') : 'All caught up' },
            data.fastWindow
              ? { label: `FAST ${data.fastWindow.window}`, value: data.fastWindow.inProgress ? 'Now' : `${data.fastWindow.daysUntil} days`, icon: Flag, note: `${data.fastStudents} students in grades 3–6` }
              : { label: 'FAST', value: '—', icon: Flag, note: 'Add testing dates in Settings', onClick: () => navigate('/admin/settings') },
          ]}
        />
      </PageHeader>

      <div className="mb-5 grid gap-5 @4xl/page:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <UpNext session={next} later={remaining.filter((s) => s.id !== next?.id)} now={now} onOpen={() => next && setSelected(next)} onSelect={setSelected} onAdd={() => setAdding(true)} />
        <WeekGlance week={week} weekStart={weekStart} now={now} onOpen={() => navigate('/admin/schedule')} />
      </div>

      <Section title="Your day" description={data.sessionsToday.length ? 'Click a block for details, or complete a session once it’s done.' : null} className="mb-5" flush>
        {data.sessionsToday.length === 0 ? (
          <Empty icon={Sun} title="Nothing booked today" action={<Button size="sm" icon={CalendarPlus} onClick={() => setAdding(true)}>Add session</Button>}>
            Confirmed sessions for today show up here, on a timeline of your day.
          </Empty>
        ) : (
          <>
            <DayTimeline sessions={data.sessionsToday} onSelect={setSelected} />
            <div className="divide-y divide-border/80 @3xl/page:border-t @3xl/page:border-border/80">
              {data.sessionsToday.map((s) => {
                const needsNote = s.status === 'CONFIRMED' && new Date(s.startsAt) < now;
                return (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onClick={() => setSelected({ ...s, _view: 'details' })}
                    actions={needsNote && <Button size="sm" variant="primary" onClick={() => setSelected({ ...s, _view: 'complete' })}>Complete</Button>}
                  />
                );
              })}
            </div>
          </>
        )}
      </Section>

      <div className="grid gap-5 @4xl/page:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section title="Requests" description="Families waiting on your answer.">
          {data.pendingRequests.length === 0 ? (
            <Empty icon={Inbox} title="No requests waiting">New booking requests land here for you to confirm.</Empty>
          ) : (
            data.pendingRequests.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                showDate
                onClick={() => setSelected({ ...s, _view: 'details' })}
                actions={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setSelected({ ...s, _view: 'decline' })}>Decline</Button>
                    <Button size="sm" variant="primary" onClick={async () => show(await confirm({ sessionId: s.id }), 'Session confirmed', `${s.requestedBy.name} has been notified.`)}>Confirm</Button>
                  </div>
                }
              />
            ))
          )}
        </Section>

        <div className="space-y-5">
          <Section title="To grade">
            {data.gradingQueue.length === 0 ? (
              <Empty icon={ClipboardCheck} title="All caught up">Book answers grade themselves. Written answers with a photo land here.</Empty>
            ) : (
              data.gradingQueue.map((sub) => (
                <Row key={sub.id} onClick={() => navigate(`/admin/assignments/${sub.assignmentId}`)}>
                  <Avatar name={fullName(sub.student)} tone={sub.student.avatarColor} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold">{sub.assignment.title}</p>
                    <p className="text-[13px] text-muted-foreground">{fullName(sub.student)}, sent {fmtAgo(sub.submittedAt)}</p>
                  </div>
                  <span className="text-[13px] font-bold text-brand">Check</span>
                </Row>
              ))
            )}
          </Section>

          {data.needBook.length > 0 && (
            <Section title="Waiting on the book" description="These families haven’t said they have it yet.">
              {data.needBook.map((st) => (
                <Row key={st.id} onClick={() => navigate(`/admin/families/${st.parentId}`)}>
                  <BookOpen size={18} className="shrink-0 text-muted-foreground" aria-hidden />
                  <p className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{fullName(st)}</p>
                  <span className="text-[13px] font-bold text-brand">Family</span>
                </Row>
              ))}
            </Section>
          )}

          <Section title="Coming up">
            {data.nextUp.length === 0 ? (
              <Empty icon={CalendarRange} title="Nothing else this week" />
            ) : (
              data.nextUp.map((s) => (
                <Row key={s.id} onClick={() => setSelected({ ...s, _view: 'details' })}>
                  <div className="tabular w-[5.5rem] shrink-0">
                    <p className="text-[13px] font-bold text-muted-foreground">{fmtRelativeDay(s.startsAt)}</p>
                    <p className="text-[14px] font-extrabold">{fmtTime(s.startsAt)}</p>
                  </div>
                  <span className={cn('h-8 w-[3px] shrink-0 rounded-full', sessionBg(s))} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold">{fullName(s.student)}</p>
                    <Place session={s} />
                  </div>
                </Row>
              ))
            )}
          </Section>
        </div>
      </div>

      <AdminSessionDrawer session={selected} initialView={selected?._view} onClose={() => setSelected(null)} />
      <AddSessionDrawer open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

/** The next session, large, with a live countdown. */
function UpNext({ session: s, later, now, onOpen, onSelect, onAdd }) {
  if (!s) {
    return (
      <Section title="Up next" flush>
        <Empty icon={CalendarClock} title="Nothing scheduled" action={<Button size="sm" variant="primary" onClick={onAdd}>Add session</Button>}>Confirmed sessions show up here with a countdown.</Empty>
      </Section>
    );
  }
  const addr = s.mode === 'VIDEO' ? null : s.address || s.location?.address;
  const canJoin = joinOpen(s);
  const live = new Date(s.startsAt) <= now && new Date(s.endsAt) > now;
  return (
    <section className="surface relative flex flex-col overflow-hidden rounded-[14px]">
      <span className={cn('absolute inset-y-0 left-0 w-1', sessionBg(s))} aria-hidden />
      <div className="flex flex-1 flex-col gap-5 p-5 pl-6 @3xl/page:flex-row @3xl/page:items-center @3xl/page:p-6 @3xl/page:pl-7">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-extrabold text-muted-foreground">Up next</span>
            <span className={cn('rounded-md px-2 py-0.5 text-[12.5px] font-extrabold', live ? 'bg-good-soft text-good-soft-foreground' : 'bg-brand-soft text-brand-soft-foreground')}>{until(s.startsAt, now)}</span>
          </div>
          <div className="mt-3 flex items-center gap-3.5">
            <Avatar name={fullName(s.student)} tone={s.student.avatarColor} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{fullName(s.student)}</p>
              <p className="text-[14px] font-semibold text-muted-foreground">{gradeLabel(s.student.grade)}, booked by {s.requestedBy.name}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="tabular text-[16px] font-extrabold">{isToday(s.startsAt) ? 'Today' : fmtRelativeDay(s.startsAt)}, {fmtTimeRange(s.startsAt, s.endsAt)}</span>
            <Place session={s} className="text-[14px]" />
          </div>
        </div>
        <div className="flex shrink-0 gap-2 @3xl/page:flex-col">
          {s.mode === 'VIDEO' && canJoin ? (
            <Button variant="primary" icon={Video} onClick={onOpen}>Join call</Button>
          ) : (
            <Button variant="primary" onClick={onOpen}>Open session</Button>
          )}
          {addr && (
            <a href={mapsUrl(addr)} target="_blank" rel="noreferrer" className="chrome-secondary inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[14.5px] font-bold text-foreground">
              Directions <ExternalLink size={15} aria-hidden />
            </a>
          )}
        </div>
      </div>
      <div className="mt-auto border-t border-border/80 bg-muted/40 px-5 py-3 pl-6 @3xl/page:pl-7">
        {later.length === 0 ? (
          <p className="text-[13.5px] font-semibold text-muted-foreground">{isToday(s.startsAt) ? 'Last session of the day.' : 'Nothing else booked before then.'}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-[13px] font-extrabold text-muted-foreground">After this</span>
            {later.slice(0, 3).map((x) => (
              <button key={x.id} type="button" onClick={() => onSelect(x)} className="flex items-center gap-2 rounded-lg text-left hover:underline">
                <span className={cn('h-5 w-[3px] rounded-full', sessionBg(x))} aria-hidden />
                <span className="tabular text-[13.5px] font-extrabold">{fmtTime(x.startsAt)}</span>
                <span className="text-[13.5px] font-semibold text-muted-foreground">{x.student.firstName}{x.mode === 'VIDEO' ? ', video' : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** This week as compact day rows: one square per session, colored by in person / video. */
function WeekGlance({ week, weekStart, now, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const total = week.filter((s) => s.status !== 'REQUESTED').length;
  return (
    <Section title="This week" description={`${total} session${total === 1 ? '' : 's'} booked`} action={<button type="button" onClick={onOpen} className="text-[13px] hit-area font-bold text-brand hover:underline">Open schedule</button>} flush>
      <ul className="grid h-full grid-cols-7 gap-1 p-2.5">
        {days.map((d) => {
          const list = week.filter((s) => sameDay(s.startsAt, d));
          const today = sameDay(d, now);
          const past = d < new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return (
            <li key={d.toISOString()} className={cn('flex min-w-0 flex-col items-center rounded-lg px-1 pb-2 pt-1.5', today && 'band shadow-raised')}>
              <span className={cn('text-[12px] font-bold', today ? 'text-ink-muted' : 'text-muted-foreground')}>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <span className={cn('tabular text-[17px] font-extrabold leading-tight', today ? 'text-ink-foreground' : past ? 'text-subtle-foreground' : 'text-foreground')}>{d.getDate()}</span>
              <span className="mt-2 flex flex-col items-center gap-1" role="img" aria-label={`${list.length} sessions`}>
                {list.length === 0 && <span className={cn('h-1 w-3 rounded-full', today ? 'bg-ink-foreground/30' : 'bg-border')} />}
                {list.slice(0, 4).map((s) => (
                  <span
                    key={s.id}
                    title={`${fmtTime(s.startsAt)} ${s.student.firstName}${s.mode === 'VIDEO' ? ', video' : ''}`}
                    className={cn('h-2.5 w-6 rounded-[4px]', s.status === 'REQUESTED' ? 'border-[1.5px] border-dashed border-warning' : sessionBg(s), past && 'opacity-45')}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
