/**
 * S21: after Vienne's "Reset password" the account must choose a new password, and until it does the
 * server refuses everything except families.changePassword (the only call the change-password screen
 * makes). Before S21 only AppRoot.jsx enforced it, in the browser.
 *
 * Every export of every src/server/*.ts is read from the folder (as p-sec.test.ts does), so a new
 * file or export is covered without editing this test.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as families from '@/server/families';
import * as messages from '@/server/messages';

freshDemo();

type R = { ok: boolean; code?: string; error?: string; data?: unknown };
type Fn = (input?: unknown) => Promise<R>;

const ROOT = process.cwd();
const SERVER = 'src/server';
const MODULES = readdirSync(path.join(ROOT, SERVER)).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)).sort();

/** What the change-password screen needs, so the account can get out of the state. */
const ALLOWED = new Set(['families.changePassword', 'requests.requestInvite' /* L2: public, no account (p-sec's PUBLIC) */]);

/** Exports that parse before their guard (the guard needs a parsed id): they get a valid input, as in p-sec.test.ts. */
const later = () => new Date(Date.now() + 3 * 86400000).toISOString();
const VALID_INPUT: Record<string, unknown> = {
  'assignments.listForStudent': { studentId: 's_mateo' },
  'books.setHasBook': { studentId: 's_mateo', hasBook: true },
  'books.listRedo': { studentId: 's_mateo' },
  'dashboard.getParentOverview': { studentId: 's_mateo' },
  'families.updateStudent': { studentId: 's_mateo', goals: 'x' },
  'fast.listResults': { studentId: 's_mateo' },
  'fast.saveResult': { studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2', scaleScore: 300, level: 3 },
  'reports.listForStudent': { studentId: 's_mateo' },
  'scheduling.requestSession': { studentId: 's_mateo', mode: 'VIDEO', startsAt: later(), durationMin: 45 },
};

async function endpoints() {
  const out: { name: string; fn: Fn }[] = [];
  for (const m of MODULES) {
    const mod = (await import(path.join(ROOT, SERVER, `${m}.ts`))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(mod)) out.push({ name: `${m}.${k}`, fn: v as Fn });
  }
  return out;
}

/** Every export that doesn't refuse with the "choose a new password" message. */
async function notRefused() {
  const wrong: string[] = [];
  for (const { name, fn } of await endpoints()) {
    if (ALLOWED.has(name)) continue;
    const r = await fn((VALID_INPUT[name] ?? {}) as never);
    if (r.ok || r.code !== 'MUST_CHANGE_PASSWORD' || !/choose a new password/i.test(r.error ?? '')) wrong.push(`${name} → ${r.ok ? 'ok' : `${r.code}: ${r.error}`}`);
  }
  return wrong;
}

/** Every export that refuses with MUST_CHANGE_PASSWORD. A wrong-typed input, so nothing that takes input changes data. */
async function refusedForPassword() {
  const wrong: string[] = [];
  for (const { name, fn } of await endpoints()) {
    const r = await fn(42 as never);
    if (!r.ok && r.code === 'MUST_CHANGE_PASSWORD') wrong.push(name);
  }
  return wrong;
}

/** Vienne resets the parent's password, as from the Families screen. */
async function reset(parentId: string) {
  as('u_admin');
  const { temporaryPassword } = ok(await families.resetParentPassword({ parentId }));
  expect((await db.user.findUniqueOrThrow({ where: { id: parentId } })).mustChangePassword).toBe(true);
  return temporaryPassword as string;
}

afterEach(async () => {
  await db.user.updateMany({ where: { id: { in: ['u_ana', 'u_daniel'] } }, data: { mustChangePassword: false, status: 'ACTIVE' } });
});

describe('a parent who must change their password', () => {
  it('is refused by every server function, with a plain message, except changePassword', async () => {
    const before = await db.session.count();
    await reset('u_ana');
    as('u_ana');
    const runtime = (await endpoints()).map((e) => e.name);
    expect(runtime.length).toBeGreaterThan(90);
    for (const name of [...ALLOWED, ...Object.keys(VALID_INPUT)]) expect(runtime, `${name} is listed here but isn't an export`).toContain(name);
    expect(await notRefused(), 'a new export needs requireUser (or a guard built on it); one that parses first needs a VALID_INPUT').toEqual([]);
    // Refused before anything happened: no session was requested, the account is unchanged.
    expect(await db.session.count()).toBe(before);
    expect(await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).toMatchObject({ mustChangePassword: true, status: 'ACTIVE' });
  });

  it('the message says what to do next', async () => {
    await reset('u_ana');
    as('u_ana');
    fails(await families.getFamily({ parentId: 'u_ana' }), 'MUST_CHANGE_PASSWORD', /^Please choose a new password first\. Enter the temporary password Vienne gave you, then pick your own\.$/);
  });

  it('a paused parent with the flag can’t message Vienne either (S9’s exception comes after it)', async () => {
    await reset('u_daniel');
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
    const before = await db.message.count();
    as('u_daniel');
    fails(await messages.getThread(), 'MUST_CHANGE_PASSWORD');
    fails(await messages.sendMessage({ body: 'Hello' }), 'MUST_CHANGE_PASSWORD');
    expect(await db.message.count()).toBe(before);
  });

  it('after the new password everything works again, with no new sign-in', async () => {
    const temporaryPassword = await reset('u_ana');
    as('u_ana');
    fails(await families.setTextSize({ textSize: 'LARGE' }), 'MUST_CHANGE_PASSWORD');
    ok(await families.changePassword({ currentPassword: temporaryPassword, newPassword: 'anas-own-password-1' }));
    // Same caller, same session: nothing refuses for the password any more.
    expect(await refusedForPassword()).toEqual([]);
    expect(ok(await families.getFamily({ parentId: 'u_ana' })).parent.id).toBe('u_ana');
    expect(ok(await families.setTextSize({ textSize: 'LARGE' })).textSize).toBe('LARGE');
    ok(await messages.getThread());
  });

  it('changePassword still needs the right temporary password (permission)', async () => {
    await reset('u_ana');
    as('u_ana');
    fails(await families.changePassword({ currentPassword: 'not-the-temporary-one', newPassword: 'anas-own-password-2' }), 'INVALID', /current password isn’t right/);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).mustChangePassword).toBe(true);
    fails(await families.getFamily({ parentId: 'u_ana' }), 'MUST_CHANGE_PASSWORD');
  });

  it('signed out, changePassword says to sign in', async () => {
    as(null);
    fails(await families.changePassword({ currentPassword: 'x', newPassword: 'anas-own-password-3' }), 'UNAUTHENTICATED');
  });
});

describe('everyone else', () => {
  it('Vienne and parents without the flag are never refused for it', async () => {
    for (const who of ['u_admin', 'u_ana', 'u_grace', 'u_tom']) {
      as(who);
      expect(await refusedForPassword(), who).toEqual([]);
    }
  });
});
