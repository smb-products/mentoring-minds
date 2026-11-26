/** W2 holdouts: a family sees only itself; invite codes and passwords never leak; refusals change nothing. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as families from '@/server/families';
import * as invites from '@/server/invites';

freshDemo();

const newParent = (id: string) => db.user.create({ data: { id, name: id, email: `${id}@example.com`, role: 'PARENT', status: 'PREVIEW' } });
const kids = [{ firstName: 'Pablo', grade: 4 }];

describe('W2: leaks and the wrong person', () => {
  it('Grace, a PREVIEW parent and a signed-out visitor get nothing of Ana’s family and no admin tool', async () => {
    const counts = () => Promise.all([db.invite.count(), db.student.count()]);
    const before = await counts();
    const daniel = await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } });
    for (const [who, code] of [['u_grace', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await families.getFamily({ parentId: 'u_ana' }), code);
      fails(await families.listFamilies(), code);
      fails(await invites.listInvites(), code);
      fails(await invites.createInvite({ parentName: 'X', plannedStudents: kids }), code);
      fails(await families.resetParentPassword({ parentId: 'u_daniel' }), code);
      fails(await families.setParentStatus({ parentId: 'u_daniel', status: 'PAUSED' }), code);
      fails(await families.addStudent({ parentId: 'u_ana', firstName: 'X', grade: 3 }), code);
      fails(await families.updateStudent({ studentId: 's_mateo', goals: 'x' }), who === 'u_tom' ? 'NOT_ACTIVE' : code);
    }
    expect(await counts()).toEqual(before);
    expect(await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).toEqual(daniel);
  });

  it('a family’s own page carries no private note, hash, answer key, invite code or early video link', async () => {
    await db.student.update({ where: { id: 's_noah' }, data: { adminNotes: 'PRIVATE-NOTE-NOAH' } });
    const link = 'https://meet.example.com/HOLDOUT-ROOM';
    await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: link } });
    // Nothing is inside a join window: every video session is cancelled.
    await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { status: 'CANCELLED' } });
    as('u_grace');
    const mine = ok(await families.getFamily({ parentId: 'u_grace' }));
    const text = JSON.stringify(mine);
    expect(text).not.toContain('PRIVATE-NOTE-NOAH');
    expect(text).not.toContain(link);
    for (const key of ['adminNotes', 'passwordHash', 'codeHash', 'codeHint', 'answer']) expect(valuesOf(mine, key), key).toEqual([]);
    fails(await families.updateStudent({ studentId: 's_noah', adminNotes: 'mine now' }), 'FORBIDDEN');
    expect((await db.student.findUniqueOrThrow({ where: { id: 's_noah' } })).adminNotes).toBe('PRIVATE-NOTE-NOAH');
  });

  it('codes work once, bad input saves nothing, and secrets are stored only as hashes', async () => {
    as('u_admin');
    const before = await db.invite.count();
    fails(await invites.createInvite({ parentName: '', plannedStudents: kids }), 'INVALID');
    fails(await invites.createInvite({ parentName: 'Rosa', plannedStudents: [] }), 'INVALID');
    fails(await invites.createInvite({ parentName: 'Rosa', parentEmail: 'nope', plannedStudents: kids }), 'INVALID');
    expect(await db.invite.count()).toBe(before);
    const made = ok(await invites.createInvite({ parentName: 'Rosa Diaz', plannedStudents: kids }));
    const revoked = ok(await invites.createInvite({ parentName: 'Gone', plannedStudents: kids }));
    ok(await invites.revokeInvite({ inviteId: revoked.invite.id }));
    const listed = ok(await invites.listInvites());
    expect(JSON.stringify([made.invite, listed])).not.toContain(made.code);
    expect(valuesOf([made, listed], 'codeHash')).toEqual([]);
    const { temporaryPassword } = ok(await families.resetParentPassword({ parentId: 'u_daniel' }));
    expect(temporaryPassword).toMatch(/^mm-[0-9a-f]{6}-[0-9a-f]{6}$/);
    expect(JSON.stringify(await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } }))).not.toContain(temporaryPassword);

    await newParent('u_h1');
    await newParent('u_h2');
    as('u_h1');
    fails(await invites.redeemInvite({ code: revoked.code }), 'INVALID_CODE', /That code isn’t valid\. Check it with Vienne\./);
    ok(await invites.redeemInvite({ code: made.code }));
    as('u_h2');
    fails(await invites.redeemInvite({ code: made.code }), 'INVALID_CODE');
    expect(await db.student.count({ where: { parentId: 'u_h2' } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_h2' } })).status).toBe('PREVIEW');
    as('u_h1');
    expect(ok(await families.getFamily({ parentId: 'u_h1' })).students.map((s) => s.firstName)).toEqual(['Pablo']);
  });
});
