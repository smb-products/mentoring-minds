'use server';
/**
 * server/families — parents, their children, account status.
 * Contract: src/mock/server/families.js
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireAdmin, requireStudentAccess, requireUser } from '@/lib/guards';
import { ApiError, action, found, need, query } from '@/lib/result';
import { grade, id, ids, optText, parse, text } from '@/lib/validate';
import { reportDTO, reportInclude, sessionDTO, sessionForParent, sessionInclude, studentDTO, studentInclude, submissionDTOs, submissionInclude, userSummary } from '@/lib/dto';
import { bookResultsFor } from '@/lib/book-results';
import { loadSettings, schoolYearOf } from '@/lib/settings';

const MATH = 'sub_math';
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
    sessions: sessions.map((x) => (admin ? sessionDTO(x) : sessionForParent(x, settings, now))),
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

/** Bigger text and buttons for the signed-in user (applied app-wide). */
/**
 * The signed-in person sets a new password. Needs the current one when there is one
 * (after a reset, that's the temporary password). Wrong current passwords count toward
 * the same 5-try lockout as sign-in. Google-only accounts can add a password this way.
 */
export const changePassword = action(async (input: { currentPassword?: string; newPassword: string }) => {
  const user = await requireUser();
  const v = parse(
    z.object({ currentPassword: z.string().max(200).optional(), newPassword: z.string().min(8, 'Use at least 8 characters').max(200, 'That password is too long') }),
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
