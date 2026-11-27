import type { Page } from '@playwright/test';
import type { e2eDb } from './support/db';
import { expect, freshData, test } from './support/fixtures';
import { chooseChild, main } from './support/ui';

/**
 * R2 (docs/DESIGN.md): the parent screens on the new look. Phone first: Home's Next session card is in view
 * without scrolling, the navy band ends above the child chips, nothing scrolls sideways, and "Stars earned"
 * is gone from the stats (stars stay beside the homework). At 1280×800 the band is 140px or less and nothing
 * on the page overlaps it. The fixture fails any test that logs a console error.
 */
freshData();

type Db = ReturnType<typeof e2eDb>;

/** A confirmed video session three days out for each of Ana's children, so Home has a Next session card. */
async function bookUpcoming(db: Db) {
  const kids = await db.student.findMany({ where: { parentId: 'u_ana' } });
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  startsAt.setUTCMinutes(0, 0, 0);
  for (const kid of kids) {
    await db.session.create({
      data: { studentId: kid.id, subjectId: 'sub_math', mode: 'VIDEO', requestedById: 'u_ana', startsAt, endsAt: new Date(+startsAt + 3_600_000), durationMin: 60, status: 'CONFIRMED', confirmedAt: new Date() },
    });
  }
  return kids;
}

async function parentRoutes(db: Db) {
  const sub = await db.submission.findFirstOrThrow({ where: { student: { parentId: 'u_ana' } }, orderBy: { id: 'asc' } });
  return ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/messages', '/parent/progress', `/parent/learning/${sub.id}`];
}

async function settle(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[aria-busy="true"]'), `${url} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
}

/** The navy header band: the shell's bg-ink block that holds the page title. */
const band = (page: Page) => page.locator('.bg-ink', { has: page.getByRole('heading', { level: 1 }) }).first();

async function box(page: Page, locator: ReturnType<Page['locator']>) {
  const b = await locator.boundingBox();
  expect(b, 'element has no box').not.toBeNull();
  return b!;
}

test('phone Home: the band ends above the child chips and the Next session card is fully in view without scrolling @phone', async ({ page, as, db }) => {
  await bookUpcoming(db);
  await as('ana');
  await settle(page, '/parent/home');

  const card = main(page).getByRole('button', { name: /Next session/ });
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const chips = page.getByRole('tablist', { name: 'Choose a child' });
  await expect(chips).toBeVisible();
  const b = await box(page, band(page));
  expect(b.y + b.height, 'the band reaches into the child chips').toBeLessThanOrEqual((await box(page, chips)).y);
  // The stat row sits on the gray page too.
  const stats = main(page).getByRole('region', { name: 'Key numbers' });
  expect((await box(page, stats)).y).toBeGreaterThanOrEqual(b.y + b.height);
});

test('no parent screen scrolls sideways, and "Stars earned" is gone from Home and Progress @phone', async ({ page, as, db }) => {
  await as('ana');
  for (const url of await parentRoutes(db)) {
    await settle(page, url);
    const widths = await page.evaluate(() => {
      const h1 = document.querySelector('main h1') ?? document.querySelector('h1');
      let scroller = h1?.parentElement ?? null;
      while (scroller && getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement;
      return [document.documentElement, document.body, scroller].filter(Boolean).map((el) => ({ scroll: el!.scrollWidth, client: el!.clientWidth }));
    });
    for (const w of widths) expect(w.scroll, `${url} scrolls sideways`).toBeLessThanOrEqual(w.client);
    if (url === '/parent/home' || url === '/parent/progress') await expect(page.getByText('Stars earned'), url).toHaveCount(0);
  }
});

test('stars stay beside the homework: a graded assignment shows its stars on Progress and Learning', async ({ page, as, db }) => {
  const graded = await db.submission.findFirstOrThrow({ where: { status: 'GRADED', student: { parentId: 'u_ana' } }, include: { student: true } });
  await as('ana');
  for (const url of ['/parent/progress', '/parent/learning']) {
    await settle(page, url);
    await chooseChild(page, graded.student.firstName);
    if (url === '/parent/learning') await page.getByRole('tab', { name: 'Finished' }).click();
    await expect(main(page).getByRole('img', { name: /of 3 stars/ }).first(), url).toBeVisible();
  }
  await settle(page, `/parent/learning/${graded.id}`);
  await expect(main(page).getByRole('img', { name: /of 3 stars/ })).toBeVisible();
});

test('at 1280×800 the band holds only back, title, subtitle and actions: 140px or less, and nothing overlaps it', async ({ page, as, db }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await bookUpcoming(db);
  await as('ana');
  for (const url of await parentRoutes(db)) {
    await settle(page, url);
    const b = await box(page, band(page));
    expect(b.height, `${url}: the band is too tall`).toBeLessThanOrEqual(140);
    // The page's content starts below the band, not pulled up over it.
    const below = await band(page).evaluate((el) => (el.nextElementSibling as HTMLElement).getBoundingClientRect().top);
    expect(below, `${url}: content overlaps the band`).toBeGreaterThanOrEqual(b.y + b.height - 0.5);
    for (const name of ['Choose a child', 'Key numbers']) {
      const el = main(page).getByRole(name === 'Key numbers' ? 'region' : 'tablist', { name });
      if (await el.count()) expect((await box(page, el)).y, `${url}: ${name} is on the band`).toBeGreaterThanOrEqual(b.y + b.height);
    }
  }
});
