'use client';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { requestInvite } from '@/server/requests';

const GRADES = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ value: String(g), label: g === 0 ? 'Kindergarten' : `Grade ${g}` }));
const SENT = 'Thanks. Vienne will email you soon.';

// Landing C's dark panel (docs/design/landing-c.html). text-field: 16px on phones (iOS zooms below that), 14px from 768px.
const control =
  'w-full rounded-[12px] border border-landing-night-line bg-landing-night-raised px-3.5 py-3 text-field text-landing-paper hover:border-landing-night-muted focus-visible:border-landing-night-link';

/** A label over its control, as in the mockup. */
function Field({ label, className = '', children }: { label: string; className?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[14px] font-medium text-landing-night-text">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/**
 * L2: the landing page's "Request an invite" form, for signed-out visitors. It reaches Vienne's alerts
 * (src/server/requests.ts → requestInvite); she makes the code and replies from her own email.
 * `website` is a honeypot: off-screen and hidden from screen readers, so only a bot fills it.
 * L4 restyled it for Landing C's dark "Ready to get started?" panel; the fields, labels and messages are L2's.
 */
export function RequestInvite() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? '');
    const grade = value('grade');
    setSending(true);
    setError(null);
    try {
      const r = await requestInvite({
        parentName: value('parentName'),
        email: value('email'),
        phone: value('phone') || null,
        grade: grade === '' ? (undefined as unknown as number) : Number(grade),
        message: value('message'),
        website: value('website'),
      });
      if (r.ok) setSent(true);
      else setError(r.error);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="text-[17px] font-medium text-landing-paper">
        {SENT}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Request an invite" className="relative grid gap-3.5 sm:grid-cols-2">
      <Field label="Parent name">{(id) => <input id={id} name="parentName" autoComplete="name" maxLength={80} required className={control} />}</Field>
      <Field label="Email">
        {(id) => <input id={id} name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required className={control} />}
      </Field>
      <Field label="Phone (optional)">
        {(id) => <input id={id} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} className={control} />}
      </Field>
      <Field label="Child’s grade (K–6)">
        {(id) => (
          <div className="relative">
            <select id={id} name="grade" defaultValue="" required className={`${control} appearance-none pr-10`}>
              <option value="" disabled>
                Choose a grade
              </option>
              {GRADES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-landing-night-muted" />
          </div>
        )}
      </Field>
      <Field label="Message" className="sm:col-span-2">
        {(id) => <textarea id={id} name="message" rows={4} maxLength={1000} className={`${control} resize-y`} />}
      </Field>
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="request-invite-website">Website</label>
        <input id="request-invite-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex w-full items-center justify-center rounded-[12px] bg-landing-accent px-[26px] py-3.5 font-semibold text-landing-paper hover:bg-landing-accent-hover disabled:opacity-70 sm:w-auto"
        >
          {sending ? 'Sending…' : 'Send request'}
        </button>
        <p role="alert" className="text-[14px] font-medium text-landing-night-error empty:hidden">
          {error ?? ''}
        </p>
      </div>
    </form>
  );
}
