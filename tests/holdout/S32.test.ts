/** S32 holdouts: a hidden character late in the file, on a first seed, and through the real command. Made-up places only. */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../integration/helpers';
import { LOCATION_NAME_MAX, seedReference, truncateAll } from '../../prisma/data';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mm-s32-holdout-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await truncateAll(db as never);
});

const write = async (name: string, text: string) => {
  const p = path.join(dir, name);
  await writeFile(p, text);
  return p;
};
const refusal = (locationsFile: string) =>
  seedReference(db as never, { locationsFile }).then(
    () => 'accepted',
    (e: Error) => e.message,
  );
const nothingSaved = async () => {
  const counts = [await db.settings.count(), await db.location.count(), await db.subject.count(), await db.book.count(), await db.availability.count(), await db.tag.count()];
  expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
};
const good = (i: number) => ({ name: `Example Place ${i}`, kind: 'LIBRARY', address: `${i} Example St` });

describe('S32 holdouts', () => {
  it('the real command, with a line ending in the third address, names the entry and field only and saves nothing', async () => {
    const file = await write('crlf.json', JSON.stringify([good(1), good(2), { name: 'Hidden Hall', kind: 'LIBRARY', address: '77 Secret Rd\r\n' }]));
    const failed = await promisify(execFile)(path.resolve('node_modules/.bin/tsx'), ['prisma/seed.ts'], { env: { ...process.env, SEED_LOCATIONS_FILE: file } }).then(
      () => null,
      (e: { code: number; stdout: string; stderr: string }) => e,
    );
    expect(failed?.code).toBe(1);
    const output = failed!.stdout + failed!.stderr;
    expect(output).toContain('location 3’s address');
    expect(output).toContain('Nothing was saved');
    expect(output).not.toMatch(/Secret Rd|Hidden Hall|Example Place|Example St|22021|byte sequence/i);
    await nothingSaved();
  }, 60_000);

  it('a control character in the last of 50 entries, past the length limit or alone, is refused with nothing saved', async () => {
    const rest = Array.from({ length: 49 }, (_, i) => good(i + 1));
    const bad = [
      { entry: { name: `Hidden${'x'.repeat(LOCATION_NAME_MAX)}\u0000`, kind: 'LIBRARY' }, says: 'location 50’s name' },
      { entry: { name: '\u0000', kind: 'LIBRARY' }, says: 'location 50’s name' },
      { entry: { name: 'Hidden Hall', kind: 'LIBRARY', address: '\u001f' }, says: 'location 50’s address' },
    ];
    for (const [i, { entry, says }] of bad.entries()) {
      const message = await refusal(await write(`bad-${i}.json`, JSON.stringify([...rest, entry])));
      expect(message).toContain(says);
      expect(message).not.toMatch(/Hidden Hall|Hiddenx|Example Place/);
      await nothingSaved();
    }
  });

  it('a raw NUL typed straight into the file is refused without quoting it, with nothing saved', async () => {
    const message = await refusal(await write('raw.json', '[{"name":"Hidden\u0000Hall","kind":"LIBRARY"}]'));
    expect(message).toContain('Nothing was saved');
    expect(message).not.toMatch(/Hidden/);
    await nothingSaved();
  });
});
