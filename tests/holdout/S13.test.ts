/** S13 holdouts: opening a file gives a family five plain fields, and a locked or wrong account learns nothing. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import * as families from '@/server/families';

freshDemo();

const KEYS = ['filename', 'id', 'mimeType', 'sizeBytes', 'url'];
const open = (fileId: string) => content.getFileForUser({ fileId });

/** A hand-in photo that belongs to one parent only (or, with no uploadedAt, an unfinished upload). */
async function ownWork(parentId: string, studentId: string, id: string, uploadedAt: Date | null = new Date()) {
  await db.fileAsset.create({ data: { id, storageKey: `uploads/secret-${id}`, filename: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 1234, uploadedById: parentId, uploadedAt } });
  if (uploadedAt) {
    const sub = await db.submission.findFirstOrThrow({ where: { studentId } });
    await db.submission.update({ where: { id: sub.id }, data: { photos: [{ number: 1, fileId: id }] } });
  }
}

describe('S13 holdouts', () => {
  it('Ana and Grace each open only their own child’s work; a refusal says nothing about the file', async () => {
    await ownWork('u_ana', 's_mateo', 'fa_s13_ana');
    await ownWork('u_grace', 's_noah', 'fa_s13_grace');
    for (const [me, mine, theirs] of [['u_ana', 'fa_s13_ana', 'fa_s13_grace'], ['u_grace', 'fa_s13_grace', 'fa_s13_ana']] as const) {
      as(me);
      const file = ok(await open(mine));
      expect(Object.keys(file).sort()).toEqual(KEYS);
      expect(JSON.stringify(file)).not.toContain('secret-');
      const refused = await open(theirs);
      fails(refused, 'FORBIDDEN');
      expect(JSON.stringify(refused)).not.toMatch(/fa_s13|secret-|\.jpg|image\/jpeg|1234/);
    }
  });

  it('signed out, preview and paused accounts get one same answer for real, unfinished and made-up ids', async () => {
    await ownWork('u_grace', 's_noah', 'fa_s13_unfinished', null);
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_grace', status: 'PAUSED' }));
    for (const [who, code] of [[null, 'UNAUTHENTICATED'], ['u_tom', 'NOT_ACTIVE'], ['u_lena', 'NOT_ACTIVE'], ['u_grace', 'NOT_ACTIVE']] as const) {
      as(who);
      const answers = [];
      for (const id of ['fa_fraction_strips', 'fa_lucia_work', 'fa_arjun_work', 'fa_s13_unfinished', 'fa_made_up', 'not an id; --']) answers.push(await open(id));
      for (const a of answers) fails(a, code);
      expect(new Set(answers.map((a) => JSON.stringify(a))).size, String(who)).toBe(1);
    }
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_grace', status: 'ACTIVE' }));
  });

  it('wrong input is refused plainly, and no family list carries a storage key, uploader or answer key', async () => {
    as('u_ana');
    for (const input of [{}, { fileId: '' }, { fileId: null }, { fileId: 42 }, { fileId: ['fa_arjun_work'] }, { fileId: { not: 'x' } }]) {
      fails(await content.getFileForUser(input as never), 'INVALID');
    }
    for (const [parent, studentId] of [['u_ana', 's_mateo'], ['u_ana', 's_lucia'], ['u_grace', 's_noah']] as const) {
      as(parent);
      const seen = [ok(await content.listResourcesForStudent({ studentId })), ok(await assignments.listForStudent({ studentId }))];
      expect(valuesOf(seen, 'file').filter(Boolean).length, studentId).toBeGreaterThan(0);
      for (const key of ['storageKey', 'uploadedById', 'adminNotes', 'answerKey', 'passwordHash']) expect(valuesOf(seen, key), `${studentId} ${key}`).toEqual([]);
      expect(JSON.stringify(seen), studentId).not.toMatch(/uploads\/|secret-/);
    }
  });
});
