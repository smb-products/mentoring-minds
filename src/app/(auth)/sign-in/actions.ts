'use server';

import bcrypt from 'bcryptjs';
import { AuthError } from 'next-auth';
import { z } from 'zod';
import { signIn, signOut } from '@/lib/auth';
import { db } from '@/lib/db';
import { DEMO_MODE } from '@/lib/demo';
import { redirect } from 'next/navigation';

export type FormState = { error?: string } | undefined;

/** The scaffold has no sign-in: the screen can be viewed, but Google goes straight to the demo and the email form explains. */
const DEMO_OFF: FormState = { error: 'Sign-in is off in the demo. Open the app at /admin/today or /parent/home.' };

export async function signInWithGoogle() {
  if (DEMO_MODE) redirect('/admin/today');
  await signIn('google', { redirectTo: '/' });
}

const signInSchema = z.object({ email: z.email('Enter your email'), password: z.string().min(1, 'Enter your password') });

export async function signInWithPassword(_: FormState, form: FormData): Promise<FormState> {
  if (DEMO_MODE) return DEMO_OFF;
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
  password: z.string().min(8, 'Use at least 8 characters'),
});

/** New parents start as PREVIEW: they see a locked app until they enter Vienne's invite code. */
export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  if (DEMO_MODE) return DEMO_OFF;
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
  if (DEMO_MODE) redirect('/admin/today');
  await signOut({ redirectTo: '/sign-in' });
}
