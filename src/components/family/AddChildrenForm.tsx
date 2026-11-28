'use client';

import { useId, useState, useTransition } from 'react';
import { api } from '@/ui/api';

/** S36's limit (families.ts MAX_CHILDREN_AT_SIGNUP): more children later go through Vienne. */
export const MAX_CHILDREN_AT_SIGNUP = 6;
const GRADES = [
  { value: 0, label: 'K' },
  ...[1, 2, 3, 4, 5, 6].map((g) => ({ value: g, label: String(g) })),
];

type Row = { key: number; firstName: string; grade: string };

const input = 'h-12 w-full min-w-0 rounded-[12px] border border-input/70 bg-card px-3.5 text-field text-foreground';
const label = 'block text-body font-medium text-foreground';

/**
 * J2, open sign-up: a parent with no children yet adds them (families.addMyChildren, S36), then the app opens.
 * `onAlreadyAdded`: the server says the account already has children (Vienne added them, or another tab did),
 * so the step steps aside.
 */
export function AddChildrenForm({ onAlreadyAdded }: { onAlreadyAdded?: () => void }) {
  const [rows, setRows] = useState<Row[]>([{ key: 0, firstName: '', grade: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const ready = rows.every((r) => r.firstName.trim() && r.grade !== '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await api.families.addMyChildren({ children: rows.map((c) => ({ firstName: c.firstName.trim(), grade: Number(c.grade) })) });
          if (r.ok) window.location.assign('/parent/home'); // a full load: the layout reads the account again
          else if (r.code === 'CONFLICT' && onAlreadyAdded) onAlreadyAdded();
          else setError(r.error);
        });
      }}
    >
      <div className="space-y-4">
        {rows.map((row, i) => (
          <fieldset key={row.key} className="flex items-end gap-3">
            <legend className="sr-only">{`Child ${i + 1}`}</legend>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label htmlFor={`${id}-${row.key}-name`} className={label}>Child’s first name</label>
              <input
                id={`${id}-${row.key}-name`}
                autoComplete="off"
                maxLength={40}
                required
                value={row.firstName}
                onChange={(e) => set(row.key, { firstName: e.target.value })}
                className={input}
              />
            </div>
            <div className="w-[88px] shrink-0 space-y-1.5">
              <label htmlFor={`${id}-${row.key}-grade`} className={label}>Grade</label>
              <select id={`${id}-${row.key}-grade`} required value={row.grade} onChange={(e) => set(row.key, { grade: e.target.value })} className={input}>
                <option value="" disabled>
                  –
                </option>
                {GRADES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
        ))}
      </div>
      {rows.length < MAX_CHILDREN_AT_SIGNUP && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((r) => r.key)) + 1, firstName: '', grade: '' }])}
          className="hit-area mt-3 rounded-md text-body font-semibold text-brand underline-offset-4 hover:underline"
        >
          Add another child
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-body font-medium text-critical">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !ready}
        className="mt-5 flex h-12 w-full items-center justify-center rounded-[12px] bg-primary text-body font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
      >
        Continue
      </button>
    </form>
  );
}
