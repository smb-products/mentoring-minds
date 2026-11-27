import { expect, test } from './support/fixtures';

/**
 * S31: /sign-in?error=<code> never returns a 500. A known code shows its own message, and any other code,
 * including names a plain object inherits, shows the generic one. The `test` fixture fails on console errors.
 * No sign-in and no data: the screen is the same for everyone.
 */

const GENERIC = 'Signing in didn’t work. Please try again.';
const message = (page: import('@playwright/test').Page, text: string) => page.getByRole('alert').filter({ hasText: text });

test.describe('sign-in error codes', () => {
  for (const [code, text] of [
    ['AccessDenied', 'Google hasn’t confirmed that email address yet.'],
    ['OAuthAccountNotLinked', 'That email already signs in another way.'],
    ['Configuration', 'Google sign-in isn’t working right now.'],
    ['SomethingUnexpected', GENERIC],
  ] as const) {
    test(`?error=${code} shows its plain message`, async ({ page }) => {
      const res = await page.goto(`/sign-in?error=${code}`);
      expect(res?.status()).toBe(200);
      await expect(message(page, text)).toBeVisible();
    });
  }

  for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    test(`?error=${code} (an inherited name) shows the generic message, not a 500`, async ({ page }) => {
      const res = await page.goto(`/sign-in?error=${encodeURIComponent(code)}`);
      expect(res?.status()).toBe(200);
      await expect(message(page, GENERIC)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    });
  }
});
