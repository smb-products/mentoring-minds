/**
 * R1: tokens, Inter, and the shared components and shell follow docs/DESIGN.md.
 * Reads this ticket's files, no database. The browser suite proves nothing a person reads or taps moved.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

function files(p: string): string[] {
  if (!statSync(path.join(ROOT, p)).isDirectory()) return [p];
  return readdirSync(path.join(ROOT, p)).flatMap((f) => files(path.join(p, f))).filter((f) => /\.(jsx?|tsx?)$/.test(f));
}

// The components and shell this ticket restyles (its `touches`, without the CSS and package files).
const COMPONENTS = [
  'src/app/layout.tsx',
  'src/ui/components/ui',
  'src/ui/components/shell',
  'src/ui/components/brand',
  'src/ui/components/sessions/SessionParts.jsx',
  'src/ui/components/messages/Thread.jsx',
  'src/ui/components/fast/FastResults.jsx',
  'src/components/family',
  'src/components/pwa/InstallPrompt.tsx',
].flatMap(files);

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

function hits(pattern: RegExp, list = COMPONENTS) {
  return list.filter((f) => pattern.test(stripComments(read(f))));
}

describe('tokens (src/app/globals.css)', () => {
  const css = read('src/app/globals.css');
  const block = (selector: RegExp) => {
    const start = css.search(selector);
    expect(start, String(selector)).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf('\n}', start));
  };

  it('defines the type scale in @theme with the phone sizes, and the desktop sizes from 768px', () => {
    const theme = block(/@theme \{/);
    const phone = { caption: 12, small: 13, body: 15, field: 16, heading: 15, title: 18, page: 24, figure: 22 };
    for (const [name, px] of Object.entries(phone)) expect(theme, name).toMatch(new RegExp(`--text-${name}: ${px}px;`));
    const desktop = block(/@media \(min-width: 768px\)/);
    for (const [name, px] of Object.entries({ body: 14, field: 14, page: 28, figure: 24 })) expect(desktop, name).toMatch(new RegExp(`--text-${name}: ${px}px;`));
    // caption, small, heading and title are the same on both.
    for (const name of ['caption', 'small', 'heading', 'title']) expect(desktop).not.toContain(`--text-${name}:`);
    expect(theme).toMatch(/--text-heading--font-weight: 600/);
    // App polish (P1): the page title and the stat numbers are 700, from the token, never a class.
    expect(theme).toMatch(/--text-page--font-weight: 700/);
    expect(theme).toMatch(/--text-figure--font-weight: 700/);
    expect(theme).toMatch(/--text-heading--line-height: 1\.25/);
    expect(theme).toMatch(/--text-body--line-height: 1\.45/);
  });

  it('no --text-<name> shares <name> with a --color-<name> (Tailwind would read text-<name> as the color, with no size)', () => {
    const names = (kind: string) => new Set([...css.matchAll(new RegExp(`--${kind}-([a-z0-9-]+?)(?:--[a-z-]+)?:`, 'g'))].map((m) => m[1]));
    const colors = names('color');
    expect([...names('text')].filter((n) => colors.has(n))).toEqual([]);
  });

  it('uses Inter only: no --font-display, no Fredoka or Nunito', () => {
    expect(css).toMatch(/--font-sans: "Inter Variable"/);
    expect(css).not.toMatch(/--font-display|font-display|Fredoka|Nunito/);
  });

  it('has 10px control and 16px card radii (App polish)', () => {
    const theme = block(/@theme inline \{/);
    expect(theme).toMatch(/--radius-md: 10px/);
    expect(theme).toMatch(/--radius-lg: 16px/);
    for (const step of ['xl', '2xl']) expect(theme).toMatch(new RegExp(`--radius-${step}: 16px`));
    expect(css).toMatch(/--radius-panel: 16px/);
  });

  it('is flat: no gradients, glows, inset highlights or press shadows, and nothing moves on press', () => {
    expect(css).not.toMatch(/linear-gradient|radial-gradient|--band-glow|--highlight|inset 0 1px/);
    expect(css).not.toMatch(/:active[^{]*\{[^}]*translate/);
    expect(css).not.toMatch(/0 [23]px 0 var/);
  });

  it('keeps the surface, band, glass, chrome-*, press-* and rail utilities defined, so screens keep working', () => {
    for (const u of FLAT_UTILITIES) expect(css, u).toMatch(new RegExp(`@utility ${u} \\{`));
    expect(block(/@utility band \{/)).toMatch(/background-color: var\(--ink\)/);
    expect(block(/@utility rail \{/)).toMatch(/background-color: var\(--sidebar\)/);
  });

  it('one blue accent, neutral badges, gold only for --reward, and every token has a dark value', () => {
    const light = block(/:root \{/);
    const dark = block(/\.dark \{/);
    expect(light).toMatch(/--primary: var\(--mm-brand-600\)/);
    expect(light).toMatch(/--sidebar: #ffffff/);
    expect(light).toMatch(/--badge: var\(--mm-neutral-\d+\)/);
    expect(light).toMatch(/--badge-foreground: var\(--mm-neutral-\d+\)/);
    // Gold is only the --reward family.
    const gold = [...light.matchAll(/^\s*(--[\w-]+): [^;]*--mm-gold-/gm)].map((m) => m[1]);
    expect(gold.every((t) => t.startsWith('--reward')), gold.join(', ')).toBe(true);
    // Every semantic token set in light mode is set again for dark mode.
    const names = (s: string) => new Set([...s.matchAll(/^\s*(--(?!mm-)[\w-]+):/gm)].map((m) => m[1]));
    const darkNames = names(dark);
    const missing = [...names(light)].filter((t) => !darkNames.has(t) && !['--radius', '--radius-panel'].includes(t));
    expect(missing).toEqual([]);
  });

  it('keeps text-size zoom and AA text contrast for the key pairs, light and dark', () => {
    expect(css).toMatch(/\.app-root\[data-text='LARGE'\] \{ zoom: 1\.125/);
    const ramp = Object.fromEntries([...css.matchAll(/--mm-([\w]+-\d+): (#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const pairs: [string, string][] = [
      ['#ffffff', ramp['brand-600']], // primary button
      [ramp['neutral-200'], ramp['neutral-700']], // badge, light
      [ramp['neutral-700'], ramp['neutral-100']], // badge, dark
      ['#ffffff', ramp['neutral-700']], // sidebar and phone nav items, on the white sidebar
      [ramp['brand-50'], ramp['brand-600']], // selected nav item: blue on its soft blue
      ['#ffffff', ramp['critical-600']], // destructive, light
      [ramp['critical-400'], ramp['critical-950']], // destructive, dark
      ['#ffffff', ramp['neutral-700']], // muted text on a card
    ];
    for (const [a, b] of pairs) expect(ratio(a, b), `${a} on ${b}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('one font', () => {
  it('package.json lists Inter, not Fredoka or Nunito', () => {
    const pkg = JSON.parse(read('package.json'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps['@fontsource-variable/inter']).toBeTruthy();
    expect(Object.keys(deps).filter((d) => /fredoka|nunito/i.test(d))).toEqual([]);
  });

  it('layout.tsx imports Inter once, and nothing imports Fredoka or Nunito', () => {
    expect(read('src/app/layout.tsx').match(/import '@fontsource-variable\/inter';/g)).toHaveLength(1);
    expect(hits(/fredoka|nunito/i, files('src'))).toEqual([]);
  });
});

describe('shared components follow docs/DESIGN.md', () => {
  it('found the files', () => {
    expect(COMPONENTS.length).toBeGreaterThan(20);
  });

  it('type uses only the scale: no text-[Npx], font-display or font-extrabold', () => {
    expect(hits(/text-\[\d+(\.\d+)?px\]/)).toEqual([]);
    expect(hits(/font-display/)).toEqual([]);
    expect(hits(/font-extrabold/)).toEqual([]);
    expect(hits(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)).toEqual([]);
  });

  it('is flat: no gradients, and no surface, band, glass, chrome-*, press-* or rail class', () => {
    expect(hits(/linear-gradient|radial-gradient|bg-gradient|bg-linear|bg-radial/)).toEqual([]);
    const used = COMPONENTS.flatMap((f) => classTokens(read(f)).filter((t) => FLAT_UTILITIES.includes(t) || /^(chrome|press)-/.test(t)).map((t) => `${f}: ${t}`));
    expect(used).toEqual([]);
    expect(hits(/shadow-raised|drop-shadow/)).toEqual([]);
  });

  it('no pills: Button, the form controls (Segmented, Chip), Tabs and the thread composer have no rounded-full', () => {
    for (const f of ['src/ui/components/ui/Button.jsx', 'src/ui/components/ui/Form.jsx', 'src/ui/components/ui/Tabs.jsx', 'src/ui/components/messages/Thread.jsx', 'src/ui/components/shell/ChildSwitcher.jsx', 'src/ui/components/shell/Masthead.jsx']) {
      expect(read(f), f).not.toMatch(/rounded-full/);
    }
  });

  it('rounded-full only on avatars, status dots and counts', () => {
    const lines = COMPONENTS.flatMap((f) =>
      stripComments(read(f))
        .split('\n')
        .filter((l) => l.includes('rounded-full'))
        .map((l) => `${f}: ${l.trim()}`),
    );
    // The avatar, the status dots (badge glyphs, unread and attention dots), and the nav counts.
    const allowed = /AVATAR_TONES\[tone\]|size-\[7px\]|size-2 |h-\[18px\] min-w-\[18px\]|h-4 min-w-4/;
    expect(lines.filter((l) => !allowed.test(l))).toEqual([]);
  });

  it('8px corners on cards, drawers and dialogs; 6px on controls and badges', () => {
    expect(hits(/rounded-(xl|2xl|3xl|panel)\b/)).toEqual([]);
    const overlay = read('src/ui/components/ui/Overlay.jsx');
    expect(overlay).toMatch(/rounded-t-lg/);
    expect(overlay).toMatch(/animate-pop rounded-lg/);
    const form = read('src/ui/components/ui/Form.jsx');
    expect(form).toMatch(/const control =\s*'w-full rounded-md/);
    expect(form).toMatch(/radiogroup[^\n]*rounded-md/);
    expect(form).toMatch(/inline-flex h-8 items-center gap-1\.5 rounded-md/);
    expect(read('src/ui/components/ui/Display.jsx')).toMatch(/const BADGE = '[^']*rounded-md/);
    expect(read('src/ui/components/ui/Display.jsx')).toMatch(/const CARD = 'rounded-lg border border-border bg-card shadow-card'/);
  });

  it('inputs use text-field (16px on phones)', () => {
    expect(read('src/ui/components/ui/Form.jsx')).toMatch(/const control =[^;]*text-field/);
    expect(read('src/ui/components/messages/Thread.jsx')).toMatch(/<textarea[\s\S]*?text-field/);
    expect(read('src/components/family/ChangePasswordForm.tsx')).toMatch(/const input = '[^']*text-field/);
    expect(read('src/components/family/InviteCodeForm.tsx')).toMatch(/aria-label="Invite code"[^>]*text-field/);
    expect(read('src/app/(auth)/sign-in/SignInForm.tsx')).toMatch(/const input = '[^']*text-field/);
  });

  it('nothing in src/ still says text-input (Tailwind reads it as the --color-input color, with no size)', () => {
    const all = [...files('src'), 'src/app/globals.css'];
    expect(all.filter((f) => /\btext-input\b/.test(read(f)))).toEqual([]);
  });

  it('buttons: primary solid blue, secondary white with a border, ghost text only, destructive solid red, no press movement', () => {
    const button = read('src/ui/components/ui/Button.jsx');
    const variant = (name: string) => button.match(new RegExp(`\\n  ${name}: '([^']*)'`))?.[1] ?? '';
    expect(variant('primary')).toMatch(/^bg-primary text-primary-foreground hover:bg-primary-hover$/);
    expect(variant('secondary')).toMatch(/border border-border bg-card/);
    expect(variant('ghost')).not.toMatch(/(^|\s)(bg-|border)/);
    expect(variant('destructive')).toMatch(/^bg-destructive text-destructive-foreground/);
    expect(variant('reward')).not.toMatch(/reward/);
    expect(button).not.toMatch(/translate|active:|scale-/);
  });

  it('badges are neutral: LevelBadge has no tone, StatusBadge colors only its glyph', () => {
    const display = read('src/ui/components/ui/Display.jsx');
    expect(display).toMatch(/const BADGE = '[^']*bg-badge[^']*text-badge-foreground/);
    const level = display.slice(display.indexOf('export function LevelBadge'), display.indexOf('/* ── Page header'));
    expect(level).not.toMatch(/good|warning|serious|brand|tone/);
    expect(display).not.toMatch(/bg-(good|warning|serious|critical)-soft text-/);
  });

  it('gold only on stars', () => {
    const goldUse = hits(/(bg|text|fill|ring|border)-reward/).filter((f) => f !== 'src/ui/components/ui/Display.jsx');
    expect(goldUse).toEqual([]);
    const display = stripComments(read('src/ui/components/ui/Display.jsx'));
    expect(display.match(/(bg|text|fill)-reward[\w-]*/g)).toEqual(['fill-reward', 'text-reward-edge']);
  });
});

describe('the shell', () => {
  it('Masthead has no brain line-art', () => {
    const masthead = read('src/ui/components/shell/Masthead.jsx');
    expect(masthead).not.toMatch(/BRAIN_PATHS|BRAIN_NODES|BRAIN_LINKS|BandMotif|<svg/);
    expect(hits(/BandMotif/, files('src'))).toEqual([]);
  });

  it('no navy band: the PageHeader title is text-page on the page, and AppShell has no bg-ink', () => {
    const masthead = stripComments(read('src/ui/components/shell/Masthead.jsx'));
    expect(masthead).toMatch(/<h1 className="text-page text-foreground">/);
    const shell = stripComments(read('src/ui/components/shell/AppShell.jsx'));
    // PageHeader portals into the shell's <header>, on the light page, and nothing pulls content up over it.
    expect(shell).toMatch(/<header ref=\{setTarget\}/);
    expect(shell).not.toMatch(/-mt-\d/);
    // Nothing in the shell is navy; the band utility stays defined for anything that still uses it.
    for (const f of files('src/ui/components/shell')) {
      const tokens = classTokens(read(f));
      expect(tokens.filter((t) => /^(bg-ink|text-ink-foreground|text-ink-muted|ring-ink|band)$/.test(t)), f).toEqual([]);
    }
  });

  it('the rail and phone nav show a text wordmark, not LogoMark; LogoMark stays for sign-in and the landing page', () => {
    for (const f of ['src/ui/components/shell/Rail.jsx', 'src/ui/components/shell/PhoneNav.jsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/LogoMark|logo-\d+\.png/);
      expect(src, f).toMatch(/>\s*Mentoring Minds\s*</);
    }
    expect(read('src/ui/components/shell/Rail.jsx')).toMatch(/aria-label="Mentoring Minds home"/);
    expect(read('src/ui/components/brand/Logo.jsx')).toMatch(/export function LogoMark/);
    expect(existsSync(path.join(ROOT, 'public/logo-192.png'))).toBe(true);
  });

  it('white sidebar, selected soft blue, icons 18px at 1.75', () => {
    for (const f of ['src/ui/components/shell/Rail.jsx', 'src/ui/components/shell/PhoneNav.jsx']) {
      const src = read(f);
      expect(src, f).toMatch(/active \? 'bg-sidebar-accent text-sidebar-accent-foreground[^']*' : 'text-sidebar-foreground/);
      expect(src, f).toMatch(/<Icon size=\{18\} strokeWidth=\{1\.75\}/);
    }
    expect(read('src/ui/components/shell/Rail.jsx')).toMatch(/aria-label="Main navigation" className="[^"]*w-\[232px\][^"]*border-r border-sidebar-border bg-sidebar/);
    expect(read('src/ui/components/shell/PhoneNav.jsx')).toMatch(/aria-label="Main navigation" className="[^"]*border-t border-sidebar-border bg-sidebar/);
    const css = read('src/app/globals.css');
    const light = css.slice(css.search(/:root \{/), css.indexOf('\n}', css.search(/:root \{/)));
    expect(light).toMatch(/--sidebar: #ffffff/);
    expect(light).toMatch(/--sidebar-accent: var\(--mm-brand-50\)/);
    expect(light).toMatch(/--sidebar-accent-foreground: var\(--mm-brand-600\)/);
    expect(css).toMatch(/--mm-brand-50: #eef3ff/);
    expect(css).toMatch(/--mm-brand-600: #1f5eff/);
  });
});
