'use client';

import { useState } from 'react';
import { BookOpen, CalendarPlus, ChevronRight, ClipboardList, ClipboardCheck, Flag, MessageSquare, NotebookText, Video } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { ParentSessionDrawer } from '../../components/sessions/ParentSessionDrawer';
import { RequestSessionDrawer } from '../../components/sessions/RequestSessionDrawer';
import { joinOpen, Place } from '../../components/sessions/SessionParts';
import { GetTheBook } from '../../components/learning/GetTheBook';
import { InstallPrompt } from '../../../components/pwa/InstallPrompt';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
import { LockedPage, useGreeting, useLocked } from '../../components/shell/Locked';
import { useShell } from '../../components/shell/ShellContext';
import { Button } from '../../components/ui/Button';
import { useResultToast } from '../../components/ui/Toast';
import { areaColor, Avatar, Empty, Figures, PageHeader, Row, Section, SkillMeter, subjectBg } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { cn } from '../../lib/cn';
import { dayOfMonth, fmtDate, fmtDateWith, fmtDue, fmtTimeRange, greeting, isToday, isTomorrow } from '../../lib/format';
import { Link, useRouter } from '../../lib/router';

/** /parent/home — data: dashboard.getParentOverview({ studentId }) */
export default function ParentHomePage() {
  const locked = useLocked();
  const title = useGreeting();
  return locked ? <LockedPage title={title} /> : <ParentHome />;
}

const CARD = 'rounded-lg border border-border bg-card shadow-card';

function ParentHome() {
  const { user, activeStudent: kid } = useShell();
  const { navigate } = useRouter();
  const { data } = useQuery(() => (kid ? api.dashboard.getParentOverview({ studentId: kid.id }) : null), [kid?.id]);
  const [requesting, setRequesting] = useState(false);
  const [selected, setSelected] = useState(null);
  const show = useResultToast();
  const [join] = useAction(api.scheduling.joinCall);
  if (!kid || !data) return <PageLoading />;
  const next = data.nextSession;
  const canJoin = next && joinOpen(next) && next.meetingUrl;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`Here’s how ${kid.firstName} is doing with Vienne.`}
        actions={<Button variant="primary" icon={CalendarPlus} onClick={() => setRequesting(true)}>Request a session</Button>}
      />

      {/* On the gray page, below the band. Stars stay beside the homework, not in the stats. */}
      <ChildSwitcher className="mb-4" />
      <Figures
        className="mb-5"
        items={[
          { label: 'To do', value: data.todo.length, highlight: data.todo.length > 0, onClick: () => navigate('/parent/learning'), note: data.todo[0] ? data.todo[0].assignment.title : 'All caught up' },
          data.fastWindow
            ? { label: `FAST ${data.fastWindow.window}`, value: data.fastWindow.inProgress ? 'This week' : `${data.fastWindow.daysUntil} days`, icon: Flag, note: 'School math test' }
            : { label: 'Finished', value: data.completedCount, note: 'Assignments' },
        ]}
      />

      {data.book && !data.hasBookAt && <GetTheBook student={kid} book={data.book} className="mb-5" />}
      <InstallPrompt className="mb-5" />

      {canJoin && (
        <section aria-label="Video call" className={cn(CARD, 'mb-5 flex flex-col gap-4 p-5 @3xl/page:flex-row @3xl/page:items-center')}>
          <span className="grid size-12 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-soft-foreground"><Video size={22} strokeWidth={1.75} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-title">{kid.firstName}’s video call is ready</p>
            <p className="text-body text-muted-foreground">{fmtTimeRange(next.startsAt, next.endsAt)}. {kid.firstName} can join on this phone or tablet.</p>
          </div>
          <Button
            size="lg"
            variant="primary"
            icon={Video}
            className="px-7"
            onClick={async () => {
              const d = show(await join({ sessionId: next.id }));
              if (d) window.open(d.meetingUrl, '_blank', 'noopener');
            }}
          >
            Join call
          </Button>
        </section>
      )}

      <div className="mb-5 grid gap-5 @4xl/page:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {next ? (
          <button type="button" onClick={() => setSelected(next)} className={cn(CARD, 'group relative flex items-stretch gap-4 overflow-hidden p-4 text-left transition-colors hover:bg-accent/50 @3xl/page:gap-5 @3xl/page:p-5')}>
            <div className="tabular flex w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-md bg-secondary py-2.5 text-brand-soft-foreground">
              <span className="text-caption">{fmtDateWith(next.startsAt, { month: 'short' })}</span>
              <span className="text-figure leading-none">{dayOfMonth(next.startsAt)}</span>
              <span className="mt-1 text-caption">{fmtDateWith(next.startsAt, { weekday: 'short' })}</span>
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-small font-medium text-muted-foreground">Next session</p>
              <p className="mt-1 text-title">
                {isToday(next.startsAt) ? 'Today' : isTomorrow(next.startsAt) ? 'Tomorrow' : fmtDateWith(next.startsAt, { weekday: 'long' })}, {fmtTimeRange(next.startsAt, next.endsAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Place session={next} forParent className="text-body" />
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Avatar name="Vienne Elliott" tone="ink" size="sm" />
                <span className="text-small text-muted-foreground">{next.mode === 'VIDEO' ? `Video call, 1-on-1. Join opens ${data.joinOpensMin ?? 15} minutes before.` : 'With Vienne. Tap for details or to change it.'}</span>
              </div>
            </div>
            <ChevronRight size={18} strokeWidth={1.75} className="hidden self-center text-subtle-foreground @xl/page:block" aria-hidden />
          </button>
        ) : (
          <Section title="Next session" flush>
            <Empty icon={CalendarPlus} title="Nothing booked yet" action={<Button size="sm" variant="primary" onClick={() => setRequesting(true)}>Request a session</Button>}>
              {data.pendingRequests.length ? `${data.pendingRequests.length} request waiting on Vienne.` : 'Pick a time that works and Vienne will confirm it.'}
            </Empty>
          </Section>
        )}

        <nav aria-label="Shortcuts" className={cn(CARD, 'p-2')}>
          {[
            { icon: CalendarPlus, title: 'Request a session', body: 'Pick a day and time that suits you', onClick: () => setRequesting(true) },
            { icon: MessageSquare, title: 'Message Vienne', body: data.unreadMessages ? `${data.unreadMessages} new message` : 'Questions, updates, changes', onClick: () => navigate('/parent/messages'), badge: data.unreadMessages },
            { icon: BookOpen, title: `${kid.firstName}’s learning`, body: data.redoCount ? `${data.redoCount} book questions to redo` : 'Homework, worksheets and videos', onClick: () => navigate('/parent/learning') },
          ].map(({ icon: Icon, title, body, onClick, badge }) => (
            <button key={title} type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-muted/70">
              <span className="relative grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-soft-foreground">
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                {badge > 0 && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-medium">{title}</span>
                <span className="block truncate text-small text-muted-foreground">{body}</span>
              </span>
              <ChevronRight size={16} strokeWidth={1.75} className="text-subtle-foreground" aria-hidden />
            </button>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-5 @4xl/page:grid-cols-2">
        <Section title="To do" action={data.todo.length > 0 && <Link href="/parent/learning" className="text-small hit-area font-medium text-brand hover:underline">See all</Link>}>
          {data.todo.length === 0 ? (
            <Empty icon={ClipboardCheck} title="All done">New homework from Vienne shows up here.</Empty>
          ) : (
            data.todo.slice(0, 4).map((t) => {
              const quiz = t.assignment.kind === 'BOOK';
              return (
                <Row key={t.id} onClick={() => navigate(`/parent/learning/${t.id}`)}>
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-md', quiz ? 'bg-brand-soft text-brand-soft-foreground' : 'bg-muted text-muted-foreground')}>
                    {quiz ? <BookOpen size={18} strokeWidth={1.75} aria-hidden /> : <ClipboardList size={18} strokeWidth={1.75} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{t.assignment.title}</p>
                    <p className="text-small text-muted-foreground">
                      {quiz ? `In the book, ${t.assignment.bookTo - t.assignment.bookFrom + 1} questions` : 'Practice'}. {fmtDue(t.assignment.dueAt)}
                    </p>
                  </div>
                  <Button as="span" size="sm" variant={quiz ? 'primary' : 'secondary'}>{quiz ? 'Start' : 'Open'}</Button>
                </Row>
              );
            })
          )}
        </Section>

        <Section title="From Vienne" flush>
          {data.lastSessionNote ? (
            <div className="px-4 py-4 @3xl/page:px-5">
              <div className="flex items-center gap-3">
                <Avatar name="Vienne Elliott" tone="ink" size="md" />
                <div>
                  <p className="text-body font-medium">Vienne Elliott</p>
                  <p className="flex items-center gap-1.5 text-small text-muted-foreground">
                    <NotebookText size={14} strokeWidth={1.75} aria-hidden /> After {kid.firstName}’s session, {fmtDate(data.lastSessionNote.startsAt)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-body">{data.lastSessionNote.note.summary}</p>
              {data.lastSessionNote.note.homework && (
                <div className="mt-4 rounded-md border border-border bg-secondary px-4 py-3">
                  <p className="text-caption text-muted-foreground">Homework</p>
                  <p className="mt-0.5 text-body font-medium text-foreground">{data.lastSessionNote.note.homework}</p>
                </div>
              )}
            </div>
          ) : (
            <Empty icon={NotebookText} title="No notes yet">After each session Vienne can leave a short note here.</Empty>
          )}
        </Section>
      </div>

      {data.latestReport && (
        <Section
          className="mt-5"
          title="Latest progress"
          description={`From Vienne’s report, shared ${fmtDate(data.latestReport.publishedAt)}`}
          action={<Link href="/parent/progress" className="text-small hit-area font-medium text-brand hover:underline">Full report</Link>}
        >
          <div className="grid gap-x-8 gap-y-3 px-4 py-4 @3xl/page:grid-cols-2 @3xl/page:px-5">
            {data.latestReport.ratings.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('size-2 shrink-0 rounded-xs', subjectBg(areaColor(r.area)))} aria-hidden />
                  <span className="truncate text-body font-medium">{r.skill.name}</span>
                </span>
                <SkillMeter rating={r.rating} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <RequestSessionDrawer open={requesting} onClose={() => setRequesting(false)} student={kid} />
      <ParentSessionDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  );
}
