/**
 * W0 holdouts: the wrong person (a brand-new sign-up the demo data has never heard of,
 * a preview parent with a bad code) and a forced password change reached by a deep link.
 */
import bcrypt from 'bcryptjs';
import { expect, requiresSignInWired, test } from '../e2e/support/fixtures';
import { main, openAccount } from '../e2e/support/ui';

requiresSignInWired();

const OTHER_FAMILIES = /Mateo|Lucia|Noah|Sofia|Jordan/;

test('a new sign-up the demo data doesn’t know gets a locked, empty shell of their own', async ({ page, db }) => {
  const email = `new-${Date.now()}@example.com`;
  await db.user.create({ data: { name: 'Rosa Diaz', email, role: 'PARENT', status: 'PREVIEW', passwordHash: await bcrypt.hash('brand-new-pass-1', 10) } });
  await page.goto('/sign-in');
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill('brand-new-pass-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/parent/home');
  await expect(page.getByText('Enter your invite code')).toBeVisible();
  const panel = await openAccount(page);
  await expect(panel).toContainText(email);
  await expect(panel).toContainText('Rosa Diaz');
  await expect(page.locator('body')).not.toContainText(OTHER_FAMILIES);
});

test('a wrong code keeps Tom locked; his code unlocks the app', async ({ page, as, db }) => {
  await as('tom');
  await page.goto('/parent/home');
  await page.getByLabel('Invite code').fill('MM-ZZZZ');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That code isn’t valid. Check it with Vienne.')).toBeVisible();
  await expect(page.getByText('Enter your invite code')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(OTHER_FAMILIES);
  expect((await db.user.findUniqueOrThrow({ where: { id: 'u_tom' } })).status).toBe('PREVIEW');

  await page.getByLabel('Invite code').fill('MM-4D8F');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: 'u_tom' } })).status).toBe('ACTIVE');
  await expect(page.getByText('Enter your invite code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Account/ }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(OTHER_FAMILIES);
});

test('after a reset, a deep link shows only the new-password form', async ({ page, as, db }) => {
  await db.user.update({ where: { id: 'u_grace' }, data: { mustChangePassword: true } });
  await as('grace');
  for (const path of ['/parent/messages', '/parent/progress', '/parent/sessions']) {
    await page.goto(path);
    await expect(page.getByText('Choose a new password')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Noah');
    await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
    await expect(main(page)).toHaveCount(0);
  }
  // Too short to be a password: it can't be sent.
  await page.getByLabel('Temporary password').fill('whatever-1');
  await page.getByLabel('New password').fill('short');
  await expect(page.getByRole('button', { name: 'Save new password' })).toBeDisabled();
});
