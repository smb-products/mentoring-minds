'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe as subscribeMock } from '../../mock/core';

/**
 * The same useQuery / useAction as the mock (src/mock/hooks.js), for the live
 * backend. Queries re-run after any successful write — live or mock — so screens
 * stay in step while namespaces are switched over one at a time.
 */
const listeners = new Set();

/** Called by the live adapter after a successful write. */
export function changed() {
  listeners.forEach((l) => l());
}

export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    let seq = 0;
    let hasData = false; // a good answer for these deps: kept when a later refetch fails
    const run = () => {
      const mine = ++seq; // ignore answers from older runs that finish late
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          (data) => {
            if (!alive || mine !== seq) return;
            hasData = true;
            setState({ data, error: null, loading: false, hasData: true });
          },
          (error) => {
            if (!alive || mine !== seq) return;
            setState((prev) => (hasData ? { ...prev, error, loading: false } : { data: undefined, error, loading: false, hasData: false }));
          },
        );
    };
    run();
    listeners.add(run);
    const unsubscribeMock = subscribeMock(run);
    return () => {
      alive = false;
      listeners.delete(run);
      unsubscribeMock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // No data yet: the page's ErrorBoundary shows the problem. With data on screen, a failed
  // refetch (a paused parent's badges getting NOT_ACTIVE, say) keeps it and sets state.error.
  if (state.error && !state.hasData) throw state.error;
  return state;
}

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
