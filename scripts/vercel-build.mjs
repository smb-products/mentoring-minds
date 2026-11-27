// Vercel build. Previews (any build with a database that isn't production) apply migrations, then build.
// Production never migrates on its own (decision D5, docs/DEPLOY.md → Releasing): Javaris runs
// `prisma migrate deploy` himself. Production goes live automatically once a build is ready (auto-promote,
// Javaris 2026-11-27), so a production build FAILS when the database lacks one of its migrations, or can't be
// reached: a failed build never goes live, and the site stays on the last good deployment. Migrations use
// DIRECT_URL (Neon's unpooled URL). Without a database (a demo build) the migration step is skipped.
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BEHIND =
  'PRODUCTION DATABASE NOT UP TO DATE (or unreachable): this build stops here, so it never goes live and the ' +
  'site stays on the last good deployment. Javaris runs `npx prisma migrate deploy` against production, then ' +
  'redeploys this deployment (docs/DEPLOY.md → Releasing). Production builds never migrate.';

/** What the build does for this environment. Each step is { run }, { check } or { note }. */
export function steps(env) {
  const out = [];
  if (!env.DATABASE_URL) out.push({ note: 'No DATABASE_URL: skipping migrations (demo build).' });
  else if (env.VERCEL_ENV === 'production') out.push({ check: 'npx prisma migrate status' });
  else out.push({ run: 'npx prisma migrate deploy' });
  out.push({ run: 'npx next build' });
  return out;
}

/**
 * Runs the steps. A failed check stops the build: `migrate status` exits non-zero when migrations are pending.
 * @param {Record<string, string | undefined>} env
 * @param {(cmd: string) => unknown} [exec] runs a command, throwing when it fails
 * @param {{ log: (m: string) => void, error: (m: string) => void }} [log]
 * @returns {0 | 1} the build's exit code
 */
export function build(env, exec = (cmd) => execSync(cmd, { stdio: 'inherit' }), log = console) {
  for (const step of steps(env)) {
    if (step.note) log.log(step.note);
    if (step.run) exec(step.run);
    if (step.check) {
      try {
        exec(step.check);
      } catch {
        log.error(`\n*** ${BEHIND} ***\n`);
        return 1;
      }
    }
  }
  return 0;
}

function main() {
  if (process.env.DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.exitCode = build(process.env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
