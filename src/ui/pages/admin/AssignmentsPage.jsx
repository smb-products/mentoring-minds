'use client';

import { useState } from 'react';
import { ClipboardCheck, Plus } from 'lucide-react';
import { api, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { Avatar, Empty, Figures, PageHeader, Row, Section } from '../../components/ui/Display';
import { cn } from '../../lib/cn';
import { fmtAgo, fmtDue, fullName, gradeLabel } from '../../lib/format';
import { useRouter } from '../../lib/router';

const KIND = { BOOK: 'Book', PRACTICE: 'Practice' };

/** Data: assignments.listAssignments, assignments.gradingQueue */
export default function AssignmentsPage() {
  const { navigate } = useRouter();
  const { data: list = [] } = useQuery(() => api.assignments.listAssignments(), []);
  const { data: queue = [] } = useQuery(() => api.assignments.gradingQueue(), []);
  const [tab, setTab] = useState(queue.length ? 'grade' : 'all');

  return (
    <>
      <PageHeader
        tabs={{ label: 'Assignment views', value: tab, onChange: setTab, items: [{ value: 'grade', label: 'To check', count: queue.length }, { value: 'all', label: 'All assignments' }] }}
        title="Assignments"
        subtitle="Book answers grade themselves. Written answers wait for you here."
        actions={<Button variant="primary" icon={Plus} onClick={() => navigate('/admin/assignments/new')}>New assignment</Button>}
      />

      <Figures
        className="mb-5"
        items={[
          { label: 'To check', value: queue.length, highlight: queue.length > 0, note: queue.map((q) => q.student.firstName).join(', ') || 'All caught up' },
          { label: 'Assignments', value: list.length, note: `${list.filter((a) => a.kind === 'BOOK').length} from the book` },
          { label: 'Waiting on students', value: list.reduce((n, a) => n + (a.counts.assigned - a.counts.done), 0), note: 'Not started yet' },
          { label: 'Average score', value: (() => { const v = list.filter((a) => a.averagePercent != null); return v.length ? `${Math.round(v.reduce((n, a) => n + a.averagePercent, 0) / v.length)}%` : '—'; })(), note: 'Across finished work' },
        ]}
      />

      {tab === 'grade' && (
        <Section>
          {queue.length === 0 ? (
            <Empty icon={ClipboardCheck} title="Nothing to check">When a child sends a photo of a written answer, it lands here.</Empty>
          ) : (
            queue.map((sub) => (
              <Row key={sub.id} onClick={() => navigate(`/admin/assignments/${sub.assignmentId}`)}>
                <Avatar name={fullName(sub.student)} tone={sub.student.avatarColor} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium">{sub.assignment.title}</p>
                  <p className="text-small text-muted-foreground">{fullName(sub.student)}, sent {fmtAgo(sub.submittedAt)}</p>
                </div>
                <Button as="span" size="sm" variant="primary">Check</Button>
              </Row>
            ))
          )}
        </Section>
      )}

      {tab === 'all' && (
        <Section flush>
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_5rem] gap-4 border-b border-border px-5 py-2.5 text-caption text-muted-foreground @4xl/page:grid">
            <span>Assignment</span>
            <span>Type</span>
            <span>Due</span>
            <span>Done</span>
            <span className="text-right">Average</span>
          </div>
          <ul className="divide-y divide-border">
            {list.map((a) => {
              const late = a.dueAt && new Date(a.dueAt) < new Date() && a.counts.done < a.counts.assigned;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => navigate(`/admin/assignments/${a.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60 @4xl/page:grid-cols-[minmax(0,1fr)_7rem_9rem_9rem_5rem] @4xl/page:px-5">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-body font-medium leading-snug @4xl/page:truncate">{a.title}</p>
                      <p className="truncate text-small text-muted-foreground">{a.book ? `${gradeLabel(a.book.grade)} book` : 'Link or resource'}</p>
                    </div>
                    <span className="text-small text-muted-foreground">{KIND[a.kind]}{a.kind === 'BOOK' && `, ${a.questionCount} Qs`}</span>
                    <span className={cn('text-small', late ? 'font-medium text-serious' : 'text-muted-foreground')}>{fmtDue(a.dueAt)}</span>
                    <span className="flex items-center gap-2.5">
                      <span className="flex -space-x-1.5" aria-hidden>
                        {a.submissions.slice(0, 4).map((sb) => (
                          <Avatar key={sb.id} name={fullName(sb.student)} tone={sb.student.avatarColor} size="xs" className={cn('ring-2 ring-card', !['SUBMITTED', 'GRADED'].includes(sb.status) && 'opacity-45')} />
                        ))}
                      </span>
                      <span className="tabular text-small font-medium">{a.counts.done}/{a.counts.assigned}</span>
                    </span>
                    <span className="tabular text-right text-body font-medium">{a.averagePercent != null ? `${a.averagePercent}%` : '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}
