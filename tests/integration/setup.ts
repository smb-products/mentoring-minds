import { vi } from 'vitest';

// Vienne's time zone, so the prototype data's "3:30 PM" means Miami time here too.
process.env.TZ = 'America/New_York';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/mm_test';
process.env.AUTH_SECRET ??= 'test-auth-secret-0123456789abcdef';
process.env.INVITE_PEPPER ??= 'test-pepper';
process.env.DATABASE_POOL_MAX ??= '4';
delete process.env.BLOB_READ_WRITE_TOKEN; // tests use the local storage driver
delete process.env.ANTHROPIC_API_KEY;

if (!/test/i.test(new URL(process.env.DATABASE_URL).pathname)) {
  throw new Error(`Refusing to run: the test database name must contain "test" (got ${process.env.DATABASE_URL}). Every test file empties it.`);
}

/** The signed-in user for the next server call (see helpers.as). */
const actor = vi.hoisted(() => ({ id: null as string | null }));
(globalThis as unknown as { __actor: typeof actor }).__actor = actor;

vi.mock('@/lib/auth', () => ({
  auth: async () => (actor.id ? { user: { id: actor.id } } : null),
  signIn: async () => undefined,
  signOut: async () => undefined,
  handlers: {},
}));
