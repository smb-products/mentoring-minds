/** S28 holdouts: wrong input to the production seed. Made-up places only. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../tests/integration/helpers';
import { seedReference, truncateAll } from '../../prisma/data';

const PLACES = [{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St' }];
const made: string[] = [];
let outside: string;

beforeAll(async () => {
  outside = await mkdtemp(path.join(os.tmpdir(), 'mm-s28-holdout-'));
  made.push(outside);
});
afterAll(async () => {
  for (const d of made) await rm(d, { recursive: true, force: true });
});
beforeEach(async () => {
  await truncateAll(db as never);
});

const run = (locationsFile: string) =>
  seedReference(db as never, { locationsFile }).then(
    (line) => ({ accepted: true, text: line }),
    (e: Error) => ({ accepted: false, text: e.message }),
  );
const nothingSaved = async () => {
  expect(await db.settings.count()).toBe(0);
  expect(await db.location.count()).toBe(0);
};

describe('S28 holdouts', () => {
  it('a file inside the checkout is refused even when its folder’s name starts with two dots', async () => {
    const folder = await mkdtemp(path.join(process.cwd(), '..holdout-'));
    made.push(folder);
    const file = path.join(folder, 'locations.json');
    await writeFile(file, JSON.stringify(PLACES));
    expect((await run(file)).accepted, 'a file inside the repo was accepted').toBe(false);
    await nothingSaved();
  });

  it('a file shaped the wrong way round (the place as the field name) is refused without printing the place', async () => {
    const file = path.join(outside, 'wrong-shape.json');
    await writeFile(file, JSON.stringify([{ '1 Example St': 'Example Library' }]));
    const result = await run(file);
    expect(result.accepted).toBe(false);
    expect(result.text).not.toContain('1 Example St');
    expect(result.text).not.toContain('Example Library');
    await nothingSaved();
  });

  it('a linked folder leading to a two-dot folder in the repo is refused, and the command’s whole output names no place', async () => {
    const folder = await mkdtemp(path.join(process.cwd(), '..holdout-'));
    made.push(folder);
    await writeFile(path.join(folder, 'locations.json'), JSON.stringify(PLACES));
    const link = path.join(outside, 'linked-folder');
    await symlink(folder, link);

    const failed = await promisify(execFile)(path.resolve('node_modules/.bin/tsx'), ['prisma/seed.ts'], {
      env: { ...process.env, SEED_LOCATIONS_FILE: path.join(link, 'locations.json') },
    }).then(
      () => null,
      (e: { code: number; stdout: string; stderr: string }) => e,
    );
    expect(failed?.code, 'a link back into the repo was accepted').toBe(1);
    const output = failed!.stdout + failed!.stderr;
    expect(output).toContain('Nothing was saved');
    expect(output).not.toContain('Example Library');
    expect(output).not.toContain('1 Example St');
    await nothingSaved();
  }, 60_000);
});
