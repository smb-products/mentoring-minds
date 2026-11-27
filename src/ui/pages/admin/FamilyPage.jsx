'use client';

import { useState } from 'react';
import { BookCheck, BookX, CalendarCheck, CalendarRange, CalendarX, ClipboardCheck, FileBarChart, KeyRound, Mail, MessageSquare, NotebookText, Pause, Phone, Play, Plus, Trash2 } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { AdminSessionDrawer } from '../../components/sessions/AdminSessionDrawer';
import { Button } from '../../components/ui/Button';
import { FastResults } from '../../components/fast/FastResults';
import { Place, sessionBg } from '../../components/sessions/SessionParts';
import { AreaBars, Avatar, Empty, PageHeader, Row, Section, StatusBadge } from '../../components/ui/Display';
import { PageLoading } from '../../components/ui/Display';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { Drawer } from '../../components/ui/Overlay';
import { useResultToast, useUndoToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { fmtAgo, fmtDate, fmtDateYear, fmtRelativeDay, fmtTime, fullName, gradeLabel } from '../../lib/format';
import { Link, useRouter } from '../../lib/router';

/** /admin/families/[parentId] — data: families.getFamily({ parentId }) */
export default function FamilyPage({ params }) {
  const { navigate } = useRouter();
  const show = useResultToast();
  const undoable = useUndoToast();
  const { data } = useQuery(() => api.families.getFamily({ parentId: params.parentId }).catch((e) => { if (e?.code === 'NOT_FOUND') return null; throw e; }), [params.parentId]);
  const [setStatus] = useAction(api.families.setParentStatus);
  const [resetPw] = useAction(api.families.resetParentPassword);
  const [createDraft] = useAction(api.reports.createDraft);
  const [tempPw, setTempPw] = useState(null);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null); // { kind: 'family' } | { kind: 'child', student }
  if (data === null) return <Section><Empty title="We couldn’t find that family. It may have been removed." action={<Link href="/admin/families" className="text-small hit-area font-medium text-brand hover:underline">Back to Families</Link>} /></Section>;
  if (!data) return <PageLoading />;

  const p = data.parent;
  const now = new Date();
  const upcoming = data.sessions.filter((s) => ['CONFIRMED', 'REQUESTED'].includes(s.status) && new Date(s.startsAt) > now).reverse();
  const notes = data.sessions.filter((s) => s.note).slice(0, 4);
  const kids = data.students.map((s) => s.firstName);

  return (
    <>
      <PageHeader
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
            <Button variant="glass" icon={Trash2} onClick={() => setDeleting({ kind: 'family' })}>Delete family</Button>
          </>
        }
      />

      <div className="mb-5">
        <div className="flex flex-wrap gap-2">
          <a href={`mailto:${p.email}`} className="inline-flex h-9 @max-3xl/app:h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-small font-medium text-foreground transition-colors hover:bg-accent"><Mail size={15} strokeWidth={1.75} aria-hidden />{p.email}</a>
          {p.phone && <span className="inline-flex h-9 @max-3xl/app:h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-small font-medium text-foreground"><Phone size={15} strokeWidth={1.75} aria-hidden />{p.phone}</span>}
          <StatusBadge status={p.status} className="h-9 px-3" />
        </div>
        {tempPw && (
          <p className="mt-3 text-body text-muted-foreground">
            Temporary password <span className="tabular select-all rounded-md bg-ink px-1.5 py-0.5 font-semibold text-ink-foreground">{tempPw}</span>. Pass it on to {p.name.split(' ')[0]}; they choose a new one when they sign in.
          </p>
        )}
      </div>

      {data.students.length === 0 ? (
        <Section className="mb-5"><Empty title="No children on this account yet">They’re added when the parent enters their invite code.</Empty></Section>
      ) : (
        <div className="mb-5 grid gap-5 @4xl/page:grid-cols-2">
          {data.students.map((s) => (
            <StudentCard
              key={s.id}
              s={s}
              reports={data.reports.filter((r) => r.studentId === s.id)}
              onDelete={() => setDeleting({ kind: 'child', student: s })}
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
                <span className={cn('mt-1 h-10 w-[3px] shrink-0 rounded-xs', sessionBg(s))} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <p className="text-body font-medium">{s.student.firstName}</p>
                    <span className="text-small text-muted-foreground">{fmtDate(s.startsAt)}</span>
                    {!s.note.sharedWithParent && <span className="rounded-md bg-badge px-1.5 text-caption text-badge-foreground">Private</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-body leading-relaxed text-muted-foreground">{s.note.summary}</p>
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
                  <p className="text-small font-medium text-muted-foreground">{fmtRelativeDay(s.startsAt)}</p>
                  <p className="text-body font-medium">{fmtTime(s.startsAt)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">{s.student.firstName}</p>
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
      {deleting && (
        <DeleteDrawer
          key={deleting.kind === 'child' ? deleting.student.id : 'family'}
          parent={p}
          kids={data.students}
          student={deleting.kind === 'child' ? deleting.student : null}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            if (deleting.kind === 'family') navigate('/admin/families');
          }}
        />
      )}
    </>
  );
}

/**
 * Delete on request (S23). Asks twice: what will be removed, then the child's or parent's name typed out.
 * A whole family when `student` is null.
 */
function DeleteDrawer({ parent, kids, student, onClose, onDeleted }) {
  const show = useResultToast();
  const [deleteStudent, deletingStudent] = useAction(api.families.deleteStudent);
  const [deleteFamily, deletingFamily] = useAction(api.families.deleteFamily);
  const [step, setStep] = useState('explain');
  const [typed, setTyped] = useState('');
  const name = student ? fullName(student) : parent.name;
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();
  const saving = deletingStudent || deletingFamily;
  const who = student ? student.firstName : kids.length ? `${parent.name} and ${kids.map((k) => k.firstName).join(' and ')}` : parent.name;
  const removed = [
    'sessions and session notes',
    'homework, answers and photos of their work',
    'FAST results and progress reports',
    ...(student ? [] : ['messages, alerts and invites', 'the parent’s account and sign-in']),
    'files only they used',
  ];

  return (
    <Drawer open onClose={onClose} title={student ? `Delete ${name}?` : `Delete the ${parent.name.split(' ').slice(-1)[0]} family?`} subtitle="This can’t be undone.">
      {step === 'explain' ? (
        <div className="space-y-5">
          <p className="text-body leading-relaxed text-muted-foreground">
            {student ? `This removes ${name} from ${parent.name.split(' ')[0]}’s account, with everything about them:` : `This removes ${who}, with everything about them:`}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-body font-medium">
            {removed.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="text-body leading-relaxed text-muted-foreground">Library resources stay. They just stop being shared with {student ? student.firstName : 'this family'}.</p>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={onClose}>Keep</Button>
            <Button variant="destructive" icon={Trash2} onClick={() => setStep('type')}>Continue</Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!matches) return;
            const r = student ? await deleteStudent({ studentId: student.id }) : await deleteFamily({ parentId: parent.id });
            if (show(r, student ? `${name} was deleted` : 'Family deleted', 'Everything about them is gone.')) onDeleted();
          }}
        >
          <Field label={`Type “${name}” to delete for good`}>{(id) => <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />}</Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setStep('explain')}>Back</Button>
            <Button variant="destructive" type="submit" icon={Trash2} disabled={!matches || saving}>{student ? `Delete ${student.firstName}` : 'Delete family'}</Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

/** A child's profile: identity, numbers, goals, private notes, reports. */
function StudentCard({ s, reports, onNewReport, onDelete }) {
  const show = useResultToast();
  const [updateStudent, saving] = useAction(api.families.updateStudent);
  const [setHasBook] = useAction(api.books.setHasBook);
  const [notes, setNotes] = useState(s.adminNotes ?? '');
  const dirty = notes !== (s.adminNotes ?? '');

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="flex items-center gap-4 px-5 pb-4 pt-5">
        <Avatar name={fullName(s)} tone={s.avatarColor} size="lg" className="size-14 text-heading" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-title">{fullName(s)}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-body text-muted-foreground">{gradeLabel(s.grade)}{s.school ? `, ${s.school}` : ''}</span>
          </div>
        </div>
        <Button size="xs" variant="ghost" icon={Trash2} onClick={onDelete} aria-label={`Delete ${fullName(s)}`} className="self-start">Delete</Button>
      </div>

      <dl className="mx-5 grid grid-cols-3 overflow-hidden rounded-md bg-muted/70">
        {[
          ['Sessions', s.stats.completedSessions],
          ['To redo', s.stats.redoCount],
          ['Next', s.stats.nextSessionAt ? fmtDate(s.stats.nextSessionAt) : '—'],
        ].map(([label, value], i) => (
          <div key={label} className={cn('px-3 py-2.5', i > 0 && 'border-l border-card')}>
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="tabular mt-0.5 truncate text-heading">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-5 px-5 py-4">
        {s.hasBook !== null && (
          <div className={cn('flex items-center gap-3 rounded-md px-3 py-2.5', s.hasBook ? 'bg-good-soft/60' : 'bg-warning-soft')}>
            {s.hasBook ? <BookCheck size={18} strokeWidth={1.75} className="shrink-0 text-good-soft-foreground" aria-hidden /> : <BookX size={18} strokeWidth={1.75} className="shrink-0 text-warning-soft-foreground" aria-hidden />}
            <p className="min-w-0 flex-1 text-body font-medium">{s.hasBook ? 'Has the grade ' + s.grade + ' book' : 'Hasn’t said they have the book yet'}</p>
            {!s.hasBook && <Button size="xs" onClick={async () => show(await setHasBook({ studentId: s.id }), 'Marked as having the book')}>They have it</Button>}
          </div>
        )}
        <FastResults student={s} compact />
        <div>
          <p className="text-heading">Book work by area</p>
          <AreaBars areas={s.bookAreas} className="mt-2.5" />
        </div>
        <div>
          <p className="text-small font-medium text-muted-foreground">Goals from the family</p>
          <p className="mt-1 text-body leading-relaxed">{s.goals || 'None shared yet.'}</p>
        </div>
        <div>
          <label htmlFor={`notes-${s.id}`} className="flex items-center justify-between text-small font-medium text-muted-foreground">
            Private notes <span className="font-normal text-subtle-foreground">Only you see these</span>
          </label>
          <Textarea id={`notes-${s.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 bg-muted/40" />
          {dirty && (
            <Button size="sm" variant="primary" className="mt-2" disabled={saving} onClick={async () => show(await updateStudent({ studentId: s.id, adminNotes: notes }), 'Notes saved')}>
              Save notes
            </Button>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-border/80 px-3 pb-3 pt-2.5">
        <div className="flex items-center justify-between px-2">
          <p className="text-heading">Progress reports</p>
          <Button size="xs" variant="ghost" icon={Plus} onClick={onNewReport}>New report</Button>
        </div>
        {reports.length === 0 ? (
          <p className="px-2 pb-1 pt-1 text-small text-subtle-foreground">No reports yet.</p>
        ) : (
          <ul className="mt-1">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/reports/${r.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                  <FileBarChart size={17} strokeWidth={1.75} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="tabular flex-1 text-body font-medium">{fmtDate(r.periodStart)} – {fmtDateYear(r.periodEnd)}</span>
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
    ...data.reports.filter((r) => r.publishedAt).map((r) => ({ at: r.publishedAt, icon: FileBarChart, tone: 'bg-badge text-badge-foreground', text: 'Progress report published' })),
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
              <span className={cn('z-10 grid size-7 shrink-0 place-items-center rounded-md ring-4 ring-card', it.tone)}>
                <it.icon size={14} strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-small font-medium leading-snug">{it.text}</p>
                <p className="text-caption font-normal text-subtle-foreground">{fmtAgo(it.at)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
