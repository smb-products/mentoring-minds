import { describe, expect, it } from 'vitest';
import { api } from '@/ui/api';
import { live } from '@/ui/api/live';
import { setSessionUser } from '@/mock/core';
import * as mockReports from '@/mock/server/reports';
import { as, db, freshDemo } from './helpers';

/**
 * W2, src/ui/api/index.js: families and invites are live, and an area still on the mock
 * answers from live when the mock doesn't know the signed-in user (a real sign-up, like Rosa).
 * Decided per call, so seeded families keep the mix.
 * The area on the mock here is `reports` (live from W7); it was `scheduling` until W6.
 */
freshDemo();

const LIVE_ONLY = 'Live-only report (W2 test)';
const summaries = (reports: { summary: string }[]) => reports.map((r) => r.summary);

/** A published report that exists only in the database, never in the mock. */
async function liveOnlyReport(studentId: string) {
  const id = `rep_w2_live_only_${studentId}`;
  await db.progressReport.upsert({
    where: { id },
    update: {},
    create: { id, studentId, summary: LIVE_ONLY, status: 'PUBLISHED', publishedAt: new Date(), periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-10-01') },
  });
}

async function rosa(status: 'ACTIVE' | 'PREVIEW' = 'ACTIVE') {
  const user = await db.user.upsert({ where: { email: 'rosa.w2@example.com' }, update: { status }, create: { email: 'rosa.w2@example.com', name: 'Rosa Diaz', status } });
  return user.id;
}

/** Rosa's child: only in the database, with a live-only report. */
async function rosaKid(parentId: string) {
  const kid = await db.student.upsert({ where: { id: 'st_w2_rosa_kid' }, update: {}, create: { id: 'st_w2_rosa_kid', parentId, firstName: 'Inés', lastName: 'Diaz', grade: 3 } });
  await liveOnlyReport(kid.id);
  return kid.id;
}

describe('W2: the api switch', () => {
  it('families and invites come from the live adapter', () => {
    expect(api.families).toBe(live.families);
    expect(api.invites).toBe(live.invites);
  });

  it('a seeded family still gets an area on the mock from the mock', async () => {
    await liveOnlyReport('s_lucia');
    setSessionUser('u_ana', { silent: true });
    as('u_ana');
    const reports = await api.reports.listForStudent({ studentId: 's_lucia' });
    expect(summaries(reports)).toEqual(summaries(await mockReports.listForStudent({ studentId: 's_lucia' })));
    expect(summaries(reports)).not.toContain(LIVE_ONLY);
  });

  it('a real sign-up the mock doesn’t know gets an area on the mock from live', async () => {
    const id = await rosa();
    const kid = await rosaKid(id);
    setSessionUser(id, { silent: true });
    as(id);
    // The mock alone refuses her (PR #9's failure on parent Home).
    await expect(mockReports.listForStudent({ studentId: kid })).rejects.toThrow('Please sign in.');
    expect(summaries(await api.reports.listForStudent({ studentId: kid }))).toContain(LIVE_ONLY);
  });

  it('is decided at call time: the same api object switches with the signed-in user', async () => {
    const id = await rosa();
    const kid = await rosaKid(id);
    await liveOnlyReport('s_noah');
    const listForStudent = api.reports.listForStudent;

    setSessionUser(id, { silent: true });
    as(id);
    expect(summaries(await listForStudent({ studentId: kid }))).toContain(LIVE_ONLY);

    setSessionUser('u_grace', { silent: true });
    as('u_grace');
    expect(summaries(await listForStudent({ studentId: 's_noah' }))).not.toContain(LIVE_ONLY);

    setSessionUser(id, { silent: true });
    as(id);
    expect(summaries(await listForStudent({ studentId: kid }))).toContain(LIVE_ONLY);
  });

  it('the live fallback keeps the server’s guards: signed out on the server is refused', async () => {
    const id = await rosa();
    const kid = await rosaKid(id);
    setSessionUser(id, { silent: true });
    as(null);
    await expect(api.reports.listForStudent({ studentId: kid })).rejects.toThrow(/Please sign in/);
  });

  it('the live fallback keeps the server’s guards: a preview parent can’t read another family', async () => {
    const id = await rosa('PREVIEW');
    setSessionUser(id, { silent: true });
    as(id);
    await expect(api.families.getFamily({ parentId: 'u_daniel' })).rejects.toThrow();
  });
});
