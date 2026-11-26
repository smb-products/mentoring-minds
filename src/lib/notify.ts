import 'server-only';
import { after } from 'next/server';
import { db } from './db';
import { pushToUser } from './push';

/**
 * Internal helpers, deliberately NOT in a 'use server' file: every export of a
 * 'use server' module is a public endpoint, and these must only be called by
 * other server code.
 *
 * Every notification goes to the in-app feed; it's also pushed to the user's
 * devices when push is set up. A failed push never fails the action.
 *
 * Call these AFTER a transaction commits, so nobody is told about a change that
 * was rolled back.
 */
export type NewNotification = {
  userId: string;
  audience: 'ADMIN' | 'PARENT';
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  /** The id of the record the push is about (thread, submission, session, report, invite). Only names the push's tag; not stored. */
  about?: string | null;
  /** S23b: the child this alert is about, stored so deleting the child removes it by id. Passed by the caller. */
  studentId?: string | null;
  /** S23b: the family (the parent's user id) this alert is about, stored so deleting the family removes it by id. */
  parentId?: string | null;
};

export async function notify({ about, ...n }: NewNotification) {
  const row = await db.notification.create({ data: { ...n, body: n.body ?? null, href: n.href ?? null, studentId: n.studentId ?? null, parentId: n.parentId ?? null, channel: 'IN_APP', sentAt: new Date() } });
  afterResponse(() => pushToUser(n.userId, { title: n.title, body: n.body, href: n.href, tag: pushTag(n.type, about) }));
  return row;
}

/**
 * The push's tag: a newer push with the same tag replaces the older one on the phone, so it
 * names the record the push is about, never words two families can share (two children can
 * both be called Mateo). A message is about its thread; anything else is its type and the id
 * of its record. A push about no record keeps its type alone.
 */
function pushTag(type: string, about?: string | null) {
  if (!about) return type;
  return type.startsWith('MESSAGE') ? `thread:${about}` : `${type}:${about}`;
}

/**
 * Runs `task` after the response is sent. On Vercel a function can be frozen as soon
 * as it responds, so un-awaited work (like sending a push) must go through after().
 * Outside a request (tests, scripts, the cron's direct calls) it just runs now.
 */
function afterResponse(task: () => Promise<unknown>) {
  const run = () => task().catch((e) => console.error('after-response task failed', e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Notify Vienne (every admin account). */
export async function notifyAdmins(n: Omit<NewNotification, 'userId' | 'audience'>) {
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ ...n, userId: a.id, audience: 'ADMIN' })));
}
