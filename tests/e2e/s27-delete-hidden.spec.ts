import { expect, requires, test } from './support/fixtures';
import { main } from './support/ui';

/**
 * S27 hid Delete family and a child's Delete until S23b (delete by id only) landed. S23b brings both back:
 * Vienne's family page shows Delete family and a Delete on each child's card, the same as before S27, and
 * the browser logs no error (the `test` fixture fails on any).
 */
requires('families', 'messages');

test('Vienne sees Delete family and a Delete on each child again; the other buttons stay', async ({ page, as, db }) => {
  const tag = `${Date.now()}`;
  const parent = await db.user.create({ data: { email: `s27-${tag}@example.com`, name: 'Rosa Benitez', role: 'PARENT', status: 'ACTIVE', emailVerified: new Date() } });
  const kid = (firstName: string, grade: number) =>
    db.student.create({ data: { parentId: parent.id, firstName, lastName: 'Benitez', grade, schoolYear: '2026–27', subjects: { create: [{ subjectId: 'sub_math' }] } } });
  await kid('Pablo', 3);
  await kid('Elena', 5);
  await db.conversation.create({ data: { parentId: parent.id, lastMessageAt: new Date() } });

  await as('vienne');
  await page.goto(`/admin/families/${parent.id}`);
  const m = main(page);
  await expect(m.getByRole('heading', { name: 'Pablo Benitez' })).toBeVisible();
  await expect(m.getByRole('heading', { name: 'Elena Benitez' })).toBeVisible();

  // Both deletes are back.
  await expect(page.getByRole('button', { name: 'Delete family', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Pablo Benitez', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete Elena Benitez', exact: true })).toBeVisible();

  // The rest of the page is unchanged: header actions, and each child's card actions.
  await expect(page.getByRole('button', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(m.getByRole('button', { name: 'New report' })).toHaveCount(2);
  await expect(m.getByRole('button', { name: 'They have it' })).toHaveCount(2);

  // Each one opens its drawer (the first ask) and closes without deleting.
  await page.getByRole('button', { name: 'Delete Pablo Benitez', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Continue' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await db.student.count({ where: { parentId: parent.id } })).toBe(2);
});
