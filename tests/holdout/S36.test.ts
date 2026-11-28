/**
 * S36 holdouts: what a stranger who just signed up can see and touch, limits that belong to one family
 * (not one child, not everyone), and odd input or sign-ups at the same moment.
 */
import { describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../../tests/integration/helpers';
import { MAX_UPLOADS_PER_DAY } from '@/lib/storage';
import { createAccount } from '@/app/(auth)/sign-in/actions';
import * as assignments from '@/server/assignments';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as dashboard from '@/server/dashboard';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as taxonomy from '@/server/taxonomy';

// The visitor's IP comes from the request's headers; there's no request here.
const ip = vi.hoisted(() => ({ current: null as string | null }));
vi.mock('@/lib/client-ip', () => ({ clientIp: async () => ip.current }));
// The sign-up action imports next-auth only for its error class, and next-auth doesn't load outside Next.
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));

freshDemo();

const DAY = 86400000;
const range = () => ({ from: new Date().toISOString(), to: new Date(Date.now() + 21 * DAY).toISOString() });

const signUp = (email: string) => {
  const form = new FormData();
  for (const [k, v] of Object.entries({ name: 'Holdout Stranger', email, password: 'a-good-password' })) form.set(k, v);
  return createAccount(undefined, form);
};
let n = 0;
const newParent = (name: string) => db.user.create({ data: { email: `holdout.s36.${(n += 1)}@example.com`, name, role: 'PARENT', status: 'ACTIVE' } });
const addKids = async (...names: string[]) => ok(await families.addMyChildren({ children: names.map((firstName) => ({ firstName, grade: 3 })) })).students;

describe('S36 holdouts: a stranger who signed up without a code', () => {
  it('sees an empty account, then only their own child; nothing of Ana’s or Vienne’s, before or after', async () => {
    const M = {
      link: 'https://meet.example.com/HOLDOUT-S36-ROOM',
      note: 'HOLDOUT-S36-ADMIN-NOTE',
      invite: 'HOLDOUT-S36-INVITE',
      key: 'HOLDOUT-S36-ANSWER-KEY',
      private: 'HOLDOUT-S36-PRIVATE-NOTE',
      anaMessage: 'HOLDOUT-S36-ANA-MESSAGE',
    };
    await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: M.link } });
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: M.link } });
    await db.student.updateMany({ data: { adminNotes: M.note } });
    await db.invite.updateMany({ data: { codeHint: M.invite } });
    await db.bookItem.updateMany({ where: { answer: { not: null } }, data: { answer: M.key } });
    await db.sessionNote.updateMany({ data: { summary: M.private, sharedWithParent: false } });
    const ana = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_ana' } });
    await db.message.create({ data: { conversationId: ana.id, senderId: 'u_admin', body: M.anaMessage } });
    await db.conversation.update({ where: { id: ana.id }, data: { parentLastReadAt: null } });
    const anaState = async () => ({
      conversation: await db.conversation.findUniqueOrThrow({ where: { id: ana.id }, include: { messages: { orderBy: { createdAt: 'asc' } } } }),
      students: await db.student.findMany({ where: { parentId: 'u_ana' }, orderBy: { id: 'asc' } }),
    });
    const before = await anaState();

    ip.current = '203.0.113.150';
    const email = 'holdout.s36.stranger@example.com';
    expect(await signUp(email)).toBeUndefined();
    const stranger = await db.user.findUniqueOrThrow({ where: { email } });
    // J2 makes sign-up ACTIVE; this is the parent it will make, with no child yet.
    await db.user.update({ where: { id: stranger.id }, data: { status: 'ACTIVE' } });
    as(stranger.id);

    const seen: unknown[] = [];
    const see = async <T,>(r: Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }>) => {
      const data = ok(await r);
      seen.push(data);
      return data;
    };

    // Empty account: Ana's ids get nothing.
    expect((await see(families.getFamily({ parentId: stranger.id }))).students).toEqual([]);
    expect((await see(messages.getThread({ conversationId: ana.id }))).messages).toEqual([]);
    expect(await see(messages.unreadCount())).toBe(0);
    expect(await see(notifications.listForUser())).toEqual([]);
    expect(await see(scheduling.listSessions({ studentId: 's_mateo' }))).toEqual([]);
    ok(await messages.markThreadRead({ conversationId: ana.id }));
    ok(await notifications.markAllRead());
    expect((await messages.sendMessage({ conversationId: ana.id, body: 'HOLDOUT-S36 intruder' })).ok).toBe(false);
    fails(await families.getFamily({ parentId: 'u_ana' }), 'FORBIDDEN');

    // Fields the form doesn't have are ignored or refused: never another parent's account or Vienne's fields.
    const added = await families.addMyChildren({
      parentId: 'u_ana',
      status: 'PAUSED',
      children: [{ firstName: 'Ownkid', grade: 3, parentId: 'u_ana', id: 's_mateo', adminNotes: 'HOLDOUT-S36-SMUGGLED', lastName: 'Smuggled', hasBookAt: new Date().toISOString() }],
    } as never);
    const kid = ok(added).students[0];
    seen.push(added);
    const stored = await db.student.findMany({ where: { parentId: stranger.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ firstName: 'Ownkid', lastName: '', adminNotes: null, hasBookAt: null });
    expect(stored[0].id).not.toBe('s_mateo');

    // Vienne gives the new child book homework, so the stranger has keyed work to look at.
    const book = await db.book.findUniqueOrThrow({ where: { grade: 3 } });
    as('u_admin');
    ok(await assignments.createBookAssignment({ bookId: book.id, test: 'M1', studentIds: [kid.id] }));
    as(stranger.id);

    await see(families.getFamily({ parentId: stranger.id }));
    await see(dashboard.getParentOverview({ studentId: kid.id }));
    expect(await see(assignments.listForStudent({ studentId: kid.id }))).toHaveLength(1);
    await see(books.listRedo({ studentId: kid.id }));
    await see(books.listBooks());
    await see(books.bookForGrade({ grade: 3 }));
    await see(content.listResourcesForStudent({ studentId: kid.id }));
    await see(fast.listResults({ studentId: kid.id }));
    await see(reports.listForStudent({ studentId: kid.id }));
    await see(messages.getThread({ conversationId: ana.id }));
    await see(notifications.listForUser());
    await see(scheduling.listSessions({}));
    await see(scheduling.getSettings());
    await see(scheduling.listLocations());
    await see(scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range() }));
    await see(taxonomy.listSubjects());

    const wire = JSON.stringify(seen);
    for (const secret of [...Object.values(M), 'HOLDOUT-S36-SMUGGLED', 'u_ana', 's_mateo', ana.id, 'Mateo', 'Mendoza']) expect(wire, secret).not.toContain(secret);
    for (const k of ['passwordHash', 'adminNotes', 'codeHash', 'codeHint', 'acceptedAnswers', 'ipHash']) expect(valuesOf(seen, k), k).toEqual([]);
    expect(valuesOf(seen, 'meetingUrl').filter(Boolean)).toEqual([]);
    expect(valuesOf(seen, 'defaultMeetingUrl').filter(Boolean)).toEqual([]);

    for (const studentId of ['s_mateo', 's_noah']) fails(await dashboard.getParentOverview({ studentId }), 'FORBIDDEN');
    expect(await anaState()).toEqual(before);

    // The other parents hear nothing about the new family, and can't reach its child.
    for (const other of ['u_ana', 'u_grace']) {
      as(other);
      expect(JSON.stringify(ok(await notifications.listForUser()))).not.toMatch(/Holdout Stranger|Ownkid|New family joined/);
      fails(await dashboard.getParentOverview({ studentId: kid.id }), 'FORBIDDEN');
      fails(await families.getFamily({ parentId: stranger.id }), 'FORBIDDEN');
    }
    as(null);
    fails(await families.getFamily({ parentId: stranger.id }), 'UNAUTHENTICATED');
  });
});

describe('S36 holdouts: each limit belongs to one family', () => {
  it('siblings share one request limit, a paused parent is still capped, refusals alert nobody, and other families aren’t held back', async () => {
    const full = await newParent('Holdout Full');
    as(full.id);
    const [first, second] = await addKids('Sibone', 'Sibtwo');
    const other = await newParent('Holdout Other');
    as(other.id);
    const [theirs] = await addKids('Neighbor');

    const book = async (who: string, studentId: string) => {
      as(who);
      const [slot] = ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range() }));
      return scheduling.requestSession({ studentId, mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 });
    };
    for (const s of [first, second, first, second, first]) ok(await book(full.id, s.id));
    const alerts = () => db.notification.count({ where: { type: 'SESSION_REQUESTED' } });
    const alertsBefore = await alerts();
    fails(await book(full.id, second.id), 'LIMIT', /5 requests waiting/);
    expect(await alerts()).toBe(alertsBefore);
    expect(await db.session.count({ where: { student: { parentId: full.id } } })).toBe(5);

    ok(await book(other.id, theirs.id));
    ok(await book('u_admin', second.id));
    // Vienne answering one makes room for one more.
    const waiting = await db.session.findFirstOrThrow({ where: { studentId: first.id, status: 'REQUESTED', requestedById: full.id } });
    as('u_admin');
    ok(await scheduling.declineSession({ sessionId: waiting.id }));
    ok(await book(full.id, first.id));
    fails(await book(full.id, first.id), 'LIMIT');

    // Messages and uploads: Ana at both limits, paused or not, takes nothing from Grace.
    const ana = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_ana' } });
    await db.message.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ conversationId: ana.id, senderId: 'u_ana', body: `holdout earlier ${i}` })) });
    await db.fileAsset.createMany({ data: Array.from({ length: MAX_UPLOADS_PER_DAY }, (_, i) => ({ storageKey: `files/holdout-s36-${i}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 10, uploadedById: 'u_ana' })) });
    const upload = () => content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: 100 });
    const messageAlerts = () => db.notification.count({ where: { type: 'MESSAGE_RECEIVED' } });
    const before = await messageAlerts();

    as('u_ana');
    fails(await messages.sendMessage({ body: 'HOLDOUT-S36 over' }), 'LIMIT');
    fails(await upload(), 'LIMIT');
    await db.user.update({ where: { id: 'u_ana' }, data: { status: 'PAUSED' } });
    fails(await messages.sendMessage({ body: 'HOLDOUT-S36 over' }), 'LIMIT');
    expect(await messageAlerts()).toBe(before);
    expect(await db.message.count({ where: { body: 'HOLDOUT-S36 over' } })).toBe(0);
    await db.user.update({ where: { id: 'u_ana' }, data: { status: 'ACTIVE' } });

    as('u_grace');
    ok(await messages.sendMessage({ body: 'HOLDOUT-S36 from Grace' }));
    ok(await upload());
  });
});

describe('S36 holdouts: odd input and taps at the same moment', () => {
  it('malformed children are INVALID and store nothing; sign-ups at once on one IP’s last slot make one account', async () => {
    const parent = await newParent('Holdout Odd');
    as(parent.id);
    const good = { firstName: 'Goodkid', grade: 2 };
    const bad: unknown[] = [
      undefined,
      null,
      'XYZZY',
      { children: null },
      { children: 'XYZZY' },
      { children: good },
      { children: [null] },
      { children: ['XYZZY'] },
      { children: [{ grade: 2 }] },
      { children: [{ firstName: 12345, grade: 2 }] },
      { children: [{ firstName: 'XYZZY' }] },
      { children: [{ firstName: 'XYZZY', grade: null }] },
      { children: [good, { firstName: 'XYZZY\u0000', grade: 2 }] },
      { children: [good, good, { firstName: 'XYZZY', grade: 99 }] },
    ];
    for (const input of bad) {
      const r = await families.addMyChildren(input as never);
      fails(r, 'INVALID');
      if (!r.ok) expect(r.error, JSON.stringify(input)).not.toMatch(/XYZZY|Goodkid|12345|99|expected|received|invalid|undefined|null/i);
    }
    expect(await db.student.count({ where: { parentId: parent.id } })).toBe(0);
    expect(await db.conversation.count({ where: { parentId: parent.id } })).toBe(0);
    expect(await db.notification.count({ where: { parentId: parent.id } })).toBe(0);

    await db.signupAttempt.deleteMany();
    ip.current = '203.0.113.151';
    for (let i = 0; i < 4; i++) expect(await signUp(`holdout.s36.ip.${i}@example.com`)).toBeUndefined();
    const results = await Promise.all([0, 1, 2].map((i) => signUp(`holdout.s36.race.${i}@example.com`)));
    expect(results.filter((r) => r === undefined)).toHaveLength(1);
    for (const r of results.filter(Boolean)) expect(r?.error).toMatch(/^Too many new accounts from here\./);
    expect(await db.user.count({ where: { email: { startsWith: 'holdout.s36.race.' } } })).toBe(1);
  });
});
