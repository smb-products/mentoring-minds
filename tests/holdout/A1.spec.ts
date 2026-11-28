/**
 * A1 holdouts: the new auth layout lets nobody past it and gives nothing away. A parent who must choose a new
 * password sees no family data at any address and gets through only with the right temporary one (on a phone);
 * wrong input reads the same whether or not the account exists; everyone signed in still goes home.
 */
import type { Locator, Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../prisma/data';
import { expect, freshData, openAs, signIn, test, USERS } from '../e2e/support/fixtures';

freshData();

// The forced screen knows who is signed in (Ana), so her own name isn't in this list.
const FAMILY = /Mateo|Lucia|Noah|Sofia|Grace Kim|HOLDOUT-ADMIN-NOTE/;
const box = async (l: Locator) => (await l.boundingBox())!;
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('on a phone, the forced new-password screen holds at every address until the right temporary password goes in', async ({ page, db }) => {
  await page.setViewportSize({ width: 412, height: 839 });
  await db.student.updateMany({ data: { adminNotes: 'HOLDOUT-ADMIN-NOTE' } });
  const before = await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } });
  await db.user.update({ where: { id: 'u_ana' }, data: { mustChangePassword: true } });
  try {
    await signIn(page, 'ana');
    for (const url of ['/parent/home', '/parent/messages', '/parent/sessions','/parent/learning', '/admin/today', '/sign-in']) {
      await page.goto(url);
      await expect(page.getByRole('button', { name: 'Save new password' }), url).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('navigation', { name: 'Main navigation' }), url).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(Account|Notifications)/ }), url).toHaveCount(0);
      expect(await page.content(), url).not.toMatch(FAMILY);
    }

    // Stacked: logo and headline above the form, no feature rows, a full-width button, 16px fields.
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveText('Welcome back. Your child’s math, all in one place.');
    await expect(page.getByText('Book and manage sessions')).toBeHidden();
    const temp = page.getByLabel('Temporary password');
    const fresh = page.getByLabel('New password');
    const save = page.getByRole('button', { name: 'Save new password' });
    const headline = await box(h1);
    const title = await box(page.getByRole('heading', { level: 2, name: 'Choose a new password' }));
    expect(headline.y + headline.height).toBeLessThanOrEqual(title.y);
    expect(Math.round((await box(save)).width)).toBe(Math.round((await box(temp)).width));
    for (const field of [temp, fresh]) expect(await field.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    expect(await fits(page)).toBe(true);

    // Nothing typed, or too short: nothing to send.
    await expect(save).toBeDisabled();
    await fresh.fill('short');
    await expect(save).toBeDisabled();

    // The wrong temporary password, and the temporary one again, are both refused.
    const alert = page.getByRole('alert').filter({ hasText: /\S/ });
    await temp.fill('not-the-temporary-one');
    await fresh.fill('a-brand-new-password-1');
    await save.click();
    await expect(alert).toHaveText(['Your current password isn’t right.']);
    await temp.fill(DEMO_PASSWORD);
    await fresh.fill(DEMO_PASSWORD);
    await save.click();
    await expect(alert).toHaveText(['Choose a password that’s different from the current one']);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).mustChangePassword).toBe(true);

    await fresh.fill('a-brand-new-password-1');
    await save.click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(save).toHaveCount(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } })).mustChangePassword).toBe(false);
  } finally {
    await db.user.update({ where: { id: 'u_ana' }, data: { mustChangePassword: false, passwordHash: before.passwordHash, failedLogins: 0 } });
  }
});

test('wrong input on a 320px phone: one message whether or not the account exists, nothing leaks, nothing scrolls sideways', async ({ page, db }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/sign-in');
  expect(await page.content()).not.toMatch(FAMILY);
  expect(await page.content()).not.toMatch(/@example\.com|Ana Mendoza/);
  expect(await fits(page)).toBe(true);

  const email = page.getByLabel('Email', { exact: true });
  const password = page.getByLabel('Password');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  const alert = page.getByRole('alert').filter({ hasText: /\S/ });
  const nobody = `nobody-${'x'.repeat(48)}@example.com`;
  const messages: string[] = [];
  for (const who of [USERS.grace, nobody]) {
    await email.fill(who);
    await password.fill('wrong-password-1');
    const done = page.waitForResponse((r) => r.request().method() === 'POST');
    await submit.click();
    await (await done).finished();
    await expect(submit).toBeEnabled();
    await expect(alert).toHaveCount(1);
    messages.push(await alert.innerText());
    await expect(email).toHaveValue(who);
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await fits(page), who).toBe(true);
  }
  expect(messages[0]).toBe('That email and password don’t match. After 5 tries, password sign-in pauses for 15 minutes.');
  expect(messages[1]).toBe(messages[0]);

  // Enter in the password field signs in; it doesn't press Show.
  await password.fill('wrong-password-2');
  await password.press('Enter');
  await expect(submit).toBeEnabled();
  await expect(password).toHaveAttribute('type', 'password');

  // Creating an account over someone else's email is refused, in the same words as before.
  const before = await db.user.count();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(alert).toHaveCount(0);
  await page.getByLabel('Your name').fill('Somebody Else');
  await email.fill(USERS.ana.toUpperCase());
  await password.fill('another-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(alert).toHaveText(['There’s already an account with that email. Sign in instead.']);
  await expect(page.getByLabel('Your name')).toHaveValue('Somebody Else');
  expect(await db.user.count()).toBe(before);
  expect(await fits(page)).toBe(true);
});

test('another parent, a preview parent and Vienne each still leave /sign-in for their own home', async ({ browser }) => {
  for (const [who, home] of [['grace', '/parent/home'], ['tom', '/parent/home'], ['vienne', '/admin/today']] as const) {
    const s = await openAs(browser, who);
    await s.page.goto('/sign-in');
    await s.page.waitForURL(`**${home}`);
    await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(s.page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
    await s.page.waitForLoadState('networkidle');
    expect(s.errors, who).toEqual([]);
    await s.close();
  }
});
