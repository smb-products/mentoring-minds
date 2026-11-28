import type { Locator, Page } from '@playwright/test';
import { expect, freshData, test } from './support/fixtures';
import { main, openAccount } from './support/ui';

/**
 * P2a (docs/DESIGN.md → App polish): every parent screen in the sidebar, as Grace. The first card is the shared
 * white card (1px border, 16px corners), nothing behind the h1 is navy, and nothing on the page is a navy block
 * (own message bubbles, Vienne's avatar). On a phone, at 390px and at the Pixel 7's 412px, no screen scrolls
 * sideways (parent Home's skill rows did at 390px). Dark mode keeps working. The fixture fails any test that
 * logs a console error.
 */
freshData();

const WHITE = 'rgb(255, 255, 255)';
const SCREENS = ['Home', 'Sessions', 'Learning', 'Progress', 'Messages'];

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function settle(page: Page) {
  await expect(page.locator('[aria-busy="true"]'), `${page.url()} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
}

const luminance = (bg: string) => {
  const m = bg.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
};

/** Every background from the h1 up to <html> that is dark. */
async function darkBehindTitle(page: Page) {
  return main(page).getByRole('heading', { level: 1 }).evaluate((h1) => {
    const dark: string[] = [];
    for (let el: Element | null = h1; el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      if (!m || (m[4] !== undefined && Number(m[4]) === 0)) continue;
      if (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]) < 128) dark.push(`${el.tagName.toLowerCase()}.${el.className}: ${bg}`);
    }
    return dark;
  });
}

/** Navy blocks anywhere in the page content: a background darker than the accent blue (#1F5EFF is about 92). */
async function navyInMain(page: Page) {
  return main(page).evaluate((root) =>
    [root, ...root.querySelectorAll('*')].flatMap((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return [];
      const lum = 0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3]);
      return lum < 60 ? [`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}: ${bg}`] : [];
    }),
  );
}

/** The first shared card in the page content: a bordered white container. */
const firstCard = (page: Page) => main(page).locator('.bg-card.border').first();

test('Grace at 1280×800: each parent screen’s first card is the white card with a 1px border and 16px corners, and nothing is navy', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('grace');
  await page.goto('/parent/home');
  await settle(page);
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
  for (const name of SCREENS) {
    await sidebar.getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await expect(sidebar.locator('a[aria-current="page"]')).toContainText(name);
    await settle(page);
    const card = firstCard(page);
    await expect(card, `${name} has no card`).toBeVisible();
    expect(await css(card, 'background-color'), `${name}: card background`).toBe(WHITE);
    expect(await css(card, 'border-top-width'), `${name}: card border`).toBe('1px');
    expect(await css(card, 'border-top-style'), `${name}: card border`).toBe('solid');
    expect(await css(card, 'border-top-left-radius'), `${name}: card corners`).toBe('16px');
    expect(await darkBehindTitle(page), `${name}: navy behind the title`).toEqual([]);
    expect(await navyInMain(page), `${name}: navy on the page`).toEqual([]);
  }
});

test('Messages: Grace’s own bubble is a soft tint, readable, and not navy', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('grace');
  await page.goto('/parent/messages');
  await settle(page);
  const bubble = main(page).getByRole('log', { name: 'Messages' }).locator('li.items-end > div').first();
  await expect(bubble).toBeVisible();
  const bg = luminance(await css(bubble, 'background-color'));
  const fg = luminance(await css(bubble, 'color'));
  expect(bg).not.toBeNull();
  expect(bg!, 'own bubble is a light tint').toBeGreaterThan(200);
  expect(fg!, 'dark text on it').toBeLessThan(100);
});

test('dark mode keeps working on the parent screens: cards turn dark and the title stays light', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('grace');
  await page.goto('/parent/home');
  await settle(page);
  const panel = await openAccount(page);
  await panel.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.keyboard.press('Escape');
  for (const url of ['/parent/home', '/parent/messages']) {
    await page.goto(url);
    await settle(page);
    const card = firstCard(page);
    expect(luminance(await css(card, 'background-color'))!, `${url}: dark card`).toBeLessThan(80);
    expect(await css(card, 'border-top-left-radius')).toBe('16px');
    const h1 = luminance(await css(main(page).getByRole('heading', { level: 1 }), 'color'));
    expect(h1!, `${url}: light title`).toBeGreaterThan(200);
  }
  // Back to light, so later tests in this worker start from the default.
  const again = await openAccount(page);
  await again.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});

test('phone: no parent screen scrolls sideways at 390px or at 412px @phone', async ({ page, as, db }) => {
  const sub = await db.submission.findFirstOrThrow({ where: { studentId: 's_noah' }, orderBy: { id: 'asc' } });
  const urls = ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/progress', '/parent/messages', `/parent/learning/${sub.id}`];
  await as('grace');
  for (const width of [390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    for (const url of urls) {
      await page.goto(url);
      await settle(page);
      const widths = await page.evaluate(() => {
        const h1 = document.querySelector('main h1');
        let scroller = h1?.parentElement ?? null;
        while (scroller && getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement;
        return [document.documentElement, document.body, scroller].filter(Boolean).map((el) => ({ tag: el!.tagName, scroll: el!.scrollWidth, client: el!.clientWidth }));
      });
      for (const w of widths) expect(w.scroll, `${url} scrolls sideways at ${width}px (${w.tag})`).toBeLessThanOrEqual(w.client);
    }
  }
});
