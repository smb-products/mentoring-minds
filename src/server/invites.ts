'use server';
/**
 * server/invites — single-use family invite codes. Only a peppered hash of each
 * code is stored; the plain code is returned once, to Vienne, when it's made.
 * Contract: src/mock/server/invites.js
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/guards';
import { action, ApiError, found, need, query } from '@/lib/result';
import { grade, id, optText, parse, text } from '@/lib/validate';
import { codeHint, hashCode, makeCode } from '@/lib/codes';
import { notifyAdmins } from '@/lib/notify';
import { loadSettings, schoolYearOf } from '@/lib/settings';

const VALID_DAYS = 14;
const MAX_FAILURES = 10;
const LOCK_MS = 60 * 60 * 1000;
/**
 * Codes are short (32^4), so wrong codes are also counted across all accounts: more
 * than this many in the last hour pauses code entry for everyone until it drops.
 */
const GLOBAL_REDEEM_FAILURES_PER_HOUR = 30;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LOCKED = 'Too many tries right now. Try again in an hour, or ask Vienne to check the code.';
const REDEEM_LIMIT_ALERT = 'INVITE_GUESSING';
const MATH = 'sub_math';

type Planned = { firstName: string; lastName?: string; grade: number; school?: string | null };

const statusOf = (inv: { revokedAt: Date | null; usedAt: Date | null; expiresAt: Date }, now = new Date()) =>
  inv.revokedAt ? 'REVOKED' : inv.usedAt ? 'USED' : inv.expiresAt < now ? 'EXPIRED' : 'ACTIVE';

const publicInvite = <T extends { codeHash: string; revokedAt: Date | null; usedAt: Date | null; expiresAt: Date }>({ codeHash: _secret, ...inv }: T) => ({ ...inv, status: statusOf({ ...inv }) });

export const listInvites = query(async () => {
  await requireAdmin();
  const rows = await db.invite.findMany({ orderBy: { createdAt: 'desc' }, include: { usedBy: { select: { id: true, name: true } } } });
  return rows.map(({ usedBy, ...inv }) => ({ ...publicInvite(inv), usedBy: usedBy ?? null }));
});

const plannedSchema = z
  .array(z.object({ firstName: text(40).min(1, 'Each child needs a first name'), lastName: z.string().trim().max(40).optional(), grade, school: optText(120).optional() }))
  .min(1, 'Add at least one child')
  .max(8);

/** Returns the plain code ONCE. Only its hash is stored. */
export const createInvite = action(async (input: { parentName: string; parentEmail?: string | null; plannedStudents: Planned[] }) => {
  await requireAdmin();
  const v = parse(
    z.object({
      parentName: text(80).min(1, 'Add the parent’s name'),
      parentEmail: z.union([z.email('Check the email address'), z.literal(''), z.null()]).optional(),
      plannedStudents: plannedSchema,
    }),
    input,
  );
  const code = makeCode();
  const invite = await db.invite.create({
    data: {
      codeHash: hashCode(code),
      codeHint: codeHint(code),
      parentName: v.parentName,
      parentEmail: v.parentEmail || null,
      plannedStudents: v.plannedStudents,
      expiresAt: new Date(Date.now() + VALID_DAYS * 86400000),
    },
  });
  return { invite: publicInvite(invite), code };
});

export const revokeInvite = action(async (input: { inviteId: string }) => {
  await requireAdmin();
  const { inviteId } = parse(z.object({ inviteId: id }), input);
  const inv = found(await db.invite.findUnique({ where: { id: inviteId } }), 'Invite');
  need(!inv.usedAt, 'This code was already used');
  await db.invite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  return null;
});

/** Undo for revokeInvite. */
export const restoreInvite = action(async (input: { inviteId: string }) => {
  await requireAdmin();
  const { inviteId } = parse(z.object({ inviteId: id }), input);
  found(await db.invite.findUnique({ where: { id: inviteId } }), 'Invite');
  await db.invite.update({ where: { id: inviteId }, data: { revokedAt: null } });
  return null;
});

/** Replaces the code (the old one stops working) and gives it 14 more days. */
export const regenerateInvite = action(async (input: { inviteId: string }) => {
  await requireAdmin();
  const { inviteId } = parse(z.object({ inviteId: id }), input);
  const inv = found(await db.invite.findUnique({ where: { id: inviteId } }), 'Invite');
  need(!inv.usedAt, 'This code was already used');
  const code = makeCode();
  await db.invite.update({ where: { id: inviteId }, data: { codeHash: hashCode(code), codeHint: codeHint(code), expiresAt: new Date(Date.now() + VALID_DAYS * 86400000), revokedAt: null } });
  return { code };
});

/**
 * A parent enters a code: the account becomes ACTIVE and the planned children are
 * created. 10 wrong codes lock code entry for an hour (codes are short).
 */
export const redeemInvite = action(async (input: { code: string }) => {
  const user = await requireUser();
  const { code } = parse(z.object({ code: z.string().trim().min(4, 'Enter the code from Vienne').max(20) }), input);
  need(user.role === 'PARENT', 'Invite codes are for families');
  // A code must not undo Vienne pausing an account.
  need(user.status !== 'PAUSED', 'Your account is paused. Message Vienne to turn it back on.', 'FORBIDDEN');
  const now = new Date();
  const hourAgo = new Date(now.getTime() - GLOBAL_WINDOW_MS);
  // Locked refusals add no RedeemFailure row, so a locked account can't keep the global count up.
  if ((await db.redeemFailure.count({ where: { at: { gt: hourAgo } } })) > GLOBAL_REDEEM_FAILURES_PER_HOUR) throw new ApiError('LOCKED', GLOBAL_LOCKED);
  if (user.redeemLockedUntil && user.redeemLockedUntil > now) throw new ApiError('LOCKED', 'Too many tries. Wait an hour, or ask Vienne to check the code.');

  const inv = await db.invite.findUnique({ where: { codeHash: hashCode(code) } });
  if (!inv || statusOf(inv, now) !== 'ACTIVE') {
    const failures = user.redeemFailures + 1;
    const alert = await db.$transaction(async (tx) => {
      // One failure at a time, so exactly one of them is the one that reaches the limit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7300530001)`;
      const recent = await tx.redeemFailure.count({ where: { at: { gt: hourAgo } } });
      if (recent > GLOBAL_REDEEM_FAILURES_PER_HOUR) return 'LOCKED' as const;
      await tx.redeemFailure.create({ data: { userId: user.id, at: now } });
      await tx.user.update({
        where: { id: user.id },
        data: failures >= MAX_FAILURES ? { redeemFailures: 0, redeemLockedUntil: new Date(now.getTime() + LOCK_MS) } : { redeemFailures: failures },
      });
      if (recent + 1 <= GLOBAL_REDEEM_FAILURES_PER_HOUR) return false;
      // The limit was just reached: tell Vienne, unless she was already told this hour.
      return (await tx.notification.count({ where: { type: REDEEM_LIMIT_ALERT, createdAt: { gt: hourAgo } } })) === 0;
    });
    if (alert === 'LOCKED') throw new ApiError('LOCKED', GLOBAL_LOCKED);
    if (alert) {
      await notifyAdmins({
        type: REDEEM_LIMIT_ALERT,
        title: 'Invite codes paused for an hour',
        body: `More than ${GLOBAL_REDEEM_FAILURES_PER_HOUR} wrong invite codes were tried in the last hour, so code entry is paused for everyone. If a family is waiting, check their code or make a new one.`,
        href: '/admin/families',
      });
    }
    throw new ApiError('INVALID_CODE', 'That code isn’t valid. Check it with Vienne.');
  }

  const planned = inv.plannedStudents as Planned[];
  const settings = await loadSettings();
  await db.$transaction(async (tx) => {
    // Claim the code atomically, so two people can't use it at once.
    const claimed = await tx.invite.updateMany({ where: { id: inv.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now, usedById: user.id } });
    if (claimed.count !== 1) throw new ApiError('INVALID_CODE', 'That code isn’t valid. Check it with Vienne.');
    for (const p of planned) {
      await tx.student.create({
        data: {
          parentId: user.id,
          firstName: p.firstName,
          lastName: p.lastName ?? '',
          grade: p.grade,
          school: p.school || null,
          schoolYear: schoolYearOf(now, settings.timezone),
          subjects: { create: [{ subjectId: MATH }] },
        },
      });
    }
    await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', redeemFailures: 0, redeemLockedUntil: null } });
    await tx.conversation.upsert({ where: { parentId: user.id }, create: { parentId: user.id, lastMessageAt: now, adminLastReadAt: now, parentLastReadAt: now }, update: {} });
  });
  await notifyAdmins({ type: 'INVITE_REDEEMED', title: `${user.name} joined`, body: `Invite code used. ${planned.map((p) => p.firstName).join(' and ')} added.`, href: '/admin/families' });
  return { status: 'ACTIVE' as const };
});
