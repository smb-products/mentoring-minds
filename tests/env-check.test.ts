import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { productionProblems } from '@/lib/env-check';

const good = {
  DATABASE_URL: 'postgresql://x',
  AUTH_SECRET: 'x'.repeat(44),
  INVITE_PEPPER: 'pepper',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_x',
  CRON_SECRET: 'c'.repeat(20),
  VERCEL_ENV: 'production',
};

describe('production settings check', () => {
  it('a complete production setup passes', () => {
    expect(productionProblems(good)).toEqual([]);
  });

  it('has no switch that skips the checks: sign-in is always on', () => {
    // The retired scaffold switch (S6) no longer changes anything, even if an old .env still sets it.
    const retired = { ['DEMO' + '_MODE']: 'true' };
    expect(productionProblems({ ...good, ...retired })).toEqual([]);
    expect(productionProblems({ ...retired, VERCEL_ENV: 'preview' }).join('\n')).toMatch(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*INVITE_PEPPER/);
    expect(readFileSync('src/lib/env-check.ts', 'utf8')).not.toMatch(/DEMO/);
  });

  it('names each missing or weak secret', () => {
    const problems = productionProblems({ VERCEL_ENV: 'production', AUTH_SECRET: 'short', AUTH_GOOGLE_ID: 'id-only', ALLOW_LOCAL_UPLOADS: 'true' });
    expect(problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(problems.join('\n')).toMatch(/AUTH_SECRET is too short/);
    expect(problems.join('\n')).toMatch(/INVITE_PEPPER/);
    expect(problems.join('\n')).toMatch(/both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET/);
    expect(problems.join('\n')).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(problems.join('\n')).toMatch(/CRON_SECRET/);
    expect(problems.join('\n')).toMatch(/ALLOW_LOCAL_UPLOADS/);
  });

  it('outside Vercel production (CI, a local production build) only the core secrets are required', () => {
    expect(productionProblems({ DATABASE_URL: 'x', AUTH_SECRET: 'x'.repeat(32), INVITE_PEPPER: 'p' })).toEqual([]);
  });
});

describe('the scaffold switch is retired (S6)', () => {
  const flag = ['DEMO', 'MODE'].join('_');

  it('src/lib/demo.ts is gone and nothing in the app, scripts or tests reads the switch', () => {
    expect(existsSync('src/lib/demo.ts')).toBe(false);
    const args = ['grep', '-n', '-e', flag, '-e', 'is' + 'Demo', '--', 'src', 'scripts', 'playwright.config.ts', 'tests', '.env.example', ':!*.md'];
    const found = spawnSync('git', args, { encoding: 'utf8' });
    expect(found.stdout).toBe('');
  });

  it('.env.example drops the switch and points to the seeded demo accounts', () => {
    const example = readFileSync('.env.example', 'utf8');
    expect(example).not.toMatch(new RegExp(flag));
    expect(example).toMatch(/npm run db:seed:demo[\s\S]*sign in with[\s\S]*demo accounts/);
  });
});
