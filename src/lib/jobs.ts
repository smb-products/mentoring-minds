import 'server-only';
import { db } from './db';
import { notify } from './notify';
import { loadSettings } from './settings';
import { addDays, zonedDay, zonedToUtc } from './time';
import { removeObject } from './storage';

/**
 * Scheduled work, run once a day by Vercel Cron (vercel.json → /api/cron/daily).
 * Each job is safe to run twice: it only touches rows it hasn't handled yet.
 */

/** Reminders for confirmed sessions from now until the end of tomorrow (Vienne's time zone). */
export async function sendSessionReminders(now = new Date()) {
  const { timezone } = await loadSettings();
  const today = zonedDay(now, timezone);
  const endOfTomorrow = zonedToUtc(addDays(today, 2), 0, timezone);
  const startOfTomorrow = zonedToUtc(addDays(today, 1), 0, timezone);
  const due = await db.session.findMany({
    where: { status: 'CONFIRMED', reminderSentAt: null, startsAt: { gt: now, lt: endOfTomorrow } },
    include: { student: true, location: true },
  });
  let sent = 0;
  for (const s of due) {
    // Claim first, so a second run can't send the same reminder.
    const claimed = await db.session.updateMany({ where: { id: s.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const when = s.startsAt < startOfTomorrow ? 'today' : 'tomorrow';
    const time = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(s.startsAt);
    const where = s.mode === 'VIDEO' ? 'video call' : s.location?.kind === 'HOME' ? 'at your home' : `at ${s.location?.name ?? 'the studio'}`;
    await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_REMINDER', title: `Reminder: ${s.student.firstName}’s session ${when}`, body: `${time}, ${where}`, href: '/parent/sessions' });
    sent += 1;
  }
  return sent;
}

/** Empties the resource bin after 30 days, removes uploads that were never finished and wrong-code rows over a day old. */
export async function cleanUp(now = new Date()) {
  const binCutoff = new Date(now.getTime() - 30 * 86400000);
  const binned = await db.resource.findMany({ where: { deletedAt: { lt: binCutoff } }, select: { id: true, fileId: true } });
  const purged = await db.resource.deleteMany({ where: { id: { in: binned.map((r) => r.id) } } });
  // Their files go too, unless something else still uses them.
  for (const fileId of new Set(binned.map((r) => r.fileId).filter((x): x is string => !!x))) {
    const inUse = (await db.resource.count({ where: { fileId } })) + (await db.submission.count({ where: { fileId } }));
    if (inUse) continue;
    const file = await db.fileAsset.findUnique({ where: { id: fileId } });
    if (!file) continue;
    await removeObject(file.storageKey);
    await db.fileAsset.deleteMany({ where: { id: fileId } });
  }

  const stale = await db.fileAsset.findMany({ where: { uploadedAt: null, createdAt: { lt: new Date(now.getTime() - 86400000) } } });
  for (const f of stale) {
    await removeObject(f.storageKey);
    await db.fileAsset.deleteMany({ where: { id: f.id, uploadedAt: null } });
  }

  // Wrong invite codes count toward the limit for an hour; after a day they're only clutter.
  const oldFailures = await db.redeemFailure.deleteMany({ where: { at: { lt: new Date(now.getTime() - 86400000) } } });
  return { purgedResources: purged.count, abandonedUploads: stale.length, redeemFailures: oldFailures.count };
}
