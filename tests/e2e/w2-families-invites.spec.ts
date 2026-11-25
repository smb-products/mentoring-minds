import { expect, requires, test, watchErrors } from './support/fixtures';
import { main } from './support/ui';

/** W2: Families list and Family page; invite a family; redeem as a new parent; reset a password; pause. */
requires('families', 'invites');

test('Vienne invites a family; the new parent signs up, enters the code, and the app unlocks', async ({ page, as, db, browser }) => {
  await as('vienne');
  await page.goto('/admin/families');
  await page.getByRole('button', { name: 'Invite family' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Invite a family/ });
  await dialog.getByLabel('Parent’s name').fill('Rosa Diaz');
  await dialog.getByLabel('First name').fill('Pablo');
  await dialog.getByLabel('Grade').selectOption('4');
  await dialog.getByRole('button', { name: 'Create code' }).click();
  const ready = page.getByRole('dialog', { name: /Invite ready/ });
  const code = (await ready.getByText(/^MM-[A-Z0-9]{4}$/).textContent())!.trim();
  // Only a hash is stored: the code can't be read back from the database.
  const invite = await db.invite.findFirstOrThrow({ where: { parentName: 'Rosa Diaz' } });
  expect(JSON.stringify(invite)).not.toContain(code);
  await ready.getByRole('button', { name: 'Done' }).click();

  // Rosa, in her own browser.
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const rosa = { page: await context.newPage(), close: () => context.close() } as const;
  const rosaErrors = watchErrors(rosa.page);
  await rosa.page.goto('/sign-in');
  await rosa.page.getByRole('button', { name: 'Create an account' }).click();
  await rosa.page.getByLabel('Your name').fill('Rosa Diaz');
  await rosa.page.getByLabel('Email').fill('rosa@example.com');
  await rosa.page.getByLabel('Password').fill('rosa-password-1');
  await rosa.page.getByRole('button', { name: 'Create account' }).click();
  await rosa.page.waitForURL('**/parent/home');
  await expect(rosa.page.getByText('Enter your invite code')).toBeVisible();

  await rosa.page.getByLabel('Invite code').fill('MM-0000');
  await rosa.page.getByRole('button', { name: 'Unlock' }).click();
  await expect(rosa.page.getByText('That code isn’t valid. Check it with Vienne.')).toBeVisible();

  await rosa.page.getByLabel('Invite code').fill(code);
  await rosa.page.getByRole('button', { name: 'Unlock' }).click();
  await expect(rosa.page.getByText('Enter your invite code')).toBeHidden();
  await expect(main(rosa.page)).toContainText('Pablo');
  const user = await db.user.findUniqueOrThrow({ where: { email: 'rosa@example.com' }, include: { students: true } });
  expect(user.status).toBe('ACTIVE');
  expect(user.students.map((s) => [s.firstName, s.grade])).toEqual([['Pablo', 4]]);
  expect(rosaErrors).toEqual([]);
  await rosa.close();

  // The code is spent, and Vienne's list shows Rosa as active.
  await page.goto('/admin/families');
  await expect(main(page)).toContainText('Rosa Diaz');
  expect((await db.invite.findUniqueOrThrow({ where: { id: invite.id } })).usedAt).not.toBeNull();
});

test('Vienne resets a password: Daniel’s open session ends, the old password stops working, the temporary one works', async ({ page, as, browser }) => {
  // Daniel is signed in on his phone.
  const phone = await browser.newContext({ timezoneId: 'America/New_York' });
  const p = await phone.newPage();
  await p.goto('/sign-in');
  await p.locator('input[name=email]').fill('daniel.reyes@example.com');
  await p.locator('input[name=password]').fill('mentoring-demo-2026');
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL('**/parent/home');

  await as('vienne');
  await page.goto('/admin/families/u_daniel');
  await page.getByRole('button', { name: 'Reset password' }).click();
  const temporary = (await main(page).getByText(/^mm-[0-9a-f]{6}-[0-9a-f]{6}$/).textContent())!.trim();

  // His phone's session is over: the next screen asks him to sign in.
  await p.goto('/parent/learning');
  await expect(p).toHaveURL(/\/sign-in$/);
  await p.locator('input[name=email]').fill('daniel.reyes@example.com');
  await p.locator('input[name=password]').fill('mentoring-demo-2026');
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(p.locator('form p[role=alert]')).toHaveText(/don’t match/);
  await p.locator('input[name=password]').fill(temporary);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL('**/parent/home');
  await phone.close();
});

test('pausing a family takes effect right away, and Undo restores it', async ({ page, as, db }) => {
  await as('vienne');
  await page.goto('/admin/families/u_daniel');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).status).toBe('PAUSED');
  await expect(main(page).getByRole('button', { name: 'Make active' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).status).toBe('ACTIVE');
});

test('the families list can be searched @phone', async ({ page, as }) => {
  await as('vienne');
  await page.goto('/admin/families');
  await page.getByLabel('Search families').fill('Grace');
  await expect(main(page)).toContainText('Grace Kim');
  await expect(main(page)).not.toContainText('Ana Mendoza');
});

