import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { expectToast, main, openAlerts } from './support/ui';

/**
 * J2, open sign-up (plan/specs/S36.md): no invite code is needed. A new parent is ACTIVE, adds their children on the
 * "Add your child" step, and lands on Home. A code is optional: typed at sign-up, or on the step, it joins the family
 * Vienne made. Vienne hears about a family that joined without a code, by count, never by a child's name.
 */
requires('families', 'invites', 'scheduling', 'dashboard', 'notifications');

const PASSWORD = 'family-password-1';
const NOT_VALID = 'That code isn’t valid. Check it with Vienne.';
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Create account mode, opened straight from /sign-in?mode=new (the landing page's Get started). */
async function signUp(page: Page, name: string, email: string, code?: string) {
  await page.goto('/sign-in?mode=new');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByText('Have a code from Vienne? Enter it to join your family.')).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  if (code) await page.getByLabel('Invite code (optional)').fill(code);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/parent/home');
}

const step = (page: Page) => page.getByRole('heading', { name: 'Add your child' });

/** Vienne makes an invite code for a family, as on W2's walk. Returns the code. */
async function inviteFamily(page: Page, parentName: string, child: string, grade: string) {
  await page.goto('/admin/families');
  await page.getByRole('button', { name: 'Invite family' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Invite a family/ });
  await dialog.getByLabel('Parent’s name').fill(parentName);
  await dialog.getByLabel('First name').fill(child);
  await dialog.getByLabel('Grade').selectOption(grade);
  await dialog.getByRole('button', { name: 'Create code' }).click();
  const ready = page.getByRole('dialog', { name: /Invite ready/ });
  const code = (await ready.getByText(/^MM-[A-Z0-9]{4}$/).textContent())!.trim();
  await ready.getByRole('button', { name: 'Done' }).click();
  return code;
}

test('no code: a new parent adds two children, lands on Home, books a request, and Vienne hears by count', async ({ page, db, browser }) => {
  await signUp(page, 'Marisol Vega', 'marisol.vega@example.com');
  const made = await db.user.findUniqueOrThrow({ where: { email: 'marisol.vega@example.com' } });
  expect(made).toMatchObject({ role: 'PARENT', status: 'ACTIVE' });

  // The step comes before the app, in the auth screens' split layout, with the code form under it.
  await expect(step(page)).toBeVisible();
  await expect(page.locator('[data-auth-panel]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
  await expect(page.getByText('Have an invite code?')).toBeVisible();
  await expect(page.getByText('Enter your invite code')).toBeVisible();
  await expect(page.getByLabel('Invite code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();

  const grade = page.getByLabel('Grade');
  await expect(grade.first().locator('option')).toHaveText(['–', 'K', '1', '2', '3', '4', '5', '6']);
  await page.getByLabel('Child’s first name').first().fill('Zuri');
  await grade.first().selectOption('K');
  await page.getByRole('button', { name: 'Add another child' }).click();
  await page.getByLabel('Child’s first name').nth(1).fill('Tobias');
  await grade.nth(1).selectOption('4');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Home, with both children in the switcher.
  await page.waitForURL('**/parent/home');
  const switcher = page.getByRole('tablist', { name: 'Choose a child' }).first();
  await expect(switcher.getByRole('tab', { name: /^Zuri/ })).toBeVisible();
  await expect(switcher.getByRole('tab', { name: /^Tobias/ })).toBeVisible();
  await expect(step(page)).toHaveCount(0);
  const user = await db.user.findUniqueOrThrow({ where: { id: made.id }, include: { students: { orderBy: { createdAt: 'asc' } } } });
  expect(user.status).toBe('ACTIVE');
  expect(user.students.map((s) => [s.firstName, s.grade])).toEqual([['Zuri', 0], ['Tobias', 4]]);

  // An ACTIVE parent never meets an invite-code gate.
  for (const path of ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/messages']) {
    await page.goto(path);
    await expect(main(page), path).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Enter your invite code/), path).toHaveCount(0);
  }

  // A session request, waiting on Vienne.
  await page.goto('/parent/sessions');
  await page.getByRole('button', { name: 'Request a session' }).first().click();
  const drawer = page.getByRole('dialog', { name: /Request a session/ });
  await drawer.getByRole('radio', { name: '45 min' }).click();
  await drawer.getByRole('radiogroup', { name: 'How' }).getByRole('radio', { name: 'Video call' }).click();
  await drawer.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(1).click();
  await drawer.getByRole('radiogroup', { name: /times$/ }).first().getByRole('radio').first().click();
  await drawer.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => db.session.count({ where: { requestedById: made.id, status: 'REQUESTED' } })).toBe(1);
  await expect(main(page).getByText('Waiting on Vienne')).toBeVisible();

  // Vienne's alert names the family and the count, never a child.
  const vienne = await openAs(browser, 'vienne');
  try {
    await vienne.page.goto('/admin/today');
    const alerts = await openAlerts(vienne.page);
    const title = alerts.getByText('New family joined: Marisol Vega');
    await expect(title).toBeVisible();
    // The alert itself (title and body). Her session request's own alert names the child, as it always has.
    const joinedAlert = title.locator('xpath=..');
    await expect(joinedAlert).toContainText('2 children added. They signed up without an invite code.');
    await expect(joinedAlert).not.toContainText('Zuri');
    await expect(joinedAlert).not.toContainText('Tobias');
    const joined = await db.notification.findMany({ where: { type: 'FAMILY_JOINED' } });
    expect(joined.length).toBeGreaterThan(0);
    expect(JSON.stringify(joined)).not.toMatch(/Zuri|Tobias/);
    expect(vienne.errors).toEqual([]);
  } finally {
    await vienne.close();
  }
});

test('a valid code at sign-up joins the family Vienne made', async ({ page, db, browser }) => {
  const vienne = await openAs(browser, 'vienne');
  let code: string;
  try {
    code = await inviteFamily(vienne.page, 'Paula Ortiz', 'Camila', '3');
    expect(vienne.errors).toEqual([]);
  } finally {
    await vienne.close();
  }

  await signUp(page, 'Paula Ortiz', 'paula.ortiz@example.com', code);
  await expect(main(page)).toContainText('Camila');
  await expect(step(page)).toHaveCount(0);
  await expect(page.getByText(/Enter your invite code/)).toHaveCount(0);
  const user = await db.user.findUniqueOrThrow({ where: { email: 'paula.ortiz@example.com' }, include: { students: true } });
  expect(user.status).toBe('ACTIVE');
  expect(user.students.map((s) => [s.firstName, s.grade])).toEqual([['Camila', 3]]);
  expect((await db.invite.findFirstOrThrow({ where: { parentName: 'Paula Ortiz' } })).usedAt).not.toBeNull();
});

test('an invalid code at sign-up says so on the Add your child step', async ({ page, db }) => {
  await signUp(page, 'Iris Baker', 'iris.baker@example.com', 'MM-0000');
  await expect(step(page)).toBeVisible();
  await expect(page.getByText(NOT_VALID)).toBeVisible();
  // The code form is still there to try again, and so is adding a child.
  await expect(page.getByLabel('Invite code')).toBeVisible();
  await expect(page.getByLabel('Child’s first name')).toBeVisible();
  const user = await db.user.findUniqueOrThrow({ where: { email: 'iris.baker@example.com' }, include: { students: true } });
  expect([user.status, user.students.length]).toEqual(['ACTIVE', 0]);

  // A reload doesn't try the code again: it was kept only until the step read it.
  await page.reload();
  await expect(step(page)).toBeVisible();
  await expect(page.getByText(NOT_VALID)).toHaveCount(0);

  // No account menu yet, so the step has its own way out.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('the Add your child step fits a phone, up to six children @phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The phone layout.');
  await signUp(page, 'Nadia Cole', 'nadia.cole@example.com');
  await expect(step(page)).toBeVisible();
  expect(await noSidewaysScroll(page)).toBe(true);

  const more = page.getByRole('button', { name: 'Add another child' });
  for (let n = 2; n <= 6; n++) await more.click();
  await expect(page.getByLabel('Child’s first name')).toHaveCount(6);
  await expect(more).toHaveCount(0); // MAX_CHILDREN_AT_SIGNUP
  expect(await noSidewaysScroll(page)).toBe(true);
  const form = await page.locator('[data-auth-form]').boundingBox();
  const continueButton = await page.getByRole('button', { name: 'Continue' }).boundingBox();
  expect(Math.round(continueButton!.width)).toBe(Math.round(form!.width));
});
