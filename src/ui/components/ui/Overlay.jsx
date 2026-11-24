import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';
import { useShell } from '../shell/ShellContext';
import { OverlayContext } from '../shell/Masthead';

/**
 * Drawer: slides in from the right on tablet/desktop, comes up as a bottom sheet on phones.
 * The sheet is capped at 88% height and scrolls, so its header is always visible.
 */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 'w-[480px]' }) {
  const { mode } = useShell();
  const phone = mode === 'phone';
  const panelRef = useRef(null);
  const host = useContext(OverlayContext);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef(null);
  // Swipe the handle or header down to close (phones).
  const drag = phone
    ? {
        onTouchStart: (e) => (dragStart.current = e.touches[0].clientY),
        onTouchMove: (e) => dragStart.current != null && setDragY(Math.max(0, e.touches[0].clientY - dragStart.current)),
        onTouchEnd: () => {
          if (dragY > 90) onClose();
          dragStart.current = null;
          setDragY(0);
        },
      }
    : {};

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      // Keep Tab inside the sheet while it is open.
      const items = [...panelRef.current.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    // preventScroll: focusing must never scroll the page (iOS shifts the whole app otherwise).
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open || !host) return null;
  return createPortal(
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/35" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute flex flex-col bg-popover text-popover-foreground shadow-float outline-none',
          phone ? 'inset-x-0 bottom-0 max-h-[88%] animate-sheet-up rounded-t-[18px]' : `inset-y-0 right-0 max-w-full animate-drawer-in border-l border-border ${width}`,
        )}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div {...drag} className="shrink-0 touch-none">
        {phone && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden />}
        <div className={cn('flex shrink-0 items-start gap-3 border-b border-border px-5', phone ? 'pb-3 pt-2' : 'py-4')}>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold leading-snug">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13.5px] text-muted-foreground">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-1.5" />
        </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
        {footer && <div className={cn('flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3', phone && 'pb-[max(env(safe-area-inset-bottom),12px)]')}>{footer}</div>}
      </div>
    </div>,
    host,
  );
}

/** Anchored popover. Wrap trigger + popover in a `relative` element. */
export function Popover({ open, onClose, className, children, ignoreRef, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const first = ref.current?.querySelector('button, a[href], input, [tabindex="0"]');
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onPointer = (e) => {
      if (ref.current?.contains(e.target) || ignoreRef?.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, onClose, ignoreRef]);
  if (!open) return null;
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className={cn('absolute z-50 animate-pop rounded-[14px] border border-border bg-popover text-popover-foreground shadow-float', className)}>
      {children}
    </div>
  );
}
