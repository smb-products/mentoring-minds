/**
 * S18: a practice assignment only uses a resource every chosen student can see
 * (lib/files.visibleTo), so the family never gets "Forbidden" opening it.
 * A refusal names the students, creates nothing and notifies nobody.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import { GET as download } from '@/app/api/files/[id]/route';

freshDemo();

const get = (fileId: string) => download(new Request(`http://localhost/api/files/${fileId}`), { params: Promise.resolve({ id: fileId }) } as never);

/** What a create could leave behind: assignments, answer sheets, notifications. */
async function counts() {
  return { assignments: await db.assignment.count(), submissions: await db.submission.count(), notifications: await db.notification.count() };
}

async function refused(input: Parameters<typeof assignments.createPracticeAssignment>[0], message: RegExp) {
  as('u_admin');
  const before = await counts();
  fails(await assignments.createPracticeAssignment(input), 'INVALID', message);
  expect(await counts(), 'nothing created, nobody notified').toEqual(before);
}

describe('refused: a resource a chosen student can’t see', () => {
  it('shared with other children only (res_mult: Sofia, Jordan, Eli): names Mateo', async () => {
    await refused({ title: 'Facts practice', resourceId: 'res_mult', studentIds: ['s_sofia', 's_mateo'] }, /^Mateo can’t see “Multiplication facts 6–9”\. Share it with them in the library first/);
  });

  it('outside its grades (GRADES 1–3): names every child it misses', async () => {
    as('u_admin');
    const r = ok(await content.createResource({ title: 'Regrouping, grades 1–3', kind: 'WORKSHEET', fileId: 'fa_regrouping', gradeMin: 1, gradeMax: 3, visibility: 'GRADES', status: 'PUBLISHED' }));
    await refused({ title: 'Regrouping', resourceId: r.id, studentIds: ['s_ava', 's_lucia', 's_noah'] }, /^Lucia and Noah can’t see “Regrouping, grades 1–3”/);
    ok(await assignments.createPracticeAssignment({ title: 'Regrouping', resourceId: r.id, studentIds: ['s_ava', 's_mateo'] }));
  });

  it('a draft: nobody can see it yet, so it names them all', async () => {
    as('u_admin');
    const r = ok(await content.createResource({ title: 'Draft worksheet', kind: 'WORKSHEET', fileId: 'fa_area', gradeMin: 3, gradeMax: 5, visibility: 'ALL', status: 'DRAFT' }));
    await refused({ title: 'Not yet', resourceId: r.id, studentIds: ['s_mateo', 's_lucia'] }, /^“Draft worksheet” is still a draft, so Mateo and Lucia can’t open it\. Publish it in the library first\./);
  });

  it('a deleted resource is not found, and nothing is created', async () => {
    as('u_admin');
    const r = ok(await content.createResource({ title: 'Gone soon', kind: 'LINK', url: 'https://flfast.org/families.html', gradeMin: 0, gradeMax: 6, visibility: 'ALL', status: 'PUBLISHED' }));
    ok(await content.deleteResource({ resourceId: r.id }));
    const before = await counts();
    fails(await assignments.createPracticeAssignment({ title: 'Gone', resourceId: r.id, studentIds: ['s_mateo'] }), 'NOT_FOUND');
    expect(await counts()).toEqual(before);
  });
});

describe('a resource every chosen student can see works as before', () => {
  it('shared with both children: created, both parents told, and each family opens the file', async () => {
    as('u_admin');
    const before = await counts();
    const a = ok(await assignments.createPracticeAssignment({ title: 'Facts practice', resourceId: 'res_mult', studentIds: ['s_sofia', 's_eli'] }));
    expect(a).toMatchObject({ kind: 'PRACTICE', resourceId: 'res_mult' });
    expect(await counts()).toEqual({ assignments: before.assignments + 1, submissions: before.submissions + 2, notifications: before.notifications + 2 });

    for (const [parent, student] of [['u_daniel', 's_sofia'], ['u_marcus', 's_eli']]) {
      as(parent);
      const work = ok(await assignments.listForStudent({ studentId: student }));
      const mine = work.find((w) => w.assignmentId === a.id)!;
      expect(mine.assignment.resource, `${student} gets the resource`).toMatchObject({ id: 'res_mult' });
      const fileId = (mine.assignment.resource as unknown as { file: { id: string } }).file.id;
      expect((await get(fileId)).status, `${parent} opens the worksheet`).toBe(200);
    }
  });

  it('by grade (ALL visibility, grades 3–5) and a link with no resource still work', async () => {
    as('u_admin');
    ok(await assignments.createPracticeAssignment({ title: 'Strips', resourceId: 'res_fraction_strips', studentIds: ['s_mateo', 's_noah'] }));
    ok(await assignments.createPracticeAssignment({ title: 'Just practice', studentIds: ['s_leo'] }));
  });
});

describe('permissions', () => {
  it('a parent and a signed-out caller can’t create one', async () => {
    as('u_daniel');
    fails(await assignments.createPracticeAssignment({ title: 'x', resourceId: 'res_mult', studentIds: ['s_sofia'] }), 'FORBIDDEN');
    as(null);
    fails(await assignments.createPracticeAssignment({ title: 'x', resourceId: 'res_mult', studentIds: ['s_sofia'] }), 'UNAUTHENTICATED');
  });
});
