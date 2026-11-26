import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import type { e2eDb } from './support/db';
import { expect, freshData, openAs, test, type Who } from './support/fixtures';
import { chooseChild, main } from './support/ui';

/** MAX_BYTES in src/lib/storage.ts (server-only, so read from the source: a change to the limit changes this test). */
const MAX_BYTES = (() => {
  const m = readFileSync('src/lib/storage.ts', 'utf8').match(/export const MAX_BYTES = (\d+) \* 1024 \* 1024;/);
  if (!m) throw new Error('MAX_BYTES moved or changed shape in src/lib/storage.ts');
  return Number(m[1]) * 1024 * 1024;
})();

/**
 * P-product (production audit): every screen, live on a production build, settles with a clean
 * console and no failed request, for Vienne, an active parent, a preview parent and a paused one.
 * Then a parent's phone uploads. Tagged @phone, so it runs on the phone project too.
 */
freshData();

type Db = ReturnType<typeof e2eDb>;

/** Every route in src/app for Vienne, with real ids from the demo data. */
async function adminRoutes(db: Db) {
  const assignment = await db.assignment.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const resource = await db.resource.findFirstOrThrow({ where: { deletedAt: null } });
  const book = await db.book.findFirstOrThrow({ orderBy: { grade: 'asc' } });
  const test = (book.tests as { key: string }[])[0].key;
  const conversation = await db.conversation.findFirstOrThrow({ where: { parentId: 'u_ana' } });
  const report = await db.progressReport.findFirstOrThrow();
  return [
    '/admin/today', '/admin/schedule', '/admin/families', '/admin/families/u_ana', '/admin/messages',
    `/admin/messages/${conversation.id}`, '/admin/assignments', '/admin/assignments/new',
    `/admin/assignments/${assignment.id}`, '/admin/content', `/admin/content/${resource.id}`,
    `/admin/content/book/${book.id}/${test}`, `/admin/reports/${report.id}`, '/admin/settings',
  ];
}

async function parentRoutes(db: Db, parentId: string) {
  const sub = await db.submission.findFirst({ where: { student: { parentId } }, orderBy: { id: 'asc' } });
  return ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/messages', '/parent/progress',
    ...(sub ? [`/parent/learning/${sub.id}`] : [])];
}

/** Opens a route and waits for it to settle; returns any failed request or server error on the way. */
async function visit(page: Page, url: string) {
  const bad: string[] = [];
  const onResponse = (r: { status(): number; url(): string; request(): { method(): string } }) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  };
  const onFailed = (r: { url(): string; failure(): { errorText: string } | null }) => {
    const why = r.failure()?.errorText ?? '';
    if (!/ERR_ABORTED/.test(why)) bad.push(`failed ${r.url()} ${why}`);
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  await page.goto(url);
  await expect(page, `${url} redirected`).toHaveURL(new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.locator('[aria-busy="true"]'), `${url} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(main(page).getByRole('heading').first(), `${url} has no heading`).toBeVisible();
  await expect(page.getByText('This page couldn’t load'), `${url} showed the error screen`).toHaveCount(0);
  page.off('response', onResponse);
  page.off('requestfailed', onFailed);
  return bad;
}

async function sweep(page: Page, routes: string[], errors: string[]) {
  const problems: string[] = [];
  for (const url of routes) {
    const before = errors.length;
    for (const b of await visit(page, url)) problems.push(`${url}: ${b}`);
    for (const e of errors.slice(before)) problems.push(`${url}: ${e}`);
  }
  errors.length = 0; // reported here, route by route, instead of once at the end
  expect(problems, 'routes with console errors or failed requests').toEqual([]);
}

test('Vienne: every admin screen settles with a clean console @phone', async ({ page, as, db, errors }) => {
  await as('vienne');
  await sweep(page, await adminRoutes(db), errors);
});

test('an active parent: every parent screen settles with a clean console @phone', async ({ page, as, db, errors }) => {
  await as('ana');
  await sweep(page, await parentRoutes(db, 'u_ana'), errors);
});

/**
 * Preview and paused parents: fixme until S8. Today Home never finishes loading for either (the page waits for
 * data a NOT_ACTIVE guard refuses), and a preview parent's shell throws "Enter your invite code to unlock this."
 * as an uncaught page error. S8 removes the two `.fixme`s, and nothing else in this file.
 */
async function sweepWithMessage(page: Page, routes: string[], errors: string[], message: RegExp) {
  await sweep(page, routes, errors);
  for (const url of routes) {
    await page.goto(url);
    await expect(page.getByText(message).first(), `${url} doesn't say what to do`).toBeVisible();
  }
}

test('a preview parent: every parent screen asks for the code, with a clean console @phone', async ({ page, as, db, errors }) => {
  await as('tom');
  await sweepWithMessage(page, await parentRoutes(db, 'u_tom'), errors, /Enter your invite code/);
});

test.describe('a paused parent', () => {
  test.afterEach(async ({ db }) => {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
  });

  test('every parent screen says the account is paused, with a clean console @phone', async ({ page, as, db, errors }) => {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
    await as('daniel' satisfies Who);
    await sweepWithMessage(page, await parentRoutes(db, 'u_daniel'), errors, /Your account is paused/);
  });
});

test.describe('phone uploads', () => {
  /** Lucia (Ana's) gets one written question, so the sheet opens on the photo. */
  async function photoSheet(page: Page, db: Db, title: string) {
    const item = await db.bookItem.findFirstOrThrow({ where: { bookId: 'book_g5', format: 'OPEN' }, orderBy: [{ test: 'asc' }, { number: 'asc' }] });
    await db.assignment.create({
      data: { title, kind: 'BOOK', bookId: 'book_g5', bookTest: item.test, bookFrom: item.number, bookTo: item.number, subjectId: 'sub_math',
        submissions: { create: [{ studentId: 's_lucia' }] } },
    });
    await page.goto('/parent/learning');
    await chooseChild(page, 'Lucia');
    await main(page).getByText(title).click();
    await page.getByRole('button', { name: 'Fill in answers' }).click();
    return page.getByRole('dialog', { name: /answer sheet/ });
  }

  /** A real JPEG, drawn by the browser itself. */
  async function jpeg(page: Page) {
    const b64 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 900;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#123'; g.font = '64px sans-serif'; g.fillText('13. 3/4 > 2/3', 80, 200);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    });
    return Buffer.from(b64, 'base64');
  }

  test('a JPEG from the camera is sent and Vienne can open it @phone', async ({ page, as, db, browser }) => {
    await as('ana');
    const sheet = await photoSheet(page, db, 'P-product photo JPEG');
    await sheet.locator('input[type=file]').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: await jpeg(page) });
    await expect(sheet.getByRole('button', { name: 'Retake' })).toBeVisible();
    const file = await db.fileAsset.findFirstOrThrow({ where: { uploadedById: 'u_ana' }, orderBy: { createdAt: 'desc' } });
    expect(file.mimeType).toBe('image/jpeg');
    expect(file.uploadedAt).not.toBeNull();
    const vienne = await openAs(browser, 'vienne');
    const opened = await vienne.page.request.get(`/api/files/${file.id}`);
    expect(opened.status()).toBe(200);
    expect(opened.headers()['content-type']).toMatch(/^image\/jpeg/);
    await vienne.close();
  });

  test('a HEIC photo gets a plain message, and nothing half-saved @phone', async ({ page, as, db }) => {
    await as('ana');
    const before = await db.fileAsset.count();
    const sheet = await photoSheet(page, db, 'P-product photo HEIC');
    // An iPhone library photo as Chrome sees it: ftyp heic, which the browser can't decode or shrink.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic\0\0\0\0mif1heic'), Buffer.alloc(4096, 1)]);
    await sheet.locator('input[type=file]').setInputFiles({ name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: heic });
    await expect(page.getByText(/PDF, PNG, JPG or WebP|photo/i).first()).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retake' })).toHaveCount(0);
    expect(await db.fileAsset.count()).toBe(before);
  });

  test('a file over MAX_BYTES gets the plain size message, and nothing is saved @phone', async ({ page, as, db }) => {
    await as('ana');
    const before = await db.fileAsset.count();
    const sheet = await photoSheet(page, db, 'P-product photo too big');
    await sheet.locator('input[type=file]').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(MAX_BYTES + 1, 7) });
    await expect(page.getByText(`Files can be up to ${MAX_BYTES / 1024 / 1024} MB`)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Retake' })).toHaveCount(0);
    expect(await db.fileAsset.count()).toBe(before);
  });
});
