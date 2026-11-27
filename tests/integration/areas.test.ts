/**
 * Families, FAST results, reports, messages, the book and skills.
 */
import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as books from '@/server/books';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as messages from '@/server/messages';
import * as reports from '@/server/reports';
import * as taxonomy from '@/server/taxonomy';
import * as dashboard from '@/server/dashboard';

freshDemo();

describe('families', () => {
  it('lists every parent with children, next session and FAST level', async () => {
    as('u_admin');
    const list = ok(await families.listFamilies());
    expect(list).toHaveLength(12);
    const ana = list.find((f) => f.id === 'u_ana')!;
    expect(ana.students.map((s) => s.id).sort()).toEqual(['s_lucia', 's_mateo']);
    expect(ana.conversationId).toBe('conv_ana');
    expect(ok(await families.listFamilies({ status: 'PREVIEW' })).map((f) => f.id).sort()).toEqual(['u_lena', 'u_tom']);
  });

  it('moving up a grade asks the family about the book again', async () => {
    as('u_admin');
    expect((await db.student.findUniqueOrThrow({ where: { id: 's_mateo' } })).hasBookAt).not.toBeNull();
    const s = ok(await families.updateStudent({ studentId: 's_mateo', grade: 4 }));
    expect(s.hasBookAt).toBeNull();
    ok(await families.updateStudent({ studentId: 's_mateo', grade: 3 }));
  });

  it('a temporary password works for email sign-in and clears any lockout', async () => {
    as('u_admin');
    await db.user.update({ where: { id: 'u_daniel' }, data: { failedLogins: 4, lockedUntil: new Date(Date.now() + 60000) } });
    const { temporaryPassword } = ok(await families.resetParentPassword({ parentId: 'u_daniel' }));
    const u = await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } });
    expect(await bcrypt.compare(temporaryPassword, u.passwordHash!)).toBe(true);
    expect([u.failedLogins, u.lockedUntil]).toEqual([0, null]);
    fails(await families.resetParentPassword({ parentId: 'u_admin' }), 'NOT_FOUND');
  });

  it('adding a child gives them Math and this school year', async () => {
    as('u_admin');
    const s = ok(await families.addStudent({ parentId: 'u_grace', firstName: 'June', grade: 1 }));
    expect(s.subjects.map((x) => x?.id)).toEqual(['sub_math']);
    expect(s.schoolYear).toMatch(/^\d{4}–\d{2}$/);
    fails(await families.addStudent({ parentId: 'u_grace', firstName: 'X', grade: 9 }), 'INVALID', /K–6/);
  });

  it('text size is saved for the signed-in user', async () => {
    as('u_ana');
    expect(ok(await families.setTextSize({ textSize: 'XLARGE' }))).toEqual({ textSize: 'XLARGE' });
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).textSize).toBe('XLARGE');
  });
});

describe('FAST and Star Math', () => {
  it('a parent enters PM2 for their child; Vienne sees who entered it', async () => {
    as('u_ana');
    const meta = ok(await fast.listResults({ studentId: 's_mateo' }));
    expect(meta.testType).toBe('FAST_MATH');
    const r = ok(await fast.saveResult({ studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2', scaleScore: 305, level: 3, categories: [{ categoryId: meta.categories[0].id, level: 4 }] }));
    expect(r).toMatchObject({ testType: 'FAST_MATH', gradeTested: 3, level: 3, percentile: null, enteredBy: { id: 'u_ana', role: 'PARENT' } });
    expect(r.categories[0].name).toBeTruthy();
    fails(await fast.saveResult({ studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2', scaleScore: 310, level: 3 }), 'INVALID', /already entered/);
    fails(await fast.saveResult({ studentId: 's_mateo', schoolYear: '2026–27', window: 'PM3', scaleScore: 310 }), 'INVALID', /level, 1 to 5/);
    fails(await fast.saveResult({ studentId: 's_mateo', schoolYear: '2026–27', window: 'PM3', scaleScore: 310, level: 3, categories: [{ categoryId: 'made_up', level: 2 }] }), 'INVALID', /area/);
  });

  it('a parent can’t change or remove a result Vienne entered; Vienne can', async () => {
    as('u_ana');
    fails(await fast.saveResult({ id: 'fr_mateo_PM1_2026', studentId: 's_mateo', schoolYear: '2026–27', window: 'PM1', scaleScore: 1, level: 1 }), 'FORBIDDEN');
    fails(await fast.deleteResult({ id: 'fr_mateo_PM1_2026' }), 'FORBIDDEN');
    as('u_admin');
    ok(await fast.saveResult({ id: 'fr_mateo_PM1_2026', studentId: 's_mateo', schoolYear: '2026–27', window: 'PM1', scaleScore: 290, level: 2 }));
  });

  it('K–2 is Star Math: a percentile, no level', async () => {
    as('u_monique');
    const r = ok(await fast.saveResult({ studentId: 's_ava', schoolYear: '2026–27', window: 'PM2', scaleScore: 640, level: 4, percentile: 62 }));
    expect(r).toMatchObject({ testType: 'STAR_MATH', level: null, percentile: 62, categories: [] });
    fails(await fast.saveResult({ studentId: 's_ava', schoolYear: '2026–27', window: 'PM3', scaleScore: 640, percentile: 120 }), 'INVALID', /1 to 99/);
  });

  it('the dashboards show the real Miami-Dade window', async () => {
    as('u_ana');
    const o = ok(await dashboard.getParentOverview({ studentId: 's_lucia' }));
    expect(['PM2', 'PM3']).toContain(o.fastWindow?.window);
    expect(ok(await dashboard.getParentOverview({ studentId: 's_mateo' })).fastWindow).not.toBeNull();
    as('u_monique');
    expect(ok(await dashboard.getParentOverview({ studentId: 's_ava' })).fastWindow).toBeNull(); // K–2: no FAST countdown
  });
});

describe('reports', () => {
  it('draft → rate → publish; the family sees it only once published', async () => {
    as('u_admin');
    const d = ok(await reports.createDraft({ studentId: 's_lucia' }));
    expect(d.status).toBe('DRAFT');
    fails(await reports.publishReport({ reportId: d.id }), 'INVALID', /summary/);
    ok(await reports.updateReport({ reportId: d.id, summary: 'Lucia is flying through fractions.' }));
    fails(await reports.publishReport({ reportId: d.id }), 'INVALID', /Rate at least one skill/);
    const skill = await db.skill.findFirstOrThrow({ where: { gradeMin: { lte: 5 }, gradeMax: { gte: 5 }, strand: 'FR' } });
    fails(await reports.setRatings({ reportId: d.id, ratings: [{ skillId: skill.id, rating: 5 }] }), 'INVALID', /1–4/);
    const rated = ok(await reports.setRatings({ reportId: d.id, ratings: [{ skillId: skill.id, rating: 3, comment: 'Solid' }] }));
    expect(rated.ratings[0].area.id).toBeTruthy();

    as('u_ana');
    expect(ok(await reports.listForStudent({ studentId: 's_lucia' })).some((r) => r.id === d.id)).toBe(false);
    fails(await reports.getReport({ reportId: d.id }), 'NOT_FOUND');

    as('u_admin');
    ok(await reports.publishReport({ reportId: d.id }));
    as('u_ana');
    const full = ok(await reports.getReport({ reportId: d.id }));
    expect(full).toMatchObject({ status: 'PUBLISHED', student: { id: 's_lucia' }, parent: { id: 'u_ana' } });
    expect('adminNotes' in full.student).toBe(false);
    expect(full.bookWork.assigned).toBeGreaterThanOrEqual(full.bookWork.done);
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } })).toBe(1);
  });

  it('a draft report is hidden from its own family', async () => {
    as('u_priya');
    fails(await reports.getReport({ reportId: 'rep_arjun_1' }), 'NOT_FOUND');
  });
});

describe('messages', () => {
  it('a parent writes; Vienne’s unread count goes up and she’s notified; reading clears it', async () => {
    as('u_admin');
    const before = ok(await messages.listThreads()).find((t) => t.id === 'conv_ana')!.unread;
    as('u_ana');
    fails(await messages.sendMessage({ body: '   ' }), 'INVALID', /Write a message/);
    const m = ok(await messages.sendMessage({ body: 'Can we do Thursday instead?' }));
    expect(m.conversationId).toBe('conv_ana');
    as('u_admin');
    const thread = ok(await messages.listThreads()).find((t) => t.id === 'conv_ana')!;
    expect(thread.unread).toBe(before + 1);
    expect(thread.lastMessage?.body).toBe('Can we do Thursday instead?');
    expect(await db.notification.count({ where: { userId: 'u_admin', type: 'MESSAGE_RECEIVED', body: 'Can we do Thursday instead?' } })).toBe(1);
    ok(await messages.markThreadRead({ conversationId: 'conv_ana' }));
    expect(ok(await messages.getThread({ conversationId: 'conv_ana' })).unread).toBe(0);
    ok(await messages.sendMessage({ conversationId: 'conv_ana', body: 'Thursday works!' }));
    as('u_ana');
    expect(ok(await messages.unreadCount())).toBeGreaterThan(0);
  });
});

describe('the book', () => {
  it('answer keys validate each format in plain words', async () => {
    as('u_admin');
    const cases: [object, RegExp][] = [
      [{ number: 1, format: 'MC', answer: 'E' }, /one letter, A to D/],
      [{ number: 1, format: 'MULTI', answer: 'A' }, /two or more letters/],
      [{ number: 1, format: 'NUMERIC', answer: 'three' }, /number or fraction/],
      [{ number: 99, format: 'MC', answer: 'A' }, /isn’t in Test 3/],
      [{ number: 1, format: 'MC', answer: 'A', benchmarkCode: 'MA.3.FR.1.1' }, /grade 5 standard/],
    ];
    for (const [row, msg] of cases) fails(await books.saveAnswerKey({ bookId: 'book_g5', test: 'T3', rows: [row as never] }), 'INVALID', msg);
    fails(await books.saveAnswerKey({ bookId: 'book_g5', test: 'T3', rows: [{ number: 1, format: 'MC', answer: 'A' }, { number: 1, format: 'MC', answer: 'B' }] }), 'INVALID', /twice/);
  });

  it('re-saving a key updates questions in place, so redo lists survive', async () => {
    as('u_admin');
    const redo = await db.redoItem.findFirstOrThrow({ where: { clearedAt: null }, include: { bookItem: { include: { book: true } } } });
    const it0 = redo.bookItem;
    const n = ok(await books.saveAnswerKey({ bookId: it0.bookId, test: it0.test, rows: [{ number: it0.number, format: 'NUMERIC', answer: '3/4' }] }));
    expect(n).toBeGreaterThan(0);
    const after = await db.bookItem.findUniqueOrThrow({ where: { id: it0.id } });
    expect([after.format, after.answer, after.source]).toEqual(['NUMERIC', '3/4', 'TYPED']);
    expect(await db.redoItem.findUnique({ where: { id: redo.id } })).not.toBeNull();
    const list = ok(await books.listBooks());
    expect(list.find((b) => b.id === it0.bookId)!.tests.find((t) => t.key === it0.test)!.keyed).toBe(n);
  });

  it('Vienne adds and clears redo questions; families see the list without answers', async () => {
    as('u_admin');
    fails(await books.addRedo({ studentId: 's_lucia', test: 'T4', numbers: [1] }), 'INVALID', /aren’t in the answer key/);
    expect(ok(await books.addRedo({ studentId: 's_lucia', test: 'T1', numbers: [2, 2, 5] }))).toBe(2);
    as('u_ana');
    const list = ok(await books.listRedo({ studentId: 's_lucia' }));
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((r) => !('answer' in r.item) && r.testName)).toBe(true);
    as('u_admin');
    ok(await books.clearRedo({ redoIds: list.map((r) => r.id) }));
    as('u_ana');
    expect(ok(await books.listRedo({ studentId: 's_lucia' }))).toEqual([]);
    ok(await books.setHasBook({ studentId: 's_lucia', hasBook: false }));
    expect((await db.student.findUniqueOrThrow({ where: { id: 's_lucia' } })).hasBookAt).toBeNull();
  });
});

describe('skills', () => {
  it('upsert, archive and reorder; bad ranges and codes are caught', async () => {
    as('u_admin');
    fails(await taxonomy.upsertSkill({ name: 'Backwards', gradeMin: 5, gradeMax: 2 }), 'INVALID', /backwards/);
    fails(await taxonomy.upsertSkill({ name: 'Bad code', gradeMin: 1, gradeMax: 2, benchmarkCodes: ['nope'] }), 'INVALID', /benchmark/);
    const k = ok(await taxonomy.upsertSkill({ name: 'Telling time', strand: 'M', gradeMin: 1, gradeMax: 3, benchmarkCodes: ['MA.3.M.2.1'] }));
    expect(k.subjectId).toBe('sub_math');
    ok(await taxonomy.archiveSkill({ skillId: k.id }));
    const subjects = ok(await taxonomy.listSubjects());
    expect(subjects[0].skills.some((s) => s.id === k.id)).toBe(false);
    expect(ok(await taxonomy.listSubjects({ includeArchived: true }))[0].skills.some((s) => s.id === k.id)).toBe(true);
  });
});
