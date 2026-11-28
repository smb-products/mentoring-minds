import type { Locator, Page } from '@playwright/test';
import { expect, freshData, test, USERS } from './support/fixtures';
import { main, openAccount } from './support/ui';

/**
 * P2b (docs/DESIGN.md → App polish): Vienne's screens use the shared white card (1px border, 16px corners), and
 * nothing behind a page title is navy. Plus OSA's P1 review nits: the stat sublines read in full, the Families
 * stats each have their own icon, Today's selected day is the accent blue, Up next has no left accent, and
 * avatars are a soft blue tint. On a phone, no admin screen scrolls sideways. The fixture fails any test that
 * logs a console error.
 */
freshData();

const WHITE = 'rgb(255, 255, 255)';
const BLUE = 'rgb(31, 94, 255)'; // #1F5EFF, --mm-brand-600
const SOFT_BLUE = 'rgb(238, 243, 255)'; // #EEF3FF, --mm-brand-50

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** Dark means luminance under 128: navy (#0B1733) and the like. Transparent doesn't count. */
const isDark = (bg: string) => {
  const m = bg.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return false;
  return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]) < 128;
};

async function settled(page: Page, what: string) {
  await expect(page.locator('[aria-busy="true"]'), `${what} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
}

async function settle(page: Page, url: string) {
  await page.goto(url);
  await settled(page, url);
}

/** Every background from the h1 up to <html> that is dark. */
async function darkBehindTitle(page: Page) {
  return main(page).getByRole('heading', { level: 1 }).evaluate((h1) => {
    const out: string[] = [];
    for (let el: Element | null = h1; el; el = el.parentElement) out.push(`${el.tagName.toLowerCase()}: ${getComputedStyle(el).backgroundColor}`);
    return out;
  }).then((list) => list.filter((l) => isDark(l.slice(l.indexOf(': ') + 2))));
}

/** The page's first card: its first stat card, or else its first section (Section is the shared card). */
const firstCard = (page: Page) => main(page).locator('[role="region"][aria-label="Key numbers"] > *, section').first();

const SCREENS = ['Today', 'Schedule', 'Families', 'Content', 'Work', 'Messages', 'Settings'];

test.beforeEach(async ({ db }) => {
  // Normal text size, so the sublines wrap as most people see them (the demo has some people on Large).
  await db.user.updateMany({ where: { email: USERS.vienne }, data: { textSize: 'NORMAL' } });
});

test("as Vienne at 1280×800, each admin screen's first card is the shared white card, with nothing navy behind its title", async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('vienne');
  await settle(page, '/admin/today');
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
  for (const name of SCREENS) {
    await sidebar.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await expect(sidebar.locator('a[aria-current="page"]')).toContainText(name);
    await settled(page, name);
    const card = firstCard(page);
    await expect(card, `${name}: a first card`).toBeVisible();
    expect(await css(card, 'background-color'), `${name}: card background`).toBe(WHITE);
    expect(await css(card, 'border-top-width'), `${name}: card border`).toBe('1px');
    expect(await css(card, 'border-top-style'), `${name}: card border`).toBe('solid');
    expect(await css(card, 'border-top-left-radius'), `${name}: card corners`).toBe('16px');
    expect(await darkBehindTitle(page), `${name}: navy behind the title`).toEqual([]);
    // No navy class left anywhere on the screen.
    await expect(main(page).locator('.bg-ink, [class*="text-ink-"], .band'), name).toHaveCount(0);
  }
});

test('nit 1: the stat sublines wrap to at most 2 lines with no ellipsis, and read in full', async ({ page, as, db }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The oldest waiting request was asked two days ago.
  await db.session.updateMany({ where: { status: 'REQUESTED' }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000 - 3_600_000) } });
  await as('vienne');
  const seen: string[] = [];
  for (const url of ['/admin/today', '/admin/families', '/admin/assignments', '/admin/content']) {
    await settle(page, url);
    const notes = main(page).getByRole('region', { name: 'Key numbers' }).locator('[data-figure-note]');
    expect(await notes.count(), `${url}: stat sublines`).toBeGreaterThan(0);
    for (const note of await notes.all()) {
      const m = await note.evaluate((el) => {
        const s = getComputedStyle(el);
        return { text: el.textContent ?? '', overflow: s.textOverflow, clamp: s.getPropertyValue('-webkit-line-clamp'), height: el.getBoundingClientRect().height, line: parseFloat(s.lineHeight), scroll: el.scrollWidth, client: el.clientWidth };
      });
      seen.push(m.text);
      expect(m.overflow, `${url}: "${m.text}" has an ellipsis`).not.toBe('ellipsis');
      expect(['none', ''], `${url}: "${m.text}" is clamped`).toContain(m.clamp);
      expect(m.height, `${url}: "${m.text}" wraps to more than 2 lines`).toBeLessThanOrEqual(2 * m.line + 1);
      expect(m.scroll, `${url}: "${m.text}" is cut off`).toBeLessThanOrEqual(m.client);
    }
  }
  expect(seen).toContain('Oldest asked 2d ago');
  expect(seen).toContain('Kindergarten to grade 6');
  // Today's FAST card reads "8 students in grades 3–6"; Content's "Have the book" reads "of 8 students in grades 3–6".
  for (const t of seen.filter((s) => /students in grades 3–6$/.test(s))) expect(t).toMatch(/^(of )?\d+ students in grades 3–6$/);
  expect(seen.some((s) => /^\d+ students in grades 3–6$/.test(s)), "Today's FAST subline").toBe(true);
});

test('nit 2: the Families stat cards each have their own icon: users, graduation cap, key, clock', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('vienne');
  await settle(page, '/admin/families');
  const icons = main(page).getByRole('region', { name: 'Key numbers' }).locator('[data-figure-icon] svg');
  await expect(icons).toHaveCount(4);
  const shapes = await icons.evaluateAll((svgs) => svgs.map((s) => ({ cls: s.getAttribute('class') ?? '', d: s.innerHTML })));
  expect(new Set(shapes.map((s) => s.d)).size, 'four different icons').toBe(4);
  const names = shapes.map((s) => s.cls.match(/lucide-([a-z-]+)/g)?.find((c) => c !== 'lucide-icon') ?? '');
  expect(names).toEqual([expect.stringMatching(/^lucide-users/), expect.stringMatching(/^lucide-graduation-cap/), expect.stringMatching(/^lucide-key-round/), expect.stringMatching(/^lucide-clock/)]);
  for (const n of names) expect(n).not.toMatch(/chart/);
});

test("nits 3–5: Today's selected day is the accent blue, Up next has no left accent, and avatars are a soft blue tint", async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('vienne');
  await settle(page, '/admin/today');

  // 3. This week: exactly one day is filled, the accent blue with white text, and none is navy.
  const week = main(page).locator('section', { has: page.getByRole('heading', { name: 'This week' }) });
  const days = week.locator('li');
  await expect(days).toHaveCount(7);
  const fills = await days.evaluateAll((lis) => lis.map((li) => ({ bg: getComputedStyle(li).backgroundColor, color: getComputedStyle(li).color })));
  const filled = fills.filter((f) => !/rgba\(0, 0, 0, 0\)|transparent/.test(f.bg));
  expect(filled).toEqual([{ bg: BLUE, color: WHITE }]);

  // 4. Up next: no left border, and no accent bar inside it.
  const upNext = main(page).locator('section', { hasText: 'Up next' }).first();
  await expect(upNext).toBeVisible();
  expect(await css(upNext, 'border-left-width')).toBe('1px');
  expect(await upNext.evaluate((el) => [...el.children].filter((c) => getComputedStyle(c).position === 'absolute').length)).toBe(0);
  const accent = await upNext.evaluate((el) => getComputedStyle(el).borderLeftColor === getComputedStyle(el).borderTopColor);
  expect(accent, 'the left border is the same hairline as the rest').toBe(true);
  const inner = upNext.locator(':scope > *').first();
  expect(await css(inner, 'border-left-width')).toBe('0px');

  // 5. Avatars: soft blue with blue initials, never navy. The sidebar's and the screen's.
  const avatars = page.locator('span[aria-hidden].rounded-full.place-items-center');
  expect(await avatars.count()).toBeGreaterThan(1);
  for (const a of await avatars.all()) {
    if (!(await a.isVisible())) continue;
    expect(await css(a, 'background-color')).toBe(SOFT_BLUE);
    expect(await css(a, 'color')).toBe(BLUE);
    expect(await a.textContent()).toMatch(/^[A-Z]{1,2}$/);
  }
  await expect(page.getByRole('complementary', { name: 'Main navigation' }).getByRole('button', { name: /^Account/ })).toContainText('VE');

  // And on Families, where the parent avatars were navy.
  await settle(page, '/admin/families');
  const family = main(page).locator('span[aria-hidden].rounded-full.place-items-center').first();
  expect(isDark(await css(family, 'background-color'))).toBe(false);
  expect(await css(family, 'background-color')).toBe(SOFT_BLUE);
});

test('dark mode keeps working: the selected day stays the accent, and avatars stay soft with readable initials', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('vienne');
  await settle(page, '/admin/today');
  const panel = await openAccount(page);
  await panel.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.keyboard.press('Escape');
  const week = main(page).locator('section', { has: page.getByRole('heading', { name: 'This week' }) });
  const fills = await week.locator('li').evaluateAll((lis) => lis.map((li) => getComputedStyle(li).backgroundColor).filter((bg) => !/rgba\(0, 0, 0, 0\)/.test(bg)));
  expect(fills).toEqual([BLUE]);
  const avatar = main(page).locator('span[aria-hidden].rounded-full.place-items-center').first();
  const [bg, fg] = await Promise.all([css(avatar, 'background-color'), css(avatar, 'color')]);
  expect(bg).not.toBe(SOFT_BLUE);
  const lum = (c: string) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  expect((hi + 0.05) / (lo + 0.05), 'avatar initials contrast').toBeGreaterThanOrEqual(4.5);
});

test('phone: no admin screen scrolls sideways @phone', async ({ page, as }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await as('vienne');
  for (const url of ['/admin/today', '/admin/schedule', '/admin/families', '/admin/content', '/admin/assignments', '/admin/messages', '/admin/settings']) {
    await settle(page, url);
    expect(await darkBehindTitle(page), `${url}: navy behind the title`).toEqual([]);
    const widths = await page.evaluate(() => {
      const h1 = document.querySelector('main h1');
      let scroller = h1?.parentElement ?? null;
      while (scroller && getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement;
      return [document.documentElement, document.body, scroller].filter(Boolean).map((el) => ({ scroll: el!.scrollWidth, client: el!.clientWidth }));
    });
    for (const w of widths) expect(w.scroll, `${url} scrolls sideways`).toBeLessThanOrEqual(w.client);
  }
});
