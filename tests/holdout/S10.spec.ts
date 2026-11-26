/**
 * S10 holdouts: paused in the middle of something (a video call about to be joined, a child filling in
 * answers, a phone moving to an item or Progress), and nobody else is touched.
 */
import type { Page } from '@playwright/test';
import { expect, freshData, openAs, test } from '../e2e/support/fixtures';
import { main } from '../e2e/support/ui';

freshData();
test.describe.configure({ timeout: 90_000 });

const PAUSED = 'Your account is paused. Message Vienne to turn it back on.';
const LOCKED = 'This opens again when Vienne turns your account back on.';
const LINK = 'https://meet.example.com/holdout-s10-room';
const NOTE = 'HOLDOUT-S10-ADMIN-NOTE';

const nav = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^(\\d+ ?)?${name}`) }).first();

async function settled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

/** Every text response the page receives from now on. */
function wire(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (/json|html|text|x-component/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

/** A marker that a full reload would wipe. */
const mark = (page: Page) => page.evaluate(() => Object.assign(window, { __holdout: 'same page' }));
const notReloaded = async (page: Page) =>
  expect(await page.evaluate(() => (window as unknown as { __holdout?: string }).__holdout)).toBe('same page');

async function expectPaused(page: Page, where: string) {
  await expect(page.getByRole('status').filter({ hasText: PAUSED }), where).toBeVisible();
  await expect(main(page).getByText(LOCKED), where).toBeVisible();
  await settled(page);
  await expect(page.getByRole('dialog'), where).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Request a session|Fill in answers|Keep going|Join call|Hand it in/ }), where).toHaveCount(0);
  await expect(page.getByText('This page couldn’t load'), where).toHaveCount(0);
}

test.afterEach(async ({ db }) => {
  await db.user.updateMany({ where: { id: { in: ['u_ana', 'u_grace'] } }, data: { status: 'ACTIVE' } });
});

test('paused with a video session open: “Join call” opens no call, locks the page and sends no link or private note', async ({ page, as, db, context }) => {
  await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: LINK } });
  await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: LINK } });
  await db.session.update({ where: { id: 'ses_live' }, data: { startsAt: new Date(Date.now() + 5 * 60_000), endsAt: new Date(Date.now() + 50 * 60_000), status: 'CONFIRMED', callStartedAt: null } });
  await db.student.updateMany({ data: { adminNotes: NOTE } });

  await as('grace');
  await page.goto('/parent/home');
  await settled(page);
  await nav(page, 'Sessions').click();
  await expect(page).toHaveURL(/\/parent\/sessions$/);
  await settled(page);
  await main(page).getByRole('button', { name: /Video/ }).first().click();
  const join = page.getByRole('dialog').getByRole('button', { name: 'Join call' });
  await expect(join).toBeEnabled();
  await mark(page);

  await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
  const received = wire(page);
  let popups = 0;
  context.on('page', () => popups++);
  await join.click();
  await expectPaused(page, 'after the refused join');
  expect(popups).toBe(0);
  for (const name of ['Learning', 'Progress', 'Sessions', 'Home']) {
    await nav(page, name).click();
    await expect(page).toHaveURL(new RegExp(`/parent/${name.toLowerCase()}$`));
    await expectPaused(page, name);
  }
  await notReloaded(page);
  await expect(page.locator(`a[href="${LINK}"]`)).toHaveCount(0);
  const text = await received();
  expect(text).not.toContain(LINK);
  expect(text).not.toContain(NOTE);
  expect((await db.session.findUniqueOrThrow({ where: { id: 'ses_live' } })).callStartedAt).toBeNull();
});

test('paused while a child is filling in answers: the next save is refused and the paused page replaces the sheet', async ({ page, as, db }) => {
  await as('ana');
  const { id } = await db.submission.findFirstOrThrow({ where: { student: { parentId: 'u_ana' }, status: 'ASSIGNED', assignment: { kind: 'BOOK' } } });
  await page.goto(`/parent/learning/${id}`);
  await settled(page);
  await main(page).getByRole('button', { name: /^(Fill in answers|Keep going)/ }).click();
  const sheet = page.getByRole('dialog', { name: /answer sheet$/ });
  await expect(sheet).toBeVisible();
  await settled(page);
  await mark(page);
  const before = await db.submission.findUniqueOrThrow({ where: { id } });

  await db.user.update({ where: { id: 'u_ana' }, data: { status: 'PAUSED' } });
  // Type whatever this question takes: a letter, or a number on the pad. A photo question is skipped.
  for (let i = 0; i < 40; i++) {
    const letter = sheet.getByRole('radio', { name: 'C' }).or(sheet.getByRole('checkbox', { name: 'C' })).or(sheet.getByRole('button', { name: '7', exact: true }));
    if (await letter.count()) {
      await letter.first().click();
      break;
    }
    await sheet.getByRole('button', { name: /^(Skip for now|Next)$/ }).click();
  }
  await expectPaused(page, 'after the refused save');
  await notReloaded(page);
  const after = await db.submission.findUniqueOrThrow({ where: { id } });
  expect(after).toEqual(before);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const first of ['an item from the open list', 'Progress'] as const) {
    test(`paused, then ${first}: locked without a reload; Ana and a preview parent see no change`, async ({ page, as, db, browser }) => {
      await as('grace');
      await page.goto('/parent/learning');
      await settled(page);
      if (first !== 'Progress') await main(page).getByRole('tab', { name: /^Finished/ }).click();
      await mark(page);
      const ana = await openAs(browser, 'ana', { viewport: { width: 390, height: 844 } });
      const tom = await openAs(browser, 'tom', { viewport: { width: 390, height: 844 } });
      await ana.page.goto('/parent/home');
      await tom.page.goto('/parent/home');
      await settled(ana.page);
      await settled(tom.page);
      await mark(ana.page);
      await mark(tom.page);

      await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
      if (first === 'Progress') await nav(page, 'Progress').click();
      else await main(page).getByRole('button', { name: /Finished/ }).filter({ hasNot: page.getByRole('tab') }).last().click();
      await expect(page).toHaveURL(first === 'Progress' ? /\/parent\/progress$/ : /\/parent\/learning\/.+/);
      await expectPaused(page, first);
      await expect(main(page)).not.toContainText('Noah');
      await notReloaded(page);

      for (const other of [ana, tom]) {
        for (const name of ['Learning', 'Progress', 'Home']) {
          await nav(other.page, name).click();
          await expect(other.page).toHaveURL(new RegExp(`/parent/${name.toLowerCase()}$`));
          await settled(other.page);
          await expect(other.page.getByText(PAUSED), name).toHaveCount(0);
          await expect(other.page.getByText('This page couldn’t load'), name).toHaveCount(0);
        }
        await notReloaded(other.page);
        expect(other.errors).toEqual([]);
      }
      await expect(main(ana.page)).toContainText(/Mateo|Lucia/);
      await expect(tom.page.getByText('Enter your invite code').first()).toBeVisible();
      await ana.close();
      await tom.close();
    });
  }
});
