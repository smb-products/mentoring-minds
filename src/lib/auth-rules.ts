import { db } from './db';

/**
 * After a Google login is linked to an existing account by email: if that account's
 * email was never verified (an email/password sign-up), someone else may have
 * registered with this address first. Google has now proved who owns it, so the
 * unverified password is removed and the email marked verified.
 */
export async function secureLinkedAccount(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true, passwordHash: true } });
  if (u && !u.emailVerified) await db.user.update({ where: { id: userId }, data: { emailVerified: new Date(), ...(u.passwordHash && { passwordHash: null }) } });
}
