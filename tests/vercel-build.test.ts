import { describe, expect, it } from 'vitest';
import { steps } from '../scripts/vercel-build.mjs';

const url = 'postgresql://u@db.example/mm';

describe('vercel-build (decision D5: production never migrates on its own)', () => {
  it('a production build only checks migration status, then builds', () => {
    const s = steps({ DATABASE_URL: url, VERCEL_ENV: 'production' });
    expect(s).toEqual([{ check: 'npx prisma migrate status' }, { run: 'npx next build' }]);
    expect(JSON.stringify(s)).not.toContain('migrate deploy');
  });

  it('a preview build applies migrations to its own database first', () => {
    expect(steps({ DATABASE_URL: url, VERCEL_ENV: 'preview' })).toEqual([
      { run: 'npx prisma migrate deploy' },
      { run: 'npx next build' },
    ]);
  });

  it('a build without a database skips migrations', () => {
    const s = steps({ VERCEL_ENV: 'production' });
    expect(s[0]).toHaveProperty('note');
    expect(s.slice(1)).toEqual([{ run: 'npx next build' }]);
  });
});
