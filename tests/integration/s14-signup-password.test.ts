/**
 * S14 (finding S-sec2 from the P-sec audit): sign-up caps the password at MAX_PASSWORD,
 * as sign-in and changePassword do. Before, a 201+ character password made an account
 * that could never sign in by password.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import { DEMO_PASSWORD } from '../../prisma/data';
import { MAX_PASSWORD } from '@/lib/auth-rules';
import { createAccount } from '@/app/(auth)/sign-in/actions';
import * as families from '@/server/families';

/** The Auth.js config lib/auth.ts builds, so the real password check can run (setup.ts mocks lib/auth). */
const authConfig = vi.hoisted(() => ({ current: null as null | { providers: { id: string; options?: { authorize?: (raw: unknown) => Promise<unknown> } }[] } }));
vi.mock('next-auth', () => ({
  // Only the config is needed: the real NextAuth() reaches for Next.js's request internals.
  default: (config: never) => {
    authConfig.current = config;
    return { handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined };
  },
  AuthError: class AuthError extends Error {},
}));

freshDemo();

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const authorize = async () => {
  await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  const fn = authConfig.current?.providers.find((p) => p.id === 'credentials')?.options?.authorize;
  expect(fn, 'the Credentials provider in lib/auth.ts').toBeTypeOf('function');
  return fn!;
};

describe('S14: one MAX_PASSWORD for sign-up, sign-in and changePassword', () => {
  it('is 200, and the three schemas use it with no bare 200 left', () => {
    expect(MAX_PASSWORD).toBe(200);
    const files = {
      'src/app/(auth)/sign-in/actions.ts': /createSchema[\s\S]*?password: z\.string\(\)[^\n]*\.max\(MAX_PASSWORD, 'That password is too long'\)/,
      'src/lib/auth.ts': /credentialsSchema = [^\n]*password: z\.string\(\)\.min\(1\)\.max\(MAX_PASSWORD\)/,
      'src/server/families.ts': /currentPassword: z\.string\(\)\.max\(MAX_PASSWORD\)[^\n]*newPassword: z\.string\(\)[^\n]*\.max\(MAX_PASSWORD, 'That password is too long'\)/,
    };
    for (const [file, uses] of Object.entries(files)) {
      const src = read(file);
      expect(src, file).toMatch(uses);
      expect(src, file).toMatch(/import \{[^}]*\bMAX_PASSWORD\b[^}]*\} from '(@\/lib|\.)\/auth-rules'/);
      for (const line of src.split('\n').filter((l) => /assword/.test(l))) expect(line, `${file}: ${line.trim()}`).not.toMatch(/\b200\b/);
    }
  });

  it('sign-up refuses MAX_PASSWORD + 1 characters and creates no account', async () => {
    const email = 's14.long@example.com';
    const res = await createAccount(undefined, form({ name: 'Too Long', email, password: 'x'.repeat(MAX_PASSWORD + 1) }));
    expect(res).toEqual({ error: 'That password is too long' });
    expect(await db.user.findUnique({ where: { email } })).toBeNull();
  });

  it('exactly MAX_PASSWORD characters still signs up, and then signs in', async () => {
    const email = 's14.max@example.com';
    const password = 'y'.repeat(MAX_PASSWORD);
    expect(await createAccount(undefined, form({ name: 'Max Length', email, password }))).toBeUndefined();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ role: 'PARENT', status: 'ACTIVE' });
    expect(await bcrypt.compare(password, user.passwordHash!)).toBe(true);
    const signIn = await authorize();
    expect(await signIn({ email, password })).toMatchObject({ email });
  });

  it('sign-up is otherwise unchanged: the short-password and taken-email messages', async () => {
    expect(await createAccount(undefined, form({ name: 'Short', email: 's14.short@example.com', password: 'short' }))).toEqual({ error: 'Use at least 8 characters' });
    expect(await db.user.findUnique({ where: { email: 's14.short@example.com' } })).toBeNull();
    expect(await createAccount(undefined, form({ name: 'Again', email: 's14.max@example.com', password: 'another-password' }))).toEqual({
      error: 'There’s already an account with that email. Sign in instead.',
    });
  });

  it('sign-in refuses MAX_PASSWORD + 1 characters without counting a try', async () => {
    const signIn = await authorize();
    const daniel = await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } });
    expect(await signIn({ email: daniel.email, password: 'z'.repeat(MAX_PASSWORD + 1) })).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).failedLogins).toBe(daniel.failedLogins);
    expect(await signIn({ email: daniel.email, password: DEMO_PASSWORD })).toMatchObject({ email: daniel.email });
  });

  it('changePassword: signed out is refused; MAX_PASSWORD + 1 is too long; MAX_PASSWORD is set', async () => {
    as(null);
    fails(await families.changePassword({ currentPassword: DEMO_PASSWORD, newPassword: 'w'.repeat(MAX_PASSWORD) }), 'UNAUTHENTICATED');
    as('u_keisha');
    fails(await families.changePassword({ currentPassword: DEMO_PASSWORD, newPassword: 'w'.repeat(MAX_PASSWORD + 1) }), 'INVALID', /That password is too long/);
    ok(await families.changePassword({ currentPassword: DEMO_PASSWORD, newPassword: 'w'.repeat(MAX_PASSWORD) }));
    const keisha = await db.user.findUniqueOrThrow({ where: { id: 'u_keisha' } });
    expect(await bcrypt.compare('w'.repeat(MAX_PASSWORD), keisha.passwordHash!)).toBe(true);
  });
});
