/**
 * S30: an alert linked only to a family (parentId set, studentId empty) never names a child.
 * Deleting one child leaves the family's alerts in place (S23b removes by id, never by name), so
 * those alerts must not carry a child's name. The joined alert counts the children instead.
 * MESSAGE_RECEIVED is family-only too: its body is the family's own words (exempt, see CHANGES),
 * its title names only the parent. Real server actions against Postgres; only web-push is a fake,
 * so the test reads the exact payload Vienne's phone gets.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';

const sendNotification = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return vi.fn(async (_sub: { endpoint: string }, _body: string) => ({}));
});
vi.mock('web-push', () => ({ sendNotification, setVapidDetails: vi.fn() }));

freshDemo();

const VIENNE = 'https://fcm.googleapis.com/fcm/send/s30-vienne';
/** Types the tests below make with parentId and no studentId. A new family-only type must be added here and exercised. */
const COVERED = ['INVITE_REDEEMED', 'MESSAGE_RECEIVED', 'FAMILY_JOINED'];
/** Family-only types whose body is the family's own words (accepted in CHANGES, 2026-11-26). */
const OWN_WORDS = ['MESSAGE_RECEIVED'];

/** Every child first name a family ever had: today's children and the ones its invite planned. A last name is the parent's too, so it doesn't count. */
const childNames = new Map<string, Set<string>>();
const remember = (parentId: string, names: string[]) => {
  const set = childNames.get(parentId) ?? new Set<string>();
  for (const n of names) if (n) set.add(n);
  childNames.set(parentId, set);
};

let n = 0;
async function joinedFamily(name: string, kids: { firstName: string; lastName?: string; grade: number }[]) {
  as('u_admin');
  const email = `s30.family.${(n += 1)}@example.com`;
  const made = ok(await invites.createInvite({ parentName: name, parentEmail: email, plannedStudents: kids }));
  const parent = await db.user.create({ data: { email, name, role: 'PARENT', status: 'PREVIEW', emailVerified: new Date() } });
  remember(parent.id, kids.map((k) => k.firstName));
  as(parent.id);
  ok(await invites.redeemInvite({ code: made.code }));
  const alert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', type: 'INVITE_REDEEMED', parentId: parent.id } });
  return { parent, alert, code: made.code };
}

/** The pushes Vienne's phone got since the last reset, once `count` have arrived. */
async function pushes(count: number) {
  await vi.waitFor(() => expect(sendNotification).toHaveBeenCalledTimes(count));
  return sendNotification.mock.calls.map(([sub, body]) => {
    expect(sub.endpoint).toBe(VIENNE);
    return JSON.parse(body) as { title: string; body?: string };
  });
}

/** Asserts no child name of the family appears as a word in `text`. */
function namesNoChild(text: string | null, parentId: string, label: string) {
  for (const name of childNames.get(parentId) ?? []) {
    expect(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text ?? ''), `${label} names ${name}: ${text}`).toBe(false);
  }
}

/** The argument text of each notify(...) / notifyAdmins(...) call in src/server and src/lib. */
function notifyCalls() {
  const out: { file: string; arg: string }[] = [];
  for (const dir of ['src/server', 'src/lib']) {
    for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.(ts|js)$/.test(f)) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/\bnotify(?:Admins)?\(/g)) {
        let depth = 1;
        let i = m.index! + m[0].length;
        const start = i;
        for (; i < src.length && depth > 0; i += 1) {
          if (src[i] === '(') depth += 1;
          else if (src[i] === ')') depth -= 1;
        }
        const arg = src.slice(start, i - 1);
        if (/^\s*\{/.test(arg)) out.push({ file: join(dir, f), arg });
      }
    }
  }
  return out;
}

beforeAll(async () => {
  as('u_admin');
  ok(await notifications.savePushSubscription({ endpoint: VIENNE, keys: { p256dh: 'p', auth: 'a' } }));
  for (const s of await db.student.findMany({ select: { parentId: true, firstName: true } })) remember(s.parentId, [s.firstName]);
});

beforeEach(() => sendNotification.mockClear());

describe('S30: permissions', () => {
  it('signed out or Vienne: redeeming is refused and no joined alert is made', async () => {
    as('u_admin');
    const { code } = ok(await invites.createInvite({ parentName: 'Nadia Perez', plannedStudents: [{ firstName: 'Lia', grade: 2 }] }));
    const before = await db.notification.count({ where: { type: 'INVITE_REDEEMED' } });
    as(null);
    fails(await invites.redeemInvite({ code }), 'UNAUTHENTICATED');
    as('u_admin');
    fails(await invites.redeemInvite({ code }), 'INVALID', /^Invite codes are for families$/);
    expect(await db.notification.count({ where: { type: 'INVITE_REDEEMED' } })).toBe(before);
  });
});

describe('S30: the joined alert names the parent and counts the children', () => {
  it('two children: "2 children added.", same words in the push', async () => {
    const { parent, alert } = await joinedFamily('Marisol Vega', [{ firstName: 'Tomas', lastName: 'Vega', grade: 3 }, { firstName: 'Elena', lastName: 'Vega', grade: 5 }]);
    expect(alert.title).toBe('Marisol Vega joined');
    expect(alert.body).toBe('Invite code used. 2 children added.');
    expect({ parentId: alert.parentId, studentId: alert.studentId }).toEqual({ parentId: parent.id, studentId: null });
    namesNoChild(`${alert.title} ${alert.body}`, parent.id, 'joined alert');
    const [push] = await pushes(1);
    expect(push.title).toBe('Marisol Vega joined');
    expect(push.body).toBe('Invite code used. 2 children added.');
  });

  it('one child: "1 child added.", same words in the push', async () => {
    const { alert } = await joinedFamily('Ruth Okafor', [{ firstName: 'Ada', grade: 1 }]);
    expect(alert.title).toBe('Ruth Okafor joined');
    expect(alert.body).toBe('Invite code used. 1 child added.');
    const [push] = await pushes(1);
    expect(push).toMatchObject({ title: 'Ruth Okafor joined', body: 'Invite code used. 1 child added.' });
  });

  it('deleting one child leaves the joined alert, and it never named that child', async () => {
    const { parent, alert } = await joinedFamily('Ines Duarte', [{ firstName: 'Bruno', grade: 4 }, { firstName: 'Clara', grade: 2 }]);
    const bruno = await db.student.findFirstOrThrow({ where: { parentId: parent.id, firstName: 'Bruno' } });
    as('u_admin');
    ok(await families.deleteStudent({ studentId: bruno.id }));
    const left = await db.notification.findUniqueOrThrow({ where: { id: alert.id } });
    expect(left.body).toBe('Invite code used. 2 children added.');
    expect(`${left.title} ${left.body}`).not.toMatch(/\bBruno\b/);
  });

  it('the demo seed’s joined alert uses the new wording', async () => {
    const seeded = await db.notification.findFirstOrThrow({ where: { type: 'INVITE_REDEEMED', parentId: 'u_keisha', title: 'Keisha Brooks joined' } });
    expect(seeded.body).toBe('Invite code used. 1 child added.');
    expect(seeded.studentId).toBeNull();
  });
});

describe('S30: a message alert’s title names only the parent', () => {
  it('a parent writes about a child: the title is the parent’s, the body is their own words', async () => {
    as('u_ana');
    ok(await messages.sendMessage({ body: 'Mateo has a game Thursday' }));
    const alert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', type: 'MESSAGE_RECEIVED', parentId: 'u_ana' }, orderBy: { createdAt: 'desc' } });
    expect(alert.title).toBe('Ana Mendoza sent a message');
    expect(alert.studentId).toBeNull();
    namesNoChild(alert.title, 'u_ana', 'message title');
    expect(alert.body).toBe('Mateo has a game Thursday');
    const [push] = await pushes(1);
    expect(push.title).toBe(alert.title);
  });
});

describe('S30: the open sign-up alert (S36) names no child', () => {
  it('FAMILY_JOINED counts the children and names none of them', async () => {
    const parent = await db.user.create({ data: { email: 's30.open@example.com', name: 'Oriel Grant', role: 'PARENT' } });
    remember(parent.id, ['Pim']);
    as(parent.id);
    ok(await families.addMyChildren({ children: [{ firstName: 'Pim', grade: 2 }] }));
    const alert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', type: 'FAMILY_JOINED', parentId: parent.id } });
    expect(`${alert.title} ${alert.body}`).not.toMatch(/\bPim\b/);
  });
});

describe('S30: every family-only alert names no child', () => {
  it('each notify call with parentId and no studentId is a type this test covers', () => {
    const calls = notifyCalls();
    expect(calls.length).toBeGreaterThan(10);
    const familyOnly = calls.filter((c) => /\bparentId\b/.test(c.arg) && !/\bstudentId\b/.test(c.arg));
    const types = familyOnly.map((c) => c.arg.match(/\btype:\s*['`]([A-Z_]+)['`]/)?.[1] ?? `unknown type in ${c.file}`);
    expect([...new Set(types)].sort()).toEqual([...COVERED].sort());
  });

  it('no alert in the database linked only to a family names one of its children', async () => {
    const rows = await db.notification.findMany({ where: { parentId: { not: null }, studentId: null } });
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(COVERED));
    for (const r of rows) {
      const label = `${r.type}: ${r.title}`;
      namesNoChild(r.title, r.parentId!, label);
      if (!OWN_WORDS.includes(r.type)) namesNoChild(r.body, r.parentId!, label);
    }
  });
});
