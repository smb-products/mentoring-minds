/** S14 holdouts: on the real sign-up form, an over-long password is explained and makes no account; the longest one keeps working. */
import type { Page } from '@playwright/test';
import { expect, freshData, test } from '../e2e/support/fixtures';
import { openAccount } from '../e2e/support/ui';

freshData();

async function signUp(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Rosa Diaz');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function signIn(page: Page, email: string, password: string) {
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('201 characters: told it is too long, no account, still signed out @phone', async ({ page, db }) => {
  const email = `s14-long-${Date.now()}@example.com`;
  await signUp(page, email, 'p'.repeat(201));
  await expect(page.locator('form p[role=alert]')).toHaveText('That password is too long');
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await db.user.count({ where: { email } })).toBe(0);
  await page.goto('/parent/home');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('exactly 200 characters: signs up, signs out and signs in again; one character more does not', async ({ page }) => {
  const email = `s14-max-${Date.now()}@example.com`;
  const password = `Aa1 ${'m'.repeat(195)}!`;
  expect(password).toHaveLength(200);
  await signUp(page, email, password);
  await page.waitForURL('**/parent/home');
  await (await openAccount(page)).getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/sign-in');
  await signIn(page, email, `${password}x`);
  await expect(page.locator('form p[role=alert]')).toContainText('That email and password don’t match');
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, email, password);
  await page.waitForURL('**/parent/home');
});
