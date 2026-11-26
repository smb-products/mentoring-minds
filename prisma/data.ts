/**
 * Loads the prototype's data (prisma/demo/seed.js) into the database, with the same ids.
 *   loadReference — what production needs on day one: settings, the Math subject and
 *                   Vienne's skills, the books (tests only, no answers), locations, hours.
 *   loadDemo      — everything else: the demo families, sessions, homework, results…
 * Used by prisma/seed.ts and by the integration tests.
 */
import bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
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
  await insert(db, 'Location', rows(seed, 'locations'));
  if (!(await db.availability.count())) await insert(db, 'Availability', rows(seed, 'availability'));
  await insert(db, 'Book', rows(seed, 'books'));
  await insert(db, 'Tag', rows(seed, 'tags'));
}

/** Vienne's account. With Google sign-in, ADMIN_EMAIL must be her Google address. */
export async function ensureAdmin(db: PrismaClient, { email, name, password }: { email: string; name: string; password?: string }) {
  if (password !== undefined && password.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters (the sign-in screen won’t accept less).');
  const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return db.user.update({ where: { id: existing.id }, data: { role: 'ADMIN', status: 'ACTIVE' } });
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
