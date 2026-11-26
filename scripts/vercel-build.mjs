// Vercel build. Previews (any build with a database that isn't production) apply migrations, then build.
// Production never migrates on its own (decision D5, docs/DEPLOY.md → Releasing): Javaris runs
// `prisma migrate deploy` before promoting a release that has a migration. The production build only
// reports whether the database is behind. Migrations use DIRECT_URL (Neon's unpooled URL). Without a
// database (a demo build) the migration step is skipped.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BEHIND =
  'PRODUCTION DATABASE NOT UP TO DATE (or unreachable): this build has migrations production lacks. ' +
  'Before promoting it, Javaris runs `npx prisma migrate deploy` against production ' +
  '(docs/DEPLOY.md → Releasing). Production builds never migrate.';

/** What the build does for this environment. Each step is { run }, { check } or { note }. */
export function steps(env) {
  const out = [];
  if (!env.DATABASE_URL) out.push({ note: 'No DATABASE_URL: skipping migrations (demo build).' });
  else if (env.VERCEL_ENV === 'production') out.push({ check: 'npx prisma migrate status' });
  else out.push({ run: 'npx prisma migrate deploy' });
  out.push({ run: 'npx next build' });
  return out;
}

function main() {
  if (process.env.DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
  for (const step of steps(process.env)) {
    if (step.note) console.log(step.note);
    if (step.run) execSync(step.run, { stdio: 'inherit' });
    if (step.check) {
      // Read-only. `migrate status` exits non-zero when migrations are pending; the build carries on,
      // because the live deployment is untouched until someone promotes this one.
      try {
        execSync(step.check, { stdio: 'inherit' });
      } catch {
        console.warn(`\n*** ${BEHIND} ***\n`);
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
