/**
 * W1 holdouts on screen: the other parent never sees Ana's children's scores, and a
 * result with no score is refused in plain words.
 */
import { expect, requires, test } from '../e2e/support/fixtures';
import { expectToast, main } from '../e2e/support/ui';

requires('taxonomy', 'fast');

test('Grace sees Noah’s score only, and an empty score saves nothing', async ({ page, as, db }) => {
  await as('grace');
  await page.goto('/parent/progress');
  await expect(main(page)).toContainText('Score 219');
  for (const other of ['Score 232', 'Score 204', 'Score 226', 'Mateo', 'Lucia']) await expect(main(page)).not.toContainText(other);

  const before = await db.fastResult.count();
  await page.getByRole('button', { name: 'Add result' }).click();
  const dialog = page.getByRole('dialog', { name: /FAST Math result/ });
  await dialog.getByRole('button', { name: 'Save result' }).click();
  await expectToast(page, 'Enter the scale score from the score report');
  await expect(dialog).toBeVisible();
  expect(await db.fastResult.count()).toBe(before);
});

test('a child with no results gets the empty state', async ({ page, as, db }) => {
  await db.fastResult.deleteMany({ where: { studentId: 's_noah' } });
  await as('grace');
  await page.goto('/parent/progress');
  await expect(main(page)).toContainText('No results yet.');
  await expect(main(page)).not.toContainText(/Score \d/);
});
