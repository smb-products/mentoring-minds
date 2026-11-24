import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * The database client (Postgres via the `pg` driver, no Prisma engine binary).
 *
 * Nothing connects until the first query, so the app builds and the demo UI runs
 * with no database. In production, DATABASE_URL is Neon's *pooled* connection
 * string (the host has "-pooler"), which suits serverless functions; migrations use
 * DIRECT_URL (see prisma/schema.prisma).
 *
 * One client per process, reused across hot reloads in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set. See .env.example.');
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
}

function client(): PrismaClient {
  return (globalForPrisma.prisma ??= createClient());
}

export const db = new Proxy({} as PrismaClient, {
  get: (_target, key) => {
    const value = Reflect.get(client(), key);
    return typeof value === 'function' ? value.bind(client()) : value;
  },
});

/** Prisma's transaction client type, for helpers that run inside db.$transaction. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
