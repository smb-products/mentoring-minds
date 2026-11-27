import { expect, type Page } from '@playwright/test';

/** Shared ways to reach the app's controls, by what people see (labels and roles), not CSS. */

/** The account panel (desktop popover, phone drawer). */
export async function openAccount(page: Page) {
  await page.getByRole('button', { name: /^Account/ }).first().click();
  const panel = page.getByRole('dialog', { name: 'Account' });
  await expect(panel).toBeVisible();
  return panel;
}

/** Notifications (desktop: the Alerts rail button; phone: the bell). With unread alerts the rail button's name
 * starts with the count ("1 Alerts", since R1), so the count is allowed in front. */
export async function openAlerts(page: Page) {
  await page.getByRole('button', { name: /^(\d+\s*)?(Alerts|Notifications)\b/ }).first().click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel).toBeVisible();
  return panel;
}

/** A parent with more than one child picks one. */
export async function chooseChild(page: Page, firstName: string) {
  const tab = page.getByRole('tablist', { name: 'Choose a child' }).getByRole('tab', { name: new RegExp(`^${firstName}`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** The toast area. Success and error toasts both appear here. */
export const toasts = (page: Page) => page.locator('[aria-live=polite]');

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(toasts(page).getByText(text).first()).toBeVisible();
}

/** The page's main content (no navigation). */
export const main = (page: Page) => page.locator('main');
