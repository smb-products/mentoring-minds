import bcrypt from 'bcryptjs';
import type { Page } from '@playwright/test';
import type { e2eDb } from './support/db';
import { expect, requiresSignInWired, test } from './support/fixtures';
import { openAccount } from './support/ui';

/**
 * WIRING.md Step 1: a new password after Vienne's "Reset password", and "Change password"
 * in the account panel. Both call families.changePassword on the real server.
 * Each test makes its own parent, so no demo account's password or sessions change.
 */
requiresSignInWired();

type Db = ReturnType<typeof e2eDb>;

async function newParent(db: Db, password: string, mustChangePassword: boolean) {
  const email = `pw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await db.user.create({
    data: { name: 'Rosa Diaz', email, role: 'PARENT', status: 'ACTIVE', passwordHash: await bcrypt.hash(password, 10), mustChangePassword,
      // A child, so the Add your child step (J2) doesn't come before the app.
      students: { create: { firstName: 'Pablo', lastName: '', grade: 4 } } },
  });
  return email;
}

async function signInWith(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/parent/home');
}

const passwordOf = async (db: Db, email: string) => (await db.user.findUniqueOrThrow({ where: { email } })).passwordHash!;

test('after a reset, the parent picks a new password before anything else @phone', async ({ page, db }) => {
  const email = await newParent(db, 'temporary-pass-1', true);
  await signInWith(page, email, 'temporary-pass-1');
  await expect(page.getByText('Choose a new password')).toBeVisible();
  // Nothing else of the app yet.
  await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);

  await page.getByLabel('Temporary password').fill('temporary-pass-1');
  await page.getByLabel('New password').fill('my-own-password-1');
  await page.getByRole('button', { name: 'Save new password' }).click();

  // Still signed in on this device, and the app opens.
  await expect(page.getByRole('button', { name: /^Account/ }).first()).toBeVisible();
  await expect(page.getByText('Choose a new password')).toHaveCount(0);
  await expect(page).toHaveURL(/\/parent\/home$/);
  const row = await db.user.findUniqueOrThrow({ where: { email } });
  expect(row.mustChangePassword).toBe(false);
  expect(await bcrypt.compare('my-own-password-1', row.passwordHash!)).toBe(true);
});

test('a wrong temporary password is refused and nothing changes', async ({ page, db }) => {
  const email = await newParent(db, 'temporary-pass-2', true);
  await signInWith(page, email, 'temporary-pass-2');
  const before = await passwordOf(db, email);
  await page.getByLabel('Temporary password').fill('not-the-temporary-one');
  await page.getByLabel('New password').fill('my-own-password-2');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.locator('form p[role=alert]')).toHaveText('Your current password isn’t right.');
  await expect(page.getByText('Choose a new password')).toBeVisible();
  expect(await passwordOf(db, email)).toBe(before);
  expect((await db.user.findUniqueOrThrow({ where: { email } })).mustChangePassword).toBe(true);
});

test('Change password in the account panel, then sign in with the new one', async ({ page, db }) => {
  const email = await newParent(db, 'first-password-1', false);
  await signInWith(page, email, 'first-password-1');
  const panel = await openAccount(page);
  await panel.getByRole('button', { name: 'Change password' }).click();
  await panel.getByLabel('Current password').fill('first-password-1');
  await panel.getByLabel('New password').fill('second-password-1');
  await panel.getByRole('button', { name: 'Save new password' }).click();
  await expect.poll(async () => bcrypt.compare('second-password-1', await passwordOf(db, email))).toBe(true);

  // This device stays signed in (the app reloads with the new session).
  await expect(page.getByRole('dialog', { name: 'Account' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/parent\/home$/);
  await page.reload();
  await expect(page).toHaveURL(/\/parent\/home$/);
  // The new password works from now on.
  await (await openAccount(page)).getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/sign-in');
  await signInWith(page, email, 'second-password-1');
});
