import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { chooseChild, expectToast, main } from './support/ui';

/** W4: Content → Book → Answer key; Library; upload a worksheet; parents open it. */
requires('books', 'content');

const file = (name: string) => path.join(process.cwd(), 'tests/e2e/files', name);

/** Vienne's "Add resource" form, filled in for a worksheet. */
async function newWorksheet(page: Page, title: string, pdf: string, { publish = true } = {}) {
  await page.goto('/admin/content/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Choose a file to attach').setInputFiles(file(pdf));
  if (publish) await page.getByRole('switch', { name: 'Published' }).click();
  await page.getByRole('button', { name: 'Add resource' }).click();
}

test.describe('answer keys', () => {
  test('Vienne corrects an answer and it’s saved', async ({ page, as, db }) => {
    await as('vienne');
    await page.goto('/admin/content/book/book_g4/T1');
    const before = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g4', test: 'T1', number: 1 } });
    const next = before.answer === 'B' ? 'C' : 'B';
    await page.getByLabel('Answer for #1', { exact: true }).fill(next);
    await page.getByRole('button', { name: 'Save 1 change' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await expect.poll(async () => (await db.bookItem.findUniqueOrThrow({ where: { id: before.id } })).answer).toBe(next);
    await page.reload();
    await expect(page.getByLabel('Answer for #1', { exact: true })).toHaveValue(next);
  });

  test('a family saying they have the book updates Vienne’s count', async ({ page, as, db }) => {
    expect((await db.student.findUniqueOrThrow({ where: { id: 's_jordan' } })).hasBookAt).toBeNull();
    await as('keisha');
    await page.goto('/parent/home');
    await page.getByRole('button', { name: 'We have it' }).click();
    await expect.poll(async () => (await db.student.findUniqueOrThrow({ where: { id: 's_jordan' } })).hasBookAt).not.toBeNull();
    await expect(main(page).getByRole('button', { name: 'We have it' })).toHaveCount(0);
  });
});

test.describe('library', () => {
  test('Vienne uploads a worksheet; Ana finds it in Learning and opens the file', async ({ page, as, db, browser }) => {
    await as('vienne');
    await newWorksheet(page, 'Skip counting by 5s', 'worksheet.pdf');
    await page.waitForURL(/\/admin\/content\/(?!new)[^/]+$/);
    const resource = await db.resource.findFirstOrThrow({ where: { title: 'Skip counting by 5s' }, include: { file: true } });
    expect(resource).toMatchObject({ status: 'PUBLISHED', kind: 'WORKSHEET' });
    expect(resource.file).toMatchObject({ mimeType: 'application/pdf', sizeBytes: readFileSync(file('worksheet.pdf')).length });
    expect(resource.file!.uploadedAt).not.toBeNull();

    const ana = await openAs(browser, 'ana');
    await ana.page.goto('/parent/learning');
    await chooseChild(ana.page, 'Mateo');
    await ana.page.getByRole('tab', { name: /Library/ }).click();
    await main(ana.page).getByText('Skip counting by 5s').click();
    const drawer = ana.page.getByRole('dialog', { name: 'Skip counting by 5s' });
    const [tab] = await Promise.all([ana.page.waitForEvent('popup'), drawer.getByText('worksheet.pdf').click()]);
    expect(tab.url()).toContain(`/api/files/${resource.fileId}`);
    const download = await ana.page.request.get(`/api/files/${resource.fileId}`);
    expect(download.status()).toBe(200);
    expect(Buffer.from(await download.body()).equals(readFileSync(file('worksheet.pdf')))).toBe(true);
    expect(ana.errors).toEqual([]);
    await ana.close();
  });

  test('a file that only pretends to be a PDF is refused', async ({ page, as, db }) => {
    await as('vienne');
    await newWorksheet(page, 'Not really a PDF', 'not-really.pdf');
    await expect(page.getByText('That file isn’t a real PDF. Try another.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/content\/new$/);
    expect(await db.resource.count({ where: { title: 'Not really a PDF' } })).toBe(0);
  });

  test('drafts stay hidden from families until published', async ({ page, as, browser }) => {
    await as('vienne');
    await newWorksheet(page, 'Draft: times tables', 'worksheet.pdf', { publish: false });
    await page.waitForURL(/\/admin\/content\/(?!new)[^/]+$/);
    const ana = await openAs(browser, 'ana');
    await ana.page.goto('/parent/learning');
    await ana.page.getByRole('tab', { name: /Library/ }).click();
    await expect(main(ana.page)).toContainText('Fraction strips worksheet');
    await expect(main(ana.page)).not.toContainText('Draft: times tables');
    await ana.close();
  });

  test('deleting a resource can be undone', async ({ page, as, db }) => {
    await as('vienne');
    await page.goto('/admin/content/res_area');
    await page.getByRole('button', { name: /Delete/ }).click();
    await page.waitForURL('**/admin/content');
    await expect.poll(async () => (await db.resource.findUniqueOrThrow({ where: { id: 'res_area' } })).deletedAt).not.toBeNull();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expectToast(page, 'Undone');
    await expect.poll(async () => (await db.resource.findUniqueOrThrow({ where: { id: 'res_area' } })).deletedAt).toBeNull();
  });
});
