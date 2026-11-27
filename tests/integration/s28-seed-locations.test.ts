/**
 * S28: the production seed (npm run db:seed) adds no demo location. It takes the locations
 * from the JSON file SEED_LOCATIONS_FILE names, outside the repo, checks it before writing
 * anything, skips names already there, and prints counts only. Made-up places only.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from './helpers';
import { LOCATION_ADDRESS_MAX, LOCATION_NAME_MAX, NO_LOCATIONS, loadDemo, seedReference, truncateAll } from '../../prisma/data';

const DEMO_NAMES = ['Vienne’s Studio', 'Student’s Home', 'Coral Pines Library'];
const PLACES = [
  { name: 'Example Library', kind: 'LIBRARY', address: '1 Example St' },
  { name: 'Example Studio', kind: 'TUTOR', address: '2 Sample Ave, Suite 9' },
  { name: 'Student’s Home', kind: 'HOME' },
];

let dir: string;
let n = 0;
/** Writes a locations file outside the repo and returns its path. */
async function file(content: unknown) {
  const p = path.join(dir, `locations-${++n}.json`);
  await writeFile(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}
const names = async () => (await db.location.findMany({ orderBy: { name: 'asc' } })).map((l) => l.name);

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'mm-s28-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await truncateAll(db as never);
});

describe('npm run db:seed takes the locations from SEED_LOCATIONS_FILE', () => {
  it('adds exactly the file’s locations and no demo one', async () => {
    const line = await seedReference(db as never, { locationsFile: await file(PLACES) });
    expect(line).toBe('Locations: 3 added, 0 skipped (already there, left as they are).');
    const rows = await db.location.findMany({ orderBy: { name: 'asc' } });
    expect(rows.map(({ name, kind, address, active }) => ({ name, kind, address, active }))).toEqual([
      { name: 'Example Library', kind: 'LIBRARY', address: '1 Example St', active: true },
      { name: 'Example Studio', kind: 'TUTOR', address: '2 Sample Ave, Suite 9', active: true },
      { name: 'Student’s Home', kind: 'HOME', address: null, active: true },
    ]);
    expect(rows.some((r) => r.id.startsWith('loc_'))).toBe(false); // no demo ids
    // The rest of the day-one data is there.
    expect(await db.settings.count()).toBe(1);
    expect(await db.book.count()).toBeGreaterThan(0);
  });

  it('trims spaces at the ends of names and addresses, and address may be null', async () => {
    await seedReference(db as never, { locationsFile: await file([{ name: '  Example Park  ', kind: 'LIBRARY', address: ' 3 Test Rd ' }, { name: 'Example Home', kind: 'HOME', address: null }]) });
    expect(await db.location.findMany({ select: { name: true, address: true }, orderBy: { name: 'asc' } })).toEqual([
      { name: 'Example Home', address: null },
      { name: 'Example Park', address: '3 Test Rd' },
    ]);
  });

  it('npm run db:seed:demo keeps the demo locations', async () => {
    await loadDemo(db as never, undefined, { writeFiles: false });
    expect((await names()).sort()).toEqual([...DEMO_NAMES].sort());
    expect(await db.location.count({ where: { id: { in: ['loc_studio', 'loc_home', 'loc_library'] } } })).toBe(3);
  });
});

describe('a file inside the checkout is refused, so real places never end up in git', () => {
  const INSIDE = /points inside the app’s folder/;

  it('refuses a path in the repo, absolute or relative, whether or not the file exists', async () => {
    for (const p of [path.resolve('package.json'), 'package.json', './prisma/locations.json', path.resolve('plan/../locations.json'), process.cwd()])
      await expect(seedReference(db as never, { locationsFile: p }), p).rejects.toThrow(INSIDE);
    expect(await db.settings.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
  });

  it('refuses a link outside the repo that leads back into it', async () => {
    const link = path.join(dir, 'sneaky.json');
    await symlink(path.resolve('package.json'), link);
    await expect(seedReference(db as never, { locationsFile: link })).rejects.toThrow(INSIDE);
    expect(await db.settings.count()).toBe(0);
  });

  it('refuses a file inside whichever checkout is named, and takes one outside it', async () => {
    const p = await file(PLACES);
    await expect(seedReference(db as never, { locationsFile: p, checkout: dir })).rejects.toThrow(INSIDE);
    expect(await seedReference(db as never, { locationsFile: p })).toMatch(/3 added/);
  });

  it('refuses a folder or file whose name starts with two dots, which is still inside, and saves nothing', async () => {
    const checkout = path.join(dir, 'checkout');
    await mkdir(path.join(checkout, '..places'), { recursive: true });
    const inFolder = path.join(checkout, '..places', 'locations.json');
    const named = path.join(checkout, '..locations.json');
    for (const p of [inFolder, named]) await writeFile(p, JSON.stringify(PLACES));
    for (const p of [inFolder, named, path.relative(process.cwd(), inFolder)])
      await expect(seedReference(db as never, { locationsFile: p, checkout }), p).rejects.toThrow(INSIDE);
    expect(await db.settings.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
    // A real '..' step still leaves the checkout: a file beside it is taken.
    const beside = path.join(checkout, '..', '..checkout.json');
    await writeFile(beside, JSON.stringify(PLACES));
    expect(await seedReference(db as never, { locationsFile: beside, checkout })).toMatch(/3 added/);
  });

  it('refuses a two-dot folder in this checkout', async () => {
    const folder = await mkdtemp(path.join(process.cwd(), '..s28-'));
    try {
      const p = path.join(folder, 'locations.json');
      await writeFile(p, JSON.stringify(PLACES));
      await expect(seedReference(db as never, { locationsFile: p })).rejects.toThrow(INSIDE);
      expect(await db.location.count()).toBe(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('the file is checked before anything is written', () => {
  const long = (n: number) => 'x'.repeat(n);
  const cases: [string, unknown, RegExp][] = [
    ['bad JSON', '[{ "name": "Example Library", ', /isn’t valid JSON/],
    ['not a list', { name: 'Example Library', kind: 'LIBRARY' }, /isn’t a list/],
    ['an empty list', [], /the list is empty/],
    ['an entry that isn’t an object', ['Example Library'], /location 1 isn’t a \{ name, kind, address \} entry/],
    ['an unknown kind', [PLACES[0], { name: 'Example School', kind: 'SCHOOL' }], /location 2’s kind must be one of TUTOR, HOME, LIBRARY/],
    ['a lower-case kind', [{ name: 'Example School', kind: 'library' }], /location 1’s kind must be one of/],
    ['no kind', [{ name: 'Example School' }], /location 1’s kind must be one of/],
    ['a blank name', [PLACES[0], { name: '   ', kind: 'TUTOR' }], /location 2 has no name/],
    ['no name', [{ kind: 'TUTOR' }], /location 1 has no name/],
    ['a name that isn’t text', [{ name: 7, kind: 'TUTOR' }], /location 1 has no name/],
    ['an over-long name', [{ name: long(LOCATION_NAME_MAX + 1), kind: 'TUTOR' }], new RegExp(`location 1’s name is longer than ${LOCATION_NAME_MAX} characters`)],
    ['a blank address', [{ name: 'Example Library', kind: 'LIBRARY', address: ' ' }], /location 1’s address is blank/],
    ['an address that isn’t text', [{ name: 'Example Library', kind: 'LIBRARY', address: 12 }], /location 1’s address is blank/],
    ['an over-long address', [{ name: 'Example Library', kind: 'LIBRARY', address: long(LOCATION_ADDRESS_MAX + 1) }], new RegExp(`location 1’s address is longer than ${LOCATION_ADDRESS_MAX} characters`)],
    ['the same name twice', [PLACES[0], PLACES[1], { name: ' example LIBRARY ', kind: 'TUTOR' }], /locations 1 and 3 have the same name/],
    ['a misspelt field', [{ name: 'Example Library', kind: 'LIBRARY', adress: '1 Example St' }], /location 1 has a field it doesn’t know\. /],
    ['two unknown fields', [PLACES[0], { name: 'Example Park', kind: 'LIBRARY', city: 'Example City', zip: '00000' }], /location 2 has 2 fields it doesn’t know\. /],
    // Shaped the wrong way round: the place is the field name. The key is never printed.
    ['the place as a field name', [{ '1 Example St': 'Example Library' }], /location 1 has a field it doesn’t know\. /],
    // S32: control characters (below U+0020) are refused before anything is written. Postgres refuses NUL with a raw error.
    ['a NUL in a name', [PLACES[0], { name: 'Example Park\u0000', kind: 'LIBRARY' }], /location 2’s name has a hidden character \(a tab, a line break or the like\); retype it/],
    ['a NUL in an address', [{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St\u0000' }], /location 1’s address has a hidden character/],
    ['a tab in a name', [{ name: 'Example\tLibrary', kind: 'LIBRARY' }], /location 1’s name has a hidden character/],
    ['a tab at the end of a name, which trimming would hide', [{ name: 'Example Library\t', kind: 'LIBRARY' }], /location 1’s name has a hidden character/],
    ['a name that is only a tab', [{ name: '\t', kind: 'LIBRARY' }], /location 1’s name has a hidden character/],
    ['a line break in a name', [{ name: 'Example Library\nExample Park', kind: 'LIBRARY' }], /location 1’s name has a hidden character/],
    ['a carriage return in an address', [{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St\r\n2 Sample Ave' }], /location 1’s address has a hidden character/],
    ['a line break at the start of an address', [PLACES[0], { name: 'Example Park', kind: 'LIBRARY', address: '\n2 Sample Ave' }], /location 2’s address has a hidden character/],
    ['a U+0001 in a name', [{ name: 'Example\u0001Library', kind: 'LIBRARY' }], /location 1’s name has a hidden character/],
    ['a U+001F in an address', [{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St\u001f' }], /location 1’s address has a hidden character/],
    ['a raw tab inside the JSON text', '[{ "name": "Example\tLibrary", "kind": "LIBRARY" }]', /isn’t valid JSON/],
  ];

  it.each(cases)('refuses %s with a plain message, and the database is left unchanged', async (_label, content, message) => {
    const p = await file(content);
    const err: Error = await seedReference(db as never, { locationsFile: p }).then(
      () => {
        throw new Error('expected a refusal');
      },
      (e) => e,
    );
    expect(err.message).toMatch(message);
    expect(err.message).toMatch(/^The locations file isn’t right: .*Nothing was saved\. It should be a list like/);
    // Never echoes what the file holds.
    for (const leak of ['Example Library', '1 Example St', '2 Sample Ave', 'Example School', 'Example Park', 'Example City', 'adress', 'city', 'zip', 'xxxxxxxxxx'])
      expect(err.message).not.toContain(leak);
    expect(await db.settings.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
  });

  it('the limits are just right at the limit', async () => {
    await seedReference(db as never, { locationsFile: await file([{ name: long(LOCATION_NAME_MAX), kind: 'TUTOR', address: long(LOCATION_ADDRESS_MAX) }]) });
    expect(await db.location.count()).toBe(1);
  });

  it('refuses a missing file, or a folder, naming the problem', async () => {
    await expect(seedReference(db as never, { locationsFile: path.join(dir, 'nope.json') })).rejects.toThrow(/Can’t read the locations file SEED_LOCATIONS_FILE names: there’s no file there\. Nothing was saved/);
    await expect(seedReference(db as never, { locationsFile: dir })).rejects.toThrow(/Can’t read the locations file .*: it’s a folder, not a file/);
    expect(await db.settings.count()).toBe(0);
  });

  it('refuses an unreadable file', async () => {
    if (process.getuid?.() === 0) return; // root can read anything
    const p = await file(PLACES);
    const { chmod } = await import('node:fs/promises');
    await chmod(p, 0o000);
    await expect(seedReference(db as never, { locationsFile: p })).rejects.toThrow(/this account isn’t allowed to read it/);
    expect(await db.location.count()).toBe(0);
  });

  it('a bad file leaves existing locations exactly as they were', async () => {
    await seedReference(db as never, { locationsFile: await file(PLACES) });
    const before = await db.location.findMany({ orderBy: { id: 'asc' } });
    await expect(seedReference(db as never, { locationsFile: await file([{ name: 'Example New', kind: 'PARK' }]) })).rejects.toThrow(/kind must be one of/);
    expect(await db.location.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('every character below U+0020 is refused in a name and an address; a space and other text are kept', async () => {
    for (let c = 0; c < 0x20; c++) {
      const ch = String.fromCharCode(c);
      for (const [entry, field] of [
        [{ name: `Example${ch}Library`, kind: 'LIBRARY' }, 'name'],
        [{ name: 'Example Library', kind: 'LIBRARY', address: `1 Example${ch}St` }, 'address'],
      ] as const)
        await expect(seedReference(db as never, { locationsFile: await file([entry]) }), `U+${c.toString(16)} in ${field}`).rejects.toThrow(
          new RegExp(`^The locations file isn’t right: location 1’s ${field} has a hidden character`),
        );
    }
    expect(await db.settings.count()).toBe(0);
    expect(await db.book.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
    await seedReference(db as never, { locationsFile: await file([{ name: 'Café Example ~ Library', kind: 'LIBRARY', address: '1 Example St \u007f' }]) });
    expect(await db.location.findMany({ select: { name: true, address: true } })).toEqual([{ name: 'Café Example ~ Library', address: '1 Example St \u007f' }]);
  });

  it('a NUL after a first seed leaves the day-one data and the locations exactly as they were', async () => {
    await seedReference(db as never, { locationsFile: await file(PLACES) });
    const before = { locations: await db.location.findMany({ orderBy: { id: 'asc' } }), settings: await db.settings.findMany(), books: await db.book.count() };
    await expect(seedReference(db as never, { locationsFile: await file([PLACES[0], { name: 'Example New\u0000', kind: 'TUTOR' }]) })).rejects.toThrow(/location 2’s name has a hidden character/);
    expect({ locations: await db.location.findMany({ orderBy: { id: 'asc' } }), settings: await db.settings.findMany(), books: await db.book.count() }).toEqual(before);
  });
});

describe('without SEED_LOCATIONS_FILE', () => {
  it('refuses when the database has no location yet, and writes nothing', async () => {
    for (const locationsFile of [undefined, '', '   ']) await expect(seedReference(db as never, { locationsFile })).rejects.toThrow(NO_LOCATIONS);
    expect(NO_LOCATIONS).toMatch(/^Refusing to seed: there are no locations yet, and SEED_LOCATIONS_FILE isn’t set\. Nothing was saved\./);
    expect(await db.settings.count()).toBe(0);
    expect(await db.book.count()).toBe(0);
  });

  it('can be left out once there are locations, and changes none of them', async () => {
    await seedReference(db as never, { locationsFile: await file(PLACES) });
    const before = await db.location.findMany({ orderBy: { id: 'asc' } });
    expect(await seedReference(db as never, {})).toMatch(/^Locations: none added/);
    expect(await db.location.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});

describe('running it again', () => {
  it('skips names already there (ignoring case and spaces at the ends), keeps edits, and adds only the new ones', async () => {
    await seedReference(db as never, { locationsFile: await file(PLACES) });
    // Vienne edits a location after the first seed.
    const lib = await db.location.findFirstOrThrow({ where: { name: 'Example Library' } });
    const edited = await db.location.update({ where: { id: lib.id }, data: { address: '9 Changed Blvd', kind: 'TUTOR', active: false } });

    const again = [
      { name: '  example LIBRARY ', kind: 'LIBRARY', address: '1 Example St' },
      { name: 'Example Studio', kind: 'HOME', address: 'Somewhere else' },
      { name: 'Example Community Center', kind: 'LIBRARY', address: '4 Demo Way' },
    ];
    expect(await seedReference(db as never, { locationsFile: await file(again) })).toBe('Locations: 1 added, 2 skipped (already there, left as they are).');
    expect(await db.location.findUniqueOrThrow({ where: { id: lib.id } })).toEqual(edited);
    expect(await db.location.findFirstOrThrow({ where: { name: 'Example Studio' } })).toMatchObject({ kind: 'TUTOR', address: '2 Sample Ave, Suite 9' });
    expect(await names()).toEqual(['Example Community Center', 'Example Library', 'Example Studio', 'Student’s Home']);

    // The same file a third time adds nothing.
    expect(await seedReference(db as never, { locationsFile: await file(again) })).toBe('Locations: 0 added, 3 skipped (already there, left as they are).');
    expect(await db.location.count()).toBe(4);
  });
});

describe('the real command (tsx prisma/seed.ts, what npm run db:seed runs)', () => {
  const tsx = path.resolve('node_modules/.bin/tsx');
  function seed(extra: Record<string, string>) {
    const { ADMIN_EMAIL: _e, ADMIN_NAME: _n, ADMIN_PASSWORD: _p, SEED_LOCATIONS_FILE: _f, ...rest } = process.env;
    return promisify(execFile)(tsx, ['prisma/seed.ts'], { env: { ...rest, DATABASE_URL: process.env.DATABASE_URL, ...extra } });
  }
  const PRIVATE = ['Example Library', 'Example Studio', '1 Example St', '2 Sample Ave'];

  it('prints how many it added and skipped, never the names or addresses', async () => {
    const p = await file(PLACES);
    const first = await seed({ SEED_LOCATIONS_FILE: p });
    const second = await seed({ SEED_LOCATIONS_FILE: p });
    expect(first.stdout).toContain('Locations: 3 added, 0 skipped');
    expect(second.stdout).toContain('Locations: 0 added, 3 skipped');
    for (const out of [first, second]) for (const leak of PRIVATE) expect(out.stdout + out.stderr).not.toContain(leak);
    expect(await db.location.count()).toBe(3);
  }, 60000);

  it('a bad file fails the command with the plain message, before writing anything', async () => {
    const p = await file([{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St' }, { name: 'Example Library', kind: 'TUTOR' }]);
    const run = seed({ SEED_LOCATIONS_FILE: p });
    await expect(run).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/locations 1 and 2 have the same name/) });
    const err = await run.catch((e) => e as { stdout: string; stderr: string });
    for (const leak of PRIVATE) expect(err.stdout + err.stderr).not.toContain(leak);
    expect(await db.settings.count()).toBe(0);
  }, 60000);

  it('a NUL in the file fails the command with the plain message, not a database error, and saves nothing', async () => {
    const p = await file([{ name: 'Example Library', kind: 'LIBRARY', address: '1 Example St\u0000' }]);
    const err = await seed({ SEED_LOCATIONS_FILE: p }).then(
      () => {
        throw new Error('expected a refusal');
      },
      (e) => e as { code: number; stdout: string; stderr: string },
    );
    expect(err.code).toBe(1);
    expect(err.stderr).toMatch(/location 1’s address has a hidden character/);
    expect(err.stderr).not.toMatch(/0x00|invalid byte sequence|PrismaClient|prisma\.\w+\.create/);
    for (const leak of PRIVATE) expect(err.stdout + err.stderr).not.toContain(leak);
    expect(await db.settings.count()).toBe(0);
    expect(await db.location.count()).toBe(0);
  }, 60000);

  it('refuses on an empty database when SEED_LOCATIONS_FILE isn’t set', async () => {
    await expect(seed({})).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('there are no locations yet, and SEED_LOCATIONS_FILE isn’t set') });
    expect(await db.settings.count()).toBe(0);
  }, 60000);
});
