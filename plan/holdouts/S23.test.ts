/** S23 holdouts: nothing about a deleted child stays on Vienne's screens, and a bad request deletes nobody. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../../tests/integration/helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';

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

  it('a deleted child is gone from the invite list too, including an earlier code Vienne revoked for the same parent', async () => {
    as('u_admin');
    const ana = await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } });
    // Vienne made a code for Ana, then took it back (Ana joined with another one).
    const first = ok(
      await invites.createInvite({
        parentName: ana.name,
        parentEmail: ana.email,
        plannedStudents: [
          { firstName: 'Mateo', lastName: 'Mendoza', grade: 3 },
          { firstName: 'Lucia', lastName: 'Mendoza', grade: 5 },
        ],
      }),
    );
    ok(await invites.revokeInvite({ inviteId: first.invite.id }));

    ok(await families.deleteStudent({ studentId: 's_lucia' }));

    const listed = ok(await invites.listInvites());
    const stillNamed = listed.filter((i) => (i.plannedStudents as { firstName: string }[]).some((p) => p.firstName === 'Lucia')).map((i) => `${i.parentName} (${i.status})`);
    expect(stillNamed, 'invites on Vienne’s screen that still list the deleted child').toEqual([]);
  });
});
