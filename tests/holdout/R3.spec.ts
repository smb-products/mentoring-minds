/**
 * R3 holdouts: Vienne's restyled screens stay hers, and they hold up with nothing in them. A parent, a preview
 * parent and a signed-out visitor who open them get none of her data; with no sessions or homework the stat
 * row still sits on the page below the page header.
 */
import type { Page } from '@playwright/test';
import { expect, freshData, openAs, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

freshData();

async function settle(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

function record(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (/json|html|x-component|text\/plain/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

test('Vienne’s restyled screens give another person none of her data', async ({ browser, page, db }) => {
  await db.student.updateMany({ data: { adminNotes: 'HOLDOUT-ADMIN-NOTE' } });
  const assignment = await db.assignment.findFirstOrThrow({ where: { kind: 'BOOK' } });
  const paths = [
    '/admin/today', '/admin/families', '/admin/families/u_grace', '/admin/assignments', `/admin/assignments/${assignment.id}`,
    '/admin/content', '/admin/content/book/book_g3/M1', '/admin/schedule', '/admin/messages/conv_grace', '/admin/settings',
  ];

  for (const [who, others] of [['ana', /Noah|Sofia|Grace Kim/], ['tom', /Noah|Sofia|Mateo|Lucia|Grace Kim|Mendoza/]] as const) {
    const s = await openAs(browser, who);
    const downloaded = record(s.page);
    for (const path of paths) {
      await settle(s.page, path);
      await expect(s.page, `${who} ${path}`).toHaveURL(/\/parent\/home$/);
      await expect(s.page.getByRole('heading', { level: 1 })).toHaveCount(1);
    }
    const all = await downloaded();
    expect(all, who).not.toMatch(/HOLDOUT-ADMIN-NOTE/);
    expect(all, who).not.toMatch(others);
    expect(s.errors).toEqual([]);
    await s.close();
  }

  const downloaded = record(page);
  for (const path of paths) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in$/);
  }
  await page.waitForLoadState('networkidle');
  expect(await downloaded()).not.toMatch(/HOLDOUT-ADMIN-NOTE|Mateo|Lucia|Noah|Sofia|Grace Kim|Mendoza/);
});

test('with no sessions or homework, Vienne’s stat rows sit below the band and nothing breaks', async ({ page, as, db }) => {
  await db.session.deleteMany({});
  await db.submission.deleteMany({});
  await as('vienne');

  for (const url of ['/admin/today', '/admin/families', '/admin/assignments', '/admin/content']) {
    await settle(page, url);
    const band = page.locator('header', { has: page.getByRole('heading', { level: 1 }) }).first();
    const stats = main(page).getByRole('region', { name: 'Key numbers' });
    await expect(stats, url).toBeVisible();
    const b = (await band.boundingBox())!;
    const s = (await stats.boundingBox())!;
    expect(s.y, `${url}: the stat row is on the band`).toBeGreaterThanOrEqual(b.y + b.height);
    await expect(band.getByRole('region', { name: 'Key numbers' }), url).toHaveCount(0);
    // "About 120px" where the page header has no tabs (P1: the header holding the h1, no navy band).
    if ((await band.getByRole('tablist').count()) === 0) expect(b.height, `${url}: band height`).toBeLessThanOrEqual(130);
    expect(await main(page).innerText(), url).not.toMatch(/undefined|NaN|\bnull\b|Invalid Date/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${url} scrolls sideways`).toBe(true);
  }

  await settle(page, '/admin/today');
  await expect(main(page)).toContainText('Nothing booked today');
  await expect(main(page)).toContainText('No requests waiting');
  await expect(main(page)).toContainText('All caught up');
  await settle(page, '/admin/assignments');
  await page.getByRole('tab', { name: /^To check/ }).click();
  await expect(main(page)).toContainText('Nothing to check');
});
