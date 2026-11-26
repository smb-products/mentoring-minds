import type { Page, Route } from '@playwright/test';
import { DEMO_PASSWORD } from '../../prisma/data';
import { USERS, expect, requires, test, type Who } from './support/fixtures';
import { openAccount } from './support/ui';

/**
 * S24: signing out from the account menu shows no error and logs none, as Vienne or a parent and from any
 * screen, even while the screen's reads are still on their way. The `test` fixture fails on any console
 * error. To make the race certain, the screen's reads (server action POSTs) are held until sign-out has
 * started, then cut off (as when the connection drops) or sent on without the session (as once it ends).
 */
requires('families', 'dashboard', 'scheduling', 'assignments', 'messages', 'content', 'reports', 'notifications');

const SCREENS: Record<'vienne' | 'ana', string[]> = {
  vienne: ['/admin/today', '/admin/schedule', '/admin/families', '/admin/settings', '/admin/messages'],
  ana: ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/messages', '/parent/progress'],
};

const isAction = (route: Route) => route.request().method() === 'POST' && !!route.request().headers()['next-action'];

/** Holds the page's server action calls until release(). The sign-out call itself goes through. */
async function holdReads(page: Page) {
  const held: Route[] = [];
  let holding = true;
  await page.route('**/*', async (route) => {
    if (holding && isAction(route)) held.push(route);
    else await route.fallback();
  });
  return {
    held,
    /** Stop holding: new calls (signing out) go through. */
    stop: () => (holding = false),
    cut: () => Promise.all(held.splice(0).map((r) => r.abort('failed').catch(() => {}))),
    sessionGone: () =>
      Promise.all(
        held.splice(0).map((r) => {
          const headers = { ...r.request().headers() };
          delete headers.cookie;
          return r.continue({ headers }).catch(() => {});
        }),
      ),
  };
}

async function signOutMidRead(page: Page, path: string, release: 'cut' | 'sessionGone') {
  const reads = await holdReads(page);
  await page.goto(path);
  await expect.poll(() => reads.held.length, { message: `${path}: its reads are on their way` }).toBeGreaterThan(0);
  const panel = await openAccount(page);
  reads.stop();
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await reads[release]();
  await page.waitForURL('**/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  await expect(page.getByText(/couldn’t reach the server/)).toHaveCount(0);
}

for (const who of Object.keys(SCREENS) as (keyof typeof SCREENS & Who)[]) {
  for (const path of SCREENS[who]) {
    test(`${who} signs out from ${path} while its reads fail: no error shown or logged`, async ({ page, as }) => {
      await as(who);
      await signOutMidRead(page, path, 'cut');
    });
  }

  test(`${who} signs out while the screen's reads reach the server after the session ended: no error`, async ({ page, as }) => {
    await as(who);
    await signOutMidRead(page, SCREENS[who][0], 'sessionGone');
  });

  test(`${who} signs out from a settled screen: no error, and the app is locked`, async ({ page, as }) => {
    await as(who);
    await page.goto(SCREENS[who][1]);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    const panel = await openAccount(page);
    await panel.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');
    await page.goto(SCREENS[who][0]);
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}

test('when the sign-out call can’t reach the server, Vienne stays signed in and the screen carries on', async ({ page, as }) => {
  await as('vienne');
  await page.goto('/admin/families');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  const panel = await openAccount(page);
  await page.waitForLoadState('networkidle');
  let armed = true;
  await page.route('**/*', async (route) => {
    if (armed && isAction(route)) {
      armed = false; // the screen is settled: the next call is signing out
      await route.abort('failed');
    } else await route.fallback();
  });
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('[aria-live=polite]')).toContainText('We couldn’t reach the server. Check your connection and try again.');
  await expect(page).toHaveURL(/\/admin\/families$/);
  await expect(page.locator('main')).toContainText('Ana');
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
});

test('signing out mid-read, then signing in again in the same tab: the screens load as usual', async ({ page, as }) => {
  await as('vienne');
  await signOutMidRead(page, '/admin/today', 'cut');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.evaluate(() => Object.assign(window, { __s24: 'same tab' }));
  // Same tab, no reload: the sign-in form's redirect is an in-app navigation, back to the same address.
  await page.locator('input[name=email]').fill(USERS.vienne);
  await page.locator('input[name=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/admin/today');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('main')).toContainText(/Today/);
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  // Then Ana, in the same tab again.
  await openAccount(page).then((panel) => panel.getByRole('button', { name: 'Sign out' }).click());
  await page.waitForURL('**/sign-in');
  await page.locator('input[name=email]').fill(USERS.ana);
  await page.locator('input[name=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/parent/home');
  await expect(page.locator('main')).toContainText('Mateo');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as unknown as { __s24?: string }).__s24), 'never reloaded').toBe('same tab');
});
