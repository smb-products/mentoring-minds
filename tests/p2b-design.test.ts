/**
 * P2b: Vienne's screens, and the session drawers and day timeline they use, match P1 (docs/DESIGN.md → App
 * polish): the shared card, badge and button, no navy left from the band, and no one-off radii. Plus OSA's five
 * P1 review nits (2026-11-27). Reads source only, no database. tests/e2e/p2b-screens.spec.ts checks the result
 * in a browser.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

function files(p: string): string[] {
  if (!statSync(path.join(ROOT, p)).isDirectory()) return [p];
  return readdirSync(path.join(ROOT, p)).flatMap((f) => files(path.join(p, f))).filter((f) => /\.(jsx?|tsx?)$/.test(f));
}

// This ticket's `touches`, without its tests and report.
const OWNED = [
  'src/ui/pages/admin',
  'src/ui/components/ui/Display.jsx',
  'src/ui/components/sessions/AddSessionDrawer.jsx',
  'src/ui/components/sessions/AdminSessionDrawer.jsx',
  'src/ui/components/sessions/DayTimeline.jsx',
].flatMap(files);

const ADMIN = (name: string) => `src/ui/pages/admin/${name}.jsx`;

const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Class tokens: every whitespace-separated word of a string literal, without its variants (dark:, hover:, @3xl/page:). */
function classTokens(source: string): string[] {
  const literals = [...stripComments(source).matchAll(/(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)].map((m) => m[2]);
  return literals
    .flatMap((l) => l.split(/\s+/))
    .map((t) => t.replace(/^.*:/, '').replace(/^!/, ''))
    .filter(Boolean);
}

/** Every class token in the ticket's files that matches, as "file: token". */
function tokens(pattern: RegExp, list = OWNED) {
  return list.flatMap((f) => classTokens(read(f)).filter((t) => pattern.test(t)).map((t) => `${f}: ${t}`));
}

describe('the admin screens match P1: no navy, no one-off radii, type on the scale', () => {
  it('found the files', () => {
    expect(files('src/ui/pages/admin').length).toBeGreaterThanOrEqual(13);
    expect(OWNED.length).toBeGreaterThanOrEqual(17);
  });

  it('no navy left from the band: no bg-ink, text-ink-* or band class token', () => {
    expect(tokens(/^(bg|text|ring|border|fill)-ink(-|$|\/)|^band$/)).toEqual([]);
  });

  it('no one-off radii: no rounded-[…] and no rounded-sm, -xl, -2xl or -3xl', () => {
    expect(tokens(/^rounded(-[a-z]{1,2})?-\[/)).toEqual([]);
    expect(tokens(/^rounded(-[a-z]{1,2})?-(sm|xl|2xl|3xl)$/)).toEqual([]);
  });

  it('no font-bold and no text-[Npx]', () => {
    expect(tokens(/^font-bold$/)).toEqual([]);
    expect(tokens(/^text-\[\d+(\.\d+)?px\]$/)).toEqual([]);
  });

  it('cards are the shared white card, and badges and buttons the shared ones', () => {
    const display = read('src/ui/components/ui/Display.jsx');
    expect(display).toMatch(/const CARD = 'rounded-lg border border-border bg-card shadow-card'/);
    expect(display).toMatch(/const BADGE = '[^']*rounded-md bg-badge[^']*text-badge-foreground'/);
    // Every screen imports its buttons from the shared Button, and its badges from Display.
    for (const f of files('src/ui/pages/admin')) {
      const src = read(f);
      if (/<Button\b/.test(src)) expect(src, f).toMatch(/import \{[^}]*\bButton\b[^}]*\} from '\.\.\/\.\.\/components\/ui\/Button'/);
      if (/<(StatusBadge|LevelBadge)\b/.test(src)) expect(src, f).toMatch(/from '\.\.\/\.\.\/components\/ui\/Display'/);
    }
  });

  it("P2a's shared parts are not edited here", () => {
    expect(OWNED.filter((f) => /SessionParts|Thread|FastResults/.test(f))).toEqual([]);
  });
});

describe("OSA's P1 review nits", () => {
  const display = stripComments(read('src/ui/components/ui/Display.jsx'));

  it('1. the stat sublines wrap and read in full: no truncate, ellipsis or line clamp', () => {
    const figures = display.slice(display.indexOf('export function Figures'), display.indexOf('export function PageLoading'));
    const note = figures.match(/\{item\.note && <span data-figure-note className="([^"]*)"/)?.[1];
    expect(note).toBeDefined();
    expect(note).not.toMatch(/\btruncate\b|text-ellipsis|line-clamp|whitespace-nowrap|text-nowrap/);
  });

  it('2. each Families stat card has its own lucide icon: users, graduation-cap, key-round, clock', () => {
    const families = stripComments(read(ADMIN('FamiliesPage')));
    const figures = families.slice(families.indexOf('<Figures'), families.indexOf('/>', families.indexOf('items={[')));
    const icons = [...figures.matchAll(/\{ label: '[^']+',[^\n]*?\bicon: (\w+)/g)].map((m) => m[1]);
    expect(icons).toEqual(['Users', 'GraduationCap', 'KeyRound', 'Clock']);
    expect(families).toMatch(/import \{[^}]*\bClock\b[^}]*\bGraduationCap\b[^}]*\bKeyRound\b[^}]*\bUsers\b[^}]*\} from 'lucide-react'/);
  });

  it("3. Today's 'This week' selected day is the accent, with primary-foreground text", () => {
    const today = stripComments(read(ADMIN('TodayPage')));
    const week = today.slice(today.indexOf('function WeekGlance'));
    expect(week).toMatch(/today && 'bg-primary text-primary-foreground'/);
    expect(week).not.toMatch(/\bbg-ink\b|\btext-ink-/);
  });

  it("4. Today's Up next card has no left accent border or bar", () => {
    const today = stripComments(read(ADMIN('TodayPage')));
    const upNext = today.slice(today.indexOf('function UpNext'), today.indexOf('function', today.indexOf('function UpNext') + 10));
    expect(upNext).toMatch(/rounded-lg border border-border bg-card shadow-card/);
    expect(upNext).not.toMatch(/\bborder-l(-\w+)?\b|absolute inset-y-0 left-0/);
  });

  it('5. Avatar is a soft tinted circle, bg-brand-soft with text-primary initials, never navy', () => {
    const tones = display.match(/const AVATAR_TONES = \{([^}]*)\}/)?.[1] ?? '';
    const soft = display.match(/const AVATAR_SOFT = '([^']*)'/)?.[1] ?? '';
    expect(soft).toMatch(/^bg-brand-soft text-primary\b/);
    for (const tone of ['brand', 'reward', 'good', 'ink', 'neutral', 'sidebar']) expect(tones).toMatch(new RegExp(`\\b${tone}: AVATAR_SOFT\\b`));
    // Its accessible name and initials don't change: still aria-hidden, still initials(name).
    expect(display).toMatch(/<span aria-hidden className=\{cn\('grid shrink-0 place-items-center rounded-full[^']*', AVATAR_TONES\[tone\][^}]*\}>\s*\{initials\(name\)\}/);
  });
});
