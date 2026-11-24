import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { chooseChild, expectToast, main } from './support/ui';

/** W1: Content → Skills; Family page → FAST results; parent Progress. */
requires('taxonomy', 'fast');

/** The "Add a FAST Math result" dialog, filled in. */
async function addFastResult(page: Page, { window, score, level }: { window: 'PM1' | 'PM2' | 'PM3'; score: number; level: number }) {
  const dialog = page.getByRole('dialog', { name: /FAST Math result/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radiogroup', { name: 'Test' }).getByRole('radio', { name: window }).click();
  await dialog.getByLabel('Scale score').fill(String(score));
  await dialog.getByRole('radiogroup', { name: 'Level' }).getByRole('radio', { name: String(level), exact: true }).click();
  await dialog.getByRole('button', { name: 'Save result' }).click();
  return dialog;
}

test.describe('skills', () => {
  test('Vienne adds a skill, archives it, and Undo brings it back', async ({ page, as, db }) => {
    await as('vienne');
    await page.goto('/admin/content');
    await page.getByRole('tablist', { name: 'Content sections' }).getByRole('tab', { name: 'Skills' }).click();
    await page.getByLabel('New skill').fill('Rounding to the nearest ten');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expectToast(page, 'Skill added');
    await expect(main(page).getByText('Rounding to the nearest ten')).toBeVisible();
    const skill = await db.skill.findFirstOrThrow({ where: { name: 'Rounding to the nearest ten' } });
    expect(skill.archivedAt).toBeNull();

    await page.getByRole('button', { name: 'Archive Rounding to the nearest ten' }).click();
    await expect(main(page).getByText('Rounding to the nearest ten')).toHaveCount(0);
    await expect.poll(async () => (await db.skill.findUniqueOrThrow({ where: { id: skill.id } })).archivedAt).not.toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(main(page).getByText('Rounding to the nearest ten')).toBeVisible();
    await expect.poll(async () => (await db.skill.findUniqueOrThrow({ where: { id: skill.id } })).archivedAt).toBeNull();
  });
});

test.describe('FAST results', () => {
  test('Vienne enters a result on the family page; Ana sees it on Progress', async ({ page, as, db, browser }) => {
    await as('vienne');
    await page.goto('/admin/families/u_ana');
    // Mateo's card comes first (the database check below confirms it was his).
    await main(page).getByRole('button', { name: 'Add result' }).first().click();
    const dialog = await addFastResult(page, { window: 'PM2', score: 215, level: 2 });
    await expect(dialog).toBeHidden();
    await expect(main(page)).toContainText('Score 215. Entered by Vienne');

    const row = await db.fastResult.findFirstOrThrow({ where: { studentId: 's_mateo', window: 'PM2' } });
    expect(row).toMatchObject({ scaleScore: 215, level: 2, enteredById: 'u_admin', schoolYear: '2026–27' });

    const ana = await openAs(browser, 'ana');
    await ana.page.goto('/parent/progress');
    await chooseChild(ana.page, 'Mateo');
    await expect(main(ana.page)).toContainText('Score 215');
    expect(ana.errors).toEqual([]);
    await ana.close();
  });

  test('Ana enters Lucia’s result on her phone; Vienne sees who entered it @phone', async ({ page, as, db, browser }) => {
    await as('ana');
    await page.goto('/parent/progress');
    await chooseChild(page, 'Lucia');
    await page.getByRole('button', { name: 'Add result' }).click();
    await addFastResult(page, { window: 'PM2', score: 236, level: 3 });
    await expect(main(page)).toContainText('Score 236');
    await expect.poll(() => db.fastResult.count({ where: { studentId: 's_lucia', window: 'PM2', scaleScore: 236, enteredById: 'u_ana' } })).toBe(1);

    const vienne = await openAs(browser, 'vienne');
    await vienne.page.goto('/admin/families/u_ana');
    await expect(main(vienne.page)).toContainText('Score 236. Entered by Ana');
    await vienne.close();
  });

  test('entering the same test twice says to edit the first one', async ({ page, as, db }) => {
    await as('ana');
    await page.goto('/parent/progress');
    await chooseChild(page, 'Lucia');
    await page.getByRole('button', { name: 'Add result' }).click();
    const dialog = await addFastResult(page, { window: 'PM1', score: 240, level: 3 });
    await expect(page.getByText('PM1 2026–27 is already entered. Edit that one instead.').first()).toBeVisible();
    await expect(dialog).toBeVisible();
    expect(await db.fastResult.count({ where: { studentId: 's_lucia', window: 'PM1', schoolYear: '2026–27' } })).toBe(1);
  });
});
