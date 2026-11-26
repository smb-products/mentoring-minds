/**
 * P-sec: the production security audit (plan/features.json → P-sec, plan/reports/P-sec.md).
 *
 *   1. Endpoints: every export of every src/server/*.ts is found by reading the folder, so a new file or
 *      export is covered without editing this test. Signed out, each says to sign in; a wrong-typed input
 *      gets INVALID, never a crash; and the input is parsed before anything is looked up.
 *   2. Leaks: every read a family can make is called here or in leaks.test.ts (checked from the source),
 *      and no family response carries a secret.
 *   3. Routes: every route under src/app/api checks the session or a secret itself (AGENTS rule 11).
 *   4. Limits: each limit is a named constant, and a test reaches it.
 *   5. Migrations: applied to an empty schema they match schema.prisma, and none drops data.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, localTarget, ok, valuesOf } from './helpers';
import { DEMO_PASSWORD } from '../../prisma/data';
import { AI_DAILY_LIMIT, EFFORT, MODEL } from '@/lib/ai/prompts';
import { MAX_BYTES } from '@/lib/storage';
import * as assignments from '@/server/assignments';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as dashboard from '@/server/dashboard';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as taxonomy from '@/server/taxonomy';
import * as ai from '@/server/ai';
import { GET as download } from '@/app/api/files/[id]/route';
import { POST as blobTokenRoute } from '@/app/api/files/blob/route';
import { PUT as localUploadRoute } from '@/app/api/files/upload/[id]/route';
import { GET as cron } from '@/app/api/cron/daily/route';

/** The Auth.js config lib/auth.ts builds, so the real password check can run (setup.ts mocks lib/auth). */
const authConfig = vi.hoisted(() => ({ current: null as null | { providers: { id: string; options?: { authorize?: (raw: unknown) => Promise<unknown> } }[] } }));
vi.mock('next-auth', () => ({
  // Only the config is needed: the real NextAuth() reaches for Next.js's request internals.
  default: (config: never) => {
    authConfig.current = config;
    return { handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined };
  },
  AuthError: class AuthError extends Error {},
}));

freshDemo();

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
type R = { ok: boolean; code?: string; error?: string; data?: unknown };
type Fn = (input?: unknown) => Promise<R>;

/* ── 1. Endpoints ───────────────────────────────────────── */

const SERVER = 'src/server';
const MODULES = readdirSync(path.join(ROOT, SERVER)).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3)).sort();

/** Exports anyone may call signed out, each with its reason. None today: sign-in and sign-up are Auth.js
 *  and src/app/(auth)/sign-in/actions.ts, not src/server. */
const PUBLIC: Record<string, string> = {};

/** Exports that take no input (nothing to parse). Each still has its guard; a wrong input is ignored. */
const NO_INPUT = new Set([
  'assignments.listAssignments',
  'assignments.gradingQueue',
  'books.listBooks',
  'dashboard.getAdminToday',
  'fast.nextWindow',
  'invites.listInvites',
  'messages.listThreads',
  'messages.unreadCount',
  'notifications.listForUser',
  'notifications.markAllRead',
  'notifications.runDailyReminders',
  'scheduling.getSettings',
  'scheduling.getAvailability',
  'scheduling.listTimeOff',
  'scheduling.listLocations',
]);

/** Exports that parse before their guard (the guard needs a parsed id). Signed out, they get a valid input. */
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

const WRONG_TYPED: unknown[] = [42, 'x', [], true];

async function endpoints() {
  const out: { name: string; fn: Fn }[] = [];
  for (const m of MODULES) {
    const mod = (await import(path.join(ROOT, SERVER, `${m}.ts`))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(mod)) {
      expect(typeof v, `${m}.${k}: a 'use server' file exports only async functions`).toBe('function');
      out.push({ name: `${m}.${k}`, fn: v as Fn });
    }
  }
  return out;
}

/** Each export's source: its wrapper (action/query), and its body up to the first parse(). */
function sourceExports() {
  const out: { name: string; wrapper: string; body: string }[] = [];
  for (const m of MODULES) {
    const src = read(`${SERVER}/${m}.ts`);
    const starts = [...src.matchAll(/^export const (\w+) = (action|query)\(/gm)];
    expect(src.match(/^export (?!const \w+ = (action|query)\(|type |interface )/gm) ?? [], `${m}.ts: every export is action() or query()`).toEqual([]);
    starts.forEach((s, i) => out.push({ name: `${m}.${s[1]}`, wrapper: s[2], body: src.slice(s.index!, starts[i + 1]?.index ?? src.length) }));
  }
  return out;
}

/** Every guard in src/lib/guards.ts, read from the file, so a new guard (S9's requireCanMessage) counts as one. */
const GUARDS = [...read('src/lib/guards.ts').matchAll(/^export async function (require\w+)\(/gm)].map((m) => m[1]);
const GUARD = new RegExp(`^(const \\w+ = )?await (${GUARDS.join('|')})\\(\\);$`);

describe('endpoints: every src/server export', () => {
  it('is found in the source and at runtime, wrapped in action() or query()', async () => {
    const runtime = (await endpoints()).map((e) => e.name).sort();
    expect(sourceExports().map((e) => e.name).sort()).toEqual(runtime);
    expect(runtime.length).toBeGreaterThan(90);
    for (const name of [...NO_INPUT, ...Object.keys(VALID_INPUT), ...Object.keys(PUBLIC)]) expect(runtime, `${name} is listed here but isn't an export`).toContain(name);
  });

  it('signed out, says to sign in (except the ones listed as public)', async () => {
    as(null);
    const wrong: string[] = [];
    for (const { name, fn } of await endpoints()) {
      if (name in PUBLIC) continue;
      const r = await fn((VALID_INPUT[name] ?? {}) as never);
      if (r.ok || r.code !== 'UNAUTHENTICATED') wrong.push(`${name} → ${r.ok ? 'ok' : r.code}`);
    }
    expect(wrong, 'a new export needs a guard (or a reason in PUBLIC); one that parses first needs a VALID_INPUT').toEqual([]);
  });

  it('a wrong-typed input gets INVALID, never a crash (Vienne and a parent)', async () => {
    const wrong: string[] = [];
    for (const who of ['u_admin', 'u_ana']) {
      as(who);
      for (const { name, fn } of await endpoints()) {
        for (const input of WRONG_TYPED) {
          const r = await fn(input as never);
          const label = `${who} ${name}(${JSON.stringify(input)}) → ${r.ok ? 'ok' : r.code}`;
          if (!r.ok && r.code === 'SERVER') wrong.push(label);
          else if (NO_INPUT.has(name)) continue; // nothing to parse: the input is ignored
          else if (who === 'u_admin' ? r.code !== 'INVALID' : !['INVALID', 'FORBIDDEN'].includes(r.code ?? '')) wrong.push(label);
        }
      }
    }
    expect(wrong, 'an export that takes input must parse() it; one that takes none goes in NO_INPUT').toEqual([]);
  });

  it('parses its input before any lookup: only a guard may come first', () => {
    const wrong: string[] = [];
    for (const { name, body } of sourceExports()) {
      const at = body.indexOf('parse(');
      if (NO_INPUT.has(name)) {
        if (at !== -1) wrong.push(`${name} parses input but is listed in NO_INPUT`);
        continue;
      }
      if (at === -1) {
        wrong.push(`${name} never calls parse()`);
        continue;
      }
      const start = body.indexOf('=> {');
      const before = body.slice(start + 4, at).split(/;\s*/).map((s) => s.trim()).filter(Boolean);
      // What's left of the statement that holds parse(, e.g. `const { id } =`.
      const head = before.pop() ?? '';
      if (/await|db\.|tx\./.test(head)) wrong.push(`${name}: ${head}`);
      for (const s of before) if (!GUARD.test(`${s};`)) wrong.push(`${name}: \`${s}\` runs before parse()`);
    }
    expect(wrong).toEqual([]);
  });
});

/* ── 2. Leaks ───────────────────────────────────────────── */

/** Keys no family response may carry (answer keys, hashes, Vienne's notes, lockout state, her room link). */
const SECRET_KEYS = ['answer', 'passwordHash', 'codeHash', 'adminNotes', 'failedLogins', 'lockedUntil', 'sessionVersion', 'redeemFailures', 'redeemLockedUntil'];

/** Every object (at any depth) that has `key` with a truthy value. */
function holders(obj: unknown, key: string, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(obj)) obj.forEach((x) => holders(x, key, out));
  else if (obj && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if (o[key]) out.push(o);
    Object.values(o).forEach((v) => holders(v, key, out));
  }
  return out;
}

/** Sessions whose video link a family may see right now: a confirmed call inside its join window. */
async function joinableNow() {
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const now = Date.now();
  const rows = await db.session.findMany({ where: { status: 'CONFIRMED', mode: 'VIDEO' } });
  return new Set(rows.filter((s) => now >= s.startsAt.getTime() - settings.joinOpensMin * 60000 && now <= s.endsAt.getTime()).map((s) => s.id));
}

/** Every read a family can call, as `parentId`, for each of `studentIds`. Failures are kept too: their message must be clean. */
async function familyReads(parentId: string, studentIds: string[]) {
  as(parentId);
  const from = new Date(Date.now() + 86400000).toISOString();
  const to = new Date(Date.now() + 8 * 86400000).toISOString();
  const report = await db.progressReport.findFirst({ where: { student: { parentId }, status: 'PUBLISHED' } });
  const file = await db.fileAsset.findFirst({ where: { OR: [{ uploadedById: parentId }, { resources: { some: { status: 'PUBLISHED' } } }] } });
  const out: Record<string, R> = {
    'families.getFamily': await families.getFamily({ parentId }),
    'books.listBooks': await books.listBooks(),
    'books.bookForGrade': await books.bookForGrade({ grade: 3 }),
    'content.listResourcesForStudent': await content.listResourcesForStudent(studentIds.length ? { studentId: studentIds[0] } : {}), // {}: a preview's teasers
    'content.getFileForUser': await content.getFileForUser({ fileId: file?.id ?? 'fa_fraction_strips' }),
    'fast.nextWindow': await fast.nextWindow(),
    'messages.getThread': await messages.getThread({}),
    'messages.unreadCount': await messages.unreadCount(),
    'notifications.listForUser': await notifications.listForUser(),
    'reports.getReport': await reports.getReport({ reportId: report?.id ?? 'rep_mateo_1' }),
    'scheduling.getSettings': await scheduling.getSettings(),
    'scheduling.getAvailability': await scheduling.getAvailability(),
    'scheduling.listLocations': await scheduling.listLocations(),
    'scheduling.getOpenSlots': await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', from, to }),
    'scheduling.listSessions': await scheduling.listSessions({}),
    'taxonomy.listSubjects': await taxonomy.listSubjects({}),
  };
  for (const studentId of studentIds) {
    out[`dashboard.getParentOverview:${studentId}`] = await dashboard.getParentOverview({ studentId });
    out[`assignments.listForStudent:${studentId}`] = await assignments.listForStudent({ studentId });
    out[`books.listRedo:${studentId}`] = await books.listRedo({ studentId });
    out[`fast.listResults:${studentId}`] = await fast.listResults({ studentId });
    out[`reports.listForStudent:${studentId}`] = await reports.listForStudent({ studentId });
    out[`content.listResourcesForStudent:${studentId}`] = await content.listResourcesForStudent({ studentId });
    out[`scheduling.listSessions:${studentId}`] = await scheduling.listSessions({ studentId });
  }
  return out;
}

async function expectClean(all: Record<string, R>) {
  for (const key of SECRET_KEYS) expect(valuesOf(all, key), key).toEqual([]);
  expect(valuesOf(all, 'defaultMeetingUrl').filter(Boolean), 'defaultMeetingUrl').toEqual([]);
  // Time off is shown to families as busy time only, never Vienne's reason.
  expect(valuesOf(all, 'reason').filter(Boolean), 'time-off reason').toEqual([]);
  const open = await joinableNow();
  for (const s of holders(all, 'meetingUrl')) expect(open.has(String(s.id)), `meetingUrl on ${String(s.id)} outside its join window`).toBe(true);
}

describe('leaks: what a family can read', () => {
  it('every family read is called here or in leaks.test.ts', () => {
    const tests = read('tests/integration/leaks.test.ts') + read('tests/integration/p-sec.test.ts');
    const missing = sourceExports()
      .filter((e) => e.wrapper === 'query' && /require(\w+)\(/.exec(e.body)?.[1] !== 'Admin')
      .map((e) => e.name)
      .filter((name) => !tests.includes(`${name}(`));
    expect(missing).toEqual([]);
  });

  it('an active parent: no secrets, and video links only inside the join window', async () => {
    const all = await familyReads('u_ana', ['s_mateo', 's_lucia']);
    for (const [name, r] of Object.entries(all)) expect(r.ok, `${name}: ${r.error}`).toBe(true);
    await expectClean(all);
    await expectClean(await familyReads('u_grace', ['s_noah'])); // the family with the live call
  });

  it('a preview parent (no code yet) and a paused one: locked reads, and still no secrets', async () => {
    await expectClean(await familyReads('u_tom', []));
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'PAUSED' }));
    try {
      const all = await familyReads('u_daniel', ['s_sofia']);
      await expectClean(all);
      expect(all['assignments.listForStudent:s_sofia'].code).toBe('NOT_ACTIVE');
    } finally {
      as('u_admin');
      ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'ACTIVE' }));
    }
  });

  it('a family’s own writes don’t echo secrets back either', async () => {
    as('u_ana');
    const sub = await db.submission.findFirstOrThrow({ where: { studentId: 's_mateo', status: { in: ['ASSIGNED', 'RETURNED'] }, assignment: { kind: 'BOOK' } } });
    const out = {
      updateStudent: await families.updateStudent({ studentId: 's_mateo', goals: 'Fractions with confidence' }),
      setTextSize: await families.setTextSize({ textSize: 'NORMAL' }),
      saveAnswerDraft: await assignments.saveAnswerDraft({ submissionId: sub.id, answers: [] }),
      sendMessage: await messages.sendMessage({ body: 'Thank you!' }),
      requestSession: await scheduling.requestSession({ studentId: 's_mateo', mode: 'IN_PERSON', startsAt: later(), durationMin: 45 }),
    };
    for (const key of SECRET_KEYS) expect(valuesOf(out, key), key).toEqual([]);
  });
});

/* ── 3. Routes under src/app/api ────────────────────────── */

function routeFiles(dir = 'src/app/api'): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(path.join(ROOT, p)).isDirectory() ? routeFiles(p) : /^route\.(ts|js)$/.test(f) ? [p] : [];
  });
}

/** Every route, and what it checks. A new route must be added here with its tests below. */
const ROUTES: Record<string, string> = {
  'src/app/api/auth/[...nextauth]/route.ts': 'public: Auth.js’s own sign-in, callback, CSRF and session endpoints (how a visitor signs in); they only ever return the caller’s own session',
  'src/app/api/cron/daily/route.ts': 'secret: Authorization: Bearer $CRON_SECRET, compared in constant time; refused when CRON_SECRET is unset',
  'src/app/api/files/[id]/route.ts': 'session: lib/files.canReadFile on every request',
  'src/app/api/files/blob/route.ts': 'session: lib/blob-upload.authorizeBlobUpload before a token is issued',
  'src/app/api/files/upload/[id]/route.ts': 'secret: a 10-minute HMAC token bound to the file id; local development only (404 in production)',
};

const PDF = new TextEncoder().encode('%PDF-1.7\n%%EOF\n');
const getFile = (id: string) => download(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) } as never);
const putLocal = (id: string, url: string, headers: Record<string, string>, body: Uint8Array) =>
  localUploadRoute(new Request(`http://localhost${url}`, { method: 'PUT', headers, body: body as BodyInit }), { params: Promise.resolve({ id }) } as never);

describe('routes: each checks its own access', () => {
  it('every route under src/app/api is listed with what it checks', () => {
    expect(routeFiles().sort()).toEqual(Object.keys(ROUTES).sort());
    expect(read('src/app/api/auth/[...nextauth]/route.ts')).toMatch(/^import \{ handlers \} from '@\/lib\/auth';\s+export const \{ GET, POST \} = handlers;\s*$/);
  });

  it('/api/files/<id>: signed out, another family, and a paused parent are refused', async () => {
    as(null);
    expect((await getFile('fa_lucia_work')).status).toBe(401);
    as('u_daniel');
    expect((await getFile('fa_lucia_work')).status).toBe(403); // Ana's child's work
    as('u_ana');
    expect((await getFile('fa_lucia_work')).status).toBe(200);
    expect((await getFile('fa_arjun_work')).status).toBe(403); // Priya's child's work
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_ana', status: 'PAUSED' }));
    as('u_ana');
    expect((await getFile('fa_lucia_work')).status).toBe(403);
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_ana', status: 'ACTIVE' }));
  });

  it('/api/files/blob: no upload token signed out or for another family’s reservation', async () => {
    const before = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_teststore123_abcdefghijklmnopqrstuvwxyz';
    try {
      as('u_ana');
      const r = ok(await content.createUpload({ filename: 'work.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
      const ask = () =>
        blobTokenRoute(
          new Request('http://localhost/api/files/blob', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: r.file.storageKey, clientPayload: r.file.id, multipart: false } }),
          }),
        );
      as(null);
      expect((await ask()).status).toBe(400);
      as('u_daniel');
      const other = await ask();
      expect(other.status).toBe(400);
      expect(JSON.stringify(await other.json())).not.toMatch(/clientToken/);
      as('u_ana');
      expect((await ask()).status).toBe(200);
    } finally {
      if (before === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = before;
    }
  });

  it('/api/files/upload/<id>: needs that file’s own token, and is off in production', async () => {
    as('u_ana');
    const mine = ok(await content.createUpload({ filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
    as('u_daniel');
    const theirs = ok(await content.createUpload({ filename: 'b.pdf', mimeType: 'application/pdf', sizeBytes: PDF.byteLength }));
    const t = localTarget(mine.upload);
    as(null);
    expect((await putLocal(theirs.file.id, `/api/files/upload/${theirs.file.id}`, t.headers, PDF)).status).toBe(403); // no token
    const token = new URL(`http://x${t.url}`).searchParams.get('t')!;
    expect((await putLocal(theirs.file.id, `/api/files/upload/${theirs.file.id}?t=${encodeURIComponent(token)}`, t.headers, PDF)).status).toBe(403); // Ana's token, Daniel's file
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect((await putLocal(mine.file.id, t.url, t.headers, PDF)).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await putLocal(mine.file.id, t.url, t.headers, PDF)).status).toBe(204);
  });

  it('/api/cron/daily: refused without the secret, with a wrong one, and when none is set', async () => {
    const before = process.env.CRON_SECRET;
    const call = (authorization?: string) => cron(new Request('http://localhost/api/cron/daily', authorization ? { headers: { authorization } } : {}));
    try {
      delete process.env.CRON_SECRET;
      for (const h of [undefined, 'Bearer ', 'Bearer undefined']) expect((await call(h)).status, String(h)).toBe(401);
      process.env.CRON_SECRET = 'p-sec-cron-secret';
      expect((await call()).status).toBe(401);
      expect((await call('Bearer p-sec-cron-secre')).status).toBe(401);
      expect((await call('p-sec-cron-secret')).status).toBe(401);
      expect((await call('Bearer p-sec-cron-secret')).status).toBe(200);
    } finally {
      if (before === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = before;
    }
  });
});

/* ── 4. Limits ──────────────────────────────────────────── */

/** A limit's value, read from its source (the constant isn't exported, or its file is 'use server'). */
function constant(file: string, name: string): number {
  const m = read(file).match(new RegExp(`^(?:export )?const ${name} = (\\d+);`, 'm'));
  if (!m) throw new Error(`${name} moved or changed shape in ${file}`);
  return Number(m[1]);
}

const MAX_FAILED_LOGINS = constant('src/lib/auth.ts', 'MAX_FAILED_LOGINS');
const LOCK_MINUTES = constant('src/lib/auth.ts', 'LOCK_MINUTES');
const MAX_FAILURES = constant('src/server/invites.ts', 'MAX_FAILURES');
const GLOBAL_REDEEM_FAILURES_PER_HOUR = constant('src/server/invites.ts', 'GLOBAL_REDEEM_FAILURES_PER_HOUR');

let guessers = 0;
const preview = () => db.user.create({ data: { email: `p-sec.${(guessers += 1)}@example.com`, name: `Preview ${guessers}`, status: 'PREVIEW' } });
const newCode = async () => {
  as('u_admin');
  return ok(await invites.createInvite({ parentName: `P-sec family ${guessers}`, plannedStudents: [{ firstName: 'Kid', grade: 3 }] })).code;
};
const wrongCode = (i: number) => `MM-Q${String(i).padStart(3, '0').replace(/[01]/g, 'Q')}`;

describe('limits: each named constant is reached', () => {
  beforeEach(async () => {
    await db.redeemFailure.deleteMany();
  });

  it(`MAX_FAILED_LOGINS (${MAX_FAILED_LOGINS}) wrong passwords lock password sign-in for LOCK_MINUTES`, async () => {
    await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
    const authorize = authConfig.current?.providers.find((p) => p.id === 'credentials')?.options?.authorize;
    expect(authorize, 'the Credentials provider in lib/auth.ts').toBeTypeOf('function');
    const email = 'p-sec.login@example.com';
    const user = await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } });
    await db.user.create({ data: { email, name: 'Login test', passwordHash: user.passwordHash, status: 'ACTIVE' } });
    const signIn = (password: string) => authorize!({ email, password });
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) expect(await signIn(`wrong-${i}`)).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { email } })).lockedUntil).toBeNull();
    expect(await signIn(DEMO_PASSWORD)).toMatchObject({ email }); // one short of the limit: still opens, and resets the count
    for (let i = 1; i <= MAX_FAILED_LOGINS; i++) expect(await signIn(`wrong-${i}`)).toBeNull();
    const locked = await db.user.findUniqueOrThrow({ where: { email } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + (LOCK_MINUTES - 1) * 60000);
    expect(await signIn(DEMO_PASSWORD)).toBeNull(); // the right password too, until the lock ends
  });

  it(`MAX_FAILURES (${MAX_FAILURES}) wrong invite codes lock code entry for that account`, async () => {
    const short = await preview();
    as(short.id);
    for (let i = 1; i < MAX_FAILURES; i++) fails(await invites.redeemInvite({ code: wrongCode(i) }), 'INVALID_CODE');
    const code = await newCode();
    as(short.id);
    ok(await invites.redeemInvite({ code })); // one short of the limit: a right code still works

    const over = await preview();
    as(over.id);
    for (let i = 1; i <= MAX_FAILURES; i++) {
      const r = await invites.redeemInvite({ code: wrongCode(i) });
      expect(['INVALID_CODE', 'LOCKED']).toContain(r.ok ? 'ok' : r.code);
    }
    const code2 = await newCode();
    as(over.id);
    fails(await invites.redeemInvite({ code: code2 }), 'LOCKED');
  });

  it(`more than GLOBAL_REDEEM_FAILURES_PER_HOUR (${GLOBAL_REDEEM_FAILURES_PER_HOUR}) wrong codes in an hour pause code entry for everyone`, async () => {
    const failures = async (count: number) => {
      const g = await preview();
      await db.redeemFailure.createMany({ data: Array.from({ length: count }, () => ({ userId: g.id, at: new Date(Date.now() - 60000) })) });
    };
    await failures(GLOBAL_REDEEM_FAILURES_PER_HOUR);
    const atLimit = await preview();
    const code = await newCode();
    as(atLimit.id);
    ok(await invites.redeemInvite({ code }));

    await failures(1);
    const overLimit = await preview();
    const code2 = await newCode();
    as(overLimit.id);
    fails(await invites.redeemInvite({ code: code2 }), 'LOCKED');
  });

  it(`AI_DAILY_LIMIT (${AI_DAILY_LIMIT}) drafts a day, counted before Claude is called`, async () => {
    await db.aiDraft.deleteMany();
    const session = await db.session.findFirstOrThrow({ where: { status: 'COMPLETED' } });
    const fill = (n: number) =>
      db.aiDraft.createMany({ data: Array.from({ length: n }, () => ({ kind: 'SESSION_NOTE' as const, model: MODEL, effort: EFFORT, refId: 'p_sec_cap', input: {}, output: {} })) });
    as('u_admin');
    const draft = () => ai.draftSessionNote({ sessionId: session.id, transcript: 'We practiced fractions on a number line today.' });
    await fill(AI_DAILY_LIMIT - 1);
    const under = await draft();
    expect(under.ok ? 'ok' : under.code).not.toBe('LIMIT'); // one under: it goes on (and stops at the missing key in tests)
    await fill(1);
    fails(await draft(), 'LIMIT');
  });

  it(`MAX_BYTES (${MAX_BYTES / 1024 / 1024} MB) is the largest upload`, async () => {
    as('u_ana');
    ok(await content.createUpload({ filename: 'big.pdf', mimeType: 'application/pdf', sizeBytes: MAX_BYTES }));
    fails(await content.createUpload({ filename: 'too-big.pdf', mimeType: 'application/pdf', sizeBytes: MAX_BYTES + 1 }), 'INVALID', new RegExp(`${MAX_BYTES / 1024 / 1024} MB`));
  });

  it('what has no limit in the app is listed in docs/DEPLOY.md with what covers it', () => {
    const deploy = read('docs/DEPLOY.md');
    const limits = deploy.slice(deploy.indexOf('## Limits'), deploy.indexOf('\n## ', deploy.indexOf('## Limits') + 1));
    for (const name of ['MAX_FAILED_LOGINS', 'MAX_FAILURES', 'GLOBAL_REDEEM_FAILURES_PER_HOUR', 'AI_DAILY_LIMIT', 'MAX_BYTES']) expect(limits, name).toContain(`\`${name}\``);
    for (const open of ['Sign-up', 'Sign-in by IP']) expect(limits, open).toMatch(new RegExp(`\\*\\*${open}[^\\n]*(Vercel Firewall|Hardening later)`));
  });
});

/* ── 5. Migrations ──────────────────────────────────────── */

const MIGRATIONS = 'prisma/migrations';
const migrations = () =>
  readdirSync(path.join(ROOT, MIGRATIONS))
    .filter((d) => statSync(path.join(ROOT, MIGRATIONS, d)).isDirectory())
    .sort();

/** Migrations allowed to drop something, each with why no data is lost. None so far. */
const DROPS_ALLOWED: Record<string, string> = {};

describe('migrations', () => {
  // A throwaway database next to the test one (its name still contains "test"). Prisma compares a datamodel
  // with the `public` schema, so a separate schema in the test database would always look like drift.
  const base = new URL(process.env.DATABASE_URL!);
  const empty = `${base.pathname.slice(1)}_p_sec_empty`;
  const target = new URL(base);
  target.pathname = `/${empty}`;
  const admin = async (sql: string) => {
    const client = new pg.Client({ connectionString: base.toString() });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  };
  afterAll(() => admin(`DROP DATABASE IF EXISTS "${empty}"`));

  it('no migration drops a table or column', () => {
    const drops = migrations().filter((m) => !(m in DROPS_ALLOWED) && /\bDROP\s+(TABLE|COLUMN)\b|\bALTER\s+TABLE\b[^;]*\bDROP\b/i.test(read(`${MIGRATIONS}/${m}/migration.sql`)));
    expect(drops).toEqual([]);
  });

  it('applied to an empty database, they match prisma/schema.prisma (no drift)', async () => {
    await admin(`DROP DATABASE IF EXISTS "${empty}"`);
    await admin(`CREATE DATABASE "${empty}"`);
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect();
    try {
      for (const m of migrations()) await client.query(read(`${MIGRATIONS}/${m}/migration.sql`));
    } finally {
      await client.end();
    }
    const diff = (exitCode: boolean) =>
      execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-url', target.toString(), '--to-schema-datamodel', 'prisma/schema.prisma', ...(exitCode ? ['--exit-code'] : ['--script'])], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    try {
      diff(true);
    } catch {
      expect.fail(`schema.prisma differs from prisma/migrations; the missing migration would be:\n${diff(false)}`);
    }
  }, 60000);
});
