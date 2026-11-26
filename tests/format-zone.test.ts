/** W6 check 8: screens show dates and times in Vienne's zone (Miami), whatever zone the device is set to. */
import { describe, expect, it } from 'vitest';
import * as f from '../src/ui/lib/format.js';
import { zonedToUtc } from '@/lib/time';

const MIAMI = 'America/New_York';
const plain = (s: string) => s.replace(/\s/g, ' ');
const miamiClock = (d: Date) => plain(new Intl.DateTimeFormat('en-US', { timeZone: MIAMI, hour: 'numeric', minute: '2-digit' }).format(d));

describe('format.js uses Settings.timezone, not the browser zone', () => {
  it('formats a 3:00 PM Miami slot as 3:00 PM, with its Miami day', () => {
    const slot = zonedToUtc({ year: 2026, month: 12, day: 1 }, 15 * 60, MIAMI);
    expect(plain(f.fmtTime(slot.toISOString()))).toBe('3:00 PM');
    expect(plain(f.fmtTime(slot))).toBe(miamiClock(slot));
    expect(f.hourOf(slot)).toBe(15);
    expect(f.dayOfMonth(slot)).toBe(1);
    expect(f.weekdayOf(slot)).toBe(2); // Tuesday
  });

  it('a late-evening Miami session stays on its Miami day (the next day in UTC)', () => {
    const late = zonedToUtc({ year: 2026, month: 12, day: 1 }, 21 * 60, MIAMI); // 02:00 UTC on Dec 2
    expect(late.getUTCDate()).toBe(2);
    expect(f.dayOfMonth(late)).toBe(1);
    expect(f.startOfDay(late).toISOString()).toBe(zonedToUtc({ year: 2026, month: 12, day: 1 }, 0, MIAMI).toISOString());
    expect(f.sameDay(late, zonedToUtc({ year: 2026, month: 12, day: 1 }, 9 * 60, MIAMI))).toBe(true);
  });

  it('day math matches lib/time.ts across the November DST change', () => {
    const sat = zonedToUtc({ year: 2026, month: 10, day: 31 }, 0, MIAMI);
    expect(f.addDays(sat, 1).toISOString()).toBe(zonedToUtc({ year: 2026, month: 11, day: 1 }, 0, MIAMI).toISOString());
    expect(f.addDays(sat, 2).toISOString()).toBe(zonedToUtc({ year: 2026, month: 11, day: 2 }, 0, MIAMI).toISOString());
    const wed = zonedToUtc({ year: 2026, month: 11, day: 4 }, 16 * 60, MIAMI);
    expect(f.startOfWeek(wed).toISOString()).toBe(zonedToUtc({ year: 2026, month: 11, day: 2 }, 0, MIAMI).toISOString());
  });

  it('date and time inputs read as Miami wall clock', () => {
    const at = f.fromDateTimeInput('2026-12-01', '16:00');
    expect(at.toISOString()).toBe(zonedToUtc({ year: 2026, month: 12, day: 1 }, 16 * 60, MIAMI).toISOString());
    expect(f.toDateInput(zonedToUtc({ year: 2026, month: 12, day: 1 }, 23 * 60, MIAMI))).toBe('2026-12-01');
  });

  it('availability labels are wall-clock minutes', () => {
    expect(plain(f.minutesToLabel(15 * 60 + 30))).toBe('3:30 PM');
  });
});
