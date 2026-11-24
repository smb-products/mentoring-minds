'use client';

import { useState } from 'react';
import { BookOpen, ClipboardList, ExternalLink, FileText, RotateCcw, Trophy } from 'lucide-react';
import { api, useQuery } from '../../api';
import { ChildSwitcher } from '../../components/shell/ChildSwitcher';
import { useShell } from '../../components/shell/ShellContext';
import { Button } from '../../components/ui/Button';
import { AreaTag, Empty, PageHeader, Row, Section, Stars, StatusBadge } from '../../components/ui/Display';
import { GetTheBook } from '../../components/learning/GetTheBook';
import { PageLoading } from '../../components/ui/Display';
import { Drawer } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { fmtBytes, fmtDate, fmtDue } from '../../lib/format';
import { useRouter } from '../../lib/router';
import { KIND_META } from '../admin/ContentPage';

const KIND = { BOOK: 'In the book', PRACTICE: 'Practice' };

/** /parent/learning — data: assignments.listForStudent, content.listResourcesForStudent */
export default function ParentLearningPage() {
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
        tabs={{ label: 'Learning views', value: tab, onChange: setTab, items: [{ value: 'todo', label: 'To do', count: todo.length }, { value: 'redo', label: 'Redo', count: redo.length }, { value: 'done', label: 'Finished' }, { value: 'library', label: 'Library' }] }} title="Learning" subtitle={`Homework and resources Vienne has shared with ${kid.firstName}.`}>
        <ChildSwitcher className="mt-4" />
      </PageHeader>

      {tab === 'todo' && book && !kid.hasBook && <GetTheBook student={kid} book={book} className="mb-5" />}

      {tab === 'redo' && (
        <Section title="Book questions to try again" description={`Do these again in ${kid.firstName}’s book. Vienne will go over them together.`}>
          {redo.length === 0 ? (
            <Empty icon={RotateCcw} title="Nothing to redo">Questions {kid.firstName} gets wrong show up here until Vienne marks them done.</Empty>
          ) : (
            redo.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-4 py-3 @3xl/page:px-5">
                <span className="tabular grid size-12 shrink-0 place-items-center rounded-xl bg-muted text-[17px] font-extrabold">#{r.item.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15.5px] font-extrabold">{r.testName}, question {r.item.number}</p>
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
                      <p className="truncate text-[15.5px] font-extrabold">{w.assignment.title}</p>
                      {w.status === 'RETURNED' && <StatusBadge status="RETURNED" />}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] font-semibold text-muted-foreground">
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
                  <p className="truncate text-[15px] font-extrabold">{w.assignment.title}</p>
                  <p className="text-[13.5px] text-muted-foreground">
                    {w.submittedAt && `Finished ${fmtDate(w.submittedAt)}`}
                    {w.feedback && `. “${w.feedback}”`}
                  </p>
                </div>
                {w.status === 'GRADED' ? (
                  <div className="flex items-center gap-3">
                    {w.maxScore != null && <span className="tabular text-[14.5px] font-extrabold">{w.score}/{w.maxScore}</span>}
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
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground"><Kind.icon size={19} aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{r.title}</p>
                    <p className="truncate text-[13.5px] text-muted-foreground">{r.description}</p>
                  </div>
                  <span className="hidden text-[13px] font-semibold text-muted-foreground @xl/page:inline">{KIND_META[r.kind].label}</span>
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
  const toast = useToast();
  if (!r) return null;
  return (
    <Drawer open onClose={onClose} title={r.title} subtitle={KIND_META[r.kind].label}>
      {r.description && <p className="mb-5 text-[15px] leading-relaxed text-muted-foreground">{r.description}</p>}
      {r.kind === 'NOTE' && <div className="whitespace-pre-wrap rounded-xl bg-muted p-4 text-[15.5px] leading-relaxed">{r.body?.text}</div>}
      {(r.kind === 'LINK' || r.kind === 'VIDEO') && (
        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-[14.5px] font-bold text-primary-foreground">
          {r.kind === 'VIDEO' ? 'Watch video' : 'Open link'} <ExternalLink size={16} aria-hidden />
        </a>
      )}
      {r.file && (
        <button
          type="button"
          onClick={async () => {
            try {
              await api.content.getFileForUser({ fileId: r.file.id });
              toast({ title: 'Opens through a secure link', description: 'File viewing isn’t part of the prototype.' });
            } catch (e) {
              toast({ tone: 'error', title: e.message });
            }
          }}
          className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted/60"
        >
          <span className="grid size-11 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText size={20} aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-bold">{r.file.filename}</span>
            <span className="block text-[13px] text-muted-foreground">{fmtBytes(r.file.sizeBytes)}. Tap to open or print.</span>
          </span>
        </button>
      )}
    </Drawer>
  );
}
