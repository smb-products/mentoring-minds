'use server';

import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { MAX_PASSWORD } from '@/lib/auth-rules';
import { clientIp } from '@/lib/client-ip';
import { db } from '@/lib/db';
import { adminAlertsInTx } from '@/lib/notify';

export type FormState = { error?: string } | undefined;

export async function signInWithGoogle() {
  await signIn('google', { redirectTo: '/' });
}

const signInSchema = z.object({ email: z.email('Enter your email'), password: z.string().min(1, 'Enter your password') });

export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Go straight to the right home: a second redirect from "/" would leave the address bar on "/".
  const who = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { role: true } });
  const home = who?.role === 'ADMIN' ? '/admin/today' : '/parent/home';
  try {
    await signIn('credentials', { ...parsed.data, redirectTo: home });
  } catch (e) {
    if (e instanceof AuthError) return { error: 'That email and password don’t match. After 5 tries, password sign-in pauses for 15 minutes.' };
    throw e; // the redirect
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  email: z.email('Enter your email'),
  password: z.string().min(8, 'Use at least 8 characters').max(MAX_PASSWORD, 'That password is too long'),
});

/** S36: email sign-ups from one visitor's IP (stored only as a hash) in an hour. Google sign-up isn't counted. */
const SIGNUPS_PER_IP_PER_HOUR = 5;
/** S36: email sign-ups from everyone in an hour. At it, sign-up pauses for the hour and Vienne gets one alert. */
const SIGNUPS_PER_HOUR = 30;

const HOUR_MS = 60 * 60 * 1000;
/** One sign-up count at a time, so two at once can't both take the last slot. */
const SIGNUPS_LOCK = 7_300_530_003;
const SIGNUPS_PAUSED = 'SIGNUPS_PAUSED';
const TOO_MANY = 'Too many new accounts from here. Try again in an hour, or sign in if you already have one.';
const hashIp = (ip: string | null) => createHash('sha256').update(`${ip ?? 'unknown'}:${process.env.INVITE_PEPPER ?? ''}`).digest('hex');

/** Counts this sign-up (SignupAttempt), or refuses it past a limit. Returns the refusal's message, if any. */
async function countSignup(): Promise<string | null> {
  const ipHash = hashIp(await clientIp());
  const now = new Date();
  const recent = { createdAt: { gt: new Date(now.getTime() - HOUR_MS) } };
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SIGNUPS_LOCK})`;
    if ((await tx.signupAttempt.count({ where: recent })) >= SIGNUPS_PER_HOUR) {
      // The first refusal in an hour tells Vienne. Written under the lock, so it's sent once.
      const told = await tx.notification.count({ where: { type: SIGNUPS_PAUSED, ...recent } });
      const push = told
        ? null
        : await adminAlertsInTx(tx, {
            type: SIGNUPS_PAUSED,
            title: 'New sign-ups are paused for an hour',
            body: `${SIGNUPS_PER_HOUR} new accounts were made in the last hour, so sign-up is paused until it drops. Nothing for you to do; families can try again later.`,
            href: '/admin/families',
          });
      return { limited: true, push };
    }
    if ((await tx.signupAttempt.count({ where: { ipHash, ...recent } })) >= SIGNUPS_PER_IP_PER_HOUR) return { limited: true, push: null };
    await tx.signupAttempt.create({ data: { ipHash, createdAt: now } });
    return { limited: false, push: null };
  });
  outcome.push?.();
  return outcome.limited ? TOO_MANY : null;
}

/** New parents start as PREVIEW until they add their children (families.addMyChildren, S36) or enter Vienne's
 * invite code. J2 makes them ACTIVE at sign-up, with the Add your child step (the switch moved there, CHANGES). */
export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // Every sign-up that passes the form check counts, a taken email included.
  const limited = await countSignup();
  if (limited) return { error: limited };
  const email = parsed.data.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) return { error: 'There’s already an account with that email. Sign in instead.' };
  await db.user.create({ data: { name: parsed.data.name, email, passwordHash: await bcrypt.hash(parsed.data.password, 12), role: 'PARENT', status: 'PREVIEW' } });
  try {
    await signIn('credentials', { email, password: parsed.data.password, redirectTo: '/parent/home' });
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Account created. Please sign in.' };
    throw e;
  }
}

/** The account menu's "Sign out". Ends the session and goes back to the sign-in screen. */
export async function signOutNow() {
  await signOut({ redirectTo: '/sign-in' });
}
