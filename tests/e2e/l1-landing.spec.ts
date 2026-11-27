import type { Page } from '@playwright/test';
import { expect, freshData, test } from './support/fixtures';

/**
 * L1: the public landing page at / for signed-out visitors, /privacy, and the Open Graph image.
 * Signed-in Vienne and parents still go straight home from /. Wording from docs/DESIGN.md → Landing page.
 */
freshData();

const HERO = 'Math tutoring for grades K–6 in Miami-Dade, with F.A.S.T. test prep';
const SERVICES: [string, string][] = [
  ['1-on-1 Tutoring', 'Individual support for students who need extra help in a subject.'],
  ['Small Groups', 'Students practice and learn alongside their peers.'],
  ['In-Home Tutoring', 'For special circumstances.'],
  ['Online Tutoring', 'For special circumstances.'],
];
const SECTIONS = ['Services', 'Rates', 'How it works', 'In person or online', 'Request an invite'];

const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('signed out', () => {
  test('/ is the landing page: 200, no redirect, with the hero and both buttons', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    expect(res?.request().redirectedFrom()).toBeNull();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO);
    await expect(page.getByRole('img', { name: 'Mentoring Minds' }).first()).toBeVisible();

    const hero = page.locator('main section').first();
    await expect(hero.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#request-invite');
    await expect(hero.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');

    await hero.getByRole('link', { name: 'Get started' }).click();
    await expect(page).toHaveURL(/#request-invite$/);
    await expect(page.locator('#request-invite').getByRole('heading', { name: 'Request an invite' })).toBeInViewport();

    await page.goto('/');
    await hero.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('the sections come in order, with the four services, the rate and the five ways to pay', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(SECTIONS);

    const services = page.getByRole('region', { name: 'Services' });
    await expect(services.getByRole('heading', { level: 3 })).toHaveText(SERVICES.map(([name]) => name));
    for (const [name, line] of SERVICES) await expect(services.getByRole('listitem').filter({ hasText: name })).toContainText(line);

    const rates = page.getByRole('region', { name: 'Rates' });
    await expect(rates).toContainText('$50 per hour');
    for (const way of ['cash', 'Zelle', 'Cash App', 'Apple Pay', 'Step Up For Students scholarship']) await expect(rates, way).toContainText(way);
    const stepUp = rates.getByRole('link', { name: /Step Up For Students/ });
    await expect(stepUp).toHaveAttribute('href', 'https://www.stepupforstudents.org');
    await expect(stepUp).toHaveAttribute('target', '_blank');
    await expect(stepUp).toHaveAttribute('rel', 'noopener noreferrer');

    await expect(page.getByRole('region', { name: 'How it works' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'In person or online' })).toContainText(/in person or online/i);

    const invite = page.locator('section#request-invite');
    await expect(invite).toContainText('Have an invite code from Vienne? Create your account on the sign-in page.');
    await expect(invite.getByRole('link', { name: 'Create your account on the sign-in page.' })).toHaveAttribute('href', '/sign-in');
  });

  test('no photos, bio or contact details: the only image is the logo', async ({ page }) => {
    await page.goto('/');
    const srcs = await page.locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src')));
    expect(srcs.every((s) => /\/logo-\d+\.png$/.test(s ?? ''))).toBe(true);
    const body = page.locator('body');
    await expect(body).not.toContainText(/@[a-z0-9-]+\.[a-z]|\(\d{3}\)|\d{3}[-. ]\d{3}[-. ]\d{4}/i);
    await expect(page.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
  });

  test('the footer has Privacy, Sign in and the copyright line', async ({ page }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in');
    await expect(footer).toContainText('© Mentoring Minds Academy');
    await footer.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  });

  test('metadata: title, description, canonical and Open Graph on the site address', async ({ page, request }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Mentoring Minds Academy: math tutoring K-6');
    const head = page.locator('head');
    await expect(head.locator('link[rel=canonical]')).toHaveAttribute('href', /^https:\/\/mentoringmindsacademy\.org\/?$/);
    await expect(head.locator('meta[name=description]')).toHaveAttribute('content', /\S/);
    await expect(head.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Mentoring Minds Academy: math tutoring K-6');
    await expect(head.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/);
    await expect(head.locator('meta[property="og:url"]')).toHaveAttribute('content', /^https:\/\/mentoringmindsacademy\.org\/?$/);
    await expect(head.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https:\/\/mentoringmindsacademy\.org\/opengraph-image/);

    const image = await request.get('/opengraph-image', { maxRedirects: 0 });
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
  });

  test('/privacy opens, in plain words, and look-alike paths still go to sign-in', async ({ page, request }) => {
    const res = await page.goto('/privacy');
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/privacy$/);
    const main = page.locator('main');
    for (const heading of ['What the app stores', 'Who sees it', 'Where it lives', 'How long it’s kept', 'How to delete it'])
      await expect(main.getByRole('heading', { name: heading })).toBeVisible();
    for (const text of ['first names and grades', 'FAST scores', 'Invite requests', 'Vercel', 'Neon', 'US', '90 days', 'restore window'])
      await expect(main, text).toContainText(text);

    for (const path of ['/privacyx', '/privacy/anything', '/opengraph-imagex', '/admin/today', '/parent/home']) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308], path).toContain(r.status());
      expect(new URL(r.headers()['location'], 'http://x').pathname, path).toBe('/sign-in');
    }
  });

  test('sign-in has the logo and a Privacy link', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('img', { name: 'Mentoring Minds' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('@phone no sideways scroll on /, /privacy or /sign-in', async ({ page }) => {
    for (const path of ['/', '/privacy', '/sign-in']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await noSidewaysScroll(page), path).toBe(true);
    }
  });
});

test.describe('signed in', () => {
  test('Vienne going to / lands on Today, and can open /privacy', async ({ page, as }) => {
    await as('vienne');
    await page.goto('/');
    await expect(page).toHaveURL(/\/admin\/today$/);
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  });

  test('a parent going to / lands on Home, and can open /privacy and the Open Graph image', async ({ page, as }) => {
    await as('ana');
    await page.goto('/');
    await expect(page).toHaveURL(/\/parent\/home$/);
    await page.goto('/privacy');
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
    const image = await page.request.get('/opengraph-image', { maxRedirects: 0 });
    expect(image.status()).toBe(200);
  });
});

test('the installed app opens to sign-in, scope /', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/sign-in');
  expect(manifest.scope).toBe('/');
});
