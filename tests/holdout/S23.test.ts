/** S23 holdouts: nothing about a deleted child stays on Vienne's screens, and a bad request deletes nobody. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo } from '../../tests/integration/helpers';
import * as families from '@/server/families';

freshDemo();

const people = async () => ({
  users: await db.user.count(),
  students: await db.student.count(),
  sessions: await db.session.count(),
  submissions: await db.submission.count(),
  messages: await db.message.count(),
});

describe('S23 holdouts', () => {
  it('an empty or malformed request deletes nobody', async () => {
    as('u_admin');
    const before = await people();
    const bad: unknown[] = [{}, { studentId: '' }, { parentId: '' }, { studentId: null }, { parentId: null }, { studentId: { not: 'x' } }, { parentId: { not: 'x' } }, { studentId: ['s_mateo'] }, { parentId: ['u_ana'] }];
    for (const input of bad) {
      expect((await families.deleteStudent(input as never)).ok, `child ${JSON.stringify(input)}`).toBe(false);
      expect((await families.deleteFamily(input as never)).ok, `family ${JSON.stringify(input)}`).toBe(false);
    }
    // A child's id is not a family, and a parent's id is not a child.
    fails(await families.deleteFamily({ parentId: 's_mateo' }), 'NOT_FOUND');
    fails(await families.deleteStudent({ studentId: 'u_ana' }), 'NOT_FOUND');
    expect(await people()).toEqual(before);
  });

  // Retired by a lead (Axis, 2026-11-26): the case for an earlier, revoked code to the parent's email is
  // replaced by S23b checks 3 and 6 (Javaris: ids only). A code nobody redeemed stays as it is.
  // tests/integration/s23b-delete-by-id.test.ts covers the opposite.
});
