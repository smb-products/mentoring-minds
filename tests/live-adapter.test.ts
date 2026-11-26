/**
 * The live adapter (src/ui/api/live.js, live-hooks.js) when a server call throws or a refetch fails.
 * The server functions are fakes: this tests the adapter, not the server.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  listBooks: vi.fn(),
  saveBook: vi.fn(),
  createUpload: vi.fn(),
  finishUpload: vi.fn(),
}));

vi.mock('@/server/ai', () => ({}));
vi.mock('@/server/assignments', () => ({}));
vi.mock('@/server/books', () => ({ listBooks: fake.listBooks, saveBook: fake.saveBook }));
vi.mock('@/server/content', () => ({ createUpload: fake.createUpload, finishUpload: fake.finishUpload }));
vi.mock('@/server/dashboard', () => ({}));
vi.mock('@/server/families', () => ({}));
vi.mock('@/server/fast', () => ({}));
vi.mock('@/server/invites', () => ({}));
vi.mock('@/server/messages', () => ({}));
vi.mock('@/server/notifications', () => ({}));
vi.mock('@/server/reports', () => ({}));
vi.mock('@/server/scheduling', () => ({}));
vi.mock('@/server/taxonomy', () => ({}));

/* A minimal stand-in for React's hooks, so useQuery runs as written without a DOM. */
const react = vi.hoisted(() => {
  let slots: unknown[] = [];
  let at = 0;
  let pending: Array<() => void> = [];
  let hook: () => unknown = () => undefined;
  const out: { value: unknown; thrown: unknown } = { value: undefined, thrown: undefined };
  const render = () => {
    at = 0;
    try {
      out.value = hook();
      out.thrown = undefined;
    } catch (e) {
      out.thrown = e;
    }
    const run = pending;
    pending = [];
    run.forEach((f) => f());
  };
  return {
    out,
    mount(h: () => unknown) {
      slots = [];
      hook = h;
      render();
    },
    useState(init: unknown) {
      const i = at++;
      if (!(i in slots)) slots[i] = init;
      const set = (next: unknown) => {
        slots[i] = typeof next === 'function' ? (next as (p: unknown) => unknown)(slots[i]) : next;
        render();
      };
      return [slots[i], set];
    },
    useRef(init: unknown) {
      const i = at++;
      if (!(i in slots)) slots[i] = { current: init };
      return slots[i];
    },
    useEffect(effect: () => void, deps: unknown[]) {
      const i = at++;
      const prev = slots[i] as unknown[] | undefined;
      if (!prev || deps.some((d, k) => d !== prev[k])) {
        slots[i] = deps;
        pending.push(effect);
      }
    },
    useCallback: (f: unknown) => f,
  };
});
vi.mock('react', () => ({ useState: react.useState, useRef: react.useRef, useEffect: react.useEffect, useCallback: react.useCallback }));

import { live } from '@/ui/api/live';
import { changed, useQuery } from '@/ui/api/live-hooks';

const NETWORK = 'We couldn’t reach the server. Check your connection and try again.';
const STALE = 'The app was just updated. Reload the page to keep going.';
const flush = () => new Promise((r) => setTimeout(r, 0));
const staleError = () => new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.');

let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);
beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
  Object.values(fake).forEach((f) => f.mockReset());
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  vi.unstubAllGlobals();
});

describe('writes (asWrite)', () => {
  it('returns a NETWORK result, not a rejection, when the call throws', async () => {
    fake.saveBook.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await live.books.saveBook({ title: 'x' });
    await flush();
    expect(r).toEqual({ ok: false, error: NETWORK, code: 'NETWORK' });
    expect(unhandled).toEqual([]);
  });

  it('treats a redirect after the session ended (a thrown NEXT_REDIRECT) as NETWORK', async () => {
    fake.saveBook.mockRejectedValue(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/login;307;' }));
    expect(await live.books.saveBook({})).toEqual({ ok: false, error: NETWORK, code: 'NETWORK' });
  });

  it('returns STALE when the app was redeployed under an open tab', async () => {
    fake.saveBook.mockRejectedValue(staleError());
    expect(await live.books.saveBook({})).toEqual({ ok: false, error: STALE, code: 'STALE' });
  });

  it('still returns the server’s own Result untouched', async () => {
    fake.saveBook.mockResolvedValue({ ok: false, error: 'Pick a grade.', code: 'INVALID' });
    expect(await live.books.saveBook({})).toEqual({ ok: false, error: 'Pick a grade.', code: 'INVALID' });
    fake.saveBook.mockResolvedValue({ ok: true, data: { id: 'b1' } });
    expect(await live.books.saveBook({})).toEqual({ ok: true, data: { id: 'b1' } });
  });
});

describe('reads (asRead)', () => {
  it('throws the NETWORK message as an Error with .code', async () => {
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await live.books.listBooks().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).toBe(NETWORK);
    expect((e as Error & { code: string }).code).toBe('NETWORK');
  });

  it('throws the STALE message as an Error with .code', async () => {
    fake.listBooks.mockRejectedValue(staleError());
    const e = await live.books.listBooks().catch((x: unknown) => x);
    expect((e as Error).message).toBe(STALE);
    expect((e as Error & { code: string }).code).toBe('STALE');
  });

  it('still returns r.data on success and throws the server’s message on a failed Result', async () => {
    fake.listBooks.mockResolvedValue({ ok: true, data: [{ id: 'b1' }] });
    expect(await live.books.listBooks()).toEqual([{ id: 'b1' }]);
    fake.listBooks.mockResolvedValue({ ok: false, error: 'Your account is paused.', code: 'NOT_ACTIVE' });
    await expect(live.books.listBooks()).rejects.toMatchObject({ message: 'Your account is paused.', code: 'NOT_ACTIVE' });
  });
});

describe('useQuery', () => {
  type State = { data: unknown; error: (Error & { code?: string }) | null; loading: boolean };

  it('keeps the last good data when a refetch fails, and exposes the error', async () => {
    fake.listBooks.mockResolvedValue({ ok: true, data: ['badge'] });
    react.mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(react.out.thrown).toBeUndefined();
    expect(react.out.value).toMatchObject({ data: ['badge'], error: null, loading: false });

    // A paused parent's background refetch fails: the screen keeps its data.
    fake.listBooks.mockResolvedValue({ ok: false, error: 'Your account is paused.', code: 'NOT_ACTIVE' });
    changed();
    await flush();
    expect(react.out.thrown).toBeUndefined();
    const s = react.out.value as State;
    expect(s.data).toEqual(['badge']);
    expect(s.error?.code).toBe('NOT_ACTIVE');

    // The next good answer clears the error.
    fake.listBooks.mockResolvedValue({ ok: true, data: ['badge', 'new'] });
    changed();
    await flush();
    expect(react.out.value).toMatchObject({ data: ['badge', 'new'], error: null });
  });

  it('keeps data when a refetch throws (network drop)', async () => {
    fake.listBooks.mockResolvedValue({ ok: true, data: [] });
    react.mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    changed();
    await flush();
    expect(react.out.thrown).toBeUndefined();
    expect(react.out.value).toMatchObject({ data: [], error: { message: NETWORK, code: 'NETWORK' } });
  });

  it('throws to the error boundary when there is no data yet', async () => {
    fake.listBooks.mockRejectedValue(new TypeError('Failed to fetch'));
    react.mount(() => useQuery(() => live.books.listBooks(), []));
    await flush();
    expect(react.out.thrown).toMatchObject({ message: NETWORK, code: 'NETWORK' });
  });
});

describe('content.uploadFile', () => {
  const reserved = { ok: true, data: { upload: { kind: 'local', url: 'http://localhost/api/files/upload', method: 'PUT', headers: {} }, file: { id: 'f1' } } };

  beforeEach(() => {
    fake.createUpload.mockResolvedValue(reserved);
    fake.finishUpload.mockResolvedValue({ ok: true, data: { id: 'f1' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  });

  it('passes the caller’s mimeType through when file.type is blank', async () => {
    const file = new File(['img'], 'sheet.heic', { type: '' });
    const r = await live.content.uploadFile({ file, filename: file.name, mimeType: 'image/jpeg', sizeBytes: file.size });
    expect(r).toEqual({ ok: true, data: { id: 'f1' } });
    expect(fake.createUpload).toHaveBeenCalledWith({ filename: 'sheet.heic', mimeType: 'image/jpeg', sizeBytes: 3 });
  });

  it('keeps the file’s own type when it has one', async () => {
    const file = new File(['%PDF'], 'sheet.pdf', { type: 'application/pdf' });
    await live.content.uploadFile({ file, mimeType: 'image/jpeg' });
    expect(fake.createUpload).toHaveBeenCalledWith({ filename: 'sheet.pdf', mimeType: 'application/pdf', sizeBytes: 4 });
  });

  it('returns NETWORK instead of rejecting when reserving the upload throws', async () => {
    fake.createUpload.mockRejectedValue(new TypeError('Failed to fetch'));
    const file = new File(['img'], 'sheet.jpg', { type: 'image/jpeg' });
    expect(await live.content.uploadFile({ file })).toEqual({ ok: false, error: NETWORK, code: 'NETWORK' });
  });
});

describe('C1: nothing names the deleted mock folder', () => {
  it('no file under src, and not this test, mentions it (the frozen copy is tests/contract/mock/)', () => {
    const deleted = ['src', 'mock'].join('/');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(p);
      }
      return out;
    };
    const files = [...walk(path.join(process.cwd(), 'src')), path.join(process.cwd(), 'tests/live-adapter.test.ts')];
    const naming = files.filter((f) => readFileSync(f, 'utf8').includes(deleted));
    expect(naming.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
