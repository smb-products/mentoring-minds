import { describe, expect, it } from 'vitest';
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

  it('refuses demo mode on the production deployment, allows it elsewhere', () => {
    expect(productionProblems({ ...good, DEMO_MODE: 'true' })).toEqual([expect.stringMatching(/turns sign-in off/)]);
    expect(productionProblems({ DEMO_MODE: 'true', VERCEL_ENV: 'preview' })).toEqual([]);
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
