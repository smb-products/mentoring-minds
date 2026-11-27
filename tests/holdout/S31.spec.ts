/** S31 holdouts: every inherited name and odd shapes of ?error=, and signing in from such an address. */
import { DEMO_PASSWORD } from '../../prisma/data';
import { expect, freshData, test, USERS } from '../e2e/support/fixtures';

freshData();

const GENERIC = 'Signing in didn’t work. Please try again.';
const INHERITED = [...Object.getOwnPropertyNames(Object.prototype), 'prototype'];

test('every name a plain object has answers 200 with only the generic message', async ({ page }) => {
  for (const name of INHERITED) {
    const response = await page.goto(`/sign-in?error=${encodeURIComponent(name)}`);
    expect(response?.status(), name).toBe(200);
    await expect(page.getByRole('alert').filter({ hasText: /\S/ }), name).toHaveText([GENERIC]);
    await expect(page.locator('main'), name).not.toContainText(/\[object|native code|function/);
  }
});

test('repeated, bracketed, broken and very long values never break the page', async ({ page }) => {
  const queries = [
    'error=constructor&error=toString',
    'error=__proto__&error=__proto__',
    'error[]=constructor',
    'error[toString]=x',
    '__proto__=error&constructor=1',
    'error=constructor%00',
    'error=%E0%A4%A',
    `error=${'a'.repeat(4000)}`,
  ];
  for (const query of queries) {
    const response = await page.goto(`/sign-in?${query}`);
    expect(response?.status(), query).toBe(200);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }), query).toBeVisible();
    await expect(page.locator('main'), query).not.toContainText(/\[object|native code/);
  }
});

test('a parent who lands on an inherited-name address can still sign in', async ({ page }) => {
  await page.goto('/sign-in?error=hasOwnProperty');
  await page.locator('input[name=email]').fill(USERS.ana);
  await page.locator('input[name=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/parent/home');
});
