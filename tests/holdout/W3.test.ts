/** W3 holdouts: a family can't reach another family's messages, alerts or push address. */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../integration/helpers';
import * as messages from '@/server/messages';
import * as notifications from '@/server/notifications';

freshDemo();

describe('W3: the wrong person', () => {
  it('naming another family’s thread reads, writes and marks only your own', async () => {
    const anaBefore = await db.conversation.findUniqueOrThrow({ where: { id: 'conv_ana' } });
    const anaCount = await db.message.count({ where: { conversationId: 'conv_ana' } });

    as('u_grace');
    const thread = ok(await messages.getThread({ conversationId: 'conv_ana' }));
    expect(thread.parentId).toBe('u_grace');
    expect(JSON.stringify(thread)).not.toContain('could Lucia get an extra session');
    for (const key of ['passwordHash', 'adminNotes', 'codeHash', 'email']) expect(valuesOf(thread, key)).toEqual([]);
    ok(await messages.markThreadRead({ conversationId: 'conv_ana' }));
    ok(await messages.sendMessage({ conversationId: 'conv_ana', body: 'From Grace only' }));

    expect((await db.message.findFirstOrThrow({ where: { body: 'From Grace only' } })).conversationId).toBe('conv_grace');
    expect(await db.message.count({ where: { conversationId: 'conv_ana' } })).toBe(anaCount);
    expect(await db.conversation.findUniqueOrThrow({ where: { id: 'conv_ana' } })).toEqual(anaBefore);
    fails(await messages.listThreads(), 'FORBIDDEN');
  });

  it('a PREVIEW parent and a signed-out visitor get no messages; blank messages are refused', async () => {
    const count = await db.message.count();
    for (const [who, code] of [['u_tom', 'NOT_ACTIVE'], [null, 'UNAUTHENTICATED']] as const) {
      as(who);
      fails(await messages.getThread({ conversationId: 'conv_ana' }), code);
      fails(await messages.sendMessage({ conversationId: 'conv_ana', body: 'hello' }), code);
      fails(await messages.listThreads(), who ? 'FORBIDDEN' : code);
    }
    as(null);
    fails(await notifications.listForUser(), 'UNAUTHENTICATED');
    fails(await notifications.markAllRead(), 'UNAUTHENTICATED');
    as('u_ana');
    fails(await messages.sendMessage({ body: '   \n ' }), 'INVALID', /Write a message first/);
    fails(await messages.sendMessage({ body: 'x'.repeat(4001) }), 'INVALID', /too long/);
    expect(await db.message.count()).toBe(count);
  });

  it('alerts and this device’s push address belong to their owner', async () => {
    const adminAlert = await db.notification.findFirstOrThrow({ where: { userId: 'u_admin', readAt: null } });
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/holdout-ana', keys: { p256dh: 'demo-p256dh', auth: 'demo-auth' } };
    as('u_ana');
    ok(await notifications.savePushSubscription(sub));

    as('u_grace');
    expect(ok(await notifications.listForUser()).every((n) => n.userId === 'u_grace')).toBe(true);
    ok(await notifications.markRead({ notificationId: adminAlert.id }));
    ok(await notifications.markAllRead());
    ok(await notifications.removePushSubscription({ endpoint: sub.endpoint }));
    expect((await db.notification.findUniqueOrThrow({ where: { id: adminAlert.id } })).readAt).toBeNull();
    expect(await db.pushSubscription.count({ where: { endpoint: sub.endpoint, userId: 'u_ana' } })).toBe(1);

    as(null);
    fails(await notifications.removePushSubscription({ endpoint: sub.endpoint }), 'UNAUTHENTICATED');
    fails(await notifications.savePushSubscription(sub), 'UNAUTHENTICATED');
    as('u_ana');
    fails(await notifications.savePushSubscription({ ...sub, endpoint: 'https://example.com/push' }), 'INVALID');
  });
});
