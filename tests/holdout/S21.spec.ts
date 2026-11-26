/**
 * S21 holdouts in the browser: with the server refusing, the change-password screen still loads cleanly
 * (the fixture fails on console errors), and the same sign-in has the whole app back afterwards.
 */
import bcrypt from 'bcryptjs';
import type { Page } from '@playwright/test';
import { expect, requiresSignInWired, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

requiresSignInWired();

const TEMP = 'temporary-pass-s21';

async function signInTemporary(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(TEMP);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Choose a new password')).toBeVisible();
}

async function chooseNew(page: Page) {
  await page.getByLabel('Temporary password').fill(TEMP);
  await page.getByLabel('New password').fill('my-own-password-s21');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Choose a new password')).toHaveCount(0);
}

test('a paused parent with a temporary password: a clean password screen, then her messages without signing in again', async ({ page, db }) => {
  await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED', mustChangePassword: true, passwordHash: await bcrypt.hash(TEMP, 10) } });
  await signInTemporary(page, 'daniel.reyes@example.com');
  // A bookmark to another page shows the same screen and none of the family's data.
  await page.goto('/parent/messages');
  await expect(page.getByText('Choose a new password')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Sofia', { exact: false })).toHaveCount(0);

  await chooseNew(page);
  await page.goto('/parent/messages');
  await expect(main(page).getByText('Sofia’s soccer practice moved to Wednesdays.', { exact: false })).toBeVisible();
  const text = 'Thank you, my new password works.';
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(main(page).getByText(text)).toBeVisible();
  await expect.poll(() => db.message.count({ where: { body: text } })).toBe(1);
});

test('an active parent gets her child back right after choosing a password', async ({ page, db }) => {
  await db.user.update({ where: { id: 'u_grace' }, data: { mustChangePassword: true, passwordHash: await bcrypt.hash(TEMP, 10) } });
  await signInTemporary(page, 'grace.kim@example.com');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Noah', { exact: false })).toHaveCount(0);

  await chooseNew(page);
  await expect(page).toHaveURL(/\/parent\/home$/);
  await expect(main(page).getByText('Noah', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/choose a new password/i)).toHaveCount(0);
});
