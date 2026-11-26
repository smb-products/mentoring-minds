import 'server-only';
import { auth } from './auth';
import { db } from './db';
import { ApiError } from './result';

/**
 * Every server function starts with one of these (same names as the prototype's
 * core.js, frozen in tests/contract/mock/). They read the user fresh from the database.
 */
export async function requireUser() {
  const user = await requireSignedIn();
  // After Vienne's "Reset password", nothing works until the person picks their own (S21). The browser
  // shows only the change-password screen (AppRoot); this holds the server to the same rule.
  if (user.mustChangePassword) {
    throw new ApiError('MUST_CHANGE_PASSWORD', 'Please choose a new password first. Enter the temporary password Vienne gave you, then pick your own.');
  }
  return user;
}

/**
 * Signed in, even before the new password a reset asks for. Only for families.changePassword, the one
 * thing the change-password screen calls. Everything else uses requireUser or a guard built on it.
 */
export async function requireSignedIn() {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Please sign in again.');
  return user;
}

export async function requireActive() {
  const user = await requireUser();
  if (user.role !== 'ADMIN' && user.status !== 'ACTIVE') throw new ApiError('NOT_ACTIVE', 'Enter your invite code to unlock this.');
  return user;
}

/**
 * Vienne, or a parent who isn't PREVIEW: an ACTIVE or a PAUSED family. Only for messaging Vienne, since the
 * paused notice tells the parent to message her (S9). Everything else stays on requireActive.
 */
export async function requireCanMessage() {
  const user = await requireUser();
  if (user.role !== 'ADMIN' && user.status === 'PREVIEW') throw new ApiError('NOT_ACTIVE', 'Enter your invite code to unlock this.');
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Only Vienne can do that.');
  return user;
}

/** Vienne, or the student's own (active) parent. */
export async function requireStudentAccess(studentId: string) {
  const user = await requireActive();
  if (user.role === 'ADMIN') return user;
  const student = await db.student.findUnique({ where: { id: studentId }, select: { parentId: true } });
  if (student?.parentId !== user.id) throw new ApiError('FORBIDDEN', 'You don’t have access to this student.');
  return user;
}
