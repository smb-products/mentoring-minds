'use server';
/**
 * server/scheduling — Vienne's rules and hours, open slots, and the session
 * lifecycle (request → confirm/decline → complete/no-show, cancel, reschedule),
 * plus video calls. All times are UTC instants; "Monday 3:00 PM" is worked out in
 * Settings.timezone (lib/time.ts), wherever the server runs.
 * Contract: tests/contract/mock/server/scheduling.js (the frozen mock)
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireActive, requireAdmin, requireStudentAccess, requireUser } from '@/lib/guards';
import { action, ApiError, found, need, query } from '@/lib/result';
import { httpsUrl, id, ids, instant, int, mode as modeSchema, optText, parse } from '@/lib/validate';
import { conflicts, openSlots, type AvailabilityRow, type Booked, type Mode, type Place } from '@/lib/slots';
import { zonedDay } from '@/lib/time';
import { loadSettings, type AppSettings } from '@/lib/settings';
import { sessionDTO, sessionForParent, sessionInclude, type SessionRow } from '@/lib/dto';
import { notify, notifyAdmins } from '@/lib/notify';

const MIN = 60000;
const HOLDS_SLOT = ['REQUESTED', 'CONFIRMED'] as const;
const MATH = 'sub_math';
/** One tutor, one calendar: every booking write takes this lock, so two requests can't take the same time. */
const CALENDAR_LOCK = 4_202_611;
/** S36: a family's session requests still waiting for Vienne (REQUESTED, in the future). Vienne's own bookings don't count. */
const OPEN_REQUESTS_PER_FAMILY = 5;

type Tx = Prisma.TransactionClient;

/* ── Settings & availability ───────────────────────────── */

/** Parents don't get Vienne's video room: they only see a link inside the join window. */
export const getSettings = query(async () => {
  const user = await requireUser();
  const s = await loadSettings();
  return user.role === 'ADMIN' ? s : { ...s, defaultMeetingUrl: null };
});

const windowSchema = z
  .object({ window: z.enum(['PM1', 'PM2', 'PM3']), schoolYear: z.string().regex(/^\d{4}–\d{2}$/, 'Choose the school year'), startsAt: instant, endsAt: instant })
  .refine((w) => w.endsAt > w.startsAt, { message: 'A testing window must end after it starts' })
  .transform((w) => ({ ...w, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() }));

const whole = (label: string, max: number) => z.number().int(`${label} must be a whole number`).min(0, `${label} must be a whole number`).max(max, `${label} is too large`);

export const updateSettings = action(async (input: Partial<Omit<AppSettings, 'id' | 'timezone'>>) => {
  await requireAdmin();
  const patch = parse(
    z
      .object({
        minNoticeHours: whole('Notice', 24 * 14),
        cancelCutoffHours: whole('Cancel cutoff', 24 * 14),
        horizonWeeks: whole('How far ahead', 26),
        slotStepMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)], 'Start times can be every 5, 10, 15, 30 or 60 minutes'),
        joinOpensMin: whole('Join opens', 120),
        sessionLengths: z.array(z.number().int().min(15).max(180)).min(1, 'Keep at least one session length').max(6),
        defaultMeetingUrl: z.union([httpsUrl, z.literal(''), z.null()]).transform((v) => v || null),
        fastWindows: z.array(windowSchema).max(12),
      })
      .partial()
      .strict(),
    input,
  );
  await loadSettings(); // make sure the row exists
  await db.settings.update({ where: { id: 1 }, data: patch });
  return loadSettings();
});

export const getAvailability = query(async () => {
  await requireUser();
  const rows = await db.availability.findMany({ orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] });
  return rows.map((a) => ({ ...a, modes: a.modes as Mode[] }));
});

const availabilityRow = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMin: z.number().int().min(0).max(24 * 60),
    endMin: z.number().int().min(0).max(24 * 60),
    modes: z.array(modeSchema).min(1, 'Each block needs in person, video, or both').optional(),
  })
  .refine((r) => r.endMin > r.startMin, { message: 'End time must be after start time' });

/** Replaces the whole weekly schedule. */
export const setAvailability = action(async (input: { rows: { weekday: number; startMin: number; endMin: number; modes?: Mode[] }[] }) => {
  await requireAdmin();
  const { rows } = parse(z.object({ rows: z.array(availabilityRow).max(50) }), input);
  await db.$transaction([db.availability.deleteMany(), db.availability.createMany({ data: rows.map((r) => ({ ...r, modes: r.modes ?? ['IN_PERSON', 'VIDEO'] })) })]);
  const saved = await db.availability.findMany({ orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] });
  return saved.map((a) => ({ ...a, modes: a.modes as Mode[] }));
});

/** Vienne's own calendar: families never see it (getOpenSlots leaves those times out for them). */
export const listTimeOff = query(async () => {
  await requireAdmin();
  const rows = await db.timeOff.findMany({ orderBy: { startsAt: 'asc' } });
  return rows.map(({ id, startsAt, endsAt, reason }) => ({ id, startsAt, endsAt, reason }));
});

export const addTimeOff = action(async (input: { startsAt: string; endsAt: string; reason?: string }) => {
  await requireAdmin();
  const v = parse(
    z.object({ startsAt: instant, endsAt: instant, reason: optText(200) }).refine((x) => x.endsAt > x.startsAt, { message: 'Time off must end after it starts' }),
    input,
  );
  return db.timeOff.create({ data: v });
});

export const removeTimeOff = action(async (input: { timeOffId: string }) => {
  await requireAdmin();
  const { timeOffId } = parse(z.object({ timeOffId: id }), input);
  await db.timeOff.deleteMany({ where: { id: timeOffId } });
  return null;
});

export const listLocations = query(async () => {
  await requireUser();
  return db.location.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
});

/* ── Open slots ─────────────────────────────────────────── */

const placeInput = { mode: modeSchema.default('IN_PERSON'), locationId: id.nullish(), address: optText(200) };

/** Validates mode/location/address and returns what's stored on the session. */
async function placeFields(input: { mode: Mode; locationId?: string | null; address?: string | null }, tx: Tx | typeof db = db): Promise<Place> {
  if (input.mode === 'VIDEO') return { mode: 'VIDEO', locationId: null, address: null };
  const loc = input.locationId ? await tx.location.findFirst({ where: { id: input.locationId, active: true } }) : null;
  need(loc, 'Choose a location');
  need(loc.kind !== 'HOME' || input.address, 'Add the address for a home visit');
  return { mode: 'IN_PERSON', locationId: loc.id, address: loc.kind === 'HOME' ? input.address! : null };
}

async function calendar(tx: Tx | typeof db, range: { from: Date; to: Date }) {
  // One after another, not Promise.all: inside a transaction these share one connection,
  // and overlapping queries on one pg connection are deprecated (removed in pg 9).
  const availability = await tx.availability.findMany();
  const timeOff = await tx.timeOff.findMany({ where: { endsAt: { gt: range.from }, startsAt: { lt: range.to } } });
  const booked = await tx.session.findMany({ where: { status: { in: [...HOLDS_SLOT] }, endsAt: { gt: range.from }, startsAt: { lt: range.to } } });
  return {
    availability: availability.map((a) => ({ ...a, modes: a.modes as Mode[] })) as AvailabilityRow[],
    timeOff,
    booked: booked as Booked[],
  };
}

/**
 * Is the whole session inside a weekly block that offers this mode, starting on one of
 * the block's start times (every slotStepMin), in Vienne's time zone?
 */
function offersMode(availability: AvailabilityRow[], start: Date, durationMin: number, mode: Mode, tz: string, stepMin: number) {
  const d = zonedDay(start, tz);
  const onTheMinute = start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0;
  return (
    onTheMinute &&
    availability.some((a) => a.weekday === d.weekday && a.modes.includes(mode) && d.minutes >= a.startMin && d.minutes + durationMin <= a.endMin && (d.minutes - a.startMin) % stepMin === 0)
  );
}

/** Open start times for a request, between two dates (inclusive days). */
export const getOpenSlots = query(async (input: { durationMin: number; mode?: Mode; locationId?: string | null; address?: string | null; from: string; to: string }) => {
  await requireUser();
  const v = parse(z.object({ durationMin: int, ...placeInput, from: instant, to: instant }), input);
  const settings = await loadSettings();
  need(settings.sessionLengths.includes(v.durationMin), `Pick ${settings.sessionLengths.join(', ').replace(/, (\d+)$/, ' or $1')} minutes`);
  need(v.to >= v.from, 'The date range is backwards');
  need(v.to.getTime() - v.from.getTime() <= 62 * 86400000, 'Look at two months or less at a time');
  const where = await placeFields(v);
  const range = { from: new Date(v.from.getTime() - 86400000), to: new Date(v.to.getTime() + 2 * 86400000) };
  const cal = await calendar(db, range);
  return openSlots({ durationMin: v.durationMin, where, from: v.from, to: v.to, now: new Date(), rules: settings, ...cal });
});

/* ── Reads ──────────────────────────────────────────────── */

const status = z.enum(['REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);

export const listSessions = query(async (input: { from?: string; to?: string; studentId?: string; status?: string | string[] } = {}) => {
  const user = await requireUser();
  const v = parse(z.object({ from: instant.optional(), to: instant.optional(), studentId: id.optional(), status: z.union([status, z.array(status)]).optional() }), input);
  const admin = user.role === 'ADMIN';
  const where: Prisma.SessionWhereInput = {
    ...(!admin && { student: { parentId: user.id } }),
    ...(v.studentId && { studentId: v.studentId }),
    ...(v.status && { status: { in: Array.isArray(v.status) ? v.status : [v.status] } }),
    ...(v.from && { endsAt: { gte: v.from } }),
    ...(v.to && { startsAt: { lte: v.to } }),
  };
  const [rows, settings] = await Promise.all([db.session.findMany({ where, include: sessionInclude, orderBy: { startsAt: 'asc' } }), loadSettings()]);
  const now = new Date();
  if (admin) return rows.map((s) => sessionDTO(s));
  // A family that isn't active (paused, or still in preview) still sees its sessions, never the video link.
  const active = user.status === 'ACTIVE';
  return rows.map((s) => {
    const dto = sessionForParent(s, settings, now);
    return active ? dto : { ...dto, meetingUrl: null };
  });
});

/* ── Lifecycle ──────────────────────────────────────────── */

const fmtLabel = (s: SessionRow) => `${s.student.firstName}, ${s.durationMin} min, ${s.mode === 'VIDEO' ? 'video call' : (s.location?.name ?? 'in person')}`;

async function loadSession(sessionId: string, tx: Tx | typeof db = db) {
  return found(await tx.session.findUnique({ where: { id: sessionId }, include: sessionInclude }), 'Session');
}

/** A family's own session. A missing one and another family's look the same, so ids can't be probed. */
async function ownSession(sessionId: string, parentId: string) {
  const row = await db.session.findUnique({ where: { id: sessionId }, include: sessionInclude });
  if (row?.student.parentId !== parentId) throw new ApiError('FORBIDDEN', 'You don’t have access to this student.');
  return row;
}

/** Runs `fn` in a transaction holding the calendar lock. */
function withCalendar<T>(fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CALENDAR_LOCK})`;
    return fn(tx);
  });
}

const bookingInput = z.object({ studentId: id, ...placeInput, startsAt: instant, durationMin: int, parentNote: optText(500) });

export const requestSession = action(async (input: { studentId: string; mode?: Mode; locationId?: string | null; address?: string | null; startsAt: string; durationMin: number; parentNote?: string }) => {
  const v = parse(bookingInput, input);
  const user = await requireStudentAccess(v.studentId);
  const settings = await loadSettings();
  need(settings.sessionLengths.includes(v.durationMin), 'Pick a session length');
  const start = v.startsAt;
  const end = new Date(start.getTime() + v.durationMin * MIN);
  need(start.getTime() >= Date.now() + settings.minNoticeHours * 3600000, `Sessions need ${settings.minNoticeHours} hours’ notice`);
  need(start.getTime() <= Date.now() + settings.horizonWeeks * 7 * 86400000, `Sessions can be booked up to ${settings.horizonWeeks} weeks ahead`);
  const student = found(await db.student.findFirst({ where: { id: v.studentId, status: 'ACTIVE' } }), 'Student');

  const session = await withCalendar(async (tx) => {
    if (user.role !== 'ADMIN') {
      // S36: one request at a time per family, so taps at once can't both take the last slot.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`request:${student.parentId}`}))`;
      const waiting = await tx.session.count({ where: { student: { parentId: student.parentId }, status: 'REQUESTED', startsAt: { gt: new Date() }, requestedBy: { role: 'PARENT' } } });
      need(waiting < OPEN_REQUESTS_PER_FAMILY, `You have ${OPEN_REQUESTS_PER_FAMILY} requests waiting for Vienne. Wait for her answer, or message her.`, 'LIMIT');
    }
    const place = await placeFields(v, tx);
    const cal = await calendar(tx, { from: start, to: end });
    need(offersMode(cal.availability, start, v.durationMin, place.mode, settings.timezone, settings.slotStepMin), place.mode === 'VIDEO' ? 'Vienne doesn’t offer video calls at that time' : 'Vienne isn’t available at that time');
    if (conflicts(start, end, place, cal)) throw new ApiError('SLOT_TAKEN', 'That time was just booked. Pick another.');
    return tx.session.create({
      data: { studentId: student.id, subjectId: MATH, ...place, requestedById: user.id, startsAt: start, endsAt: end, durationMin: v.durationMin, parentNote: v.parentNote },
      include: sessionInclude,
    });
  });
  await notifyAdmins({ type: 'SESSION_REQUESTED', title: `New request from ${user.name}`, body: fmtLabel(session), href: '/admin/schedule', about: session.id, studentId: student.id, parentId: student.parentId });
  return sessionDTO(session);
});

export const confirmSession = action(async (input: { sessionId: string }) => {
  await requireAdmin();
  const { sessionId } = parse(z.object({ sessionId: id }), input);
  const settings = await loadSettings();
  const s = await withCalendar(async (tx) => {
    const cur = await loadSession(sessionId, tx);
    need(cur.status === 'REQUESTED', 'Only requests can be confirmed');
    const cal = await calendar(tx, { from: cur.startsAt, to: cur.endsAt });
    if (conflicts(cur.startsAt, cur.endsAt, cur as Place, { ...cal, ignoreId: cur.id })) throw new ApiError('SLOT_TAKEN', 'This overlaps another session.');
    if (cur.mode === 'VIDEO') need(cur.meetingUrl || settings.defaultMeetingUrl, 'Add your video link in Settings first');
    return tx.session.update({
      where: { id: sessionId },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), ...(cur.mode === 'VIDEO' && { meetingUrl: cur.meetingUrl || settings.defaultMeetingUrl }) },
      include: sessionInclude,
    });
  });
  // The video link is part of the confirmation, not a separate notification.
  const body = s.mode === 'VIDEO' ? `${fmtLabel(s)}. The Join call button appears ${settings.joinOpensMin} minutes before.` : fmtLabel(s);
  await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_CONFIRMED', title: `Vienne confirmed ${s.student.firstName}’s session`, body, href: '/parent/sessions', about: s.id, studentId: s.studentId });
  return sessionDTO(s);
});

export const declineSession = action(async (input: { sessionId: string; reason?: string }) => {
  await requireAdmin();
  const v = parse(z.object({ sessionId: id, reason: optText(300) }), input);
  const cur = await loadSession(v.sessionId);
  need(cur.status === 'REQUESTED', 'Only requests can be declined');
  const s = await db.session.update({ where: { id: v.sessionId }, data: { status: 'DECLINED', declineReason: v.reason }, include: sessionInclude });
  await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_DECLINED', title: `Vienne couldn’t take ${s.student.firstName}’s request`, body: v.reason || fmtLabel(s), href: '/parent/sessions', about: s.id, studentId: s.studentId });
  return sessionDTO(s);
});

export const cancelSession = action(async (input: { sessionId: string; reason?: string }) => {
  const user = await requireActive();
  const v = parse(z.object({ sessionId: id, reason: optText(300) }), input);
  const admin = user.role === 'ADMIN';
  const cur = admin ? await loadSession(v.sessionId) : await ownSession(v.sessionId, user.id);
  need((HOLDS_SLOT as readonly string[]).includes(cur.status), 'This session can’t be cancelled');
  const settings = await loadSettings();
  if (!admin && Date.now() > cur.startsAt.getTime() - settings.cancelCutoffHours * 3600000) {
    throw new ApiError('PAST_CUTOFF', `Less than ${settings.cancelCutoffHours} hours to go. Message Vienne instead.`);
  }
  const s = await db.session.update({ where: { id: v.sessionId }, data: { status: 'CANCELLED', cancelledById: user.id, cancelledAt: new Date(), cancelReason: v.reason }, include: sessionInclude });
  if (admin) {
    await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_CHANGED', title: `Vienne cancelled ${s.student.firstName}’s session`, body: v.reason || fmtLabel(s), href: '/parent/sessions', about: s.id, studentId: s.studentId });
  } else {
    await notifyAdmins({ type: 'SESSION_CANCELLED_BY_PARENT', title: `${user.name} cancelled a session`, body: v.reason ? `${fmtLabel(s)}. ${v.reason}` : fmtLabel(s), href: '/admin/schedule', about: s.id, studentId: s.studentId, parentId: s.student.parentId });
  }
  return admin ? sessionDTO(s) : sessionForParent(s, settings);
});

export const rescheduleSession = action(async (input: { sessionId: string; startsAt: string; durationMin?: number }) => {
  await requireAdmin();
  const v = parse(z.object({ sessionId: id, startsAt: instant, durationMin: int.min(15).max(180).optional() }), input);
  const s = await withCalendar(async (tx) => {
    const cur = await loadSession(v.sessionId, tx);
    need((HOLDS_SLOT as readonly string[]).includes(cur.status), 'Only upcoming sessions can be moved');
    const dur = v.durationMin ?? cur.durationMin;
    const end = new Date(v.startsAt.getTime() + dur * MIN);
    const cal = await calendar(tx, { from: v.startsAt, to: end });
    if (conflicts(v.startsAt, end, cur as Place, { ...cal, ignoreId: cur.id })) throw new ApiError('SLOT_TAKEN', 'That overlaps another session.');
    return tx.session.update({ where: { id: cur.id }, data: { startsAt: v.startsAt, endsAt: end, durationMin: dur, reminderSentAt: null }, include: sessionInclude });
  });
  await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_CHANGED', title: `Vienne moved ${s.student.firstName}’s session`, body: fmtLabel(s), href: '/parent/sessions', about: s.id, studentId: s.studentId });
  return sessionDTO(s);
});

export const createSessionAsAdmin = action(
  async (input: { studentId: string; mode?: Mode; locationId?: string | null; address?: string | null; meetingUrl?: string | null; startsAt: string; durationMin: number }) => {
    const admin = await requireAdmin();
    const v = parse(bookingInput.omit({ parentNote: true }).extend({ meetingUrl: z.union([httpsUrl, z.literal(''), z.null()]).optional(), durationMin: int.min(15).max(180) }), input);
    const settings = await loadSettings();
    found(await db.student.findFirst({ where: { id: v.studentId, status: { not: 'ARCHIVED' } } }), 'Student');
    const end = new Date(v.startsAt.getTime() + v.durationMin * MIN);
    const s = await withCalendar(async (tx) => {
      const place = await placeFields(v, tx);
      const cal = await calendar(tx, { from: v.startsAt, to: end });
      if (conflicts(v.startsAt, end, place, cal)) throw new ApiError('SLOT_TAKEN', 'That overlaps another session.');
      const meetingUrl = place.mode === 'VIDEO' ? v.meetingUrl || settings.defaultMeetingUrl : null;
      if (place.mode === 'VIDEO') need(meetingUrl, 'Add your video link in Settings first');
      return tx.session.create({
        data: { studentId: v.studentId, subjectId: MATH, ...place, meetingUrl, requestedById: admin.id, startsAt: v.startsAt, endsAt: end, durationMin: v.durationMin, status: 'CONFIRMED', confirmedAt: new Date() },
        include: sessionInclude,
      });
    });
    await notify({ userId: s.student.parentId, audience: 'PARENT', type: 'SESSION_CONFIRMED', title: `New session booked for ${s.student.firstName}`, body: fmtLabel(s), href: '/parent/sessions', about: s.id, studentId: s.studentId });
    return sessionDTO(s);
  },
);

/**
 * Saves the note and completes the session. `redoItemIds` are book questions to add
 * to the student's redo list; `clearRedoIds` are ones they got right today.
 */
export const completeSession = action(
  async (input: {
    sessionId: string;
    attendance: 'PRESENT' | 'LATE' | 'ABSENT';
    summary: string;
    homework?: string | null;
    sharedWithParent?: boolean;
    skillIds?: string[];
    redoItemIds?: string[];
    clearRedoIds?: string[];
  }) => {
    await requireAdmin();
    const v = parse(
      z.object({
        sessionId: id,
        attendance: z.enum(['PRESENT', 'LATE', 'ABSENT'], 'Choose how attendance went'),
        summary: z.string().trim().min(1, 'Add a short summary').max(3000),
        homework: optText(1000),
        sharedWithParent: z.boolean().default(true),
        skillIds: ids.default([]),
        redoItemIds: ids.default([]),
        clearRedoIds: ids.default([]),
      }),
      input,
    );
    const s = await db.$transaction(async (tx) => {
      const cur = await loadSession(v.sessionId, tx);
      need(cur.status === 'CONFIRMED', 'Only confirmed sessions can be completed');
      const now = new Date();
      const skills = await tx.skill.findMany({ where: { id: { in: v.skillIds } }, select: { id: true } });
      await tx.sessionNote.create({
        data: {
          sessionId: cur.id,
          attendance: v.attendance,
          summary: v.summary,
          homework: v.homework,
          sharedWithParent: v.sharedWithParent,
          skills: { create: skills.map((k) => ({ skillId: k.id })) },
        },
      });
      // Only questions from this student's own grade book can go on their list.
      const items = await tx.bookItem.findMany({ where: { id: { in: v.redoItemIds }, book: { grade: cur.student.grade } }, select: { id: true } });
      for (const item of items) {
        const open = await tx.redoItem.findFirst({ where: { studentId: cur.studentId, bookItemId: item.id, clearedAt: null } });
        if (!open) await tx.redoItem.create({ data: { studentId: cur.studentId, bookItemId: item.id, source: 'SESSION' } });
      }
      if (v.clearRedoIds.length) await tx.redoItem.updateMany({ where: { id: { in: v.clearRedoIds }, studentId: cur.studentId, clearedAt: null }, data: { clearedAt: now } });
      return tx.session.update({
        where: { id: cur.id },
        data: { status: 'COMPLETED', ...(cur.mode === 'VIDEO' && cur.callStartedAt && !cur.callEndedAt && { callEndedAt: now }) },
        include: sessionInclude,
      });
    });
    return sessionDTO(s);
  },
);

export const markNoShow = action(async (input: { sessionId: string }) => {
  await requireAdmin();
  const { sessionId } = parse(z.object({ sessionId: id }), input);
  const cur = await loadSession(sessionId);
  need(cur.status === 'CONFIRMED', 'Only confirmed sessions can be marked as missed');
  return sessionDTO(await db.session.update({ where: { id: sessionId }, data: { status: 'NO_SHOW' }, include: sessionInclude }));
});

/** Records that the call was opened (Vienne or the family pressed Join) and returns the link. */
export const joinCall = action(async (input: { sessionId: string }) => {
  const user = await requireActive();
  const { sessionId } = parse(z.object({ sessionId: id }), input);
  let s: SessionRow;
  if (user.role === 'ADMIN') s = await loadSession(sessionId);
  else s = await ownSession(sessionId, user.id);
  need(s.mode === 'VIDEO' && s.status === 'CONFIRMED', 'This isn’t a video session');
  const settings = await loadSettings();
  const opens = s.startsAt.getTime() - settings.joinOpensMin * MIN;
  need(Date.now() >= opens && Date.now() <= s.endsAt.getTime(), `The call opens ${settings.joinOpensMin} minutes before the start`);
  need(s.meetingUrl, 'Vienne hasn’t added a video link yet. Message her.');
  if (!s.callStartedAt) await db.session.updateMany({ where: { id: s.id, callStartedAt: null }, data: { callStartedAt: new Date() } });
  return { meetingUrl: s.meetingUrl };
});

/** Vienne can paste a different link for one session. */
export const setMeetingUrl = action(async (input: { sessionId: string; meetingUrl: string }) => {
  await requireAdmin();
  const v = parse(z.object({ sessionId: id, meetingUrl: httpsUrl }), input);
  const cur = await loadSession(v.sessionId);
  need(cur.mode === 'VIDEO', 'This isn’t a video session');
  return sessionDTO(await db.session.update({ where: { id: v.sessionId }, data: { meetingUrl: v.meetingUrl }, include: sessionInclude }));
});
