import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from './db';
import { MAX_PASSWORD, refreshToken, secureLinkedAccount } from './auth-rules';

/**
 * One sign-in screen: Google, or email + password. New accounts start ACTIVE (S36, open sign-up:
 * the column default), add their children themselves (families.addMyChildren) or enter Vienne's
 * optional invite code. PREVIEW is only on accounts made before that.
 * Kids never have their own login: they use the parent's account.
 */
// Any length is checked (and counted toward the lockout); the 8-character minimum applies when a password is set.
const credentialsSchema = z.object({ email: z.email(), password: z.string().min(1).max(MAX_PASSWORD) });
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5O7pZcRcbxTdsHpEJnPdA6O38D4ZGXy';

const adapter = PrismaAdapter(db);

/** Google sign-in is offered only once its keys are set (docs/DEPLOY.md → Google). */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...adapter,
    // Google can return no display name; the app needs one.
    createUser: ({ id: _id, ...data }) => adapter.createUser!({ ...data, id: '', name: data.name?.trim() || data.email.split('@')[0] }),
  },
  session: { strategy: 'jwt' }, // required for the Credentials provider
  // Failures (a Google account with an unverified email, a misconfigured provider) come back to
  // our sign-in screen with ?error=…, not Auth.js's unbranded error page.
  pages: { signIn: '/sign-in', error: '/sign-in' },
  providers: [
    // Linking by email lets Vienne (created by the seed with her Google address) sign in
    // with Google. Safe because Google verifies the address (checked in signIn below), and
    // linking wipes any password someone set on that email without verifying it (events).
    ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
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
    // Read fresh on every request: pausing an account or redeeming a code takes effect right away,
    // and a password change or reset signs out every session issued before it (auth-rules.ts).
    jwt: ({ token, user }) => refreshToken(token, user),
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

declare module '@auth/core/jwt' {
  interface JWT {
    /** The account's sessionVersion when this session was issued. */
    sv?: number;
  }
}
