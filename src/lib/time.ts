/**
 * Wall-clock time in Vienne's time zone (Settings.timezone, America/New_York),
 * independent of where the server runs. No date library needed.
 */
const partsIn = (date: Date, timeZone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
};

/** Offset (ms) of `timeZone` from UTC at `date`. */
const offsetAt = (date: Date, timeZone: string) => {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
};

/** The UTC instant for "year-month-day at minutes-after-midnight" in `timeZone` (DST-safe). */
export function zonedToUtc(ymd: { year: number; month: number; day: number }, minutes: number, timeZone: string): Date {
  const guess = Date.UTC(ymd.year, ymd.month - 1, ymd.day, Math.floor(minutes / 60), minutes % 60);
  let utc = guess - offsetAt(new Date(guess), timeZone);
  utc = guess - offsetAt(new Date(utc), timeZone); // second pass settles DST edges
  return new Date(utc);
}

/** Calendar date and weekday of an instant, as seen in `timeZone`. */
export const zonedDay = (date: Date, timeZone: string) => {
  const p = partsIn(date, timeZone);
  return { year: p.year, month: p.month, day: p.day, weekday: p.weekday, minutes: p.hour * 60 + p.minute };
};

/** Add whole days to a calendar date (no time zone involved). */
export const addDays = (ymd: { year: number; month: number; day: number }, n: number) => {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), weekday: d.getUTCDay() };
};
