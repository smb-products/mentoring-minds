import { expect, openAs, requires, test } from '../e2e/support/fixtures';
import { endNextSession, openCompleteForm } from '../e2e/support/sessions';

/** S33 holdout: with only the typed forms left, wrong input saves nothing and a private note stays private. */
requires('scheduling', 'books');

test('blank and wrong input are refused in plain words; a private typed note never reaches the parent', async ({ page, as, db, browser }) => {
  const s = await endNextSession(db, 's_sofia');
  await as('vienne');
  const form = await openCompleteForm(page, 'Sofia Reyes', s.label);
  const summary = form.getByLabel('What you worked on');
  const complete = form.getByRole('button', { name: 'Complete session' });
  const status = async () => (await db.session.findUniqueOrThrow({ where: { id: s.id } })).status;

  // Empty: the form doesn't send. Spaces only: the server says what to do.
  await complete.click();
  await expect(summary).toBeVisible();
  expect(await status()).toBe('CONFIRMED');
  await summary.fill('    ');
  await complete.click();
  await expect(page.getByText('Add a short summary')).toBeVisible();
  expect(await status()).toBe('CONFIRMED');

  const secret = 'HOLDOUT-PRIVATE Sofia guessed on most of page two.';
  await summary.fill(secret);
  await form.getByRole('switch', { name: /Share note with parent/ }).click();
  await complete.click();
  await expect.poll(status).toBe('COMPLETED');

  const parent = await openAs(browser, 'daniel');
  for (const path of ['/parent/home', '/parent/sessions']) {
    await parent.page.goto(path);
    await expect(parent.page.getByRole('heading').first()).toBeVisible();
    await parent.page.waitForLoadState('networkidle');
    await expect(parent.page.getByText(/Sofia/).first()).toBeVisible();
    expect(await parent.page.content(), path).not.toContain('HOLDOUT-PRIVATE');
  }
  expect(parent.errors).toEqual([]);
  await parent.close();

  const item = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g5', format: 'MC' }, orderBy: [{ test: 'asc' }, { number: 'asc' }] });
  await page.goto(`/admin/content/book/book_g5/${item.test}`);
  await page.getByLabel(`Answer for #${item.number}`, { exact: true }).fill('Z');
  await page.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(page.getByText(`#${item.number}: the answer should be one letter, A to D`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save 1 change' })).toBeEnabled();
  expect((await db.bookItem.findUniqueOrThrow({ where: { id: item.id } })).answer).toBe(item.answer);
});
