import { expect, requiresSignInWired, test } from './support/fixtures';
import { main, openAccount } from './support/ui';

/**
 * WIRING.md Step 1: the screens use the signed-in user, not the demo persona.
 * Runs as soon as any area is listed in LIVE.
 */
requiresSignInWired();

test('each parent sees their own family, not the demo persona @phone', async ({ page, as, context }) => {
  await as('grace');
  await page.goto('/parent/home');
  await expect(main(page)).toContainText('Noah');
  await expect(main(page)).not.toContainText('Mateo');
  await context.clearCookies();
  await as('ana');
  await page.goto('/parent/home');
  await expect(page.getByRole('tablist', { name: 'Choose a child' })).toContainText('Mateo');
  await expect(page.getByRole('tablist', { name: 'Choose a child' })).toContainText('Lucia');
});

test('the account panel shows who is signed in, with no demo switcher', async ({ page, as }) => {
  await as('grace');
  await page.goto('/parent/home');
  const panel = await openAccount(page);
  await expect(panel).toContainText('grace.kim@example.com');
  await expect(panel.getByRole('radiogroup', { name: 'Demo account' })).toHaveCount(0);
});

test('a text size choice is saved to the account and survives a reload', async ({ page, as, db }) => {
  await as('grace');
  await page.goto('/parent/home');
  const panel = await openAccount(page);
  await panel.getByRole('radio', { name: 'Larger' }).click();
  await expect(page.locator('#mm-root')).toHaveAttribute('data-text', 'XLARGE');
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { email: 'grace.kim@example.com' } })).textSize).toBe('XLARGE');
  await page.reload();
  await expect(page.locator('#mm-root')).toHaveAttribute('data-text', 'XLARGE');
});

test('Sign out ends the session @phone', async ({ page, as }) => {
  await as('ana');
  await page.goto('/parent/home');
  const panel = await openAccount(page);
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/sign-in');
  await page.goto('/parent/home');
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('a preview parent is asked for their invite code', async ({ page, as }) => {
  await as('tom');
  await page.goto('/parent/home');
  await expect(page.getByText('Enter your invite code')).toBeVisible();
  await expect(page.getByLabel('Invite code')).toBeVisible();
});
