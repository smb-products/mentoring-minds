import { useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { usePathname } from '../../lib/router';
import { useLayoutMode } from '../../lib/useLayoutMode';
import { ToastProvider } from '../ui/Toast';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { PausedNotice, useLocked } from './Locked';
import { BandMotif, MastheadContext, OverlayContext } from './Masthead';
import { PhoneNav, PhoneTop } from './PhoneNav';
import { Rail } from './Rail';
import { LayoutProvider } from './ShellContext';

/**
 * App shell.
 *  tablet + desktop: navy rail, rounded silver work surface, navy masthead band per page.
 *  phone: navy top row + masthead, page body, bottom navigation bar in the layout flow.
 * PORTING: app/(admin)/layout.jsx and app/(parent)/layout.jsx ('use client').
 */
export function AppShell({ children }) {
  const pathname = usePathname();
  const [ref, mode] = useLayoutMode();
  const phone = mode === 'phone';
  const locked = useLocked();
  const [target, setTarget] = useState(null);
  const [overlap, setOverlap] = useState(false);
  const [overlayHost, setOverlayHost] = useState(null);
  // Phones: pin overlays to the visible screen, not to a scrolling ancestor.
  const host = <div ref={setOverlayHost} className={cn('pointer-events-none inset-0 z-50 *:pointer-events-auto', phone ? 'fixed' : 'absolute')} />;
  const masthead = useMemo(() => ({ target, setOverlap }), [target]);

  const Body = phone ? 'main' : 'div';
  const body = (
    <Body key={pathname} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="band relative overflow-hidden">
        <BandMotif className="-right-20 -top-6 h-[19rem] w-[21rem] text-ink-foreground/[0.09] @3xl/app:-top-10 @3xl/app:right-6 @3xl/app:h-[24rem] @3xl/app:w-[27rem]" />
        {phone && <PhoneTop />}
        <div ref={setTarget} className={cn('@container/page relative mx-auto w-full max-w-[1240px] px-4 @3xl/app:px-8', overlap ? 'pb-[4.5rem]' : 'pb-6 @3xl/app:pb-8')} />
      </div>
      <div className={cn('@container/page relative mx-auto w-full max-w-[1240px] px-4 pb-10 @3xl/app:px-8', overlap ? '-mt-12' : 'pt-5 @3xl/app:pt-6')}>
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
        <div ref={ref} className={cn('@container/app relative flex h-full w-full overflow-hidden text-foreground', phone ? 'flex-col bg-background' : 'rail bg-sidebar')}>
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
                <main className="relative my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-panel bg-background">
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
