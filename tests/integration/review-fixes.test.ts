/**
 * Fixes from the quality review: account linking, paused accounts and invite codes,
 * push endpoints, and file clean-up.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as invites from '@/server/invites';
import * as notifications from '@/server/notifications';
import { secureLinkedAccount } from '@/lib/auth-rules';
import { cleanUp } from '@/lib/jobs';
import { ensureAdmin } from '../../prisma/data';
import bcrypt from 'bcryptjs';
import * as families from '@/server/families';

freshDemo();

describe('linking a Google login to an existing account', () => {
  it('removes a password set on an unverified email (someone may have pre-registered it)', async () => {
    const squatter = await db.user.create({ data: { email: 'real.owner@example.com', name: 'X', passwordHash: 'hash-set-by-someone-else', emailVerified: null } });
    await secureLinkedAccount(squatter.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: squatter.id } });
    expect(after.passwordHash).toBeNull();
    expect(after.emailVerified).not.toBeNull();
  });

  it('leaves a verified account (like Vienne’s seeded one) alone', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: 'u_admin' } });
    await secureLinkedAccount('u_admin');
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_admin' } })).passwordHash).toBe(before.passwordHash);
  });
});

describe('a paused family', () => {
  it('can’t turn itself back on with an invite code', async () => {
    as('u_admin');
    const { code } = ok(await invites.createInvite({ parentName: 'Daniel', plannedStudents: [{ firstName: 'New', grade: 2 }] }));
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
    as('u_daniel');
    fails(await invites.redeemInvite({ code }), 'FORBIDDEN', /paused/);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).status).toBe('PAUSED');
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
  });
});

describe('push subscriptions', () => {
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
  it('accepts real browser push services', async () => {
    as('u_ana');
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc', 'https://wns2-par02p.notify.windows.com/w/?token=abc'])
      ok(await notifications.savePushSubscription({ endpoint, keys }));
    expect(await db.pushSubscription.count({ where: { userId: 'u_ana' } })).toBe(4);
  });
  it('refuses any other address (the server would POST to it)', async () => {
    as('u_ana');
    for (const endpoint of ['https://evil.example.com/hook', 'https://169.254.169.254/latest', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x', 'https://fcm.googleapis.com:8443/x'])
      fails(await notifications.savePushSubscription({ endpoint, keys }), 'INVALID', /push address/);
  });
});

describe('clean-up', () => {
  it('deletes a binned resource’s file once nothing else uses it', async () => {
    const file = await db.fileAsset.create({ data: { storageKey: 'files/old.pdf', filename: 'old.pdf', mimeType: 'application/pdf', sizeBytes: 5, uploadedById: 'u_admin', uploadedAt: new Date() } });
    const shared = await db.fileAsset.findFirstOrThrow({ where: { resources: { some: {} } } });
    await db.resource.create({ data: { title: 'Old', kind: 'WORKSHEET', fileId: file.id, deletedAt: new Date(Date.now() - 40 * 86400000) } });
    const other = await db.resource.findFirstOrThrow({ where: { fileId: shared.id } });
    await db.resource.create({ data: { title: 'Copy', kind: 'WORKSHEET', fileId: shared.id, deletedAt: new Date(Date.now() - 40 * 86400000) } });
    await cleanUp();
    expect(await db.fileAsset.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await db.fileAsset.findUnique({ where: { id: shared.id } })).not.toBeNull(); // still used by another resource
    expect(await db.resource.findUnique({ where: { id: other.id } })).not.toBeNull();
  });
});

describe('seeding Vienne’s account', () => {
  it('refuses an ADMIN_PASSWORD the sign-in screen could never accept', async () => {
    await expect(ensureAdmin(db as never, { email: 'short@example.com', name: 'V', password: 'abc123' })).rejects.toThrow(/at least 8 characters/);
    expect(await db.user.findUnique({ where: { email: 'short@example.com' } })).toBeNull();
  });
});

describe('changing a password', () => {
  it('after a reset the account must choose a new one; the temporary password unlocks that', async () => {
    as('u_admin');
    const { temporaryPassword } = ok(await families.resetParentPassword({ parentId: 'u_daniel' }));
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).mustChangePassword).toBe(true);
    as('u_daniel');
    fails(await families.changePassword({ currentPassword: temporaryPassword, newPassword: 'short' }), 'INVALID', /at least 8 characters/);
    fails(await families.changePassword({ currentPassword: temporaryPassword, newPassword: temporaryPassword }), 'INVALID', /different from the current one/);
    ok(await families.changePassword({ currentPassword: temporaryPassword, newPassword: 'daniels-new-password' }));
    const after = await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } });
    expect(after.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('daniels-new-password', after.passwordHash!)).toBe(true);
  });

  it('a wrong current password is refused and counts toward the lockout', async () => {
    as('u_keisha');
    for (let i = 0; i < 4; i++) fails(await families.changePassword({ currentPassword: `nope-${i}`, newPassword: 'keisha-new-password' }), 'INVALID', /current password isn’t right/);
    fails(await families.changePassword({ newPassword: 'keisha-new-password' }), 'INVALID', /current password isn’t right/);
    fails(await families.changePassword({ currentPassword: 'mentoring-demo-2026', newPassword: 'keisha-new-password' }), 'LOCKED', /15 minutes/);
  });

  it('a Google-only account can add a password', async () => {
    as('u_priya');
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_priya' } })).passwordHash).toBeNull();
    ok(await families.changePassword({ newPassword: 'priya-password-1' }));
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_priya' } })).passwordHash).not.toBeNull();
  });
});
