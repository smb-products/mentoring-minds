/**
 * S29 holdouts: /sign-in hydrates cleanly for the ways a signed-out person really arrives
 * that the ticket's spec doesn't try, and the form still works afterwards. The `test`
 * fixture fails on any console error; hydration warnings at other levels fail here too.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../e2e/support/fixtures';

const HYDRATION = /hydrat|didn['’]t match|server rendered (HTML|text)|React error #4(18|19|23|25)/i;

function watchHydration(page: Page) {
  const seen: string[] = [];
  page.on('console', (m) => {
    if (HYDRATION.test(m.text())) seen.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (HYDRATION.test(e.message)) seen.push(`[pageerror] ${e.message}`);
  });
  return seen;
}

/** The screen is hydrated and usable: switching to "Create account" and back works. */
async function usable(page: Page) {
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveCount(0);
}

test('a signed-out visitor sent away from a family or admin page lands on a sign-in screen with no mismatch', async ({ page }) => {
  const seen = watchHydration(page);
  // '/' is the public landing page since L1 (tests/e2e/l1-landing.spec.ts). Lead edit, CHANGES.md 2026-11-27.
  for (const path of ['/parent/home', '/admin/today']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in/);
    await usable(page);
  }
  expect(seen).toEqual([]);
});

test.describe('on a phone set to another language, time zone and dark mode', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, locale: 'es-ES', timezoneId: 'Pacific/Auckland', colorScheme: 'dark' });

  test('unknown, empty and repeated ?error= values hydrate with no mismatch and never echo what was typed', async ({ page }) => {
    const seen = watchHydration(page);
    for (const query of ['?error=SomethingNew', '?error=', '?error=AccessDenied&error=Configuration', '?error=%3Cb%3Eholdout-typed%3C%2Fb%3E']) {
      const response = await page.goto(`/sign-in${query}`);
      expect(response?.status(), query).toBe(200);
      await usable(page);
      await expect(page.getByText('holdout-typed'), query).toHaveCount(0);
    }
    expect(seen).toEqual([]);
  });
});
