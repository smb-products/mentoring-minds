/**
 * S36 (plan/specs/S36.md): open sign-up, the server side. New parents are ACTIVE, add their children
 * themselves (families.addMyChildren), and Vienne hears once per family (FAMILY_JOINED). Sign-ups,
 * waiting session requests and messages each have a limit. Real server actions against Postgres;
 * the IP is mocked (lib/client-ip reads the request's headers, it isn't a guard) and web-push is a fake,
 * so the test reads the exact payload Vienne's phone gets.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import { MAX_UPLOADS_PER_DAY } from '@/lib/storage';
import { cleanUp } from '@/lib/jobs';
import { createAccount } from '@/app/(auth)/sign-in/actions';
import * as content from '@/server/content';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as requests from '@/server/requests';
import * as scheduling from '@/server/scheduling';

const ip = vi.hoisted(() => ({ current: null as string | null }));
vi.mock('@/lib/client-ip', () => ({ clientIp: async () => ip.current }));

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

/** The Auth.js config lib/auth.ts builds, so Google's account creation (the adapter) can run (setup.ts mocks lib/auth). */
const authConfig = vi.hoisted(() => ({ current: null as null | { adapter: { createUser: (u: Record<string, unknown>) => Promise<{ id: string }> } } }));
vi.mock('next-auth', () => ({
  default: (config: never) => {
    authConfig.current = config;
    return { handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined };
  },
  AuthError: class AuthError extends Error {},
}));

freshDemo();

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
/** A limit's value, read from its source (a 'use server' file exports only functions). */
const constant = (file: string, name: string) => {
  const m = read(file).match(new RegExp(`^(?:export )?const ${name} = (\\d+);`, 'm'));
  if (!m) throw new Error(`${name} moved or changed shape in ${file}`);
  return Number(m[1]);
};
const ACTIONS = 'src/app/(auth)/sign-in/actions.ts';
const SIGNUPS_PER_IP_PER_HOUR = constant(ACTIONS, 'SIGNUPS_PER_IP_PER_HOUR');
const SIGNUPS_PER_HOUR = constant(ACTIONS, 'SIGNUPS_PER_HOUR');
const MAX_CHILDREN_AT_SIGNUP = constant('src/server/families.ts', 'MAX_CHILDREN_AT_SIGNUP');
const OPEN_REQUESTS_PER_FAMILY = constant('src/server/scheduling.ts', 'OPEN_REQUESTS_PER_FAMILY');
const MESSAGES_PER_DAY = constant('src/server/messages.ts', 'MESSAGES_PER_DAY');

const DAY = 86400000;
const VIENNE = 'https://fcm.googleapis.com/fcm/send/s36-vienne';
const TOO_MANY = 'Too many new accounts from here. Try again in an hour, or sign in if you already have one.';
const ALREADY = /^Your children are already on your account\. Message Vienne to add another\.$/;

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
let n = 0;
const signUp = (email = `s36.signup.${(n += 1)}@example.com`) => createAccount(undefined, form({ name: 'New Parent', email, password: 'a-good-password' }));

/** A parent who signed up without a code: ACTIVE (the column default), no children. */
const newParent = (name = `S36 Parent ${(n += 1)}`) => db.user.create({ data: { email: `s36.parent.${(n += 1)}@example.com`, name, role: 'PARENT' } });

const adminIds = async () => (await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((a) => a.id);

/** The pushes Vienne's phone got since the last reset, once `count` have arrived. */
async function pushes(count: number) {
  await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(count));
  return sendNotification.mock.calls.map(([sub, body]) => {
    expect(sub.endpoint).toBe(VIENNE);
    return JSON.parse(body) as { title: string; body?: string };
  });
}

beforeAll(async () => {
  as('u_admin');
  ok(await notifications.savePushSubscription({ endpoint: VIENNE, keys: { p256dh: 'p', auth: 'a' } }));
});

beforeEach(async () => {
  sendNotification.mockClear();
  await db.signupAttempt.deleteMany();
  ip.current = null;
});

/* ── §1. New accounts are ACTIVE ─────────────────────────── */

describe('S36 §1: new accounts are ACTIVE', () => {
  it('email sign-up (createAccount) makes an ACTIVE parent', async () => {
    const email = 's36.email@example.com';
    expect(await signUp(email)).toBeUndefined();
    expect(await db.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ role: 'PARENT', status: 'ACTIVE', name: 'New Parent' });
  });

  it('Google sign-up (the adapter, the column default) makes an ACTIVE parent, and isn’t counted', async () => {
    await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
    const createUser = authConfig.current?.adapter.createUser;
    expect(createUser, 'the adapter in lib/auth.ts').toBeTypeOf('function');
    const made = await createUser!({ id: 'ignored', email: 's36.google@example.com', name: 'Google Parent', emailVerified: new Date(), image: null });
    expect(await db.user.findUniqueOrThrow({ where: { id: made.id } })).toMatchObject({ role: 'PARENT', status: 'ACTIVE' });
    expect(await db.signupAttempt.count()).toBe(0);
  });

  it('UserStatus keeps PREVIEW, and the one migration only adds the default and SignupAttempt', () => {
    expect(read('prisma/schema.prisma')).toMatch(/enum UserStatus \{\s*PREVIEW[^\n]*\n\s*ACTIVE\s*\n\s*PAUSED\s*\}/);
    expect(read('prisma/schema.prisma')).toMatch(/status\s+UserStatus @default\(ACTIVE\)/);
    const dirs = readdirSync(path.join(ROOT, 'prisma/migrations')).filter((d) => d.endsWith('_open_signup'));
    expect(dirs).toHaveLength(1);
    const statements = read(`prisma/migrations/${dirs[0]}/migration.sql`)
      .split(';')
      .map((s) => s.replace(/--[^\n]*\n/g, '').trim())
      .filter(Boolean);
    expect(statements.map((s) => s.split('(')[0].replace(/\s+/g, ' ').trim())).toEqual([
      `ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`,
      'CREATE TABLE "SignupAttempt"',
      'CREATE INDEX "SignupAttempt_ipHash_createdAt_idx" ON "SignupAttempt"',
      'CREATE INDEX "SignupAttempt_createdAt_idx" ON "SignupAttempt"',
    ]);
  });

  it('guards don’t change: a PREVIEW parent (an old row) is still refused with the same message', async () => {
    const old = await db.user.create({ data: { email: 's36.old@example.com', name: 'Old Preview', role: 'PARENT', status: 'PREVIEW' } });
    as(old.id);
    fails(await scheduling.cancelSession({ sessionId: 'sess_none' }), 'NOT_ACTIVE', /^Enter your invite code to unlock this\.$/);
    fails(await messages.getThread({}), 'NOT_ACTIVE', /^Enter your invite code to unlock this\.$/);
    expect(await db.conversation.count({ where: { parentId: old.id } })).toBe(0);
  });
});

/* ── §2. addMyChildren ───────────────────────────────────── */

describe('S36 §2: addMyChildren', () => {
  it('each child becomes a student on the parent (math, the school year), returned as the parent screens’ DTO; one FAMILY_JOINED per admin', async () => {
    const parent = await newParent('Marisol Quintero');
    as(parent.id);
    const { students } = ok(await families.addMyChildren({ children: [{ firstName: '  Tomasz ', grade: 0 }, { firstName: 'Elowen', grade: 6 }] }));
    expect(students.map((s) => [s.firstName, s.lastName, s.grade, s.parentId])).toEqual([
      ['Tomasz', '', 0, parent.id],
      ['Elowen', '', 6, parent.id],
    ]);
    const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    const { schoolYearOf } = await import('@/lib/settings');
    for (const s of students) {
      expect(s.subjects.map((x) => x?.id)).toEqual(['sub_math']);
      expect(s.schoolYear).toBe(schoolYearOf(new Date(), settings.timezone));
      expect(s).not.toHaveProperty('adminNotes');
    }
    expect(await db.student.count({ where: { parentId: parent.id } })).toBe(2);
    expect(await db.conversation.count({ where: { parentId: parent.id } })).toBe(1);

    const admins = await adminIds();
    const alerts = await db.notification.findMany({ where: { type: 'FAMILY_JOINED', parentId: parent.id } });
    expect(alerts.map((a) => a.userId).sort()).toEqual([...admins].sort());
    for (const a of alerts) {
      expect(a).toMatchObject({ audience: 'ADMIN', title: 'New family joined: Marisol Quintero', body: '2 children added. They signed up without an invite code.', href: '/admin/families', studentId: null });
      expect(`${a.title} ${a.body}`).not.toMatch(/Tomasz|Elowen/);
    }
    const [push] = await pushes(1);
    expect(push).toMatchObject({ title: 'New family joined: Marisol Quintero', body: '2 children added. They signed up without an invite code.' });
    expect(JSON.stringify(push)).not.toMatch(/Tomasz|Elowen/);
  });

  it('one child: "1 child added."; a PREVIEW parent becomes ACTIVE', async () => {
    const old = await db.user.create({ data: { email: 's36.preview@example.com', name: 'Ruth Preview', role: 'PARENT', status: 'PREVIEW' } });
    as(old.id);
    ok(await families.addMyChildren({ children: [{ firstName: 'Adaeze', grade: 3 }] }));
    expect((await db.user.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('ACTIVE');
    const alert = await db.notification.findFirstOrThrow({ where: { type: 'FAMILY_JOINED', parentId: old.id } });
    expect(alert.body).toBe('1 child added. They signed up without an invite code.');
  });

  it('a second call, or a parent who already has children (by code), is CONFLICT and adds nothing', async () => {
    const parent = await newParent();
    as(parent.id);
    ok(await families.addMyChildren({ children: [{ firstName: 'Kip', grade: 2 }] }));
    const alerts = await db.notification.count({ where: { type: 'FAMILY_JOINED' } });
    fails(await families.addMyChildren({ children: [{ firstName: 'Second', grade: 2 }] }), 'CONFLICT', ALREADY);
    expect(await db.student.count({ where: { parentId: parent.id } })).toBe(1);

    as('u_ana'); // her children came from Vienne
    const ana = await db.student.count({ where: { parentId: 'u_ana' } });
    fails(await families.addMyChildren({ children: [{ firstName: 'Another', grade: 1 }] }), 'CONFLICT', ALREADY);
    expect(await db.student.count({ where: { parentId: 'u_ana' } })).toBe(ana);
    expect(await db.notification.count({ where: { type: 'FAMILY_JOINED' } })).toBe(alerts);
  });

  it('two calls at once add one set (the parent’s row is locked)', async () => {
    const parent = await newParent();
    as(parent.id);
    const both = await Promise.all([
      families.addMyChildren({ children: [{ firstName: 'Twin', grade: 1 }, { firstName: 'Other', grade: 2 }] }),
      families.addMyChildren({ children: [{ firstName: 'Twin', grade: 1 }, { firstName: 'Other', grade: 2 }] }),
    ]);
    expect(both.map((r) => (r.ok ? 'ok' : r.code)).sort()).toEqual(['CONFLICT', 'ok']);
    expect(await db.student.count({ where: { parentId: parent.id } })).toBe(2);
    expect(await db.notification.count({ where: { type: 'FAMILY_JOINED', parentId: parent.id } })).toBe((await adminIds()).length);
  });
});

/* ── §2. Wrong input and who may call it ─────────────────── */

describe('S36 §2: wrong input and refusals store nothing', () => {
  const kid = (over: Record<string, unknown> = {}) => ({ firstName: 'Zebulonx', grade: 3, ...over });
  const WRONG: [string, unknown][] = [
    ['no children', { children: [] }],
    ['no list', {}],
    [`${MAX_CHILDREN_AT_SIGNUP + 1} children`, { children: Array.from({ length: MAX_CHILDREN_AT_SIGNUP + 1 }, () => kid()) }],
    ['an empty name', { children: [kid({ firstName: '   ' })] }],
    ['a 41-character name', { children: [kid({ firstName: 'Q'.repeat(41) })] }],
    ['a control character', { children: [kid({ firstName: 'Zebulonx\u0007' })] }],
    ['a line break', { children: [kid({ firstName: 'Zebulonx\nQuill' })] }],
    ['grade −1', { children: [kid({ grade: -1 })] }],
    ['grade 7', { children: [kid({ grade: 7 })] }],
    ['grade 2.5', { children: [kid({ grade: 2.5 })] }],
    ['a grade as text', { children: [kid({ grade: '3' })] }],
  ];

  it('is INVALID with a plain message that never echoes the input', async () => {
    const parent = await newParent();
    as(parent.id);
    expect(MAX_CHILDREN_AT_SIGNUP).toBe(6);
    for (const [label, input] of WRONG) {
      const r = await families.addMyChildren(input as never);
      fails(r, 'INVALID');
      if (!r.ok) {
        expect(r.error, label).not.toMatch(/Zebulonx|QQQQ|Quill|expected|received|undefined/i);
        expect(r.error, label).toMatch(/child|grade/i);
      }
    }
    expect(await db.student.count({ where: { parentId: parent.id } })).toBe(0);
    expect(await db.notification.count({ where: { type: 'FAMILY_JOINED', parentId: parent.id } })).toBe(0);
    // Six is allowed.
    ok(await families.addMyChildren({ children: Array.from({ length: MAX_CHILDREN_AT_SIGNUP }, (_, i) => kid({ firstName: `Kid${i}`, grade: i })) }));
  });

  it('a PAUSED parent is FORBIDDEN, signed out is UNAUTHENTICATED, Vienne is refused; nothing stored', async () => {
    const before = { students: await db.student.count(), alerts: await db.notification.count({ where: { type: 'FAMILY_JOINED' } }) };
    const paused = await db.user.create({ data: { email: 's36.paused@example.com', name: 'Paused Parent', role: 'PARENT', status: 'PAUSED' } });
    as(paused.id);
    fails(await families.addMyChildren({ children: [kid()] }), 'FORBIDDEN', /^Your account is paused\. Message Vienne to turn it back on\.$/);
    as(null);
    fails(await families.addMyChildren({ children: [kid()] }), 'UNAUTHENTICATED');
    as('u_admin');
    fails(await families.addMyChildren({ children: [kid()] }), 'FORBIDDEN');
    expect(await db.student.count()).toBe(before.students);
    expect(await db.notification.count({ where: { type: 'FAMILY_JOINED' } })).toBe(before.alerts);
  });
});

/* ── §4/§5. With a code nothing changes; booking; the landing form ── */

const range = (days: number) => ({ from: new Date().toISOString(), to: new Date(Date.now() + days * DAY).toISOString() });

describe('S36 §4: the code path and booking don’t change', () => {
  it('redeemInvite still makes Vienne’s planned children and sends INVITE_REDEEMED', async () => {
    as('u_admin');
    const { code } = ok(await invites.createInvite({ parentName: 'Coded Family', plannedStudents: [{ firstName: 'Planned', grade: 4 }] }));
    const parent = await newParent('Coded Parent');
    as(parent.id);
    ok(await invites.redeemInvite({ code }));
    expect((await db.student.findMany({ where: { parentId: parent.id } })).map((s) => s.firstName)).toEqual(['Planned']);
    expect(await db.notification.count({ where: { type: 'INVITE_REDEEMED', parentId: parent.id } })).toBeGreaterThan(0);
    expect(await db.notification.count({ where: { type: 'FAMILY_JOINED', parentId: parent.id } })).toBe(0);
  });

  it('a new family’s booking is a REQUESTED session that Vienne confirms', async () => {
    const parent = await newParent();
    as(parent.id);
    const [child] = ok(await families.addMyChildren({ children: [{ firstName: 'Booker', grade: 4 }] })).students;
    const [slot] = ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range(21) }));
    const s = ok(await scheduling.requestSession({ studentId: child.id, mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 }));
    expect(s.status).toBe('REQUESTED');
    as('u_admin');
    expect(ok(await scheduling.confirmSession({ sessionId: s.id })).status).toBe('CONFIRMED');
  });

  it('requestInvite’s alert is titled "Question from <name>"; its type and body don’t change', async () => {
    as(null);
    ip.current = '198.51.100.36';
    ok(await requests.requestInvite({ parentName: 'Quentin Asker', email: 's36.asker@example.com', grade: 2, message: 'Do you teach 5th?' }));
    const alert = await db.notification.findFirstOrThrow({ where: { title: { contains: 'Quentin Asker' } } });
    expect(alert).toMatchObject({ type: 'INVITE_REQUEST', title: 'Question from Quentin Asker', body: 'Grade 2 · s36.asker@example.com\nDo you teach 5th?' });
  });
});

/* ── §3. Limits ──────────────────────────────────────────── */

describe('S36 §3: sign-up limits', () => {
  it(`SIGNUPS_PER_IP_PER_HOUR (${SIGNUPS_PER_IP_PER_HOUR}): the next from that IP is refused, another IP still gets through`, async () => {
    expect(SIGNUPS_PER_IP_PER_HOUR).toBe(5);
    ip.current = '203.0.113.7';
    for (let i = 1; i < SIGNUPS_PER_IP_PER_HOUR; i++) expect(await signUp()).toBeUndefined();
    // A taken email counts too.
    expect(await signUp((await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).email)).toEqual({
      error: 'There’s already an account with that email. Sign in instead.',
    });
    const email = 's36.over.ip@example.com';
    expect(await signUp(email)).toEqual({ error: TOO_MANY });
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
    expect(await db.signupAttempt.count()).toBe(SIGNUPS_PER_IP_PER_HOUR);

    ip.current = '203.0.113.8';
    expect(await signUp('s36.other.ip@example.com')).toBeUndefined();
    // An attempt over an hour old doesn't count.
    await db.signupAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 61 * 60000) } });
    ip.current = '203.0.113.7';
    expect(await signUp()).toBeUndefined();
  });

  it('stores only the hashed IP, under pg_advisory_xact_lock(7_300_530_003)', async () => {
    ip.current = '192.0.2.44';
    expect(await signUp()).toBeUndefined();
    const [row] = await db.signupAttempt.findMany();
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'id', 'ipHash']);
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.ipHash).not.toContain('192.0.2.44');
    const src = read(ACTIONS);
    expect(src).toMatch(/const SIGNUPS_LOCK = 7_300_530_003;/);
    expect(src).toMatch(/pg_advisory_xact_lock\(\$\{SIGNUPS_LOCK\}\)/);
  });

  it(`past SIGNUPS_PER_HOUR (${SIGNUPS_PER_HOUR}) everyone is refused, and Vienne gets one alert an hour`, async () => {
    expect(SIGNUPS_PER_HOUR).toBe(30);
    await db.notification.deleteMany({ where: { type: 'SIGNUPS_PAUSED' } });
    await db.signupAttempt.createMany({ data: Array.from({ length: SIGNUPS_PER_HOUR - 1 }, (_, i) => ({ ipHash: `s36-${i}`, createdAt: new Date(Date.now() - 60000) })) });
    ip.current = '198.51.100.1';
    expect(await signUp()).toBeUndefined();
    for (const addr of ['198.51.100.2', '198.51.100.3']) {
      ip.current = addr;
      const email = `s36.paused.${addr}@example.com`;
      expect(await signUp(email)).toEqual({ error: TOO_MANY });
      expect(await db.user.findUnique({ where: { email } })).toBeNull();
    }
    const alerts = await db.notification.findMany({ where: { type: 'SIGNUPS_PAUSED' } });
    expect(alerts.map((a) => a.userId).sort()).toEqual((await adminIds()).sort());
    expect(alerts[0]).toMatchObject({ title: 'New sign-ups are paused for an hour', audience: 'ADMIN' });
    await pushes(alerts.length);
  });

  it('the daily job deletes attempts older than a day, and nothing else', async () => {
    await db.signupAttempt.createMany({ data: [{ ipHash: 'old', createdAt: new Date(Date.now() - DAY - 60000) }, { ipHash: 'new', createdAt: new Date(Date.now() - DAY + 60000) }] });
    const users = await db.user.count();
    await cleanUp();
    expect((await db.signupAttempt.findMany()).map((r) => r.ipHash)).toEqual(['new']);
    expect(await db.user.count()).toBe(users);
    expect(read('src/lib/jobs.ts').match(/signupAttempt\.\w+/g)).toEqual(['signupAttempt.deleteMany']);
  });
});

describe('S36 §3: waiting session requests', () => {
  async function family() {
    const parent = await newParent();
    as(parent.id);
    const [child] = ok(await families.addMyChildren({ children: [{ firstName: 'Req', grade: 3 }] })).students;
    return { parent, child };
  }
  /** Sessions straight in the table, 60+ days out so they never take an open slot the test books. */
  const sessions = (parentId: string, studentId: string, count: number, over: Record<string, unknown> = {}) =>
    db.session.createMany({
      data: Array.from({ length: count }, (_, i) => {
        const startsAt = new Date(Date.now() + (60 + i) * DAY);
        return { studentId, subjectId: 'sub_math', mode: 'VIDEO' as const, requestedById: parentId, startsAt, endsAt: new Date(startsAt.getTime() + 45 * 60000), durationMin: 45, status: 'REQUESTED' as const, ...over };
      }),
    });
  const slots = async () => ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range(21) }));

  it(`OPEN_REQUESTS_PER_FAMILY (${OPEN_REQUESTS_PER_FAMILY}): another request is LIMIT; confirmed or past ones don't count`, async () => {
    expect(OPEN_REQUESTS_PER_FAMILY).toBe(5);
    const { parent, child } = await family();
    await sessions(parent.id, child.id, 2, { status: 'CONFIRMED' });
    await sessions(parent.id, child.id, 3, { startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - 3 * DAY + 45 * 60000) });
    await sessions(parent.id, child.id, OPEN_REQUESTS_PER_FAMILY - 1);
    as(parent.id);
    const [a, b] = await slots();
    ok(await scheduling.requestSession({ studentId: child.id, mode: 'VIDEO', startsAt: a.startsAt, durationMin: 45 }));
    const before = await db.session.count({ where: { studentId: child.id } });
    fails(await scheduling.requestSession({ studentId: child.id, mode: 'VIDEO', startsAt: b.startsAt, durationMin: 45 }), 'LIMIT', /^You have 5 requests waiting for Vienne\. Wait for her answer, or message her\.$/);
    expect(await db.session.count({ where: { studentId: child.id } })).toBe(before);
  });

  it('two requests at once on the last slot store one', async () => {
    const { parent, child } = await family();
    await sessions(parent.id, child.id, OPEN_REQUESTS_PER_FAMILY - 1);
    as(parent.id);
    const open = await slots();
    const far = open.find((s) => new Date(s.startsAt).getTime() - new Date(open[0].startsAt).getTime() > DAY)!;
    const both = await Promise.all([open[0], far].map((s) => scheduling.requestSession({ studentId: child.id, mode: 'VIDEO', startsAt: s.startsAt, durationMin: 45 })));
    expect(both.map((r) => (r.ok ? 'ok' : r.code)).sort()).toEqual(['LIMIT', 'ok']);
    expect(await db.session.count({ where: { studentId: child.id, status: 'REQUESTED' } })).toBe(OPEN_REQUESTS_PER_FAMILY);
  });
});

describe('S36 §3: messages per day', () => {
  const past = (senderId: string, conversationId: string, count: number, ago = 60000) =>
    db.message.createMany({ data: Array.from({ length: count }, (_, i) => ({ conversationId, senderId, body: `earlier ${i}`, createdAt: new Date(Date.now() - ago) })) });

  /** A new family with a child, so it has its thread. */
  const family = async () => {
    const parent = await newParent();
    as(parent.id);
    ok(await families.addMyChildren({ children: [{ firstName: 'Writer', grade: 2 }] }));
    return { parent, thread: await db.conversation.findUniqueOrThrow({ where: { parentId: parent.id } }) };
  };

  it(`MESSAGES_PER_DAY (${MESSAGES_PER_DAY}): a parent's next message is LIMIT; older ones don't count; Vienne is never limited`, async () => {
    expect(MESSAGES_PER_DAY).toBe(50);
    const { parent, thread } = await family();
    await past(parent.id, thread.id, 10, DAY + 60000);
    await past(parent.id, thread.id, MESSAGES_PER_DAY - 1);
    ok(await messages.sendMessage({ body: 'The last one today' }));
    fails(await messages.sendMessage({ body: 'One more' }), 'LIMIT', /^That’s a lot of messages today\. Vienne will read them; try again tomorrow\.$/);
    expect(await db.message.count({ where: { body: 'One more' } })).toBe(0);

    as('u_admin');
    await past('u_admin', thread.id, MESSAGES_PER_DAY + 5);
    ok(await messages.sendMessage({ conversationId: thread.id, body: 'Vienne writes back' }));
  });

  it('two messages at once on the last slot store one', async () => {
    const { parent, thread } = await family();
    await past(parent.id, thread.id, MESSAGES_PER_DAY - 1);
    const both = await Promise.all([messages.sendMessage({ body: 'tap one' }), messages.sendMessage({ body: 'tap two' })]);
    expect(both.map((r) => (r.ok ? 'ok' : r.code)).sort()).toEqual(['LIMIT', 'ok']);
    expect(await db.message.count({ where: { senderId: parent.id } })).toBe(MESSAGES_PER_DAY);
  });
});

describe('S36: uploads per parent per day (Javaris, 2026-11-27)', () => {
  const reserve = () => content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: 100 });
  const fill = (uploadedById: string, count: number) =>
    db.fileAsset.createMany({ data: Array.from({ length: count }, (_, i) => ({ storageKey: `files/s36-${uploadedById}-${i}-${Date.now()}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 100, uploadedById })) });

  it('is 40: a parent’s 41st file in 24 hours gets the plain message and reserves nothing; Vienne stays uncounted', async () => {
    expect(MAX_UPLOADS_PER_DAY).toBe(40);
    const parent = await newParent();
    await fill(parent.id, MAX_UPLOADS_PER_DAY);
    as(parent.id);
    fails(await reserve(), 'LIMIT', /^That’s the most files for today/);
    expect(await db.fileAsset.count({ where: { uploadedById: parent.id } })).toBe(MAX_UPLOADS_PER_DAY);
    await fill('u_admin', MAX_UPLOADS_PER_DAY);
    as('u_admin');
    ok(await reserve());
  });
});

/* ── §6. Reads before a child exists ─────────────────────── */

describe('S36: an ACTIVE parent with no children', () => {
  it('gets an ok, empty answer from Home’s family read, notifications and messages', async () => {
    const parent = await newParent();
    as(parent.id);
    const fam = ok(await families.getFamily({ parentId: parent.id }));
    expect(fam).toMatchObject({ students: [], sessions: [], recentWork: [], reports: [] });
    expect(ok(await notifications.listForUser())).toEqual(expect.any(Array));
    expect(ok(await notifications.listForUser())).toEqual([]);
    expect(ok(await messages.getThread({}))).toEqual({ id: '', parentId: parent.id, lastMessageAt: null, adminLastReadAt: null, parentLastReadAt: null, parent: { id: parent.id, name: parent.name }, unread: 0, messages: [] });
    expect(ok(await messages.unreadCount())).toBe(0);
    expect(ok(await scheduling.listSessions({}))).toEqual([]);
    // A read writes nothing: the thread comes with the children.
    expect(await db.conversation.count({ where: { parentId: parent.id } })).toBe(0);
    ok(await families.addMyChildren({ children: [{ firstName: 'Later', grade: 1 }] }));
    const thread = ok(await messages.getThread({}));
    expect(thread.id).toEqual(expect.any(String));
    expect(ok(await families.getFamily({ parentId: parent.id })).conversationId).toBe(thread.id);
  });
});
