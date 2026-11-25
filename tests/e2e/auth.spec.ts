import { DEMO_PASSWORD } from '../../prisma/data';
import type { Page } from '@playwright/test';
import { USERS, expect, freshData, signIn, test } from './support/fixtures';

/** The sign-in form's message (Next.js has its own empty role=alert for route changes). */
const formError = (page: Page) => page.locator('form p[role=alert]');

/**
 * Sign-in and page guards. These run from day one: they don't depend on any area
 * being wired, only on the production build and the database.
 */
freshData();

test.describe('sign-in', () => {
  test('a wrong password says what happened and what to expect @phone', async ({ page }) => {
    await page.goto('/sign-in');
    await page.locator('input[name=email]').fill(USERS.ana);
    await page.locator('input[name=password]').fill('not-her-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(formError(page)).toHaveText(/That email and password don’t match/);
    await expect(page).toHaveURL(/\/sign-in$/);
    // The email stays filled in for the next try.
    await expect(page.locator('input[name=email]')).toHaveValue(USERS.ana);
  });

  test('Vienne lands on Today; a parent lands on Home @phone', async ({ page, context }) => {
    await signIn(page, 'vienne');
    await expect(page).toHaveURL(/\/admin\/today$/);
    await context.clearCookies();
    await signIn(page, 'ana');
    await expect(page).toHaveURL(/\/parent\/home$/);
  });

  test('five wrong passwords pause password sign-in, even with the right one', async ({ page, db }) => {
    const attempt = async (password: string) => {
      await page.locator('input[name=email]').fill(USERS.daniel);
      await page.locator('input[name=password]').fill(password);
      await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST'), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    };
    await page.goto('/sign-in');
    for (let i = 0; i < 5; i++) await attempt(`wrong-${i}`);
    const daniel = await db.user.findUniqueOrThrow({ where: { email: USERS.daniel } });
    expect(daniel.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    await attempt(DEMO_PASSWORD);
    await expect(formError(page)).toHaveText(/pauses for 15 minutes/);
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('a new parent can create an account and starts as a preview account', async ({ page, db }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Your name').fill('Rosa Diaz');
    await page.getByLabel('Email').fill('rosa.diaz@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/sign-in$/); // the browser refuses under 8 characters
    await page.getByLabel('Password').fill('rosa-password-1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/parent/home');
    const rosa = await db.user.findUniqueOrThrow({ where: { email: 'rosa.diaz@example.com' } });
    expect(rosa).toMatchObject({ role: 'PARENT', status: 'PREVIEW', name: 'Rosa Diaz' });
    expect(rosa.passwordHash).not.toContain('rosa-password-1');
  });

  test('Google is offered only once its keys are set', async ({ page }) => {
    await page.goto('/sign-in');
    const google = page.getByRole('button', { name: 'Continue with Google' });
    if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) await expect(google).toBeVisible();
    else await expect(google).toHaveCount(0);
  });

  test('a failed Google sign-in comes back with a plain message, not an error page', async ({ page }) => {
    await page.goto('/sign-in?error=AccessDenied');
    await expect(page.getByRole('alert').filter({ hasText: 'Google hasn’t confirmed that email address yet' })).toBeVisible();
    await page.goto('/sign-in?error=SomethingUnexpected');
    await expect(page.getByRole('alert').filter({ hasText: 'Signing in didn’t work. Please try again.' })).toBeVisible();
  });

  test('the same email can’t sign up twice', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Your name').fill('Ana Again');
    await page.getByLabel('Email').fill(USERS.ana);
    await page.getByLabel('Password').fill('another-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(formError(page)).toHaveText(/already an account with that email/);
  });
});

test.describe('who can open what', () => {
  test('signed out, every screen goes to sign-in', async ({ page }) => {
    for (const path of ['/', '/admin/today', '/admin/families', '/parent/home', '/parent/learning']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in$/);
    }
  });

  test('a parent can’t open Vienne’s screens', async ({ page, as }) => {
    await as('ana');
    for (const path of ['/admin/today', '/admin/families/u_grace', '/admin/settings']) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/parent\/home$/);
    }
  });

  test('Vienne opening a parent screen goes to her own', async ({ page, as }) => {
    await as('vienne');
    await page.goto('/parent/home');
    await expect(page).toHaveURL(/\/admin\/today$/);
  });

  test('API routes answer for themselves instead of redirecting', async ({ request }) => {
    const cron = await request.get('/api/cron/daily', { maxRedirects: 0 });
    expect(cron.status()).toBe(401);
    const wrongSecret = await request.get('/api/cron/daily', { maxRedirects: 0, headers: { authorization: 'Bearer not-the-secret' } });
    expect(wrongSecret.status()).toBe(401);
    const file = await request.get('/api/files/fa_fraction_strips', { maxRedirects: 0 });
    expect(file.status()).toBe(401);
  });

  test('a parent can download a worksheet but not another family’s photos', async ({ page, as }) => {
    await as('ana');
    const worksheet = await page.request.get('/api/files/fa_fraction_strips');
    expect(worksheet.status()).toBe(200);
    expect(worksheet.headers()['content-type']).toBe('application/pdf');
    const otherFamily = await page.request.get('/api/files/fa_arjun_work');
    expect(otherFamily.status()).toBe(403);
  });

  test('pages send the security headers', async ({ request }) => {
    const res = await request.get('/sign-in');
    expect(res.headers()['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });
});
