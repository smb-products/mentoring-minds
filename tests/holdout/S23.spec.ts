import type { Browser, Page } from '@playwright/test';
import { expect, openAs, requires, test } from '../e2e/support/fixtures';
import { chooseChild, main } from '../e2e/support/ui';

/**
 * S23 holdout: a demo child and a demo family, with all their records, are deleted while the parent is
 * still signed in on another phone. Nothing about them stays on screen, and neither browser logs an error.
 */
requires('families', 'messages');

/** Vienne's family page: the first ask, then the name typed out. */
async function confirmDelete(page: Page, open: string, name: string, finish: string) {
  await page.getByRole('button', { name: open, exact: true }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Continue' }).click();
  await drawer.getByRole('textbox').fill(name);
  await drawer.getByRole('button', { name: finish, exact: true }).click();
  await expect(drawer).toHaveCount(0);
}

/** Loads a screen and waits for it to finish asking the server for things. */
async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).not.toBeEmpty();
}

const parentPhone = (browser: Browser, who: 'ana' | 'keisha') => openAs(browser, who);

// S27 hides Delete until S23b lands (Javaris, 2026-11-26). S23b turns this back on: remove `.fixme`.
test.fixme('Lucia is deleted: gone from Vienne’s screens, and from Ana’s phone even though she had Lucia picked', async ({ page, as, browser }) => {
  const ana = await parentPhone(browser, 'ana');
  await visit(ana.page, '/parent/progress');
  await chooseChild(ana.page, 'Lucia');

  await as('vienne');
  await page.goto('/admin/families/u_ana');
  await confirmDelete(page, 'Delete Lucia Mendoza', 'Lucia Mendoza', 'Delete Lucia');
  await expect(main(page).getByRole('heading', { name: 'Mateo Mendoza' })).toBeVisible();
  await expect(main(page)).not.toContainText('Lucia');

  for (const path of ['/admin/today', '/admin/schedule', '/admin/families', '/admin/assignments', '/admin/content']) {
    await visit(page, path);
    await expect(main(page), path).not.toContainText('Lucia');
  }
  await page.getByRole('button', { name: /Alerts/ }).click();
  const alerts = page.getByRole('dialog', { name: 'Notifications' });
  await expect(alerts).toBeVisible();
  await expect(alerts).not.toContainText('Lucia');

  for (const path of ['/parent/progress', '/parent/home', '/parent/learning', '/parent/sessions']) {
    await visit(ana.page, path);
    await expect(main(ana.page), path).toContainText(/\S/);
    await expect(main(ana.page), path).not.toContainText('Lucia');
  }
  expect(ana.errors, 'Ana’s browser logged errors').toEqual([]);
  await ana.close();
});

// S27 hides Delete until S23b lands (Javaris, 2026-11-26). S23b turns this back on: remove `.fixme`.
test.fixme('Jordan, an only child, is deleted, then the family: an empty state, and Keisha’s open phone goes to sign-in', async ({ page, as, browser }) => {
  const keisha = await parentPhone(browser, 'keisha');
  await visit(keisha.page, '/parent/home');

  await as('vienne');
  await page.goto('/admin/families/u_keisha');
  await confirmDelete(page, 'Delete Jordan Brooks', 'Jordan Brooks', 'Delete Jordan');
  await expect(main(page)).toContainText('No children on this account yet');
  await expect(main(page)).not.toContainText('Jordan');

  await confirmDelete(page, 'Delete family', 'Keisha Brooks', 'Delete family');
  await page.waitForURL('**/admin/families');
  await expect(main(page).getByText('Ana Mendoza').first()).toBeVisible();
  await expect(main(page)).not.toContainText('Keisha');
  await page.getByRole('tab', { name: /Invite codes/ }).click();
  await expect(main(page)).toContainText('Codes are single-use');
  await expect(main(page)).not.toContainText('Keisha');
  await expect(main(page)).not.toContainText('Jordan');

  await keisha.page.goto('/parent/home');
  await expect(keisha.page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
  await expect(keisha.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(keisha.page.locator('body')).not.toContainText('Jordan');
  expect(keisha.errors, 'Keisha’s browser logged errors').toEqual([]);
  await keisha.close();
});
