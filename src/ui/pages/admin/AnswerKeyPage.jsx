'use client';

import { useEffect, useState } from 'react';
import { api, useAction, useQuery } from '../../api';
import { areaFor } from '../../api/best';
import { Button } from '../../components/ui/Button';
import { AreaTag, PageHeader, PageLoading, Section } from '../../components/ui/Display';
import { Input, Select } from '../../components/ui/Form';
import { useResultToast } from '../../components/ui/Toast';
import { cn } from '../../lib/cn';
import { gradeLabel } from '../../lib/format';

const FORMATS = [
  { value: 'MC', label: 'One letter' },
  { value: 'MULTI', label: 'Several letters' },
  { value: 'NUMERIC', label: 'Number' },
  { value: 'OPEN', label: 'Show work' },
];

/**
 * /admin/content/book/[bookId]/[test] — one test's answer key.
 * Data: books.getAnswerKey · Writes: books.saveAnswerKey
 */
export default function AnswerKeyPage({ params }) {
  const show = useResultToast();
  const { data } = useQuery(() => api.books.getAnswerKey({ bookId: params.bookId, test: params.test }), [params.bookId, params.test]);
  const [rows, setRows] = useState(null);
  const [save, saving] = useAction(api.books.saveAnswerKey);

  // Reset the table only when the saved key itself changes (not on unrelated updates).
  const sig = data ? `${data.book.id}:${data.test.key}:${data.items.map((i) => `${i.id}${i.answer}${i.benchmarkCode}`).join()}` : '';
  useEffect(() => {
    if (!data) return;
    setRows(
      Array.from({ length: data.test.count }, (_, i) => {
        const it = data.items.find((x) => x.number === i + 1);
        return it ? { number: it.number, format: it.format, answer: it.answer ?? '', benchmarkCode: it.benchmarkCode ?? '', saved: true } : { number: i + 1, format: 'MC', answer: '', benchmarkCode: '', saved: false };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const grade = data?.book.grade;
  const filled = rows?.filter((r) => r.format === 'OPEN' || r.answer.trim()) ?? [];
  const changed = rows?.filter((r) => r.dirty) ?? [];
  if (!data || !rows) return <PageLoading />;

  const setRow = (n, patch) => setRows((all) => all.map((r) => (r.number === n ? { ...r, ...patch, dirty: true } : r)));
  const saveRows = async (list) =>
    show(await save({ bookId: data.book.id, test: data.test.key, rows: list.map((r) => ({ number: r.number, format: r.format, answer: r.answer, benchmarkCode: r.benchmarkCode || null })) }), 'Answer key saved', `${list.length} question${list.length === 1 ? '' : 's'}`);

  return (
    <>
      <PageHeader
        back={{ href: '/admin/content', label: 'Content' }}
        title={`${data.test.name} answer key`}
        subtitle={`${data.book.title}, ${gradeLabel(grade)}. ${filled.length} of ${data.test.count} answers entered.`}
        actions={
          <>
            <Button variant="primary" disabled={saving || !changed.length} onClick={async () => { await saveRows(changed.filter((r) => r.format === 'OPEN' || r.answer.trim())); }}>
              {changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}
            </Button>
          </>
        }
      />

      <Section flush title="Questions" description="Students only ever see the numbers. Answers stay on the server.">
        <div className="@container/key">
          <div className="hidden grid-cols-[3rem_10rem_9rem_minmax(0,1fr)] gap-3 border-b border-border px-4 py-2.5 text-[13px] font-bold text-muted-foreground @2xl/key:grid @3xl/page:px-5" aria-hidden>
            <span>#</span><span>Type</span><span>Answer</span><span>Standard</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <KeyRow key={r.number} r={r} grade={grade} codes={data.codes} onChange={(patch) => setRow(r.number, patch)} />
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}

function KeyRow({ r, grade, codes, onChange }) {
  const area = r.benchmarkCode ? areaFor(grade, { code: r.benchmarkCode }) : null;
  return (
    <li className={cn('grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 @2xl/key:grid-cols-[3rem_10rem_9rem_minmax(0,1fr)] @3xl/page:px-5', r.dirty && 'bg-brand-soft/30')}>
      <span className="tabular row-span-2 flex items-center gap-1.5 self-start pt-2 text-[16px] font-extrabold @2xl/key:row-span-1 @2xl/key:self-center @2xl/key:pt-0">
        {r.number}
      </span>
      <Select aria-label={`Type for #${r.number}`} value={r.format} onChange={(e) => onChange({ format: e.target.value, answer: e.target.value === 'OPEN' ? '' : r.answer })}>
        {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </Select>
      {r.format === 'OPEN' ? (
        <span className="text-[14px] font-semibold text-muted-foreground">You check it</span>
      ) : (
        <Input
          aria-label={`Answer for #${r.number}`}
          value={r.answer}
          onChange={(e) => onChange({ answer: e.target.value.toUpperCase() })}
          placeholder={r.format === 'MC' ? 'A' : r.format === 'MULTI' ? 'A, C' : '3/4'}
          className="tabular font-extrabold"
        />
      )}
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 @2xl/key:col-span-1">
        <Select aria-label={`Standard for #${r.number}`} value={r.benchmarkCode} onChange={(e) => onChange({ benchmarkCode: e.target.value })} className="w-40 shrink-0">
          <option value="">Not set</option>
          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <AreaTag area={area} className="shrink-0" />
      </div>
    </li>
  );
}
