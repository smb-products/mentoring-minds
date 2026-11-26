/**
 * npm run db:seed        → day-one data for production: settings (Miami time, FAST
 *                          windows), Math + Vienne's skills, the books (tests only),
 *                          weekly hours, Vienne's admin account, and her real locations from
 *                          SEED_LOCATIONS_FILE (a JSON file outside the repo; required while
 *                          the database has no location yet). No demo location is added.
 * npm run db:seed:demo   → the same with the demo locations, plus the prototype's demo
 *                          families (development only).
 *                          Refuses, before connecting, unless DATABASE_URL is local or its
 *                          database name says test, dev, demo or preview (see demoSeedRefusal).
 *
 * Admin account: ADMIN_EMAIL (her Google address, for Google sign-in), ADMIN_NAME,
 * and optionally ADMIN_PASSWORD for email sign-in.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DEMO_CODES, DEMO_PASSWORD, ensureAdmin, loadDemo, seedReference } from './data';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SAFE_NAME = /test|dev|demo|preview/i;

/**
 * Whether the demo seed may load the demo families into `url`. Returns the refusal
 * message, or null when it may go ahead. Pure: it never connects to anything.
 * The host judged is the one pg really connects to: ?host= when set, else the URL's host.
 * Allowed: a local host (localhost, 127.0.0.1, ::1, a Unix socket) or a database name
 * containing test, dev, demo or preview, unless VERCEL_ENV or NODE_ENV is production.
 * `--force` overrides all of it.
 */
export function demoSeedRefusal(url: string | undefined, env: Record<string, string | undefined>, argv: readonly string[]): string | null {
  if (argv.includes('--force')) return null;
  const force = 'If you’re sure, run it again with --force: npm run db:seed:demo -- --force';
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return `Refusing to load the demo families: this shell says it’s production (VERCEL_ENV or NODE_ENV is "production"). ${force}`;
  }
  let host = '';
  let name = '';
  try {
    const u = new URL(url ?? '');
    // pg connects to ?host= when it's set (the last one wins), not to the host before the path.
    const query = u.searchParams.getAll('host').at(-1);
    host = (query || decodeURIComponent(u.hostname)).toLowerCase();
    name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  } catch {
    return `Refusing to load the demo families: DATABASE_URL isn’t a database address I can read, so I can’t tell it isn’t production. ${force}`;
  }
  if (LOCAL_HOSTS.has(host) || host.startsWith('/')) return null;
  if (SAFE_NAME.test(name)) return null;
  return (
    `Refusing to load the demo families: the database "${name || '(none)'}" on ${host || '(no host)'} doesn’t look like a dev, test or preview database. ` +
    `The demo seed only runs on a local database, or one whose name has test, dev, demo or preview in it. ${force}`
  );
}

const demo = process.argv.includes('--demo');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (demo) {
    const refusal = demoSeedRefusal(url, process.env, process.argv);
    if (refusal) throw new Error(refusal);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    if (demo) {
      await loadDemo(db);
      console.log(`Demo loaded. Sign in as vienne@example.com or any demo parent (e.g. ana.mendoza@example.com) with password: ${DEMO_PASSWORD}`);
      console.log(`Demo invite codes: ${Object.values(DEMO_CODES).join(', ')} (some are used or expired on purpose)`);
    } else {
      // Checks SEED_LOCATIONS_FILE before anything is written.
      console.log(await seedReference(db, { locationsFile: process.env.SEED_LOCATIONS_FILE }));
      const email = process.env.ADMIN_EMAIL;
      if (email) {
        await ensureAdmin(db, { email, name: process.env.ADMIN_NAME ?? 'Vienne Elliott', password: process.env.ADMIN_PASSWORD });
        console.log(`Reference data loaded. Admin: ${email}`);
      } else {
        console.log('Reference data loaded. Set ADMIN_EMAIL (and ADMIN_NAME) and run again to create Vienne’s account.');
      }
    }
  } finally {
    await db.$disconnect();
  }
}

// Run only as a script (tsx prisma/seed.ts), not when a test imports demoSeedRefusal.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.env.TZ ??= 'America/New_York'; // the demo's "3:30 PM" means Miami time
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
