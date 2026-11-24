import { beforeAll, expect } from 'vitest';
import { db } from '@/lib/db';
import { loadDemo, truncateAll } from '../../prisma/data';

type Res<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Sign in as a demo user (null = signed out) for the following server calls. */
export function as(userId: string | null) {
  (globalThis as unknown as { __actor: { id: string | null } }).__actor.id = userId;
}

/** Unwraps a Result, failing the test with the server's message if it failed. */
export function ok<T>(r: Res<T>): T {
  if (!r.ok) throw new Error(`Expected ok, got ${r.code}: ${r.error}`);
  return r.data;
}

/** Asserts a Result failed with `code` (and optionally a message match). */
export function fails(r: Res<unknown>, code: string, message?: RegExp) {
  expect(r.ok, r.ok ? 'expected a failure' : '').toBe(false);
  if (!r.ok) {
    expect(r.code).toBe(code);
    if (message) expect(r.error).toMatch(message);
  }
}

/** Fresh demo data for this test file. */
export function freshDemo() {
  beforeAll(async () => {
    await truncateAll(db as never);
    await loadDemo(db as never);
  });
}

/** Deep search: every value under a key with this name (for leak checks). */
export function valuesOf(obj: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(obj)) obj.forEach((x) => valuesOf(x, key, out));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) out.push(v);
      valuesOf(v, key, out);
    }
  }
  return out;
}

/**
 * A demo session picked by what a test needs, not by id: the demo data is placed
 * relative to "now", so which sessions are upcoming changes with the day and hour.
 */
export async function upcomingSession(where: { parentId?: string; studentId?: string; mode?: 'VIDEO' | 'IN_PERSON'; minHoursAway?: number; not?: string[] } = {}) {
  return db.session.findFirstOrThrow({
    where: {
      status: 'CONFIRMED',
      startsAt: { gt: new Date(Date.now() + (where.minHoursAway ?? 1) * 3600000) },
      ...(where.mode && { mode: where.mode }),
      ...(where.studentId && { studentId: where.studentId }),
      ...(where.parentId && { student: { parentId: where.parentId } }),
      ...(where.not && { id: { notIn: where.not } }),
    },
    orderBy: { startsAt: 'asc' },
  });
}

/** The local-driver upload target (tests run without Vercel Blob). */
export function localTarget(upload: { kind: string } & Record<string, unknown>) {
  if (upload.kind !== 'local') throw new Error('Tests expect the local storage driver');
  return upload as unknown as { url: string; method: 'PUT'; headers: Record<string, string> };
}

export { db };
