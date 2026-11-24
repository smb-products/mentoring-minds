import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from './core';

/**
 * useQuery(() => api.scheduling.listSessions({...}), [deps])
 * Re-runs when data changes. PORTING: in Next.js, server components call the
 * same server/ function directly; client components use a server action or fetch.
 */
export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    const run = () =>
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          (data) => alive && setState({ data, error: null, loading: false }),
          (error) => alive && setState({ data: undefined, error, loading: false }),
        );
    run();
    const unsubscribe = subscribe(run);
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Let the page's ErrorBoundary show the problem instead of rendering nothing.
  if (state.error) throw state.error;
  return state;
}

/** const [run, pending] = useAction(api.scheduling.confirmSession) → run(input) resolves to a Result. */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args) => {
      setPending(true);
      try {
        return await fn(...args);
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return [run, pending];
}
