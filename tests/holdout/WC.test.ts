/** WC holdouts: the writes the contract check now covers refuse the wrong person and wrong input, and change nothing. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as ai from '@/server/ai';
import * as books from '@/server/books';
import * as content from '@/server/content';
import * as families from '@/server/families';
import * as fast from '@/server/fast';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';
import * as reports from '@/server/reports';
import * as scheduling from '@/server/scheduling';
import * as taxonomy from '@/server/taxonomy';

freshDemo();

const by = { orderBy: { id: 'asc' as const } };
/** Everything these writes could touch. */
const snapshot = async () => ({
  skills: await db.skill.findMany(by),
  users: await db.user.findMany(by),
  invites: await db.invite.findMany(by),
  resources: await db.resource.findMany({ ...by, include: { shares: true } }),
  items: await db.bookItem.findMany(by),
  hours: await db.availability.findMany(by),
  timeOff: await db.timeOff.findMany(by),
  sessions: await db.session.findMany(by),
  reports: await db.progressReport.findMany({ ...by, include: { ratings: true } }),
  fast: await db.fastResult.findMany(by),
  drafts: await db.aiDraft.findMany(by),
});

const privateDraft = () =>
  db.aiDraft.create({ data: { kind: 'SESSION_NOTE', model: 'demo', effort: 'high', refId: 'ses_15', input: { transcript: 'HOLDOUT-TRANSCRIPT' }, output: { note: 'HOLDOUT-DRAFT' } } });

describe('WC holdouts', () => {
  it('Ana, a preview parent and signed out are refused every admin write, get nothing back and change nothing', async () => {
    const draft = await privateDraft();
    const startsAt = new Date(Date.now() + 55 * 86400000).toISOString();
    const writes: [string, () => Promise<{ ok: boolean; code?: string }>][] = [
      ['archiveSkill', () => taxonomy.archiveSkill({ skillId: 'sk_counting' })],
      ['setParentStatus', () => families.setParentStatus({ parentId: 'u_grace', status: 'PAUSED' })],
      ['regenerateInvite', () => invites.regenerateInvite({ inviteId: 'inv_sam' })],
      ['updateResource', () => content.updateResource({ resourceId: 'res_mult', title: 'Taken over', studentIds: ['s_mateo'] })],
      ['saveAnswerKey', () => books.saveAnswerKey({ bookId: 'book_g5', test: 'T1', rows: [{ number: 1, format: 'MC', answer: 'D' }] })],
      ['setAvailability', () => scheduling.setAvailability({ rows: [] })],
      ['removeTimeOff', () => scheduling.removeTimeOff({ timeOffId: 'to_1' })],
      ['createSessionAsAdmin', () => scheduling.createSessionAsAdmin({ studentId: 's_mateo', mode: 'VIDEO', startsAt, durationMin: 45 })],
      ['createDraft', () => reports.createDraft({ studentId: 's_noah' })],
      ['setRatings', () => reports.setRatings({ reportId: 'rep_eli_1', ratings: [] })],
      ['discardDraft', () => ai.discardDraft({ draftId: draft.id })],
    ];
    const before = await snapshot();
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      for (const [name, write] of writes) {
        as(who);
        const r = await write();
        expect([r.ok, r.code], `${name} as ${who}`).toEqual([false, code]);
        expect(r, `${name} as ${who}`).not.toHaveProperty('data');
        expect(JSON.stringify(r)).not.toContain('HOLDOUT-');
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('another family cannot remove a FAST score or mark an alert read', async () => {
    const score = await db.fastResult.findUniqueOrThrow({ where: { id: 'fr_sofia_PM1_2026' } });
    const alert = await db.notification.create({ data: { userId: 'u_grace', audience: 'PARENT', type: 'HOLDOUT', title: 'HOLDOUT-GRACE-ALERT', channel: 'IN_APP' } });
    for (const who of ['u_ana', 'u_tom', null]) {
      as(who);
      const removed = await fast.deleteResult({ id: score.id });
      expect(removed.ok, String(who)).toBe(false);
      expect(removed).not.toHaveProperty('data');
      const read = await notifications.markRead({ notificationId: alert.id });
      expect(JSON.stringify(read)).not.toContain('HOLDOUT-GRACE-ALERT');
    }
    expect(await db.fastResult.findUnique({ where: { id: score.id } })).toEqual(score);
    expect((await db.notification.findUniqueOrThrow({ where: { id: alert.id } })).readAt).toBeNull();
    as('u_grace');
    ok(await notifications.markRead({ notificationId: alert.id }));
    expect((await db.notification.findUniqueOrThrow({ where: { id: alert.id } })).readAt).not.toBeNull();
  });

  it('wrong input from Vienne is refused and changes nothing', async () => {
    const before = await snapshot();
    as('u_admin');
    fails(await scheduling.setAvailability({ rows: [{ weekday: 1, startMin: 900, endMin: 800 }] }), 'INVALID');
    fails(await reports.setRatings({ reportId: 'rep_eli_1', ratings: [{ skillId: 'sk_fractions', rating: 5 }] }), 'INVALID');
    fails(await families.setParentStatus({ parentId: 'u_admin', status: 'PAUSED' }), 'NOT_FOUND');
    fails(await invites.regenerateInvite({ inviteId: 'inv_missing' }), 'NOT_FOUND');
    fails(await content.updateResource({ resourceId: 'res_missing', title: 'x' }), 'NOT_FOUND');
    fails(await reports.createDraft({ studentId: 's_missing' }), 'NOT_FOUND');
    fails(await taxonomy.archiveSkill({ skillId: 'sk_missing' }), 'NOT_FOUND');
    fails(await books.saveAnswerKey({ bookId: 'book_g5', test: 'T1', rows: [] }), 'INVALID');
    fails(await ai.discardDraft({ draftId: '' }), 'INVALID');
    expect(await snapshot()).toEqual(before);
  });
});
