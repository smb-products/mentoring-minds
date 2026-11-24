/**
 * Booking, from open slots to a completed session with its note.
 */
import { describe, expect, it } from 'vitest';
import { as, db, fails, freshDemo, ok, upcomingSession } from './helpers';
import * as scheduling from '@/server/scheduling';
import { zonedDay } from '@/lib/time';

freshDemo();

const TZ = 'America/New_York';
const HOUR = 3600000;
const range = (days: number) => ({ from: new Date().toISOString(), to: new Date(Date.now() + days * 86400000).toISOString() });

async function openVideoSlots() {
  as('u_ana');
  return ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'VIDEO', ...range(21) }));
}

describe('open slots', () => {
  it('fall inside Vienne’s weekly hours in Miami time, after the notice period', async () => {
    const slots = await openVideoSlots();
    expect(slots.length).toBeGreaterThan(10);
    const hours = await db.availability.findMany();
    for (const s of slots) {
      const start = new Date(s.startsAt);
      expect(start.getTime()).toBeGreaterThanOrEqual(Date.now() + 24 * HOUR - 1000);
      const d = zonedDay(start, TZ);
      expect(hours.some((h) => h.weekday === d.weekday && d.minutes >= h.startMin && d.minutes + 45 <= h.endMin), s.startsAt).toBe(true);
    }
  });

  it('never overlap a held session or time off', async () => {
    const slots = await openVideoSlots();
    const held = await db.session.findMany({ where: { status: { in: ['REQUESTED', 'CONFIRMED'] } } });
    const off = await db.timeOff.findMany();
    for (const s of slots) {
      const a = new Date(s.startsAt).getTime();
      const b = new Date(s.endsAt).getTime();
      for (const h of held) expect(a < h.endsAt.getTime() && b > h.startsAt.getTime(), `${s.startsAt} vs ${h.id}`).toBe(false);
      for (const o of off) expect(a < o.endsAt.getTime() && b > o.startsAt.getTime()).toBe(false);
    }
  });

  it('only offer the session lengths Vienne set', async () => {
    as('u_ana');
    fails(await scheduling.getOpenSlots({ durationMin: 50, mode: 'VIDEO', ...range(7) }), 'INVALID', /30, 45 or 60/);
  });
});

describe('requests', () => {
  it('a parent requests an open slot; Vienne is told; the slot is then taken', async () => {
    const [slot] = await openVideoSlots();
    const before = await db.notification.count({ where: { userId: 'u_admin', type: 'SESSION_REQUESTED' } });
    const s = ok(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45, parentNote: 'Fractions please' }));
    expect(s).toMatchObject({ status: 'REQUESTED', mode: 'VIDEO', student: { id: 's_mateo' }, parentNote: 'Fractions please', meetingUrl: null });
    expect(await db.notification.count({ where: { userId: 'u_admin', type: 'SESSION_REQUESTED' } })).toBe(before + 1);
    fails(await scheduling.requestSession({ studentId: 's_lucia', mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 }), 'SLOT_TAKEN');
    const after = await openVideoSlots();
    expect(after.some((x) => x.startsAt === slot.startsAt)).toBe(false);
  });

  it('two requests for the same time at the same moment: exactly one gets it', async () => {
    const slots = await openVideoSlots();
    const slot = slots[slots.length - 1];
    as('u_ana');
    const [a, b] = await Promise.all([
      scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 }),
      scheduling.requestSession({ studentId: 's_lucia', mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser.ok ? null : loser.code).toBe('SLOT_TAKEN');
  });

  it('rejects times outside her hours, too soon, or too far ahead', async () => {
    as('u_ana');
    const sunday3am = (() => {
      const d = new Date(Date.now() + 8 * 86400000);
      while (zonedDay(d, TZ).weekday !== 0) d.setTime(d.getTime() + 86400000);
      const day = zonedDay(d, TZ);
      return new Date(Date.UTC(day.year, day.month - 1, day.day, 8)).toISOString(); // 3–4 AM in Miami
    })();
    fails(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: sunday3am, durationMin: 45 }), 'INVALID', /isn’t available|doesn’t offer/);
    fails(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: new Date(Date.now() + 2 * HOUR).toISOString(), durationMin: 45 }), 'INVALID', /notice/);
    fails(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: new Date(Date.now() + 70 * 86400000).toISOString(), durationMin: 45 }), 'INVALID', /weeks ahead/);
  });

  it('a request must start on one of Vienne’s start times', async () => {
    const [slot] = await openVideoSlots();
    const odd = new Date(new Date(slot.startsAt).getTime() + 7 * 60000).toISOString();
    fails(await scheduling.requestSession({ studentId: 's_mateo', mode: 'VIDEO', startsAt: odd, durationMin: 30 }), 'INVALID', /isn’t available|doesn’t offer/);
  });

  it('in-person home visits need an address', async () => {
    as('u_ana');
    const slots = ok(await scheduling.getOpenSlots({ durationMin: 45, mode: 'IN_PERSON', locationId: 'loc_studio', ...range(21) }));
    fails(await scheduling.requestSession({ studentId: 's_mateo', mode: 'IN_PERSON', locationId: 'loc_home', startsAt: slots[0].startsAt, durationMin: 45 }), 'INVALID', /address/);
  });
});

describe('Vienne decides', () => {
  it('confirming a video request puts her link on it and tells the family', async () => {
    as('u_admin');
    const s = ok(await scheduling.confirmSession({ sessionId: 'ses_r1' }));
    expect(s.status).toBe('CONFIRMED');
    expect(s.meetingUrl).toMatch(/^https:\/\//);
    const n = await db.notification.findFirst({ where: { userId: 'u_keisha', type: 'SESSION_CONFIRMED' }, orderBy: { createdAt: 'desc' } });
    expect(n?.body).toMatch(/Join call button appears 15 minutes before/);
    fails(await scheduling.confirmSession({ sessionId: 'ses_r1' }), 'INVALID', /Only requests/);
  });

  it('a video request can’t be confirmed until she has a video link', async () => {
    as('u_admin');
    ok(await scheduling.updateSettings({ defaultMeetingUrl: null }));
    as('u_ana');
    const [slot] = await openVideoSlots();
    const req = ok(await scheduling.requestSession({ studentId: 's_lucia', mode: 'VIDEO', startsAt: slot.startsAt, durationMin: 45 }));
    as('u_admin');
    fails(await scheduling.confirmSession({ sessionId: req.id }), 'INVALID', /video link in Settings/);
    ok(await scheduling.updateSettings({ defaultMeetingUrl: 'https://meet.google.com/mmv-tutr-room' }));
    ok(await scheduling.confirmSession({ sessionId: req.id }));
  });

  it('declining tells the family why', async () => {
    as('u_admin');
    ok(await scheduling.declineSession({ sessionId: 'ses_r2', reason: 'I’m away that weekend' }));
    const n = await db.notification.findFirst({ where: { userId: 'u_ana', type: 'SESSION_DECLINED' } });
    expect(n?.body).toBe('I’m away that weekend');
  });

  it('settings validation uses plain words', async () => {
    as('u_admin');
    fails(await scheduling.updateSettings({ defaultMeetingUrl: 'meet.google.com/abc' }), 'INVALID', /https:\/\//);
    fails(await scheduling.updateSettings({ minNoticeHours: -1 }), 'INVALID', /whole number/);
    fails(await scheduling.updateSettings({ timezone: 'UTC' } as never), 'INVALID', /can’t change/);
  });
});

describe('cancelling', () => {
  it('a parent can cancel up to 24 hours before; after that they message Vienne', async () => {
    as('u_admin');
    // A session under 24 hours away, at whatever time is free right now.
    let soon: { id: string } | null = null;
    for (let h = 3; h <= 20 && !soon; h += 0.5) {
      const r = await scheduling.createSessionAsAdmin({ studentId: 's_mateo', mode: 'IN_PERSON', locationId: 'loc_studio', startsAt: new Date(Date.now() + h * HOUR).toISOString(), durationMin: 30 });
      if (r.ok) soon = r.data;
    }
    if (!soon) throw new Error('No free half hour in the next 20 hours');
    as('u_ana');
    fails(await scheduling.cancelSession({ sessionId: soon.id }), 'PAST_CUTOFF', /Message Vienne/);
    const far = await upcomingSession({ parentId: 'u_ana', minHoursAway: 30, not: [soon.id] });
    const later = ok(await scheduling.cancelSession({ sessionId: far.id, reason: 'Family visit' }));
    expect(later.status).toBe('CANCELLED');
    expect(await db.notification.count({ where: { userId: 'u_admin', type: 'SESSION_CANCELLED_BY_PARENT' } })).toBeGreaterThan(0);
    // Vienne can cancel any time.
    as('u_admin');
    ok(await scheduling.cancelSession({ sessionId: soon.id, reason: 'Sick' }));
  });
});

describe('video calls', () => {
  it('Join works inside the window and records that the call started', async () => {
    as('u_grace');
    const r = ok(await scheduling.joinCall({ sessionId: 'ses_live' }));
    expect(r.meetingUrl).toMatch(/^https:\/\//);
    expect((await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } })).callStartedAt).not.toBeNull();
    const later = await upcomingSession({ studentId: 's_noah', mode: 'VIDEO', minHoursAway: 2 });
    fails(await scheduling.joinCall({ sessionId: later.id }), 'INVALID', /opens 15 minutes before/);
  });
});

describe('moving and finishing', () => {
  it('rescheduling can’t land on another session', async () => {
    as('u_admin');
    const mine = await upcomingSession({ parentId: 'u_ana', minHoursAway: 30 });
    const other = await upcomingSession({ minHoursAway: 30, not: [mine.id] });
    fails(await scheduling.rescheduleSession({ sessionId: mine.id, startsAt: other.startsAt.toISOString() }), 'SLOT_TAKEN');
    const free = ok(await scheduling.getOpenSlots({ durationMin: mine.durationMin, mode: 'IN_PERSON', locationId: 'loc_studio', ...range(21) }));
    const moved = ok(await scheduling.rescheduleSession({ sessionId: mine.id, startsAt: free[3].startsAt }));
    expect(moved.startsAt).toBe(free[3].startsAt);
    expect(new Date(moved.endsAt).getTime() - new Date(moved.startsAt).getTime()).toBe(mine.durationMin * 60000);
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'SESSION_CHANGED' } })).toBeGreaterThan(0);
  });

  it('completing saves the note, the skills and redo questions, and accepts the AI draft', async () => {
    as('u_admin');
    const item = await db.bookItem.findFirstOrThrow({ where: { book: { grade: 5 }, test: 'T1', number: 3 } });
    const wrongGrade = await db.bookItem.findFirstOrThrow({ where: { book: { grade: 3 } } });
    const openRedo = await db.redoItem.findFirst({ where: { studentId: 's_noah', clearedAt: null } });
    const draft = await db.aiDraft.create({ data: { kind: 'SESSION_NOTE', model: 'claude-haiku-5-5', effort: 'high', refId: 'ses_live', input: {}, output: {} } });
    const skill = await db.skill.findFirstOrThrow({ where: { gradeMin: { lte: 5 }, gradeMax: { gte: 5 } } });
    const s = ok(
      await scheduling.completeSession({
        sessionId: 'ses_live',
        attendance: 'PRESENT',
        summary: 'Great focus on fractions today.',
        skillIds: [skill.id],
        redoItemIds: [item.id, wrongGrade.id],
        clearRedoIds: openRedo ? [openRedo.id] : [],
        source: 'VOICE',
        aiDraftId: draft.id,
      }),
    );
    expect(s.status).toBe('COMPLETED');
    expect(s.note).toMatchObject({ summary: 'Great focus on fractions today.', source: 'VOICE', skills: [{ id: skill.id }] });
    expect(await db.redoItem.count({ where: { studentId: 's_noah', bookItemId: item.id, clearedAt: null } })).toBe(1);
    expect(await db.redoItem.count({ where: { studentId: 's_noah', bookItemId: wrongGrade.id } })).toBe(0); // another grade’s book is ignored
    if (openRedo) expect((await db.redoItem.findUniqueOrThrow({ where: { id: openRedo.id } })).clearedAt).not.toBeNull();
    expect((await db.aiDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('ACCEPTED');
    expect((await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } })).callEndedAt).not.toBeNull();
    fails(await scheduling.completeSession({ sessionId: 'ses_live', attendance: 'PRESENT', summary: 'again' }), 'INVALID', /Only confirmed/);
  });

  it('weekly hours replace as a whole and reject backwards blocks', async () => {
    as('u_admin');
    fails(await scheduling.setAvailability({ rows: [{ weekday: 1, startMin: 600, endMin: 540 }] }), 'INVALID', /after start/);
    const rows = ok(await scheduling.setAvailability({ rows: [{ weekday: 2, startMin: 900, endMin: 1140, modes: ['VIDEO'] }] }));
    expect(rows).toHaveLength(1);
    expect(rows[0].modes).toEqual(['VIDEO']);
  });
});
