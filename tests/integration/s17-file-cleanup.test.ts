/**
 * S17: the daily clean-up removes finished uploads nothing uses (row and stored bytes),
 * never a file still used anywhere, and a parent can reserve only so many uploads a day.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, localTarget, ok } from './helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import { PUT as uploadRoute } from '@/app/api/files/upload/[id]/route';
import { cleanUp, ORPHAN_FILE_DAYS } from '@/lib/jobs';
import { MAX_UPLOADS_PER_DAY, storedSize, writeLocal } from '@/lib/storage';

freshDemo();

const DAY = 86400000;
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

/** What the phone does: reserve, PUT the bytes, confirm. */
async function uploadPhoto() {
  const { file, upload: u } = ok(await content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.byteLength }));
  const upload = localTarget(u);
  const url = new URL(upload.url, 'http://localhost');
  const res = await uploadRoute(new Request(url, { method: 'PUT', headers: upload.headers, body: JPEG as unknown as BodyInit }), { params: Promise.resolve({ id: file.id }) } as never);
  expect(res.status).toBe(204);
  return ok(await content.finishUpload({ fileId: file.id }));
}

let n = 0;
/** A finished upload with its bytes stored, finished `daysAgo` days ago. */
async function storedFile(daysAgo: number, uploadedById = 'u_ana') {
  const key = `files/s17-${(n += 1)}-${Date.now()}.jpg`;
  await writeLocal(key, JPEG);
  const at = new Date(Date.now() - daysAgo * DAY);
  return db.fileAsset.create({ data: { storageKey: key, filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.byteLength, uploadedById, uploadedAt: at, createdAt: at } });
}

const old = ORPHAN_FILE_DAYS + 1;
const gone = async (f: { id: string; storageKey: string }) => {
  expect(await db.fileAsset.findUnique({ where: { id: f.id } })).toBeNull();
  expect(await storedSize(f.storageKey)).toBeNull();
};
const kept = async (f: { id: string; storageKey: string }) => {
  expect(await db.fileAsset.findUnique({ where: { id: f.id } })).not.toBeNull();
  expect(await storedSize(f.storageKey)).toBe(JPEG.byteLength);
};

describe('unused files', () => {
  it('a finished upload nothing uses goes once it is older than ORPHAN_FILE_DAYS: the row and the stored bytes', async () => {
    const orphan = await storedFile(old);
    const recent = await storedFile(ORPHAN_FILE_DAYS - 1);
    await cleanUp();
    await gone(orphan);
    await kept(recent);
  });

  it('a replaced work photo becomes unused and goes the same way', async () => {
    as('u_admin');
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 13, to: 13, studentIds: ['s_mateo'] }));
    const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId: 's_mateo' } });
    as('u_ana');
    const first = await uploadPhoto();
    ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [], photos: [{ number: 13, fileId: first.id }] }));
    as('u_admin');
    ok(await assignments.returnSubmission({ submissionId: sub.id, feedback: 'Show the steps' }));
    as('u_ana');
    const second = await uploadPhoto();
    ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [], photos: [{ number: 13, fileId: second.id }] }));
    const longAgo = new Date(Date.now() - old * DAY);
    await db.fileAsset.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { uploadedAt: longAgo, createdAt: longAgo } });

    await cleanUp();
    await gone(first);
    await kept(second);
    expect((await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).photos).toEqual([{ number: 13, fileId: second.id }]);
  });

  it('an upload that never finished still goes after a day', async () => {
    const half = await db.fileAsset.create({ data: { storageKey: `files/s17-half-${Date.now()}.jpg`, filename: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 10, uploadedById: 'u_ana', createdAt: new Date(Date.now() - 2 * DAY) } });
    expect((await cleanUp()).abandonedUploads).toBeGreaterThanOrEqual(1);
    expect(await db.fileAsset.findUnique({ where: { id: half.id } })).toBeNull();
  });
});

describe('files in use are never removed', () => {
  it('keeps a file used anywhere: a resource, its thumbnail, a submission’s work, a photo, a draft', async () => {
    const asResource = await storedFile(old, 'u_admin');
    const asThumb = await storedFile(old, 'u_admin');
    const asWork = await storedFile(old);
    const asPhoto = await storedFile(old);
    const inDraft = await storedFile(old);
    const inAnswers = await storedFile(old);
    await db.resource.create({ data: { title: 'S17 kept', kind: 'WORKSHEET', fileId: asResource.id, thumbnailId: asThumb.id } });
    const subs = await db.submission.findMany({ where: { studentId: 's_mateo' }, take: 2, orderBy: { id: 'asc' } });
    await db.submission.update({ where: { id: subs[0].id }, data: { fileId: asWork.id, photos: [{ number: 13, fileId: asPhoto.id }], answers: [{ number: 2, value: null, correct: null, photo: { fileId: inAnswers.id } }] } });
    await db.submission.update({ where: { id: subs[1].id }, data: { draft: [{ number: 13, value: null, photo: { fileId: inDraft.id } }] } });

    await cleanUp();
    for (const f of [asResource, asThumb, asWork, asPhoto, inDraft, inAnswers]) await kept(f);
  });

  it('the demo’s files (all in use, three weeks old) all stay', async () => {
    const before = await db.fileAsset.findMany({ where: { id: { startsWith: 'fa_' } }, select: { id: true } });
    await cleanUp();
    expect(await db.fileAsset.count({ where: { id: { in: before.map((f) => f.id) } } })).toBe(before.length);
  });

  it('emptying the bin keeps a file that is still a photo inside a submission', async () => {
    const shared = await storedFile(1);
    await db.resource.create({ data: { title: 'S17 binned', kind: 'IMAGE', fileId: shared.id, deletedAt: new Date(Date.now() - 31 * DAY) } });
    const sub = await db.submission.findFirstOrThrow({ where: { studentId: 's_lucia' } });
    const photos = [...((sub.photos as { number: number; fileId: string }[]) ?? []), { number: 99, fileId: shared.id }];
    await db.submission.update({ where: { id: sub.id }, data: { photos } });

    const r = await cleanUp();
    expect(r.purgedResources).toBeGreaterThanOrEqual(1);
    expect(await db.resource.count({ where: { title: 'S17 binned' } })).toBe(0);
    await kept(shared);
  });
});

describe('uploads per parent per day', () => {
  const reserve = () => content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: 100 });

  it('covers at least one full answer sheet', () => {
    // submitAnswerSheet takes up to 200 photos; the book's longest tests have 40 questions.
    expect(MAX_UPLOADS_PER_DAY).toBeGreaterThanOrEqual(200);
  });

  it(`a parent can reserve ${MAX_UPLOADS_PER_DAY} in 24 hours; one more gets a plain message and reserves nothing`, async () => {
    const parent = 'u_priya';
    await db.fileAsset.deleteMany({ where: { uploadedById: parent, id: { not: { startsWith: 'fa_' } } } });
    const mine = await db.fileAsset.count({ where: { uploadedById: parent, createdAt: { gte: new Date(Date.now() - DAY) } } });
    const fill = MAX_UPLOADS_PER_DAY - mine - 1;
    await db.fileAsset.createMany({ data: Array.from({ length: fill }, (_, i) => ({ storageKey: `files/s17-cap-${i}-${Date.now()}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 100, uploadedById: parent })) });
    // Yesterday's don't count.
    await db.fileAsset.create({ data: { storageKey: `files/s17-cap-old-${Date.now()}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 100, uploadedById: parent, createdAt: new Date(Date.now() - DAY - 60000) } });

    as(parent);
    ok(await reserve()); // the last one allowed
    const count = await db.fileAsset.count();
    fails(await reserve(), 'LIMIT', /try again tomorrow, or message Vienne/i);
    expect(await db.fileAsset.count()).toBe(count);

    // Another parent isn't affected.
    as('u_ana');
    ok(await reserve());
  });

  it('a refused upload (not really a photo) still counts toward the day, and its stand-in is never served', async () => {
    const parent = 'u_grace';
    const mine = await db.fileAsset.count({ where: { uploadedById: parent, createdAt: { gte: new Date(Date.now() - DAY) } } });
    await db.fileAsset.createMany({ data: Array.from({ length: MAX_UPLOADS_PER_DAY - mine - 1 }, (_, i) => ({ storageKey: `files/s17-refused-${i}-${Date.now()}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 100, uploadedById: parent })) });
    as(parent);
    const bytes = new TextEncoder().encode('this is not a photo');
    const { file, upload: u } = ok(await content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: bytes.byteLength }));
    const upload = localTarget(u);
    const res = await uploadRoute(new Request(new URL(upload.url, 'http://localhost'), { method: 'PUT', headers: upload.headers, body: bytes as unknown as BodyInit }), { params: Promise.resolve({ id: file.id }) } as never);
    expect(res.status).toBe(204);
    fails(await content.finishUpload({ fileId: file.id }), 'INVALID', /isn’t a real JPG/);
    await gone(file);
    fails(await reserve(), 'LIMIT', /try again tomorrow, or message Vienne/i);

    // The stand-in holds no bytes, can't be opened, and the clean-up drops it after a day.
    const standIn = await db.fileAsset.findFirstOrThrow({ where: { uploadedById: parent, filename: 'work.jpg', uploadedAt: null }, orderBy: { createdAt: 'desc' } });
    expect(await storedSize(standIn.storageKey)).toBeNull();
    fails(await content.getFileForUser({ fileId: standIn.id }), 'NOT_FOUND');
    await db.fileAsset.update({ where: { id: standIn.id }, data: { createdAt: new Date(Date.now() - DAY - 60000) } });
    await cleanUp();
    expect(await db.fileAsset.findUnique({ where: { id: standIn.id } })).toBeNull();
  });

  it('Vienne has no cap', async () => {
    await db.fileAsset.createMany({ data: Array.from({ length: MAX_UPLOADS_PER_DAY }, (_, i) => ({ storageKey: `files/s17-admin-${i}-${Date.now()}.pdf`, filename: 'w.pdf', mimeType: 'application/pdf', sizeBytes: 100, uploadedById: 'u_admin' })) });
    as('u_admin');
    ok(await content.createUpload({ filename: 'book.pdf', mimeType: 'application/pdf', sizeBytes: 100 }));
  });

  it('signed out or not yet active: no reservation at all', async () => {
    const count = await db.fileAsset.count();
    as(null);
    fails(await reserve(), 'UNAUTHENTICATED');
    const guest = await db.user.create({ data: { email: 's17.preview@example.com', name: 'Preview', status: 'PREVIEW' } });
    as(guest.id);
    fails(await reserve(), 'NOT_ACTIVE');
    expect(await db.fileAsset.count()).toBe(count);
  });
});
