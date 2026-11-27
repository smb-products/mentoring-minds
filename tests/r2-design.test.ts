/**
 * R2: the parent screens, and the shared components they use, follow docs/DESIGN.md.
 * The same source checks as tests/r1-design.test.ts, over this ticket's files, plus: no font-bold, the stats and
 * child chips off the band, 6px chips, a light date tile, and stars only beside the homework.
 * Reads source files, no database. tests/e2e/r2-parent-look.spec.ts checks the result in a browser.
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

const PAGES = files('src/ui/pages/parent');
// This ticket's `touches`, without its tests and report.
const OWNED = [
  'src/ui/pages/parent',
  'src/ui/components/sessions/ParentSessionDrawer.jsx',
  'src/ui/components/sessions/RequestSessionDrawer.jsx',
  'src/ui/components/learning',
  'src/ui/components/ui',
  'src/ui/components/shell',
  'src/ui/components/sessions/SessionParts.jsx',
  'src/ui/components/messages/Thread.jsx',
  'src/ui/components/fast/FastResults.jsx',
].flatMap(files);

const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

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

function hits(pattern: RegExp, list = OWNED) {
  return list.filter((f) => pattern.test(stripComments(read(f))));
}

describe('the parent screens and shared components follow docs/DESIGN.md', () => {
  it('found the files', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(6);
    expect(OWNED.length).toBeGreaterThan(25);
  });

  it('type uses only the scale: no text-[Npx], font-display, font-extrabold or font-bold', () => {
    expect(hits(/text-\[\d+(\.\d+)?px\]/)).toEqual([]);
    expect(hits(/font-display/)).toEqual([]);
    expect(hits(/font-extrabold/)).toEqual([]);
    expect(hits(/\bfont-bold\b/)).toEqual([]);
    expect(hits(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)).toEqual([]);
  });

  it('is flat: no gradients, glows, press shadows or press movement, and no surface, band, glass, chrome-*, press-* or rail class', () => {
    expect(hits(/linear-gradient|radial-gradient|bg-gradient|bg-linear|bg-radial/)).toEqual([]);
    const used = OWNED.flatMap((f) => classTokens(read(f)).filter((t) => FLAT_UTILITIES.includes(t) || /^(chrome|press)-/.test(t)).map((t) => `${f}: ${t}`));
    expect(used).toEqual([]);
    expect(hits(/shadow-raised|drop-shadow|shadow-\[|inset-shadow/)).toEqual([]);
    expect(hits(/active:translate|active:scale/)).toEqual([]);
  });

  it('8px corners on cards, drawers and dialogs; 6px on controls and badges: no other radius', () => {
    expect(hits(/rounded-(xl|2xl|3xl|panel)\b/)).toEqual([]);
    expect(hits(/rounded(-[tblr]{1,2})?-\[/)).toEqual([]);
  });

  it('rounded-full only on avatars, status dots and counts', () => {
    const lines = OWNED.flatMap((f) =>
      stripComments(read(f))
        .split('\n')
        .filter((l) => l.includes('rounded-full'))
        .map((l) => `${f}: ${l.trim()}`),
    );
    // The avatar, the status dots (badge glyphs, unread and attention dots), and the nav counts.
    const allowed = /AVATAR_TONES\[tone\]|size-\[7px\]|size-2 |h-\[18px\] min-w-\[18px\]|h-4 min-w-4/;
    expect(lines.filter((l) => !allowed.test(l))).toEqual([]);
  });

  it('gold only on stars: the parent screens and drawers use no reward color', () => {
    const parent = OWNED.filter((f) => !f.startsWith('src/ui/components/ui/'));
    expect(hits(/(bg|text|fill|ring|border)-reward/, parent)).toEqual([]);
    // The quiz's result stars are the one gold drawing outside <Stars>.
    expect(hits(/var\(--reward/, parent)).toEqual(['src/ui/components/learning/AnswerSheet.jsx']);
  });
});

describe('the band holds only back, title, subtitle and actions', () => {
  it('no parent page pulls content over the band, puts anything inside PageHeader, or uses Figures variant="band"', () => {
    for (const f of PAGES) {
      const src = stripComments(read(f));
      expect(src, f).not.toMatch(/<PageHeader\b[^>]*\boverlap\b/);
      expect(src, f).not.toMatch(/<\/PageHeader>/);
      expect(src, f).not.toMatch(/variant="band"/);
    }
  });

  it('the child chips and the stat row sit on the page, after the header', () => {
    for (const f of ['HomePage.jsx', 'ProgressPage.jsx', 'LearningPage.jsx', 'SessionsPage.jsx']) {
      const src = stripComments(read(`src/ui/pages/parent/${f}`));
      const header = src.search(/<PageHeader\b/);
      expect(src.indexOf('<ChildSwitcher'), f).toBeGreaterThan(header);
      expect(src.slice(header, src.indexOf('<ChildSwitcher')), f).toMatch(/\/>\s*$/);
    }
    const home = stripComments(read('src/ui/pages/parent/HomePage.jsx'));
    expect(home.indexOf('<Figures')).toBeGreaterThan(home.indexOf('<ChildSwitcher'));
  });

  it('on the page, Figures keeps its "Key numbers" region and the "needs attention" cue', () => {
    const display = read('src/ui/components/ui/Display.jsx');
    const figures = display.slice(display.indexOf('export function Figures'), display.indexOf('/* ── Loading placeholder'));
    expect(figures).toMatch(/role="region"/);
    expect(figures).toMatch(/aria-label="Key numbers"/);
    expect(figures).toMatch(/\{item\.highlight && \(/);
    expect(figures).toMatch(/needs attention/);
  });

  it('ChildSwitcher chips are 6px rectangles on the gray page, not pills or band colors', () => {
    const chips = stripComments(read('src/ui/components/shell/ChildSwitcher.jsx'));
    expect(chips).toMatch(/rounded-md/);
    expect(chips).not.toMatch(/rounded-full|ink-foreground|text-ink|bg-ink/);
  });

  it('the next-session date tile on Home is light gray with navy text, not a navy block', () => {
    const home = stripComments(read('src/ui/pages/parent/HomePage.jsx'));
    const tile = home.match(/<div className="(tabular flex w-[^"]*)">\s*<span[^>]*>\{fmtDateWith\(next\.startsAt, \{ month/)?.[1] ?? '';
    expect(tile).toMatch(/\bbg-secondary\b/);
    expect(tile).toMatch(/\btext-brand-soft-foreground\b/);
    expect(tile).toMatch(/\brounded-md\b/);
    expect(tile).not.toMatch(/\bbg-ink\b|\bband\b|bg-primary/);
  });

  it('headings and card titles are 600, labels 500: "Next session" is a 500 label', () => {
    const home = stripComments(read('src/ui/pages/parent/HomePage.jsx'));
    expect(home).toMatch(/<p className="text-small font-medium text-muted-foreground">Next session<\/p>/);
  });
});

describe('stars leave the stats, and stay beside the homework', () => {
  it('Home and Progress show no "Stars earned" figure', () => {
    for (const f of ['HomePage.jsx', 'ProgressPage.jsx']) expect(read(`src/ui/pages/parent/${f}`), f).not.toMatch(/Stars earned|starsTotal/);
  });

  it('each graded assignment keeps its stars on Progress, Learning and the assignment page', () => {
    for (const f of ['ProgressPage.jsx', 'LearningPage.jsx', 'AssignmentItemPage.jsx']) expect(read(`src/ui/pages/parent/${f}`), f).toMatch(/<Stars count=\{w\.stars\}/);
  });

  it('the server still returns starsTotal: no contract shape changes', () => {
    expect(read('src/server/dashboard.ts')).toMatch(/starsTotal: stars\._sum\.stars \?\? 0/);
  });
});
