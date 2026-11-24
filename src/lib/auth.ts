import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db';
import { secureLinkedAccount } from './auth-rules';

/**
 * One sign-in screen: Google, or email + password. New accounts start as PREVIEW
 * (they can look around, locked) until they enter Vienne's invite code.
 * Kids never have their own login: they use the parent's account.
 */
// Any length is checked (and counted toward the lockout); the 8-character minimum applies when a password is set.
const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5O7pZcRcbxTdsHpEJnPdA6O38D4ZGXy';

const adapter = PrismaAdapter(db);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...adapter,
    // Google can return no display name; the app needs one.
    createUser: ({ id: _id, ...data }) => adapter.createUser!({ ...data, id: '', name: data.name?.trim() || data.email.split('@')[0] }),
  },
  session: { strategy: 'jwt' }, // required for the Credentials provider
  pages: { signIn: '/sign-in' },
  providers: [
    // Linking by email lets Vienne (created by the seed with her Google address) sign in
    // with Google. Safe because Google verifies the address (checked in signIn below), and
    // linking wipes any password someone set on that email without verifying it (events).
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user?.passwordHash) {
          await bcrypt.compare(parsed.data.password, DUMMY_HASH); // same timing whether or not the email exists
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;
        if (await bcrypt.compare(parsed.data.password, user.passwordHash)) {
          if (user.failedLogins || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
          return user;
        }
        // 5 wrong passwords in a row lock password sign-in for 15 minutes.
        const failures = user.failedLogins + 1;
        await db.user.update({
          where: { id: user.id },
          data: failures >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLogins: failures },
        });
        return null;
      },
    }),
  ],
  events: {
    linkAccount: ({ user }) => secureLinkedAccount(user.id!),
  },
  callbacks: {
    async signIn({ account, profile }) {
      // Only Google addresses Google has verified.
      if (account?.provider === 'google') return profile?.email_verified === true;
      return true;
    },
    // Role and status are read fresh, so pausing an account or redeeming a code takes effect right away.
    async jwt({ token, user }) {
      const id = (user?.id ?? token.sub) as string | undefined;
      if (!id) return token;
      const fresh = await db.user.findUnique({ where: { id }, select: { role: true, status: true, textSize: true, name: true, mustChangePassword: true } });
      if (!fresh) return null;
      return { ...token, sub: id, role: fresh.role, status: fresh.status, textSize: fresh.textSize, name: fresh.name, mustChangePassword: fresh.mustChangePassword };
    },
    async session({ session, token }) {
      Object.assign(session.user, { id: token.sub, role: token.role, status: token.status, textSize: token.textSize, mustChangePassword: Boolean(token.mustChangePassword) });
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: { id: string; name: string; email: string; image?: string | null; role: 'ADMIN' | 'PARENT'; status: 'PREVIEW' | 'ACTIVE' | 'PAUSED'; textSize: 'NORMAL' | 'LARGE' | 'XLARGE'; mustChangePassword: boolean };
  }
}
