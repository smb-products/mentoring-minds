'use client';

import { useState } from 'react';
import { BookOpen, Check, Clock, ExternalLink, RotateCcw } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { AnswerSheet } from '../../components/learning/AnswerSheet';
import { useShell } from '../../components/shell/ShellContext';
import { Button } from '../../components/ui/Button';
import { AreaTag, PageHeader, PageLoading, Section, Stars, StatusBadge } from '../../components/ui/Display';
import { useResultToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { fmtDate, fmtDue } from '../../lib/format';

/**
 * /parent/learning/[submissionId] — one assignment for the selected child.
 * BOOK: open the answer sheet, then see which numbers were right.
 * PRACTICE: open the link, then mark done.
 * Data: assignments.listForStudent · Writes: submitAnswerSheet, markPracticeDone
 */
export default function AssignmentItemPage({ params }) {
  const { students } = useShell();
  const show = useResultToast();
  const { data: all } = useQuery(async () => (await Promise.all(students.map((s) => api.assignments.listForStudent({ studentId: s.id })))).flat(), [students.map((s) => s.id).join()]);
  const [playing, setPlaying] = useState(false);
  const [done, marking] = useAction(api.assignments.markPracticeDone);
  const w = all?.find((x) => x.id === params.submissionId);
  if (!w) return <PageLoading />;

  const a = w.assignment;
  const kid = students.find((s) => s.id === w.studentId);
  const open = ['ASSIGNED', 'RETURNED'].includes(w.status);
  const testName = a.book?.tests.find((t) => t.key === a.bookTest)?.name;
  const started = w.draft?.filter((d) => String(d.value ?? '').trim()).length ?? 0;

  return (
    <>
      <PageHeader back={{ href: '/parent/learning', label: 'Learning' }} title={a.title} subtitle={`For ${kid.firstName}. ${fmtDue(a.dueAt)}.`}>
        <div className="mt-3"><StatusBadge status={w.status} /></div>
      </PageHeader>

      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {w.status === 'RETURNED' && w.feedback && (
            <div className="rounded-[14px] border border-serious/40 bg-serious-soft px-4 py-3 text-[15px] text-serious-soft-foreground">
              <span className="font-extrabold">Vienne asked for a redo: </span>{w.feedback}
            </div>
          )}

          {a.kind === 'BOOK' ? (
            <Section title="How it works">
              <div className="space-y-5 p-4 @3xl/page:p-5">
                <ol className="space-y-3">
                  {[
                    [`Open ${kid.firstName}’s book to ${testName}${a.bookFrom > 1 || a.bookTo < (a.book?.tests.find((t) => t.key === a.bookTest)?.count ?? 0) ? `, questions ${a.bookFrom} to ${a.bookTo}` : ''}.`, BookOpen],
                    [`${kid.firstName} does the questions in the book.`, Check],
                    ['Then type each answer here. It checks them straight away.', Check],
                  ].map(([text, Icon], i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="tabular grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[15px] font-extrabold text-brand-soft-foreground">{i + 1}</span>
                      <span className="pt-1 text-[16px] leading-relaxed">{text}</span>
                    </li>
                  ))}
                </ol>
                {open && (
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <Button size="lg" variant="primary" className="h-14 px-7 text-[17px]" onClick={() => setPlaying(true)}>
                      {started ? `Keep going (${started} of ${a.slots.length} done)` : 'Fill in answers'}
                    </Button>
                    <p className="text-[14.5px] text-muted-foreground">{a.slots.length} questions. Answers save as you go.</p>
                  </div>
                )}
              </div>
            </Section>
          ) : (
            <Section title="What to do">
              <div className="space-y-4 p-4 @3xl/page:p-5">
                <p className="text-[16px] leading-relaxed">{a.instructions}</p>
                {a.resource?.url && (
                  <a href={a.resource.url} target="_blank" rel="noreferrer" className="chrome-secondary inline-flex h-12 items-center gap-2 rounded-xl px-5 text-base font-bold text-foreground">
                    Open {a.resource.title} <ExternalLink size={16} aria-hidden />
                  </a>
                )}
                {open && (
                  <div>
                    <Button size="lg" variant="primary" disabled={marking} onClick={async () => show(await done({ submissionId: w.id }), 'Marked as done', 'Nice work!')}>
                      We’re done
                    </Button>
                  </div>
                )}
              </div>
            </Section>
          )}

          {a.kind === 'BOOK' && w.answers && (
            <Section title="Answers" description="Green is right. Try the red ones again in the book.">
              <ol className="divide-y divide-border">
                {w.answers.map((ans) => {
                  const slot = a.slots.find((s) => s.number === ans.number);
                  return (
                    <li key={ans.number} className="flex items-center gap-3 px-4 py-2.5 @3xl/page:px-5">
                      <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', ans.correct === true ? 'bg-good-soft text-good-soft-foreground' : ans.correct === false ? 'bg-critical-soft text-critical-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground')}>
                        {ans.correct === true ? <Check size={15} strokeWidth={3} aria-label="Right" /> : ans.correct === false ? <RotateCcw size={14} strokeWidth={2.6} aria-label="Try again" /> : <Clock size={14} strokeWidth={2.6} aria-label="Vienne will check" />}
                      </span>
                      <span className="tabular w-10 text-[15.5px] font-extrabold">#{ans.number}</span>
                      <span className="min-w-0 flex-1 text-[15px] text-muted-foreground">
                        {slot?.format === 'OPEN' ? (ans.correct == null ? 'Written answer, Vienne will check' : 'Written answer') : <>Answered <span className="tabular font-bold text-foreground">{ans.value}</span></>}
                      </span>
                      <AreaTag area={slot?.area} className="hidden @xl/page:inline-flex" />
                    </li>
                  );
                })}
              </ol>
            </Section>
          )}
        </div>

        {(w.status === 'GRADED' || w.status === 'SUBMITTED') && (
          <Section title="Result">
            <div className="space-y-3 p-4 @3xl/page:p-5">
              {w.status === 'GRADED' ? (
                <>
                  <Stars count={w.stars} size={26} />
                  {w.maxScore != null && <p className="tabular text-[22px] font-extrabold">{w.score} of {w.maxScore}</p>}
                  {w.feedback && (
                    <div>
                      <p className="text-[13px] font-bold text-muted-foreground">Vienne’s note</p>
                      <p className="mt-0.5 text-[15px] leading-relaxed">{w.feedback}</p>
                    </div>
                  )}
                  <p className="text-[13px] text-muted-foreground">Finished {fmtDate(w.submittedAt)}</p>
                </>
              ) : (
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  Handed in {fmtDate(w.submittedAt)}. {w.autoScore} of {w.answers.filter((x) => x.correct !== null).length} checked right so far. Vienne will look at the written answers.
                </p>
              )}
            </div>
          </Section>
        )}
      </div>

      {playing && <AnswerSheet submission={w} onClose={() => setPlaying(false)} />}
    </>
  );
}

