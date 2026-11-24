import { describe, expect, it } from 'vitest';
import { as, freshDemo, ok } from './helpers';
import * as dashboard from '@/server/dashboard';

freshDemo();

describe('harness', () => {
  it('runs server functions as a demo user against Postgres', async () => {
    as('u_admin');
    const today = ok(await dashboard.getAdminToday());
    expect(today.pendingRequests.length).toBe(4);
    expect(typeof today.date).toBe('string');
  });
});
