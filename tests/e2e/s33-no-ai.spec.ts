import { expect, requires, test } from './support/fixtures';
import { endNextSession, openCompleteForm } from './support/sessions';

/**
 * S33: no AI for launch. "Talk about it" and "Set up from photos" are gone; the typed
 * session note and the typed answer key save as before. The fixture fails on console errors.
 */
requires('scheduling', 'books');

test('the microphone is off for every page; the camera stays for homework photos', async ({ page, as }) => {
  await as('vienne');
  const res = await page.goto('/admin/today');
  const policy = res!.headers()['permissions-policy'];
  expect(policy).toContain('microphone=()');
  expect(policy).toContain('camera=(self)');
});

test('Complete session has only the typed form, and a typed note completes it', async ({ page, as, db }) => {
  const s = await endNextSession(db, 's_sofia');
  await as('vienne');
  const form = await openCompleteForm(page, 'Sofia Reyes', s.label);
  const drawer = page.getByRole('dialog');

  await expect(drawer.getByRole('region', { name: 'Talk about it' })).toHaveCount(0);
  for (const text of ['Talk about it', 'What you said', 'Or type it', 'Tap to talk']) await expect(drawer.getByText(text, { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: /Write my note|Tap to talk|Done talking/ })).toHaveCount(0);
  await expect(drawer.getByText(/microphone/i)).toHaveCount(0);

  await form.getByLabel('What you worked on').fill('Comparing fractions on a number line. Sofia checked each one with strips.');
  await form.getByRole('button', { name: 'Complete session' }).click();
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('COMPLETED');
  const note = await db.sessionNote.findUniqueOrThrow({ where: { sessionId: s.id } });
  expect(note).toMatchObject({ summary: 'Comparing fractions on a number line. Sofia checked each one with strips.', source: 'TYPED' });
});

test('the answer key has no "Set up from photos", and typed rows save', async ({ page, as, db }) => {
  const before = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g5', format: 'MC' }, orderBy: [{ test: 'asc' }, { number: 'desc' }] });
  const label = `Answer for #${before.number}`;
  await as('vienne');
  await page.goto(`/admin/content/book/book_g5/${before.test}`);
  await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up from photos' })).toHaveCount(0);
  await expect(page.getByText('Set up from photos')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

  const next = before.answer === 'D' ? 'A' : 'D';
  await page.getByLabel(label, { exact: true }).fill(next);
  await page.getByRole('button', { name: 'Save 1 change' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect.poll(async () => (await db.bookItem.findUniqueOrThrow({ where: { id: before.id } })).answer).toBe(next);
  expect((await db.bookItem.findUniqueOrThrow({ where: { id: before.id } })).source).toBe('TYPED');
});
