import { existsSync } from 'node:fs';
import { migrate } from '../global-setup';
import { closeDb, resetDemo } from './support/db';

/** Before the run: tables in the e2e database, the demo data in them, and a production build to serve. */
export default async function setup() {
  if (!process.env.E2E_BASE_URL && !existsSync('.next/BUILD_ID')) {
    throw new Error('No production build. Run `npm run build:e2e` first (and again after changing code).');
  }
  await migrate(process.env.E2E_DATABASE_URL!);
  await resetDemo();
  await closeDb();
}
