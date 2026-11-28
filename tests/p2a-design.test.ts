/**
 * P2a (docs/DESIGN.md → App polish): the parent screens, and the components they share with Vienne's, use the
 * shared card, badge and button, with no navy left from the band and no one-off radii. Reads source files, no
 * database. tests/e2e/p2a-screens.spec.ts checks the result in a browser.
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
  'src/ui/pages/parent',
  'src/ui/components/learning',
  'src/ui/components/sessions/ParentSessionDrawer.jsx',
  'src/ui/components/sessions/RequestSessionDrawer.jsx',
  'src/ui/components/sessions/SessionParts.jsx',
  'src/ui/components/messages/Thread.jsx',
  'src/ui/components/fast/FastResults.jsx',
].flatMap(files);

const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Class tokens: every whitespace-separated word of a string literal, with any variant prefix (dark:, hover:) dropped. */
function classTokens(source: string): string[] {
  const literals = [...stripComments(source).matchAll(/(["'`])((?:(?!\1)[^\n\\]|\\.)*)\1/g)].map((m) => m[2]);
  return literals
    .flatMap((l) => l.split(/\s+/))
    .map((t) => t.replace(/^.*:/, '').replace(/^!/, ''))
    .filter(Boolean);
}

const tokensMatching = (pattern: RegExp) => OWNED.flatMap((f) => classTokens(read(f)).filter((t) => pattern.test(t)).map((t) => `${f}: ${t}`));
const hits = (pattern: RegExp) => OWNED.filter((f) => pattern.test(stripComments(read(f))));

describe('P2a: the parent screens match App polish', () => {
  it('found the files', () => {
    expect(files('src/ui/pages/parent').length).toBeGreaterThanOrEqual(6);
    expect(OWNED.length).toBeGreaterThanOrEqual(13);
  });

  it('no navy left from the band: no bg-ink, text-ink-*, band, a navy avatar or the ink button', () => {
    expect(tokensMatching(/^(bg-ink|text-ink(-.*)?|ring-ink|border-ink|band)$/)).toEqual([]);
    expect(hits(/tone=["']ink["']/)).toEqual([]);
    expect(hits(/variant=["']ink["']/)).toEqual([]);
  });

  it('no one-off radii: no rounded-[…], and no rounded-sm, -xl, -2xl or -3xl', () => {
    expect(tokensMatching(/^rounded(-[tblrse]{1,2})?-\[/)).toEqual([]);
    expect(tokensMatching(/^rounded(-[tblrse]{1,2})?-(sm|xl|2xl|3xl)$/)).toEqual([]);
  });

  it('type: no font-bold and no text-[Npx]', () => {
    expect(hits(/\bfont-bold\b/)).toEqual([]);
    expect(hits(/text-\[\d+(\.\d+)?(px|rem)\]/)).toEqual([]);
  });

  it('cards are the shared white card: 1px border, rounded-lg (the 16px token), bg-card', () => {
    const home = read('src/ui/pages/parent/HomePage.jsx');
    expect(home).toMatch(/const CARD = 'rounded-lg border border-border bg-card shadow-card'/);
    // Every bordered card-sized container in these files uses the 16px token (rounded-lg), never a one-off.
    const cards = OWNED.flatMap((f) =>
      [...stripComments(read(f)).matchAll(/className=\{?[`'"]([^`'"]*\bbg-card\b[^`'"]*\bshadow-card\b[^`'"]*)[`'"]/g)].map((m) => `${f}: ${m[1]}`),
    );
    for (const c of cards) expect(c, c).toMatch(/\brounded-lg\b/);
  });

  it('own messages are a soft tint, not a navy block (Thread is shared with Vienne)', () => {
    const thread = stripComments(read('src/ui/components/messages/Thread.jsx'));
    expect(thread).toMatch(/mine \? '[^']*bg-brand-soft text-brand-soft-foreground/);
  });

  it('Home: the skill rows can shrink, so the page never scrolls sideways at 390px (SkillMeter itself is unchanged)', () => {
    const home = stripComments(read('src/ui/pages/parent/HomePage.jsx'));
    expect(home).toMatch(/<div key=\{r\.id\} className="flex min-w-0 items-center justify-between gap-3">/);
    expect(home).toMatch(/<SkillMeter rating=\{r\.rating\} \/>/);
  });

  it('page grids start from one shrinkable column (grid-cols-1 is minmax(0,1fr)), so a long row never widens a card', () => {
    // An implicit `auto` column sizes to its widest row's text (truncated titles included) and pushed Home's
    // cards to 424px on a 390px phone. Every layout grid on the parent screens names its phone column.
    for (const f of OWNED.filter((p) => p.startsWith('src/ui/pages/parent/'))) {
      const grids = [...stripComments(read(f)).matchAll(/className=\{?[`'"]([^`'"]*\bgrid\b[^`'"]*\bgrid-cols-[^`'"]*)[`'"]/g)].map((m) => m[1]);
      for (const g of grids) expect(g, `${f}: ${g}`).toMatch(/(^|\s)grid-cols-\d/);
    }
    const home = stripComments(read('src/ui/pages/parent/HomePage.jsx'));
    expect(home).toMatch(/grid grid-cols-1 gap-x-8 gap-y-3 px-4 py-4 @3xl\/page:grid-cols-2/);
    expect(home).toMatch(/grid grid-cols-1 items-start gap-5 @4xl\/page:grid-cols-2/);
  });
});
