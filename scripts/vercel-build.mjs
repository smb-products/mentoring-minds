// Vercel build: apply database migrations (when a database is configured), then build.
// Migrations use DIRECT_URL (Neon's unpooled URL). Before the database exists — while
// the screens still run on demo data — the migration step is skipped.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
if (process.env.DATABASE_URL) {
  if (!process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;
  run('npx prisma migrate deploy');
} else {
  console.log('No DATABASE_URL: skipping migrations (demo build).');
}
run('npx next build');
