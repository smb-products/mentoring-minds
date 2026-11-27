import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { usePathname } from '../../lib/router';
import { useLayoutMode } from '../../lib/useLayoutMode';
import { ToastProvider } from '../ui/Toast';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { PausedNotice, useLocked } from './Locked';
import { MastheadContext, OverlayContext } from './Masthead';
import { PhoneNav, PhoneTop } from './PhoneNav';
import { Rail } from './Rail';
import { LayoutProvider } from './ShellContext';

/**
 * App shell (docs/DESIGN.md → App polish), all on the light page:
 *  tablet + desktop: the white sidebar, then the page: its header (back, title, subtitle, actions, tabs), then the body.
 *  phone: the top row and the page header, the page body, the white bottom navigation bar in the layout flow.
 * PORTING: app/(admin)/layout.jsx and app/(parent)/layout.jsx ('use client').
 */
export function AppShell({ children }) {
  const pathname = usePathname();
  const [ref, mode] = useLayoutMode();
  const phone = mode === 'phone';
  const locked = useLocked();
  const [target, setTarget] = useState(null);
  const [overlayHost, setOverlayHost] = useState(null);
  // Phones: pin overlays to the visible screen, not to a scrolling ancestor.
  const host = <div ref={setOverlayHost} className={cn('pointer-events-none inset-0 z-50 *:pointer-events-auto', phone ? 'fixed' : 'absolute')} />;
  const masthead = useMemo(() => ({ target }), [target]);

  const Body = phone ? 'main' : 'div';
  const body = (
    <Body key={pathname} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      {phone && <PhoneTop />}
      {/* PageHeader portals into this header; it hides itself on a page without one. */}
      <header ref={setTarget} className="@container/page relative mx-auto w-full max-w-[1240px] px-4 pt-4 empty:hidden @3xl/app:px-8 @3xl/app:pt-6" />
      <div className="@container/page relative mx-auto w-full max-w-[1240px] px-4 pb-10 pt-5 @3xl/app:px-8 @3xl/app:pt-6">
        <ErrorBoundary>
          {locked === 'PAUSED' && <PausedNotice className="mb-5" />}
          {children}
        </ErrorBoundary>
      </div>
    </Body>
  );

  return (
    <LayoutProvider value={mode}>
      <MastheadContext.Provider value={masthead}>
      <OverlayContext.Provider value={overlayHost}>
        <div ref={ref} className={cn('@container/app relative flex h-full w-full overflow-hidden bg-background text-foreground', phone && 'flex-col')}>
          <ToastProvider offsetClass={phone ? 'bottom-20' : 'bottom-5'}>
            {phone ? (
              <>
                {body}
                <PhoneNav />
                {host}
              </>
            ) : (
              <>
                <Rail />
                <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
                  {body}
                  {host}
                </main>
              </>
            )}
          </ToastProvider>
        </div>
      </OverlayContext.Provider>
      </MastheadContext.Provider>
    </LayoutProvider>
  );
}
