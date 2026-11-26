import { describe, expect, it } from 'vitest';
import { api } from '@/ui/api';
import { live } from '@/ui/api/live';
import { setSessionUser } from '@/mock/core';
import * as mockScheduling from '@/mock/server/scheduling';
import { as, db, freshDemo } from './helpers';

/**
 * W2, src/ui/api/index.js: families and invites are live, and an area still on the mock
 * answers from live when the mock doesn't know the signed-in user (a real sign-up, like Rosa).
 * Decided per call, so seeded families keep the mix.
 */
freshDemo();

const names = (locations: { name: string }[]) => locations.map((l) => l.name);

async function liveOnlyLocation() {
  const name = 'Live-only Library (W2 test)';
  await db.location.upsert({ where: { id: 'loc_w2_live_only' }, update: {}, create: { id: 'loc_w2_live_only', name, kind: 'LIBRARY', active: true } });
  return name;
}

async function rosa(status: 'ACTIVE' | 'PREVIEW' = 'ACTIVE') {
  const user = await db.user.upsert({ where: { email: 'rosa.w2@example.com' }, update: { status }, create: { email: 'rosa.w2@example.com', name: 'Rosa Diaz', status } });
  return user.id;
}

describe('W2: the api switch', () => {
  it('families and invites come from the live adapter', () => {
    expect(api.families).toBe(live.families);
    expect(api.invites).toBe(live.invites);
  });

  it('a seeded family still gets an area on the mock from the mock', async () => {
    const liveOnly = await liveOnlyLocation();
    setSessionUser('u_ana', { silent: true });
    as('u_ana');
    const locations = await api.scheduling.listLocations();
    expect(names(locations)).toEqual(names(await mockScheduling.listLocations()));
    expect(names(locations)).not.toContain(liveOnly);
  });

  it('a real sign-up the mock doesn’t know gets an area on the mock from live', async () => {
    const liveOnly = await liveOnlyLocation();
    const id = await rosa();
    setSessionUser(id, { silent: true });
    as(id);
    // The mock alone refuses her (PR #9's failure on parent Home).
    await expect(mockScheduling.listLocations()).rejects.toThrow('Please sign in.');
    expect(names(await api.scheduling.listLocations())).toContain(liveOnly);
  });

  it('is decided at call time: the same api object switches with the signed-in user', async () => {
    const liveOnly = await liveOnlyLocation();
    const id = await rosa();
    const listLocations = api.scheduling.listLocations;

    setSessionUser(id, { silent: true });
    as(id);
    expect(names(await listLocations())).toContain(liveOnly);

    setSessionUser('u_grace', { silent: true });
    as('u_grace');
    expect(names(await listLocations())).not.toContain(liveOnly);

    setSessionUser(id, { silent: true });
    as(id);
    expect(names(await listLocations())).toContain(liveOnly);
  });

  it('the live fallback keeps the server’s guards: signed out on the server is refused', async () => {
    const id = await rosa();
    setSessionUser(id, { silent: true });
    as(null);
    await expect(api.scheduling.listLocations()).rejects.toThrow(/Please sign in/);
  });

  it('the live fallback keeps the server’s guards: a preview parent can’t read another family', async () => {
    const id = await rosa('PREVIEW');
    setSessionUser(id, { silent: true });
    as(id);
    await expect(api.families.getFamily({ parentId: 'u_daniel' })).rejects.toThrow();
  });
});
