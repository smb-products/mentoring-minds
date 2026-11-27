import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';

/**
 * S29: /sign-in hydrates without a mismatch in a clean browser. The `test` fixture fails on any console
 * error (a production build reports a text mismatch as minified React error #418); this also fails on a
 * hydration warning logged at any other level. Runs against `npm run dev` too, where React prints the
 * full diff: E2E_BASE_URL=http://localhost:<dev port> npx playwright test auth-hydration.
 * No sign-in and no data: the screen is the same for everyone.
 */

const HYDRATION = /hydrat|didn['’]t match|server rendered (HTML|text)/i;

/** Every console message, at any level, that mentions hydration. */
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

/** Waits until React has hydrated the form: the mode toggle answers a click only once it has. */
async function hydrated(page: Page) {
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(1);
}

test.describe('sign-in hydration', () => {
  for (const [label, path] of [
    ['the plain screen', '/sign-in'],
    ['the screen with a Google error', '/sign-in?error=AccessDenied'],
  ] as const) {
    test(`${label} hydrates with no mismatch @phone`, async ({ page }) => {
      const seen = watchHydration(page);
      await page.goto(path);
      await hydrated(page);
      // A fresh load too: the second visit comes from the browser's cache and the service worker.
      await page.reload();
      await hydrated(page);
      expect(seen, 'React logged a hydration mismatch').toEqual([]);
    });
  }
});
