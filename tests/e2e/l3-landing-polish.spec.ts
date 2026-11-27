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

const HERO = 'Math tutoring for grades K–6 in Miami-Dade, with F.A.S.T. test prep';
const SUBHEAD = 'One-on-one and small-group math tutoring with Vienne Elliott.';

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (l: Locator) => (await l.boundingBox())!;
const viewportWidth = (page: Page) => page.evaluate(() => document.documentElement.clientWidth);

test.describe('signed out', () => {
  test('the hero: headline at text-display, the subhead, on a full-width flat gray band, buttons keep their targets', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('main section').first();
    const h1 = hero.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(HERO);
    expect(await css(h1, 'font-size')).toBe('40px');
    expect(await css(h1, 'font-weight')).toBe('600');
    await expect(hero.locator('h1 + p')).toHaveText(SUBHEAD);

    // A full-width band, flat light gray: the same color as --secondary, no gradient.
    const vw = await viewportWidth(page);
    const band = await box(hero);
    expect(band.x).toBe(0);
    expect(band.width).toBe(vw);
    expect(await css(hero, 'background-image')).toBe('none');
    const secondary = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--secondary)';
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    });
    expect(await css(hero, 'background-color')).toBe(secondary);
    expect(secondary).not.toBe('rgba(0, 0, 0, 0)');

    // Balanced: the headline reaches past the middle of the page, so the right half isn't empty.
    const heading = await box(h1);
    expect(heading.x + heading.width).toBeGreaterThan(vw / 2 + 150);

    await expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#request-invite');
    await expect(hero.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    // The page title keeps K-6: only the hero's text changed.
    await expect(page).toHaveTitle('Mentoring Minds Academy: math tutoring K-6');
  });

  test('the header: the brain logo at about 44px, and Sign in at top right going to /sign-in', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header').first();
    const logo = header.getByRole('img', { name: 'Mentoring Minds' });
    const size = await box(logo);
    expect(size.width).toBeGreaterThanOrEqual(40);
    expect(size.width).toBeLessThanOrEqual(48);
    expect(size.height).toBeCloseTo(size.width, 0);

    const signIn = header.getByRole('link', { name: 'Sign in', exact: true });
    await expect(signIn).toHaveAttribute('href', '/sign-in');
    const link = await box(signIn);
    const bar = await box(header);
    expect(link.x + link.width).toBeGreaterThan(bar.x + bar.width - 60);
    expect(link.x).toBeGreaterThan(size.x + 200);
    await signIn.click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('Rates is one bordered panel: $50 at text-figure, per hour at text-small, and the five ways to pay as a list', async ({ page }) => {
    await page.goto('/');
    const rates = page.getByRole('region', { name: 'Rates' });
    const panel = rates.locator('[data-rates-panel]');
    await expect(panel).toHaveCount(1);
    expect(await css(panel, 'border-top-width')).toBe('1px');
    expect(await css(panel, 'border-top-style')).toBe('solid');
    expect(await css(panel, 'border-top-left-radius')).toBe('8px');
    expect(await css(panel, 'box-shadow')).toBe('none');

    const price = panel.getByText('$50', { exact: true });
    const perHour = panel.getByText('per hour', { exact: true });
    await expect(price).toBeVisible();
    await expect(perHour).toBeVisible();
    expect(await css(price, 'font-size')).toBe('24px'); // text-figure, desktop
    expect(await css(perHour, 'font-size')).toBe('13px'); // text-small
    // "per hour" sits beside "$50".
    const a = await box(price);
    const b = await box(perHour);
    expect(b.x).toBeGreaterThan(a.x + a.width - 1);
    expect(Math.abs(a.y + a.height - (b.y + b.height))).toBeLessThan(8);

    const ways = panel.getByRole('listitem');
    await expect(ways).toHaveText(['cash', 'Zelle', 'Cash App', 'Apple Pay', 'the Step Up For Students scholarship']);
    const stepUp = panel.getByRole('link', { name: 'Step Up For Students scholarship' });
    await expect(stepUp).toHaveAttribute('href', 'https://www.stepupforstudents.org');
    await expect(stepUp).toHaveAttribute('target', '_blank');
    await expect(stepUp).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('rhythm: no <hr>, services a 2×2 grid, steps numbered 1–3 in light circles, In person or online on a gray band, ≤ 1080px', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('hr')).toHaveCount(0);
    // No section is set off by a rule either.
    const tops = await page.locator('main section').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopWidth));
    expect(tops.every((w) => w === '0px')).toBe(true);

    const services = page.getByRole('region', { name: 'Services' }).getByRole('listitem');
    await expect(services).toHaveCount(4);
    const cells = await Promise.all([0, 1, 2, 3].map(async (i) => box(services.nth(i))));
    expect(Math.round(cells[0].y)).toBe(Math.round(cells[1].y));
    expect(Math.round(cells[2].y)).toBe(Math.round(cells[3].y));
    expect(cells[2].y).toBeGreaterThan(cells[0].y);
    expect(Math.round(cells[0].x)).toBe(Math.round(cells[2].x));

    const steps = page.getByRole('region', { name: 'How it works' }).getByRole('listitem');
    await expect(steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const number = steps.nth(i).locator('[data-step-number]');
      await expect(number).toHaveText(String(i + 1));
      const circle = await box(number);
      expect(Math.round(circle.width)).toBe(Math.round(circle.height));
      expect(parseFloat(await css(number, 'border-top-left-radius'))).toBeGreaterThanOrEqual(circle.width / 2);
      expect(await css(number, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
    }

    const vw = await viewportWidth(page);
    const online = page.getByRole('region', { name: 'In person or online' });
    const band = await box(online);
    expect(band.x).toBe(0);
    expect(band.width).toBe(vw);
    expect(await css(online, 'background-color')).toBe(await css(page.locator('main section').first(), 'background-color'));
    expect(await css(online, 'background-image')).toBe('none');

    // At most about 1080px wide, with gutters: every section's content sits inside a centered 1080px column.
    for (const name of ['Services', 'Rates', 'How it works', 'In person or online', 'Request an invite']) {
      const heading = await box(page.getByRole('heading', { level: 2, name }));
      expect(heading.x, name).toBeGreaterThanOrEqual((vw - 1080) / 2 + 20);
    }
    const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src')));
    expect(srcs.every((s) => /\/logo-\d+\.png$/.test(s ?? ''))).toBe(true);
  });

  test('the Request an invite form and the footer are still there', async ({ page }) => {
    await page.goto('/');
    const invite = page.locator('section#request-invite');
    await expect(invite.getByRole('heading', { name: 'Request an invite' })).toBeVisible();
    await expect(invite.locator('form')).toHaveCount(1);
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await expect(footer).toContainText('© Mentoring Minds Academy');
  });

  test('@phone no sideways scroll, the headline fits the screen at 30px, and services are one column', async ({ page }) => {
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
      expect(await css(h1, 'font-size')).toBe('30px');
      const services = page.getByRole('region', { name: 'Services' }).getByRole('listitem');
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
  expect(theme).toMatch(/--text-display: 30px;/);
  expect(theme).toMatch(/--text-display--font-weight: 600;/);
  expect(globals).toMatch(/@media \(min-width: 768px\) \{\s*:root \{[^}]*--text-display: 40px;/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|tsx?)$/.test(f) ? [p] : [];
    });
  const users = walk(path.join(root, 'src')).filter((f) => /\btext-display\b/.test(readFileSync(f, 'utf8')));
  expect(users.map((f) => path.relative(root, f))).toEqual([path.join('src', 'components', 'landing', 'Landing.tsx')]);
  expect(readFileSync(path.join(root, 'src/components/landing/Landing.tsx'), 'utf8').match(/\btext-display\b/g)).toHaveLength(1);
});
