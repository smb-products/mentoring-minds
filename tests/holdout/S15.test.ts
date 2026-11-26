/** S15 holdouts: a resource shared with several families tells none of them about the others, on any family read. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';

freshDemo();

const FILE_KEYS = ['filename', 'id', 'mimeType', 'sizeBytes', 'uploadedAt', 'url'];
type Work = { assignment: { title: string; resource: { id: string; file: object } | null } };

/** res_mult (a SELECTED file worksheet) shared across Ana, Grace and other demo families, and assigned to Mateo and Noah. */
async function shareAcrossFamilies() {
  as('u_admin');
  ok(await content.setSharing({ resourceId: 'res_mult', visibility: 'SELECTED', studentIds: ['s_mateo', 's_noah', 's_sofia', 's_jordan'] }));
  ok(await assignments.createPracticeAssignment({ title: 'S15 shared practice', resourceId: 'res_mult', studentIds: ['s_mateo', 's_noah'] }));
}

/** Names, student ids and parent ids that belong to anyone but `parentId`. */
async function strangers(parentId: string) {
  const kids = await db.student.findMany({ where: { parentId: { not: parentId } }, include: { parent: true } });
  return kids.flatMap((k) => [k.id, k.parentId, k.parent.name, k.parent.email, `"${k.firstName}"`]);
}

describe('S15 holdouts', () => {
  it('Ana and Grace each get the shared resource, with nothing about the other families', async () => {
    await shareAcrossFamilies();
    for (const [me, kid] of [['u_ana', 's_mateo'], ['u_grace', 's_noah']] as const) {
      as(me);
      const library = ok(await content.listResourcesForStudent({ studentId: kid }));
      const work = ok(await assignments.listForStudent({ studentId: kid })) as unknown as Work[];
      const fromLibrary = library.find((r) => r.id === 'res_mult') as unknown as { file: object } | undefined;
      const fromWork = work.find((w) => w.assignment.title === 'S15 shared practice')?.assignment.resource;
      expect(fromLibrary, me).toBeDefined();
      expect(fromWork?.id, me).toBe('res_mult');
      for (const r of [fromLibrary!, fromWork!]) expect(Object.keys(r.file).sort()).toEqual(FILE_KEYS);
      const wire = JSON.stringify([library, work]);
      for (const s of await strangers(me)) expect(wire, `${me} sees ${s}`).not.toContain(s);
      for (const key of ['sharedWith', 'shares', 'storageKey', 'uploadedById', 'adminNotes', 'meetingUrl', 'codeHash']) {
        expect(valuesOf([library, work], key), `${me} ${key}`).toEqual([]);
      }
    }
  });

  it('a family gets every field Vienne gets on a resource except who it is shared with; Vienne keeps that', async () => {
    as('u_admin');
    const hers = ok(await content.listResourcesForStudent({ studentId: 's_mateo' }));
    const shared = hers.find((r) => r.id === 'res_mult') as unknown as { sharedWith: { id: string }[] };
    expect(shared.sharedWith.map((s) => s.id).sort()).toEqual(['s_jordan', 's_mateo', 's_noah', 's_sofia']);
    as('u_ana');
    const theirs = ok(await content.listResourcesForStudent({ studentId: 's_mateo' }));
    expect(theirs.map((r) => r.id).sort()).toEqual(hers.map((r) => r.id).sort());
    for (const r of theirs) {
      const full = hers.find((x) => x.id === r.id)!;
      expect(Object.keys(r).sort(), r.id).toEqual(Object.keys(full).filter((k) => k !== 'sharedWith').sort());
    }
  });

  it('the other parent, a preview parent and signed out cannot read a child’s resources; bad input is refused', async () => {
    for (const [who, studentId] of [['u_grace', 's_mateo'], ['u_ana', 's_noah'], ['u_tom', 's_mateo'], [null, 's_mateo']] as const) {
      as(who);
      const homework = await assignments.listForStudent({ studentId });
      expect(homework.ok, `${who} homework`).toBe(false);
      expect(JSON.stringify(homework)).not.toMatch(/res_mult|S15 shared/);
      if (who !== 'u_tom') expect((await content.listResourcesForStudent({ studentId })).ok, `${who} library`).toBe(false);
    }
    as('u_tom');
    const teasers = ok(await content.listResourcesForStudent({ studentId: 's_mateo' }));
    expect(teasers.map((r) => r.id)).not.toContain('res_mult');
    for (const key of ['sharedWith', 'shares', 'file', 'fileId', 'url', 'body']) expect(valuesOf(teasers, key), key).toEqual([]);
    as('u_ana');
    fails(await content.listResourcesForStudent({}), 'INVALID');
    fails(await assignments.listForStudent({ studentId: { not: 'x' } as never }), 'INVALID');
  });
});
