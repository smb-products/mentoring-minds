/**
 * S19: seeding Vienne's admin account (prisma/data.ts ensureAdmin) takes the account
 * back from anyone who signed up with her email first, and leaves her own account alone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { as, db, fails, freshDemo } from './helpers';
import { refreshToken } from '@/lib/auth-rules';
import { hashCode, codeHint } from '@/lib/codes-core';
import * as families from '@/server/families';
import { ensureAdmin, truncateAll } from '../../prisma/data';

freshDemo();

const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

async function squatter(email: string) {
  const u = await db.user.create({
    data: { email, name: 'Not Vienne', passwordHash: await bcrypt.hash('squatters-password', 4), role: 'PARENT', status: 'ACTIVE', failedLogins: 3, lockedUntil: new Date(Date.now() + 600000), mustChangePassword: true },
  });
  const child = await db.student.create({ data: { parentId: u.id, firstName: 'Kid', lastName: 'Squat', grade: 3 } });
  const thread = await db.conversation.create({ data: { parentId: u.id } });
  await db.message.create({ data: { conversationId: thread.id, senderId: u.id, body: 'hi' } });
  const code = `MM-S19${email[12]}`; // vienne.squatN@… → one code per squatter
  const invite = await db.invite.create({
    data: { codeHash: hashCode(code), codeHint: codeHint(code), parentName: 'Not Vienne', plannedStudents: [], expiresAt: new Date(Date.now() + 86400000), usedAt: new Date(), usedById: u.id },
  });
  return { u, child, thread, invite };
}

describe('a squatter signed up with Vienne’s email before the seed ran', () => {
  it('without ADMIN_PASSWORD: the old password stops working, sessions are signed out, and what hangs off it is reported', async () => {
    const { u, child, thread, invite } = await squatter('vienne.squat1@example.com');
    const before = await refreshToken({ sub: u.id }, { id: u.id });
    expect(before).not.toBeNull();
    const log = warn();

    const admin = await ensureAdmin(db as never, { email: 'Vienne.Squat1@example.com', name: 'Vienne Elliott' });

    expect(admin.id).toBe(u.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', name: 'Vienne Elliott', passwordHash: null, failedLogins: 0, lockedUntil: null, mustChangePassword: false, sessionVersion: u.sessionVersion + 1 });
    expect(after.emailVerified).not.toBeNull();
    // The squatter's existing session is signed out on its next request.
    expect(await refreshToken(before!)).toBeNull();
    // Javaris sees what's attached to the account.
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain(u.id);
    expect(out).toContain(child.id);
    expect(out).toContain(thread.id);
    expect(out).toContain(invite.id);
    expect(out).toMatch(/1 message\b/);
  });

  it('with ADMIN_PASSWORD: the account takes that password, and the squatter’s no longer matches', async () => {
    const { u } = await squatter('vienne.squat2@example.com');
    warn();
    await ensureAdmin(db as never, { email: 'vienne.squat2@example.com', name: 'Vienne Elliott', password: 'viennes-real-password' });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.sessionVersion).toBe(u.sessionVersion + 1);
    expect(after.passwordHash).not.toBeNull();
    expect(await bcrypt.compare('viennes-real-password', after.passwordHash!)).toBe(true);
    expect(await bcrypt.compare('squatters-password', after.passwordHash!)).toBe(false);
  });

  it('a squatter without children, thread or invite is reported as having nothing attached', async () => {
    const u = await db.user.create({ data: { email: 'vienne.squat3@example.com', name: 'X', passwordHash: 'x', status: 'PREVIEW' } });
    const log = warn();
    await ensureAdmin(db as never, { email: 'vienne.squat3@example.com', name: 'Vienne Elliott' });
    expect(log.mock.calls.flat().join('\n')).toMatch(/Nothing else was attached/);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).role).toBe('ADMIN');
  });

  it('the taken-back account can’t act as a parent any more, and is Vienne’s', async () => {
    const { u } = await squatter('vienne.squat4@example.com');
    warn();
    await ensureAdmin(db as never, { email: 'vienne.squat4@example.com', name: 'Vienne Elliott', password: 'viennes-real-password' });
    // A session issued before the takeover is refused; a fresh one is an admin session.
    expect(await refreshToken({ sub: u.id, sv: u.sessionVersion })).toBeNull();
    expect(await refreshToken({ sub: u.id }, { id: u.id })).toMatchObject({ role: 'ADMIN' });
    // An ordinary parent still can't use the admin-only reset on it.
    as('u_ana');
    fails(await families.resetParentPassword({ parentId: u.id }), 'FORBIDDEN');
  });
});

describe('running the seed again for the same admin', () => {
  it('changes nothing the second time and never touches Vienne’s own password', async () => {
    const email = 'vienne.rerun@example.com';
    const first = await ensureAdmin(db as never, { email, name: 'Vienne Elliott', password: 'first-password-1' });
    // Vienne signs in and later changes her password herself.
    const own = await bcrypt.hash('viennes-own-password', 4);
    await db.user.update({ where: { id: first.id }, data: { passwordHash: own } });
    const before = await db.user.findUniqueOrThrow({ where: { id: first.id } });
    const log = warn();

    await ensureAdmin(db as never, { email, name: 'Someone Else', password: 'a-different-password' });
    await ensureAdmin(db as never, { email, name: 'Someone Else' });

    expect(await db.user.findUniqueOrThrow({ where: { id: first.id } })).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });

  it('the demo’s Vienne (already admin) is left exactly as she is', async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: 'u_admin' } });
    await ensureAdmin(db as never, { email: before.email, name: 'Other', password: 'another-password' });
    expect(await db.user.findUniqueOrThrow({ where: { id: 'u_admin' } })).toEqual(before);
  });
});

describe('a fresh database', () => {
  it('creates Vienne’s account with her password, verified and active', async () => {
    await truncateAll(db as never);
    const log = warn();
    const admin = await ensureAdmin(db as never, { email: 'Vienne.Fresh@example.com', name: 'Vienne Elliott', password: 'fresh-password-1' });
    const row = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(row).toMatchObject({ email: 'vienne.fresh@example.com', role: 'ADMIN', status: 'ACTIVE', sessionVersion: 0, failedLogins: 0 });
    expect(row.emailVerified).not.toBeNull();
    expect(await bcrypt.compare('fresh-password-1', row.passwordHash!)).toBe(true);
    expect(await db.user.count()).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('without ADMIN_PASSWORD, the account has no password (Google sign-in only)', async () => {
    await truncateAll(db as never);
    const admin = await ensureAdmin(db as never, { email: 'vienne.google@example.com', name: 'Vienne Elliott' });
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash).toBeNull();
  });
});
