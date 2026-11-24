'use client';

import { useState } from 'react';
import { BookCheck, BookX, CalendarCheck, CalendarRange, CalendarX, ClipboardCheck, FileBarChart, KeyRound, Mail, MessageSquare, NotebookText, Pause, Phone, Play, Plus } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { AdminSessionDrawer } from '../../components/sessions/AdminSessionDrawer';
import { Button } from '../../components/ui/Button';
import { FastResults } from '../../components/fast/FastResults';
import { Place, sessionBg } from '../../components/sessions/SessionParts';
import { AreaBars, Avatar, Empty, PageHeader, Row, Section, StatusBadge } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { Textarea } from '../../components/ui/Form';
import { useResultToast, useUndoToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { fmtAgo, fmtDate, fmtDateYear, fmtRelativeDay, fmtTime, fullName, gradeLabel } from '../../lib/format';
import { Link, useRouter } from '../../lib/router';

/** /admin/families/[parentId] — data: families.getFamily({ parentId }) */
export default function FamilyPage({ params }) {
  const { navigate } = useRouter();
  const show = useResultToast();
  const undoable = useUndoToast();
  const { data } = useQuery(() => api.families.getFamily({ parentId: params.parentId }), [params.parentId]);
  const [setStatus] = useAction(api.families.setParentStatus);
  const [resetPw] = useAction(api.families.resetParentPassword);
  const [createDraft] = useAction(api.reports.createDraft);
  const [tempPw, setTempPw] = useState(null);
  const [selected, setSelected] = useState(null);
  if (!data) return <PageLoading />;

  const p = data.parent;
  const now = new Date();
  const upcoming = data.sessions.filter((s) => ['CONFIRMED', 'REQUESTED'].includes(s.status) && new Date(s.startsAt) > now).reverse();
  const notes = data.sessions.filter((s) => s.note).slice(0, 4);
  const kids = data.students.map((s) => s.firstName);

  return (
    <>
      <PageHeader
        overlap
        back={{ href: '/admin/families', label: 'Families' }}
        title={p.name}
        subtitle={`${kids.length ? `Parent of ${kids.join(' and ')}. ` : ''}Joined ${fmtDateYear(p.createdAt)}.`}
        actions={
          <>
            {data.conversationId && <Button variant="primary" icon={MessageSquare} onClick={() => navigate(`/admin/messages/${data.conversationId}`)}>Message</Button>}
            <Button variant="glass" icon={KeyRound} onClick={async () => { const d = show(await resetPw({ parentId: p.id })); if (d) setTempPw(d.temporaryPassword); }}>Reset password</Button>
            {p.status === 'ACTIVE' ? (
              <Button variant="glass" icon={Pause} onClick={async () => undoable(await setStatus({ parentId: p.id, status: 'PAUSED' }), 'Account paused', () => setStatus({ parentId: p.id, status: 'ACTIVE' }), 'They can sign in but can’t book or open content.')}>Pause</Button>
            ) : (
              <Button variant="glass" icon={Play} onClick={async () => show(await setStatus({ parentId: p.id, status: 'ACTIVE' }), 'Account is active')}>Make active</Button>
            )}
          </>
        }
      >
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={`mailto:${p.email}`} className="glass inline-flex h-9 @max-3xl/app:h-10 items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-bold text-ink-foreground hover:bg-ink-foreground/15"><Mail size={15} aria-hidden />{p.email}</a>
          {p.phone && <span className="glass inline-flex h-9 @max-3xl/app:h-10 items-center gap-2 rounded-[10px] px-3 text-[13.5px] font-bold text-ink-foreground"><Phone size={15} aria-hidden />{p.phone}</span>}
          <StatusBadge status={p.status} className="h-9 rounded-[10px] px-3" />
        </div>
        {tempPw && (
          <p className="mt-3 text-[14px] text-ink-muted">
            Temporary password <span className="tabular select-all rounded-md bg-ink-foreground px-1.5 py-0.5 font-extrabold text-ink">{tempPw}</span>. Pass it on to {p.name.split(' ')[0]}; they choose a new one when they sign in.
          </p>
        )}
      </PageHeader>

      {data.students.length === 0 ? (
        <Section className="mb-5"><Empty title="No children on this account yet">They’re added when the parent enters their invite code.</Empty></Section>
      ) : (
        <div className="mb-5 grid gap-5 @4xl/page:grid-cols-2">
          {data.students.map((s) => (
            <StudentCard
              key={s.id}
              s={s}
              reports={data.reports.filter((r) => r.studentId === s.id)}
              onNewReport={async () => {
                const r = show(await createDraft({ studentId: s.id }));
                if (r) navigate(`/admin/reports/${r.id}`);
              }}
            />
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 @4xl/page:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Recent session notes">
          {notes.length === 0 ? (
            <Empty icon={NotebookText} title="No notes yet">Notes appear here after you complete a session.</Empty>
          ) : (
            notes.map((s) => (
              <Row key={s.id} onClick={() => setSelected(s)} className="items-start">
                <span className={cn('mt-1 h-10 w-[3px] shrink-0 rounded-full', sessionBg(s))} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <p className="text-[14.5px] font-extrabold">{s.student.firstName}</p>
                    <span className="text-[13px] font-semibold text-muted-foreground">{fmtDate(s.startsAt)}</span>
                    {!s.note.sharedWithParent && <span className="rounded-md bg-muted px-1.5 text-[12px] font-bold text-muted-foreground">Private</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted-foreground">{s.note.summary}</p>
                </div>
              </Row>
            ))
          )}
        </Section>

        <div className="space-y-5">
        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <Empty icon={CalendarRange} title="Nothing booked" />
          ) : (
            upcoming.map((s) => (
              <Row key={s.id} onClick={() => setSelected(s)}>
                <div className="tabular w-[6rem] shrink-0">
                  <p className="text-[13px] font-bold text-muted-foreground">{fmtRelativeDay(s.startsAt)}</p>
                  <p className="text-[14px] font-extrabold">{fmtTime(s.startsAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold">{s.student.firstName}</p>
                  <Place session={s} />
                </div>
                {s.status === 'REQUESTED' && <StatusBadge status="REQUESTED" />}
              </Row>
            ))
          )}
        </Section>
        <Activity data={data} />
        </div>
      </div>
      <AdminSessionDrawer session={selected} onClose={() => setSelected(null)} />
    </>
  );
}

/** A child's profile: identity, numbers, goals, private notes, reports. */
function StudentCard({ s, reports, onNewReport }) {
  const show = useResultToast();
  const [updateStudent, saving] = useAction(api.families.updateStudent);
  const [setHasBook] = useAction(api.books.setHasBook);
  const [notes, setNotes] = useState(s.adminNotes ?? '');
  const dirty = notes !== (s.adminNotes ?? '');

  return (
    <section className="surface flex flex-col overflow-hidden rounded-[14px]">
      <div className="flex items-center gap-4 px-5 pb-4 pt-5">
        <Avatar name={fullName(s)} tone={s.avatarColor} size="lg" className="size-14 rounded-2xl text-[19px]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-extrabold tracking-[-0.01em]">{fullName(s)}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[14px] font-semibold text-muted-foreground">{gradeLabel(s.grade)}{s.school ? `, ${s.school}` : ''}</span>
          </div>
        </div>
      </div>

      <dl className="mx-5 grid grid-cols-3 overflow-hidden rounded-xl bg-muted/70">
        {[
          ['Sessions', s.stats.completedSessions],
          ['To redo', s.stats.redoCount],
          ['Next', s.stats.nextSessionAt ? fmtDate(s.stats.nextSessionAt) : '—'],
        ].map(([label, value], i) => (
          <div key={label} className={cn('px-3 py-2.5', i > 0 && 'border-l border-card')}>
            <dt className="text-[12px] font-bold text-muted-foreground">{label}</dt>
            <dd className="tabular mt-0.5 truncate text-[17px] font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-5 px-5 py-4">
        {s.hasBook !== null && (
          <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', s.hasBook ? 'bg-good-soft/60' : 'bg-warning-soft')}>
            {s.hasBook ? <BookCheck size={18} className="shrink-0 text-good-soft-foreground" aria-hidden /> : <BookX size={18} className="shrink-0 text-warning-soft-foreground" aria-hidden />}
            <p className="min-w-0 flex-1 text-[14px] font-bold">{s.hasBook ? 'Has the grade ' + s.grade + ' book' : 'Hasn’t said they have the book yet'}</p>
            {!s.hasBook && <Button size="xs" onClick={async () => show(await setHasBook({ studentId: s.id }), 'Marked as having the book')}>They have it</Button>}
          </div>
        )}
        <FastResults student={s} compact />
        <div>
          <p className="text-[14px] font-extrabold">Book work by area</p>
          <AreaBars areas={s.bookAreas} className="mt-2.5" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-muted-foreground">Goals from the family</p>
          <p className="mt-1 text-[14.5px] leading-relaxed">{s.goals || 'None shared yet.'}</p>
        </div>
        <div>
          <label htmlFor={`notes-${s.id}`} className="flex items-center justify-between text-[13px] font-bold text-muted-foreground">
            Private notes <span className="font-semibold text-subtle-foreground">Only you see these</span>
          </label>
          <Textarea id={`notes-${s.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 bg-reward-soft/40" />
          {dirty && (
            <Button size="sm" variant="primary" className="mt-2" disabled={saving} onClick={async () => show(await updateStudent({ studentId: s.id, adminNotes: notes }), 'Notes saved')}>
              Save notes
            </Button>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-border/80 px-3 pb-3 pt-2.5">
        <div className="flex items-center justify-between px-2">
          <p className="text-[14px] font-extrabold">Progress reports</p>
          <Button size="xs" variant="ghost" icon={Plus} onClick={onNewReport}>New report</Button>
        </div>
        {reports.length === 0 ? (
          <p className="px-2 pb-1 pt-1 text-[13.5px] text-subtle-foreground">No reports yet.</p>
        ) : (
          <ul className="mt-1">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/reports/${r.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <FileBarChart size={17} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="tabular flex-1 text-[14px] font-bold">{fmtDate(r.periodStart)} – {fmtDateYear(r.periodEnd)}</span>
                  <StatusBadge status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Everything that happened with this family, newest first. */
function Activity({ data }) {
  const now = new Date();
  const items = [
    ...data.sessions
      .filter((s) => new Date(s.startsAt) < now && ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(s.status))
      .map((s) => ({
        at: s.status === 'CANCELLED' ? s.cancelledAt ?? s.startsAt : s.startsAt,
        icon: s.status === 'COMPLETED' ? CalendarCheck : CalendarX,
        tone: s.status === 'COMPLETED' ? 'bg-good-soft text-good-soft-foreground' : 'bg-serious-soft text-serious-soft-foreground',
        text: `${s.student.firstName}’s ${s.mode === 'VIDEO' ? 'video ' : ''}session ${s.status === 'COMPLETED' ? 'completed' : s.status === 'NO_SHOW' ? 'was a no-show' : 'was cancelled'}`,
      })),
    ...data.recentWork.map((w) => ({
      at: w.gradedAt ?? w.submittedAt,
      icon: ClipboardCheck,
      tone: 'bg-brand-soft text-brand-soft-foreground',
      text: `${w.student.firstName} ${w.status === 'GRADED' ? `finished “${w.assignment.title}”${w.maxScore ? `, ${w.score}/${w.maxScore}` : ''}` : `sent “${w.assignment.title}”`}`,
    })),
    ...data.reports.filter((r) => r.publishedAt).map((r) => ({ at: r.publishedAt, icon: FileBarChart, tone: 'bg-reward-soft text-reward-soft-foreground', text: 'Progress report published' })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <Section title="Activity">
      {items.length === 0 ? (
        <Empty title="Nothing yet" />
      ) : (
        <ol className="relative px-4 py-3 @3xl/page:px-5">
          <span className="absolute bottom-6 left-[2.05rem] top-6 w-px bg-border @3xl/page:left-[2.3rem]" aria-hidden />
          {items.map((it, i) => (
            <li key={i} className="relative flex items-start gap-3 py-2">
              <span className={cn('z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-card', it.tone)}>
                <it.icon size={14} strokeWidth={2.4} aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13.5px] font-bold leading-snug">{it.text}</p>
                <p className="text-[12.5px] font-semibold text-subtle-foreground">{fmtAgo(it.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
