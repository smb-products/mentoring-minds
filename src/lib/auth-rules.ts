import type { JWT } from '@auth/core/jwt';
import { db } from './db';

/** The longest password anyone can set or sign in with: sign-up, sign-in and changePassword all use it. */
export const MAX_PASSWORD = 200;

/**
 * The session check on every request. Copies the account's role, status and text size
 * into the session. Returns null (signs the session out) when the account is gone, or
 * when its sessionVersion moved on since this session was issued: the password was
 * changed or reset, or a Google sign-in took the address back from whoever registered it.
 */
export async function refreshToken(token: JWT, user?: { id?: string | null }): Promise<JWT | null> {
  const id = (user?.id ?? token.sub) as string | undefined;
  if (!id) return token;
  const fresh = await db.user.findUnique({
    where: { id },
    select: { role: true, status: true, textSize: true, name: true, mustChangePassword: true, sessionVersion: true },
  });
  if (!fresh) return null;
  const sv = user ? fresh.sessionVersion : (token.sv ?? 0); // a new sign-in takes the current version
  if (sv !== fresh.sessionVersion) return null;
  return { ...token, sub: id, sv, role: fresh.role, status: fresh.status, textSize: fresh.textSize, name: fresh.name, mustChangePassword: fresh.mustChangePassword };
}

/**
 * After a Google login is linked to an existing account by email: if that account's
 * email was never verified (an email/password sign-up), someone else may have
 * registered with this address first. Google has now proved who owns it, so the
 * unverified password is removed (signing out any session it opened) and the email marked
 * verified.
 */
export async function secureLinkedAccount(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true, passwordHash: true } });
  if (u && !u.emailVerified) {
    await db.user.update({
      where: { id: userId },
      // Bumping sessionVersion also signs out whoever registered the address first.
      data: { emailVerified: new Date(), ...(u.passwordHash && { passwordHash: null, sessionVersion: { increment: 1 } }) },
    });
  }
}
