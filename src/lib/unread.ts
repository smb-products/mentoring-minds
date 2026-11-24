import 'server-only';
import { db } from './db';

type Viewer = { id: string; role: string };
type Conv = { id: string; adminLastReadAt: Date | null; parentLastReadAt: Date | null };

const lastReadOf = (c: Conv, user: Viewer) => (user.role === 'ADMIN' ? c.adminLastReadAt : c.parentLastReadAt);

/** Messages in `c` from the other side since `user` last read it. */
export const unreadWhere = (c: Conv, user: Viewer) => {
  const lastRead = lastReadOf(c, user);
  return { conversationId: c.id, senderId: { not: user.id }, ...(lastRead && { createdAt: { gt: lastRead } }) };
};

/** Unread messages across Vienne's threads, or in a parent's own thread. */
export async function countUnread(user: Viewer) {
  const convs = await db.conversation.findMany({ where: user.role === 'ADMIN' ? {} : { parentId: user.id } });
  const counts = await Promise.all(convs.map((c) => db.message.count({ where: unreadWhere(c, user) })));
  return counts.reduce((a, b) => a + b, 0);
}
