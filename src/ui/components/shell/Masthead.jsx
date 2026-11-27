import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Link } from '../../lib/router';

/**
 * The page header at the top of every page, on the light page (App polish: no navy band). Pages render
 * <PageHeader>; its content is portalled into the <header> the shell draws above the page body, so the
 * back link, title, subtitle, actions and tabs always come first and nothing overlaps them.
 */
export const MastheadContext = createContext({ target: null });

/** Where drawers, sheets and the quiz render: covers the work surface (desktop) or the screen (phone). */
export const OverlayContext = createContext(null);

export function PageHeader({ title, subtitle, actions, back, tabs, children }) {
  const { target } = useContext(MastheadContext);
  if (!target) return null;

  return createPortal(
    <>
      {back && (
        <Link href={back.href} className="-ml-1.5 mb-1 inline-flex min-h-10 items-center gap-1 rounded-md px-1.5 text-small font-medium text-muted-foreground hover:text-foreground @3xl/page:mb-0.5 @3xl/page:min-h-8">
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-page text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-body text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      {tabs && (
        <div role="tablist" aria-label={tabs.label} className="scrollbar-none mt-4 flex gap-1 overflow-x-auto border-b border-border">
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
                  '-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-body font-medium transition-colors',
                  selected ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn('tabular rounded-md px-1.5 text-caption font-semibold', selected ? 'bg-primary text-primary-foreground' : 'bg-badge text-badge-foreground')}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>,
    target,
  );
}
