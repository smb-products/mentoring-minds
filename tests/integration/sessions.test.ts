/**
 * Sessions are signed JWTs (30 days). These check the server-side rules that end them:
 * a password change or reset, a Google sign-in taking an address back, a removed account.
 */
import { describe, expect, it, vi } from 'vitest';
import type { JWT } from '@auth/core/jwt';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as families from '@/server/families';
import * as auth from '@/lib/auth';
import { refreshToken, secureLinkedAccount } from '@/lib/auth-rules';

freshDemo();

/** A session as issued at sign-in, and the same session on a later request. */
const signIn = (id: string) => refreshToken({ sub: id } as JWT, { id });
const later = (token: JWT | null) => refreshToken(token!);

describe('a session', () => {
  it('carries the account’s role, status and text size, read fresh each request', async () => {
    const token = await signIn('u_daniel');
    expect(token).toMatchObject({ sub: 'u_daniel', role: 'PARENT', status: 'ACTIVE', sv: 0 });
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED', textSize: 'XLARGE' } });
    expect(await later(token)).toMatchObject({ status: 'PAUSED', textSize: 'XLARGE' });
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE', textSize: 'NORMAL' } });
  });

  it('issued before this change (no version) still works until the password changes', async () => {
    expect(await later({ sub: 'u_grace' } as JWT)).toMatchObject({ sub: 'u_grace', sv: 0 });
  });

  it('ends when Vienne resets the password: someone who knew the old one is signed out', async () => {
    const stolen = await signIn('u_monique');
    as('u_admin');
    ok(await families.resetParentPassword({ parentId: 'u_monique' }));
    expect(await later(stolen)).toBeNull();
    expect(await signIn('u_monique')).toMatchObject({ sv: 1 }); // signing in again works
  });

  it('ends everywhere else when a parent changes their password, and this device gets a fresh session', async () => {
    const spy = vi.spyOn(auth, 'signIn');
    const otherPhone = await signIn('u_keisha');
    as('u_keisha');
    const r = ok(await families.changePassword({ currentPassword: 'mentoring-demo-2026', newPassword: 'keisha-new-password' }));
    expect(r).toEqual({ changed: true, signInAgain: false });
    expect(spy).toHaveBeenCalledWith('credentials', { email: 'keisha.brooks@example.com', password: 'keisha-new-password', redirect: false });
    expect(await later(otherPhone)).toBeNull();
    spy.mockRestore();
  });

  it('a wrong current password changes nothing, and signs nobody out', async () => {
    const phone = await signIn('u_tom');
    as('u_tom');
    fails(await families.changePassword({ currentPassword: 'not-it', newPassword: 'tom-new-password' }), 'INVALID');
    expect(await later(phone)).not.toBeNull();
  });

  it('of whoever registered a parent’s email first ends when the real owner signs in with Google', async () => {
    const squatter = await db.user.create({ data: { email: 'owner@example.com', name: 'X', passwordHash: 'set-by-someone-else' } });
    const theirs = await signIn(squatter.id);
    await secureLinkedAccount(squatter.id);
    expect(await later(theirs)).toBeNull();
    expect(await signIn(squatter.id)).toMatchObject({ sv: 1 }); // the owner's own Google sign-in
  });

  it('ends when the account is removed', async () => {
    const u = await db.user.create({ data: { email: 'gone@example.com', name: 'Gone' } });
    const token = await signIn(u.id);
    await db.user.delete({ where: { id: u.id } });
    expect(await later(token)).toBeNull();
  });
});
