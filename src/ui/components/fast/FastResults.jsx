import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, useAction, useQuery } from '../../api';
import { cn } from '../../lib/cn';
import { fmtDate } from '../../lib/format';
import { Button } from '../ui/Button';
import { LEVEL_TEXT, LevelBadge } from '../ui/Display';
import { Field, Input, Segmented, Select } from '../ui/Form';
import { Drawer } from '../ui/Overlay';
import { useResultToast, useUndoToast } from '../ui/Toast';

const YEARS = ['2026–27', '2025–26'];
const testName = (type) => (type === 'STAR_MATH' ? 'Star Math' : 'FAST Math');

/**
 * FAST (grades 3–6) or Star Math (K–2) results for one student, with add / edit.
 * Used on Vienne's family page and the parent's Progress page: either can enter
 * a result, and the row says who did.
 */
export function FastResults({ student, canEdit = true, compact = false }) {
  const { data } = useQuery(() => api.fast.listResults({ studentId: student.id }), [student.id]);
  const [editing, setEditing] = useState(null);
  if (!data) return null;
  const [latest, previous] = data.results;
  const shown = compact ? data.results.slice(0, 2) : data.results;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-extrabold">{testName(data.testType)} results</p>
        {canEdit && <Button size="xs" variant="ghost" icon={Plus} onClick={() => setEditing({})}>Add result</Button>}
      </div>
      {data.results.length === 0 ? (
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          No results yet. {data.testType === 'FAST_MATH' ? 'Scores are in the school’s Family Portal after each test.' : 'Star Math scores come home from school after each test.'}
        </p>
      ) : (
        <>
          {latest && data.testType === 'FAST_MATH' && (
            <p className="mt-1.5 text-[14px] text-muted-foreground">
              Latest: <span className="font-bold text-foreground">{LEVEL_TEXT[latest.level]}</span>
              {previous?.level && previous.level !== latest.level && <> (was Level {previous.level})</>}
              {latest.categories.length > 0 && (
                <>. Weakest area: <span className="font-bold text-foreground">{[...latest.categories].sort((a, b) => a.level - b.level)[0].name}</span></>
              )}
            </p>
          )}
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold">
                    {r.window} {r.schoolYear}
                    {r.gradeTested !== student.grade && <span className="font-semibold text-muted-foreground"> (grade {r.gradeTested === 0 ? 'K' : r.gradeTested})</span>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Score {r.scaleScore}
                    {r.percentile ? `, ${ordinal(r.percentile)} percentile` : ''}. Entered by {r.enteredBy?.role === 'ADMIN' ? 'Vienne' : r.enteredBy?.name.split(' ')[0]}, {fmtDate(r.enteredAt)}
                  </p>
                </div>
                <LevelBadge level={r.level} />
                {canEdit && <Button size="xs" variant="ghost" icon={Pencil} aria-label={`Edit ${r.window} ${r.schoolYear}`} onClick={() => setEditing(r)}>Edit</Button>}
              </li>
            ))}
          </ul>
        </>
      )}
      <ResultDrawer open={!!editing} result={editing} student={student} info={data} onClose={() => setEditing(null)} />
    </div>
  );
}

const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function ResultDrawer({ open, result, student, info, onClose }) {
  const show = useResultToast();
  const undoable = useUndoToast();
  const fast = info.testType === 'FAST_MATH';
  const blank = { schoolYear: YEARS[0], window: 'PM2', scaleScore: '', level: 3, percentile: '', categories: {} };
  const initial = result?.id ? { ...result, scaleScore: String(result.scaleScore), percentile: result.percentile ? String(result.percentile) : '', categories: Object.fromEntries(result.categories.map((c) => [c.categoryId, c.level])) } : blank;
  const [form, setForm] = useState(initial);
  const [key, setKey] = useState(result);
  if (key !== result) {
    setKey(result);
    setForm(initial);
  }
  const [save, saving] = useAction(api.fast.saveResult);
  const [remove] = useAction(api.fast.deleteResult);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={result?.id ? `Edit ${result.window} result` : `Add a ${testName(info.testType)} result`}
      subtitle={fast ? 'Copy the numbers from the score report in the Family Portal.' : 'Copy the numbers from the Star Math report from school.'}
      footer={
        <>
          {result?.id && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                if (undoable(await remove({ id: result.id }), 'Result removed', () => save({ studentId: student.id, ...payload(initial, fast) }))) onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={async () => {
              if (show(await save({ id: result?.id, studentId: student.id, ...payload(form, fast) }), 'Result saved')) onClose();
            }}
          >
            Save result
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="School year">
            {(id) => (
              <Select id={id} value={form.schoolYear} onChange={(e) => set({ schoolYear: e.target.value })}>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Test">
            <Segmented label="Test window" value={form.window} onChange={(window) => set({ window })} className="w-full" options={['PM1', 'PM2', 'PM3'].map((w) => ({ value: w, label: w }))} />
          </Field>
        </div>
        <Field label="Scale score">{(id) => <Input id={id} inputMode="numeric" value={form.scaleScore} onChange={(e) => set({ scaleScore: e.target.value.replace(/\D/g, '') })} placeholder={fast ? 'e.g. 226' : 'e.g. 512'} />}</Field>
        {fast ? (
          <>
            <Field label="Level" hint={LEVEL_TEXT[form.level]}>
              <Segmented label="Level" value={form.level} onChange={(level) => set({ level })} className="w-full" options={[1, 2, 3, 4, 5].map((l) => ({ value: l, label: String(l) }))} />
            </Field>
            {info.categories.length > 0 && (
              <fieldset className="space-y-3 rounded-xl border border-border p-4">
                <legend className="px-1 text-[14px] font-extrabold">Areas (optional)</legend>
                {info.categories.map((c) => (
                  <div key={c.id}>
                    <p className="text-[13.5px] font-bold" title={c.fullName}>{c.name}</p>
                    <Segmented
                      size="sm"
                      label={c.name}
                      value={form.categories[c.id] ?? null}
                      onChange={(lv) => set({ categories: { ...form.categories, [c.id]: lv } })}
                      className={cn('mt-1 w-full')}
                      options={[1, 2, 3, 4, 5].map((l) => ({ value: l, label: String(l) }))}
                    />
                  </div>
                ))}
              </fieldset>
            )}
          </>
        ) : (
          <Field label="Percentile rank (optional)">{(id) => <Input id={id} inputMode="numeric" value={form.percentile} onChange={(e) => set({ percentile: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="1 to 99" />}</Field>
        )}
      </div>
    </Drawer>
  );
}

const payload = (f, fast) => ({
  schoolYear: f.schoolYear,
  window: f.window,
  scaleScore: Number(f.scaleScore),
  ...(fast
    ? { level: f.level, categories: Object.entries(f.categories || {}).filter(([, v]) => v).map(([categoryId, level]) => ({ categoryId, level })) }
    : { percentile: f.percentile ? Number(f.percentile) : null }),
});
