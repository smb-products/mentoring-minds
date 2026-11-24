/** server/notifications — in-app only. channel kept for future email/SMS. */
import { action, commit, getDb, newId, nowIso, requireAdmin, requireUser } from '../core';

/** Internal: called by other modules. Not exposed as a server action. */
export function notify({ userId, audience, type, title, body = null, href = null }) {
  const createdAt = nowIso();
  getDb().notifications.unshift({ id: newId('ntf'), userId, audience, type, title, body, href, channel: 'IN_APP', readAt: null, sentAt: createdAt, createdAt });
}

/** Notify Vienne (every admin). */
export function notifyAdmins(payload) {
  getDb().users.filter((u) => u.role === 'ADMIN').forEach((u) => notify({ ...payload, userId: u.id, audience: 'ADMIN' }));
}

export async function listForUser() {
  const user = requireUser();
  return getDb().notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const markRead = action(async ({ notificationId }) => {
  const user = requireUser();
  commit((db) => {
    const n = db.notifications.find((x) => x.id === notificationId && x.userId === user.id);
    if (n && !n.readAt) n.readAt = nowIso();
  });
});

export const markAllRead = action(async () => {
  const user = requireUser();
  commit((db) => db.notifications.forEach((n) => n.userId === user.id && !n.readAt && (n.readAt = nowIso())));
});

/** Cron: GET /api/cron/reminders. Day-before reminders for confirmed sessions. */
export async function runDailyReminders() {
  requireAdmin();
  const tomorrow = Date.now() + 86400000;
  return commit((db) => {
    let sent = 0;
    db.sessions
      .filter((s) => s.status === 'CONFIRMED' && !s.reminderSentAt && new Date(s.startsAt).getTime() < tomorrow && new Date(s.startsAt).getTime() > Date.now())
      .forEach((s) => {
        const student = db.students.find((x) => x.id === s.studentId);
        notify({ userId: student.parentId, audience: 'PARENT', type: 'SESSION_REMINDER', title: `Reminder: ${student.firstName}’s session tomorrow`, href: '/parent/sessions' });
        s.reminderSentAt = nowIso();
        sent += 1;
      });
    return sent;
  });
}
