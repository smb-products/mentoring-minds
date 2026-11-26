/** S18 holdouts: one sibling blocked blocks the whole assignment; a shared worksheet opens for its own family only. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as assignments from '@/server/assignments';
import * as content from '@/server/content';
import * as notifications from '@/server/notifications';
import { GET as download } from '@/app/api/files/[id]/route';

freshDemo();

const open = async (fileId: string) => (await download(new Request(`http://localhost/api/files/${fileId}`), { params: Promise.resolve({ id: fileId }) } as never)).status;
const homework = async (parent: string, studentId: string) => {
  as(parent);
  return ok(await assignments.listForStudent({ studentId }));
};
const inbox = async (parent: string) => {
  as(parent);
  return JSON.stringify(ok(await notifications.listForUser()));
};

/** The demo worksheet res_mult, shared with Mateo only. */
async function mateoOnly() {
  as('u_admin');
  ok(await content.setSharing({ resourceId: 'res_mult', visibility: 'SELECTED', studentIds: ['s_mateo'] }));
}

describe('S18 holdouts', () => {
  it('a sibling who can’t see it blocks the whole thing: only she is named, and Ana gets no homework and no alert', async () => {
    await mateoOnly();
    const [mateo, lucia, alerts] = [await homework('u_ana', 's_mateo'), await homework('u_ana', 's_lucia'), await inbox('u_ana')];
    as('u_admin');
    const r = await assignments.createPracticeAssignment({ title: 'S18 sibling practice', resourceId: 'res_mult', studentIds: ['s_mateo', 's_lucia'] });
    fails(r, 'INVALID', /Lucia can’t see .*Share it with them in the library first/);
    expect(JSON.stringify(r)).not.toContain('Mateo');
    expect(await homework('u_ana', 's_mateo')).toEqual(mateo);
    expect(await homework('u_ana', 's_lucia')).toEqual(lucia);
    expect(await inbox('u_ana')).toBe(alerts);
  });

  it('assigned to a child who can see it: Ana opens it; Grace, a preview parent and signed out don’t', async () => {
    await mateoOnly();
    as('u_admin');
    ok(await assignments.createPracticeAssignment({ title: 'S18 Mateo practice', resourceId: 'res_mult', studentIds: ['s_mateo', 's_mateo'] }));
    const mine = (await homework('u_ana', 's_mateo')).filter((w) => w.assignment.title === 'S18 Mateo practice');
    expect(mine, 'one answer sheet, even if the child was picked twice').toHaveLength(1);
    const fileId = (mine[0].assignment.resource as unknown as { file: { id: string } }).file.id;
    as('u_ana');
    expect(await open(fileId)).toBe(200);
    for (const [who, status] of [['u_grace', 403], ['u_tom', 403], [null, 401]] as const) {
      as(who);
      expect(await open(fileId), String(who)).toBe(status);
      expect((await assignments.listForStudent({ studentId: 's_mateo' })).ok, String(who)).toBe(false);
    }
    expect(JSON.stringify(await homework('u_grace', 's_noah'))).not.toContain('S18 Mateo practice');
    expect(await inbox('u_grace')).not.toContain('S18 Mateo practice');
  });

  it('wrong input: no students, an unknown student or an unknown resource creates nothing', async () => {
    const before = await db.assignment.count();
    as('u_admin');
    for (const input of [
      { title: 'x', resourceId: 'res_mult', studentIds: [] },
      { title: 'x', resourceId: 'res_mult', studentIds: ['s_nobody'] },
      { title: 'x', resourceId: 'res_nothing', studentIds: ['s_mateo'] },
      { title: 'x', resourceId: '', studentIds: ['s_mateo'] },
    ]) {
      const r = await assignments.createPracticeAssignment(input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
      if (!r.ok) expect(['INVALID', 'NOT_FOUND']).toContain(r.code);
    }
    expect(await db.assignment.count()).toBe(before);
  });
});
