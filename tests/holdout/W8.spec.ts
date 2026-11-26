/**
 * W8 holdouts: with the in-browser mock gone, nothing private from the demo families is shipped to
 * a browser, a shared browser never keeps the last parent’s family, and a PREVIEW or signed-out
 * visitor gets nobody’s.
 */
import type { Page } from '@playwright/test';
import { expect, requires, signIn, test } from '../e2e/support/fixtures';
import { main, openAccount } from '../e2e/support/ui';

requires('families', 'scheduling', 'messages', 'dashboard');

const ROOM = 'mmv-tutr-room';
/** Things only Vienne may read: private student notes, her time-off reason, invite codes, her alerts. */
const VIENNES = [
  'Loves soccer stats',
  'Gets anxious with timed work',
  'Fades after about 45 minutes',
  'Bring the counting bears',
  'Family trip',
  // Not MM-4D8F: the invite form shows it as its “a code like…” example.
  'MM-7K4Q',
  'MM-9RT2',
  'MM-2B9X',
  'HOLDOUT-W8-PRIVATE-NOTE',
  'New request from Keisha Brooks',
  'Amir has a dentist appointment',
];
const PARENT_PAGES = ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/progress', '/parent/messages'];

/** Every text body the browser receives from here on: pages, scripts and data. */
function record(page: Page) {
  const bodies: { url: string; type: string; text: Promise<string> }[] = [];
  page.on('response', (r) => {
    if (/image|font|pdf/.test(r.headers()['content-type'] ?? '')) return;
    bodies.push({ url: r.url(), type: r.request().resourceType(), text: r.text().catch(() => '') });
  });
  return async (only?: (type: string) => boolean) => Promise.all(bodies.filter((b) => !only || only(b.type)).map(async (b) => ({ url: b.url, text: await b.text })));
}

const found = (bodies: { url: string; text: string }[], secrets: string[]) =>
  secrets.flatMap((s) => bodies.filter((b) => b.text.includes(s)).map((b) => `${s} in ${new URL(b.url).pathname}`));

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(main(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
}

test('nothing a signed-out visitor or a parent downloads holds the demo’s private data', async ({ page, as, db }) => {
  test.setTimeout(90_000);
  const session = await db.session.findFirstOrThrow({ where: { studentId: 's_mateo', status: 'COMPLETED', note: { isNot: null } } });
  await db.sessionNote.update({ where: { sessionId: session.id }, data: { summary: 'HOLDOUT-W8-PRIVATE-NOTE', sharedWithParent: false } });
  const received = record(page);

  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await page.goto('/parent/home');
  await page.waitForURL('**/sign-in**');
  await page.waitForLoadState('networkidle');
  expect(found(await received(), [...VIENNES, ROOM, 'Mateo', 'Mendoza', 'Grace Kim'])).toEqual([]);

  await as('ana');
  for (const path of PARENT_PAGES) await visit(page, path);
  await visit(page, '/parent/home');
  await expect(main(page)).toContainText('Mateo');
  // Grace's family and the video room are none of Ana's business.
  expect(found(await received(), [...VIENNES, ROOM, 'grace.kim@example.com', 'Grace Kim', 'Noah Kim'])).toEqual([]);
});

test('the app’s scripts carry no demo family, even on Vienne’s screens', async ({ page, as }) => {
  test.setTimeout(90_000);
  const received = record(page);
  await as('vienne');
  for (const path of ['/admin/today', '/admin/schedule', '/admin/families', '/admin/content', '/admin/assignments', '/admin/messages', '/admin/settings']) await visit(page, path);
  const scripts = await received((type) => type === 'script');
  expect(scripts.length).toBeGreaterThan(0);
  expect(found(scripts, [...VIENNES, ROOM, 'Mendoza', 'grace.kim@example.com', 'Coral Terrace Elementary'])).toEqual([]);
});

test('one browser, one parent after another: nothing of the last family stays, and PREVIEW or signed out sees none', async ({ page }) => {
  test.setTimeout(120_000);
  const signOut = async () => {
    const panel = await openAccount(page);
    await panel.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in**');
  };

  await signIn(page, 'ana');
  await expect(main(page)).toContainText('Mateo');
  await signOut();

  const received = record(page);
  await signIn(page, 'grace');
  for (const path of PARENT_PAGES) {
    await visit(page, path);
    await expect(page.locator('body')).not.toContainText(/Mateo|Lucia|Mendoza/);
  }
  await visit(page, '/parent/home');
  await expect(main(page)).toContainText('Noah');
  const graces = await received();
  expect(found(graces, [...VIENNES, 'Mateo', 'Mendoza'])).toEqual([]);
  // Noah's call is about to start, so Grace does get the room: the recording does see server data.
  expect(found(graces, [ROOM]).length).toBeGreaterThan(0);
  await signOut();

  const toms = record(page);
  await signIn(page, 'tom');
  // Not Messages: a PREVIEW parent’s thread is refused there, which the browser logs. That predates W8.
  for (const path of PARENT_PAGES.filter((p) => p !== '/parent/messages')) {
    await visit(page, path);
    await expect(page.locator('body')).not.toContainText(/Mateo|Lucia|Mendoza|Noah/);
  }
  expect(found(await toms(), [...VIENNES, ROOM, 'Mateo', 'Noah', 'Mendoza'])).toEqual([]);
  await signOut();

  for (const path of ['/parent/home', '/parent/sessions', '/admin/families']) {
    await page.goto(path);
    await page.waitForURL('**/sign-in**');
    await expect(page.locator('body')).not.toContainText(/Mateo|Noah|Mendoza/);
  }
});
