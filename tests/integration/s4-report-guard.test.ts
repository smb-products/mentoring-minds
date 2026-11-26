/**
 * S4: reports.getReport checks the session before any lookup, and a family can't
 * tell another family's report id (draft or published) from a missing one.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok } from './helpers';
import * as reports from '@/server/reports';

freshDemo();

const MISSING = 'rep_does_not_exist';
/** Sofia is Daniel's (published); Arjun is Priya's (draft). */
const THEIRS_PUBLISHED = 'rep_sofia_1';
const THEIRS_DRAFT = 'rep_arjun_1';
const get = (reportId: string) => reports.getReport({ reportId });

describe('reports.getReport', () => {
  it('says to sign in before it looks anything up, whatever the id', async () => {
    as(null);
    const published = await get(THEIRS_PUBLISHED);
    const draft = await get(THEIRS_DRAFT);
    const missing = await get(MISSING);
    fails(missing, 'UNAUTHENTICATED');
    expect(published).toEqual(missing);
    expect(draft).toEqual(missing);
  });

  it('asks a parent on the preview for their invite code, whatever the id', async () => {
    as('u_tom');
    const missing = await get(MISSING);
    fails(missing, 'NOT_ACTIVE');
    expect(await get(THEIRS_PUBLISHED)).toEqual(missing);
    expect(await get(THEIRS_DRAFT)).toEqual(missing);
  });

  it('a paused parent gets NOT_ACTIVE even for their own child’s published report', async () => {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
    try {
      as('u_daniel');
      const own = await get(THEIRS_PUBLISHED);
      const missing = await get(MISSING);
      fails(own, 'NOT_ACTIVE');
      expect(own).toEqual(missing);
      expect(await get(THEIRS_DRAFT)).toEqual(missing);
    } finally {
      await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
    }
  });

  it('gives a family the same FORBIDDEN for another family’s report, draft or published, as for a missing id', async () => {
    as('u_ana');
    const missing = await get(MISSING);
    fails(missing, 'FORBIDDEN');
    expect(await get(THEIRS_PUBLISHED)).toEqual(missing);
    expect(await get(THEIRS_DRAFT)).toEqual(missing);
  });

  it('still tells a family their own child’s unpublished report is not found', async () => {
    as('u_priya');
    fails(await get(THEIRS_DRAFT), 'NOT_FOUND');
  });

  it('shows a family their own child’s published report', async () => {
    as('u_daniel');
    expect(ok(await get(THEIRS_PUBLISHED))).toMatchObject({ id: THEIRS_PUBLISHED, status: 'PUBLISHED', student: { id: 's_sofia' }, parent: { id: 'u_daniel' } });
  });

  it('tells Vienne a missing id is not found, and shows her any report', async () => {
    as('u_admin');
    fails(await get(MISSING), 'NOT_FOUND');
    expect(ok(await get(THEIRS_DRAFT))).toMatchObject({ id: THEIRS_DRAFT, status: 'DRAFT' });
    expect(ok(await get(THEIRS_PUBLISHED))).toMatchObject({ id: THEIRS_PUBLISHED, status: 'PUBLISHED' });
  });
});
