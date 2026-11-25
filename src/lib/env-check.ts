/**
 * The settings a production server needs (docs/DEPLOY.md). Used by src/instrumentation.ts
 * at startup; a pure function, so tests can check it without a server.
 */
export function productionProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const onVercelProduction = env.VERCEL_ENV === 'production';

  if (env.DEMO_MODE === 'true') {
    // A throwaway demo deploy is fine; the real site never runs without sign-in.
    if (onVercelProduction) problems.push('DEMO_MODE is "true" on the production deployment: that turns sign-in off. Remove it.');
    return problems;
  }

  if (!env.DATABASE_URL) problems.push('DATABASE_URL is not set (Neon’s pooled connection string).');
  if (!env.AUTH_SECRET) problems.push('AUTH_SECRET is not set (make one with `npx auth secret`).');
  else if (env.AUTH_SECRET.length < 32) problems.push('AUTH_SECRET is too short: use at least 32 random characters (`npx auth secret`).');
  if (!env.INVITE_PEPPER) problems.push('INVITE_PEPPER is not set: invite codes can’t be checked without it.');
  if (Boolean(env.AUTH_GOOGLE_ID) !== Boolean(env.AUTH_GOOGLE_SECRET)) problems.push('Set both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, or neither (Google sign-in stays off).');

  if (onVercelProduction) {
    if (!env.BLOB_READ_WRITE_TOKEN) problems.push('BLOB_READ_WRITE_TOKEN is not set: connect a private Vercel Blob store to the project.');
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 16) problems.push('CRON_SECRET is missing or shorter than 16 characters: the daily reminders would be refused.');
    if (env.ALLOW_LOCAL_UPLOADS === 'true') problems.push('ALLOW_LOCAL_UPLOADS is "true": Vercel’s disk is wiped between requests, so uploads would vanish. Remove it.');
  }
  return problems;
}
