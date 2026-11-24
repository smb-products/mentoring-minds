import { describe, expect, it } from 'vitest';
import { openSlots, conflicts, type Booked } from '@/lib/slots';
import { zonedToUtc } from '@/lib/time';

const TZ = 'America/New_York';
const rules = { timezone: TZ, slotStepMin: 15, minNoticeHours: 24, horizonWeeks: 4, sessionLengths: [30, 45, 60] };

describe('time zone', () => {
  it('turns Miami wall time into UTC across daylight saving', () => {
    expect(zonedToUtc({ year: 2026, month: 12, day: 1 }, 15 * 60, TZ).toISOString()).toBe('2026-12-01T20:00:00.000Z'); // EST
    expect(zonedToUtc({ year: 2026, month: 7, day: 1 }, 15 * 60, TZ).toISOString()).toBe('2026-07-01T19:00:00.000Z'); // EDT
  });
});

describe('conflicts (no travel time)', () => {
  const at = (h: number, m = 0) => zonedToUtc({ year: 2026, month: 12, day: 1 }, h * 60 + m, TZ);
  const home: Booked = { id: 'b1', status: 'CONFIRMED', mode: 'IN_PERSON', locationId: 'home', address: '12 Palm Ave', startsAt: at(15), endsAt: at(15, 45) };
  const ctx = { booked: [home], timeOff: [] };
  const video = { mode: 'VIDEO' as const, locationId: null, address: null };
  it('a video call can start the minute a home visit ends', () => {
    expect(conflicts(at(15, 45), at(16, 30), video, ctx)).toBe(false);
  });
  it('another home visit can start right after, too', () => {
    expect(conflicts(at(15, 45), at(16, 30), { mode: 'IN_PERSON', locationId: 'home', address: '9 Bay Rd' }, ctx)).toBe(false);
  });
  it('overlapping the session itself is taken', () => {
    expect(conflicts(at(15, 30), at(16, 15), video, ctx)).toBe(true);
  });
  it('declined and cancelled sessions free the time', () => {
    expect(conflicts(at(15), at(15, 45), video, { ...ctx, booked: [{ ...home, status: 'CANCELLED' }] })).toBe(false);
  });
});

describe('openSlots', () => {
  it('only offers video where the block offers video', () => {
    const base = { durationMin: 45, from: new Date('2026-12-01T05:00:00Z'), to: new Date('2026-12-01T23:00:00Z'), now: new Date('2026-11-25T12:00:00Z'), rules, booked: [], timeOff: [] };
    const availability = [{ weekday: 2, startMin: 15 * 60, endMin: 17 * 60, modes: ['IN_PERSON' as const] }];
    expect(openSlots({ ...base, availability, where: { mode: 'VIDEO', locationId: null, address: null } })).toHaveLength(0);
    const slots = openSlots({ ...base, availability, where: { mode: 'IN_PERSON', locationId: 'studio', address: null } });
    expect(slots[0].startsAt).toBe('2026-12-01T20:00:00.000Z');
    expect(slots.at(-1)?.startsAt).toBe('2026-12-01T21:15:00.000Z');
  });
});
