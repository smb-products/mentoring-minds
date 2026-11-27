/** The daily job: reminders, clean-up and the cron route. */
import { describe, expect, it } from 'vitest';
import { db, freshDemo } from './helpers';
import { cleanUp, sendSessionReminders } from '@/lib/jobs';
import { GET as cron } from '@/app/api/cron/daily/route';

freshDemo();

describe('daily reminders', () => {
  it('reminds families about sessions today and tomorrow, once', async () => {
    const sent = await sendSessionReminders();
    expect(sent).toBeGreaterThan(0);
    const n = await db.notification.findFirstOrThrow({ where: { type: 'SESSION_REMINDER', createdAt: { gt: new Date(Date.now() - 60000) } } });
    expect(n.title).toMatch(/session (today|tomorrow)$/);
    expect(n.body).toMatch(/\d{1,2}:\d{2}\s?[AP]M/);
    expect(await sendSessionReminders()).toBe(0); // running twice sends nothing new
  });

  it('the cron route needs the secret', async () => {
    process.env.CRON_SECRET = 'cron-secret-for-tests';
    expect((await cron(new Request('http://localhost/api/cron/daily'))).status).toBe(401);
    expect((await cron(new Request('http://localhost/api/cron/daily', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    const res = await cron(new Request('http://localhost/api/cron/daily', { headers: { authorization: 'Bearer cron-secret-for-tests' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reminders: 0, purgedResources: 0 });
  });

  it('clean-up empties the 30-day bin and removes abandoned uploads', async () => {
    await db.resource.update({ where: { id: 'res_counting' }, data: { deletedAt: new Date(Date.now() - 31 * 86400000) } });
    const stale = await db.fileAsset.create({ data: { storageKey: 'files/stale', filename: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10, uploadedById: 'u_ana', createdAt: new Date(Date.now() - 2 * 86400000) } });
    const r = await cleanUp();
    expect(r).toEqual({ purgedResources: 1, abandonedUploads: 1, redeemFailures: 0 });
    expect(await db.fileAsset.findUnique({ where: { id: stale.id } })).toBeNull();
  });
});
