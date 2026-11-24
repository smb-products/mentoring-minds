/**
 * npm run db:seed        → day-one data for production: settings (Miami time, FAST
 *                          windows), Math + Vienne's skills, the books (tests only),
 *                          locations, weekly hours, and Vienne's admin account.
 * npm run db:seed:demo   → the same plus the prototype's demo families (development only).
 *
 * Admin account: ADMIN_EMAIL (her Google address, for Google sign-in), ADMIN_NAME,
 * and optionally ADMIN_PASSWORD for email sign-in.
 */
process.env.TZ ??= 'America/New_York'; // the demo's "3:30 PM" means Miami time

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { DEMO_CODES, DEMO_PASSWORD, ensureAdmin, loadDemo, loadReference } from './data';

const demo = process.argv.includes('--demo');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (demo && (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') && !process.argv.includes('--force')) {
    throw new Error('Refusing to load demo families into production. (Add --force if you really mean it.)');
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    if (demo) {
      await loadDemo(db);
      console.log(`Demo loaded. Sign in as vienne@example.com or any demo parent (e.g. ana.mendoza@example.com) with password: ${DEMO_PASSWORD}`);
      console.log(`Demo invite codes: ${Object.values(DEMO_CODES).join(', ')} (some are used or expired on purpose)`);
    } else {
      await loadReference(db);
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
