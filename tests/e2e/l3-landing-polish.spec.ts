import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, freshData, test } from './support/fixtures';

/**
 * L3: the landing page's polish pass (docs/DESIGN.md → Landing polish), signed out on a production build.
 * The hero reads like a business, the header has Sign in, Rates is one quiet panel, and the sections vary:
 * no rules, numbered steps, light-gray bands.
 */
freshData();

// Landing C (L4) replaced the hero, the gray bands, the header's logo size, the Rates panel and the steps' circles;
// L4's report lists each changed line, and tests/e2e/l4-landing-c.spec.ts checks the new page.
const HERO = 'Math tutoring that builds real confidence';
const SUBHEAD = 'One-on-one and small-group sessions with Vienne Elliott, with F.A.S.T. test prep for Florida students.';

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (l: Locator) => (await l.boundingBox())!;
const viewportWidth = (page: Page) => page.evaluate(() => document.documentElement.clientWidth);

test.describe('signed out', () => {
  test('the hero: headline at text-display, the subhead, on the graph-paper panel, buttons keep their targets', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('main section').first();
    const h1 = hero.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(HERO);
    expect(await css(h1, 'font-size')).toBe('64px');
    expect(await css(h1, 'font-weight')).toBe('700');
    await expect(hero.locator('h1 + p')).toHaveText(SUBHEAD);

    // Landing C: a centered rounded panel, light blue with the graph-paper pattern.
    const vw = await viewportWidth(page);
    const panel = hero.locator('[data-hero]');
    const band = await box(panel);
    expect(Math.round(band.x + band.width / 2)).toBe(Math.round(vw / 2));
    expect(await css(panel, 'background-image')).toMatch(/linear-gradient/);
    expect(await css(panel, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');

    // Balanced: the headline reaches past the middle of the page, so the right half isn't empty.
    const heading = await box(h1);
    expect(heading.x + heading.width).toBeGreaterThan(vw / 2 + 150);

    await expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/sign-in?mode=new');
    await expect(hero.getByRole('link', { name: '$50 per hour · See rates' })).toHaveAttribute('href', '#rates');
    // The page title keeps K-6: only the hero's text changed.
    await expect(page).toHaveTitle('Mentoring Minds Academy: math tutoring K-6');
  });

  test('the header: the brain logo at 32px, and Sign in at top right going to /sign-in', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header').first();
    const logo = header.getByRole('img', { name: 'Mentoring Minds' });
    const size = await box(logo);
    expect(Math.round(size.width)).toBe(32);
    expect(size.height).toBeCloseTo(size.width, 0);

    const signIn = header.getByRole('link', { name: 'Sign in', exact: true });
    await expect(signIn).toHaveAttribute('href', '/sign-in');
    const link = await box(signIn);
    const bar = await box(header);
    // Landing C: Sign in sits just before Get started, at the right of the bar.
    const getStarted = await box(header.getByRole('link', { name: 'Get started' }));
    expect(getStarted.x + getStarted.width).toBeGreaterThan(bar.x + bar.width - 60);
    expect(link.x + link.width).toBeLessThan(getStarted.x);
    expect(link.x).toBeGreaterThan(size.x + 200);
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('Rates is one bordered panel: $50 at text-price, per hour beside it, and the five ways to pay as a list', async ({ page }) => {
    await page.goto('/');
    const rates = page.getByRole('region', { name: 'Simple pricing' });
    const panel = rates.locator('[data-rates-panel]');
    await expect(panel).toHaveCount(1);
    expect(await css(panel, 'border-top-width')).toBe('1px');
    expect(await css(panel, 'border-top-style')).toBe('solid');
    expect(await css(panel, 'border-top-left-radius')).toBe('28px');
    expect(await css(panel, 'box-shadow')).toBe('none');

    const price = panel.getByText('$50', { exact: true });
    const perHour = panel.getByText('per hour', { exact: true });
    await expect(price).toBeVisible();
    await expect(perHour).toBeVisible();
    expect(await css(price, 'font-size')).toBe('80px'); // text-price, desktop
    expect(await css(perHour, 'font-size')).toBe('18px');
    // "per hour" sits beside "$50".
    const a = await box(price);
    const b = await box(perHour);
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(b.y).toBeGreaterThan(a.y);
    expect(b.y + b.height).toBeLessThanOrEqual(a.y + a.height + 1);

    const ways = panel.getByRole('listitem');
    await expect(ways).toHaveText(['Cash', 'Zelle', 'Cash App', 'Apple Pay', 'Step Up For Students scholarship ↗']);
    const stepUp = panel.getByRole('link', { name: 'Step Up For Students scholarship' });
    await expect(stepUp).toHaveAttribute('href', 'https://www.stepupforstudents.org');
    await expect(stepUp).toHaveAttribute('target', '_blank');
    await expect(stepUp).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('rhythm: no <hr>, services four pastel tiles, steps numbered 1–3 in solid squares, ≤ 1160px', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('hr')).toHaveCount(0);
    // No section is set off by a rule either.
    const tops = await page.locator('main section').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopWidth));
    expect(tops.every((w) => w === '0px')).toBe(true);

    // Landing C: the four services sit in one row of pastel tiles on a desktop.
    const services = page.getByRole('region', { name: 'Ways to learn with Vienne' }).getByRole('listitem');
    await expect(services).toHaveCount(4);
    const cells = await Promise.all([0, 1, 2, 3].map(async (i) => box(services.nth(i))));
    expect(new Set(cells.map((c) => Math.round(c.y))).size).toBe(1);
    expect(cells[1].x).toBeGreaterThan(cells[0].x);

    const steps = page.getByRole('region', { name: 'Getting started takes three steps' }).getByRole('listitem');
    await expect(steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const number = steps.nth(i).locator('[data-step-number]');
      await expect(number).toHaveText(String(i + 1));
      const square = await box(number);
      expect(Math.round(square.width)).toBe(Math.round(square.height));
      expect(parseFloat(await css(number, 'border-top-left-radius'))).toBe(10);
      expect(await css(number, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
    }

    const vw = await viewportWidth(page);
    // At most about 1160px wide, with gutters: every section's title sits inside a centered 1160px column.
    for (const name of ['Ways to learn with Vienne', 'Know exactly how your child is doing', 'Simple pricing', 'Getting started takes three steps', 'Questions? Message Vienne']) {
      const heading = await box(page.getByRole('heading', { level: 2, name }));
      expect(heading.x, name).toBeGreaterThanOrEqual((vw - 1160) / 2 + 20);
    }
    // The logo plus exactly the 4 service photos (L5), nothing else.
    const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src') ?? ''));
    const photos = srcs.filter((s) => !/\/logo-\d+\.png$/.test(s)).map((s) => s.match(/^\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2F(one-on-one|small-groups|in-home|online)\.[\w-]+\.jpg&/)?.[1] ?? s);
    expect(photos).toEqual(['one-on-one', 'small-groups', 'in-home', 'online']);
  });

  test('the Questions? Message Vienne form and the footer are still there', async ({ page }) => {
    await page.goto('/');
    const invite = page.locator('section#request-invite');
    await expect(invite.getByRole('heading', { name: 'Questions? Message Vienne' })).toBeVisible();
    await expect(invite.locator('form')).toHaveCount(1);
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await expect(footer).toContainText('© Mentoring Minds Academy');
  });

  test('@phone no sideways scroll, the headline fits the screen at 38px, and services are one column', async ({ page }) => {
    await page.goto('/');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(HERO);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const vw = await viewportWidth(page);
    const heading = await box(h1);
    expect(heading.x).toBeGreaterThanOrEqual(0);
    expect(heading.x + heading.width).toBeLessThanOrEqual(vw);
    expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (vw < 768) {
      expect(await css(h1, 'font-size')).toBe('38px');
      const services = page.getByRole('region', { name: 'Ways to learn with Vienne' }).getByRole('listitem');
      const [first, second] = [await box(services.nth(0)), await box(services.nth(1))];
      expect(second.y).toBeGreaterThan(first.y + first.height - 1);
      // The header's Sign in fits too.
      const signIn = await box(page.locator('header').first().getByRole('link', { name: 'Sign in', exact: true }));
      expect(signIn.x + signIn.width).toBeLessThanOrEqual(vw);
    }
  });
});

test('text-display is defined in globals.css @theme and used only by the landing hero', () => {
  const root = process.cwd();
  const globals = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');
  const theme = globals.slice(globals.indexOf('@theme {'), globals.indexOf('\n}', globals.indexOf('@theme {')));
  // Landing C: one fluid size, 38px on phones up to 64px, at weight 700.
  expect(theme).toMatch(/--text-display: clamp\(38px, 5\.6vw, 64px\);/);
  expect(theme).toMatch(/--text-display--font-weight: 700;/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(f) ? [p] : [];
    });
  const users = walk(path.join(root, 'src')).filter((f) => /\btext-display\b/.test(readFileSync(f, 'utf8')));
  expect(users.map((f) => path.relative(root, f))).toEqual([path.join('src', 'components', 'landing', 'Landing.tsx')]);
  expect(readFileSync(path.join(root, 'src/components/landing/Landing.tsx'), 'utf8').match(/\btext-display\b/g)).toHaveLength(1);
});
