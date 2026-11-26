/**
 * S24: signing out never shows or logs an error. The queries on screen when sign-out starts are dropped:
 * a read that fails after that (the session just ended, or the request was cut off) shows nothing, and a
 * write made on the way out (forgetting the push address) refetches nothing. Queries that mount later
 * run as before. The server functions are fakes: this tests the adapter, not the server.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  listBooks: vi.fn(),
  removePushSubscription: vi.fn(),
}));

vi.mock('@/server/ai', () => ({}));
vi.mock('@/server/assignments', () => ({}));
vi.mock('@/server/books', () => ({ listBooks: fake.listBooks }));
vi.mock('@/server/content', () => ({}));
vi.mock('@/server/dashboard', () => ({}));
vi.mock('@/server/families', () => ({}));
vi.mock('@/server/fast', () => ({}));
vi.mock('@/server/invites', () => ({}));
vi.mock('@/server/messages', () => ({}));
vi.mock('@/server/notifications', () => ({ removePushSubscription: fake.removePushSubscription }));
vi.mock('@/server/reports', () => ({}));
vi.mock('@/server/scheduling', () => ({}));
vi.mock('@/server/taxonomy', () => ({}));

/* A minimal stand-in for React's hooks (as in live-adapter.test.ts), for several mounted components. */
const react = vi.hoisted(() => {
  type Comp = { slots: unknown[]; at: number; hook: () => unknown; value: unknown; thrown: unknown; unmounted: boolean; cleanups: Array<() => void> };
  let current: Comp | null = null;
  const render = (c: Comp) => {
    if (c.unmounted) return;
    const pending: Array<() => unknown> = [];
    c.at = 0;
    current = c;
    (c as Comp & { pending: typeof pending }).pending = pending;
    try {
      c.value = c.hook();
      c.thrown = undefined;
    } catch (e) {
      c.thrown = e;
    }
    current = null;
    pending.forEach((f) => {
      const cleanup = f();
      if (typeof cleanup === 'function') c.cleanups.push(cleanup as () => void);
    });
  };
  return {
    mount(hook: () => unknown) {
      const c: Comp = { slots: [], at: 0, hook, value: undefined, thrown: undefined, unmounted: false, cleanups: [] };
      render(c);
      return {
        get value() {
          return c.value;
        },
        get thrown() {
          return c.thrown;
        },
        unmount() {
          c.unmounted = true;
          c.cleanups.forEach((f) => f());
        },
      };
    },
    useState(init: unknown) {
      const c = current!;
      const i = c.at++;
      if (!(i in c.slots)) c.slots[i] = init;
      const set = (next: unknown) => {
        c.slots[i] = typeof next === 'function' ? (next as (p: unknown) => unknown)(c.slots[i]) : next;
        render(c);
      };
      return [c.slots[i], set];
    },
    useRef(init: unknown) {
      const c = current!;
      const i = c.at++;
      if (!(i in c.slots)) c.slots[i] = { current: init };
      return c.slots[i];
    },
    useEffect(effect: () => unknown, deps: unknown[]) {
      const c = current! as Comp & { pending: Array<() => unknown> };
      const i = c.at++;
      const prev = c.slots[i] as unknown[] | undefined;
      if (!prev || deps.some((d, k) => d !== prev[k])) {
        c.slots[i] = deps;
        c.pending.push(effect);
      }
    },
    useCallback: (f: unknown) => f,
  };
});
vi.mock('react', () => ({ useState: react.useState, useRef: react.useRef, useEffect: react.useEffect, useCallback: react.useCallback }));

import { live } from '@/ui/api/live';
import { changed, onLocked, signingOut, useQuery } from '@/ui/api/live-hooks';

const NETWORK = 'We couldn’t reach the server. Check your connection and try again.';
const flush = () => new Promise((r) => setTimeout(r, 0));
type State = { data: unknown; error: (Error & { code?: string }) | null; loading: boolean };

/** A server call that answers when the test says so. */
function later() {
  let settle!: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
  const promise = new Promise((resolve, reject) => (settle = { resolve, reject }));
  return { promise, ...settle };
}

let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);
const mounted: Array<{ unmount: () => void }> = [];
const mount = (hook: () => unknown) => {
  const m = react.mount(hook);
  mounted.push(m);
  return m;
};

beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
  Object.values(fake).forEach((f) => f.mockReset());
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  mounted.splice(0).forEach((m) => m.unmount());
  signingOut()(); // the next test starts signed in
  vi.unstubAllGlobals();
});

describe('a read still on its way when sign-out starts', () => {
  it('is dropped without an error when it fails because the connection was cut', async () => {
    const call = later();
    fake.listBooks.mockReturnValue(call.promise);
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(screen.value).toMatchObject({ loading: true, error: null });

    signingOut();
    call.reject(new TypeError('Failed to fetch'));
    await flush();
    expect(screen.thrown).toBeUndefined(); // nothing for the error boundary to show or log
    expect(screen.value).toMatchObject({ loading: true, error: null });
    expect(unhandled).toEqual([]);
  });

  it('is dropped when the session has just ended (the server refuses it), and the paused screen is not asked for', async () => {
    const locked = vi.fn();
    const stop = onLocked(locked);
    const call = later();
    fake.listBooks.mockReturnValue(call.promise);
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();

    signingOut();
    call.resolve({ ok: false, error: 'Sign in to keep going.', code: 'UNAUTHORIZED' });
    await flush();
    expect(screen.thrown).toBeUndefined();
    expect(screen.value).toMatchObject({ error: null });

    const second = later();
    fake.listBooks.mockReturnValue(second.promise);
    const other = mount(() => useQuery(() => live.books.listBooks(), [])); // mounted before this sign-out
    await flush();
    signingOut();
    second.resolve({ ok: false, error: 'Your account is paused.', code: 'NOT_ACTIVE' });
    await flush();
    expect(other.thrown).toBeUndefined();
    expect(locked).not.toHaveBeenCalled();
    stop();
  });

  it('keeps the data already on screen and shows no error when its refetch fails', async () => {
    fake.listBooks.mockResolvedValue({ ok: true, data: ['badge'] });
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    const call = later();
    fake.listBooks.mockReturnValue(call.promise);
    changed(); // a refetch is on its way
    await flush();

    signingOut();
    call.reject(new TypeError('Failed to fetch'));
    await flush();
    expect(screen.thrown).toBeUndefined();
    expect(screen.value).toMatchObject({ data: ['badge'], error: null });
  });
});

describe('after sign-out starts', () => {
  it('a write on the way out (forgetting the push address) refetches nothing', async () => {
    fake.listBooks.mockResolvedValue({ ok: true, data: [] });
    mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(fake.listBooks).toHaveBeenCalledTimes(1);

    signingOut();
    fake.removePushSubscription.mockResolvedValue({ ok: true, data: null });
    expect(await live.notifications.removePushSubscription({ endpoint: 'https://push.example/1' })).toEqual({ ok: true, data: null });
    changed();
    await flush();
    expect(fake.listBooks).toHaveBeenCalledTimes(1);
  });

  it('a query that mounts before the sign-in page replaces the screen (even after the sign-out call returned) fetches nothing and shows no error', async () => {
    vi.stubGlobal('location', { pathname: '/admin/today' });
    signingOut();
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(fake.listBooks).not.toHaveBeenCalled();
    expect(screen.thrown).toBeUndefined();
  });

  it('once the sign-in page is up, the next sign-in (same address as before) shows a failed read exactly as before', async () => {
    const at = { pathname: '/admin/today' };
    vi.stubGlobal('location', at);
    signingOut();
    at.pathname = '/sign-in'; // the redirect lands
    await new Promise((r) => setTimeout(r, 120));
    at.pathname = '/admin/today'; // Vienne signs in again, in the same tab
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(screen.thrown).toMatchObject({ message: NETWORK, code: 'NETWORK' });
  });

  it('a query that mounts on a new address (no watch tick yet) runs as before', async () => {
    const at = { pathname: '/parent/home' };
    vi.stubGlobal('location', at);
    signingOut();
    at.pathname = '/admin/today';
    fake.listBooks.mockResolvedValue({ ok: true, data: ['x'] });
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(screen.value).toMatchObject({ data: ['x'], error: null });
  });

  it('when signing out fails, resume() runs the screen again: its answers and errors show as before', async () => {
    const call = later();
    fake.listBooks.mockReturnValue(call.promise);
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();

    const resume = signingOut();
    call.resolve({ ok: true, data: ['dropped'] });
    await flush();
    expect(screen.value).toMatchObject({ loading: true });

    fake.listBooks.mockResolvedValue({ ok: true, data: ['badge'] });
    resume();
    await flush();
    expect(screen.value).toMatchObject({ data: ['badge'], error: null, loading: false });

    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    changed(); // writes refresh it again
    await flush();
    expect((screen.value as State).error).toMatchObject({ message: NETWORK, code: 'NETWORK' });
  });
});

describe('while signed in (no sign-out)', () => {
  it('a failed read shows its error and a write still refreshes the screen', async () => {
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    const first = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(first.thrown).toMatchObject({ message: NETWORK, code: 'NETWORK' });

    fake.listBooks.mockResolvedValue({ ok: true, data: ['a'] });
    const screen = mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    fake.listBooks.mockResolvedValue({ ok: true, data: ['a', 'b'] });
    fake.removePushSubscription.mockResolvedValue({ ok: true, data: null });
    await live.notifications.removePushSubscription({ endpoint: 'https://push.example/1' });
    await flush();
    expect(screen.value).toMatchObject({ data: ['a', 'b'], error: null });
  });
});
