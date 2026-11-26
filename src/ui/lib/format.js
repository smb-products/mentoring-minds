/**
 * Display formatting. Dates arrive as ISO strings from the data layer.
 *
 * Dates and times show in Vienne's zone (Settings.timezone), the zone lib/time.ts
 * uses for slots and "today", so a parent whose phone is set to another zone still
 * sees Miami times. Never the browser's zone, never setHours().
 */

/** Settings.timezone. It isn't editable (scheduling.updateSettings leaves it out). */
const ZONE = 'America/New_York';
export const appTimeZone = () => ZONE;

const d = (iso) => (iso instanceof Date ? iso : new Date(iso));
const fmt = (iso, opts) => d(iso).toLocaleString(undefined, { timeZone: ZONE, ...opts });

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });

/** Wall-clock parts of an instant in Vienne's zone (as lib/time.ts). */
export const zoned = (iso) => {
  const p = Object.fromEntries(partsFmt.formatToParts(d(iso)).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WEEKDAYS.indexOf(p.weekday) };
};
/** Day of the month, hour (0–23) and weekday (0 = Sunday), in Vienne's zone. */
export const dayOfMonth = (iso) => zoned(iso).day;
export const hourOf = (iso) => zoned(iso).hour;
export const minuteOf = (iso) => zoned(iso).minute;
export const weekdayOf = (iso) => zoned(iso).weekday;

/** The instant for a wall-clock time in Vienne's zone (DST-safe, as lib/time.ts zonedToUtc). */
const fromZoned = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => {
  const offset = (t) => {
    const p = zoned(new Date(t));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  };
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - offset(guess);
  utc = guess - offset(utc); // second pass settles DST edges
  return new Date(utc);
};

const pad = (n) => String(n).padStart(2, '0');
/** "2026-11-26" for a date input, in Vienne's zone. */
export const toDateInput = (iso) => {
  const p = zoned(iso);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
/** A date input ("2026-11-26") and time input ("16:00") read as Vienne's wall clock. */
export const fromDateTimeInput = (date, time = '00:00') => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return fromZoned({ year, month, day, hour, minute });
};

export const fmtTime = (iso) => fmt(iso, { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (iso) => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtLongDay = (iso) => fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtDate = (iso) => fmt(iso, { month: 'short', day: 'numeric' });
export const fmtDateYear = (iso) => fmt(iso, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtWeekday = (iso) => fmt(iso, { weekday: 'short' });
/** Any other date format (toLocaleDateString options), in Vienne's zone. */
export const fmtDateWith = (iso, opts) => fmt(iso, opts);
export const fmtTimeRange = (start, end) => `${fmtTime(start)} – ${fmtTime(end)}`;

/** Midnight, in Vienne's zone. */
export const startOfDay = (date = new Date()) => {
  const p = zoned(date);
  return fromZoned({ year: p.year, month: p.month, day: p.day });
};
/** The same wall-clock time n calendar days later, in Vienne's zone. */
export const addDays = (date, n) => {
  const p = zoned(date);
  const c = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return fromZoned({ ...p, year: c.getUTCFullYear(), month: c.getUTCMonth() + 1, day: c.getUTCDate() });
};
/** Monday-start week. */
export const startOfWeek = (date = new Date()) => {
  const x = startOfDay(date);
  return addDays(x, -((weekdayOf(x) + 6) % 7));
};
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
export const isToday = (iso) => sameDay(iso, new Date());
export const isTomorrow = (iso) => sameDay(iso, addDays(new Date(), 1));

/** "Today", "Tomorrow" or "Tue, Nov 24". */
export const fmtRelativeDay = (iso) => (isToday(iso) ? 'Today' : isTomorrow(iso) ? 'Tomorrow' : fmtDay(iso));

export function fmtAgo(iso) {
  const diff = (Date.now() - d(iso).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
}

export function fmtDue(iso) {
  if (!iso) return 'No due date';
  const days = Math.round((startOfDay(iso) - startOfDay()) / 86400000);
  if (days < 0) return `Due ${fmtDate(iso)}, late`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due ${fmtWeekday(iso)}`;
  return `Due ${fmtDate(iso)}`;
}

export const gradeLabel = (g) => (g === 0 ? 'Kindergarten' : `Grade ${g}`);
export const gradeShort = (g) => (g === 0 ? 'K' : String(g));
export const gradeRange = (min, max) => (min === max ? gradeLabel(min) : `Grades ${gradeShort(min)}–${gradeShort(max)}`);

export const fullName = (p) => `${p.firstName} ${p.lastName}`.trim();
export const firstName = (name = '') => name.split(' ')[0];

/** Minutes after midnight (availability windows) as "3:00 PM". A wall-clock label, no zone involved. */
export const minutesToLabel = (m) => {
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60));
  return date.toLocaleTimeString(undefined, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
};

export const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Time-of-day greeting, by the hour in Vienne's zone. */
export const greeting = () => {
  const h = hourOf(new Date());
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
