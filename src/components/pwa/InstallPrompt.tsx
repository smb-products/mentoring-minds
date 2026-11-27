'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const DISMISSED_KEY = 'mm.install.dismissedAt';

/**
 * "Add to your home screen" card, in plain steps.
 * Android/Chrome: one button (beforeinstallprompt). iPhone/iPad: Safari has no
 * install button, so we show the two taps (Share, then Add to Home Screen).
 * Hidden once installed, and for 30 days after "Not now".
 */
export function InstallPrompt({ className = '' }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    if (standalone || Date.now() - dismissed < 30 * 86400000) return;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIos(isIos);
    if (isIos) setShow(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!show) return null;
  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <section aria-label="Add to home screen" className={`relative rounded-lg border border-border bg-card p-5 shadow-card ${className}`}>
      <button type="button" onClick={dismiss} aria-label="Not now" className="absolute right-3 top-3 grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted">
        <X size={18} strokeWidth={1.75} aria-hidden />
      </button>
      <p className="pr-10 text-title">Add Mentoring Minds to your home screen</p>
      {ios ? (
        <ol className="mt-3 space-y-2 text-body">
          <li className="flex items-center gap-2">1. Tap <Share size={18} strokeWidth={1.75} aria-label="Share" className="text-primary" /> at the bottom of Safari.</li>
          <li className="flex items-center gap-2">2. Tap <SquarePlus size={18} strokeWidth={1.75} aria-hidden className="text-primary" /> Add to Home Screen.</li>
        </ol>
      ) : (
        <>
          <p className="mt-1 text-body text-muted-foreground">It opens like an app, full screen, with one tap.</p>
          <button
            type="button"
            className="mt-4 h-12 rounded-md bg-primary px-6 text-body font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            onClick={async () => {
              await deferred?.prompt();
              setShow(false);
            }}
          >
            Add to home screen
          </button>
        </>
      )}
    </section>
  );
}
