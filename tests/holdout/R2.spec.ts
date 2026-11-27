/**
 * R2 holdouts: the restyled parent screens still show each person only their own. Grace's screens and session
 * drawers never carry Ana's family, Vienne's private notes or a video link before the join window (on the page
 * or in anything the browser downloads); a preview parent gets locked pages; and a child with nothing yet gets
 * plain empty states on a phone-sized screen.
 */
import type { Page } from '@playwright/test';
import { expect, freshData, test } from '../e2e/support/fixtures';
import { chooseChild, main } from '../e2e/support/ui';

freshData();

const PHONE = { width: 390, height: 844 };

/** Every text body the browser downloads, so data that is sent but not drawn counts too. */
function record(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (/json|html|x-component|text\/plain/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

async function settle(page: Page, url: string) {
  await page.goto(url);
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

const fits = (page: Page) =>
  page.evaluate(() => {
    const els = [document.documentElement, ...document.querySelectorAll('*')].filter(
      (el) => el === document.documentElement || getComputedStyle(el).overflowY === 'auto',
    );
    return els.every((el) => el.scrollWidth <= el.clientWidth);
  });

test('Grace’s restyled screens and drawers: nothing of Ana’s, no private note, no video link before the window', async ({ page, as, db }) => {
  const link = 'https://meet.example.com/HOLDOUT-ROOM';
  await db.student.update({ where: { id: 's_noah' }, data: { adminNotes: 'HOLDOUT-ADMIN-NOTE' } });
  // Every one of Noah's video sessions carries the marker link, and none is inside its join window.
  const soon = await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } });
  const startsAt = new Date(+soon.startsAt + 2 * 86_400_000);
  await db.session.update({ where: { id: soon.id }, data: { startsAt, endsAt: new Date(+startsAt + soon.durationMin * 60_000) } });
  await db.session.updateMany({ where: { studentId: 's_noah', mode: 'VIDEO' }, data: { meetingUrl: link } });
  const past = await db.session.findFirstOrThrow({ where: { studentId: 's_noah', status: 'COMPLETED' }, orderBy: { startsAt: 'desc' } });
  const note = { attendance: 'PRESENT' as const, summary: 'HOLDOUT-PRIVATE-NOTE', homework: 'HOLDOUT-PRIVATE-HOMEWORK', sharedWithParent: false };
  await db.sessionNote.upsert({ where: { sessionId: past.id }, create: { sessionId: past.id, ...note }, update: note });
  const anas = await db.submission.findFirstOrThrow({ where: { studentId: 's_mateo', status: 'GRADED' }, include: { assignment: true } });

  await as('grace');
  const downloaded = record(page);
  const forbidden = /HOLDOUT-|Mateo|Lucia|Mendoza|ana\.mendoza|912 Ponce|soccer stats/;
  const check = async (label: string) => expect(await page.content(), label).not.toMatch(forbidden);

  for (const url of ['/parent/home', '/parent/learning', '/parent/messages', '/parent/progress']) {
    await settle(page, url);
    await check(url);
  }
  await settle(page, '/parent/home');
  await expect(main(page)).toContainText('Noah');
  await expect(page.getByText('Stars earned')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join call' })).toHaveCount(0);
  await main(page).getByRole('button', { name: /Next session/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('Home: next session drawer');

  await settle(page, '/parent/sessions');
  await check('/parent/sessions');
  await main(page).getByRole('button', { name: /Noah with Vienne/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('upcoming session drawer');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Past' }).click();
  await check('past sessions');
  await main(page).getByRole('button', { name: /Noah with Vienne/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('past session drawer');

  // Ana's graded homework, opened by its address: none of it comes back.
  await page.goto(`/parent/learning/${anas.id}`);
  await expect(page.getByRole('complementary', { name: 'Main navigation' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await check('Ana’s assignment page');
  await expect(main(page).getByRole('img', { name: /of 3 stars/ })).toHaveCount(0);

  const all = await downloaded();
  expect(all, 'the downloads were read').toContain('Noah');
  expect(all).not.toMatch(forbidden);
});

test('a preview parent’s restyled screens on a phone are locked: no stats, no child, nothing sideways', async ({ page, as }) => {
  await page.setViewportSize(PHONE);
  await as('tom');
  const downloaded = record(page);
  for (const url of ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/progress', '/parent/learning/sb_mateo_m1']) {
    await settle(page, url);
    await expect(main(page), url).toContainText('invite code');
    await expect(page.getByRole('region', { name: 'Key numbers' }), url).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Choose a child' }), url).toHaveCount(0);
    expect(await fits(page), `${url} scrolls sideways`).toBe(true);
  }
  expect(await downloaded()).not.toMatch(/Mateo|Lucia|Noah|Sofia|Mendoza|Grace Kim|meetingUrl":"http/);
});

test('a child with nothing yet: plain empty states on a phone, no stars figure, nothing sideways', async ({ page, as, db }) => {
  await db.session.deleteMany({ where: { studentId: 's_sofia' } });
  await db.submission.deleteMany({ where: { studentId: 's_sofia' } });
  await db.progressReport.deleteMany({ where: { studentId: 's_sofia' } });
  await db.fastResult.deleteMany({ where: { studentId: 's_sofia' } });
  await page.setViewportSize(PHONE);
  await as('daniel');
  await chooseChildIfMany(page);

  const empty: [string, string[]][] = [
    ['/parent/home', ['Nothing booked yet', 'All done', 'No notes yet']],
    ['/parent/sessions', ['Nothing confirmed yet']],
    ['/parent/learning', []],
    ['/parent/progress', []],
  ];
  for (const [url, words] of empty) {
    await settle(page, url);
    for (const text of words) await expect(main(page), url).toContainText(text);
    await expect(page.getByText('Stars earned'), url).toHaveCount(0);
    await expect(main(page).getByRole('img', { name: /of 3 stars/ }), url).toHaveCount(0);
    expect(await main(page).innerText(), url).not.toMatch(/undefined|NaN|\bnull\b|Invalid Date/);
    expect(await fits(page), `${url} scrolls sideways`).toBe(true);
  }
  await settle(page, '/parent/sessions');
  await page.getByRole('tab', { name: 'Past' }).click();
  await expect(main(page)).toContainText('No past sessions yet');
});

/** Daniel may have more than one child; Sofia is the one with nothing. */
async function chooseChildIfMany(page: Page) {
  await settle(page, '/parent/home');
  if (await page.getByRole('tablist', { name: 'Choose a child' }).count()) await chooseChild(page, 'Sofia');
}
