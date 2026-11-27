'use client';

import { useState } from 'react';
import { BookOpen, ClipboardList, ExternalLink, FileText, RotateCcw, Trophy } from 'lucide-react';
import { api, useQuery } from '../../api';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
import { LockedPage, useLocked } from '../../components/shell/Locked';
import { useShell } from '../../components/shell/ShellContext';
import { Button } from '../../components/ui/Button';
import { AreaTag, Empty, PageHeader, Row, Section, Stars, StatusBadge } from '../../components/ui/Display';
import { GetTheBook } from '../../components/learning/GetTheBook';
import { PageLoading } from '../../components/ui/Display';
import { Drawer } from '../../components/ui/Overlay';
import { cn } from '../../lib/cn';
import { fmtBytes, fmtDate, fmtDue } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { KIND_META } from '../admin/ContentPage';

const KIND = { BOOK: 'In the book', PRACTICE: 'Practice' };

/** /parent/learning — data: assignments.listForStudent, content.listResourcesForStudent */
export default function ParentLearningPage() {
  return useLocked() ? <LockedPage title="Learning" /> : <ParentLearning />;
}

function ParentLearning() {
  const { activeStudent: kid } = useShell();
  const { navigate } = useRouter();
  const { data: work = [] } = useQuery(() => (kid ? api.assignments.listForStudent({ studentId: kid.id }) : []), [kid?.id]);
  const { data: library = [] } = useQuery(() => (kid ? api.content.listResourcesForStudent({ studentId: kid.id }) : []), [kid?.id]);
  const { data: redo = [] } = useQuery(() => (kid ? api.books.listRedo({ studentId: kid.id }) : []), [kid?.id]);
  const { data: book } = useQuery(() => (kid ? api.books.bookForGrade({ grade: kid.grade }) : null), [kid?.grade]);
  const [tab, setTab] = useState('todo');
  const [viewing, setViewing] = useState(null);
  if (!kid) return <PageLoading />;

  const todo = work.filter((w) => ['ASSIGNED', 'RETURNED'].includes(w.status));
  const done = work.filter((w) => ['SUBMITTED', 'GRADED'].includes(w.status)).reverse();

  return (
    <>
      <PageHeader
        tabs={{ label: 'Learning views', value: tab, onChange: setTab, items: [{ value: 'todo', label: 'To do', count: todo.length }, { value: 'redo', label: 'Redo', count: redo.length }, { value: 'done', label: 'Finished' }, { value: 'library', label: 'Library' }] }} title="Learning" subtitle={`Homework and resources Vienne has shared with ${kid.firstName}.`} />
      <ChildSwitcher className="mb-5" />

      {tab === 'todo' && book && !kid.hasBook && <GetTheBook student={kid} book={book} className="mb-5" />}

      {tab === 'redo' && (
        <Section title="Book questions to try again" description={`Do these again in ${kid.firstName}’s book. Vienne will go over them together.`}>
          {redo.length === 0 ? (
            <Empty icon={RotateCcw} title="Nothing to redo">Questions {kid.firstName} gets wrong show up here until Vienne marks them done.</Empty>
          ) : (
            redo.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 @3xl/page:px-5">
                <span className="tabular grid size-11 shrink-0 place-items-center rounded-md bg-muted text-heading">#{r.item.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">{r.testName}, question {r.item.number}</p>
                  <AreaTag area={r.item.area} />
                </div>
              </div>
            ))
          )}
        </Section>
      )}

      {tab === 'todo' && (
        <Section>
          {todo.length === 0 ? (
            <Empty icon={ClipboardList} title={`${kid.firstName} is all caught up`}>New homework from Vienne appears here.</Empty>
          ) : (
            todo.map((w) => {
              const late = w.assignment.dueAt && new Date(w.assignment.dueAt) < new Date();
              return (
                <Row key={w.id} onClick={() => navigate(`/parent/learning/${w.id}`)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-body font-medium">{w.assignment.title}</p>
                      {w.status === 'RETURNED' && <StatusBadge status="RETURNED" />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-small text-muted-foreground">
                      <span>{KIND[w.assignment.kind]}{w.assignment.kind === 'BOOK' && `, ${w.assignment.slots.length} questions`}</span>
                      {w.draft?.length > 0 && <span className="text-brand">{w.draft.filter((d) => d.value).length} answered so far</span>}
                      <span className={cn(late && 'text-serious')}>{fmtDue(w.assignment.dueAt)}</span>
                    </div>
                  </div>
                  <Button as="span" size="sm" variant={w.assignment.kind === 'BOOK' ? 'primary' : 'secondary'}>{w.assignment.kind === 'BOOK' ? (w.draft?.length ? 'Keep going' : 'Fill in answers') : 'Open'}</Button>
                </Row>
              );
            })
          )}
        </Section>
      )}

      {tab === 'done' && (
        <Section>
          {done.length === 0 ? (
            <Empty icon={Trophy} title="Nothing finished yet">Finished work and stars collect here.</Empty>
          ) : (
            done.map((w) => (
              <Row key={w.id} onClick={() => navigate(`/parent/learning/${w.id}`)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{w.assignment.title}</p>
                  <p className="text-small text-muted-foreground">
                    {w.submittedAt && `Finished ${fmtDate(w.submittedAt)}`}
                    {w.feedback && `. “${w.feedback}”`}
                  </p>
                </div>
                {w.status === 'GRADED' ? (
                  <div className="flex items-center gap-3">
                    {w.maxScore != null && <span className="tabular text-body font-semibold">{w.score}/{w.maxScore}</span>}
                    <Stars count={w.stars} />
                  </div>
                ) : (
                  <StatusBadge status="SUBMITTED" label="With Vienne" />
                )}
              </Row>
            ))
          )}
        </Section>
      )}

      {tab === 'library' && (
        <Section>
          {library.length === 0 ? (
            <Empty icon={BookOpen} title="Nothing shared yet">Worksheets, videos and notes from Vienne will appear here.</Empty>
          ) : (
            library.map((r) => {
              const Kind = KIND_META[r.kind];
              return (
                <Row key={r.id} onClick={() => setViewing(r)}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Kind.icon size={18} strokeWidth={1.75} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{r.title}</p>
                    <p className="truncate text-small text-muted-foreground">{r.description}</p>
                  </div>
                  <span className="hidden text-small font-medium text-muted-foreground @xl/page:inline">{KIND_META[r.kind].label}</span>
                </Row>
              );
            })
          )}
        </Section>
      )}

      <ResourceViewer resource={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function ResourceViewer({ resource: r, onClose }) {
  if (!r) return null;
  return (
    <Drawer open onClose={onClose} title={r.title} subtitle={KIND_META[r.kind].label}>
      {r.description && <p className="mb-5 text-body text-muted-foreground">{r.description}</p>}
      {r.kind === 'NOTE' && <div className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-body">{r.body?.text}</div>}
      {(r.kind === 'LINK' || r.kind === 'VIDEO') && (
        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-body font-medium text-primary-foreground hover:bg-primary-hover">
          {r.kind === 'VIDEO' ? 'Watch video' : 'Open link'} <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
        </a>
      )}
      {r.file && (
        <button
          type="button"
          onClick={() => window.open(`/api/files/${r.file.id}`, '_blank', 'noopener')}
          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/60"
        >
          <span className="grid size-10 place-items-center rounded-md bg-muted text-muted-foreground"><FileText size={18} strokeWidth={1.75} aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium">{r.file.filename}</span>
            <span className="block text-small text-muted-foreground">{fmtBytes(r.file.sizeBytes)}. Tap to open or print.</span>
          </span>
        </button>
      )}
    </Drawer>
  );
}
