import { expect, openAs, requires, test } from './support/fixtures';
import { chooseChild, expectToast, main } from './support/ui';

/** W7: progress reports; Today and parent Home. (The AI helpers were removed in S33.) */
requires('reports', 'dashboard', 'scheduling', 'families');

test.describe('progress reports', () => {
  test('Vienne writes a report; Ana can’t see the draft; once published, Ana is told and can read it', async ({ page, as, db, browser }) => {
    await as('vienne');
    await page.goto('/admin/families/u_ana');
    await main(page).getByRole('button', { name: 'New report' }).first().click(); // Mateo's card comes first
    await page.waitForURL(/\/admin\/reports\/[^/]+$/);
    const reportId = page.url().split('/').pop()!;
    await page.getByLabel('Summary').fill('Mateo is drawing a model before every word problem now. Next: multiplying by 6 to 9.');
    await page.getByRole('radiogroup', { name: 'Place value' }).getByRole('radio', { name: 'Proficient' }).click();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect.poll(async () => (await db.progressReport.findUniqueOrThrow({ where: { id: reportId } })).summary).toContain('drawing a model');

    const ana = await openAs(browser, 'ana');
    await ana.page.goto('/parent/progress');
    await chooseChild(ana.page, 'Mateo');
    await expect(main(ana.page)).not.toContainText('drawing a model');

    await page.getByRole('button', { name: 'Publish to family' }).click();
    await expect.poll(async () => (await db.progressReport.findUniqueOrThrow({ where: { id: reportId } })).publishedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: 'u_ana', type: 'REPORT_PUBLISHED' } })).toBeGreaterThan(0);

    await ana.page.reload();
    await chooseChild(ana.page, 'Mateo');
    await expect(main(ana.page)).toContainText('drawing a model');
    expect(ana.errors).toEqual([]);
    await ana.close();
  });
});

test.describe('Today', () => {
  test('confirming a request updates the screen without a reload', async ({ page, as, db }) => {
    await as('vienne');
    await page.goto('/admin/today');
    const requests = main(page).getByRole('button', { name: /^Requests/ });
    const count = async () => Number((await requests.innerText()).match(/\d+/)?.[0]);
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await main(page).getByRole('button', { name: 'Confirm' }).first().click();
    await expectToast(page, 'Session confirmed');
    await expect.poll(count).toBe(before - 1);
    expect(await db.session.count({ where: { status: 'REQUESTED', startsAt: { gt: new Date() } } })).toBe(before - 1);
  });
});
