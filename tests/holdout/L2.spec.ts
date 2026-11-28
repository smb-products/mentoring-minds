import type { Page } from '@playwright/test';
import { expect, freshData, openAs, test, type Who } from '../e2e/support/fixtures';
import { openAlerts } from '../e2e/support/ui';

/**
 * L2 holdout: the "Request an invite" form as a person uses it. A message typed over several lines, a repeat
 * from the same email, who can read the request afterwards, and what wrong input shows.
 * (One browser is one visitor to the rate limit, so this file stores a single request.)
 */
freshData();
test.describe.configure({ mode: 'serial' });

const THANKS = 'Thanks. Vienne will email you soon.';
const EMAIL = 'rosa.delgado@example.com';
const form = (page: Page) => page.getByRole('form', { name: 'Questions? Message Vienne' });

async function send(page: Page, message: string[]) {
  // A fresh load each time: going to the same #anchor again wouldn't reload the page.
  await page.goto('about:blank');
  await page.goto('/#request-invite');
  const f = form(page);
  await f.getByLabel('Parent name').fill('Rosa Delgado');
  await f.getByLabel('Email').fill(EMAIL);
  await f.getByLabel(/Child.s grade/).selectOption({ label: 'Kindergarten' });
  // Typed, with the Enter key, as a parent would.
  await f.getByLabel('Message').click();
  for (const [i, line] of message.entries()) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(line);
  }
  await f.getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#request-invite').getByText(THANKS)).toBeVisible();
}

test('a message on several lines arrives, a repeat looks the same, and only Vienne can read the request', async ({ page, db, browser }) => {
  await send(page, ['First line about reading.', 'Second line about Tuesdays.']);
  await expect.poll(() => db.inviteRequest.count()).toBe(1);
  expect((await db.inviteRequest.findFirstOrThrow()).message).toBe('First line about reading.\nSecond line about Tuesdays.');
  // The thank-you repeats nothing back, and a reload doesn't bring the details back.
  await expect(page.locator('#request-invite')).not.toContainText(/Rosa|rosa\.delgado|Tuesdays/);

  await send(page, ['Asking a second time.']);
  expect(await db.inviteRequest.count()).toBe(1);
  expect(await page.content()).not.toMatch(/Rosa Delgado|rosa\.delgado|Second line about Tuesdays/);

  for (const who of ['ana', 'grace', 'tom'] as Who[]) {
    const s = await openAs(browser, who);
    try {
      await s.page.goto('/parent/home');
      const panel = await openAlerts(s.page);
      await s.page.waitForLoadState('networkidle');
      await expect(panel, who).not.toContainText(/Invite request|Rosa Delgado|rosa\.delgado|Tuesdays/);
      // Vienne's page isn't theirs either.
      await s.page.goto('/admin/families');
      await expect(s.page, who).not.toHaveURL(/\/admin/);
      expect(await s.page.content(), who).not.toMatch(/Rosa Delgado|rosa\.delgado/);
      expect(s.errors).toEqual([]);
    } finally {
      await s.close();
    }
  }
});

test('wrong input says what to fix, keeps what was typed without echoing it, and stores nothing', async ({ page, db }) => {
  const before = await db.inviteRequest.count();
  await page.goto('/#request-invite');
  const f = form(page);
  await f.getByLabel('Parent name').fill('Dana Ruiz');
  await f.getByLabel('Email').fill('dana.ruiz@example.com');
  await f.getByLabel('Message').fill('Please call after five.');
  const submit = f.getByRole('button', { name: 'Send message' });

  await submit.click();
  await expect(f.getByRole('alert')).toHaveText('Choose your child’s grade');

  await f.getByLabel(/Child.s grade/).selectOption({ label: 'Grade 6' });
  await f.getByLabel('Phone (optional)').fill('call me maybe');
  await submit.click();
  await expect(f.getByRole('alert')).toHaveText('Use only numbers, spaces and + ( ) - . in the phone number');
  await expect(f.getByLabel('Phone (optional)')).toHaveValue('call me maybe');
  await expect(f.getByLabel('Message')).toHaveValue('Please call after five.');
  await expect(page.locator('#request-invite').getByText(THANKS)).toHaveCount(0);
  expect(await db.inviteRequest.count()).toBe(before);
});
