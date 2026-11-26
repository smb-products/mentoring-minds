import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { main } from './support/ui';

/**
 * S10: the layout reads a parent's status once per full load. When Vienne pauses a parent who is signed in,
 * the first refused read or write re-reads it (no reload): the paused notice and the locked pages. Vienne and
 * active parents make no extra requests while moving around.
 */
requires('families', 'dashboard', 'scheduling', 'assignments');

const PAUSED = 'Your account is paused. Message Vienne to turn it back on.';
const LOCKED = 'This opens again when Vienne turns your account back on.';

/** A rail (desktop) or bottom-bar (phone) link. Its badge count can come first ("2 Learning"). */
const nav = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^(\\d+ ?)?${name}`) }).first();

async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

/**
 * Full page loads, and the in-app page requests that aren't prefetches (navigations and refreshes),
 * as paths. A marker on window proves the page was never reloaded.
 */
async function watchLoads(page: Page) {
  const documents: string[] = [];
  const pages: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'document') documents.push(new URL(r.url()).pathname);
    const h = r.headers();
    if (r.method() === 'GET' && h.rsc === '1' && !Object.keys(h).some((k) => k.includes('prefetch'))) pages.push(new URL(r.url()).pathname);
  });
  await page.evaluate(() => Object.assign(window, { __s10: 'same page' }));
  return {
    documents,
    pages,
    notReloaded: async () => expect(await page.evaluate(() => (window as unknown as { __s10?: string }).__s10)).toBe('same page'),
  };
}

async function expectPaused(page: Page, where: string) {
  await expect(page.getByRole('status').filter({ hasText: PAUSED }), where).toBeVisible();
  await expect(main(page).getByText(LOCKED), where).toBeVisible();
  await settled(page);
  await expect(main(page), where).not.toContainText('Sofia');
  await expect(page.getByRole('button', { name: /Request a session|Fill in answers|Join call/ }), where).toHaveCount(0);
  await expect(page.getByText('This page couldn’t load'), where).toHaveCount(0);
}

test.afterEach(async ({ db }) => {
  await db.user.updateMany({ where: { id: { in: ['u_daniel', 'u_grace'] } }, data: { status: 'ACTIVE' } });
});

test('Vienne pauses Daniel while he is signed in: his next page is the paused one, without a reload; back on after a reload @phone', async ({ page, as, db, browser, errors }) => {
  await as('daniel');
  await page.goto('/parent/home');
  await settled(page);
  await expect(main(page)).toContainText('Sofia');
  const loads = await watchLoads(page);

  const vienne = await openAs(browser, 'vienne');
  await vienne.page.goto('/admin/families/u_daniel');
  await vienne.page.getByRole('button', { name: 'Pause' }).click();
  await expect(main(vienne.page).getByRole('button', { name: 'Make active' })).toBeVisible();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).status).toBe('PAUSED');

  // Learning's reads are refused: the shell re-reads the account and the locked page takes over.
  // (Not Sessions first: its read, scheduling.listSessions, isn't refused for a paused parent. See the S10 report.)
  await nav(page, 'Learning').click();
  await expect(page).toHaveURL(/\/parent\/learning$/);
  await expectPaused(page, 'learning');
  // Moving on keeps the locked pages, still without a reload.
  await nav(page, 'Sessions').click();
  await expect(page).toHaveURL(/\/parent\/sessions$/);
  await expectPaused(page, 'sessions');
  await nav(page, 'Home').click();
  await expect(page).toHaveURL(/\/parent\/home$/);
  await expectPaused(page, 'home');
  await loads.notReloaded();
  // One refresh, on the first refused page; the locked pages after it make no more.
  expect(loads.pages.filter((p) => p === '/parent/learning')).toHaveLength(2);
  expect(new Set(loads.pages).size).toBe(loads.pages.length - 1);
  expect(loads.documents).toEqual([]);
  expect(errors.filter((e) => e.startsWith('page error:'))).toEqual([]);

  // Vienne turns him back on: the next load shows the normal pages again.
  await vienne.page.getByRole('button', { name: 'Make active' }).click();
  await expect.poll(async () => (await db.user.findUniqueOrThrow({ where: { id: 'u_daniel' } })).status).toBe('ACTIVE');
  await nav(page, 'Sessions').click();
  await expect(page).toHaveURL(/\/parent\/sessions$/);
  await page.reload();
  await settled(page);
  await expect(page.getByRole('button', { name: 'Request a session' }).first()).toBeVisible();
  await expect(page.getByText(PAUSED)).toHaveCount(0);
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
  expect(vienne.errors).toEqual([]);
  await vienne.close();
});

test('paused with the request drawer open: “Send request” is refused and the paused page replaces it', async ({ page, as, db }) => {
  const before = await db.session.count({ where: { requestedById: 'u_grace' } });
  await as('grace');
  await page.goto('/parent/sessions');
  await settled(page);
  const loads = await watchLoads(page);
  await page.getByRole('button', { name: 'Request a session' }).first().click();
  const drawer = page.getByRole('dialog', { name: /Request a session/ });
  await drawer.getByRole('radio', { name: '45 min' }).click();
  await drawer.getByRole('radiogroup', { name: 'How' }).getByRole('radio', { name: 'Video call' }).click();
  await drawer.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(1).click();
  await drawer.getByRole('radiogroup', { name: /times$/ }).first().getByRole('radio').first().click();

  await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
  await drawer.getByRole('button', { name: 'Send request' }).click();
  await expectPaused(page, 'after the refused request');
  await expect(drawer).toHaveCount(0);
  await loads.notReloaded();
  expect(loads.documents).toEqual([]);
  expect(await db.session.count({ where: { requestedById: 'u_grace' } })).toBe(before);
});

for (const who of ['vienne', 'ana'] as const) {
  const routes = who === 'vienne' ? ['Families', 'Schedule', 'Today'] : ['Sessions', 'Learning', 'Progress', 'Home'];
  test(`${who === 'vienne' ? 'Vienne' : 'an active parent'} moving around makes no extra requests and sees no change`, async ({ page, as }) => {
    await as(who);
    await page.goto(who === 'vienne' ? '/admin/today' : '/parent/home');
    await settled(page);
    const loads = await watchLoads(page);
    for (const name of routes) {
      await nav(page, name).click();
      await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
      await settled(page);
      await expect(page.getByText(PAUSED)).toHaveCount(0);
      await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
    }
    await loads.notReloaded();
    expect(loads.documents).toEqual([]);
    // At most one page request per navigation, and never a second one (a refresh) for the same page.
    expect(loads.pages.length).toBeLessThanOrEqual(routes.length);
    expect(new Set(loads.pages).size).toBe(loads.pages.length);
  });
}
