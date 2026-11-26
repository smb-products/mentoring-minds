/**
 * S4: reports.getReport checks the session before any lookup, and a family gets the
 * same NOT_FOUND for another family's report (draft or published) as for a missing one.
 */
import { describe, expect, it } from 'vitest';
import { as, fails, freshDemo, ok } from './helpers';
import * as reports from '@/server/reports';

freshDemo();

const MISSING = 'rep_does_not_exist';
/** Sofia is Daniel's (published); Arjun is Priya's (draft). */
const THEIRS_PUBLISHED = 'rep_sofia_1';
const THEIRS_DRAFT = 'rep_arjun_1';
const get = (reportId: string) => reports.getReport({ reportId });

describe('reports.getReport', () => {
  it('says to sign in before it looks anything up, for real ids and a missing one alike', async () => {
    as(null);
    const missing = await get(MISSING);
    fails(missing, 'UNAUTHENTICATED');
    for (const real of [THEIRS_PUBLISHED, THEIRS_DRAFT]) expect(await get(real)).toEqual(missing);
    // Even input it would reject is turned away at the guard, before parsing or the database.
    expect(await get('')).toEqual(missing);
  });

  it('asks a parent still on the preview for their invite code first', async () => {
    as('u_tom');
    const missing = await get(MISSING);
    fails(missing, 'NOT_ACTIVE');
    for (const real of [THEIRS_PUBLISHED, THEIRS_DRAFT]) expect(await get(real)).toEqual(missing);
  });

  it('gives a family the same NOT_FOUND for another family’s report, draft or published, as for a missing one', async () => {
    as('u_ana');
    const missing = await get(MISSING);
    fails(missing, 'NOT_FOUND', /Report not found/);
    expect(await get(THEIRS_PUBLISHED)).toEqual(missing);
    expect(await get(THEIRS_DRAFT)).toEqual(missing);
  });

  it('hides a family’s own draft the same way', async () => {
    as('u_priya');
    expect(await get(THEIRS_DRAFT)).toEqual(await get(MISSING));
  });

  it('still shows a family their own published report', async () => {
    as('u_daniel');
    const r = ok(await get(THEIRS_PUBLISHED));
    expect(r).toMatchObject({ id: THEIRS_PUBLISHED, status: 'PUBLISHED', student: { id: 's_sofia' }, parent: { id: 'u_daniel' } });
    expect('adminNotes' in r.student).toBe(false);
  });

  it('lets Vienne open any report, drafts included, and tells her a missing id is not found', async () => {
    as('u_admin');
    expect(ok(await get(THEIRS_DRAFT))).toMatchObject({ id: THEIRS_DRAFT, status: 'DRAFT', student: { id: 's_arjun' } });
    fails(await get(MISSING), 'NOT_FOUND');
  });
});
