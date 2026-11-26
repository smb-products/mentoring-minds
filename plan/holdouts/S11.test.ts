/**
 * S11 holdouts: the real command, as a shell would run it. Every host ends in .invalid (it never resolves)
 * and any local-looking address uses port 1, so no database is ever touched.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const REFUSED = /Refusing to load the demo families/;
const SECRET = 'holdout-s11-password';

function run(command: string, args: string[], url: string, extra: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'development', DATABASE_URL: url, DIRECT_URL: url, ...extra };
  if (!('VERCEL_ENV' in extra)) delete env.VERCEL_ENV;
  const r = spawnSync(command, args, { env: env as NodeJS.ProcessEnv, encoding: 'utf8', timeout: 25_000 });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}
const seedDemo = (url: string, extra?: Record<string, string>, flags: string[] = []) =>
  run('npm', ['run', 'db:seed:demo', ...(flags.length ? ['--', ...flags] : [])], url, extra);

function expectRefused(r: ReturnType<typeof run>, label: string) {
  expect(r.code, label).not.toBe(0);
  expect(r.out, label).toMatch(REFUSED);
  expect(r.out, label).toContain('--force');
  expect(r.out, label).not.toContain('Demo loaded');
  expect(r.out, label).not.toContain(SECRET);
}

describe('S11 holdouts: npm run db:seed:demo', () => {
  it('is not fooled by safe words or "localhost" anywhere but the host and the database name', () => {
    const urls = {
      'user, host name and query say dev/test/demo/preview': `postgresql://testdemo:${SECRET}@dev-preview.example.invalid:5432/neondb?application_name=test&schema=demo`,
      'a host that only starts with localhost': `postgresql://u:${SECRET}@localhost.example.invalid:5432/neondb`,
      'a user called localhost': `postgresql://localhost:${SECRET}@db.example.invalid:5432/neondb`,
      'no database name': `postgresql://u:${SECRET}@db.example.invalid:5432/`,
      'not an address at all': `host=db.example.invalid password=${SECRET} dbname=neondb`,
    };
    for (const [label, url] of Object.entries(urls)) expectRefused(seedDemo(url), label);
  }, 90_000);

  it('judges the host it would really connect to, when ?host= replaces the one before the path', () => {
    const r = seedDemo(`postgresql://u:${SECRET}@localhost:1/neondb?host=db.example.invalid`);
    expectRefused(r, '?host= points somewhere remote');
  }, 40_000);

  it('refuses in a production shell even for a test-named database; --force goes past; plain seed never refuses', () => {
    const testNamed = `postgresql://u:${SECRET}@db.example.invalid:5432/mm_test`;
    expectRefused(seedDemo(testNamed, { VERCEL_ENV: 'production' }), 'VERCEL_ENV');
    expectRefused(seedDemo(testNamed, { NODE_ENV: 'production' }), 'NODE_ENV');

    const remote = `postgresql://u:${SECRET}@db.example.invalid:5432/neondb`;
    // Past the guard, the only thing left to fail is reaching a host that doesn't exist.
    for (const [label, r] of [
      ['--force', seedDemo(remote, {}, ['--force'])],
      ['no --demo', run('node_modules/.bin/tsx', ['prisma/seed.ts'], remote, { VERCEL_ENV: 'production' })],
    ] as const) {
      expect(r.code, label).not.toBe(0);
      expect(r.out, label).not.toMatch(REFUSED);
      expect(r.out, label).toMatch(/db\.example\.invalid|ENOTFOUND|reach database/i);
    }
  }, 90_000);
});
