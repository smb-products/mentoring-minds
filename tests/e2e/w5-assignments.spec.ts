import path from 'node:path';
import type { Page, Response } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { chooseChild, main } from './support/ui';

/** W5: New assignment; the parent's answer sheet with a photo; Work → check written answers. */
requires('assignments', 'books', 'content', 'families');

const photo = path.join(process.cwd(), 'tests/e2e/files/page.png');

/** Everything the server sends a family's browser, to prove the answer key never goes along. */
function recordResponses(page: Page) {
  const bodies: string[] = [];
  const pending: Promise<unknown>[] = [];
  page.on('response', (r: Response) => {
    const type = r.headers()['content-type'] ?? '';
    if (/x-component|json|html/.test(type)) pending.push(r.text().then((t) => bodies.push(t), () => {}));
  });
  return async () => {
    await Promise.all(pending);
    return bodies;
  };
}

/** One answer on the sheet, the way a child gives it: tap a letter, tap letters, or type a number. */
async function answer(page: Page, format: string, number: number, value: string) {
  const sheet = page.getByRole('dialog', { name: /answer sheet/ });
  if (format === 'MC') await sheet.getByRole('radiogroup', { name: `Answer for question ${number}` }).getByRole('radio', { name: value, exact: true }).click();
  else if (format === 'MULTI') {
    for (const letter of value.split(',')) await sheet.getByRole('group', { name: `Answers for question ${number}` }).getByRole('checkbox', { name: letter, exact: true }).click();
  } else {
    await page.keyboard.type(value);
    await expect(sheet.getByLabel(`Your answer for question ${number}`)).toHaveText(value);
  }
}

/** Something that isn't the key's answer. */
function wrongAnswer(format: string, right: string) {
  if (format === 'MC') return right === 'A' ? 'B' : 'A';
  if (format === 'MULTI') return right === 'E' ? 'A' : 'E';
  return right === '1' ? '2' : '1';
}

test('Vienne assigns book questions; Lucia answers on Ana’s phone with a photo; Vienne checks the written one', async ({ page, as, db, browser }) => {
  // Vienne: Test 1, questions 10–14 for Lucia (grade 5). #13 is a written answer.
  await as('vienne');
  await page.goto('/admin/assignments/new');
  await page.getByLabel('Grade', { exact: true }).selectOption({ label: 'Grade 5' });
  await page.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 1' });
  await page.getByLabel('From question').fill('10');
  await page.getByLabel('To question').fill('14');
  await page.locator('label', { hasText: 'Lucia Mendoza' }).click();
  await expect(page.getByLabel(/Lucia Mendoza/)).toBeChecked();
  await page.getByRole('button', { name: 'Assign to 1 student' }).click();
  await expect.poll(() => db.assignment.count({ where: { title: 'Test 1, #10–14' } })).toBe(1);
  const assignment = await db.assignment.findFirstOrThrow({ where: { title: 'Test 1, #10–14' }, include: { submissions: true } });
  expect(assignment.submissions.map((s) => [s.studentId, s.status])).toEqual([['s_lucia', 'ASSIGNED']]);
  expect(await db.notification.count({ where: { userId: 'u_ana', type: 'ASSIGNMENT_GIVEN', body: 'Test 1, #10–14' } })).toBe(1);

  // Ana's phone.
  const ana = await openAs(browser, 'ana', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const sent = recordResponses(ana.page);
  await ana.page.goto('/parent/learning');
  await chooseChild(ana.page, 'Lucia');
  await main(ana.page).getByText('Test 1, #10–14').click();
  await ana.page.getByRole('button', { name: 'Fill in answers' }).click();
  const sheet = ana.page.getByRole('dialog', { name: /answer sheet/ });
  // Answer from the real key, by each question's type; get the first checkable one wrong.
  const items = await db.bookItem.findMany({ where: { bookId: 'book_g5', test: 'T1', number: { gte: 10, lte: 14 } }, orderBy: { number: 'asc' } });
  const checkable = items.filter((i) => i.format !== 'OPEN');
  const missed = checkable[0];
  for (const [index, item] of items.entries()) {
    if (item.format === 'OPEN') {
      await sheet.locator('input[type=file]').setInputFiles(photo);
      await expect(sheet.getByRole('button', { name: 'Retake' })).toBeVisible();
    } else {
      await answer(ana.page, item.format, item.number, item === missed ? wrongAnswer(item.format, item.answer!) : item.answer!);
    }
    if (index < items.length - 1) await sheet.getByRole('button', { name: 'Next' }).click();
  }
  await sheet.getByRole('button', { name: 'Check my answers' }).click();
  await sheet.getByRole('button', { name: 'Hand it in' }).click();
  await expect(sheet.getByText(`${checkable.length - 1} of ${checkable.length} right`)).toBeVisible();
  await expect(sheet.getByText('Vienne will check your written answer')).toBeVisible();
  for (const body of await sent()) expect(body, 'the answer key reached a family’s browser').not.toMatch(/"answer":/);
  expect(ana.errors).toEqual([]);
  await ana.close();

  const sub = await db.submission.findFirstOrThrow({ where: { assignmentId: assignment.id } });
  expect(sub.status).toBe('SUBMITTED');
  expect(sub.photos).toEqual([expect.objectContaining({ number: 13, fileId: expect.any(String) })]);
  expect(sub.answers).toEqual(expect.arrayContaining([expect.objectContaining({ number: missed.number, correct: false }), expect.objectContaining({ number: 13, correct: null })]));
  expect(await db.redoItem.count({ where: { submissionId: sub.id, clearedAt: null, bookItem: { number: missed.number } } })).toBe(1);

  // Vienne opens the photo and marks #13 right.
  await page.goto(`/admin/assignments/${assignment.id}`);
  await main(page).getByRole('button', { name: 'Check' }).click();
  const check = page.getByRole('dialog', { name: /Check Lucia’s written answers/ });
  const [opened] = await Promise.all([page.waitForEvent('popup'), check.getByRole('button', { name: /Tap to open/ }).click()]);
  expect(opened.url()).toMatch(/\/api\/files\/[^/]+$/);
  expect((await page.request.get(opened.url())).status()).toBe(200);
  await check.getByRole('radio', { name: 'Right' }).click();
  await check.getByRole('button', { name: 'Save' }).click();
  await expect(check).toBeHidden();
  await expect.poll(async () => (await db.submission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('GRADED');
});

test('a test without an answer key can’t be assigned yet', async ({ page, as }) => {
  await as('vienne');
  await page.goto('/admin/assignments/new');
  await page.getByLabel('Grade', { exact: true }).selectOption({ label: 'Grade 4' });
  await page.getByLabel('Test', { exact: true }).selectOption({ label: 'Test 2 (no answer key yet)' });
  await expect(page.getByText('Add the answer key for Test 2 first so answers can be checked.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up the answer key' })).toBeVisible();
});

test('another family’s work photo can’t be opened', async ({ page, as, db }) => {
  await as('grace');
  const arjun = await db.fileAsset.findUniqueOrThrow({ where: { id: 'fa_arjun_work' } });
  expect((await page.request.get(`/api/files/${arjun.id}`)).status()).toBe(403);
});
