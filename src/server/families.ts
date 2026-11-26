'use server';
/**
 * server/families — parents, their children, account status.
 * Contract: tests/contract/mock/server/families.js (the frozen mock)
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { MAX_PASSWORD } from '@/lib/auth-rules';
import { db, type Tx } from '@/lib/db';
import { dropUnusedFiles, fileIdsOf } from '@/lib/files';
import { removeObject } from '@/lib/storage';
import { requireAdmin, requireSignedIn, requireStudentAccess, requireUser } from '@/lib/guards';
import { ApiError, action, found, need, query } from '@/lib/result';
import { grade, id, ids, optText, parse, text } from '@/lib/validate';
import { reportDTO, reportInclude, sessionDTO, sessionForParent, sessionInclude, studentDTO, studentInclude, submissionDTOs, submissionInclude, userSummary } from '@/lib/dto';
import { bookResultsFor } from '@/lib/book-results';
import { loadSettings, schoolYearOf } from '@/lib/settings';

const MATH = 'sub_math';
const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim();
const resultOrder = (r: { schoolYear: string; window: string }) => `${r.schoolYear}${r.window}`;
const newest = <T extends { schoolYear: string; window: string }>(rows: T[]) => [...rows].sort((a, b) => resultOrder(b).localeCompare(resultOrder(a)))[0] ?? null;

export const listFamilies = query(async (input: { status?: 'PREVIEW' | 'ACTIVE' | 'PAUSED' } = {}) => {
  await requireAdmin();
  const { status } = parse(z.object({ status: z.enum(['PREVIEW', 'ACTIVE', 'PAUSED']).optional() }), input);
  const now = new Date();
  const [parents, bookGrades] = await Promise.all([
    db.user.findMany({
      where: { role: 'PARENT', ...(status && { status }) },
      include: {
        students: { where: { status: { not: 'ARCHIVED' } }, include: { ...studentInclude, fastResults: { where: { level: { not: null } }, select: { schoolYear: true, window: true, level: true } } } },
        conversation: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.book.findMany({ select: { grade: true } }).then((b) => new Set(b.map((x) => x.grade))),
  ]);
  const studentIds = parents.flatMap((p) => p.students.map((s) => s.id));
  const [upcoming, completed] = await Promise.all([
    db.session.findMany({ where: { studentId: { in: studentIds }, status: 'CONFIRMED', startsAt: { gt: now } }, include: sessionInclude, orderBy: { startsAt: 'asc' } }),
    db.session.findMany({ where: { studentId: { in: studentIds }, status: 'COMPLETED' }, select: { studentId: true, startsAt: true }, orderBy: { startsAt: 'desc' } }),
  ]);

  return parents.map((parent) => {
    const kids = new Set(parent.students.map((s) => s.id));
    const done = completed.filter((x) => kids.has(x.studentId));
    const next = upcoming.find((x) => kids.has(x.studentId));
    return {
      ...userSummary(parent)!,
      createdAt: parent.createdAt,
      students: parent.students.map(({ fastResults, ...s }) => ({
        ...studentDTO(s, { admin: true }),
        hasBook: bookGrades.has(s.grade) ? !!s.hasBookAt : null,
        latestLevel: newest(fastResults)?.level ?? null,
      })),
      nextSession: next ? sessionDTO(next) : null,
      lastSessionAt: done[0]?.startsAt ?? null,
      completedSessions: done.length,
      conversationId: parent.conversation?.id ?? null,
    };
  });
});

export const getFamily = query(async (input: { parentId: string }) => {
  const user = await requireUser();
  const { parentId } = parse(z.object({ parentId: id }), input);
  const admin = user.role === 'ADMIN';
  if (!admin) need(user.id === parentId, 'That family isn’t on your account.', 'FORBIDDEN');
  const parent = found(await db.user.findFirst({ where: { id: parentId, role: 'PARENT' } }), 'Family');
  const now = new Date();
  const [students, bookGrades, settings] = await Promise.all([
    db.student.findMany({ where: { parentId, status: { not: 'ARCHIVED' } }, include: studentInclude, orderBy: { createdAt: 'asc' } }),
    db.book.findMany({ select: { grade: true } }).then((b) => new Set(b.map((x) => x.grade))),
    loadSettings(),
  ]);
  const ids = students.map((s) => s.id);
  const [sessions, reports, conversation, recent, stars, redo, results] = await Promise.all([
    db.session.findMany({ where: { studentId: { in: ids } }, include: sessionInclude, orderBy: { startsAt: 'desc' } }),
    admin ? db.progressReport.findMany({ where: { studentId: { in: ids } }, include: reportInclude }) : Promise.resolve([]),
    db.conversation.findUnique({ where: { parentId }, select: { id: true } }),
    db.submission.findMany({ where: { studentId: { in: ids }, submittedAt: { not: null } }, include: submissionInclude, orderBy: { submittedAt: 'desc' }, take: 8 }),
    db.submission.groupBy({ by: ['studentId'], where: { studentId: { in: ids } }, _sum: { stars: true } }),
    db.redoItem.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, clearedAt: null }, _count: true }),
    db.fastResult.findMany({ where: { studentId: { in: ids } } }),
  ]);

  const studentDTOs = await Promise.all(
    students.map(async (s) => {
      const mine = sessions.filter((x) => x.studentId === s.id);
      const next = mine.filter((x) => x.status === 'CONFIRMED' && x.startsAt > now).sort((a, b) => +a.startsAt - +b.startsAt)[0];
      return {
        ...studentDTO(s, { admin }),
        stats: {
          completedSessions: mine.filter((x) => x.status === 'COMPLETED').length,
          stars: stars.find((x) => x.studentId === s.id)?._sum.stars ?? 0,
          nextSessionAt: next?.startsAt ?? null,
          redoCount: redo.find((x) => x.studentId === s.id)?._count ?? 0,
        },
        hasBook: bookGrades.has(s.grade) ? !!s.hasBookAt : null,
        latestResult: newest(results.filter((r) => r.studentId === s.id)),
        bookAreas: await bookResultsFor(s),
      };
    }),
  );

  return {
    parent: { ...userSummary(parent)!, createdAt: parent.createdAt },
    students: studentDTOs,
    // A family that isn't ACTIVE (PAUSED, PREVIEW) still sees its sessions, never the video link (as in listSessions).
    sessions: sessions.map((x) => {
      if (admin) return sessionDTO(x);
      const dto = sessionForParent(x, settings, now);
      return user.status === 'ACTIVE' ? dto : { ...dto, meetingUrl: null };
    }),
    reports: reports.map(reportDTO),
    recentWork: await submissionDTOs(recent),
    conversationId: conversation?.id ?? null,
  };
});

const parentRow = async (parentId: string) => found(await db.user.findFirst({ where: { id: parentId, role: 'PARENT' } }), 'Parent');

export const updateParent = action(async (input: { parentId: string; name?: string; phone?: string | null }) => {
  await requireAdmin();
  const v = parse(z.object({ parentId: id, name: text(80).min(1, 'Enter a name').optional(), phone: optText(30).optional() }), input);
  await parentRow(v.parentId);
  const p = await db.user.update({ where: { id: v.parentId }, data: { ...(v.name && { name: v.name }), ...(v.phone !== undefined && { phone: v.phone }) } });
  return userSummary(p);
});

export const setParentStatus = action(async (input: { parentId: string; status: 'ACTIVE' | 'PAUSED' | 'PREVIEW' }) => {
  await requireAdmin();
  const v = parse(z.object({ parentId: id, status: z.enum(['ACTIVE', 'PAUSED', 'PREVIEW'], 'Unknown status') }), input);
  await parentRow(v.parentId);
  return userSummary(await db.user.update({ where: { id: v.parentId }, data: { status: v.status } }));
});

/** Returns a one-time temporary password for Vienne to pass on (no email is sent). */
export const resetParentPassword = action(async (input: { parentId: string }) => {
  await requireAdmin();
  const { parentId } = parse(z.object({ parentId: id }), input);
  await parentRow(parentId);
  const temporaryPassword = `mm-${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`;
  await db.user.update({ where: { id: parentId }, data: { passwordHash: await bcrypt.hash(temporaryPassword, 12), failedLogins: 0, lockedUntil: null, mustChangePassword: true, sessionVersion: { increment: 1 } } });
  return { temporaryPassword };
});

export const addStudent = action(async (input: { parentId: string; firstName: string; lastName?: string; grade: number; school?: string; goals?: string }) => {
  await requireAdmin();
  const v = parse(
    z.object({ parentId: id, firstName: text(40).min(1, 'First name is required'), lastName: optText(40), grade, school: optText(120), goals: optText(1000) }),
    input,
  );
  await parentRow(v.parentId);
  const settings = await loadSettings();
  const student = await db.student.create({
    data: {
      parentId: v.parentId,
      firstName: v.firstName,
      lastName: v.lastName ?? '',
      grade: v.grade,
      school: v.school,
      goals: v.goals,
      schoolYear: schoolYearOf(new Date(), settings.timezone),
      subjects: { create: [{ subjectId: MATH }] },
    },
    include: studentInclude,
  });
  return studentDTO(student, { admin: true });
});

const ADMIN_FIELDS = ['firstName', 'lastName', 'grade', 'school', 'goals', 'adminNotes', 'status'] as const;
const PARENT_FIELDS = ['goals', 'school'] as const;

export const updateStudent = action(async (input: { studentId: string; subjectIds?: string[]; [k: string]: unknown }) => {
  const v = parse(
    z
      .object({
        studentId: id,
        subjectIds: ids.optional(),
        firstName: text(40).min(1, 'First name is required').optional(),
        lastName: text(40).optional(),
        grade: grade.optional(),
        school: optText(120).optional(),
        goals: optText(1000).optional(),
        adminNotes: optText(4000).optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
      })
      .strict(),
    input,
  );
  const user = await requireStudentAccess(v.studentId);
  const admin = user.role === 'ADMIN';
  const { studentId, subjectIds, ...patch } = v;
  const allowed: readonly string[] = admin ? ADMIN_FIELDS : PARENT_FIELDS;
  Object.keys(patch).forEach((k) => need(allowed.includes(k), `You can’t change ${k}`, 'FORBIDDEN'));
  if (subjectIds) need(admin, 'You can’t change subjects', 'FORBIDDEN');
  const s = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const updated = await db.student.update({
    where: { id: studentId },
    data: {
      ...patch,
      // Moving up a grade means a new book: ask the family again.
      ...(patch.grade !== undefined && patch.grade !== s.grade && { hasBookAt: null }),
      ...(subjectIds && { subjects: { deleteMany: {}, create: subjectIds.map((subjectId) => ({ subjectId })) } }),
    },
    include: studentInclude,
  });
  return studentDTO(updated, { admin });
});

export const archiveStudent = action(async (input: { studentId: string }) => {
  await requireAdmin();
  const { studentId } = parse(z.object({ studentId: id }), input);
  const n = await db.student.updateMany({ where: { id: studentId }, data: { status: 'ARCHIVED' } });
  need(n.count, 'Student not found', 'NOT_FOUND');
  return null;
});

/* ── Delete on request (S23): admin only, asks twice on the family page ── */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does this alert name one of these people? (Alerts have no link to a child or parent, only their names.) */
const names = (who: string[]) => {
  const res = who.map((w) => w.trim()).filter(Boolean).map((w) => new RegExp(`(^|[^\\p{L}])${escapeRe(w)}($|[^\\p{L}])`, 'u'));
  return (n: { title: string; body: string | null }) => res.some((re) => re.test(`${n.title} ${n.body ?? ''}`));
};

/** Deletes the alerts of these users that name one of `who` (or link to `href`). */
async function dropAlerts(tx: Tx, userIds: string[], who: string[], href?: string) {
  const mentions = names(who);
  const rows = await tx.notification.findMany({ where: { userId: { in: userIds } }, select: { id: true, title: true, body: true, href: true } });
  const ids = rows.filter((n) => mentions(n) || (href && n.href === href)).map((n) => n.id);
  if (ids.length) await tx.notification.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Every record about these children, in an order the foreign keys allow: sessions (notes cascade),
 * Vienne's AI note drafts for them, homework and answers, assignments only they had, reports
 * (ratings cascade), then the child (FAST results, redo list, shares and subjects cascade).
 * Returns the ids of the files their work used, for dropUnusedFiles.
 */
async function removeChildren(tx: Tx, studentIds: string[]) {
  const subs = await tx.submission.findMany({ where: { studentId: { in: studentIds } }, select: { assignmentId: true, fileId: true, photos: true, draft: true, answers: true } });
  const sessions = await tx.session.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } });
  await tx.aiDraft.deleteMany({ where: { kind: 'SESSION_NOTE', refId: { in: sessions.map((s) => s.id) } } });
  await tx.session.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.redoItem.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.submission.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.assignment.deleteMany({ where: { id: { in: [...new Set(subs.map((s) => s.assignmentId))] }, submissions: { none: {} } } });
  await tx.progressReport.deleteMany({ where: { studentId: { in: studentIds } } });
  await tx.student.deleteMany({ where: { id: { in: studentIds } } });
  return fileIdsOf(subs);
}

const DELETE_TIMEOUT = { timeout: 30000, maxWait: 10000 };

/** Deletes a child and everything about them, and the stored files only they used. Can't be undone. */
export const deleteStudent = action(async (input: { studentId: string }) => {
  await requireAdmin();
  const { studentId } = parse(z.object({ studentId: id }), input);
  const student = found(await db.student.findUnique({ where: { id: studentId } }), 'Student');
  const admins = (await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((u) => u.id);
  const keys = await db.$transaction(async (tx) => {
    const files = await removeChildren(tx, [student.id]);
    await dropAlerts(tx, [student.parentId, ...admins], [fullName(student), student.firstName]);
    // The invite that added them listed them by name.
    const invite = await tx.invite.findUnique({ where: { usedById: student.parentId } });
    if (invite) {
      const planned = (invite.plannedStudents as { firstName?: string; lastName?: string }[]) ?? [];
      const rest = planned.filter((p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() !== fullName(student) && (p.firstName ?? '') !== student.firstName);
      if (rest.length !== planned.length) await tx.invite.update({ where: { id: invite.id }, data: { plannedStudents: rest } });
    }
    return dropUnusedFiles(tx, files);
  }, DELETE_TIMEOUT);
  for (const key of keys) await removeObject(key);
  return { deleted: true, files: keys.length };
});

/**
 * Deletes a parent's account and the whole family: every child (as deleteStudent), their thread
 * and messages, alerts, invites, push devices, sign-in links, uploads, and the stored files only
 * they used. Vienne's own account can't be deleted. Can't be undone.
 */
export const deleteFamily = action(async (input: { parentId: string }) => {
  const admin = await requireAdmin();
  const { parentId } = parse(z.object({ parentId: id }), input);
  const parent = found(await db.user.findUnique({ where: { id: parentId } }), 'Family');
  need(parent.role !== 'ADMIN', 'Vienne’s own account can’t be deleted.', 'FORBIDDEN');
  const admins = (await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })).map((u) => u.id);
  const keys = await db.$transaction(async (tx) => {
    const students = await tx.student.findMany({ where: { parentId }, select: { id: true, firstName: true, lastName: true } });
    const conversation = await tx.conversation.findUnique({ where: { parentId }, select: { id: true } });
    const files = await removeChildren(tx, students.map((s) => s.id));
    const uploads = await tx.fileAsset.findMany({ where: { uploadedById: parentId }, select: { id: true } });
    uploads.forEach((f) => files.add(f.id));

    // Their marks on anyone else's rows (the guards make these rare): kept, without the parent.
    await tx.session.updateMany({ where: { requestedById: parentId }, data: { requestedById: admin.id } });
    await tx.session.updateMany({ where: { cancelledById: parentId }, data: { cancelledById: null } });
    await tx.submission.updateMany({ where: { submittedById: parentId }, data: { submittedById: null } });
    await tx.fastResult.deleteMany({ where: { enteredById: parentId } });

    await tx.conversation.deleteMany({ where: { parentId } }); // messages cascade
    await tx.message.deleteMany({ where: { senderId: parentId } });
    await tx.invite.deleteMany({ where: { OR: [{ usedById: parentId }, { parentEmail: { equals: parent.email, mode: 'insensitive' } }] } });
    await dropAlerts(tx, admins, [parent.name, ...students.map(fullName), ...students.map((s) => s.firstName)], conversation ? `/admin/messages/${conversation.id}` : undefined);

    const keys = await dropUnusedFiles(tx, files);
    // An upload of theirs something else still uses stays, as Vienne's.
    await tx.fileAsset.updateMany({ where: { uploadedById: parentId }, data: { uploadedById: admin.id } });
    await tx.user.delete({ where: { id: parentId } }); // sign-in links, alerts, push devices and wrong-code rows cascade
    return keys;
  }, DELETE_TIMEOUT);
  for (const key of keys) await removeObject(key);
  return { deleted: true, files: keys.length };
});

/** Bigger text and buttons for the signed-in user (applied app-wide). */
/**
 * The signed-in person sets a new password. Needs the current one when there is one
 * (after a reset, that's the temporary password). Wrong current passwords count toward
 * the same 5-try lockout as sign-in. Google-only accounts can add a password this way.
 * requireSignedIn, not requireUser: this is how an account Vienne reset gets past requireUser's refusal (S21).
 */
export const changePassword = action(async (input: { currentPassword?: string; newPassword: string }) => {
  const user = await requireSignedIn();
  const v = parse(
    z.object({ currentPassword: z.string().max(MAX_PASSWORD).optional(), newPassword: z.string().min(8, 'Use at least 8 characters').max(MAX_PASSWORD, 'That password is too long') }),
    input,
  );
  const row = found(await db.user.findUnique({ where: { id: user.id } }), 'Account');
  if (row.passwordHash) {
    if (row.lockedUntil && row.lockedUntil > new Date()) throw new ApiError('LOCKED', 'Too many wrong passwords. Try again in 15 minutes.');
    if (!v.currentPassword || !(await bcrypt.compare(v.currentPassword, row.passwordHash))) {
      const failures = row.failedLogins + 1;
      await db.user.update({ where: { id: row.id }, data: failures >= 5 ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60000) } : { failedLogins: failures } });
      throw new ApiError('INVALID', 'Your current password isn’t right.');
    }
    need(v.currentPassword !== v.newPassword, 'Choose a password that’s different from the current one');
  }
  // Every other session (another phone, someone who knew the old password) is signed out…
  await db.user.update({
    where: { id: row.id },
    data: { passwordHash: await bcrypt.hash(v.newPassword, 12), mustChangePassword: false, failedLogins: 0, lockedUntil: null, sessionVersion: { increment: 1 } },
  });
  // …and this one gets a fresh session, so the person who just changed it stays signed in.
  try {
    await signIn('credentials', { email: row.email, password: v.newPassword, redirect: false });
  } catch {
    return { changed: true, signInAgain: true };
  }
  return { changed: true, signInAgain: false };
});

export const setTextSize = action(async (input: { textSize: 'NORMAL' | 'LARGE' | 'XLARGE' }) => {
  const user = await requireUser();
  const { textSize } = parse(z.object({ textSize: z.enum(['NORMAL', 'LARGE', 'XLARGE'], 'Choose a text size') }), input);
  await db.user.update({ where: { id: user.id }, data: { textSize } });
  return { textSize };
});
