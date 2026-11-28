'use server';
/**
 * server/requests — L2: "Request an invite" on the landing page. A signed-out family asks Vienne for an
 * invite; the request shows up in her alerts. No account is made and nothing is emailed: Vienne makes the
 * code on Families → Invite codes and replies from her own email.
 *
 * The one export without a guard, on purpose (p-sec's PUBLIC). It still parses first, it's rate-limited,
 * and it has a honeypot. Every success answers the same `{ received: true }`, so the answer never says
 * whether an email has asked before.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { clientIp } from '@/lib/client-ip';
import { adminAlertsInTx, notifyAdmins } from '@/lib/notify';
import { action, ApiError } from '@/lib/result';
import { parse } from '@/lib/validate';

/** Requests from one visitor's IP (stored only as a hash) in an hour. Repeats of an earlier email count too. */
const REQUESTS_PER_IP_PER_HOUR = 3;
/** Requests from everyone in an hour, counted the same way. At it, requests pause for the hour and Vienne gets one alert. */
const REQUESTS_PER_HOUR = 20;
/** A second request from the same email within this time is answered the same way, but only counted (InviteAttempt), not stored. */
const DUPLICATE_EMAIL_HOURS = 24;
/** The daily job deletes requests, and their alerts, after this many days. lib/jobs.ts keeps the same value
 *  (a 'use server' file exports only functions); tests/integration/l2-request-invite.test.ts checks they match. */
const REQUEST_KEEP_DAYS = 90;

const HOUR_MS = 60 * 60 * 1000;
/** One request at a time, so two at once can't both take the last slot. */
const REQUESTS_LOCK = 7_300_530_002;
const PAUSE_ALERT = 'INVITE_REQUESTS_PAUSED';
const LIMITED = 'You’ve sent a few requests already. Vienne will reply by email; try again later if you need to.';
const RECEIVED = { received: true as const };

/** Control characters (S32): refused everywhere, except a line break in the message. */
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const clean = (re: RegExp) => (v: string) => !re.test(v);

const name = 'the parent’s name';
const schema = z.object({
  parentName: z
    .string(`Add ${name}`)
    .refine(clean(CONTROL), 'The parent’s name can’t have line breaks or hidden characters')
    .trim()
    .min(2, `Add ${name}`)
    .max(80, `Keep ${name} under 80 characters`),
  email: z
    .string('Add your email address')
    .refine(clean(CONTROL), 'Check the email address')
    .trim()
    .max(254, 'Keep the email address under 254 characters')
    .toLowerCase()
    .pipe(z.email('Check the email address')),
  phone: z
    .string('Check the phone number')
    .refine(clean(CONTROL), 'Check the phone number')
    .trim()
    .max(30, 'Keep the phone number under 30 characters')
    .regex(/^[0-9 +().-]*$/, 'Use only numbers, spaces and + ( ) - . in the phone number')
    .nullish()
    .transform((v) => v || null),
  grade: z.number('Choose your child’s grade').int('Choose your child’s grade').min(0, 'Choose a grade from K to 6').max(6, 'Choose a grade from K to 6'),
  message: z.string('Check the message').refine(clean(CONTROL_BUT_NEWLINE), 'The message can’t have hidden characters').trim().max(1000, 'Keep the message under 1000 characters'),
  /** The honeypot: hidden from people, so only a bot fills it. */
  website: z.string('Check the details and try again.').optional(),
});

const gradeLabel = (g: number) => (g === 0 ? 'Kindergarten' : `Grade ${g}`);
const hashIp = (ip: string | null) => createHash('sha256').update(`${ip ?? 'unknown'}:${process.env.INVITE_PEPPER ?? ''}`).digest('hex');

export const requestInvite = action(async (input: { parentName: string; email: string; phone?: string | null; grade: number; message: string; website?: string }) => {
  const v = parse(schema, input);
  if (v.website?.trim()) return RECEIVED;

  const ipHash = hashIp(await clientIp());
  const now = new Date();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const outcome = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REQUESTS_LOCK})`;
    // Every answered request counts: a stored one, or a repeat of an earlier email (an InviteAttempt).
    const recent = { createdAt: { gt: hourAgo } };
    const everyone = (await tx.inviteRequest.count({ where: recent })) + (await tx.inviteAttempt.count({ where: recent }));
    if (everyone >= REQUESTS_PER_HOUR) {
      // The first refusal in an hour tells Vienne. The alert is written under the lock, so it's sent once.
      const told = await tx.notification.count({ where: { type: PAUSE_ALERT, createdAt: { gt: hourAgo } } });
      const push = told
        ? null
        : await adminAlertsInTx(tx, {
            type: PAUSE_ALERT,
            title: 'Invite requests are paused for an hour',
            body: `${REQUESTS_PER_HOUR} invite requests came in the last hour, so the form on the landing page is paused until it drops. Nothing for you to do; families can try again later.`,
            href: '/admin/families',
          });
      return { limited: true as const, push };
    }
    const fromIp = { ipHash, ...recent };
    const visitor = (await tx.inviteRequest.count({ where: fromIp })) + (await tx.inviteAttempt.count({ where: fromIp }));
    if (visitor >= REQUESTS_PER_IP_PER_HOUR) return { limited: true as const, push: null };
    const since = new Date(now.getTime() - DUPLICATE_EMAIL_HOURS * HOUR_MS);
    const earlier = await tx.inviteRequest.findFirst({ where: { email: v.email, createdAt: { gt: since } }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    if (earlier) {
      // Same answer, nothing stored and nobody told, but it still uses up a slot.
      await tx.inviteAttempt.create({ data: { ipHash, requestId: earlier.id, createdAt: now } });
      return { limited: false as const, row: null };
    }
    const row = await tx.inviteRequest.create({ data: { parentName: v.parentName, email: v.email, phone: v.phone, grade: v.grade, message: v.message, ipHash, createdAt: now } });
    return { limited: false as const, row };
  });

  if (outcome.limited) {
    outcome.push?.();
    throw new ApiError('LIMIT', LIMITED);
  }
  const r = outcome.row;
  if (r) {
    // React escapes the body, so no HTML is built. The push carries only the title.
    await notifyAdmins({
      type: 'INVITE_REQUEST',
      title: `Question from ${r.parentName}`,
      body: `${[gradeLabel(r.grade), r.email, r.phone].filter(Boolean).join(' · ')}${r.message ? `\n${r.message}` : ''}`,
      href: '/admin/families',
      about: r.id,
      inviteRequestId: r.id,
      pushTitleOnly: true,
    });
  }
  return RECEIVED;
});
