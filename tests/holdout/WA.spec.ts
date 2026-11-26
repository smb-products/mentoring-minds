/**
 * WA holdouts, seen from the screen (Content → Skills is live): a dropped connection or a
 * redeploy shows a plain message, and a failed refresh keeps what's already on screen.
 */
import type { Page, Route } from '@playwright/test';
import { expect, requires, test } from '../e2e/support/fixtures';
import { expectToast, main } from '../e2e/support/ui';

requires('taxonomy');

const isServerCall = (route: Route) => route.request().method() === 'POST' && Boolean(route.request().headers()['next-action']);

async function openSkills(page: Page) {
  await page.goto('/admin/content');
  await page.getByRole('tablist', { name: 'Content sections' }).getByRole('tab', { name: 'Skills' }).click();
  await expect(page.getByRole('button', { name: /^Archive / }).first()).toBeVisible();
}

async function addSkill(page: Page, name: string) {
  await page.getByLabel('New skill').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test('a dropped connection on save says so, keeps the page and saves nothing', async ({ page, as, db }) => {
  await as('vienne');
  await openSkills(page);
  await page.route('**/*', (route) => (isServerCall(route) ? route.abort('internetdisconnected') : route.fallback()));
  await addSkill(page, 'Dropped connection skill');
  await expectToast(page, 'We couldn’t reach the server. Check your connection and try again.');
  await expect(page.getByRole('button', { name: /^Archive / }).first()).toBeVisible();
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  expect(await db.skill.count({ where: { name: 'Dropped connection skill' } })).toBe(0);
});

test('a save after a redeploy asks for a reload', async ({ page, as }) => {
  await as('vienne');
  await openSkills(page);
  // What a newer deployment answers to an action id it doesn't have.
  await page.route('**/*', (route) =>
    isServerCall(route) ? route.fulfill({ status: 404, headers: { 'x-nextjs-action-not-found': '1', 'content-type': 'text/plain' }, body: 'Server action not found.' }) : route.fallback(),
  );
  await addSkill(page, 'Stale tab skill');
  await expectToast(page, 'The app was just updated. Reload the page to keep going.');
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
});

test('when the refresh after a save fails, the list stays on screen', async ({ page, as, db }) => {
  await as('vienne');
  await openSkills(page);
  const kept = await page.getByRole('button', { name: /^Archive / }).count();
  // The save gets through; every call after it is dropped.
  let sent = 0;
  let dropped = 0;
  await page.route('**/*', (route) => {
    if (!isServerCall(route)) return route.fallback();
    if (sent++ === 0) return route.fallback();
    dropped++;
    return route.abort('internetdisconnected');
  });
  await addSkill(page, 'Saved then offline');
  await expectToast(page, 'Skill added');
  await expect.poll(() => dropped).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /^Archive / })).toHaveCount(kept);
  await expect(main(page)).toContainText('Skills you teach');
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  expect(await db.skill.count({ where: { name: 'Saved then offline' } })).toBe(1);
});
