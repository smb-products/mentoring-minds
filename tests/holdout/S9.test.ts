/** S9 holdouts: what a paused parent’s opened thread carries and touches, wrong input, and a family with no messages. */
import { afterEach, describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, valuesOf } from '../../tests/integration/helpers';
import * as messages from '@/server/messages';
import * as families from '@/server/families';

freshDemo();

const LINK = 'https://meet.example.com/HOLDOUT-S9-ROOM';
const NOTE = 'HOLDOUT-S9-ADMIN-NOTE';
const HASH = 'HOLDOUT-S9-INVITE-HASH';
const SECRET_KEYS = ['passwordHash', 'adminNotes', 'meetingUrl', 'defaultMeetingUrl', 'codeHash', 'codeHint', 'answer', 'answers', 'acceptedAnswers', 'email', 'phone', 'failedLogins', 'sessionVersion'];

const setStatus = (id: string, status: 'ACTIVE' | 'PAUSED' | 'PREVIEW') => db.user.update({ where: { id }, data: { status } });
const threadOf = (parentId: string) => db.conversation.findUniqueOrThrow({ where: { parentId }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
const alerts = () => db.notification.count({ where: { type: 'MESSAGE_RECEIVED' } });

afterEach(async () => {
  await setStatus('u_grace', 'ACTIVE');
  await setStatus('u_daniel', 'ACTIVE');
});

describe('S9 holdouts', () => {
  it('a paused Grace gets only her own thread, with nothing private, and can’t touch Ana’s', async () => {
    await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: LINK } });
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: LINK } });
    await db.student.updateMany({ data: { adminNotes: NOTE } });
    await db.invite.updateMany({ data: { codeHint: HASH } });
    const ana = await threadOf('u_ana');
    const anaMarker = 'HOLDOUT-S9-ANA-ONLY';
    await db.message.create({ data: { conversationId: ana.id, senderId: 'u_admin', body: anaMarker } });
    await db.conversation.update({ where: { id: ana.id }, data: { parentLastReadAt: null } });
    const anaBefore = await threadOf('u_ana');

    await setStatus('u_grace', 'PAUSED');
    as('u_grace');
    const replies = [
      ok(await messages.getThread()),
      ok(await messages.getThread({ conversationId: ana.id })),
      ok(await messages.sendMessage({ conversationId: ana.id, body: 'HOLDOUT-S9 from Grace' })),
      ok(await messages.getThread()),
    ];
    ok(await messages.markThreadRead({ conversationId: ana.id }));
    ok(await messages.unreadCount());

    const wire = JSON.stringify(replies);
    for (const secret of [LINK, NOTE, HASH, anaMarker, 'u_ana', ana.id]) expect(wire, secret).not.toContain(secret);
    for (const key of SECRET_KEYS) expect(valuesOf(replies, key), key).toEqual([]);
    expect(await threadOf('u_ana')).toEqual(anaBefore);
  });

  it('wrong input from a paused parent saves nothing and alerts nobody; a forged sender is ignored', async () => {
    await setStatus('u_daniel', 'PAUSED');
    as('u_daniel');
    const [count, alerted] = [await db.message.count(), await alerts()];
    for (const input of [
      { body: '' }, { body: '   \n\t ' }, { body: 'x'.repeat(4001) }, { body: 42 }, { body: null }, {},
      { body: 'hi', conversationId: '' }, { body: 'hi', conversationId: { not: null } }, { body: 'hi', conversationId: 'x'.repeat(500) },
    ]) {
      fails(await messages.sendMessage(input as never), 'INVALID');
    }
    fails(await messages.getThread({ conversationId: { contains: '' } } as never), 'INVALID');
    expect(await db.message.count()).toBe(count);
    expect(await alerts()).toBe(alerted);

    const mine = await threadOf('u_daniel');
    const sent = ok(await messages.sendMessage({ body: '  HOLDOUT-S9 forged  ', senderId: 'u_admin', parentId: 'u_grace', createdAt: '2000-01-01T00:00:00Z' } as never));
    expect(sent).toMatchObject({ senderId: 'u_daniel', conversationId: mine.id, body: 'HOLDOUT-S9 forged' });
    expect(new Date(sent.createdAt).getFullYear()).toBeGreaterThan(2000);
  });

  it('empty thread and no thread: a paused parent gets what an active one does, never another family’s; Vienne’s pause and preview take effect at once', async () => {
    const daniel = await threadOf('u_daniel');
    const graces = await threadOf('u_grace');
    await db.message.deleteMany({ where: { conversationId: daniel.id } });
    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'PAUSED' }));
    as('u_daniel');
    expect(ok(await messages.getThread())).toMatchObject({ id: daniel.id, messages: [], unread: 0 });

    await db.conversation.delete({ where: { id: daniel.id } });
    const answers: string[] = [];
    for (const status of ['ACTIVE', 'PAUSED'] as const) {
      await setStatus('u_daniel', status);
      as('u_daniel');
      const count = await db.message.count();
      answers.push(JSON.stringify([await messages.getThread({ conversationId: graces.id }), await messages.sendMessage({ conversationId: graces.id, body: 'hello' })]));
      expect(await db.message.count()).toBe(count);
    }
    expect(answers[1]).toBe(answers[0]);
    expect(answers[1]).not.toContain(graces.messages[0].body);

    as('u_admin');
    ok(await families.setParentStatus({ parentId: 'u_daniel', status: 'PREVIEW' }));
    as('u_daniel');
    fails(await messages.getThread(), 'NOT_ACTIVE');
    fails(await messages.sendMessage({ body: 'still here?' }), 'NOT_ACTIVE');
  });
});
