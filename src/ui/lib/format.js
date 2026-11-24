/** Display formatting. Dates arrive as ISO strings from the data layer. */

const d = (iso) => (iso instanceof Date ? iso : new Date(iso));

export const fmtTime = (iso) => d(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDay = (iso) => d(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtLongDay = (iso) => d(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtDate = (iso) => d(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const fmtDateYear = (iso) => d(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const fmtWeekday = (iso) => d(iso).toLocaleDateString(undefined, { weekday: 'short' });
export const fmtTimeRange = (start, end) => `${fmtTime(start)} – ${fmtTime(end)}`;

export const startOfDay = (date = new Date()) => {
  const x = d(date);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};
export const addDays = (date, n) => {
  const x = new Date(d(date));
  x.setDate(x.getDate() + n);
  return x;
};
/** Monday-start week. */
export const startOfWeek = (date = new Date()) => {
  const x = startOfDay(date);
  return addDays(x, -((x.getDay() + 6) % 7));
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

export const minutesToLabel = (m) => {
  const date = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export const fmtBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Time-of-day greeting. */
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
