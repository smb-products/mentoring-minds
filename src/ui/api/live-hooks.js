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
    const run = () => {
      const mine = ++seq; // ignore answers from older runs that finish late
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          (data) => alive && mine === seq && setState({ data, error: null, loading: false }),
          (error) => alive && mine === seq && setState({ data: undefined, error, loading: false }),
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

  if (state.error) throw state.error;
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
