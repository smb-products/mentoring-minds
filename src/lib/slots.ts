/**
 * Open slots and booking conflicts (src/mock/server/scheduling.js).
 * Pure functions: the server module loads rows from Prisma and passes them in.
 */
import { addDays, zonedDay, zonedToUtc } from './time';

export type Mode = 'IN_PERSON' | 'VIDEO';
export type Place = { mode: Mode; locationId: string | null; address: string | null };
export type Booked = Place & { id: string; status: string; startsAt: Date; endsAt: Date };
export type AvailabilityRow = { weekday: number; startMin: number; endMin: number; modes: Mode[] };
export type Rules = { timezone: string; slotStepMin: number; minNoticeHours: number; horizonWeeks: number; sessionLengths: number[] };

const MIN = 60000;
const HOLDS_SLOT = ['REQUESTED', 'CONFIRMED'];

/**
 * A time is taken only by Vienne's time off and by the session time itself
 * (requested or confirmed). No travel time is added before or after any session:
 * video or in person, only the session's own minutes count.
 */
export function conflicts(
  start: Date,
  end: Date,
  _where: Place,
  ctx: { booked: Booked[]; timeOff: { startsAt: Date; endsAt: Date }[]; ignoreId?: string },
) {
  const s = start.getTime();
  const e = end.getTime();
  if (ctx.timeOff.some((o) => s < o.endsAt.getTime() && e > o.startsAt.getTime())) return true;
  return ctx.booked.some((b) => b.id !== ctx.ignoreId && HOLDS_SLOT.includes(b.status) && s < b.endsAt.getTime() && e > b.startsAt.getTime());
}

/** Every bookable start between `from` and `to` (inclusive days), in Vienne's time zone. */
export function openSlots(input: {
  durationMin: number;
  where: Place;
  from: Date;
  to: Date;
  now: Date;
  rules: Rules;
  availability: AvailabilityRow[];
  booked: Booked[];
  timeOff: { startsAt: Date; endsAt: Date }[];
}) {
  const { rules } = input;
  const earliest = input.now.getTime() + rules.minNoticeHours * 3600000;
  const latest = input.now.getTime() + rules.horizonWeeks * 7 * 86400000;
  const out: { startsAt: string; endsAt: string }[] = [];
  const first = zonedDay(input.from, rules.timezone);
  const last = zonedDay(input.to, rules.timezone);
  for (let i = 0; i < 400; i += 1) {
    const day = addDays(first, i);
    if (Date.UTC(day.year, day.month - 1, day.day) > Date.UTC(last.year, last.month - 1, last.day)) break;
    for (const a of input.availability) {
      if (a.weekday !== day.weekday || !a.modes.includes(input.where.mode)) continue;
      for (let m = a.startMin; m + input.durationMin <= a.endMin; m += rules.slotStepMin) {
        const start = zonedToUtc(day, m, rules.timezone);
        const end = new Date(start.getTime() + input.durationMin * MIN);
        if (start.getTime() < earliest || start.getTime() > latest) continue;
        if (conflicts(start, end, input.where, input)) continue;
        out.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
      }
    }
  }
  return out;
}
