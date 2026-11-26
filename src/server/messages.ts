'use server';
/**
 * server/messages — one thread per family. Unread is a badge for parents, not a
 * notification; Vienne also gets a notification for each new parent message.
 * Contract: tests/contract/mock/server/messages.js (the frozen mock)
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActive, requireAdmin, requireUser } from '@/lib/guards';
import { action, found, query } from '@/lib/result';
import { id, parse } from '@/lib/validate';
import { notifyAdmins } from '@/lib/notify';
import { countUnread, unreadWhere } from '@/lib/unread';

type Viewer = { id: string; role: string };

/** Vienne passes conversationId; a parent always gets their own thread. */
async function threadFor(user: Viewer, conversationId?: string) {
  const conv = user.role === 'ADMIN' ? (conversationId ? await db.conversation.findUnique({ where: { id: conversationId } }) : null) : await db.conversation.findUnique({ where: { parentId: user.id } });
  return found(conv, 'Conversation');
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

export const getThread = query(async (input: { conversationId?: string } = {}) => {
  const user = await requireActive();
  const { conversationId } = parse(z.object({ conversationId: id.optional() }), input);
  const conv = await threadFor(user, conversationId);
  const [parent, messages, unread] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: conv.parentId }, select: { id: true, name: true } }),
    db.message.findMany({ where: { conversationId: conv.id }, orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, name: true, role: true } } } }),
    db.message.count({ where: unreadWhere(conv, user) }),
  ]);
  return { ...conv, parent, unread, messages };
});

export const sendMessage = action(async (input: { conversationId?: string; body: string }) => {
  const user = await requireActive();
  const v = parse(z.object({ conversationId: id.optional(), body: z.string().trim().min(1, 'Write a message first').max(4000, 'That message is too long') }), input);
  const conv = await threadFor(user, v.conversationId);
  const now = new Date();
  const [msg] = await db.$transaction([
    db.message.create({ data: { conversationId: conv.id, senderId: user.id, body: v.body, createdAt: now } }),
    db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now, ...(user.role === 'ADMIN' ? { adminLastReadAt: now } : { parentLastReadAt: now }) } }),
  ]);
  if (user.role !== 'ADMIN') await notifyAdmins({ type: 'MESSAGE_RECEIVED', title: `${user.name} sent a message`, body: v.body.slice(0, 80), href: `/admin/messages/${conv.id}` });
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
