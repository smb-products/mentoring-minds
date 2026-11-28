'use server';
/**
 * server/messages — one thread per family. Unread is a badge for parents, not a
 * notification; Vienne also gets a notification for each new parent message.
 * Contract: tests/contract/mock/server/messages.js (the frozen mock)
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireCanMessage, requireUser } from '@/lib/guards';
import { action, found, need, query } from '@/lib/result';
import { id, parse } from '@/lib/validate';
import { notifyAdmins } from '@/lib/notify';
import { countUnread, unreadWhere } from '@/lib/unread';

/** S36: messages a parent can send in 24 hours. Vienne is never limited. */
const MESSAGES_PER_DAY = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

type Viewer = { id: string; role: string };

/** Vienne passes conversationId; a parent always gets their own thread (or none yet). */
const findThread = async (user: Viewer, conversationId?: string) =>
  user.role === 'ADMIN' ? (conversationId ? await db.conversation.findUnique({ where: { id: conversationId } }) : null) : await db.conversation.findUnique({ where: { parentId: user.id } });

async function threadFor(user: Viewer, conversationId?: string) {
  return found(await findThread(user, conversationId), 'Conversation');
}

export const listThreads = query(async () => {
  const user = await requireAdmin();
  const convs = await db.conversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    include: {
      parent: { select: { id: true, name: true, students: { where: { status: { not: 'ARCHIVED' } }, select: { id: true, firstName: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  return Promise.all(
    convs.map(async ({ parent, messages, ...c }) => ({
      ...c,
      parent: { id: parent.id, name: parent.name },
      students: parent.students,
      lastMessage: messages[0] ?? null,
      unread: await db.message.count({ where: unreadWhere(c, user) }),
    })),
  );
});

/** An active or a paused family (the paused notice says to message Vienne); a preview one gets NOT_ACTIVE. */
export const getThread = query(async (input: { conversationId?: string } = {}) => {
  const user = await requireCanMessage();
  const { conversationId } = parse(z.object({ conversationId: id.optional() }), input);
  const mine = await findThread(user, conversationId);
  // S36: a parent who signed up without a code has no thread until a child is added. Empty, not an error.
  // The id is '' (no thread to name): sendMessage still needs a thread, so nothing can be posted to it.
  if (!mine && user.role !== 'ADMIN') return { id: '', parentId: user.id, lastMessageAt: null, adminLastReadAt: null, parentLastReadAt: null, parent: { id: user.id, name: user.name }, unread: 0, messages: [] };
  const conv = found(mine, 'Conversation');
  const [parent, messages, unread] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: conv.parentId }, select: { id: true, name: true } }),
    db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, role: true } } } }),
    db.message.count({ where: unreadWhere(conv, user) }),
  ]);
  return { ...conv, parent, unread, messages };
});

export const sendMessage = action(async (input: { conversationId?: string; body: string }) => {
  const user = await requireCanMessage();
  const v = parse(z.object({ conversationId: id.optional(), body: z.string().trim().min(1, 'Write a message first').max(4000, 'That message is too long') }), input);
  const conv = await threadFor(user, v.conversationId);
  const now = new Date();
  const msg = await db.$transaction(async (tx) => {
    if (user.role !== 'ADMIN') {
      // S36: one message at a time per parent, so taps at once can't both take the last slot. Vienne is never limited.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`message:${user.id}`}))`;
      const today = await tx.message.count({ where: { senderId: user.id, createdAt: { gt: new Date(now.getTime() - DAY_MS) } } });
      need(today < MESSAGES_PER_DAY, 'That’s a lot of messages today. Vienne will read them; try again tomorrow.', 'LIMIT');
    }
    const created = await tx.message.create({ data: { conversationId: conv.id, senderId: user.id, body: v.body, createdAt: now } });
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, ...(user.role === 'ADMIN' ? { adminLastReadAt: now } : { parentLastReadAt: now }) } });
    return created;
  });
  if (user.role !== 'ADMIN') await notifyAdmins({ type: 'MESSAGE_RECEIVED', title: `${user.name} sent a message`, body: v.body.slice(0, 80), href: `/admin/messages/${conv.id}`, about: conv.id, parentId: conv.parentId });
  return msg;
});

export const markThreadRead = action(async (input: { conversationId?: string } = {}) => {
  const user = await requireUser();
  const { conversationId } = parse(z.object({ conversationId: id.optional() }), input);
  const where = user.role === 'ADMIN' ? (conversationId ? { id: conversationId } : null) : { parentId: user.id };
  if (where) await db.conversation.updateMany({ where, data: user.role === 'ADMIN' ? { adminLastReadAt: new Date() } : { parentLastReadAt: new Date() } });
  return null;
});

export const unreadCount = query(async () => countUnread(await requireUser()));
