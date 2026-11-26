/** S2 holdouts: another family, PREVIEW and signed-out callers can't use an edit or delete. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from '../integration/helpers';
import * as fast from '@/server/fast';

freshDemo();

const entry = { studentId: 's_mateo', schoolYear: '2026–27', window: 'PM2' as const, scaleScore: 300, level: 3 };

describe('S2: the wrong person', () => {
  it('after Vienne edits Ana’s result, another family still can’t edit, move or remove it', async () => {
    as('u_ana');
    const id = (ok(await fast.saveResult(entry)) as unknown as { id: string }).id;
    as('u_admin');
    ok(await fast.saveResult({ ...entry, id, scaleScore: 305 }));
    const row = await db.fastResult.findUniqueOrThrow({ where: { id } });

    as('u_grace');
    expect((await fast.saveResult({ ...entry, id })).ok).toBe(false);
    expect((await fast.saveResult({ ...entry, id, studentId: 's_noah' })).ok).toBe(false);
    fails(await fast.deleteResult({ id }), 'FORBIDDEN');
    expect(await db.fastResult.findUniqueOrThrow({ where: { id } })).toEqual(row);
  });

  it('PREVIEW and signed-out callers get the same answer for a real id as for a missing or empty one', async () => {
    const real = 'fr_mateo_PM1_2026';
    for (const [who, code] of [['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      const a = await fast.deleteResult({ id: real });
      fails(a, code);
      expect(await fast.deleteResult({ id: 'fr_missing' })).toEqual(a);
      expect(await fast.deleteResult({ id: '' })).toEqual(a);
    }
    expect(await db.fastResult.findUnique({ where: { id: real } })).not.toBeNull();
  });
});
