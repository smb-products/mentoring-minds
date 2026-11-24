import { useEffect, useRef, useState } from 'react';

/** Layout breakpoints (px) measured on the app container, not the window. */
export const BREAKPOINTS = { tablet: 768, desktop: 1024 };

const modeFor = (width) =>
  width < BREAKPOINTS.tablet ? 'phone' : width < BREAKPOINTS.desktop ? 'tablet' : 'desktop';

/**
 * Returns [ref, mode] where mode is 'phone' | 'tablet' | 'desktop'.
 * Measuring the container (instead of the window) lets the prototype preview
 * phone/tablet frames on a desktop screen. It works the same in Next.js.
 */
export function useLayoutMode() {
  const ref = useRef(null);
  const [mode, setMode] = useState(() =>
    typeof window === 'undefined' ? 'desktop' : modeFor(window.innerWidth),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setMode(modeFor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, mode];
}
