/**
 * R3: Vienne's screens follow docs/DESIGN.md.
 * The same source checks as tests/r1-design.test.ts, over this ticket's files, plus OSA's R1 taste notes:
 * no 700 weight, and the stat rows sit on the gray page below a slim band.
 * Reads source only, no database. The browser suite proves nothing a person reads or taps moved.
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

// This ticket's screens and components (its `touches`, without the test and the report).
const SCREENS = [
  'src/ui/pages/admin',
  'src/ui/components/sessions/AdminSessionDrawer.jsx',
  'src/ui/components/sessions/AddSessionDrawer.jsx',
  'src/ui/components/sessions/DayTimeline.jsx',
].flatMap(files);

const ADMIN = (name: string) => `src/ui/pages/admin/${name}.jsx`;

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Class tokens: every whitespace-separated word of a string literal that holds more than one word. */
function classTokens(source: string): string[] {
  const literals = [...stripComments(source).matchAll(/(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)].map((m) => m[2]);
  return literals
    .filter((l) => /\s/.test(l.trim()))
    .flatMap((l) => l.split(/\s+/))
    .map((t) => t.replace(/^.*:/, '').replace(/^!/, ''))
    .filter(Boolean);
}

const FLAT_UTILITIES = ['surface', 'band', 'glass', 'rail', 'chrome-primary', 'chrome-secondary', 'chrome-glass', 'press-primary', 'press-reward', 'press-quiet'];

function hits(pattern: RegExp, list = SCREENS) {
  return list.filter((f) => pattern.test(stripComments(read(f))));
}

/** Every line of the ticket's files that matches, as "file: line". */
function lines(pattern: RegExp, list = SCREENS) {
  return list.flatMap((f) =>
    stripComments(read(f))
      .split('\n')
      .filter((l) => pattern.test(l))
      .map((l) => `${f}: ${l.trim()}`),
  );
}

describe("Vienne's screens follow docs/DESIGN.md", () => {
  it('found the files', () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(16);
    for (const f of ['TodayPage', 'FamiliesPage', 'FamilyPage', 'SchedulePage', 'AssignmentsPage', 'AssignmentPage', 'ContentPage', 'AnswerKeyPage']) {
      expect(SCREENS).toContain(ADMIN(f));
    }
  });

  it('type uses only the scale: no text-[Npx], font-display, font-extrabold or font-bold', () => {
    expect(hits(/text-\[\d+(\.\d+)?px\]/)).toEqual([]);
    expect(hits(/font-display/)).toEqual([]);
    expect(hits(/font-extrabold/)).toEqual([]);
    expect(hits(/\bfont-bold\b/)).toEqual([]);
    expect(hits(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)).toEqual([]);
    // Every size is a scale token.
    const sizes = SCREENS.flatMap((f) => classTokens(read(f)).filter((t) => /^text-(\[|\d|caption|small|body|input|heading|title|page|figure)/.test(t)));
    expect(sizes.filter((t) => !/^text-(caption|small|body|input|heading|title|page|figure)$/.test(t))).toEqual([]);
  });

  it('is flat: no gradients, and no surface, band, glass, chrome-*, press-* or rail class', () => {
    expect(hits(/linear-gradient|radial-gradient|bg-gradient|bg-linear|bg-radial/)).toEqual([]);
    const used = SCREENS.flatMap((f) => classTokens(read(f)).filter((t) => FLAT_UTILITIES.includes(t) || /^(chrome|press)-/.test(t)).map((t) => `${f}: ${t}`));
    expect(used).toEqual([]);
    expect(hits(/shadow-raised|drop-shadow|shadow-(sm|md|lg|xl|2xl)\b|inset-shadow/)).toEqual([]);
  });

  it('nothing moves on hover or press', () => {
    expect(lines(/(hover|active):-?translate|(hover|active):scale-/)).toEqual([]);
  });

  it('rounded-full only on avatars, status dots and counts', () => {
    // The status dots: the now marker on the day timeline and the week grid, and the day picker's "has sessions" dot.
    const allowed = /size-2 -translate-x-1\/2 rounded-full|size-2\.5 rounded-full|h-1\.5 w-1\.5 rounded-full/;
    expect(lines(/rounded-full/).filter((l) => !allowed.test(l))).toEqual([]);
  });

  it('8px corners on cards, drawers and dialogs; 6px on controls and badges', () => {
    expect(hits(/rounded-(xl|2xl|3xl|panel)\b/)).toEqual([]);
    expect(lines(/rounded-\[/)).toEqual([]);
    // The page's own cards are the shared card: white, a 1px border, 8px corners and at most a 1px shadow.
    const card = 'rounded-lg border border-border bg-card shadow-card';
    for (const f of ['TodayPage', 'FamilyPage', 'SchedulePage', 'MessagesPage']) expect(read(ADMIN(f)), f).toContain(card);
    expect(read(ADMIN('FamiliesPage'))).toMatch(/flex-col rounded-lg border border-border bg-card text-left shadow-card/);
    // Controls the screens draw themselves are 6px.
    expect(read(ADMIN('TodayPage'))).toMatch(/inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card/);
    expect(read(ADMIN('SchedulePage'))).toMatch(/role="switch"[^\n]*rounded-md border border-border bg-card/);
    expect(read(ADMIN('AssignmentPage'))).toMatch(/'flex h-12 items-center justify-center gap-2 rounded-md/);
  });

  it('gold only on stars: no reward color in these files', () => {
    expect(lines(/\b(bg|text|fill|ring|border)-reward/)).toEqual([]);
  });
});

describe('the band holds only back, title, subtitle and actions', () => {
  const STATS = ['TodayPage', 'FamiliesPage', 'AssignmentsPage', 'AssignmentPage', 'ContentPage'];

  it('the stat row (Figures) is on the gray page on Today, Families, Assignments, an assignment and Content', () => {
    for (const f of STATS) {
      const src = stripComments(read(ADMIN(f)));
      expect(src, f).toMatch(/<Figures\b/);
      expect(src, f).not.toMatch(/variant=["']band["']/);
      // PageHeader closes itself, so nothing is portalled into the band after the actions.
      expect(src, f).toMatch(/<PageHeader\b[\s\S]*?\/>\s*<Figures\b/);
    }
  });

  it('no screen passes children into the band, and no content overlaps it', () => {
    expect(hits(/<\/PageHeader>/)).toEqual([]);
    expect(hits(/<PageHeader\b[^>]*\bchildren=/)).toEqual([]);
    expect(hits(/\boverlap\b/)).toEqual([]);
    expect(hits(/variant=["']band["']/)).toEqual([]);
  });

  it('the family contact chips and the week toolbar sit on the page, styled for it', () => {
    const family = read(ADMIN('FamilyPage'));
    expect(family).toMatch(/\/>\s*<div className="mb-5">\s*<div className="flex flex-wrap gap-2">\s*<a href=\{`mailto:/);
    const schedule = read(ADMIN('SchedulePage'));
    expect(schedule).toMatch(/\/>\s*<div className="mb-5 flex flex-wrap items-center gap-3">\s*<div className="flex items-center rounded-md border border-border bg-card">/);
    // The week toolbar no longer uses the band's on-navy colors.
    const toolbar = schedule.slice(schedule.indexOf('<div className="mb-5 flex flex-wrap'), schedule.indexOf('Show cancelled'));
    expect(toolbar).not.toMatch(/ink-(foreground|muted)/);
  });
});

describe('weights (OSA’s R1 taste review)', () => {
  it('600 for headings and card titles: card and drawer titles use the scale’s heading and title tokens', () => {
    expect(read(ADMIN('FamiliesPage'))).toMatch(/<p className="truncate text-heading[^"]*">\{f\.name\}/);
    expect(read(ADMIN('FamilyPage'))).toMatch(/<h2 className="truncate text-title">\{fullName\(s\)\}/);
    expect(read(ADMIN('TodayPage'))).toMatch(/<p className="truncate text-title">\{fullName\(s\.student\)\}/);
    expect(read('src/ui/components/sessions/AdminSessionDrawer.jsx')).toMatch(/<p className="text-heading">Session note<\/p>/);
  });

  it('500 for labels: Sessions so far, Next session, the week legend and day headers', () => {
    const families = read(ADMIN('FamiliesPage'));
    expect(families).toMatch(/<dt className="font-medium text-muted-foreground">Next session<\/dt>/);
    expect(families).toMatch(/<dt className="font-medium text-muted-foreground">Sessions so far<\/dt>/);
    const schedule = read(ADMIN('SchedulePage'));
    // The legend ("Open hours" and the rest) and the weekday headers are text-caption, which is 500.
    expect(schedule).toMatch(/<div className="ml-auto flex items-center gap-4 text-caption text-muted-foreground">/);
    expect(schedule).toMatch(/\/>Open hours<\/span>/);
    expect(schedule).toMatch(/cn\('text-caption', today \? 'text-brand-soft-foreground' : 'text-muted-foreground'\)\}>\{fmtWeekday\(d\)\}/);
    expect(read(ADMIN('TodayPage'))).toMatch(/cn\('text-caption', today \? 'text-primary-foreground' : 'text-muted-foreground'\)\}>\{fmtDateWith/); // P2b nit 3: the selected day is the accent, not navy
    // text-caption carries weight 500 by default.
    expect(read('src/app/globals.css')).toMatch(/--text-caption--font-weight: 500/);
  });
});

describe('density and status at a glance', () => {
  it('the week grid, the day timeline, table rows and the families grid are as tight as before', () => {
    expect(read(ADMIN('SchedulePage'))).toMatch(/const HOUR_PX = 50;/);
    expect(read('src/ui/components/sessions/DayTimeline.jsx')).toMatch(/<div className="relative h-\[86px\]">/);
    expect(read(ADMIN('AssignmentsPage'))).toMatch(/gap-y-1\.5 px-4 py-3 text-left/);
    expect(read(ADMIN('FamiliesPage'))).toMatch(/<div className="grid gap-4 @2xl\/page:grid-cols-2 @5xl\/page:grid-cols-3">/);
    expect(read(ADMIN('FamiliesPage'))).toMatch(/rounded-md bg-card px-2 py-1\.5/);
    // No row got taller padding: nothing in these files uses py-5 or more on a row.
    expect(lines(/<(li|Row|button)\b[^>]*\bpy-([5-9]|1\d)\b/)).toEqual([]);
  });

  it('status still reads from the badge tints and dots', () => {
    const assignment = read(ADMIN('AssignmentPage'));
    for (const tint of ['bg-good-soft text-good-soft-foreground', 'bg-critical-soft text-critical-soft-foreground', 'bg-warning-soft text-warning-soft-foreground']) expect(assignment).toContain(tint);
    const schedule = read(ADMIN('SchedulePage'));
    expect(schedule).toMatch(/requested && 'border-\[1\.5px\] border-dashed border-warning'/);
    expect(schedule).toMatch(/border-dashed border-warning" \/>Requested/);
    expect(read(ADMIN('TodayPage'))).toMatch(/live \? 'bg-good-soft text-good-soft-foreground' : 'bg-brand-soft text-brand-soft-foreground'/);
    for (const f of ['FamiliesPage', 'FamilyPage', 'AssignmentPage', 'ContentPage']) expect(read(ADMIN(f)), f).toMatch(/<StatusBadge /);
  });
});
