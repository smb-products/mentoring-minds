import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { endNextSession, openCompleteForm } from './support/sessions';
import { chooseChild, expectToast, main } from './support/ui';

/** W7: progress reports; Today and parent Home; the AI helpers. */
requires('reports', 'dashboard', 'ai', 'scheduling', 'families');

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

/** A session of Sofia's that has just finished, opened in "Complete session", with a spoken-style recap typed in. */
async function completeFormForSofia(page: Page, db: Parameters<Parameters<typeof test>[2]>[0]['db']) {
  const s = await endNextSession(db, 's_sofia');
  const form = await openCompleteForm(page, 'Sofia Reyes', s.label);
  const talk = form.getByRole('region', { name: 'Talk about it' });
  await talk.getByRole('textbox').fill('Sofia did well on comparing fractions. Missed number 3 and 11 on mini test 1, so we will redo those.');
  return talk;
}

test.describe('AI helpers', () => {
  test('without an API key, "Write my note" says so plainly', async ({ page, as, db }) => {
    test.skip(Boolean(process.env.ANTHROPIC_API_KEY), 'An API key is set; the next test covers the real call.');
    await as('vienne');
    const talk = await completeFormForSofia(page, db);
    await talk.getByRole('button', { name: 'Write my note' }).click();
    await expectToast(page, 'The AI helper isn’t available right now. Type it in instead, or try again in a minute.');
  });

  test('"Talk about it" turns a recap into a draft note (real Claude call, opt-in)', async ({ page, as, db }) => {
    test.skip(!process.env.ANTHROPIC_API_KEY || process.env.E2E_AI !== '1', 'Costs a Claude call: set ANTHROPIC_API_KEY and E2E_AI=1 to run it.');
    test.setTimeout(90_000);
    await as('vienne');
    const talk = await completeFormForSofia(page, db);
    await talk.getByRole('button', { name: 'Write my note' }).click();
    // The draft replaces the form; nothing is saved until Vienne taps to use it.
    await expect(page.getByRole('dialog', { name: 'Complete session' })).toContainText(/fraction/i, { timeout: 60_000 });
    expect(await db.sessionNote.count({ where: { summary: { contains: 'comparing fractions' } } })).toBe(0);
  });
});
