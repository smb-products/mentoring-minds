/** S17 holdouts: the clean-up keeps a family's handed-in photo for that family only, and the daily upload cap holds. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, localTarget, ok } from '../../tests/integration/helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import { PUT as uploadRoute } from '@/app/api/files/upload/[id]/route';
import { cleanUp, ORPHAN_FILE_DAYS } from '@/lib/jobs';
import { MAX_UPLOADS_PER_DAY } from '@/lib/storage';

freshDemo();

const DAY = 86400000;
const JPEG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

/** What the phone does: reserve, then PUT the bytes. */
async function sendBytes(bytes: Uint8Array) {
  const { file, upload } = ok(await content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: bytes.byteLength }));
  const target = localTarget(upload);
  const res = await uploadRoute(new Request(new URL(target.url, 'http://localhost'), { method: 'PUT', headers: target.headers, body: bytes as unknown as BodyInit }), { params: Promise.resolve({ id: file.id }) } as never);
  return { file, status: res.status };
}

/** Leaves the parent with exactly `left` reservations for today. */
async function leaveSlots(parent: string, left: number) {
  const used = await db.fileAsset.count({ where: { uploadedById: parent, createdAt: { gt: new Date(Date.now() - DAY) } } });
  await db.fileAsset.createMany({ data: Array.from({ length: MAX_UPLOADS_PER_DAY - used - left }, (_, i) => ({ storageKey: `files/s17h-${parent}-${i}-${Date.now()}.jpg`, filename: 'w.jpg', mimeType: 'image/jpeg', sizeBytes: 100, uploadedById: parent })) });
}

const reserve = () => content.createUpload({ filename: 'work.jpg', mimeType: 'image/jpeg', sizeBytes: 100 });

describe('S17 holdouts', () => {
  it('a month later, Ana can still open the photo she handed in; her unused one is gone; Grace gets neither', async () => {
    as('u_admin');
    const a = ok(await assignments.createBookAssignment({ bookId: 'book_g3', test: 'T2', from: 13, to: 13, studentIds: ['s_mateo'] }));
    const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: a.id, studentId: 's_mateo' } });
    as('u_ana');
    const photo = async () => {
      const { file, status } = await sendBytes(JPEG);
      expect(status).toBe(204);
      return ok(await content.finishUpload({ fileId: file.id }));
    };
    const handedIn = await photo();
    const neverUsed = await photo();
    ok(await assignments.submitAnswerSheet({ submissionId: sub.id, answers: [], photos: [{ number: 13, fileId: handedIn.id }] }));
    const at = new Date(Date.now() - (ORPHAN_FILE_DAYS + 30) * DAY);
    await db.fileAsset.updateMany({ where: { id: { in: [handedIn.id, neverUsed.id] } }, data: { uploadedAt: at, createdAt: at } });

    await cleanUp();
    await cleanUp(); // safe to run twice

    ok(await content.getFileForUser({ fileId: handedIn.id }));
    fails(await content.getFileForUser({ fileId: neverUsed.id }), 'NOT_FOUND');
    as('u_grace');
    fails(await content.getFileForUser({ fileId: handedIn.id }), 'FORBIDDEN');
  });

  it('several taps at once on the last slot reserve exactly one', async () => {
    await leaveSlots('u_grace', 1);
    const before = await db.fileAsset.count({ where: { uploadedById: 'u_grace' } });
    as('u_grace');
    const results = await Promise.all(Array.from({ length: 6 }, reserve));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results.filter((x) => !x.ok)) fails(r, 'LIMIT');
    expect(await db.fileAsset.count({ where: { uploadedById: 'u_grace' } })).toBe(before + 1);
  });

  it('a reservation spent on a file that turns out not to be a photo still counts toward the day', async () => {
    await leaveSlots('u_daniel', 1);
    as('u_daniel');
    const { file, status } = await sendBytes(new TextEncoder().encode('this is not a photo at all'));
    expect(status).toBe(204);
    fails(await content.finishUpload({ fileId: file.id }), 'INVALID');
    // That was the last upload of the day: one more is over the cap.
    fails(await reserve(), 'LIMIT');
  });
});
