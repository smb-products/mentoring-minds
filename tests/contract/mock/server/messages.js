/** server/messages — one thread per family. Unread = badge, not a notification, for parents. */
import { action, commit, getDb, need, newId, nowIso, requireActive, requireAdmin, requireUser } from '../core';
import { notifyAdmins } from './notifications';

const unreadFor = (conv, user, db) => {
  const lastRead = user.role === 'ADMIN' ? conv.adminLastReadAt : conv.parentLastReadAt;
  return db.messages.filter((m) => m.conversationId === conv.id && m.senderId !== user.id && (!lastRead || m.createdAt > lastRead)).length;
};

export async function listThreads() {
  const user = requireAdmin();
  const db = getDb();
  return db.conversations
    .map((c) => {
      const parent = db.users.find((u) => u.id === c.parentId);
      const last = db.messages.filter((m) => m.conversationId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      const students = db.students.filter((s) => s.parentId === parent.id && s.status !== 'ARCHIVED').map((s) => ({ id: s.id, firstName: s.firstName }));
      return { ...c, parent: { id: parent.id, name: parent.name }, students, lastMessage: last, unread: unreadFor(c, user, db) };
    })
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Admin passes conversationId; parents get their own thread. */
export async function getThread({ conversationId } = {}) {
  const user = requireActive();
  const db = getDb();
  const conv = user.role === 'ADMIN' ? db.conversations.find((c) => c.id === conversationId) : db.conversations.find((c) => c.parentId === user.id);
  need(conv, 'Conversation not found');
  const parent = db.users.find((u) => u.id === conv.parentId);
  return {
    ...conv,
    parent: { id: parent.id, name: parent.name },
    unread: unreadFor(conv, user, db),
    messages: db.messages
      .filter((m) => m.conversationId === conv.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({ ...m, sender: { id: m.senderId, name: db.users.find((u) => u.id === m.senderId)?.name, role: db.users.find((u) => u.id === m.senderId)?.role } })),
  };
}

export const sendMessage = action(async ({ conversationId, body }) => {
  const user = requireActive();
  need(body?.trim(), 'Write a message first');
  return commit((db) => {
    const conv = user.role === 'ADMIN' ? db.conversations.find((c) => c.id === conversationId) : db.conversations.find((c) => c.parentId === user.id);
    need(conv, 'Conversation not found');
    const now = nowIso();
    const msg = { id: newId('m'), conversationId: conv.id, senderId: user.id, body: body.trim(), createdAt: now };
    db.messages.push(msg);
    conv.lastMessageAt = now;
    if (user.role === 'ADMIN') conv.adminLastReadAt = now;
    else {
      conv.parentLastReadAt = now;
      notifyAdmins({ type: 'MESSAGE_RECEIVED', title: `${user.name} sent a message`, body: body.trim().slice(0, 80), href: '/admin/messages' });
    }
    return msg;
  });
});

export const markThreadRead = action(async ({ conversationId } = {}) => {
  const user = requireUser();
  commit((db) => {
    const conv = user.role === 'ADMIN' ? db.conversations.find((c) => c.id === conversationId) : db.conversations.find((c) => c.parentId === user.id);
    if (!conv) return;
    if (user.role === 'ADMIN') conv.adminLastReadAt = nowIso();
    else conv.parentLastReadAt = nowIso();
  });
});

export async function unreadCount() {
  const user = requireUser();
  const db = getDb();
  const convs = user.role === 'ADMIN' ? db.conversations : db.conversations.filter((c) => c.parentId === user.id);
  return convs.reduce((n, c) => n + unreadFor(c, user, db), 0);
}
