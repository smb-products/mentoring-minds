import { CircleAlert, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';

/**
 * The only way AI output is shown: a clearly marked draft with three plain choices.
 * Nothing is saved until Vienne picks "Use this".
 */
export function DraftCard({ title = 'Draft for you', children, unsure = [], onUse, onChange, onDiscard, using, useLabel = 'Use this', className }) {
  return (
    <section aria-label={title} className={cn('rounded-[14px] border-2 border-brand/35 bg-brand-soft/40 p-4 @3xl/page:p-5', className)}>
      <p className="flex items-center gap-2 text-[15px] font-extrabold text-brand-soft-foreground">
        <Sparkles size={17} strokeWidth={2.2} aria-hidden />
        {title}
      </p>
      {unsure.length > 0 && (
        <ul className="mt-3 space-y-2">
          {unsure.map((u) => (
            <li key={u} className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[14px] font-semibold text-warning-soft-foreground">
              <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span>Check this: {u}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 space-y-4">{children}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="lg" variant="primary" onClick={onUse} disabled={using}>{useLabel}</Button>
        {onChange && <Button size="lg" onClick={onChange}>Change</Button>}
        <Button size="lg" variant="ghost" onClick={onDiscard}>No thanks</Button>
      </div>
    </section>
  );
}
