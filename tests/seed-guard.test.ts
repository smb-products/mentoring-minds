import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { demoSeedRefusal } from '../prisma/seed';

// None of these databases is ever connected to: demoSeedRefusal only reads the URL.
const DEMO = ['node', 'prisma/seed.ts', '--demo'];
const FORCE = [...DEMO, '--force'];
const PROD_URL = 'postgresql://owner:secret@ep-quiet-river-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('demo seed guard', () => {
  it('allows a local database whatever its name', () => {
    expect(demoSeedRefusal('postgresql://postgres@localhost:5432/mentoring', {}, DEMO)).toBeNull();
    expect(demoSeedRefusal('postgresql://postgres@127.0.0.1/mm', {}, DEMO)).toBeNull();
    expect(demoSeedRefusal('postgresql://postgres@[::1]:5432/mm', {}, DEMO)).toBeNull();
    expect(demoSeedRefusal('postgresql:///mm?host=/var/run/postgresql', {}, DEMO)).toBeNull();
  });

  it('judges ?host=, the host pg really connects to, over the one before the path', () => {
    expect(demoSeedRefusal('postgresql://u:p@localhost:5432/neondb?host=db.example.invalid', {}, DEMO)).toMatch(/on db\.example\.invalid/);
    expect(demoSeedRefusal('postgresql://u:p@localhost/neondb?host=localhost&host=db.example.invalid', {}, DEMO)).toMatch(/^Refusing/);
    expect(demoSeedRefusal('postgresql://u:p@db.example.invalid/neondb?host=127.0.0.1', {}, DEMO)).toBeNull();
    expect(demoSeedRefusal('postgresql://u:p@localhost/neondb?host=', {}, DEMO)).toBeNull();
  });

  it('allows a remote database whose name says test, dev, demo or preview', () => {
    for (const name of ['mm_test', 'mm_dev', 'mm-demo', 'Preview'])
      expect(demoSeedRefusal(`postgresql://u:p@db.example.com:5432/${name}`, {}, DEMO)).toBeNull();
  });

  it('refuses a remote production-looking database, in plain words that mention --force', () => {
    const refusal = demoSeedRefusal(PROD_URL, {}, DEMO);
    expect(refusal).toMatch(/^Refusing to load the demo families/);
    expect(refusal).toMatch(/doesn’t look like a dev, test or preview database/);
    expect(refusal).toContain('npm run db:seed:demo -- --force');
    expect(refusal).not.toContain('secret');
  });

  it('--force overrides the refusal', () => {
    expect(demoSeedRefusal(PROD_URL, {}, FORCE)).toBeNull();
    expect(demoSeedRefusal(PROD_URL, { VERCEL_ENV: 'production' }, FORCE)).toBeNull();
  });

  it('refuses when VERCEL_ENV or NODE_ENV is production, even on a local or test database', () => {
    expect(demoSeedRefusal('postgresql://postgres@localhost/mm_test', { VERCEL_ENV: 'production' }, DEMO)).toMatch(/says it’s production.*--force/);
    expect(demoSeedRefusal('postgresql://u:p@db.example.com/mm_dev', { NODE_ENV: 'production' }, DEMO)).toMatch(/says it’s production/);
    expect(demoSeedRefusal('postgresql://postgres@localhost/mm_test', { VERCEL_ENV: 'preview', NODE_ENV: 'development' }, DEMO)).toBeNull();
  });

  it('refuses a URL it cannot read', () => {
    expect(demoSeedRefusal('not a url', {}, DEMO)).toMatch(/isn’t a database address I can read.*--force/);
  });

  it('npm run db:seed:demo refuses before connecting', async () => {
    // .invalid never resolves, so reaching the database would fail with a different error.
    const tsx = path.resolve('node_modules/.bin/tsx');
    const { VERCEL_ENV: _vercelEnv, ...rest } = process.env;
    const env = { ...rest, NODE_ENV: 'development' as const, DATABASE_URL: 'postgresql://u:p@db.example.invalid:5432/neondb' };
    const run = promisify(execFile)(tsx, ['prisma/seed.ts', '--demo'], { env });
    await expect(run).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Refusing to load the demo families: the database "neondb" on db\.example\.invalid/) });
  }, 30000);
});

describe('production seed locations file (S28)', () => {
  it('npm run db:seed refuses a SEED_LOCATIONS_FILE inside the repo before connecting', async () => {
    // .invalid never resolves, so reaching the database would fail with a different error.
    const tsx = path.resolve('node_modules/.bin/tsx');
    const { SEED_LOCATIONS_FILE: _f, ADMIN_EMAIL: _e, ...rest } = process.env;
    const env = { ...rest, DATABASE_URL: 'postgresql://u:p@db.example.invalid:5432/neondb', SEED_LOCATIONS_FILE: path.resolve('package.json') };
    const run = promisify(execFile)(tsx, ['prisma/seed.ts'], { env });
    await expect(run).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Refusing the locations file: SEED_LOCATIONS_FILE points inside the app’s folder/) });
  }, 30000);
});
