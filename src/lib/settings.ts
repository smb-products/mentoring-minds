import 'server-only';
import { db } from './db';

export type FastWindowRow = { window: 'PM1' | 'PM2' | 'PM3'; schoolYear: string; startsAt: string; endsAt: string };

/** Vienne's rules (the single Settings row), with JSON fields typed. */
export type AppSettings = {
  id: number;
  timezone: string;
  sessionLengths: number[];
  slotStepMin: number;
  minNoticeHours: number;
  cancelCutoffHours: number;
  horizonWeeks: number;
  defaultMeetingUrl: string | null;
  joinOpensMin: number;
  fastWindows: FastWindowRow[];
};

/** Reads the settings row, creating it with defaults on first use. */
export async function loadSettings(): Promise<AppSettings> {
  const row = (await db.settings.findUnique({ where: { id: 1 } })) ?? (await db.settings.create({ data: { id: 1 } }));
  return {
    ...row,
    sessionLengths: (row.sessionLengths as number[]) ?? [30, 45, 60],
    fastWindows: (row.fastWindows as FastWindowRow[]) ?? [],
  };
}

/** The next or current FAST testing window (Today and parent Home). */
export function nextFastWindow(settings: AppSettings, now = new Date()) {
  const w = [...settings.fastWindows].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).find((x) => new Date(x.endsAt).getTime() >= now.getTime());
  if (!w) return null;
  const startsMs = new Date(w.startsAt).getTime();
  return { ...w, inProgress: startsMs <= now.getTime(), daysUntil: Math.max(0, Math.ceil((startsMs - now.getTime()) / 86400000)) };
}

/** School year label for a date, e.g. "2026–27" (Florida years start in August). */
export function schoolYearOf(date = new Date(), timeZone = 'America/New_York') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(date).map((x) => [x.type, x.value]));
  const y = Number(p.year);
  const start = Number(p.month) >= 8 ? y : y - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}
