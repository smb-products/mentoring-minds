/**
 * W1 holdouts: skills and FAST results are live, so every call is a public endpoint the screens now use.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as fast from '@/server/fast';
import * as taxonomy from '@/server/taxonomy';

freshDemo();

const result = { schoolYear: '2026–27', window: 'PM2' as const, scaleScore: 236, level: 3 };
const snapshot = async () => ({
  results: await db.fastResult.findMany({ orderBy: { id: 'asc' } }),
  skills: await db.skill.findMany({ orderBy: { id: 'asc' } }),
});

describe('FAST results', () => {
  it('the other parent, a preview parent and a signed-out visitor can’t read, add, change or remove them', async () => {
    const before = await snapshot();
    for (const [who, code] of [['u_grace', 'FORBIDDEN'], ['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await fast.listResults({ studentId: 's_lucia' }), code);
      fails(await fast.saveResult({ studentId: 's_lucia', ...result }), code);
      fails(await fast.saveResult({ id: 'fr_lucia_PM1_2026', studentId: 's_lucia', ...result }), code);
      fails(await fast.deleteResult({ id: 'fr_lucia_PM1_2026' }), code);
    }
    as(null);
    fails(await fast.nextWindow(), 'UNAUTHENTICATED');
    expect(await snapshot()).toEqual(before);
  });

  it('a parent can’t take another child’s result, change Vienne’s, or sign as someone else', async () => {
    const before = await snapshot();
    as('u_ana');
    // Noah's result id sent along with Ana's own child.
    fails(await fast.saveResult({ id: 'fr_noah_PM1_2026', studentId: 's_lucia', ...result }), 'NOT_FOUND');
    // Vienne entered Mateo's.
    fails(await fast.saveResult({ id: 'fr_mateo_PM1_2026', studentId: 's_mateo', ...result, window: 'PM1' }), 'FORBIDDEN');
    fails(await fast.deleteResult({ id: 'fr_mateo_PM1_2026' }), 'FORBIDDEN');
    expect(await snapshot()).toEqual(before);

    const saved = ok(await fast.saveResult({ studentId: 's_lucia', ...result, enteredById: 'u_admin' } as never)) as unknown as { id: string };
    expect((await db.fastResult.findUniqueOrThrow({ where: { id: saved.id } })).enteredById).toBe('u_ana');
  });

  it('wrong input saves nothing, no private field comes back, and no results is an empty list', async () => {
    as('u_ana');
    const before = await snapshot();
    const bad = [{ scaleScore: 0 }, { scaleScore: 215.5 }, { scaleScore: Number.NaN }, { level: 6 }, { window: 'PM4' }, { schoolYear: '2026' }, { categories: [{ categoryId: 'nope', level: 3 }] }];
    for (const b of bad) fails(await fast.saveResult({ studentId: 's_mateo', ...result, ...b } as never), 'INVALID');
    expect(await snapshot()).toEqual(before);
    const list = ok(await fast.listResults({ studentId: 's_lucia' }));
    for (const key of ['email', 'phone', 'passwordHash', 'adminNotes']) expect(valuesOf(list, key), key).toEqual([]);
    await db.fastResult.deleteMany({ where: { studentId: 's_mateo' } });
    expect(ok(await fast.listResults({ studentId: 's_mateo' })).results).toEqual([]);
  });
});

describe('skills', () => {
  it('only Vienne can add, reorder or archive them, and wrong input saves nothing', async () => {
    const before = await snapshot();
    const skill = { name: 'Not allowed', gradeMin: 1, gradeMax: 2 };
    for (const [who, code] of [['u_ana', 'FORBIDDEN'], ['u_grace', 'FORBIDDEN'], ['u_tom', 'FORBIDDEN'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await taxonomy.upsertSkill(skill), code);
      fails(await taxonomy.upsertSkill({ id: 'sk_fractions', ...skill }), code);
      fails(await taxonomy.archiveSkill({ skillId: 'sk_fractions' }), code);
      fails(await taxonomy.reorderSkills({ subjectId: 'sub_math', skillIds: ['sk_geometry', 'sk_fractions'] }), code);
      fails(await taxonomy.upsertSubject({ name: 'Reading' }), code);
      fails(await taxonomy.archiveSubject({ subjectId: 'sub_math' }), code);
    }
    as(null);
    fails(await taxonomy.listSubjects(), 'UNAUTHENTICATED');
    as('u_admin');
    fails(await taxonomy.upsertSkill({ ...skill, name: '   ' }), 'INVALID');
    fails(await taxonomy.upsertSkill({ ...skill, gradeMin: 4, gradeMax: 2 }), 'INVALID');
    expect(await snapshot()).toEqual(before);
  });
});
