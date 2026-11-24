'use client';

import { useEffect, useState } from 'react';
import { Check, FileImage, X } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { AreaBars, AreaTag, Avatar, Empty, Figures, PageHeader, PageLoading, Section, Stars, StatusBadge } from '../../components/ui/Display';
import { Textarea } from '../../components/ui/Form';
import { Drawer } from '../../components/ui/Overlay';
import { useResultToast, useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { fmtAgo, fmtDue, fmtLongDay, fullName, gradeLabel } from '../../lib/format';

/**
 * /admin/assignments/[assignmentId] — who's done, results per question number,
 * results by FAST area, and checking written answers.
 * Data: assignments.getAssignment · Writes: gradeSubmission, returnSubmission
 */
export default function AssignmentPage({ params }) {
  const { data: a } = useQuery(() => api.assignments.getAssignment({ assignmentId: params.assignmentId }), [params.assignmentId]);
  const [grading, setGrading] = useState(null);
  const [answersFor, setAnswersFor] = useState(null);
  if (!a) return <PageLoading />;

  const order = { SUBMITTED: 0, RETURNED: 1, ASSIGNED: 2, GRADED: 3 };
  const subs = [...a.submissions].sort((x, y) => order[x.status] - order[y.status]);
  const graded = subs.filter((s) => s.status === 'GRADED' && s.maxScore);
  const avg = graded.length ? Math.round((graded.reduce((n, s) => n + s.score / s.maxScore, 0) / graded.length) * 100) : null;
  const hardest = [...a.items].filter((it) => it.wrong).sort((x, y) => y.wrong - x.wrong).slice(0, 3);

  return (
    <>
      <PageHeader back={{ href: '/admin/assignments', label: 'Assignments' }} title={a.title} subtitle={a.book ? `${a.book.title}, ${gradeLabel(a.book.grade)}. ${fmtDue(a.dueAt)}.` : `${a.instructions || 'Practice'}. ${fmtDue(a.dueAt)}.`}>
        <Figures
          variant="band"
          className="mt-6"
          items={[
            { label: 'Assigned', value: subs.length },
            { label: 'Done', value: subs.filter((s) => s.answers || s.status === 'GRADED').length },
            { label: 'To check', value: subs.filter((s) => s.status === 'SUBMITTED').length, highlight: subs.some((s) => s.status === 'SUBMITTED'), note: 'Written answers' },
            { label: 'Average', value: avg != null ? `${avg}%` : '—', note: hardest.length ? `Most missed: #${hardest.map((h) => h.number).join(', #')}` : null },
          ]}
        />
      </PageHeader>

      <div className="grid items-start gap-5 @4xl/page:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="Students">
          {subs.length === 0 ? (
            <Empty title="Not assigned to anyone yet" />
          ) : (
            subs.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 @3xl/page:px-5">
                <Avatar name={fullName(s.student)} tone={s.student.avatarColor} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold">{fullName(s.student)}</p>
                  <p className="text-[13.5px] text-muted-foreground">
                    {s.submittedAt ? `Sent ${fmtAgo(s.submittedAt)}` : 'Not started'}
                    {s.feedback && `. “${s.feedback}”`}
                  </p>
                </div>
                {s.maxScore != null && s.status === 'GRADED' && <span className="tabular text-[15px] font-extrabold">{s.score}/{s.maxScore}</span>}
                {s.status === 'GRADED' && <Stars count={s.stars} />}
                <StatusBadge status={s.status} />
                {s.status === 'SUBMITTED' && <Button size="sm" variant="primary" onClick={() => setGrading(s)}>Check</Button>}
                {s.status === 'GRADED' && s.answers && <Button size="sm" variant="ghost" onClick={() => setAnswersFor(s)}>Answers</Button>}
              </div>
            ))
          )}
        </Section>

        {a.kind === 'BOOK' && (
          <div className="space-y-5">
            <Section title="By area" description="Everyone’s answers so far.">
              <div className="p-4 @3xl/page:p-5"><AreaBars areas={a.areas} empty="No answers yet." /></div>
            </Section>
            <Section title="By question" description="Green means everyone who answered got it right.">
              <ol className="grid grid-cols-5 gap-1.5 p-4 @3xl/page:p-5" aria-label="Results per question">
                {a.items.map((it) => {
                  const answered = it.right + it.wrong;
                  const tone = !answered ? 'bg-muted text-muted-foreground' : it.wrong === 0 ? 'bg-good-soft text-good-soft-foreground' : it.right === 0 ? 'bg-critical-soft text-critical-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground';
                  return (
                    <li key={it.number} title={`#${it.number}: ${it.right} right, ${it.wrong} wrong${it.pending ? `, ${it.pending} to check` : ''}. ${it.area.name}`} className={cn('tabular grid h-11 place-items-center rounded-lg text-[14px] font-extrabold', tone)}>
                      <span>{it.number}<span className="sr-only">: {it.right} right, {it.wrong} wrong</span></span>
                    </li>
                  );
                })}
              </ol>
            </Section>
          </div>
        )}
      </div>

      <GradeDrawer submission={grading} assignment={a} onClose={() => setGrading(null)} />
      <AnswersDrawer submission={answersFor} assignment={a} onClose={() => setAnswersFor(null)} />
    </>
  );
}

/** Vienne marks each written (photo) answer right or wrong. */
function GradeDrawer({ submission, assignment, onClose }) {
  const show = useResultToast();
  const toast = useToast();
  const [marks, setMarks] = useState({});
  const [feedback, setFeedback] = useState('');
  const [grade, saving] = useAction(api.assignments.gradeSubmission);
  const [returnIt, returning] = useAction(api.assignments.returnSubmission);
  useEffect(() => {
    setMarks({});
    setFeedback('');
  }, [submission?.id]);
  if (!submission) return null;
  const s = submission;
  const open = assignment.items.filter((it) => it.format === 'OPEN');
  const auto = s.answers.filter((x) => x.correct !== null);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Check ${s.student.firstName}’s written answers`}
      subtitle={`Sent ${fmtLongDay(s.submittedAt)}. ${auto.filter((x) => x.correct).length} of ${auto.length} other answers were right.`}
      footer={
        <>
          <Button variant="ghost" disabled={returning} className="mr-auto" onClick={async () => show(await returnIt({ submissionId: s.id, feedback }), 'Sent back for a redo', 'The family can change answers and resend.') && onClose()}>
            Send back
          </Button>
          <Button variant="primary" disabled={saving || open.some((it) => marks[it.number] == null)} onClick={async () => show(await grade({ submissionId: s.id, results: Object.entries(marks).map(([n, c]) => ({ number: Number(n), correct: c })), feedback }), 'Checked', 'The family can see the result.') && onClose()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {open.map((it) => {
          const photo = s.photos.find((p) => p.number === it.number);
          return (
            <div key={it.number} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[16px] font-extrabold">Question {it.number}</p>
                <AreaTag area={it.area} />
              </div>
              {photo?.file && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.content.getFileForUser({ fileId: photo.file.id });
                      toast({ title: 'Opens the photo full screen', description: 'Photo viewing isn’t part of the prototype.' });
                    } catch (e) {
                      toast({ tone: 'error', title: e.message });
                    }
                  }}
                  className="mt-3 flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70"
                >
                  <FileImage size={28} aria-hidden />
                  <span className="text-[14px] font-bold">{photo.file.filename}</span>
                  <span className="text-[13px]">Tap to open</span>
                </button>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Question ${it.number}`}>
                {[
                  [true, 'Right', Check, 'border-good bg-good-soft text-good-soft-foreground'],
                  [false, 'Not yet', X, 'border-critical bg-critical-soft text-critical-soft-foreground'],
                ].map(([val, label, Icon, on]) => (
                  <button key={label} type="button" role="radio" aria-checked={marks[it.number] === val} onClick={() => setMarks({ ...marks, [it.number]: val })} className={cn('flex h-12 items-center justify-center gap-2 rounded-xl border-2 text-[15px] font-extrabold', marks[it.number] === val ? on : 'border-border text-muted-foreground hover:bg-muted')}>
                    <Icon size={17} strokeWidth={2.6} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <label className="block">
          <span className="text-[14px] font-bold">A note for the family (optional)</span>
          <Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="mt-1.5" placeholder="Great work showing every step!" />
        </label>
      </div>
    </Drawer>
  );
}

function AnswersDrawer({ submission, assignment, onClose }) {
  if (!submission) return null;
  return (
    <Drawer open onClose={onClose} title={`${submission.student.firstName}’s answers`} subtitle={`${submission.score} of ${submission.maxScore} points`}>
      <ol className="divide-y divide-border rounded-xl border border-border">
        {submission.answers.map((ans) => {
          const it = assignment.items.find((x) => x.number === ans.number);
          return (
            <li key={ans.number} className="flex items-center gap-3 px-4 py-2.5">
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', ans.correct ? 'bg-good-soft text-good-soft-foreground' : 'bg-critical-soft text-critical-soft-foreground')}>
                {ans.correct ? <Check size={14} strokeWidth={3} aria-label="Correct" /> : <X size={14} strokeWidth={3} aria-label="Incorrect" />}
              </span>
              <span className="tabular w-9 text-[15px] font-extrabold">#{ans.number}</span>
              <span className="min-w-0 flex-1 text-[14px] text-muted-foreground">
                {it?.format === 'OPEN' ? 'Written answer' : <>Answered <span className="font-bold text-foreground">{ans.value}</span>{!ans.correct && <>, key says <span className="font-bold text-foreground">{it?.answer}</span></>}</>}
              </span>
              <AreaTag area={it?.area} className="hidden @3xl/page:inline-flex" />
            </li>
          );
        })}
      </ol>
    </Drawer>
  );
}
