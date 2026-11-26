/** W2 holdout on screen: a real sign-up can walk every parent page, before and after the code, and sees no other family. */
import { expect, requires, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

requires('families', 'invites');

// Messages is W3's screen, so it isn't part of this walk.
const PAGES = ['home', 'learning', 'progress', 'sessions'];
const OTHERS = /Mateo|Lucia|Noah|Sofia|Jordan|Ana Mendoza|Grace Kim|Daniel Reyes/;

test('a new parent sees an empty, private app: wrong codes stay locked out', async ({ page, db }) => {
  test.setTimeout(90_000);
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Rosa Holdout');
  await page.getByLabel('Email').fill('rosa.holdout@example.com');
  await page.getByLabel('Password').fill('rosa-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/parent/home');

  for (const name of PAGES) {
    await page.goto(`/parent/${name}`);
    await expect(main(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body'), name).not.toContainText(OTHERS);
  }

  await page.goto('/parent/home');
  await page.getByLabel('Invite code').fill('<b>nope</b>');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('That code isn’t valid. Check it with Vienne.')).toBeVisible();
  await expect(page.getByText('Enter your invite code')).toBeVisible();
  const user = await db.user.findUniqueOrThrow({ where: { email: 'rosa.holdout@example.com' }, include: { students: true } });
  expect([user.status, user.students.length]).toEqual(['PREVIEW', 0]);
});
