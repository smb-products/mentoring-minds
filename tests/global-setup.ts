/**
 * Creates the test database tables from prisma/migrations before the tests run,
 * so `npm test` needs only an empty Postgres database (no Prisma CLI step).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5432/mm_test';
  if (!/test/i.test(new URL(url).pathname)) throw new Error(`The test database name must contain "test" (got ${url}).`);
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`Can't reach the test database at ${url}. Start Postgres and create it (createdb mm_test), or set TEST_DATABASE_URL. (${(e as Error).message})`);
  }
  try {
    const dir = path.join(process.cwd(), 'prisma', 'migrations');
    const migrations = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    await client.query('CREATE TABLE IF NOT EXISTS "_test_migrations" (name text PRIMARY KEY)');
    const done = new Set((await client.query('SELECT name FROM "_test_migrations"')).rows.map((r) => r.name));
    // A database migrated by `prisma migrate deploy` (CI) is already up to date.
    const prisma = await client.query(`SELECT to_regclass('public."_prisma_migrations"') AS t`);
    if (prisma.rows[0].t) return;
    for (const m of migrations.filter((x) => !done.has(x))) {
      await client.query(await readFile(path.join(dir, m, 'migration.sql'), 'utf8'));
      await client.query('INSERT INTO "_test_migrations" (name) VALUES ($1)', [m]);
    }
  } finally {
    await client.end();
  }
}
