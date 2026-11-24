'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookX } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { Button } from '../../components/ui/Button';
import { Empty, PageHeader, Section } from '../../components/ui/Display';
import { CheckRow, Field, Input, Segmented, Select, Textarea } from '../../components/ui/Form';
import { useResultToast } from '../../components/ui/Toast';
import { fullName, gradeLabel } from '../../lib/format';
import { useRouter } from '../../lib/router';

/**
 * /admin/assignments/new — book homework ("Test 2, #1–20") or a practice link.
 * Writes: assignments.createBookAssignment / assignments.createPracticeAssignment.
 */
export default function NewAssignmentPage() {
  const { navigate } = useRouter();
  const show = useResultToast();
  const { data: books = [] } = useQuery(() => api.books.listBooks(), []);
  const { data: families = [] } = useQuery(() => api.families.listFamilies({ status: 'ACTIVE' }), []);
  const { data: resources = [] } = useQuery(() => api.content.listResources({ status: 'PUBLISHED' }), []);
  const [form, setForm] = useState({ kind: 'BOOK', grade: 5, test: 'T1', from: 1, to: 20, dueAt: '', title: '', instructions: '', resourceId: '', studentIds: [] });
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const book = books.find((b) => b.grade === Number(form.grade));
  const test = book?.tests.find((t) => t.key === form.test);
  const ready = test && test.keyed >= Math.min(form.to, test.count);

  // Switching grade or test resets the range to the whole test (or the first 20 of a full test).
  useEffect(() => {
    if (test) set({ from: 1, to: Math.min(test.count, 20) });
  }, [form.grade, form.test, test?.count]);

  const students = useMemo(() => {
    const all = families.flatMap((f) => f.students);
    return form.kind === 'BOOK' ? all.filter((s) => s.grade === Number(form.grade)) : all;
  }, [families, form.kind, form.grade]);
  const toggle = (id, on) => set({ studentIds: on ? [...form.studentIds, id] : form.studentIds.filter((x) => x !== id) });
  const due = form.dueAt ? new Date(`${form.dueAt}T20:00`).toISOString() : null;

  const [create, saving] = useAction(form.kind === 'BOOK' ? api.assignments.createBookAssignment : api.assignments.createPracticeAssignment);
  const submit = async () => {
    const input =
      form.kind === 'BOOK'
        ? { bookId: book.id, test: form.test, from: Number(form.from), to: Number(form.to), dueAt: due, instructions: form.instructions, studentIds: form.studentIds }
        : { title: form.title, instructions: form.instructions, resourceId: form.resourceId, dueAt: due, studentIds: form.studentIds };
    const data = show(await create(input), 'Assignment sent', `${form.studentIds.length} student${form.studentIds.length > 1 ? 's' : ''} can start now.`);
    if (data) navigate(`/admin/assignments/${data.id}`);
  };

  return (
    <>
      <PageHeader
        back={{ href: '/admin/assignments', label: 'Assignments' }}
        title="New assignment"
        subtitle="Each student you choose gets it on their to-do list."
        actions={
          <Button variant="primary" disabled={saving || !form.studentIds.length || (form.kind === 'BOOK' && !ready)} onClick={submit}>
            Assign to {form.studentIds.length || ''} student{form.studentIds.length === 1 ? '' : 's'}
          </Button>
        }
      />

      <div className="grid items-start gap-6 @4xl/page:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="What to do">
          <div className="space-y-5 p-4 @3xl/page:p-5">
            <Field label="From">
              <Segmented label="Assignment type" value={form.kind} onChange={(kind) => set({ kind, studentIds: [] })} className="w-full" options={[{ value: 'BOOK', label: 'The book' }, { value: 'PRACTICE', label: 'A link or resource' }]} />
            </Field>

            {form.kind === 'BOOK' ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Grade">
                    {(id) => (
                      <Select id={id} value={form.grade} onChange={(e) => set({ grade: Number(e.target.value), studentIds: [] })}>
                        {books.map((b) => <option key={b.id} value={b.grade}>{gradeLabel(b.grade)}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Field label="Test">
                    {(id) => (
                      <Select id={id} value={form.test} onChange={(e) => set({ test: e.target.value })}>
                        {book?.tests.map((t) => <option key={t.key} value={t.key}>{t.name}{t.keyed < t.count ? ' (no answer key yet)' : ''}</option>)}
                      </Select>
                    )}
                  </Field>
                </div>
                {test && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="From question">{(id) => <Input id={id} type="number" min={1} max={test.count} value={form.from} onChange={(e) => set({ from: e.target.value })} />}</Field>
                    <Field label="To question">{(id) => <Input id={id} type="number" min={1} max={test.count} value={form.to} onChange={(e) => set({ to: e.target.value })} />}</Field>
                  </div>
                )}
                {test && !ready && (
                  <div className="flex items-start gap-3 rounded-xl bg-warning-soft px-4 py-3 text-warning-soft-foreground">
                    <BookX size={18} className="mt-0.5 shrink-0" aria-hidden />
                    <div className="text-[14.5px] font-semibold">
                      Add the answer key for {test.name} first so answers can be checked.
                      <Button size="sm" className="mt-2 block" onClick={() => navigate(`/admin/content/book/${book.id}/${test.key}`)}>Set up the answer key</Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Field label="Title">{(id) => <Input id={id} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Try the official FAST sample questions" />}</Field>
                <Field label="Resource">
                  {(id) => (
                    <Select id={id} value={form.resourceId} onChange={(e) => set({ resourceId: e.target.value })}>
                      <option value="">None</option>
                      {resources.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </Select>
                  )}
                </Field>
              </>
            )}
            <Field label="Note for the family (optional)">{(id) => <Textarea id={id} rows={2} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="Do these in your book, then fill in your answers here." />}</Field>
            <Field label="Due">{(id) => <Input id={id} type="date" value={form.dueAt} onChange={(e) => set({ dueAt: e.target.value })} />}</Field>
          </div>
        </Section>

        <Section title="Students" description={form.kind === 'BOOK' ? `Students in ${gradeLabel(Number(form.grade)).toLowerCase()}.` : 'Everyone you teach.'}>
          {students.length === 0 ? (
            <Empty title="No students in this grade" />
          ) : (
            <div className="py-1">
              {students.map((s) => (
                <CheckRow key={s.id} checked={form.studentIds.includes(s.id)} onChange={(on) => toggle(s.id, on)} meta={s.hasBook === false ? 'No book yet' : gradeLabel(s.grade)}>
                  {fullName(s)}
                </CheckRow>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
