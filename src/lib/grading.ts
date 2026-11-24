/**
 * Answer-sheet checking (same rules as src/mock/server/assignments.js).
 * The key never leaves the server; families only send { number, value }.
 */
export type ItemFormat = 'MC' | 'MULTI' | 'NUMERIC' | 'OPEN';
export type KeyItem = { number: number; format: ItemFormat; answer: string | null; points: number };
export type ScoredAnswer = { number: number; value: string | null; correct: boolean | null };

/** "3/4", "0.75", "1 1/2", ".5", "1,200", "-3" → number. NaN when it isn't a number. */
export function toNumber(raw: unknown): number {
  const v = String(raw ?? '').trim().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!v) return NaN;
  const mixed = v.match(/^(-?\d+) (\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    return whole + Math.sign(whole || 1) * (Number(mixed[2]) / Number(mixed[3]));
  }
  const frac = v.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) === 0 ? NaN : Number(frac[1]) / Number(frac[2]);
  return /^-?\d*\.?\d+$/.test(v) ? Number(v) : NaN;
}

const letters = (v: unknown) => [...new Set(String(v ?? '').toUpperCase().replace(/[^A-Z]/g, '').split(''))].sort().join('');

/**
 * Right or wrong. Equivalent numbers count (3/4 = 0.75 = 6/8); letter order and
 * spacing don't matter for multi-select. OPEN items return null: Vienne decides.
 */
export function check(item: Pick<KeyItem, 'format' | 'answer'>, value: unknown): boolean | null {
  if (item.format === 'OPEN') return null;
  if (value == null || String(value).trim() === '') return false;
  if (item.format === 'NUMERIC') {
    const a = toNumber(value);
    const b = toNumber(item.answer);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
  }
  return letters(value) === letters(item.answer);
}

/** Stars: ≥90% = 3, ≥70% = 2, any finished sheet = 1. */
export const starsFor = (score: number, max: number) => (max === 0 ? 1 : score / max >= 0.9 ? 3 : score / max >= 0.7 ? 2 : 1);

/** Score a whole sheet. `waiting` is true when written answers still need Vienne. */
export function scoreSheet(items: KeyItem[], answers: { number: number; value: string | null }[]) {
  const scored: ScoredAnswer[] = items.map((it) => {
    const value = it.format === 'OPEN' ? null : answers.find((a) => a.number === it.number)?.value ?? null;
    return { number: it.number, value, correct: check(it, value) };
  });
  const maxScore = items.reduce((t, it) => t + it.points, 0);
  const autoScore = items.reduce((t, it, i) => t + (scored[i].correct ? it.points : 0), 0);
  const waiting = items.some((it) => it.format === 'OPEN');
  return { scored, maxScore, autoScore, waiting, stars: waiting ? 0 : starsFor(autoScore, maxScore) };
}
