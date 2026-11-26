/**
 * S23: Vienne can delete a child, or a whole family (the parent account and all its children),
 * on request. Every record about them goes, and the stored files only they used; anything shared
 * with others stays. Nobody else can, whatever the id, and Vienne's own account can't be deleted.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import { storedSize, writeLocal } from '@/lib/storage';

freshDemo();

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
let n = 0;
/** A file with its bytes stored, as a finished upload by `uploadedById`. */
async function storedFile(uploadedById: string, finished = true) {
  const key = `files/s23-${(n += 1)}-${Date.now()}.jpg`;
  await writeLocal(key, JPEG);
  return db.fileAsset.create({ data: { storageKey: key, filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.byteLength, uploadedById, uploadedAt: finished ? new Date() : null } });
}
/** Gives a demo file (storage key from the demo data) its stored bytes. */
async function storeDemoFile(id: string) {
  const f = await db.fileAsset.findUniqueOrThrow({ where: { id } });
  await writeLocal(f.storageKey, JPEG);
  return f;
}

const gone = async (f: { id: string; storageKey: string }) => {
  expect(await db.fileAsset.findUnique({ where: { id: f.id } }), f.id).toBeNull();
  expect(await storedSize(f.storageKey), f.storageKey).toBeNull();
};
const kept = async (f: { id: string; storageKey: string }) => {
  expect(await db.fileAsset.findUnique({ where: { id: f.id } }), f.id).not.toBeNull();
  expect(await storedSize(f.storageKey), f.storageKey).toBe(JPEG.byteLength);
};

type Col = { table_name: string; column_name: string };
/** Every text and Json column in the database: where a row could still point at someone. */
const columns = () =>
  db.$queryRawUnsafe<Col[]>(
    `SELECT table_name::text AS table_name, column_name::text AS column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name <> '_prisma_migrations' AND data_type IN ('text', 'character varying', 'jsonb', 'json')`,
  );
const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** "Table.column" for every column, in every table, that still holds one of these ids (as a value, inside Json, or at the end of a link). */
async function pointersTo(ids: string[]) {
  const patterns = ids.flatMap((x) => [`%"${like(x)}"%`, `%/${like(x)}`]);
  const hits: string[] = [];
  for (const c of await columns()) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}"::text = ANY($1::text[]) OR "${c.column_name}"::text LIKE ANY($2::text[])`,
      ids,
      patterns,
    );
    if (n) hits.push(`${c.table_name}.${c.column_name} (${n})`);
  }
  return hits;
}

/** Row counts of every table, to show a refused delete changed nothing. */
async function snapshot() {
  const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(`SELECT table_name::text AS table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`);
  const out: Record<string, number> = {};
  for (const t of tables) out[t.table_name] = (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t.table_name}"`))[0].n;
  return out;
}

/** Every alert that names one of these people. */
const alertsNaming = async (...who: string[]) => (await db.notification.findMany()).filter((x) => who.some((w) => `${x.title} ${x.body ?? ''}`.includes(w)));

describe('who can delete', () => {
  it('a parent, a preview or paused account and anyone signed out are refused, whatever the id, and nothing changes', async () => {
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
    const before = await snapshot();
    const tries: [string | null, string][] = [
      ['u_ana', 'FORBIDDEN'], // a parent, for her own child and family too
      ['u_tom', 'FORBIDDEN'], // preview
      ['u_grace', 'FORBIDDEN'], // paused
      [null, 'UNAUTHENTICATED'],
    ];
    for (const [who, code] of tries) {
      as(who);
      for (const studentId of ['s_mateo', 's_noah', 's_sofia', 'nope']) fails(await families.deleteStudent({ studentId }), code);
      for (const parentId of ['u_ana', 'u_grace', 'u_daniel', 'u_admin', 'nope']) fails(await families.deleteFamily({ parentId }), code);
    }
    expect(await snapshot()).toEqual(before);
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
  });

  it('Vienne’s own account can’t be deleted, and a missing id gives NOT_FOUND', async () => {
    as('u_admin');
    const before = await snapshot();
    fails(await families.deleteFamily({ parentId: 'u_admin' }), 'FORBIDDEN', /own account/);
    fails(await families.deleteFamily({ parentId: 'u_nobody' }), 'NOT_FOUND');
    fails(await families.deleteStudent({ studentId: 's_nobody' }), 'NOT_FOUND');
    expect(await snapshot()).toEqual(before);
    expect(await db.user.findUnique({ where: { id: 'u_admin' } })).not.toBeNull();
  });
});

describe('deleting a child', () => {
  it('removes every record about Lucia and the files only she used; her brother, her parent and shared files stay', async () => {
    as('u_admin');
    const lucia = await db.student.findUniqueOrThrow({ where: { id: 's_lucia' } });
    const subs = await db.submission.findMany({ where: { studentId: lucia.id } });
    expect(subs.length).toBeGreaterThan(0);

    // Her work: an upload of Ana's on one sheet (only hers: goes), a photo Noah's sheet uses too and a
    // library file in a draft (both shared: they stay).
    const upload = await storedFile('u_ana');
    const photo = await storeDemoFile('fa_lucia_work');
    expect((await db.submission.findUniqueOrThrow({ where: { id: 'sb_noah_t1' } })).photos).toContainEqual(expect.objectContaining({ fileId: photo.id }));
    const solo = await storedFile('u_ana');
    const t1 = subs.find((x) => x.id === 'sb_lucia_t1')!;
    await db.submission.update({ where: { id: t1.id }, data: { photos: [...(t1.photos as object[]), { number: 99, fileId: solo.id }] } });
    const library = await storeDemoFile('fa_mult');
    await db.submission.update({ where: { id: subs[0].id }, data: { fileId: upload.id, draft: [{ number: 1, value: 'A', fileId: library.id }] } });
    // Ana's own upload not attached to anything: hers, not Lucia's, so it stays.
    const anasOther = await storedFile('u_ana');
    // A share, a session note draft and alerts linked to her (S23b: by id, as the app links them).
    await db.resourceShare.create({ data: { resourceId: 'res_mult', studentId: lucia.id } });
    const session = await db.session.findFirstOrThrow({ where: { studentId: lucia.id } });
    await db.aiDraft.create({ data: { kind: 'SESSION_NOTE', model: 'claude-haiku-5-5', effort: 'high', refId: session.id, input: { transcript: 'Lucia did well' }, output: {} } });
    await db.notification.create({ data: { userId: 'u_ana', audience: 'PARENT', type: 'WORK_GRADED', title: 'Vienne checked Lucia’s Test 1', href: '/parent/learning', studentId: lucia.id } });
    await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'SUBMISSION_RECEIVED', title: 'Lucia finished Test 1', href: '/admin/assignments/x', studentId: lucia.id, parentId: 'u_ana' } });
    // The code Ana redeemed: each planned entry holds the id of the child it became (S23b).
    await db.invite.create({ data: { codeHash: 's23-ana', codeHint: 'MM-••S2', parentName: 'Ana Mendoza', plannedStudents: [{ firstName: 'Mateo', lastName: 'Mendoza', grade: 3, studentId: 's_mateo' }, { firstName: 'Lucia', lastName: 'Mendoza', grade: 5, studentId: lucia.id }], expiresAt: new Date(), usedAt: new Date(), usedById: 'u_ana' } });

    const ids = [
      lucia.id,
      ...(await db.session.findMany({ where: { studentId: lucia.id } })).map((x) => x.id),
      ...subs.map((x) => x.id),
      ...(await db.progressReport.findMany({ where: { studentId: lucia.id } })).map((x) => x.id),
      ...(await db.redoItem.findMany({ where: { studentId: lucia.id } })).map((x) => x.id),
      ...(await db.fastResult.findMany({ where: { studentId: lucia.id } })).map((x) => x.id),
      upload.id,
      solo.id,
    ];
    const mateoSessions = await db.session.count({ where: { studentId: 's_mateo' } });
    const mateoSubs = await db.submission.count({ where: { studentId: 's_mateo' } });

    expect(ok(await families.deleteStudent({ studentId: lucia.id }))).toMatchObject({ deleted: true });

    expect(await pointersTo(ids)).toEqual([]);
    expect(await alertsNaming('Lucia')).toEqual([]);
    expect((await db.invite.findUniqueOrThrow({ where: { codeHash: 's23-ana' } })).plannedStudents).toEqual([{ firstName: 'Mateo', lastName: 'Mendoza', grade: 3, studentId: 's_mateo' }]);
    await gone(upload);
    await gone(solo);
    await kept(photo);
    await kept(library);
    await kept(anasOther);
    // The library resource keeps existing, minus her share.
    expect(await db.resource.findUnique({ where: { id: 'res_mult' } })).not.toBeNull();
    expect(await db.resourceShare.count({ where: { resourceId: 'res_mult' } })).toBe(3);
    // Her brother and her parent are untouched.
    expect(await db.user.findUnique({ where: { id: 'u_ana' } })).not.toBeNull();
    expect(await db.session.count({ where: { studentId: 's_mateo' } })).toBe(mateoSessions);
    expect(await db.submission.count({ where: { studentId: 's_mateo' } })).toBe(mateoSubs);

    // Gone from Vienne's screens and Ana's.
    const fam = ok(await families.getFamily({ parentId: 'u_ana' }));
    expect(fam.students.map((s) => s.id)).toEqual(['s_mateo']);
    expect(ok(await families.listFamilies({})).flatMap((f) => f.students.map((s) => s.id))).not.toContain(lucia.id);
    as('u_ana');
    expect(ok(await families.getFamily({ parentId: 'u_ana' })).students.map((s) => s.id)).toEqual(['s_mateo']);
    as('u_admin');
    fails(await families.deleteStudent({ studentId: lucia.id }), 'NOT_FOUND');
  });
});

describe('deleting a family', () => {
  it('removes Keisha’s account, Jordan and every record about them, and the files only they used', async () => {
    // Keisha writes to Vienne (a thread, a message, an alert for Vienne that links to it).
    as('u_keisha');
    ok(await messages.sendMessage({ body: 'Please delete our account.' }));
    as('u_admin');
    const keisha = await db.user.findUniqueOrThrow({ where: { id: 'u_keisha' } });
    const kids = await db.student.findMany({ where: { parentId: keisha.id } });
    expect(kids.map((k) => k.id)).toEqual(['s_jordan']);

    // Things only their account has: a Google link, a phone, a wrong code, an alert, uploads (one unfinished).
    await db.account.create({ data: { userId: keisha.id, type: 'oidc', provider: 'google', providerAccountId: 's23-keisha' } });
    await db.pushSubscription.create({ data: { userId: keisha.id, endpoint: 'https://fcm.googleapis.com/fcm/send/s23-keisha', p256dh: 'p', auth: 'a' } });
    await db.redeemFailure.create({ data: { userId: keisha.id } });
    await db.notification.create({ data: { userId: keisha.id, audience: 'PARENT', type: 'SESSION_CONFIRMED', title: 'Vienne confirmed Jordan’s session' } });
    await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'INVITE_REDEEMED', title: 'Keisha Brooks joined', href: '/admin/families', parentId: keisha.id } });
    const finished = await storedFile(keisha.id);
    const unfinished = await storedFile(keisha.id, false);
    const sub = await db.submission.findFirstOrThrow({ where: { studentId: 's_jordan' } });
    const work = await storedFile(keisha.id);
    await db.submission.update({ where: { id: sub.id }, data: { photos: [{ number: 1, fileId: work.id }] } });
    const library = await storeDemoFile('fa_mult');

    const conversation = await db.conversation.findUniqueOrThrow({ where: { parentId: keisha.id } });
    const ids = [
      keisha.id,
      'inv_keisha',
      conversation.id,
      ...(await db.message.findMany({ where: { conversationId: conversation.id } })).map((x) => x.id),
      ...kids.map((k) => k.id),
      ...(await db.session.findMany({ where: { studentId: { in: kids.map((k) => k.id) } } })).map((x) => x.id),
      ...(await db.submission.findMany({ where: { studentId: { in: kids.map((k) => k.id) } } })).map((x) => x.id),
      ...(await db.progressReport.findMany({ where: { studentId: { in: kids.map((k) => k.id) } } })).map((x) => x.id),
      ...(await db.fastResult.findMany({ where: { studentId: { in: kids.map((k) => k.id) } } })).map((x) => x.id),
      finished.id,
      unfinished.id,
      work.id,
    ];
    const others = await db.user.count({ where: { id: { not: keisha.id } } });
    const anaAlerts = await alertsNaming('Ana Mendoza');

    expect(ok(await families.deleteFamily({ parentId: keisha.id }))).toMatchObject({ deleted: true });

    expect(await pointersTo(ids)).toEqual([]);
    expect(await pointersTo([keisha.email])).toEqual([]);
    expect(await alertsNaming('Keisha', 'Jordan')).toEqual([]);
    await gone(finished);
    await gone(unfinished);
    await gone(work);
    await kept(library);
    // Shared things stay: the library resource, minus Jordan's share; everyone else; other families' alerts.
    expect(await db.resource.findUnique({ where: { id: 'res_mult' } })).not.toBeNull();
    expect((await db.resourceShare.findMany({ where: { resourceId: 'res_mult' } })).map((s) => s.studentId).sort()).toEqual(['s_eli', 's_sofia']);
    expect(await db.user.count()).toBe(others);
    expect(await alertsNaming('Ana Mendoza')).toEqual(anaAlerts);

    // Gone from Vienne's screens.
    expect(ok(await families.listFamilies({})).map((f) => f.id)).not.toContain(keisha.id);
    fails(await families.getFamily({ parentId: keisha.id }), 'NOT_FOUND');
    expect(ok(await messages.listThreads({})).map((t: { id: string }) => t.id)).not.toContain(conversation.id);
    fails(await families.deleteFamily({ parentId: keisha.id }), 'NOT_FOUND');
    // Signed in as Keisha on an old phone: signed out.
    as('u_keisha');
    fails(await families.getFamily({ parentId: keisha.id }), 'UNAUTHENTICATED');
  });
});

/*
 * S23b changed this block: a family's code is only the one its parent redeemed (Invite.usedById), and a
 * child comes off it by the studentId stored on its planned entry. Codes matched by email or name before
 * (revoked, expired, unused) are no longer the family's: they now stay exactly as they were.
 */
describe('the family’s invite codes, in every state', () => {
  const DAY = 86400000;
  type Parent = { id: string; email: string; name: string };
  /** The family's code: the one they redeemed. */
  async function theirCodes(parent: Parent, tag: string, plannedStudents: object[]) {
    await db.invite.deleteMany({ where: { usedById: parent.id } });
    const row = await db.invite.create({ data: { codeHint: 'MM-••S3', plannedStudents, expiresAt: new Date(Date.now() + 7 * DAY), codeHash: `${tag}-used`, parentName: parent.name, usedAt: new Date(), usedById: parent.id } });
    return [row.id];
  }
  /**
   * Codes that aren't theirs: by email (other case; revoked, expired), unused under their name (other case,
   * blank email), another email under the same name, or the same name used by someone else.
   */
  async function otherCodes(parent: Parent, tag: string, plannedStudents: object[]) {
    const base = { codeHint: 'MM-••S4', plannedStudents, expiresAt: new Date(Date.now() + 7 * DAY) };
    await db.invite.deleteMany({ where: { usedById: 'u_grace' } });
    const rows = [
      { codeHash: `${tag}-revoked`, parentName: 'Someone', parentEmail: parent.email.toUpperCase(), revokedAt: new Date() },
      { codeHash: `${tag}-expired`, parentName: 'Someone', parentEmail: parent.email, expiresAt: new Date(Date.now() - DAY) },
      { codeHash: `${tag}-by-name`, parentName: parent.name.toUpperCase() },
      { codeHash: `${tag}-by-name-blank-email`, parentName: parent.name.toLowerCase(), parentEmail: '' },
      { codeHash: `${tag}-other-email`, parentName: parent.name, parentEmail: 'someone.else@example.com' },
      { codeHash: `${tag}-same-name-used`, parentName: parent.name, usedAt: new Date(), usedById: 'u_grace' },
    ];
    const ids: string[] = [];
    for (const r of rows) ids.push((await db.invite.create({ data: { ...base, ...r } })).id);
    return ids;
  }
  const planned = async (ids: string[]) => (await db.invite.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } })).map((i) => i.plannedStudents);

  it('deleting a child takes them off the code their parent redeemed, by id; the code stays with their other children, and nobody else’s code changes', async () => {
    as('u_admin');
    const priya = await db.user.findUniqueOrThrow({ where: { id: 'u_priya' } });
    const kids = [{ firstName: 'Arjun', lastName: 'Patel', grade: 6, studentId: 's_arjun' }, { firstName: 'Maya', lastName: 'Patel', grade: 1, studentId: 's_maya' }];
    const theirs = await theirCodes(priya, 's23-child', kids);
    const others = await otherCodes(priya, 's23-child', kids);

    ok(await families.deleteStudent({ studentId: 's_maya' }));

    expect(await planned(theirs)).toEqual(theirs.map(() => [kids[0]]));
    expect(await planned(others)).toEqual(others.map(() => kids));
    const listed = ok(await invites.listInvites()).filter((i) => theirs.includes(i.id));
    expect(listed).toHaveLength(theirs.length);
    expect(listed.flatMap((i) => (i.plannedStudents as { firstName: string }[]).map((p) => p.firstName))).not.toContain('Maya');
  });

  it('deleting a family deletes the code it redeemed and leaves every other code, even ones sent to its email', async () => {
    as('u_admin');
    const monique = await db.user.findUniqueOrThrow({ where: { id: 'u_monique' } });
    const kids = [{ firstName: 'Ava', lastName: 'Johnson', grade: 2, studentId: 's_ava' }];
    const theirs = await theirCodes(monique, 's23-family', kids);
    const others = await otherCodes(monique, 's23-family', kids);

    ok(await families.deleteFamily({ parentId: monique.id }));

    expect(await db.invite.count({ where: { id: { in: theirs } } })).toBe(0);
    expect(await db.invite.count({ where: { id: { in: others } } })).toBe(others.length);
    expect(ok(await invites.listInvites()).filter((i) => theirs.includes(i.id))).toEqual([]);
  });

  it('a parent is refused and their codes don’t change', async () => {
    as('u_admin');
    const priya = await db.user.findUniqueOrThrow({ where: { id: 'u_priya' } });
    const kids = [{ firstName: 'Arjun', lastName: 'Patel', grade: 6, studentId: 's_arjun' }];
    const theirs = await theirCodes(priya, 's23-refused', kids);
    as('u_priya');
    fails(await families.deleteStudent({ studentId: 's_arjun' }), 'FORBIDDEN');
    fails(await families.deleteFamily({ parentId: 'u_priya' }), 'FORBIDDEN');
    expect(await planned(theirs)).toEqual(theirs.map(() => kids));
    expect(await db.student.findUnique({ where: { id: 's_arjun' } })).not.toBeNull();
  });
});
