/**
 * Who can do what. Every server function is a public endpoint, so these check the
 * guards directly: signed out, a parent calling Vienne-only functions, a parent
 * reaching into another family, and locked (preview / paused) accounts.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as ai from '@/server/ai';
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

freshDemo();

type Fn = (input: never) => Promise<{ ok: boolean; code?: string }>;
const call = (fn: unknown, input: unknown = {}) => (fn as Fn)(input as never);

/** Every function only Vienne may call. */
const ADMIN_ONLY: [string, unknown][] = [
  ['taxonomy.upsertSubject', taxonomy.upsertSubject],
  ['taxonomy.upsertSkill', taxonomy.upsertSkill],
  ['taxonomy.reorderSkills', taxonomy.reorderSkills],
  ['taxonomy.archiveSkill', taxonomy.archiveSkill],
  ['taxonomy.archiveSubject', taxonomy.archiveSubject],
  ['families.listFamilies', families.listFamilies],
  ['families.updateParent', families.updateParent],
  ['families.setParentStatus', families.setParentStatus],
  ['families.resetParentPassword', families.resetParentPassword],
  ['families.addStudent', families.addStudent],
  ['families.archiveStudent', families.archiveStudent],
  ['invites.listInvites', invites.listInvites],
  ['invites.createInvite', invites.createInvite],
  ['invites.revokeInvite', invites.revokeInvite],
  ['invites.restoreInvite', invites.restoreInvite],
  ['invites.regenerateInvite', invites.regenerateInvite],
  ['scheduling.updateSettings', scheduling.updateSettings],
  ['scheduling.setAvailability', scheduling.setAvailability],
  ['scheduling.addTimeOff', scheduling.addTimeOff],
  ['scheduling.removeTimeOff', scheduling.removeTimeOff],
  ['scheduling.confirmSession', scheduling.confirmSession],
  ['scheduling.declineSession', scheduling.declineSession],
  ['scheduling.rescheduleSession', scheduling.rescheduleSession],
  ['scheduling.createSessionAsAdmin', scheduling.createSessionAsAdmin],
  ['scheduling.completeSession', scheduling.completeSession],
  ['scheduling.markNoShow', scheduling.markNoShow],
  ['scheduling.setMeetingUrl', scheduling.setMeetingUrl],
  ['books.getAnswerKey', books.getAnswerKey],
  ['books.saveAnswerKey', books.saveAnswerKey],
  ['books.clearRedo', books.clearRedo],
  ['books.addRedo', books.addRedo],
  ['content.listResources', content.listResources],
  ['content.createResource', content.createResource],
  ['content.updateResource', content.updateResource],
  ['content.setPublishStatus', content.setPublishStatus],
  ['content.setSharing', content.setSharing],
  ['content.deleteResource', content.deleteResource],
  ['content.restoreResource', content.restoreResource],
  ['assignments.listAssignments', assignments.listAssignments],
  ['assignments.getAssignment', assignments.getAssignment],
  ['assignments.createBookAssignment', assignments.createBookAssignment],
  ['assignments.createPracticeAssignment', assignments.createPracticeAssignment],
  ['assignments.gradingQueue', assignments.gradingQueue],
  ['assignments.gradeSubmission', assignments.gradeSubmission],
  ['assignments.returnSubmission', assignments.returnSubmission],
  ['reports.createDraft', reports.createDraft],
  ['reports.updateReport', reports.updateReport],
  ['reports.setRatings', reports.setRatings],
  ['reports.publishReport', reports.publishReport],
  ['dashboard.getAdminToday', dashboard.getAdminToday],
  ['messages.listThreads', messages.listThreads],
  ['ai.draftSessionNote', ai.draftSessionNote],
  ['ai.readAnswerKeyPage', ai.readAnswerKeyPage],
  ['ai.discardDraft', ai.discardDraft],
  ['notifications.runDailyReminders', notifications.runDailyReminders],
];

describe('signed out', () => {
  it('every Vienne-only function says to sign in', async () => {
    as(null);
    for (const [name, fn] of ADMIN_ONLY) {
      const r = await call(fn);
      expect(r.ok, name).toBe(false);
      expect(r.code, name).toBe('UNAUTHENTICATED');
    }
  });

  it('family reads say to sign in too', async () => {
    as(null);
    fails(await dashboard.getParentOverview({ studentId: 's_mateo' }), 'UNAUTHENTICATED');
    fails(await assignments.listForStudent({ studentId: 's_mateo' }), 'UNAUTHENTICATED');
    fails(await scheduling.listSessions({}), 'UNAUTHENTICATED');
    fails(await messages.getThread({}), 'UNAUTHENTICATED');
  });
});

describe('a parent', () => {
  it('can’t call any Vienne-only function', async () => {
    as('u_ana');
    for (const [name, fn] of ADMIN_ONLY) {
      const r = await call(fn);
      expect(r.ok, name).toBe(false);
      expect(r.code, name).toBe('FORBIDDEN');
    }
  });

  it('can’t reach another family’s child (Sofia is Daniel’s)', async () => {
    as('u_ana');
    const checks: [string, Promise<{ ok: boolean; code?: string }>][] = [
      ['families.getFamily', families.getFamily({ parentId: 'u_daniel' })],
      ['families.updateStudent', families.updateStudent({ studentId: 's_sofia', goals: 'x' })],
      ['dashboard.getParentOverview', dashboard.getParentOverview({ studentId: 's_sofia' })],
      ['assignments.listForStudent', assignments.listForStudent({ studentId: 's_sofia' })],
      ['assignments.saveAnswerDraft', assignments.saveAnswerDraft({ submissionId: 'sb_sofia_m2', answers: [] })],
      ['assignments.submitAnswerSheet', assignments.submitAnswerSheet({ submissionId: 'sb_sofia_m2', answers: [] })],
      ['assignments.markPracticeDone', assignments.markPracticeDone({ submissionId: 'sb_sofia_fldoe' })],
      ['books.listRedo', books.listRedo({ studentId: 's_sofia' })],
      ['books.setHasBook', books.setHasBook({ studentId: 's_sofia' })],
      ['fast.listResults', fast.listResults({ studentId: 's_sofia' })],
      ['fast.saveResult', fast.saveResult({ studentId: 's_sofia', schoolYear: '2026–27', window: 'PM2', scaleScore: 300, level: 3 })],
      ['fast.deleteResult', fast.deleteResult({ id: 'fr_sofia_PM1_2026' })],
      ['reports.listForStudent', reports.listForStudent({ studentId: 's_sofia' })],
      ['reports.getReport', reports.getReport({ reportId: 'rep_sofia_1' })],
      ['scheduling.cancelSession', scheduling.cancelSession({ sessionId: 'ses_t1' })],
      ['scheduling.joinCall', scheduling.joinCall({ sessionId: 'ses_live' })],
      ['content.listResourcesForStudent', content.listResourcesForStudent({ studentId: 's_sofia' })],
      ['content.getFileForUser (Arjun’s work)', content.getFileForUser({ fileId: 'fa_arjun_work' })],
    ];
    for (const [name, p] of checks) {
      const r = await p;
      expect(r.ok, name).toBe(false);
      expect(r.code, name).toBe('FORBIDDEN');
    }
  });

  it('can’t book for another family’s child', async () => {
    as('u_ana');
    const r = await scheduling.requestSession({ studentId: 's_sofia', mode: 'VIDEO', startsAt: new Date(Date.now() + 3 * 86400000).toISOString(), durationMin: 45 });
    fails(r, 'FORBIDDEN');
  });

  it('only sees their own family’s sessions', async () => {
    as('u_ana');
    const rows = ok(await scheduling.listSessions({}));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((s) => s.studentId))).toEqual(new Set(['s_mateo', 's_lucia']));
  });

  it('can’t change their child’s grade or Vienne’s notes', async () => {
    as('u_ana');
    fails(await families.updateStudent({ studentId: 's_mateo', grade: 4 }), 'FORBIDDEN');
    fails(await families.updateStudent({ studentId: 's_mateo', adminNotes: 'hi' }), 'FORBIDDEN');
    ok(await families.updateStudent({ studentId: 's_mateo', goals: 'Fractions with confidence' }));
  });
});

describe('locked accounts', () => {
  it('a preview account (no invite code yet) sees teasers only', async () => {
    as('u_tom');
    fails(await dashboard.getParentOverview({ studentId: 's_mateo' }), 'NOT_ACTIVE');
    fails(await messages.getThread({}), 'NOT_ACTIVE');
    fails(await content.createUpload({ filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 }), 'NOT_ACTIVE');
    const teasers = ok(await content.listResourcesForStudent({}));
    expect(teasers.length).toBeGreaterThan(0);
    for (const t of teasers) {
      expect(t).toMatchObject({ locked: true });
      expect(Object.keys(t).sort()).toEqual(['gradeMax', 'gradeMin', 'id', 'kind', 'locked', 'subject', 'title']);
    }
  });

  it('pausing a family locks them out right away, and un-pausing lets them back', async () => {
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_ana', status: 'PAUSED' }));
    as('u_ana');
    fails(await assignments.listForStudent({ studentId: 's_mateo' }), 'NOT_ACTIVE');
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_ana', status: 'ACTIVE' }));
    as('u_ana');
    ok(await assignments.listForStudent({ studentId: 's_mateo' }));
  });

  it('a signed-in user whose account was deleted is treated as signed out', async () => {
    const ghost = await db.user.create({ data: { email: 'ghost@example.com', name: 'Ghost' } });
    await db.user.delete({ where: { id: ghost.id } });
    as(ghost.id);
    fails(await scheduling.listSessions({}), 'UNAUTHENTICATED');
  });
});
