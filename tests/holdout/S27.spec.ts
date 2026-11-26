import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

/**
 * S27 holdout: no way to delete is offered on ANY family's page (no children, one child, preview, paused),
 * not after the page redraws or on a phone, and not to anyone else who types the address.
 */
requires('families', 'messages');

/** Nothing that offers a delete: no button, link or menu item, shown or hidden, and no open drawer. */
async function noDelete(page: Page, where: string) {
  for (const role of ['button', 'link', 'menuitem'] as const) {
    await expect(page.getByRole(role, { name: /delete/i, includeHidden: true }), `${where}: ${role}`).toHaveCount(0);
  }
  await expect(page.locator('[aria-label*="delete" i]'), where).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: /delete/i }), where).toHaveCount(0);
}

test('every demo family, whatever its status or number of children: no Delete, and the other buttons stay', async ({ page, as, db }) => {
  test.setTimeout(150_000);
  await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
  const families = await db.user.findMany({ where: { role: 'PARENT' }, include: { students: true }, orderBy: { id: 'asc' } });
  // The cases that matter are really in the data.
  expect(families.some((f) => f.students.length === 0)).toBe(true);
  expect(families.some((f) => f.students.length === 1)).toBe(true);
  expect(families.some((f) => f.status === 'PREVIEW')).toBe(true);

  await as('vienne');
  for (const family of families) {
    await page.goto(`/admin/families/${family.id}`);
    const m = main(page);
    await expect(m.getByRole('heading', { name: family.name!, exact: true }), family.id).toBeVisible();
    await expect(m.getByRole('button', { name: 'Reset password' }), family.id).toBeVisible();
    await expect(m.getByRole('button', { name: family.status === 'ACTIVE' ? 'Pause' : 'Make active', exact: true }), family.id).toBeVisible();
    await expect(m.getByRole('button', { name: 'New report' }), family.id).toHaveCount(family.students.length);
    if (family.students.length === 0) await expect(m.getByText('No children on this account yet')).toBeVisible();
    await noDelete(page, family.id);
  }
});

test('on a phone-sized screen, and after pausing and reactivating, Delete never comes back', async ({ page, as }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await as('vienne');
  await page.goto('/admin/families/u_ana');
  const m = main(page);
  await expect(m.getByRole('heading', { name: 'Lucia Mendoza' })).toBeVisible();
  await noDelete(page, 'phone');

  await m.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(m.getByRole('button', { name: 'Make active', exact: true })).toBeVisible();
  await noDelete(page, 'paused');
  await m.getByRole('button', { name: 'Make active', exact: true }).click();
  await expect(m.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await noDelete(page, 'active again');

  // Editing a child's private note redraws that card with its Save button, and still no Delete.
  await m.getByRole('textbox', { name: /Private notes/ }).first().fill('Demo note, not saved.');
  await expect(m.getByRole('button', { name: 'Save notes' })).toBeVisible();
  await noDelete(page, 'editing a note');
});

test('another parent, a preview parent and a signed-out visitor get neither Grace’s family page nor a Delete', async ({ browser, page }) => {
  const privateOnPage = ['Reset password', 'Private notes', 'Only you see these'];
  const refused = async (p: Page, who: string) => {
    await p.goto('/admin/families/u_grace');
    await expect(p, who).not.toHaveURL(/\/admin\//);
    await p.waitForLoadState('networkidle');
    for (const text of [...privateOnPage, 'Noah']) await expect(p.locator('body'), `${who}: ${text}`).not.toContainText(text);
    await noDelete(p, who);
  };

  for (const who of ['ana', 'tom'] as const) {
    const other = await openAs(browser, who);
    await refused(other.page, who);
    expect(other.errors, `${who}’s browser logged errors`).toEqual([]);
    await other.close();
  }
  await refused(page, 'signed out');
  await expect(page).toHaveURL(/\/sign-in/);
});
