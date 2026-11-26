'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { MAX_PASSWORD } from '@/lib/auth-rules';
import { db } from '@/lib/db';

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

/** New parents start as PREVIEW: they see a locked app until they enter Vienne's invite code. */
export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
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
