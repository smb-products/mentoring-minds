import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { loadDemo, truncateAll } from '../../../prisma/data';

let client: PrismaClient | undefined;

/** The e2e database, for checking what a screen saved. Same data the server uses. */
export function e2eDb() {
  const url = process.env.E2E_DATABASE_URL!;
  if (!/test/i.test(new URL(url).pathname)) throw new Error(`E2E_DATABASE_URL's database name must contain "test" (got ${url}).`);
  return (client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) }));
}

/** Back to the demo data (the prototype's families, same ids). Placeholder files go in ./uploads. */
export async function resetDemo() {
  const db = e2eDb();
  await truncateAll(db);
  await loadDemo(db);
}

export async function closeDb() {
  await client?.$disconnect();
  client = undefined;
}
