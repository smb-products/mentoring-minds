import type { Page } from '@playwright/test';
import { expect, requires, test, USERS } from './support/fixtures';
import { main } from './support/ui';

/**
 * S35: a detail page opened with an id that doesn't exist says so, with a link back to its list, instead of
 * staying on the loading skeleton. A parent opening another family's assignment sees the same words as for
 * a made-up id, so the page reveals nothing. The skeleton still shows while the read is on its way. The
 * `test` fixture fails on any browser error.
 */
requires('families', 'messages', 'books', 'content', 'assignments', 'reports');

const MADE_UP = 'cmnotreal00s35000000000000';
const gone = (what: string) => `We couldn’t find that ${what}. It may have been removed.`;
const PHONE = { width: 390, height: 844 };

async function expectGone(page: Page, what: string, back: string, href: string) {
  const m = main(page);
  await expect(m.getByText(gone(what), { exact: true })).toBeVisible({ timeout: 5_000 });
  const link = m.getByRole('link', { name: `Back to ${back}`, exact: true });
  await expect(link).toBeVisible({ timeout: 5_000 });
  await expect(link).toHaveAttribute('href', href);
  await expect(page.getByLabel('Loading', { exact: true })).toHaveCount(0);
}

const ADMIN_ROUTES: [string, string, string, string][] = [
  [`/admin/families/${MADE_UP}`, 'family', 'Families', '/admin/families'],
  [`/admin/assignments/${MADE_UP}`, 'assignment', 'Assignments', '/admin/assignments'],
  [`/admin/content/${MADE_UP}`, 'resource', 'Content', '/admin/content'],
  [`/admin/content/book/${MADE_UP}/M1`, 'answer key', 'Content', '/admin/content'],
  [`/admin/reports/${MADE_UP}`, 'report', 'Reports', '/admin/reports'],
  [`/admin/messages/${MADE_UP}`, 'conversation', 'Messages', '/admin/messages'],
];

test('Vienne opens each detail page with a made-up id: a plain message and a link back', async ({ page, as }) => {
  await as('vienne');
  for (const [url, what, back, href] of ADMIN_ROUTES) {
    await page.goto(url);
    await expectGone(page, what, back, href);
  }
  // The link takes her back to the list.
  await page.goto(`/admin/families/${MADE_UP}`);
  await main(page).getByRole('link', { name: 'Back to Families', exact: true }).click();
  await page.waitForURL('**/admin/families');
  await expect(page.getByRole('heading', { level: 1, name: 'Families' })).toBeVisible();
});

test('on a phone, a made-up conversation says so too', async ({ page, as }) => {
  await page.setViewportSize(PHONE);
  await as('vienne');
  await page.goto(`/admin/messages/${MADE_UP}`);
  await expectGone(page, 'conversation', 'Messages', '/admin/messages');
});

test('Vienne’s real ids still open their pages', async ({ page, as, db }) => {
  const family = await db.user.findFirstOrThrow({ where: { email: USERS.ana } });
  const assignment = await db.assignment.findFirstOrThrow({ where: { submissions: { some: {} } } });
  const resource = await db.resource.findFirstOrThrow({ where: { deletedAt: null, title: { not: '' } } });
  const book = await db.book.findFirstOrThrow();
  const test1 = (book.tests as { key: string; name: string }[])[0];
  const report = await db.progressReport.findFirstOrThrow({ include: { student: true } });
  const conversation = await db.conversation.findFirstOrThrow({ where: { parentId: family.id } });

  await as('vienne');
  const opens: [string, string][] = [
    [`/admin/families/${family.id}`, family.name!],
    [`/admin/assignments/${assignment.id}`, assignment.title],
    [`/admin/content/${resource.id}`, resource.title],
    [`/admin/content/book/${book.id}/${test1.key}`, `${test1.name} answer key`],
    [`/admin/reports/${report.id}`, `Progress report for ${report.student.firstName}`],
  ];
  for (const [url, title] of opens) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true }), url).toBeVisible({ timeout: 5_000 });
    await expect(main(page).getByText(/We couldn’t find that/)).toHaveCount(0);
  }
  await page.goto(`/admin/messages/${conversation.id}`);
  await expect(main(page).getByRole('link', { name: /^Parent of / })).toBeVisible({ timeout: 5_000 });
  await expect(main(page).getByText(/We couldn’t find that/)).toHaveCount(0);
});

test('Ana opens a made-up assignment and another family’s: the same message; her own still opens', async ({ page, as, db }) => {
  const others = await db.submission.findFirstOrThrow({ where: { student: { parent: { email: USERS.grace } } } });
  const own = await db.submission.findFirstOrThrow({ where: { student: { parent: { email: USERS.ana } } }, include: { assignment: true } });

  await as('ana');
  for (const id of [MADE_UP, others.id]) {
    await page.goto(`/parent/learning/${id}`);
    await expectGone(page, 'assignment', 'Learning', '/parent/learning');
  }
  await main(page).getByRole('link', { name: 'Back to Learning', exact: true }).click();
  await page.waitForURL('**/parent/learning');

  await page.goto(`/parent/learning/${own.id}`);
  await expect(page.getByRole('heading', { level: 1, name: own.assignment.title, exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(main(page).getByText(/We couldn’t find that/)).toHaveCount(0);
});

test('the skeleton shows while the read is on its way, and the message only once it is back', async ({ page, as }) => {
  await as('vienne');
  // Hold the page's reads (server actions) until the skeleton has been seen.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action']) await held;
    await route.continue();
  });
  await page.goto(`/admin/families/${MADE_UP}`);
  await expect(page.getByLabel('Loading', { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(gone('family'), { exact: true })).toHaveCount(0);
  release();
  await expectGone(page, 'family', 'Families', '/admin/families');
  await page.unroute('**/*');
});
