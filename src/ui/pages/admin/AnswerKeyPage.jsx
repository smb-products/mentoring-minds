'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, CircleAlert, ImageUp } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { areaFor } from '../../api/best';
import { DraftCard } from '../../components/ai/DraftCard';
import { Button } from '../../components/ui/Button';
import { AreaTag, PageHeader, PageLoading, Section } from '../../components/ui/Display';
import { Input, Select } from '../../components/ui/Form';
import { useResultToast } from '../../components/ui/Toast';
import { shrinkPhoto } from '../../lib/shrinkPhoto';
import { cn } from '../../lib/cn';
import { gradeLabel } from '../../lib/format';

// next.config.ts caps a server action's body at 4 MB, and the photo goes as base64 (4 characters per 3 bytes).
const MAX_PHOTO = 4_000_000;
const TOO_BIG = 'That photo is too big to send. Take it a little closer to the page, or use a smaller photo.';

const FORMATS = [
  { value: 'MC', label: 'One letter' },
  { value: 'MULTI', label: 'Several letters' },
  { value: 'NUMERIC', label: 'Number' },
  { value: 'OPEN', label: 'Show work' },
];

/**
 * /admin/content/book/[bookId]/[test] — one test's answer key.
 * Data: books.getAnswerKey · Writes: books.saveAnswerKey · AI: ai.readAnswerKeyPage
 */
export default function AnswerKeyPage({ params }) {
  const show = useResultToast();
  const { data } = useQuery(() => api.books.getAnswerKey({ bookId: params.bookId, test: params.test }), [params.bookId, params.test]);
  const [rows, setRows] = useState(null);
  const [save, saving] = useAction(api.books.saveAnswerKey);
  const [photo, setPhoto] = useState(false);

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
  const saveRows = async (list, extra = {}) =>
    show(await save({ bookId: data.book.id, test: data.test.key, rows: list.map((r) => ({ number: r.number, format: r.format, answer: r.answer, benchmarkCode: r.benchmarkCode || null })), ...extra }), 'Answer key saved', `${list.length} question${list.length === 1 ? '' : 's'}`);

  return (
    <>
      <PageHeader
        back={{ href: '/admin/content', label: 'Content' }}
        title={`${data.test.name} answer key`}
        subtitle={`${data.book.title}, ${gradeLabel(grade)}. ${filled.length} of ${data.test.count} answers entered.`}
        actions={
          <>
            <Button variant="glass" icon={Camera} onClick={() => setPhoto(true)}>Set up from photos</Button>
            <Button variant="primary" disabled={saving || !changed.length} onClick={async () => { await saveRows(changed.filter((r) => r.format === 'OPEN' || r.answer.trim())); }}>
              {changed.length ? `Save ${changed.length} change${changed.length === 1 ? '' : 's'}` : 'Saved'}
            </Button>
          </>
        }
      />

      {photo && (
        <PhotoSetup
          data={data}
          onClose={() => setPhoto(false)}
          onSaved={() => {}}
          saveRows={saveRows}
        />
      )}

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

function KeyRow({ r, grade, codes, onChange, unsure }) {
  const area = r.benchmarkCode ? areaFor(grade, { code: r.benchmarkCode }) : null;
  return (
    <li className={cn('grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 @2xl/key:grid-cols-[3rem_10rem_9rem_minmax(0,1fr)] @3xl/page:px-5', unsure && 'bg-warning-soft/70', r.dirty && !unsure && 'bg-brand-soft/30')}>
      <span className="tabular row-span-2 flex items-center gap-1.5 self-start pt-2 text-[16px] font-extrabold @2xl/key:row-span-1 @2xl/key:self-center @2xl/key:pt-0">
        {r.number}
        {unsure && <CircleAlert size={15} className="text-warning-soft-foreground" aria-label="Check this one" />}
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

/**
 * "Set up from photos": photograph one answer-key page, Claude reads it, Vienne
 * checks the rows (unsure ones are yellow) and saves the page.
 */
function PhotoSetup({ data, onClose, onSaved, saveRows }) {
  const show = useResultToast();
  const [read, reading] = useAction(api.ai.readAnswerKeyPage);
  const [discard] = useAction(api.ai.discardDraft);
  const [from, setFrom] = useState(() => {
    const firstEmpty = Array.from({ length: data.test.count }, (_, i) => i + 1).find((n) => !data.items.some((x) => x.number === n));
    return firstEmpty ?? 1;
  });
  const [draft, setDraft] = useState(null);
  const [rows, setRows] = useState([]);
  const unsureCount = rows.filter((r) => r.unsure && !r.answer && r.format !== 'OPEN').length;
  const grade = data.book.grade;

  const onFile = async (file) => {
    if (!file) return;
    const { base64, mediaType } = await shrinkPhoto(file);
    // Still too big after shrinking, or one the browser can't shrink: say so here, not after a failed send.
    if ((base64?.length ?? Math.ceil(file.size / 3) * 4) > MAX_PHOTO) return show({ ok: false, error: TOO_BIG });
    const res = show(await read({ bookId: data.book.id, test: data.test.key, fromNumber: from, photoName: file.name, image: base64 && { mediaType, base64 } }));
    if (!res) return;
    setDraft(res);
    setRows(res.items.map((it) => ({ number: it.number, format: it.format, answer: it.answer ?? '', benchmarkCode: it.benchmarkCode ?? '', unsure: !it.confident })));
  };
  const issues = useMemo(() => rows.filter((r) => r.format !== 'OPEN' && !r.answer.trim()).map((r) => r.number), [rows]);

  return (
    <div className="mb-5">
      {!draft ? (
        <section aria-label="Set up from photos" className="surface rounded-[14px] p-5">
          <p className="text-[17px] font-extrabold">Set up from photos</p>
          <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
            Take a clear photo of one answer-key page, flat and in good light. You’ll check every answer before it’s saved. The photo is deleted once it’s read.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-[14px] font-bold">
              Starts at question
              <Input type="number" min={1} max={data.test.count} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} className="mt-1.5 w-24" />
            </label>
            <label className={cn('chrome-primary inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground', reading && 'pointer-events-none opacity-60')}>
              <ImageUp size={18} aria-hidden />
              {reading ? 'Reading the page…' : 'Take or choose a photo'}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <Button size="lg" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </section>
      ) : (
        <DraftCard
          title={`Draft for you: questions ${draft.from}–${draft.to}`}
          unsure={unsureCount ? [`${unsureCount} answer${unsureCount === 1 ? '' : 's'} couldn’t be read clearly. They’re highlighted. Type them from the page.`] : []}
          useLabel="Save this page"
          onUse={async () => {
            if (issues.length) return show({ ok: false, error: `Fill in #${issues.join(', #')} first` });
            if (await saveRows(rows, { source: 'PHOTO', aiDraftId: draft.draftId })) {
              onSaved();
              if (draft.to < draft.expected) {
                setFrom(draft.to + 1);
                setDraft(null);
              } else onClose();
            }
          }}
          onDiscard={() => {
            discard({ draftId: draft.draftId });
            setDraft(null);
          }}
        >
          <div className="@container/key overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <KeyRow key={r.number} r={r} grade={grade} codes={data.codes} unsure={r.unsure} onChange={(patch) => setRows((all) => all.map((x) => (x.number === r.number ? { ...x, ...patch, unsure: false } : x)))} />
              ))}
            </ul>
          </div>
        </DraftCard>
      )}
    </div>
  );
}
