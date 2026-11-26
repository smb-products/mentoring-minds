/** S23 holdouts: deleting on request touches the right family's invite codes, and takes the child off all of them. */
import { describe, expect, it } from 'vitest';
import { as, db, freshDemo, ok } from '../../tests/integration/helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';

freshDemo();

/** Vienne makes a code for this child and a second child, Sam. */
const code = async (parentName: string, parentEmail: string, firstName: string, lastName: string) =>
  ok(
    await invites.createInvite({
      parentName,
      parentEmail,
      plannedStudents: [
        { firstName, lastName, grade: 5 },
        { firstName: 'Sam', lastName, grade: 2 },
      ],
    }),
  ).invite.id;
const listed = async (inviteId: string) => ok(await invites.listInvites()).find((i) => i.id === inviteId);
const childrenOn = async (inviteId: string) => ((await listed(inviteId))?.plannedStudents as { firstName: string }[] | undefined)?.map((p) => p.firstName);

describe('S23 holdouts: the right family’s codes', () => {
  it('another family’s code stays whole when its address differs only where the parent’s has an underscore', async () => {
    as('u_admin');
    await db.user.update({ where: { id: 'u_ana' }, data: { email: 'ana_m@example.com' } });
    const other = await code('Alma Moreno', 'anaxm@example.com', 'Lucia', 'Moreno');

    ok(await families.deleteStudent({ studentId: 's_lucia' }));
    expect.soft(await childrenOn(other), 'the other family’s code after Ana’s child is deleted').toEqual(['Lucia', 'Sam']);

    ok(await families.deleteFamily({ parentId: 'u_ana' }));
    expect.soft(await listed(other), 'the other family’s code after Ana’s family is deleted').toBeDefined();
  });

  it('a deleted child typed in lower case on one of the family’s codes is taken off it', async () => {
    as('u_admin');
    const grace = await db.user.findUniqueOrThrow({ where: { id: 'u_grace' } });
    const id = await code(grace.name, grace.email, 'noah', 'kim');
    ok(await families.deleteStudent({ studentId: 's_noah' }));
    expect(await childrenOn(id)).toEqual(['Sam']);
  });
});
