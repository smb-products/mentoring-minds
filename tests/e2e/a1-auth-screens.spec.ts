import bcrypt from 'bcryptjs';
import type { Locator, Page } from '@playwright/test';
import { expect, requiresSignInWired, test } from './support/fixtures';

/**
 * A1: the auth screens per docs/design/sign-in.html (docs/DESIGN.md → Auth screens), on a production build.
 * /sign-in and the forced new-password screen share the split layout: the graph-paper panel on the left, the form
 * on the right; stacked on phones without the feature rows.
 */
requiresSignInWired();

const HEADLINE = 'Welcome back. Your child’s math, all in one place.';
const FEATURES = ['Book and manage sessions', 'Homework and Vienne’s feedback', 'Progress and F.A.S.T. scores'];
const FORGOT = 'Forgot your password? Message or text Vienne and she’ll reset it.';

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const box = async (l: Locator) => (await l.boundingBox())!;
const noSidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Each field's <label> is visible, sits above it, and the field has no placeholder standing in for it. */
async function expectVisibleLabels(page: Page, names: string[]) {
  for (const name of names) {
    const field = page.getByLabel(name, { exact: true });
    await expect(field, name).toHaveCount(1);
    expect(await field.getAttribute('placeholder'), `${name} has no placeholder`).toBeNull();
    const id = await field.getAttribute('id');
    const label = page.locator(`label[for="${id}"]`);
    await expect(label, `${name} has a visible <label>`).toBeVisible();
    await expect(label).toHaveText(name);
    expect((await box(label)).y, `${name}'s label is above the field`).toBeLessThan((await box(field)).y);
  }
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'The split layout is the desktop view.');

  test('/sign-in is split: the graph-paper panel on the left, the form on the right', async ({ page }) => {
    await page.goto('/sign-in');
    const panel = page.locator('[data-auth-panel]');
    const form = page.locator('[data-auth-form]');

    // The panel: brain logo and name, the headline with its highlight, three feature rows, the Back link.
    expect(await css(panel, 'background-image')).toMatch(/linear-gradient/);
    expect(await css(panel, 'background-color')).not.toBe('rgba(0, 0, 0, 0)');
    await expect(panel.getByRole('img', { name: 'Mentoring Minds' })).toBeVisible();
    await expect(panel.getByText('Mentoring Minds Academy', { exact: true })).toBeVisible();
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText(HEADLINE);
    expect(await css(h1, 'font-weight')).toBe('700');
    const highlight = h1.locator('span');
    await expect(highlight).toHaveText('all in one place');
    expect(await css(highlight, 'background-image')).toMatch(/linear-gradient/);
    const rows = panel.locator('[data-auth-features] li');
    await expect(rows).toHaveText(FEATURES);
    for (const row of await rows.all()) {
      const icon = await box(row.locator('svg'));
      expect([icon.width, icon.height]).toEqual([20, 20]);
    }
    const back = panel.getByRole('link', { name: '← Back to mentoringmindsacademy.org' });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/');

    // The form: at most 380px wide, under its h2 and line, to the right of the panel.
    const h2 = form.getByRole('heading', { level: 2, name: 'Sign in', exact: true });
    await expect(h2).toBeVisible();
    expect(await css(h2, 'font-weight')).toBe('700');
    await expect(form.getByText('Families and Vienne sign in here.', { exact: true })).toBeVisible();
    const p = await box(panel);
    const f = await box(form);
    expect(f.width).toBeLessThanOrEqual(380);
    expect(p.x + p.width).toBeLessThanOrEqual(f.x);
    expect(f.y).toBeLessThan(p.y + p.height);

    // Fields stay text-field (14px on desktop), in Inter, with no Google Fonts link.
    for (const name of ['Email', 'Password']) expect(await css(page.getByLabel(name, { exact: true }), 'font-size'), name).toBe('14px');
    expect(await css(page.locator('body'), 'font-family')).toMatch(/^"?Inter Variable/);
    await expect(page.locator('link[href*="fonts.googleapis"], link[href*="fonts.gstatic"]')).toHaveCount(0);
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('the forced new-password screen uses the same split layout around the form', async ({ page, db }) => {
    const email = `a1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await db.user.create({
      data: { name: 'Rosa Diaz', email, role: 'PARENT', status: 'ACTIVE', passwordHash: await bcrypt.hash('temporary-pass-1', 10), mustChangePassword: true },
    });
    await page.goto('/sign-in');
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill('temporary-pass-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/parent/home');

    const panel = page.locator('[data-auth-panel]');
    const form = page.locator('[data-auth-form]');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
    await expect(panel.locator('[data-auth-features] li')).toHaveText(FEATURES);
    await expect(form.getByRole('heading', { level: 2, name: 'Choose a new password' })).toBeVisible();
    await expect(form.getByText('Vienne reset your password. Enter the temporary one she gave you, then pick your own.')).toBeVisible();
    await expect(form.getByLabel('Temporary password')).toBeVisible();
    await expect(form.getByLabel('New password')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Save new password' })).toBeVisible();
    const p = await box(panel);
    const f = await box(form);
    expect(f.width).toBeLessThanOrEqual(380);
    expect(p.x + p.width).toBeLessThanOrEqual(f.x);
    await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
  });

  test('signed in, /sign-in still goes home', async ({ page, as }) => {
    await as('ana');
    await page.goto('/sign-in');
    await page.waitForURL('**/parent/home');
  });
});

test('the form: visible labels, the Show toggle, the Forgot line and Request an invite @phone', async ({ page }) => {
  await page.goto('/sign-in');
  await expectVisibleLabels(page, ['Email', 'Password']);

  // Labels stay put while typing.
  await page.getByLabel('Email', { exact: true }).fill('ana@example.com');
  await expect(page.locator('label', { hasText: /^Email$/ })).toBeVisible();

  // Show/Hide: flips the field's type and aria-pressed; its name never says "password".
  const password = page.getByLabel('Password');
  await expect(password).toHaveCount(1);
  await expect(password).toHaveAttribute('type', 'password');
  const toggle = page.getByRole('button', { name: 'Show', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await password.fill('my-password');
  await toggle.click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('my-password');
  const hide = page.getByRole('button', { name: 'Hide', exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Password')).toHaveCount(1);
  await hide.click();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: 'Show', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: /password/i })).toHaveCount(0);

  await expect(page.getByText(FORGOT, { exact: true })).toBeVisible();
  await expect(page.getByText(/^New family with an invite code\?/)).toBeVisible();
  await expect(page.getByText(/^No code yet\?/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');

  // Create account mode keeps its names, with a visible label for each field.
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expectVisibleLabels(page, ['Your name', 'Email', 'Password']);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText(/^Already have an account\?/)).toBeVisible();
  await expect(page.getByText('After you sign up, enter the invite code Vienne sent you.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();

  const invite = page.getByRole('link', { name: 'Request an invite' });
  await expect(invite).toHaveAttribute('href', '/#request-invite');
  await invite.click();
  await expect(page).toHaveURL(/\/#request-invite$/);
  await expect(page.locator('#request-invite')).toBeInViewport();
});

test('phone: stacked, logo and headline above the form, no feature rows, full-width buttons @phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The phone layout.');
  await page.goto('/sign-in');
  const panel = page.locator('[data-auth-panel]');
  const form = page.locator('[data-auth-form]');
  await expect(panel.getByRole('img', { name: 'Mentoring Minds' })).toBeVisible();
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(HEADLINE);
  await expect(panel.locator('[data-auth-features]')).toBeHidden();
  for (const feature of FEATURES) await expect(page.getByText(feature)).toBeHidden();

  const h = await box(h1);
  const f = await box(form);
  expect(h.y + h.height).toBeLessThanOrEqual(f.y);
  const signIn = await box(page.getByRole('button', { name: 'Sign in', exact: true }));
  expect(Math.round(signIn.width)).toBe(Math.round(f.width));
  const google = page.getByRole('button', { name: 'Continue with Google' });
  if (await google.count()) expect(Math.round((await box(google)).width)).toBe(Math.round(f.width));

  for (const name of ['Email', 'Password']) expect(await css(page.getByLabel(name, { exact: true }), 'font-size'), name).toBe('16px');
  expect(await noSidewaysScroll(page)).toBe(true);
});
