import 'server-only';
import { db } from './db';
import { notify } from './notify';
import { loadSettings } from './settings';
import { addDays, zonedDay, zonedToUtc } from './time';
import { removeObject } from './storage';
import { fileIdsInUse } from './files';
import type { Prisma } from '@prisma/client';

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
    await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_REMINDER', title: `Reminder: ${s.student.firstName}’s session ${when}`, body: `${time}, ${where}`, href: '/parent/sessions', about: s.id, studentId: s.studentId });
    sent += 1;
  }
  return sent;
}

/**
 * A finished upload that nothing uses is removed once it is this many days old.
 * Photos on the answer sheet are only attached when the sheet is handed in, so this
 * leaves a family a week to finish one; after that the photo can't be attached anyway
 * (the sheet only keeps it until the page is closed).
 */
export const ORPHAN_FILE_DAYS = 7;

/**
 * L2: invite requests (a stranger's name, email, phone and message) are kept this many days. The same value
 * as REQUEST_KEEP_DAYS in src/server/requests.ts, which can't export it ('use server'); a test checks they match.
 */
export const REQUEST_KEEP_DAYS = 90;

/** Deletes invite requests older than REQUEST_KEEP_DAYS, and their alerts by Notification.inviteRequestId. Nothing else. */
export async function deleteOldInviteRequests(now = new Date()) {
  const cutoff = new Date(now.getTime() - REQUEST_KEEP_DAYS * 86400000);
  const old = await db.inviteRequest.findMany({ where: { createdAt: { lt: cutoff } }, select: { id: true } });
  if (!old.length) return 0;
  const ids = old.map((r) => r.id);
  await db.$transaction([db.notification.deleteMany({ where: { inviteRequestId: { in: ids } } }), db.inviteRequest.deleteMany({ where: { id: { in: ids } } })]);
  return ids.length;
}

/**
 * Row first, in one statement that re-checks the relations (their foreign keys would only
 * set the column to null), so a file attached since the in-use scan keeps its row and bytes.
 */
async function removeFile(file: { id: string; storageKey: string }, where: Prisma.FileAssetWhereInput = {}) {
  const n = await db.fileAsset.deleteMany({ where: { id: file.id, resources: { none: {} }, submissions: { none: {} }, ...where } });
  if (!n.count) return false;
  await removeObject(file.storageKey);
  return true;
}

/**
 * Empties the resource bin after 30 days, removes uploads that were never finished,
 * finished uploads nothing uses (older than ORPHAN_FILE_DAYS) and wrong-code rows over a day old.
 * A file still used anywhere (src/lib/files.ts → fileIdsInUse) is never removed.
 */
export async function cleanUp(now = new Date()) {
  const binCutoff = new Date(now.getTime() - 30 * 86400000);
  const binned = await db.resource.findMany({ where: { deletedAt: { lt: binCutoff } }, select: { id: true, fileId: true } });
  const purged = await db.resource.deleteMany({ where: { id: { in: binned.map((r) => r.id) } } });

  const inUse = await fileIdsInUse();
  // The bin's files go too, unless something else still uses them.
  for (const fileId of new Set(binned.map((r) => r.fileId).filter((x): x is string => !!x))) {
    if (inUse.has(fileId)) continue;
    const file = await db.fileAsset.findUnique({ where: { id: fileId } });
    if (file) await removeFile(file);
  }

  // Never finished (abandoned mid-upload), or finished but never attached / replaced since.
  const stale = await db.fileAsset.findMany({ where: { uploadedAt: null, createdAt: { lt: new Date(now.getTime() - 86400000) } } });
  const unused = await db.fileAsset.findMany({ where: { uploadedAt: { lt: new Date(now.getTime() - ORPHAN_FILE_DAYS * 86400000) } } });
  let abandoned = 0;
  for (const f of stale) if (await removeFile(f, { uploadedAt: null })) abandoned += 1;
  for (const f of unused) if (!inUse.has(f.id) && (await removeFile(f))) abandoned += 1;

  // Wrong invite codes count toward the limit for an hour; after a day they're only clutter.
  const oldFailures = await db.redeemFailure.deleteMany({ where: { at: { lt: new Date(now.getTime() - 86400000) } } });
  // L2: repeat invite requests count toward the hourly limits; after a day they're only clutter too.
  await db.inviteAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 86400000) } } });
  await deleteOldInviteRequests(now);
  return { purgedResources: purged.count, abandonedUploads: abandoned, redeemFailures: oldFailures.count };
}
