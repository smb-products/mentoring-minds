import { forwardRef, useId } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

const control =
  'w-full rounded-[10px] border border-input/70 bg-card px-3 text-[14.5px] font-semibold text-foreground placeholder:font-medium placeholder:text-subtle-foreground transition-colors hover:border-input focus-visible:border-ring';

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13.5px] font-bold text-foreground">
          {label}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? <p className="text-[13px] font-semibold text-critical">{error}</p> : hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'resize-y py-2.5 leading-relaxed [field-sizing:content] min-h-[5.5rem] max-h-[18rem]', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(control, 'h-10 appearance-none pr-9')} {...props}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );
});

/** Single choice from a few options. options: [{ value, label }] */
export function Segmented({ options, value, onChange, label, className, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full overflow-x-auto rounded-[10px] bg-muted p-[3px] [scrollbar-width:none]', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] font-bold transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-[13px] @max-3xl/app:h-10' : 'h-[34px] px-3 text-[14px] @max-3xl/app:h-10',
              selected ? 'bg-card text-foreground shadow-raised' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon && <o.icon size={15} strokeWidth={2.2} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 text-left">
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>}
      </span>
      <span className={cn('relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input/60')}>
        <span className={cn('absolute top-[3px] size-4 rounded-full bg-card shadow-raised transition-[left]', checked ? 'left-[19px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}

/** Multi-select chip (skills, students, subjects). */
export function Chip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 @max-3xl/app:h-10 @max-3xl/app:px-3 text-[13.5px] font-bold transition-colors',
        selected ? 'border-primary bg-brand-soft text-brand-soft-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {selected && <Check size={14} strokeWidth={2.6} aria-hidden />}
      {children}
    </button>
  );
}

/** Checkbox row for lists (question picker, student picker). */
export function CheckRow({ checked, onChange, children, meta }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/60">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input/70 bg-card',
        )}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold text-foreground">{children}</span>
      {meta && <span className="shrink-0 text-[13px] text-muted-foreground">{meta}</span>}
    </label>
  );
}

export const GRADE_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((g) => ({ value: g, label: g === 0 ? 'K' : String(g) }));
