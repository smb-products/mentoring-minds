'use client';

import { useState } from 'react';
import { Archive, BookOpen, Camera, ChevronRight, Eye, FileImage, FileText, Link2, NotebookPen, PlaySquare, Plus } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { STRANDS, categoriesFor, AREA_LABEL } from '../../api/best';
import { Button } from '../../components/ui/Button';
import { Empty, Figures, PageHeader, Progress, Row, Section, StatusBadge } from '../../components/ui/Display';
import { Field, Input, Select, Segmented, GRADE_OPTIONS } from '../../components/ui/Form';
import { useResultToast, useUndoToast } from '../../components/ui/Toast';
import { gradeLabel, gradeRange } from '../../lib/format';
import { useRouter } from '../../lib/router';

export const KIND_META = {
  WORKSHEET: { label: 'Worksheet', icon: FileText },
  VIDEO: { label: 'Video', icon: PlaySquare },
  LINK: { label: 'Link', icon: Link2 },
  NOTE: { label: 'Lesson note', icon: NotebookPen },
  IMAGE: { label: 'Image', icon: FileImage },
};

export const visibilityLabel = (r) =>
  r.visibility === 'ALL' ? 'Everyone' : r.visibility === 'GRADES' ? gradeRange(r.gradeMin, r.gradeMax) : `${r.sharedWith.length} student${r.sharedWith.length === 1 ? '' : 's'}`;

/** /admin/content — data: books.listBooks, content.listResources, taxonomy.listSubjects */
export default function ContentPage() {
  const { navigate } = useRouter();
  const [tab, setTab] = useState('book');
  const { data: books = [] } = useQuery(() => api.books.listBooks(), []);
  const { data: resources = [] } = useQuery(() => api.content.listResources(), []);
  const { data: subjects = [] } = useQuery(() => api.taxonomy.listSubjects(), []);
  const skills = subjects[0]?.skills ?? [];
  const keyed = books.reduce((n, b) => n + b.tests.filter((t) => t.keyed >= t.count).length, 0);
  const tests = books.reduce((n, b) => n + b.tests.length, 0);

  return (
    <>
      <PageHeader
        tabs={{ label: 'Content sections', value: tab, onChange: setTab, items: [
          { value: 'book', label: 'Book' },
          { value: 'library', label: 'Library' },
          { value: 'skills', label: 'Skills' },
        ] }}
        title="Content"
        subtitle="The test-prep book’s answer keys, your library, and the skills you teach."
        actions={tab === 'library' && <Button variant="primary" icon={Plus} onClick={() => navigate('/admin/content/new')}>Add resource</Button>}
      >
        <Figures
          variant="band"
          className="mt-6"
          items={[
            { label: 'Answer keys ready', value: `${keyed} of ${tests}`, note: 'Tests you can assign', onClick: () => setTab('book') },
            { label: 'Have the book', value: books.reduce((n, b) => n + b.studentsWithBook, 0), note: `of ${books.reduce((n, b) => n + b.studentsInGrade, 0)} students in grades 3–6` },
            { label: 'Library', value: resources.length, note: (() => { const n = resources.filter((r) => r.status === 'DRAFT').length; return `${n} draft${n === 1 ? '' : 's'}`; })(), onClick: () => setTab('library') },
            { label: 'Skills', value: skills.length, note: 'Linked to Florida standards', onClick: () => setTab('skills') },
          ]}
        />
      </PageHeader>

      {tab === 'book' && <Books books={books} />}
      {tab === 'library' && <Library resources={resources} />}
      {tab === 'skills' && <Skills skills={skills} />}
    </>
  );
}

/* ── Book: one card per grade, one row per test ── */
function Books({ books }) {
  const { navigate } = useRouter();
  if (!books.length) return <Section><Empty icon={BookOpen} title="No books set up">Add the test-prep book for a grade to start assigning from it.</Empty></Section>;
  return (
    <>
      <p className="mb-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
        The app keeps only the question numbers, what each one tests, and your answers. Students work in their own copy of the book.
      </p>
      <div className="grid gap-5 @4xl/page:grid-cols-2">
        {books.map((b) => (
          <Section key={b.id} title={`${gradeLabel(b.grade)}`} description={`${b.title}. ${b.studentsWithBook} of ${b.studentsInGrade} students have it.`} flush>
            <ul className="divide-y divide-border">
              {b.tests.map((t) => {
                const done = t.keyed >= t.count;
                return (
                  <li key={t.key}>
                    <Row onClick={() => navigate(`/admin/content/book/${b.id}/${t.key}`)}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-extrabold">{t.name}</p>
                        <p className="text-[13.5px] text-muted-foreground">{t.count} questions</p>
                      </div>
                      <div className="w-36 shrink-0">
                        {done ? (
                          <StatusBadge status="GRADED" label="Answer key ready" />
                        ) : t.keyed ? (
                          <>
                            <p className="tabular text-[13px] font-bold text-muted-foreground">{t.keyed} of {t.count} entered</p>
                            <Progress value={t.keyed} max={t.count} className="mt-1" />
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand"><Camera size={15} aria-hidden />Set up</span>
                        )}
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-subtle-foreground" aria-hidden />
                    </Row>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>
    </>
  );
}

/* ── Library ── */
function Library({ resources }) {
  const { navigate } = useRouter();
  const [grades, setGrades] = useState('');
  const [status, setStatus] = useState('');
  const filtered = resources.filter((r) => (!grades || (grades === 'k2' ? r.gradeMin <= 2 : r.gradeMax >= 3)) && (!status || r.status === status));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Grades" value={grades} onChange={setGrades} options={[{ value: '', label: 'All grades' }, { value: 'k2', label: 'K–2' }, { value: 'fast', label: '3–6' }]} />
        <Segmented size="sm" label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'PUBLISHED', label: 'Published' }, { value: 'DRAFT', label: 'Drafts' }]} />
      </div>
      <Section flush>
        {filtered.length === 0 ? (
          <Empty icon={FileText} title="Nothing here yet" action={<Button size="sm" onClick={() => navigate('/admin/content/new')}>Add resource</Button>}>
            Upload a worksheet, link a video or write a lesson note.
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((r) => {
              const Kind = KIND_META[r.kind];
              return (
                <li key={r.id}>
                  <Row onClick={() => navigate(`/admin/content/${r.id}`)} className="items-start @3xl/page:items-center">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-muted text-muted-foreground">
                      <Kind.icon size={19} strokeWidth={2} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[15px] font-extrabold leading-snug @3xl/page:truncate">{r.title}</p>
                      <p className="line-clamp-2 text-[13.5px] text-muted-foreground @3xl/page:truncate">{r.description}</p>
                      <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground @3xl/page:hidden">{gradeRange(r.gradeMin, r.gradeMax)}, {visibilityLabel(r)}</p>
                    </div>
                    <div className="hidden w-28 shrink-0 text-[13.5px] font-semibold text-muted-foreground @3xl/page:block">{Kind.label}</div>
                    <div className="hidden w-32 shrink-0 text-[13.5px] font-semibold text-muted-foreground @3xl/page:block">{gradeRange(r.gradeMin, r.gradeMax)}</div>
                    <div className="hidden w-28 shrink-0 text-[13.5px] font-semibold text-muted-foreground @4xl/page:block">{visibilityLabel(r)}</div>
                    <div className="flex w-24 shrink-0 items-center justify-end gap-2">
                      {r.showInPreview && <Eye size={15} className="text-subtle-foreground" aria-label="Shown in preview" />}
                      <StatusBadge status={r.status} />
                    </div>
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ── Skills: Vienne's teaching units, each tied to a B.E.S.T. strand ── */
function Skills({ skills }) {
  const show = useResultToast();
  const undoable = useUndoToast();
  const [upsert, saving] = useAction(api.taxonomy.upsertSkill);
  const [archive] = useAction(api.taxonomy.archiveSkill);
  const [draft, setDraft] = useState({ name: '', strand: 'NSO', gradeMin: 3, gradeMax: 5 });
  const strandName = (code) => STRANDS.find((s) => s.code === code)?.name ?? code;
  return (
    <div className="grid items-start gap-5 @4xl/page:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Section title="Skills you teach" description="Session notes and progress reports use these. Each one counts toward a FAST area in grades 3–6.">
        {skills.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 @3xl/page:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">{k.name}</p>
              <p className="text-[13px] text-muted-foreground">{strandName(k.strand)}, {gradeRange(k.gradeMin, k.gradeMax)}{k.benchmarkCodes.length ? `, ${k.benchmarkCodes.length} standards` : ''}</p>
            </div>
            <Button size="xs" variant="ghost" icon={Archive} aria-label={`Archive ${k.name}`} onClick={async () => undoable(await archive({ skillId: k.id }), `${k.name} archived`, () => archive({ skillId: k.id, archived: false }), 'Old notes and reports keep it.')}>Archive</Button>
          </div>
        ))}
        <form
          className="flex flex-wrap items-end gap-2 bg-muted/40 px-4 py-3 @3xl/page:px-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (show(await upsert({ name: draft.name, strand: draft.strand, gradeMin: Number(draft.gradeMin), gradeMax: Number(draft.gradeMax) }), 'Skill added')) setDraft({ ...draft, name: '' });
          }}
        >
          <Field label="New skill" className="min-w-[10rem] flex-1">{(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Rounding" />}</Field>
          <Field label="Strand" className="w-[11rem]">
            {(id) => <Select id={id} value={draft.strand} onChange={(e) => setDraft({ ...draft, strand: e.target.value })}>{STRANDS.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select>}
          </Field>
          <Field label="Grades" className="w-[8.5rem]">
            <div className="flex items-center gap-1">
              <Select aria-label="From grade" value={draft.gradeMin} onChange={(e) => setDraft({ ...draft, gradeMin: e.target.value })}>{GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</Select>
              <Select aria-label="To grade" value={draft.gradeMax} onChange={(e) => setDraft({ ...draft, gradeMax: e.target.value })}>{GRADE_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</Select>
            </div>
          </Field>
          <Button type="submit" disabled={saving || !draft.name.trim()}>Add</Button>
        </form>
      </Section>
      <Section title="FAST areas" description="How the state reports math in each grade, from the FLDOE test design.">
        {[3, 4, 5, 6].map((g) => (
          <div key={g} className="px-4 py-3 @3xl/page:px-5">
            <p className="text-[14.5px] font-extrabold">{gradeLabel(g)}</p>
            <ul className="mt-1.5 space-y-1">
              {categoriesFor(g).map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="font-semibold" title={c.name}>{AREA_LABEL[c.short]}</span>
                  <span className="tabular shrink-0 text-muted-foreground">{c.percent} of the test</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="px-4 pb-4 text-[13px] text-muted-foreground @3xl/page:px-5">K–2 use Star Math, so their work is grouped by strand instead.</p>
      </Section>
    </div>
  );
}
