/**
 * S35 holdouts: "We couldn’t find that …" is only for something that really isn't there. On a slow
 * connection a real item shows the skeleton and then its page, never the message. A preview parent or a
 * signed-out visitor opening a family's assignment gets nothing of it. A removed item and a garbled address
 * say the same plain words.
 */
import type { Page } from '@playwright/test';
import { expect, freshData, test, USERS } from '../../tests/e2e/support/fixtures';
import { main } from '../../tests/e2e/support/ui';

freshData();

const gone = (what: string) => `We couldn’t find that ${what}. It may have been removed.`;

/** Every read takes a while, as on a weak phone signal. */
const slowReads = (page: Page) =>
  page.route('**/*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && req.headers()['next-action']) await new Promise((r) => setTimeout(r, 700));
    await route.continue().catch(() => {});
  });

/** Remembers whether the message was ever on screen, however briefly. */
const watchForMessage = (page: Page) =>
  page.addInitScript(() => {
    new MutationObserver(() => {
      const text = document.querySelector('main')?.textContent ?? '';
      if (text.includes('We couldn’t find that')) (window as unknown as { sawGone: boolean }).sawGone = true;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
const sawGone = (page: Page) => page.evaluate(() => Boolean((window as unknown as { sawGone?: boolean }).sawGone));

test('on a slow connection, Ana’s own assignment for either child never says it can’t be found', async ({ page, as, db }) => {
  const mine = await db.submission.findMany({ where: { student: { parent: { email: USERS.ana } } }, include: { assignment: true, student: true }, orderBy: { id: 'asc' } });
  const oneEach = [...new Map(mine.map((s) => [s.studentId, s])).values()];
  expect(oneEach.length, 'both of Ana’s children have work').toBe(2);
  await as('ana');
  await watchForMessage(page);
  await slowReads(page);
  for (const own of oneEach) {
    await page.goto(`/parent/learning/${own.id}`);
    await expect(page.getByRole('heading', { level: 1, name: own.assignment.title, exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(main(page)).toContainText(`For ${own.student.firstName}.`);
    expect(await sawGone(page), 'the "couldn’t find" message showed while her real assignment was loading').toBe(false);
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('on a slow connection, Vienne’s real pages never say they can’t be found', async ({ page, as, db }) => {
  const family = await db.user.findFirstOrThrow({ where: { email: USERS.ana } });
  const assignment = await db.assignment.findFirstOrThrow({ where: { submissions: { some: {} } } });
  const resource = await db.resource.findFirstOrThrow({ where: { deletedAt: null, title: { not: '' } } });
  const book = await db.book.findFirstOrThrow();
  const first = (book.tests as { key: string; name: string }[])[0];
  const report = await db.progressReport.findFirstOrThrow({ include: { student: true } });
  const conversation = await db.conversation.findFirstOrThrow({ where: { parentId: family.id } });

  await as('vienne');
  await watchForMessage(page);
  await slowReads(page);
  const pages: [string, string][] = [
    [`/admin/families/${family.id}`, family.name!],
    [`/admin/assignments/${assignment.id}`, assignment.title],
    [`/admin/content/${resource.id}`, resource.title],
    [`/admin/content/book/${book.id}/${first.key}`, `${first.name} answer key`],
    [`/admin/reports/${report.id}`, `Progress report for ${report.student.firstName}`],
  ];
  for (const [url, title] of pages) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true }), url).toBeVisible({ timeout: 30_000 });
    expect(await sawGone(page), `${url} showed the message while loading`).toBe(false);
  }
  await page.goto(`/admin/messages/${conversation.id}`);
  await expect(main(page).getByRole('link', { name: /^Parent of / })).toBeVisible({ timeout: 30_000 });
  expect(await sawGone(page), 'the conversation showed the message while loading').toBe(false);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a preview parent and a signed-out visitor get nothing of a family’s assignment by its address', async ({ page, as, db, browser }) => {
  const theirs = await db.submission.findFirstOrThrow({ where: { studentId: 's_mateo' }, include: { assignment: true } });
  const leak = (text: string) => ['Mateo', 'Mendoza', theirs.assignment.title].filter((s) => text.includes(s));

  const anon = await browser.newContext();
  const visitor = await anon.newPage();
  await visitor.goto(`/parent/learning/${theirs.id}`);
  await expect(visitor).toHaveURL(/\/sign-in/);
  expect(leak(await visitor.content())).toEqual([]);
  await anon.close();

  const bodies: Promise<string>[] = [];
  await as('tom');
  page.on('response', (r) => {
    if (/json|html|x-component|text\/plain/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  await page.goto(`/parent/learning/${theirs.id}`);
  await expect(main(page)).toContainText('invite code');
  await page.waitForLoadState('networkidle');
  expect(leak(await page.content())).toEqual([]);
  expect(leak((await Promise.all(bodies)).join('\n'))).toEqual([]);
});

test('a resource Vienne removed says so, with the way back to Content', async ({ page, as, db }) => {
  const resource = await db.resource.findFirstOrThrow({ where: { deletedAt: null, title: { not: '' } } });
  await db.resource.update({ where: { id: resource.id }, data: { deletedAt: new Date() } });
  await as('vienne');
  await page.goto(`/admin/content/${resource.id}`);
  await expect(main(page).getByText(gone('resource'), { exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Back to Content', exact: true })).toHaveAttribute('href', '/admin/content');
  await expect(main(page)).not.toContainText(resource.title);
  await db.resource.update({ where: { id: resource.id }, data: { deletedAt: null } });
});

test('a garbled, over-long address (a link pasted twice) still says so on every detail page', async ({ page, as, db }) => {
  const garbled = 'cmnotreal00s35000000000000'.repeat(3);
  const book = await db.book.findFirstOrThrow();
  const testKey = (book.tests as { key: string }[])[0].key;
  const expectGone = async (url: string, what: string, back: string, href: string) => {
    await page.goto(url);
    await expect.soft(main(page).getByText(gone(what), { exact: true }), url).toBeVisible({ timeout: 5_000 });
    await expect.soft(main(page).getByRole('link', { name: `Back to ${back}`, exact: true }), url).toHaveAttribute('href', href, { timeout: 1_000 });
    await expect.soft(page.getByLabel('Loading', { exact: true }), url).toHaveCount(0);
  };

  await as('vienne');
  await expectGone(`/admin/families/${garbled}`, 'family', 'Families', '/admin/families');
  await expectGone(`/admin/assignments/${garbled}`, 'assignment', 'Assignments', '/admin/assignments');
  await expectGone(`/admin/content/${garbled}`, 'resource', 'Content', '/admin/content');
  await expectGone(`/admin/content/book/${garbled}/${testKey}`, 'answer key', 'Content', '/admin/content');
  // A real book with a test that isn't in it.
  await expectGone(`/admin/content/book/${book.id}/ZZ99`, 'answer key', 'Content', '/admin/content');
  await expectGone(`/admin/content/book/${book.id}/${garbled}`, 'answer key', 'Content', '/admin/content');
  await expectGone(`/admin/reports/${garbled}`, 'report', 'Reports', '/admin/reports');
  await expectGone(`/admin/messages/${garbled}`, 'conversation', 'Messages', '/admin/messages');

  await page.context().clearCookies();
  await as('ana');
  await expectGone(`/parent/learning/${garbled}`, 'assignment', 'Learning', '/parent/learning');
});
