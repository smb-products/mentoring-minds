import { expect, requires, test } from './support/fixtures';
import { expectToast, main } from './support/ui';
import type { e2eDb } from './support/db';

/**
 * S23: on Vienne's family page she can delete a child, or the whole family, on request. It asks twice:
 * what will be removed, then the child's or parent's name typed out. After it they're gone from every
 * screen, and the browser logs no error (the `test` fixture fails on any).
 */
requires('families', 'messages');

type Db = ReturnType<typeof e2eDb>;
let n = 0;

/** A family made for this test: a parent, two children, a thread with Vienne and an upcoming session. */
async function makeFamily(db: Db, lastName: string, [first, second] = ['Pablo', 'Elena']) {
  const tag = `${Date.now()}${(n += 1)}`;
  const parent = await db.user.create({ data: { email: `s23-${tag}@example.com`, name: `Rosa ${lastName}`, role: 'PARENT', status: 'ACTIVE', emailVerified: new Date() } });
  const kid = (firstName: string, grade: number) =>
    db.student.create({ data: { parentId: parent.id, firstName, lastName, grade, schoolYear: '2026–27', subjects: { create: [{ subjectId: 'sub_math' }] } } });
  const pablo = await kid(first, 3);
  const elena = await kid(second, 5);
  const conv = await db.conversation.create({ data: { parentId: parent.id, lastMessageAt: new Date() } });
  await db.message.create({ data: { conversationId: conv.id, senderId: parent.id, body: `Please remove ${first} from our account.` } });
  const startsAt = new Date(Date.now() + 3 * 86400000);
  await db.session.create({
    data: { studentId: pablo.id, subjectId: 'sub_math', mode: 'VIDEO', requestedById: parent.id, startsAt, endsAt: new Date(+startsAt + 3600000), durationMin: 60, status: 'CONFIRMED', confirmedAt: new Date() },
  });
  return { parent, pablo, elena, conv };
}

// S27 hides Delete until S23b lands (Javaris, 2026-11-26). S23b turns this back on: remove `.fixme`.
test.fixme('Vienne deletes one child: asked twice, then the child is gone and the sibling stays', async ({ page, as, db }) => {
  const { parent, pablo, elena } = await makeFamily(db, 'Quintero');
  await as('vienne');
  await page.goto(`/admin/families/${parent.id}`);
  await expect(main(page).getByRole('heading', { name: 'Pablo Quintero' })).toBeVisible();

  // First ask: says what goes. "Keep" backs out with nothing changed.
  await page.getByRole('button', { name: 'Delete Pablo Quintero' }).click();
  const drawer = page.getByRole('dialog', { name: 'Delete Pablo Quintero?' });
  await expect(drawer).toContainText('This removes Pablo Quintero from Rosa’s account');
  await expect(drawer).toContainText('sessions and session notes');
  await expect(drawer).toContainText('files only they used');
  await drawer.getByRole('button', { name: 'Keep' }).click();
  await expect(drawer).toHaveCount(0);
  expect(await db.student.findUnique({ where: { id: pablo.id } })).not.toBeNull();

  // Second ask: the name typed out. A wrong name can't delete.
  await page.getByRole('button', { name: 'Delete Pablo Quintero' }).click();
  await drawer.getByRole('button', { name: 'Continue' }).click();
  const box = drawer.getByRole('textbox', { name: 'Type “Pablo Quintero” to delete for good' });
  const go = drawer.getByRole('button', { name: 'Delete Pablo' });
  await box.fill('Elena Quintero');
  await expect(go).toBeDisabled();
  await box.fill('Pablo Quintero');
  await go.click();
  await expectToast(page, 'Pablo Quintero was deleted');
  await expect(drawer).toHaveCount(0);

  // Gone from the family page and the families list; Elena stays.
  await expect(main(page).getByRole('heading', { name: 'Pablo Quintero' })).toHaveCount(0);
  await expect(main(page).getByRole('heading', { name: 'Elena Quintero' })).toBeVisible();
  await expect(main(page)).not.toContainText('Pablo');
  await page.goto('/admin/families');
  await expect(main(page).getByText('Rosa Quintero')).toBeVisible();
  await expect(main(page)).not.toContainText('Pablo');
  await page.goto('/admin/schedule');
  await expect(main(page)).not.toContainText('Pablo');

  expect(await db.student.findUnique({ where: { id: pablo.id } })).toBeNull();
  expect(await db.session.count({ where: { studentId: pablo.id } })).toBe(0);
  expect(await db.student.findUnique({ where: { id: elena.id } })).not.toBeNull();
});

// S27 hides Delete until S23b lands (Javaris, 2026-11-26). S23b turns this back on: remove `.fixme`.
test.fixme('Vienne deletes a whole family: asked twice, then the parent and children are gone from every screen', async ({ page, as, db }) => {
  const { parent, pablo, elena, conv } = await makeFamily(db, 'Castillo', ['Marco', 'Lina']);
  await as('vienne');
  await page.goto(`/admin/families/${parent.id}`);

  await page.getByRole('button', { name: 'Delete family' }).click();
  const drawer = page.getByRole('dialog', { name: 'Delete the Castillo family?' });
  await expect(drawer).toContainText('This removes Rosa Castillo and Marco and Lina');
  await expect(drawer).toContainText('messages, alerts and invites');
  await expect(drawer).toContainText('the parent’s account and sign-in');
  await drawer.getByRole('button', { name: 'Continue' }).click();
  const box = drawer.getByRole('textbox', { name: 'Type “Rosa Castillo” to delete for good' });
  const go = drawer.getByRole('button', { name: 'Delete family' });
  await expect(go).toBeDisabled();
  // Back goes to the first ask, and Continue returns here.
  await drawer.getByRole('button', { name: 'Back' }).click();
  await drawer.getByRole('button', { name: 'Continue' }).click();
  await box.fill('Rosa Castillo');
  await go.click();

  await page.waitForURL('**/admin/families');
  await expectToast(page, 'Family deleted');
  await expect(main(page).getByPlaceholder('Search parents or children')).toBeVisible();
  await expect(main(page).getByText('Ana Mendoza').first()).toBeVisible();
  await expect(main(page)).not.toContainText('Castillo');
  await expect(main(page)).not.toContainText('Marco');
  await page.goto('/admin/messages');
  await expect(main(page).getByText('Ana Mendoza').first()).toBeVisible();
  await expect(main(page)).not.toContainText('Castillo');
  await page.goto('/admin/schedule');
  await expect(main(page)).not.toContainText('Marco');

  expect(await db.user.findUnique({ where: { id: parent.id } })).toBeNull();
  expect(await db.student.count({ where: { id: { in: [pablo.id, elena.id] } } })).toBe(0);
  expect(await db.conversation.findUnique({ where: { id: conv.id } })).toBeNull();
});
