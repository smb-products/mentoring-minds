import { describe, expect, it } from 'vitest';
import { BEHIND, build, steps } from '../scripts/vercel-build.mjs';

const url = 'postgresql://u@db.example/mm';
const quiet = { log: () => {}, error: () => {} };

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

describe('vercel-build with auto-promote: a production build behind the database never goes live', () => {
  it('fails, without building, when production lacks a migration or can’t be reached', () => {
    const ran: string[] = [];
    const errors: string[] = [];
    const exec = (cmd: string) => {
      ran.push(cmd);
      if (cmd.includes('migrate status')) throw new Error('exit 1');
    };
    const code = build({ DATABASE_URL: url, VERCEL_ENV: 'production' }, exec, { log: () => {}, error: (m: string) => errors.push(m) });
    expect(code).toBe(1);
    expect(ran).toEqual(['npx prisma migrate status']);
    expect(errors.join('')).toContain(BEHIND);
  });

  it('builds when production is up to date', () => {
    const ran: string[] = [];
    expect(build({ DATABASE_URL: url, VERCEL_ENV: 'production' }, (cmd: string) => void ran.push(cmd), quiet)).toBe(0);
    expect(ran).toEqual(['npx prisma migrate status', 'npx next build']);
  });

  it('a preview build that fails to migrate still fails the build (as before)', () => {
    const exec = (cmd: string) => {
      if (cmd.includes('migrate deploy')) throw new Error('exit 1');
    };
    expect(() => build({ DATABASE_URL: url, VERCEL_ENV: 'preview' }, exec, quiet)).toThrow();
  });
});
