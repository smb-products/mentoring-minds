import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, requires, test } from './support/fixtures';
import { main } from './support/ui';

/**
 * S27: until S23b lands, Vienne's family page shows no Delete family button and no Delete on a child's
 * card. Everything else on the page stays, and the browser logs no error (the `test` fixture fails on any).
 * The delete drawer and families.deleteStudent / deleteFamily stay in the code for S23b to turn back on.
 */
requires('families', 'messages');

test('Vienne sees no Delete family and no Delete on either child; the other buttons stay', async ({ page, as, db }) => {
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

  // No delete anywhere on the page.
  await expect(page.getByRole('button', { name: 'Delete family' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Pablo Benitez' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Elena Benitez' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0);

  // The rest of the page is unchanged: header actions, and each child's card actions.
  await expect(page.getByRole('button', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(m.getByRole('button', { name: 'New report' })).toHaveCount(2);
  await expect(m.getByRole('button', { name: 'They have it' })).toHaveCount(2);
});

test('only the buttons go: the drawer and the delete endpoints stay for S23b', async () => {
  const root = process.cwd();
  const page = readFileSync(join(root, 'src/ui/pages/admin/FamilyPage.jsx'), 'utf8');
  expect(page).toContain('function DeleteDrawer(');
  expect(page).toContain('api.families.deleteStudent');
  expect(page).toContain('api.families.deleteFamily');
  expect(page).toMatch(/const SHOW_DELETE = false;/);

  const server = readFileSync(join(root, 'src/server/families.ts'), 'utf8');
  expect(server).toMatch(/export const deleteStudent = action\(/);
  expect(server).toMatch(/export const deleteFamily = action\(/);
});
