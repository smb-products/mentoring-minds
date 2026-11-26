'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useQuery / useAction for the live backend. Queries re-run after any successful
 * write, so a change on one screen shows up on the others without a reload.
 */
const listeners = new Set();

/** Called by the live adapter after a successful write. */
export function changed() {
  listeners.forEach((l) => l());
}

/**
 * Paused while signed in: the server refused (NOT_ACTIVE) a read or write the shell thought was
 * allowed. The shell listens only while it shows a parent the active pages (ShellContext) and then
 * re-reads the account. For everyone else nothing changes.
 */
const lockedListeners = new Set();

export function onLocked(listener) {
  lockedListeners.add(listener);
  return () => lockedListeners.delete(listener);
}

/** True when `error` (a thrown read or a write's Result) is a NOT_ACTIVE the shell now handles. */
export function refused(error) {
  if (error?.code !== 'NOT_ACTIVE' || lockedListeners.size === 0) return false;
  lockedListeners.forEach((l) => l());
  return true;
}

/**
 * Signing out (S24): the queries on screen when sign-out starts, and any that mount before it is over,
 * belong to a session that is ending. They don't fetch or refetch, and any answer still on its way (data
 * or error) is dropped, so a read that fails because the session just ended shows nothing and logs
 * nothing. It is over once the address changes (the sign-in page has replaced the screen, even after
 * the sign-out call returned): queries that mount from then on (the next person to sign in) run as usual.
 */
const onScreen = new Set();
let leaving = null; // { from: the address sign-out started on, watch: the timer that sees it change }
const here = () => globalThis.location?.pathname;

function left() {
  clearInterval(leaving?.watch);
  leaving = null;
}

/** Call before signing out. Returns resume(), for when signing out failed: the screen's queries run again. */
export function signingOut() {
  left();
  const from = here();
  leaving = { from, watch: setInterval(() => here() !== from && left(), 50) };
  onScreen.forEach((q) => (q.ended = true));
  return () => {
    left();
    onScreen.forEach((q) => {
      q.ended = false;
      q.run?.();
    });
  };
}

export function useQuery(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const self = useRef(null);
  if (!self.current) self.current = { ended: false, run: null };

  useEffect(() => {
    const me = self.current;
    if (leaving && here() !== leaving.from) left();
    if (leaving) me.ended = true;
    let alive = true;
    let seq = 0;
    let hasData = false; // a good answer for these deps: kept when a later refetch fails
    const run = () => {
      if (me.ended) return;
      const mine = ++seq; // ignore answers from older runs that finish late
      Promise.resolve()
        .then(() => fnRef.current())
        .then(
          (data) => {
            if (!alive || mine !== seq || me.ended) return;
            hasData = true;
            setState({ data, error: null, loading: false, hasData: true });
          },
          (error) => {
            if (!alive || mine !== seq || me.ended) return;
            // Paused while signed in: stay loading while the shell swaps in the paused screen.
            if (refused(error)) return;
            setState((prev) => (hasData ? { ...prev, error, loading: false } : { data: undefined, error, loading: false, hasData: false }));
          },
        );
    };
    me.run = run;
    run();
    listeners.add(run);
    onScreen.add(me);
    return () => {
      alive = false;
      me.run = null;
      listeners.delete(run);
      onScreen.delete(me);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // No data yet: the page's ErrorBoundary shows the problem. With data on screen, a failed
  // refetch keeps it and sets state.error. Reads outside a page (the shell's) catch NOT_ACTIVE
  // themselves (unlessLocked in ShellContext), since no boundary is above them. A NOT_ACTIVE while
  // the shell shows a parent the active pages never lands here: refused() hands it to the shell.
  if (state.error && !state.hasData) throw state.error;
  return state;
}

export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const run = useCallback(
    async (...args) => {
      setPending(true);
      try {
        const result = await fn(...args);
        if (result?.ok === false) refused(result);
        return result;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return [run, pending];
}
