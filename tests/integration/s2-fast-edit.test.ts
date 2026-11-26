/**
 * S2: an edit keeps who entered a FAST result, and deleteResult checks access
 * before it looks anything up.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as fast from '@/server/fast';

freshDemo();

/** The DTO's type drops the row's own fields, so read the id through this. */
const idOf = (r: unknown) => (r as { id: string }).id;
const pm2 = { studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2' as const };

describe('editing a FAST result', () => {
  it('keeps who entered it and when, so the parent can still correct it', async () => {
    as('u_ana');
    const created = ok(await fast.saveResult({ ...pm2, scaleScore: 300, level: 3 }));
    expect(created.enteredBy).toMatchObject({ id: 'u_ana', name: 'Ana Mendoza' });
    const before = await db.fastResult.findUniqueOrThrow({ where: { id: idOf(created) } });

    as('u_admin');
    const edited = ok(await fast.saveResult({ ...pm2, id: idOf(created), scaleScore: 310, level: 3 }));
    expect(edited).toMatchObject({ scaleScore: 310, enteredBy: { id: 'u_ana', name: 'Ana Mendoza', role: 'PARENT' } });
    const after = await db.fastResult.findUniqueOrThrow({ where: { id: idOf(created) } });
    expect(after.enteredById).toBe('u_ana');
    expect(after.enteredAt.toISOString()).toBe(before.enteredAt.toISOString());

    as('u_ana');
    const listed = ok(await fast.listResults({ studentId: 's_mateo' })).results.find((r) => idOf(r) === idOf(created));
    expect(listed?.enteredBy).toMatchObject({ id: 'u_ana', name: 'Ana Mendoza' });
    const again = ok(await fast.saveResult({ ...pm2, id: idOf(created), scaleScore: 312, level: 4 }));
    expect(again).toMatchObject({ scaleScore: 312, level: 4, enteredBy: { id: 'u_ana' } });
  });

  it('a parent still can’t edit a result Vienne entered, and the row stays Vienne’s', async () => {
    as('u_ana');
    fails(await fast.saveResult({ id: 'fr_mateo_PM1_2026', studentId: 's_mateo', schoolYear: '2026–27', window: 'PM1', scaleScore: 1, level: 1 }), 'FORBIDDEN');
    expect((await db.fastResult.findUniqueOrThrow({ where: { id: 'fr_mateo_PM1_2026' } })).enteredById).toBe('u_admin');
  });
});

describe('deleteResult', () => {
  it('checks the session before looking up the result', async () => {
    as(null);
    fails(await fast.deleteResult({ id: 'fr_does_not_exist' }), 'UNAUTHENTICATED');
    fails(await fast.deleteResult({ id: 'fr_sofia_PM1_2026' }), 'UNAUTHENTICATED');
    expect(await db.fastResult.findUnique({ where: { id: 'fr_sofia_PM1_2026' } })).not.toBeNull();
  });

  it('gives a family the same answer for another family’s result as for a missing one', async () => {
    as('u_ana');
    const theirs = await fast.deleteResult({ id: 'fr_sofia_PM1_2026' });
    const missing = await fast.deleteResult({ id: 'fr_does_not_exist' });
    fails(theirs, 'FORBIDDEN');
    fails(missing, 'FORBIDDEN');
    expect(theirs).toEqual(missing);
    expect(await db.fastResult.findUnique({ where: { id: 'fr_sofia_PM1_2026' } })).not.toBeNull();
  });

  it('a parent can’t remove a result someone else entered for their own child', async () => {
    as('u_ana');
    fails(await fast.deleteResult({ id: 'fr_mateo_PM1_2026' }), 'FORBIDDEN', /Only Vienne/);
    expect(await db.fastResult.findUnique({ where: { id: 'fr_mateo_PM1_2026' } })).not.toBeNull();
  });

  it('a parent removes their own entry; Vienne removes any; a missing id is not found for Vienne', async () => {
    as('u_ana');
    const mine = ok(await fast.saveResult({ studentId: 's_mateo', schoolYear: '2026–27', window: 'PM3', scaleScore: 320, level: 4 }));
    ok(await fast.deleteResult({ id: idOf(mine) }));
    expect(await db.fastResult.findUnique({ where: { id: idOf(mine) } })).toBeNull();

    as('u_admin');
    fails(await fast.deleteResult({ id: 'fr_does_not_exist' }), 'NOT_FOUND');
    ok(await fast.deleteResult({ id: 'fr_sofia_PM1_2026' }));
    expect(await db.fastResult.findUnique({ where: { id: 'fr_sofia_PM1_2026' } })).toBeNull();
  });
});
