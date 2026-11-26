/** S21 holdouts: Vienne's reset locks that family's real requests and nobody else's; a PREVIEW parent too. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import * as families from '@/server/families';
import * as invites from '@/server/invites';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';
import * as scheduling from '@/server/scheduling';

freshDemo();

const reset = async (parentId: string) => {
  as('u_admin');
  return ok(await families.resetParentPassword({ parentId })).temporaryPassword;
};

describe('S21 holdouts', () => {
  it('Grace’s real requests are refused and change nothing; Ana carries on', async () => {
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all([
          db.user.findUniqueOrThrow({ where: { id: 'u_grace' }, select: { name: true, textSize: true, status: true } }),
          db.student.findUniqueOrThrow({ where: { id: 's_noah' } }),
          db.message.count(),
          db.session.count(),
          db.notification.count({ where: { userId: 'u_grace', readAt: null } }),
          db.pushSubscription.count(),
          db.fileAsset.count(),
        ]),
      );
    await reset('u_grace');
    const before = await snapshot();
    as('u_grace');
    const tries = [
      () => families.getFamily({ parentId: 'u_grace' }),
      () => families.updateStudent({ studentId: 's_noah', goals: 'S21 new goal' }),
      () => families.setTextSize({ textSize: 'XLARGE' }),
      () => assignments.listForStudent({ studentId: 's_noah' }),
      () => content.listResourcesForStudent({ studentId: 's_noah' }),
      () => content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: 100 }),
      () => messages.sendMessage({ body: 'S21 hello' }),
      () => notifications.markAllRead(),
      () => notifications.savePushSubscription({ endpoint: 'https://push.example.com/s21', keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) } }),
      () => scheduling.requestSession({ studentId: 's_noah', mode: 'VIDEO', startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), durationMin: 45 }),
    ];
    for (const [i, t] of tries.entries()) {
      const r = await t();
      fails(r, 'MUST_CHANGE_PASSWORD', /choose a new password/i);
      expect(Object.keys(r).sort(), `try ${i}`).toEqual(['code', 'error', 'ok']);
    }
    expect(await snapshot()).toBe(before);

    as('u_ana');
    ok(await families.getFamily({ parentId: 'u_ana' }));
    ok(await assignments.listForStudent({ studentId: 's_mateo' }));
    as('u_admin');
    ok(await families.getFamily({ parentId: 'u_grace' }));
  });

  it('a preview parent can’t spend an invite code until the new password; then the same session can', async () => {
    as('u_admin');
    const { code, invite } = ok(await invites.createInvite({ parentName: 'Tom Hughes', plannedStudents: [{ firstName: 'Sam', grade: 2 }] }));
    const temporary = await reset('u_tom');
    as('u_tom');
    fails(await invites.redeemInvite({ code }), 'MUST_CHANGE_PASSWORD');
    fails(await content.listResourcesForStudent({}), 'MUST_CHANGE_PASSWORD');
    expect((await db.invite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_tom' } })).status).toBe('PREVIEW');

    // Wrong input on the one open door: refused, and still locked.
    for (const input of [{ currentPassword: temporary, newPassword: 'short' }, { currentPassword: temporary, newPassword: temporary }, { newPassword: 'toms-own-password-1' }]) {
      fails(await families.changePassword(input), 'INVALID');
    }
    fails(await invites.redeemInvite({ code }), 'MUST_CHANGE_PASSWORD');

    ok(await families.changePassword({ currentPassword: temporary, newPassword: 'toms-own-password-1' }));
    expect(ok(await invites.redeemInvite({ code })).status).toBe('ACTIVE');
  });
});
