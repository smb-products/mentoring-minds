'use client';

import { useState } from 'react';
import { BookOpen, CalendarPlus, ChevronRight, ClipboardList, ClipboardCheck, Flag, MessageSquare, NotebookText, Star, Video } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { ParentSessionDrawer } from '../../components/sessions/ParentSessionDrawer';
import { RequestSessionDrawer } from '../../components/sessions/RequestSessionDrawer';
import { joinOpen, Place } from '../../components/sessions/SessionParts';
import { GetTheBook } from '../../components/learning/GetTheBook';
import { InstallPrompt } from '../../../components/pwa/InstallPrompt';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
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
        overlap
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={`Here’s how ${kid.firstName} is doing with Vienne.`}
        actions={<Button variant="primary" icon={CalendarPlus} onClick={() => setRequesting(true)}>Request a session</Button>}
      >
        <ChildSwitcher className="mt-5" />
        <Figures
          variant="band"
          className="mt-4"
          items={[
            { label: 'Stars earned', value: <span className="inline-flex items-center gap-1.5">{data.starsTotal}<Star size={22} className="fill-reward text-reward" aria-hidden /></span>, note: 'From book homework' },
            { label: 'To do', value: data.todo.length, highlight: data.todo.length > 0, onClick: () => navigate('/parent/learning'), note: data.todo[0] ? data.todo[0].assignment.title : 'All caught up' },
            data.fastWindow
              ? { label: `FAST ${data.fastWindow.window}`, value: data.fastWindow.inProgress ? 'This week' : `${data.fastWindow.daysUntil} days`, icon: Flag, note: 'School math test' }
              : { label: 'Finished', value: data.completedCount, note: 'Assignments' },
          ]}
        />
      </PageHeader>

      {data.book && !data.hasBookAt && <GetTheBook student={kid} book={data.book} className="mb-5" />}
      <InstallPrompt className="mb-5" />

      {canJoin && (
        <section aria-label="Video call" className="band mb-5 flex flex-col gap-4 rounded-[14px] p-5 shadow-raised @3xl/page:flex-row @3xl/page:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-ink-foreground/12"><Video size={24} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold">{kid.firstName}’s video call is ready</p>
            <p className="text-[14.5px] text-ink-muted">{fmtTimeRange(next.startsAt, next.endsAt)}. {kid.firstName} can join on this phone or tablet.</p>
          </div>
          <Button
            size="lg"
            variant="reward"
            icon={Video}
            className="h-14 px-7 text-[17px]"
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
          <button type="button" onClick={() => setSelected(next)} className="surface group relative flex items-stretch gap-5 overflow-hidden rounded-[14px] p-5 text-left @3xl/page:p-6">
            <div className="band tabular flex w-[5.5rem] shrink-0 flex-col items-center justify-center rounded-xl py-3 shadow-raised">
              <span className="text-[12.5px] font-bold text-ink-muted">{fmtDateWith(next.startsAt, { month: 'short' })}</span>
              <span className="text-[34px] font-extrabold leading-none">{dayOfMonth(next.startsAt)}</span>
              <span className="mt-1 text-[12.5px] font-bold text-ink-muted">{fmtDateWith(next.startsAt, { weekday: 'short' })}</span>
            </div>
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-[13px] font-extrabold text-muted-foreground">Next session</p>
              <p className="mt-1 text-[20px] font-extrabold leading-snug tracking-[-0.01em] @3xl/page:text-[22px]">
                {isToday(next.startsAt) ? 'Today' : isTomorrow(next.startsAt) ? 'Tomorrow' : fmtDateWith(next.startsAt, { weekday: 'long' })}, {fmtTimeRange(next.startsAt, next.endsAt)}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Place session={next} forParent className="text-[14px]" />
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                <Avatar name="Vienne Elliott" tone="ink" size="sm" />
                <span className="text-[13.5px] font-semibold text-muted-foreground">{next.mode === 'VIDEO' ? `Video call, 1-on-1. Join opens ${data.joinOpensMin ?? 15} minutes before.` : 'With Vienne. Tap for details or to change it.'}</span>
              </div>
            </div>
            <ChevronRight size={20} className="hidden self-center text-subtle-foreground transition-transform group-hover:translate-x-0.5 @xl/page:block" aria-hidden />
          </button>
        ) : (
          <Section title="Next session" flush>
            <Empty icon={CalendarPlus} title="Nothing booked yet" action={<Button size="sm" variant="primary" onClick={() => setRequesting(true)}>Request a session</Button>}>
              {data.pendingRequests.length ? `${data.pendingRequests.length} request waiting on Vienne.` : 'Pick a time that works and Vienne will confirm it.'}
            </Empty>
          </Section>
        )}

        <nav aria-label="Shortcuts" className="surface rounded-[14px] p-2">
          {[
            { icon: CalendarPlus, title: 'Request a session', body: 'Pick a day and time that suits you', onClick: () => setRequesting(true) },
            { icon: MessageSquare, title: 'Message Vienne', body: data.unreadMessages ? `${data.unreadMessages} new message` : 'Questions, updates, changes', onClick: () => navigate('/parent/messages'), badge: data.unreadMessages },
            { icon: BookOpen, title: `${kid.firstName}’s learning`, body: data.redoCount ? `${data.redoCount} book questions to redo` : 'Homework, worksheets and videos', onClick: () => navigate('/parent/learning') },
          ].map(({ icon: Icon, title, body, onClick, badge }) => (
            <button key={title} type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors hover:bg-muted/70">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-[10px] bg-brand-soft text-brand-soft-foreground">
                <Icon size={19} strokeWidth={2.2} aria-hidden />
                {badge > 0 && <span className="absolute -right-1 -top-1 size-3 rounded-full bg-primary ring-2 ring-card" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-extrabold">{title}</span>
                <span className="block truncate text-[13px] text-muted-foreground">{body}</span>
              </span>
              <ChevronRight size={17} className="text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </button>
          ))}
        </nav>
      </div>

      <div className="grid items-start gap-5 @4xl/page:grid-cols-2">
        <Section title="To do" action={data.todo.length > 0 && <Link href="/parent/learning" className="text-[13.5px] hit-area font-bold text-brand hover:underline">See all</Link>}>
          {data.todo.length === 0 ? (
            <Empty icon={ClipboardCheck} title="All done">New homework from Vienne shows up here.</Empty>
          ) : (
            data.todo.slice(0, 4).map((t) => {
              const quiz = t.assignment.kind === 'BOOK';
              return (
                <Row key={t.id} onClick={() => navigate(`/parent/learning/${t.id}`)}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-[10px]', quiz ? 'bg-reward-soft text-reward-soft-foreground' : 'bg-muted text-muted-foreground')}>
                    {quiz ? <BookOpen size={18} aria-hidden /> : <ClipboardList size={18} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{t.assignment.title}</p>
                    <p className="text-[13px] text-muted-foreground">
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
            <div className="px-5 py-5">
              <div className="flex items-center gap-3">
                <Avatar name="Vienne Elliott" tone="ink" size="md" />
                <div>
                  <p className="text-[14.5px] font-extrabold">Vienne Elliott</p>
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
                    <NotebookText size={14} aria-hidden /> After {kid.firstName}’s session, {fmtDate(data.lastSessionNote.startsAt)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[15.5px] leading-relaxed">{data.lastSessionNote.note.summary}</p>
              {data.lastSessionNote.note.homework && (
                <div className="mt-4 rounded-xl border border-reward/50 bg-reward-soft px-4 py-3">
                  <p className="text-[12.5px] font-extrabold text-reward-soft-foreground">Homework</p>
                  <p className="mt-0.5 text-[14.5px] font-semibold text-foreground">{data.lastSessionNote.note.homework}</p>
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
          action={<Link href="/parent/progress" className="text-[13.5px] hit-area font-bold text-brand hover:underline">Full report</Link>}
        >
          <div className="grid gap-x-8 gap-y-3 px-5 py-4 @3xl/page:grid-cols-2">
            {data.latestReport.ratings.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('size-2 shrink-0 rounded-[3px]', subjectBg(areaColor(r.area)))} aria-hidden />
                  <span className="truncate text-[14px] font-bold">{r.skill.name}</span>
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
