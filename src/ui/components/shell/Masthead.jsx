import { createContext, useContext, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Link } from '../../lib/router';

/**
 * The flat navy masthead at the top of every page. Pages render <PageHeader>; its content
 * is portalled into the band the shell draws full-width above the page body.
 * `overlap` pulls the first row of page content up over the band.
 */
export const MastheadContext = createContext({ target: null, setOverlap: () => {} });

/** Where drawers, sheets and the quiz render: covers the work surface (desktop) or the screen (phone). */
export const OverlayContext = createContext(null);

export function PageHeader({ title, subtitle, actions, back, overlap = false, tabs, children }) {
  const { target, setOverlap } = useContext(MastheadContext);
  useEffect(() => {
    setOverlap(overlap);
    return () => {
      setOverlap(false);
    };
  }, [overlap, setOverlap]);
  if (!target) return null;

  return createPortal(
    <header className="pt-4 @3xl/page:pt-6">
      {back && (
        <Link href={back.href} className="-ml-1.5 mb-1 inline-flex min-h-10 items-center gap-1 rounded-md px-1.5 text-small font-medium text-ink-muted hover:text-ink-foreground @3xl/page:mb-1.5 @3xl/page:min-h-8">
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-page text-ink-foreground">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-body text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {tabs && (
        <div role="tablist" aria-label={tabs.label} className="scrollbar-none -mb-5 mt-5 flex gap-1 overflow-x-auto @3xl/page:-mb-6">
          {tabs.items.map((tab) => {
            const selected = tab.value === tabs.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => tabs.onChange(tab.value)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-t-md px-4 text-body font-medium transition-colors',
                  selected ? 'bg-background text-foreground' : 'text-ink-muted hover:bg-ink-foreground/10 hover:text-ink-foreground',
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn('tabular rounded-md px-1.5 text-caption font-semibold', selected ? 'bg-primary text-primary-foreground' : 'bg-ink-foreground/15 text-ink-foreground')}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>,
    target,
  );
}
