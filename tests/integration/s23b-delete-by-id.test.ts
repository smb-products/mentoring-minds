/**
 * S23b: deleting a family or a child finds what to remove only through ids and foreign keys: the parent's
 * user id, the child's student id, Invite.usedById, the studentId redeemInvite stores on each planned entry,
 * and an alert's studentId / parentId link (set by the code that creates the alert). Never by a name, an
 * email or a text pattern, so another family whose names or address look alike is never touched.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as assignments from '@/server/assignments';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import { sendSessionReminders } from '@/lib/jobs';
import { notify } from '@/lib/notify';
import { writeLocal } from '@/lib/storage';

freshDemo();

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const DAY = 86400000;
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
let n = 0;

async function storedFile(uploadedById: string) {
  const key = `files/s23b-${(n += 1)}-${Date.now()}.jpg`;
  await writeLocal(key, JPEG);
  return db.fileAsset.create({ data: { storageKey: key, filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.byteLength, uploadedById, uploadedAt: new Date() } });
}

/** A new parent who redeems a code Vienne made for these children (the real flow). */
async function redeemedFamily(name: string, email: string, plannedStudents: { firstName: string; lastName?: string; grade: number }[]) {
  as('u_admin');
  const made = ok(await invites.createInvite({ parentName: name, parentEmail: email, plannedStudents }));
  const parent = await db.user.create({ data: { email, name, role: 'PARENT', status: 'PREVIEW', emailVerified: new Date() } });
  as(parent.id);
  ok(await invites.redeemInvite({ code: made.code }));
  as('u_admin');
  const kids = await db.student.findMany({ where: { parentId: parent.id }, orderBy: { createdAt: 'asc' } });
  return { parent, kids, inviteId: made.invite.id };
}

const inviteRow = (id: string) => db.invite.findUniqueOrThrow({ where: { id } });
const plannedOf = async (id: string) => (await inviteRow(id)).plannedStudents as { firstName: string; studentId?: string }[];

/* ── A whole-database diff: what a delete removed or changed, table by table ── */

type Dump = Map<string, Map<string, string>>;
async function dump(): Promise<Dump> {
  const tables = await db.$queryRawUnsafe<{ t: string; hasId: boolean }[]>(
    `SELECT table_name::text AS t, bool_or(column_name = 'id') AS "hasId" FROM information_schema.columns WHERE table_schema = current_schema() AND table_name NOT IN ('_prisma_migrations', '_test_migrations') GROUP BY table_name`,
  );
  const out: Dump = new Map();
  for (const { t, hasId } of tables) {
    const rows = await db.$queryRawUnsafe<{ k: string; j: string }[]>(`SELECT ${hasId ? 'x.id::text' : 'row_to_json(x)::text'} AS k, row_to_json(x)::text AS j FROM "${t}" x`);
    out.set(t, new Map(rows.map((r) => [r.k, r.j])));
  }
  return out;
}
function diff(before: Dump, after: Dump) {
  const removed: Record<string, string[]> = {};
  const changed: Record<string, string[]> = {};
  const added: Record<string, string[]> = {};
  for (const [t, rows] of before) {
    const now = after.get(t)!;
    for (const [k, j] of rows) {
      if (!now.has(k)) (removed[t] ??= []).push(k);
      else if (now.get(k) !== j) (changed[t] ??= []).push(k);
    }
    for (const k of now.keys()) if (!rows.has(k)) (added[t] ??= []).push(k);
  }
  for (const r of [removed, changed, added]) for (const t of Object.keys(r)) r[t].sort();
  return { removed, changed, added };
}
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();
/** Tables keyed by id; the others (join tables) are keyed by their row. */
const ID_TABLES = new Set(['User', 'Account', 'PushSubscription', 'RedeemFailure', 'Invite', 'Student', 'Session', 'SessionNote', 'FileAsset', 'Assignment', 'Submission', 'RedoItem', 'FastResult', 'ProgressReport', 'ReportRating', 'AiDraft', 'Conversation', 'Message', 'Notification']);

/** Every row about these children, found by foreign key, as the delete should remove it. */
async function childRows(studentIds: string[]) {
  const sessions = await db.session.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } });
  const subs = await db.submission.findMany({ where: { studentId: { in: studentIds } }, select: { id: true, assignmentId: true } });
  const onlyTheirs = await db.assignment.findMany({ where: { id: { in: subs.map((s) => s.assignmentId) }, submissions: { every: { studentId: { in: studentIds } } } }, select: { id: true } });
  const rep = await db.progressReport.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } });
  return {
    Student: studentIds,
    Session: sessions.map((s) => s.id),
    SessionNote: (await db.sessionNote.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } }, select: { id: true } })).map((x) => x.id),
    AiDraft: (await db.aiDraft.findMany({ where: { kind: 'SESSION_NOTE', refId: { in: sessions.map((s) => s.id) } }, select: { id: true } })).map((x) => x.id),
    Submission: subs.map((s) => s.id),
    Assignment: onlyTheirs.map((a) => a.id),
    RedoItem: (await db.redoItem.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } })).map((x) => x.id),
    FastResult: (await db.fastResult.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } })).map((x) => x.id),
    ProgressReport: rep.map((r) => r.id),
    ReportRating: (await db.reportRating.findMany({ where: { reportId: { in: rep.map((r) => r.id) } }, select: { id: true } })).map((x) => x.id),
    Notification: (await db.notification.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } })).map((x) => x.id),
  } as Record<string, string[]>;
}
const merge = (...sets: Record<string, string[]>[]) => {
  const out: Record<string, string[]> = {};
  for (const s of sets) for (const [t, ids] of Object.entries(s)) out[t] = sorted([...(out[t] ?? []), ...ids]);
  for (const t of Object.keys(out)) if (!out[t].length) delete out[t];
  return out;
};
/** A removed join row (no id of its own) must point at a removed row. */
function joinRowsPointAtRemoved(removed: Record<string, string[]>) {
  const ids = Object.entries(removed).filter(([t]) => ID_TABLES.has(t)).flatMap(([, xs]) => xs);
  for (const [t, rows] of Object.entries(removed)) {
    if (ID_TABLES.has(t)) continue;
    for (const r of rows) expect(Object.values(JSON.parse(r) as Record<string, unknown>).some((v) => ids.includes(String(v))), `${t} ${r}`).toBe(true);
  }
}
/** The removed rows of tables keyed by id, minus files (checked on their own). */
const removedById = (removed: Record<string, string[]>) => Object.fromEntries(Object.entries(removed).filter(([t]) => ID_TABLES.has(t) && t !== 'FileAsset'));

describe('who can delete (permission)', () => {
  it('a parent, a preview or paused account and anyone signed out are refused, and no row changes', async () => {
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
    const before = await dump();
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], ['u_grace', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      for (const studentId of ['s_mateo', 's_noah', 's_jordan']) fails(await families.deleteStudent({ studentId }), code);
      for (const parentId of ['u_ana', 'u_grace', 'u_keisha', 'u_admin']) fails(await families.deleteFamily({ parentId }), code);
    }
    const d = diff(before, await dump());
    expect(d).toEqual({ removed: {}, changed: {}, added: {} });
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
  });
});

describe('check 1: only ids and foreign keys', () => {
  it('the delete code never matches on an email, a name or a text pattern', () => {
    const src = read('src/server/families.ts');
    const start = src.indexOf('/* ── Delete on request');
    const end = src.indexOf('export const changePassword');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    // Code only: comments explain the rule in words.
    const code = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const banned of [/email/i, /\bname\b/i, /firstName|lastName|parentName|fullName/, /contains|startsWith|endsWith|insensitive|\bmode\b/, /LIKE|ILIKE|\$queryRaw|\$executeRaw/, /RegExp|\.test\(|\.match\(|includes\(/, /toLowerCase|toUpperCase/]) {
      expect(code, `delete code uses ${banned}`).not.toMatch(banned);
    }
    // What it does use.
    expect(code).toMatch(/usedById: student\.parentId/);
    expect(code).toMatch(/usedById: parentId/);
    expect(code).toMatch(/studentId !== student\.id/);
    expect(code).toMatch(/notification\.deleteMany\(\{ where: \{ studentId: \{ in: studentIds \} \} \}\)/);
    expect(code).toMatch(/notification\.deleteMany\(\{ where: \{ parentId \} \}\)/);
  });
});

describe('check 4: alerts are linked by id by the code that creates them', () => {
  it('every alert the app creates in assignments, scheduling, reports, messages, invites and jobs carries its child or family id', async () => {
    const t0 = new Date(Date.now() - 1000);
    // Messages: a parent writes.
    as('u_ana');
    ok(await messages.sendMessage({ body: 'Hi Vienne' }));

    // Scheduling: request, confirm, move, cancel (parent); request, decline; book as Vienne, cancel (Vienne).
    const slots = async () => {
      as('u_ana');
      return ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', from: new Date(Date.now() + 3 * DAY).toISOString(), to: new Date(Date.now() + 28 * DAY).toISOString() }));
    };
    let open = await slots();
    const a = ok(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: open[0].startsAt, durationMin: 45 }));
    as('u_admin');
    ok(await scheduling.confirmSession({ sessionId: a.id }));
    open = await slots();
    as('u_admin');
    ok(await scheduling.rescheduleSession({ sessionId: a.id, startsAt: open[open.length - 1].startsAt, durationMin: 45 }));
    as('u_ana');
    ok(await scheduling.cancelSession({ sessionId: a.id, reason: 'Sick' }));
    open = await slots();
    const b = ok(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: open[0].startsAt, durationMin: 45 }));
    as('u_admin');
    ok(await scheduling.declineSession({ sessionId: b.id, reason: 'Busy' }));
    open = await slots();
    as('u_admin');
    const c = ok(await scheduling.createSessionAsAdmin({ studentId: 's_mateo', mode: 'VIDEO', startsAt: open[0].startsAt, durationMin: 45 }));
    ok(await scheduling.cancelSession({ sessionId: c.id, reason: 'Moved' }));

    // Jobs: the daily reminders.
    expect(await sendSessionReminders()).toBeGreaterThan(0);

    // Assignments: book homework (given, handed in, returned, handed in, checked) and practice.
    as('u_admin');
    const hw = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 1, to: 12, studentIds: ['s_mateo'] }));
    const key = await db.bookItem.findMany({ where: { bookId: 'book_g3', test: 'T2', number: { lte: 12 } }, orderBy: { number: 'asc' } });
    const answers = key.map((k) => ({ number: k.number, value: k.answer }));
    const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: hw.id, studentId: 's_mateo' } });
    as('u_ana');
    ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }));
    as('u_admin');
    ok(await assignments.returnSubmission({ submissionId: sub.id, feedback: 'Check #3' }));
    as('u_ana');
    ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers }));
    as('u_admin');
    ok(await assignments.gradeSubmission({ submissionId: sub.id, results: [] }));
    ok(await assignments.createPracticeAssignment({ title: 'S23b practice', studentIds: ['s_mateo'] }));

    // Reports: published.
    const draft = ok(await reports.createDraft({ studentId: 's_mateo' }));
    ok(await reports.updateReport({ reportId: draft.id, summary: 'Mateo draws a model first now.' }));
    ok(await reports.setRatings({ reportId: draft.id, ratings: [{ skillId: 'sk_word_problems', rating: 3 }] }));
    ok(await reports.publishReport({ reportId: draft.id }));

    // Invites: a new family joins.
    const joined = await redeemedFamily('Rosa Alvarez', 's23b.rosa@example.com', [{ firstName: 'Pia', lastName: 'Alvarez', grade: 2 }]);

    const made = await db.notification.findMany({ where: { createdAt: { gt: t0 } }, include: { user: { select: { role: true } } } });
    const types = new Set(made.map((x) => x.type));
    for (const t of ['MESSAGE_RECEIVED', 'SESSION_REQUESTED', 'SESSION_CONFIRMED', 'SESSION_CHANGED', 'SESSION_CANCELLED_BY_PARENT', 'SESSION_DECLINED', 'SESSION_REMINDER', 'ASSIGNMENT_GIVEN', 'SUBMISSION_RECEIVED', 'WORK_RETURNED', 'WORK_GRADED', 'REPORT_PUBLISHED', 'INVITE_REDEEMED']) {
      expect(types, t).toContain(t);
    }
    const parentOf = new Map((await db.student.findMany({ select: { id: true, parentId: true } })).map((s) => [s.id, s.parentId]));
    for (const x of made) {
      const label = `${x.type}: ${x.title}`;
      if (x.type === 'MESSAGE_RECEIVED') expect({ studentId: x.studentId, parentId: x.parentId }, label).toEqual({ studentId: null, parentId: 'u_ana' });
      else if (x.type === 'INVITE_REDEEMED') expect({ studentId: x.studentId, parentId: x.parentId }, label).toEqual({ studentId: null, parentId: joined.parent.id });
      else if (['SESSION_REQUESTED', 'SESSION_CANCELLED_BY_PARENT', 'SUBMISSION_RECEIVED'].includes(x.type)) {
        // Vienne's alerts about a child: the child and the family.
        expect(x.user.role, label).toBe('ADMIN');
        expect({ studentId: x.studentId, parentId: x.parentId }, label).toEqual({ studentId: 's_mateo', parentId: 'u_ana' });
      } else {
        // A family's alerts about one of its children: that child.
        expect(x.studentId, label).toBeTruthy();
        expect(parentOf.get(x.studentId!), label).toBe(x.userId);
        expect(x.parentId, label).toBeNull();
      }
    }
  });

  it('the link is what the caller passes: notify never derives it from `about` (S26)', async () => {
    const row = await notify({ userId: 'u_admin', audience: 'ADMIN', type: 'S23B_PROBE', title: 'About a child, no link', about: 's_mateo' });
    expect(row).toMatchObject({ studentId: null, parentId: null });
    const linked = await notify({ userId: 'u_admin', audience: 'ADMIN', type: 'S23B_PROBE', title: 'Linked', about: 'x', studentId: 's_mateo', parentId: 'u_ana' });
    expect(linked).toMatchObject({ studentId: 's_mateo', parentId: 'u_ana' });
    const src = read('src/lib/notify.ts');
    expect(src).toMatch(/studentId: n\.studentId \?\? null, parentId: n\.parentId \?\? null/);
    expect(src).not.toMatch(/studentId: about|parentId: about/);
    await db.notification.deleteMany({ where: { type: 'S23B_PROBE' } });
  });

  it('the schema change only adds (two nullable columns and their indexes), with its migration', () => {
    const dir = readdirSync(join(ROOT, 'prisma/migrations')).find((d) => d.endsWith('_notification_links'));
    expect(dir).toBeTruthy();
    const sql = read(`prisma/migrations/${dir}/migration.sql`).replace(/--.*$/gm, '');
    const statements = sql.split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    expect(statements).toEqual([
      'ALTER TABLE "Notification" ADD COLUMN "parentId" TEXT, ADD COLUMN "studentId" TEXT',
      'CREATE INDEX "Notification_studentId_idx" ON "Notification"("studentId")',
      'CREATE INDEX "Notification_parentId_idx" ON "Notification"("parentId")',
    ]);
  });

  it('named case: another family’s child with the same first name keeps their alerts, and an alert with no link stays', async () => {
    as('u_admin');
    const otherAva = ok(await families.addStudent({ parentId: 'u_daniel', firstName: 'Ava', lastName: 'Johnson', grade: 2 }));
    // Real alerts for both Avas: practice for each, and a published report for each.
    ok(await assignments.createPracticeAssignment({ title: 'Telling time', studentIds: ['s_ava', otherAva.id] }));
    for (const studentId of ['s_ava', otherAva.id]) {
      const draft = ok(await reports.createDraft({ studentId }));
      ok(await reports.updateReport({ reportId: draft.id, summary: 'Ava reads the clock to five minutes now.' }));
      ok(await reports.setRatings({ reportId: draft.id, ratings: [{ skillId: 'sk_word_problems', rating: 3 }] }));
      ok(await reports.publishReport({ reportId: draft.id }));
    }
    const unlinked = await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'NOTE', title: 'Ava Johnson finished Test 2', body: 'Monique Johnson, Ava' } });
    const othersBefore = await db.notification.findMany({ where: { OR: [{ studentId: otherAva.id }, { userId: 'u_daniel' }, { parentId: 'u_daniel' }] }, orderBy: { id: 'asc' } });
    expect(othersBefore.filter((x) => x.studentId === otherAva.id).length).toBeGreaterThanOrEqual(2);
    expect(await db.notification.count({ where: { studentId: 's_ava' } })).toBeGreaterThanOrEqual(2);

    ok(await families.deleteStudent({ studentId: 's_ava' }));

    expect(await db.notification.count({ where: { studentId: 's_ava' } })).toBe(0);
    expect(await db.notification.findMany({ where: { OR: [{ studentId: otherAva.id }, { userId: 'u_daniel' }, { parentId: 'u_daniel' }] }, orderBy: { id: 'asc' } })).toEqual(othersBefore);
    expect(await db.notification.findUnique({ where: { id: unlinked.id } })).toEqual(unlinked);
  });
});

describe('checks 5 and 6: a child comes off the code their parent redeemed, by the id stored at redemption', () => {
  it('redeemInvite stores each child’s id on its planned entry; deleting a child typed in lower case takes it off by id', async () => {
    const fam = await redeemedFamily('Hana Kim', 's23b.hana@example.com', [{ firstName: 'noah', lastName: 'kim', grade: 5 }, { firstName: 'Sam', lastName: 'kim', grade: 2 }]);
    expect(fam.kids.map((k) => k.firstName)).toEqual(['noah', 'Sam']);
    const [noah, sam] = fam.kids;
    expect(await plannedOf(fam.inviteId)).toEqual([
      expect.objectContaining({ firstName: 'noah', studentId: noah.id }),
      expect.objectContaining({ firstName: 'Sam', studentId: sam.id }),
    ]);

    ok(await families.deleteStudent({ studentId: noah.id }));

    const listed = ok(await invites.listInvites()).find((i) => i.id === fam.inviteId)!;
    expect((listed.plannedStudents as { firstName: string; studentId: string }[]).map((p) => [p.firstName, p.studentId])).toEqual([['Sam', sam.id]]);
    expect(listed.usedBy).toMatchObject({ id: fam.parent.id });
  });

  it('on a code nobody redeemed, the name stays: it isn’t the family’s', async () => {
    as('u_admin');
    const grace = await db.user.findUniqueOrThrow({ where: { id: 'u_grace' } });
    const made = ok(await invites.createInvite({ parentName: grace.name, parentEmail: grace.email, plannedStudents: [{ firstName: 'noah', lastName: 'kim', grade: 5 }, { firstName: 'Noah', lastName: 'Kim', grade: 5 }, { firstName: 'Sam', lastName: 'kim', grade: 2 }] }));
    const before = await inviteRow(made.invite.id);

    ok(await families.deleteStudent({ studentId: 's_noah' }));

    expect(await inviteRow(made.invite.id)).toEqual(before);
    expect(await db.student.findUnique({ where: { id: 's_noah' } })).toBeNull();
  });

  it('deleting a child removes exactly their records, the files only their work used and their alerts; the redeemed code only loses their entry', async () => {
    as('u_admin');
    const arjun = await db.student.findUniqueOrThrow({ where: { id: 's_arjun' } });
    // Priya redeemed a code for both children (ids stored), and Vienne once sent her another one (by email).
    await db.invite.deleteMany({ where: { usedById: 'u_priya' } });
    const redeemed = await db.invite.create({ data: { codeHash: 's23b-priya', codeHint: 'MM-••B1', parentName: 'Priya Patel', expiresAt: new Date(), usedAt: new Date(), usedById: 'u_priya', plannedStudents: [{ firstName: 'Arjun', lastName: 'Patel', grade: 6, studentId: arjun.id }, { firstName: 'Maya', lastName: 'Patel', grade: 1, studentId: 's_maya' }] } });
    const emailed = ok(await invites.createInvite({ parentName: 'Priya Patel', parentEmail: 'priya.patel@example.com', plannedStudents: [{ firstName: 'Arjun', lastName: 'Patel', grade: 6 }] }));
    // His work uses an upload only he has, and one his sister's work uses too.
    const subs = await db.submission.findMany({ where: { studentId: arjun.id } });
    expect(subs.length).toBeGreaterThan(0);
    const solo = await storedFile('u_priya');
    const shared = await storedFile('u_priya');
    await db.submission.update({ where: { id: subs[0].id }, data: { fileId: solo.id, photos: [{ number: 1, fileId: shared.id }] } });
    const elsewhere = await db.submission.findFirstOrThrow({ where: { studentId: 's_mateo' } });
    await db.submission.update({ where: { id: elsewhere.id }, data: { photos: [{ number: 1, fileId: shared.id }] } });
    // Alerts: linked to him (go), and one that only names him (stays).
    await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'SUBMISSION_RECEIVED', title: 'Arjun finished Test 1', studentId: arjun.id, parentId: 'u_priya' } });
    const named = await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'NOTE', title: 'Arjun Patel asked about ratios' } });

    const expected = merge(await childRows([arjun.id]));
    const before = await dump();
    ok(await families.deleteStudent({ studentId: arjun.id }));
    const d = diff(before, await dump());

    expect(removedById(d.removed)).toEqual(expected);
    expect(d.removed.FileAsset).toEqual([solo.id]);
    // Join rows that went (subjects, shares, note skills) all belong to his removed rows.
    joinRowsPointAtRemoved(d.removed);
    // The one changed row: his entry off the code Priya redeemed.
    expect(d.changed).toEqual({ Invite: [redeemed.id] });
    expect(d.added).toEqual({});
    expect(await plannedOf(redeemed.id)).toEqual([{ firstName: 'Maya', lastName: 'Patel', grade: 1, studentId: 's_maya' }]);
    expect(await plannedOf(emailed.invite.id)).toEqual([{ firstName: 'Arjun', lastName: 'Patel', grade: 6 }]);
    expect(await db.notification.findUnique({ where: { id: named.id } })).toEqual(named);
  });
});

describe('check 3: deleting a family removes exactly its rows', () => {
  it('Keisha’s account, sign-in links, push devices, Jordan and his records, her thread, uploads, redeemed code and linked alerts; nothing else', async () => {
    as('u_keisha');
    ok(await messages.sendMessage({ body: 'Please delete our account.' }));
    as('u_admin');
    const keisha = await db.user.findUniqueOrThrow({ where: { id: 'u_keisha' } });
    const kids = (await db.student.findMany({ where: { parentId: keisha.id } })).map((k) => k.id);
    expect(kids).toEqual(['s_jordan']);
    // The demo seed stores the id on the code she redeemed.
    expect(await plannedOf('inv_keisha')).toEqual([expect.objectContaining({ firstName: 'Jordan', studentId: 's_jordan' })]);

    const account = await db.account.create({ data: { userId: keisha.id, type: 'oidc', provider: 'google', providerAccountId: 's23b-keisha' } });
    const push = await db.pushSubscription.create({ data: { userId: keisha.id, endpoint: 'https://fcm.googleapis.com/fcm/send/s23b-keisha', p256dh: 'p', auth: 'a' } });
    const upload = await storedFile(keisha.id);
    // Codes she never redeemed stay as they are, including ones sent to her email (any case).
    const sent = ok(await invites.createInvite({ parentName: 'Keisha Brooks', parentEmail: keisha.email.toUpperCase(), plannedStudents: [{ firstName: 'Jordan', lastName: 'Brooks', grade: 3 }] }));
    const byName = ok(await invites.createInvite({ parentName: 'Keisha Brooks', plannedStudents: [{ firstName: 'Jordan', lastName: 'Brooks', grade: 3 }] }));
    // Another family with a Jordan, and alerts that only name Keisha or Jordan: they stay.
    const otherJordan = ok(await families.addStudent({ parentId: 'u_marcus', firstName: 'Jordan', lastName: 'Brooks', grade: 3 }));
    const unlinked = await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'NOTE', title: 'Keisha Brooks called about Jordan' } });
    await db.notification.create({ data: { userId: 'u_marcus', audience: 'PARENT', type: 'WORK_GRADED', title: 'Vienne checked Jordan’s Test 1', studentId: otherJordan.id } });
    // Her marks on another family's rows stay, without her (as in S23).
    const mateoSession = await db.session.findFirstOrThrow({ where: { studentId: 's_mateo' } });
    await db.session.update({ where: { id: mateoSession.id }, data: { requestedById: keisha.id } });

    const conversation = await db.conversation.findUniqueOrThrow({ where: { parentId: keisha.id } });
    const expected = merge(await childRows(kids), {
      User: [keisha.id],
      Account: [account.id],
      PushSubscription: [push.id],
      RedeemFailure: (await db.redeemFailure.findMany({ where: { userId: keisha.id } })).map((x) => x.id),
      Conversation: [conversation.id],
      Message: (await db.message.findMany({ where: { OR: [{ conversationId: conversation.id }, { senderId: keisha.id }] } })).map((x) => x.id),
      Invite: ['inv_keisha'],
      Notification: (await db.notification.findMany({ where: { OR: [{ userId: keisha.id }, { parentId: keisha.id }, { studentId: { in: kids } }] } })).map((x) => x.id),
      FastResult: (await db.fastResult.findMany({ where: { enteredById: keisha.id } })).map((x) => x.id),
    });
    expect(expected.Notification.length).toBeGreaterThan(2);
    const others = await db.user.count({ where: { id: { not: keisha.id } } });

    const before = await dump();
    ok(await families.deleteFamily({ parentId: keisha.id }));
    const d = diff(before, await dump());

    expect(removedById(d.removed)).toEqual(expected);
    expect(d.removed.FileAsset).toEqual([upload.id]);
    joinRowsPointAtRemoved(d.removed);
    expect(d.changed).toEqual({ Session: [mateoSession.id] });
    expect(d.added).toEqual({});
    expect(await db.session.findUniqueOrThrow({ where: { id: mateoSession.id } })).toMatchObject({ requestedById: 'u_admin' });
    expect(await db.user.count()).toBe(others);
    expect(await db.invite.findUnique({ where: { id: sent.invite.id } })).not.toBeNull();
    expect(await db.invite.findUnique({ where: { id: byName.invite.id } })).not.toBeNull();
    expect(await db.notification.findUnique({ where: { id: unlinked.id } })).toEqual(unlinked);
    expect(await db.student.findUnique({ where: { id: otherJordan.id } })).not.toBeNull();
  });
});

describe('check 2: the underscore email (named case)', () => {
  it('Ana is ana_m@example.com and another family’s code goes to anaxm@example.com with the same child’s name: deleting Ana’s child or family leaves it exactly as it was', async () => {
    as('u_admin');
    await db.user.update({ where: { id: 'u_ana' }, data: { email: 'ana_m@example.com' } });
    const code = ok(await invites.createInvite({ parentName: 'Alma Moreno', parentEmail: 'anaxm@example.com', plannedStudents: [{ firstName: 'Lucia', lastName: 'Moreno', grade: 5 }, { firstName: 'Sam', lastName: 'Moreno', grade: 2 }] }));
    // A look-alike family: the same parent name, an address that differs only at Ana's underscore, a Lucia Mendoza.
    const twin = await redeemedFamily('Ana Mendoza', 'ana.m@example.com', [{ firstName: 'Lucia', lastName: 'Mendoza', grade: 5 }]);
    as(twin.parent.id);
    ok(await messages.sendMessage({ body: 'Lucia says hi' }));
    as('u_admin');
    const twinUnredeemed = ok(await invites.createInvite({ parentName: 'ana mendoza', parentEmail: 'ANA_M@example.com'.replace('_', 'x'), plannedStudents: [{ firstName: 'Lucia', lastName: 'Mendoza', grade: 5 }] }));
    const twinRows = async () => ({
      user: await db.user.findUniqueOrThrow({ where: { id: twin.parent.id } }),
      students: await db.student.findMany({ where: { parentId: twin.parent.id }, orderBy: { id: 'asc' } }),
      invites: await db.invite.findMany({ where: { id: { in: [twin.inviteId, twinUnredeemed.invite.id, code.invite.id] } }, orderBy: { id: 'asc' } }),
      alerts: await db.notification.findMany({ where: { OR: [{ parentId: twin.parent.id }, { studentId: { in: twin.kids.map((k) => k.id) } }, { userId: twin.parent.id }] }, orderBy: { id: 'asc' } }),
      thread: await db.conversation.findUniqueOrThrow({ where: { parentId: twin.parent.id }, include: { messages: { orderBy: { id: 'asc' } } } }),
    });
    const before = await twinRows();
    expect(before.alerts.length).toBeGreaterThan(0);
    const codeBefore = await inviteRow(code.invite.id);

    ok(await families.deleteStudent({ studentId: 's_lucia' }));
    expect(await inviteRow(code.invite.id)).toEqual(codeBefore);
    expect(await twinRows()).toEqual(before);

    ok(await families.deleteFamily({ parentId: 'u_ana' }));
    expect(await inviteRow(code.invite.id)).toEqual(codeBefore);
    expect(await twinRows()).toEqual(before);
    expect(ok(await invites.listInvites()).find((i) => i.id === code.invite.id)).toMatchObject({ parentEmail: 'anaxm@example.com', status: 'ACTIVE' });
  });
});

describe('check 7: Delete family and Delete child are back on Vienne’s family page', () => {
  it('the buttons render as before S27, and the S23 browser tests run again', () => {
    const page = read('src/ui/pages/admin/FamilyPage.jsx');
    expect(page).not.toMatch(/SHOW_DELETE/);
    expect(page).toContain(`<Button variant="glass" icon={Trash2} onClick={() => setDeleting({ kind: 'family' })}>Delete family</Button>`);
    expect(page).toContain('aria-label={`Delete ${fullName(s)}`}');
    expect(read('tests/e2e/s23-delete-on-request.spec.ts')).not.toMatch(/test\.fixme/);
  });
});
