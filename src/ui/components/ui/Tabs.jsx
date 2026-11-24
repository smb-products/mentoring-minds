import { cn } from '../../lib/cn';

/** Underline tabs. tabs: [{ value, label, count? }] */
export function Tabs({ tabs, value, onChange, label, className }) {
  return (
    <div role="tablist" aria-label={label} className={cn('scrollbar-none -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-border px-1', className)}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative -mb-px flex h-10 shrink-0 items-center gap-2 px-2.5 text-[14.5px] font-bold transition-colors',
              selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn('tabular rounded-md px-1.5 text-[12px] font-extrabold', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {tab.count}
              </span>
            )}
            {selected && <span className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
