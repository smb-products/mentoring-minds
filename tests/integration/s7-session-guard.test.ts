/**
 * S7: scheduling.cancelSession checks the session before any lookup, and a family
 * can't tell another family's session id from a missing one. joinCall, the other
 * family write that takes a session id, is held to the same rules.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import * as scheduling from '@/server/scheduling';

freshDemo();

const MISSING = 'ses_does_not_exist';

const calls = {
  cancelSession: (sessionId: string) => scheduling.cancelSession({ sessionId, reason: 'Testing' }),
  joinCall: (sessionId: string) => scheduling.joinCall({ sessionId }),
};

/** Grace's upcoming session, far enough out that she could still cancel it herself. */
let theirs: string;
const snapshot = async () => ({
  session: await db.session.findUniqueOrThrow({ where: { id: theirs } }),
  notifications: await db.notification.count(),
});

beforeEach(async () => {
  theirs = (await upcomingSession({ parentId: 'u_grace', minHoursAway: 48 })).id;
});

describe.each(Object.keys(calls) as (keyof typeof calls)[])('%s', (name) => {
  const call = calls[name];

  it('says to sign in before it looks anything up, for a real id and a missing one alike', async () => {
    const before = await snapshot();
    as(null);
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(missing, 'UNAUTHENTICATED');
    expect(real).toEqual(missing);
    expect(await snapshot()).toEqual(before);
  });

  it('asks a parent still on the preview for their invite code, whatever the id', async () => {
    const before = await snapshot();
    as('u_tom');
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(missing, 'NOT_ACTIVE');
    expect(real).toEqual(missing);
    expect(await snapshot()).toEqual(before);
  });

  describe('a paused parent', () => {
    beforeEach(() => db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } }));
    afterEach(() => db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } }));

    it('gets NOT_ACTIVE even for their own child’s session, and nothing changes', async () => {
      const before = await snapshot();
      as('u_grace');
      const own = await call(theirs);
      const missing = await call(MISSING);
      fails(own, 'NOT_ACTIVE');
      expect(own).toEqual(missing);
      expect(await snapshot()).toEqual(before);
    });
  });

  it('gives a family the same FORBIDDEN for another family’s session as for a missing one', async () => {
    const before = await snapshot();
    as('u_ana');
    const real = await call(theirs);
    const missing = await call(MISSING);
    fails(real, 'FORBIDDEN');
    expect(real).toEqual(missing);
    expect(await snapshot()).toEqual(before);
  });

  it('tells Vienne a missing id is not found', async () => {
    const before = await snapshot();
    as('u_admin');
    fails(await call(MISSING), 'NOT_FOUND');
    expect(await snapshot()).toEqual(before);
  });
});

describe('cancelling still works for the right people', () => {
  it('a family cancels their own session and Vienne is told', async () => {
    const before = await db.notification.count({ where: { type: 'SESSION_CANCELLED_BY_PARENT' } });
    as('u_grace');
    expect(ok(await scheduling.cancelSession({ sessionId: theirs })).status).toBe('CANCELLED');
    expect(await db.notification.count({ where: { type: 'SESSION_CANCELLED_BY_PARENT' } })).toBeGreaterThan(before);
  });

  it('Vienne cancels any family’s session', async () => {
    as('u_admin');
    expect(ok(await scheduling.cancelSession({ sessionId: theirs })).status).toBe('CANCELLED');
  });
});
