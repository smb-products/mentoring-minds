'use client';
import { useState, type ButtonHTMLAttributes, type ComponentType, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { requestInvite } from '@/server/requests';
import * as buttons from '@/ui/components/ui/Button';
import * as form from '@/ui/components/ui/Form';

// The app's own controls (JSX), typed for this file.
const Button = buttons.Button as unknown as ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }>;
const Field = form.Field as unknown as ComponentType<{ label: string; className?: string; children: (id: string) => ReactNode }>;
const Input = form.Input as unknown as ComponentType<InputHTMLAttributes<HTMLInputElement>>;
const Select = form.Select as unknown as ComponentType<SelectHTMLAttributes<HTMLSelectElement>>;
const Textarea = form.Textarea as unknown as ComponentType<TextareaHTMLAttributes<HTMLTextAreaElement>>;

const GRADES = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ value: String(g), label: g === 0 ? 'Kindergarten' : `Grade ${g}` }));
const SENT = 'Thanks. Vienne will email you soon.';

/**
 * L2: the landing page's "Request an invite" form, for signed-out visitors. It reaches Vienne's alerts
 * (src/server/requests.ts → requestInvite); she makes the code and replies from her own email.
 * `website` is a honeypot: off-screen and hidden from screen readers, so only a bot fills it.
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
      <p role="status" className="max-w-2xl text-body text-foreground">
        {SENT}
      </p>
    );
  }

  return (
    // text-field: the controls inherit it, at 16px on phones (R1 renamed the field token, which Tailwind had read as a colour).
    <form onSubmit={onSubmit} noValidate aria-label="Request an invite" className="relative grid max-w-2xl gap-4 text-field sm:grid-cols-2">
      <Field label="Parent name">{(id: string) => <Input id={id} name="parentName" autoComplete="name" maxLength={80} required />}</Field>
      <Field label="Email">{(id: string) => <Input id={id} name="email" type="email" inputMode="email" autoComplete="email" maxLength={254} required />}</Field>
      <Field label="Phone (optional)">{(id: string) => <Input id={id} name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} />}</Field>
      <Field label="Child’s grade (K–6)">
        {(id: string) => (
          <Select id={id} name="grade" defaultValue="" required>
            <option value="" disabled>
              Choose a grade
            </option>
            {GRADES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Message" className="sm:col-span-2">
        {(id: string) => <Textarea id={id} name="message" rows={4} maxLength={1000} />}
      </Field>
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="request-invite-website">Website</label>
        <input id="request-invite-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send request'}
        </Button>
        <p role="alert" className="text-small font-medium text-critical empty:hidden">
          {error ?? ''}
        </p>
      </div>
    </form>
  );
}
