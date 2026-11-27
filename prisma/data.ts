/**
 * Loads the prototype's data (prisma/demo/seed.js) into the database, with the same ids.
 *   loadReference — what production needs on day one: settings, the Math subject and
 *                   Vienne's skills, the books (tests only, no answers), hours. The demo
 *                   locations only with { demo: true }.
 *   seedReference — the production seed: loadReference plus the real locations, read from
 *                   SEED_LOCATIONS_FILE (a JSON file outside the repo, so they never land in git).
 *   loadDemo      — everything else: the demo families, sessions, homework, results…
 * Used by prisma/seed.ts and by the integration tests.
 */
import bcrypt from 'bcryptjs';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocationKind, Prisma, type PrismaClient } from '@prisma/client';
import { codeHint, hashCode } from '../src/lib/codes-core';
// The prototype's seed is plain JS; its rows use the Prisma field names (docs/CONTRACT.md).
import { createSeed } from './demo/seed.js';

type Row = Record<string, unknown>;
type Seed = Record<string, Row[] | Row>;

/** Plain codes of the demo invites (the mock stores only a demo hash). */
export const DEMO_CODES: Record<string, string> = { inv_carmen: 'MM-4D8F', inv_greg: 'MM-7K4Q', inv_keisha: 'MM-2B9X', inv_rachel: 'MM-6P3T', inv_sam: 'MM-9RT2' };
export const DEMO_PASSWORD = 'mentoring-demo-2026';

const models = Prisma.dmmf.datamodel.models;
const fieldsOf = (model: string) => {
  const m = models.find((x) => x.name === model);
  if (!m) throw new Error(`No model ${model}`);
  return m.fields;
};

/** ISO strings → Date for DateTime fields; null JSON → omitted; relation objects dropped. */
function toData(model: string, row: Row) {
  const fields = fieldsOf(model);
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'object' || !(f.name in row)) continue;
    const v = row[f.name];
    if (v === undefined) continue;
    if (f.type === 'DateTime') out[f.name] = v == null ? null : new Date(v as string);
    else if (f.type === 'Json') {
      if (v !== null) out[f.name] = v;
    } else out[f.name] = v;
  }
  return out;
}

const rows = (seed: Seed, key: string) => (Array.isArray(seed[key]) ? (seed[key] as Row[]) : [seed[key] as Row]);
const delegate = (db: PrismaClient, model: string) => (db as unknown as Record<string, { createMany: (a: { data: Row[]; skipDuplicates?: boolean }) => Promise<unknown> }>)[model[0].toLowerCase() + model.slice(1)];

async function insert(db: PrismaClient, model: string, data: Row[]) {
  if (data.length) await delegate(db, model).createMany({ data: data.map((r) => toData(model, r)), skipDuplicates: true });
}

export function prototypeSeed(): Seed {
  return createSeed() as unknown as Seed;
}

/** Day-one data. Safe to run again: existing rows are left as Vienne changed them. */
export async function loadReference(db: PrismaClient, seed = prototypeSeed(), { demo = false } = {}) {
  const settings = rows(seed, 'settings')[0];
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: toData('Settings', { ...settings, defaultMeetingUrl: demo ? settings.defaultMeetingUrl : null }) as Prisma.SettingsCreateInput });
  await insert(db, 'Subject', rows(seed, 'subjects'));
  await insert(db, 'Skill', rows(seed, 'skills'));
  if (demo) await insert(db, 'Location', rows(seed, 'locations'));
  if (!(await db.availability.count())) await insert(db, 'Availability', rows(seed, 'availability'));
  await insert(db, 'Book', rows(seed, 'books'));
  await insert(db, 'Tag', rows(seed, 'tags'));
}

/** Limits for the locations file (the address limit is the same as a session's address). */
export const LOCATION_NAME_MAX = 80;
export const LOCATION_ADDRESS_MAX = 200;
export const LOCATIONS_MAX = 50;
const KINDS = Object.values(LocationKind) as string[];

export type SeedLocation = { name: string; kind: LocationKind; address: string | null };

/** The checkout this file is in. A locations file inside it could be committed by mistake. */
const CHECKOUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORMAT = `a list like [{ "name": "…", "kind": "LIBRARY", "address": "…" }], where kind is ${KINDS.join(', ')} and address is optional`;
const sameName = (name: string) => name.trim().toLowerCase();

/**
 * Checks the locations file's text. Throws a plain message naming the problem and which
 * entry has it; never the names or addresses themselves (seed output can end up in logs).
 */
export function parseLocations(text: string): SeedLocation[] {
  const refuse = (problem: string) => new Error(`The locations file isn’t right: ${problem}. Nothing was saved. It should be ${FORMAT}.`);
  let list: unknown;
  try {
    list = JSON.parse(text);
  } catch {
    // JSON.parse's own message quotes the text, so it isn't shown.
    throw refuse('it isn’t valid JSON');
  }
  if (!Array.isArray(list)) throw refuse('it isn’t a list');
  if (!list.length) throw refuse('the list is empty');
  if (list.length > LOCATIONS_MAX) throw refuse(`it has ${list.length} locations, more than ${LOCATIONS_MAX}`);
  const seen = new Map<string, number>();
  return list.map((entry: unknown, i) => {
    const n = `location ${i + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw refuse(`${n} isn’t a { name, kind, address } entry`);
    const { name, kind, address, ...rest } = entry as Record<string, unknown>;
    const extra = Object.keys(rest);
    // The keys aren't shown: in a wrong-shaped file the place itself can be a key.
    if (extra.length) throw refuse(`${n} has ${extra.length === 1 ? 'a field' : `${extra.length} fields`} it doesn’t know`);
    if (typeof name !== 'string' || !name.trim()) throw refuse(`${n} has no name`);
    if (name.trim().length > LOCATION_NAME_MAX) throw refuse(`${n}’s name is longer than ${LOCATION_NAME_MAX} characters`);
    if (typeof kind !== 'string' || !KINDS.includes(kind)) throw refuse(`${n}’s kind must be one of ${KINDS.join(', ')}`);
    if (address !== undefined && address !== null) {
      if (typeof address !== 'string' || !address.trim()) throw refuse(`${n}’s address is blank (leave it out if there isn’t one)`);
      if (address.trim().length > LOCATION_ADDRESS_MAX) throw refuse(`${n}’s address is longer than ${LOCATION_ADDRESS_MAX} characters`);
    }
    const first = seen.get(sameName(name));
    if (first) throw refuse(`locations ${first} and ${i + 1} have the same name`);
    seen.set(sameName(name), i + 1);
    return { name: name.trim(), kind: kind as LocationKind, address: typeof address === 'string' ? address.trim() : null };
  });
}

/** True when p is root or under it. Only a '..' segment leaves root: a name like '..places' is still inside. */
const within = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
};

/** Reads and checks SEED_LOCATIONS_FILE. Refuses a file inside the checkout, so real places stay out of git. */
export async function readLocationsFile(file: string, checkout = CHECKOUT): Promise<SeedLocation[]> {
  const inside = new Error(
    'Refusing the locations file: SEED_LOCATIONS_FILE points inside the app’s folder, where it could be committed and the real places would end up in git. Nothing was saved. Move it outside the repo (your home folder, say) and run again.',
  );
  const full = path.resolve(file);
  const root = await realpath(checkout).catch(() => checkout);
  if (within(full, checkout) || within(full, root)) throw inside;
  let text: string;
  try {
    if (within(await realpath(full), root)) throw inside; // a link that leads back into the repo
    text = await readFile(full, 'utf8');
  } catch (e) {
    if (e === inside) throw e;
    const code = (e as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? 'there’s no file there' : code === 'EISDIR' ? 'it’s a folder, not a file' : code === 'EACCES' ? 'this account isn’t allowed to read it' : 'it couldn’t be read';
    throw new Error(`Can’t read the locations file SEED_LOCATIONS_FILE names: ${why}. Nothing was saved. Check the path and run again.`);
  }
  return parseLocations(text);
}

/** Adds the locations whose name (ignoring case and spaces at the ends) isn't there yet. Existing ones are never changed. */
export async function addLocations(db: PrismaClient, list: SeedLocation[]) {
  return db.$transaction(async (tx) => {
    const have = new Set((await tx.location.findMany({ select: { name: true } })).map((l) => sameName(l.name)));
    const fresh = list.filter((l) => !have.has(sameName(l.name)));
    if (fresh.length) await tx.location.createMany({ data: fresh });
    return { added: fresh.length, skipped: list.length - fresh.length };
  });
}

export const NO_LOCATIONS =
  'Refusing to seed: there are no locations yet, and SEED_LOCATIONS_FILE isn’t set. Nothing was saved. ' +
  `Put Vienne’s locations in a JSON file outside the repo (${FORMAT}) and run again with SEED_LOCATIONS_FILE=/path/to/locations.json.`;

/**
 * The production seed's data (npm run db:seed): checks the locations file before writing
 * anything, then loads the day-one data and adds the new locations. Returns the line to
 * print: counts only, never names or addresses (the output can end up in logs).
 */
export async function seedReference(db: PrismaClient, { locationsFile, checkout }: { locationsFile?: string; checkout?: string } = {}) {
  const list = locationsFile?.trim() ? await readLocationsFile(locationsFile.trim(), checkout) : null;
  if (!list && !(await db.location.count())) throw new Error(NO_LOCATIONS);
  await loadReference(db);
  if (!list) return 'Locations: none added (SEED_LOCATIONS_FILE isn’t set; the ones already there are kept).';
  const { added, skipped } = await addLocations(db, list);
  return `Locations: ${added} added, ${skipped} skipped (already there, left as they are).`;
}

/**
 * Vienne's account. With Google sign-in, ADMIN_EMAIL must be her Google address.
 * Run again for the same admin, it changes nothing (her password stays hers).
 * If someone else signed up with her address first, the account is taken back: their
 * password stops working, their sessions are signed out, their devices stop getting
 * notifications, and anything they made on it
 * (children, a message thread, a used invite) is printed so it can be checked by hand.
 */
export async function ensureAdmin(db: PrismaClient, { email, name, password }: { email: string; name: string; password?: string }) {
  if (password !== undefined && password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters (the sign-in screen won’t accept less).');
  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing?.role === 'ADMIN') return existing.status === 'ACTIVE' ? existing : db.user.update({ where: { id: existing.id }, data: { status: 'ACTIVE' } });
  if (existing) {
    const [children, conversation, invite] = [
      await db.student.findMany({ where: { parentId: existing.id }, select: { id: true, firstName: true } }),
      await db.conversation.findUnique({ where: { parentId: existing.id }, select: { id: true, _count: { select: { messages: true } } } }),
      await db.invite.findUnique({ where: { usedById: existing.id }, select: { id: true } }),
    ];
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const { user, devices } = await db.$transaction(async (tx) => {
      // Their phones and browsers would otherwise get Vienne's notifications.
      const { count: devices } = await tx.pushSubscription.deleteMany({ where: { userId: existing.id } });
      const user = await tx.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: 'ADMIN',
          status: 'ACTIVE',
          emailVerified: new Date(),
          passwordHash,
          sessionVersion: { increment: 1 },
          failedLogins: 0,
          lockedUntil: null,
          mustChangePassword: false,
          redeemFailures: 0,
          redeemLockedUntil: null,
        },
      });
      return { user, devices };
    });
    const left = [
      children.length && `${children.length} child${children.length === 1 ? '' : 'ren'} (${children.map((c) => `${c.id} ${c.firstName}`).join(', ')})`,
      conversation && `a message thread ${conversation.id} with ${conversation._count.messages} message${conversation._count.messages === 1 ? '' : 's'}`,
      invite && `used invite ${invite.id}`,
    ].filter(Boolean);
    console.warn(
      `An account already used ${user.email} (${user.id}). It is now Vienne's admin account: the old password no longer works, every session on it is signed out` +
        (devices ? ` and ${devices} device${devices === 1 ? '' : 's'} no longer get${devices === 1 ? 's' : ''} its notifications.` : '.') +
        (password ? '' : ' Set ADMIN_PASSWORD and run again, or sign in with Google.') +
        (left.length ? `\nStill attached to it, check these by hand: ${left.join('; ')}.` : '\nNothing else was attached to it.'),
    );
    return user;
  }
  return db.user.create({
    data: { email: email.toLowerCase(), name, role: 'ADMIN', status: 'ACTIVE', textSize: 'LARGE', emailVerified: new Date(), passwordHash: password ? await bcrypt.hash(password, 12) : null },
  });
}

const PLACEHOLDER: Record<string, Uint8Array> = {
  'application/pdf': new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
  'image/png': Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')),
  'image/jpeg': Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')),
};

/** The whole demo: 12 families, sessions, notes, homework, FAST results, messages. */
export async function loadDemo(db: PrismaClient, seed = prototypeSeed(), { writeFiles = true } = {}) {
  await loadReference(db, seed, { demo: true });
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await insert(db, 'User', rows(seed, 'users').map((u) => ({ ...u, passwordHash: u.passwordHash ? hash : null })));
  await insert(db, 'Student', rows(seed, 'students'));
  await insert(db, 'StudentSubject', rows(seed, 'studentSubjects'));
  await insert(db, 'TimeOff', rows(seed, 'timeOff'));
  await insert(db, 'BookItem', rows(seed, 'bookItems'));
  const files = rows(seed, 'fileAssets').map((f) => ({ ...f, storageKey: `files/demo_${f.id}`, uploadedAt: f.createdAt }));
  await insert(db, 'FileAsset', files);
  if (writeFiles && !process.env.BLOB_READ_WRITE_TOKEN) {
    for (const f of files) {
      const file = path.join(process.cwd(), 'uploads', String(f.storageKey));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, PLACEHOLDER[String((f as Row).mimeType)] ?? PLACEHOLDER['application/pdf']);
    }
  }
  await insert(db, 'Resource', rows(seed, 'resources'));
  await insert(db, 'ResourceTag', rows(seed, 'resourceTags'));
  await insert(db, 'ResourceShare', rows(seed, 'resourceShares'));
  await insert(db, 'Session', rows(seed, 'sessions'));
  await insert(db, 'SessionNote', rows(seed, 'sessionNotes'));
  await insert(db, 'SessionNoteSkill', rows(seed, 'sessionNoteSkills'));
  await insert(db, 'Assignment', rows(seed, 'assignments'));
  await insert(db, 'Submission', rows(seed, 'submissions'));
  await insert(db, 'RedoItem', rows(seed, 'redoItems'));
  await insert(db, 'FastResult', rows(seed, 'fastResults'));
  await insert(db, 'ProgressReport', rows(seed, 'progressReports'));
  await insert(db, 'ReportRating', rows(seed, 'reportRatings'));
  await insert(db, 'Conversation', rows(seed, 'conversations'));
  await insert(db, 'Message', rows(seed, 'messages'));
  await insert(db, 'Notification', rows(seed, 'notifications'));
  await insert(
    db,
    'Invite',
    rows(seed, 'invites').map((inv) => {
      const code = DEMO_CODES[String(inv.id)];
      if (!code) throw new Error(`No demo code for invite ${inv.id}`);
      return { ...inv, codeHash: hashCode(code), codeHint: codeHint(code) };
    }),
  );
}

/** Empties every table (tests and db:reset). */
export async function truncateAll(db: PrismaClient) {
  const tables = models.map((m) => `"${m.dbName ?? m.name}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
