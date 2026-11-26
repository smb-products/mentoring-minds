/** server/invites — single-use family invite codes (plan §4). */
import { action, ApiError, commit, getDb, need, newId, nowIso, requireAdmin, requireUser } from '../core';
import { hashCode } from '../seed';
import { notifyAdmins } from './notifications';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const makeCode = () => `MM-${Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;
const VALID_DAYS = 14;

export const inviteStatus = (inv) =>
  inv.revokedAt ? 'REVOKED' : inv.usedAt ? 'USED' : new Date(inv.expiresAt) < new Date() ? 'EXPIRED' : 'ACTIVE';

export async function listInvites() {
  requireAdmin();
  const db = getDb();
  return [...db.invites]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((inv) => ({ ...inv, codeHash: undefined, status: inviteStatus(inv), usedBy: inv.usedById ? { id: inv.usedById, name: db.users.find((u) => u.id === inv.usedById)?.name } : null }));
}

/** Returns the plain code ONCE. Only its hash is stored. */
export const createInvite = action(async ({ parentName, parentEmail, plannedStudents }) => {
  requireAdmin();
  need(parentName?.trim(), 'Add the parent’s name');
  need(plannedStudents?.length, 'Add at least one child');
  plannedStudents.forEach((s) => need(s.firstName?.trim(), 'Each child needs a first name'));
  const code = makeCode();
  const invite = commit((db) => {
    const row = {
      id: newId('inv'), codeHash: hashCode(code), codeHint: `MM-••${code.slice(-2)}`, parentName: parentName.trim(), parentEmail: parentEmail?.trim() || null,
      plannedStudents, expiresAt: new Date(Date.now() + VALID_DAYS * 86400000).toISOString(), usedAt: null, usedById: null, revokedAt: null, createdAt: nowIso(),
    };
    db.invites.push(row);
    return row;
  });
  return { invite: { ...invite, codeHash: undefined, status: 'ACTIVE' }, code };
});

export const revokeInvite = action(async ({ inviteId }) => {
  requireAdmin();
  commit((db) => {
    const inv = db.invites.find((i) => i.id === inviteId);
    need(inv && !inv.usedAt, 'This code was already used');
    inv.revokedAt = nowIso();
  });
});

/** Undo for revokeInvite. */
export const restoreInvite = action(async ({ inviteId }) => {
  requireAdmin();
  commit((db) => (db.invites.find((i) => i.id === inviteId).revokedAt = null));
});

/** Revokes the old code and issues a fresh one for the same family. */
export const regenerateInvite = action(async ({ inviteId }) => {
  requireAdmin();
  const code = makeCode();
  commit((db) => {
    const inv = db.invites.find((i) => i.id === inviteId);
    need(inv && !inv.usedAt, 'This code was already used');
    Object.assign(inv, { codeHash: hashCode(code), codeHint: `MM-••${code.slice(-2)}`, expiresAt: new Date(Date.now() + VALID_DAYS * 86400000).toISOString(), revokedAt: null });
  });
  return { code };
});

/** Parent enters a code: account becomes ACTIVE and planned children are created. */
export const redeemInvite = action(async ({ code }) => {
  const user = requireUser();
  return commit((db) => {
    const inv = db.invites.find((i) => i.codeHash === hashCode(code.trim()));
    if (!inv || inviteStatus(inv) !== 'ACTIVE') throw new ApiError('INVALID_CODE', 'That code isn’t valid. Check it with Vienne.');
    const now = nowIso();
    inv.plannedStudents.forEach((p) => {
      const id = newId('s');
      db.students.push({ id, parentId: user.id, firstName: p.firstName, lastName: p.lastName || '', grade: p.grade, school: p.school || null, schoolYear: '2026–27', goals: null, adminNotes: null, avatarColor: 'brand', status: 'ACTIVE', hasBookAt: null, createdAt: now, updatedAt: now });
      db.studentSubjects.push({ studentId: id, subjectId: 'sub_math' });
    });
    Object.assign(inv, { usedAt: now, usedById: user.id });
    const u = db.users.find((x) => x.id === user.id);
    u.status = 'ACTIVE';
    db.conversations.push({ id: newId('conv'), parentId: user.id, lastMessageAt: now, adminLastReadAt: now, parentLastReadAt: now });
    notifyAdmins({ type: 'INVITE_REDEEMED', title: `${user.name} joined`, body: `Invite code used. ${inv.plannedStudents.map((p) => p.firstName).join(' and ')} added.`, href: '/admin/families' });
    return { status: 'ACTIVE' };
  });
});
