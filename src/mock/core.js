/**
 * Mock data layer core. In production these pieces are:
 *   db        -> Prisma client (lib/db.ts)
 *   auth()    -> Auth.js session (lib/auth.ts)
 *   guards    -> lib/guards.ts
 *   ok/fail   -> lib/result.ts
 * Records use the exact Prisma field names from the backend plan, with dates as ISO strings
 * (what a server action returns after JSON serialisation).
 */
import { createSeed } from './seed';

let db = createSeed();
let sessionUserId = 'u_admin';
const listeners = new Set();

export const getDb = () => db;

/** Apply a write and notify subscribers (stand-in for revalidatePath). */
export function commit(mutator) {
  const result = mutator(db);
  listeners.forEach((listener) => listener());
  return result;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
export const nowIso = () => new Date().toISOString();

/* ── Mock auth ─────────────────────────────────────────────── */
export function auth() {
  return db.users.find((u) => u.id === sessionUserId) ?? null;
}
/** Prototype only: switch the signed-in demo user. */
export function setSessionUser(userId, { silent = false } = {}) {
  if (sessionUserId === userId) return;
  sessionUserId = userId;
  if (!silent) listeners.forEach((listener) => listener());
}

/* ── Guards (lib/guards.ts) ────────────────────────────────── */
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function requireUser() {
  const user = auth();
  if (!user) throw new ApiError('UNAUTHENTICATED', 'Please sign in.');
  return user;
}

export function requireActive() {
  const user = requireUser();
  if (user.role !== 'ADMIN' && user.status !== 'ACTIVE') {
    throw new ApiError('NOT_ACTIVE', 'Enter your invite code to unlock this.');
  }
  return user;
}

export function requireAdmin() {
  const user = requireUser();
  if (user.role !== 'ADMIN') throw new ApiError('FORBIDDEN', 'Only Vienne can do that.');
  return user;
}

/** Parents may only touch their own children. */
export function requireStudentAccess(studentId) {
  const user = requireActive();
  if (user.role === 'ADMIN') return user;
  const student = db.students.find((s) => s.id === studentId);
  if (!student || student.parentId !== user.id) throw new ApiError('FORBIDDEN', 'That student isn’t on your account.');
  return user;
}

/* ── Result type (lib/result.ts) ───────────────────────────── */
export const ok = (data) => ({ ok: true, data });
export const fail = (error, code) => ({ ok: false, error, code });

/** Wrap a write so it always resolves to a Result, like a server action. */
export function action(fn) {
  return async (...args) => {
    try {
      return ok(await fn(...args));
    } catch (error) {
      return fail(error.message, error.code);
    }
  };
}

/** Minimal validation helper (Zod in production). */
export function need(condition, message) {
  if (!condition) throw new ApiError('INVALID', message);
}
