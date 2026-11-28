import type { Page } from '@playwright/test';
import { expect, freshData, openAs, test } from './support/fixtures';
import { openAlerts } from './support/ui';

/**
 * L2: "Request an invite" on the landing page. A signed-out visitor sends one, and Vienne finds it in her alerts.
 * Every request from this browser shares one IP bucket (REQUESTS_PER_IP_PER_HOUR), so this file sends one real
 * request; the LIMIT message is reached by filling the hour with earlier requests in the database.
 */
freshData();

const THANKS = 'Thanks. Vienne will email you soon.';
const LIMITED = 'You’ve sent a few requests already. Vienne will reply by email; try again later if you need to.';

const form = (page: Page) => page.getByRole('form', { name: 'Questions? Message Vienne' });

async function fillForm(page: Page, v: { name: string; email: string; phone?: string; grade: string; message: string }) {
  const f = form(page);
  await f.getByLabel('Parent name').fill(v.name);
  await f.getByLabel('Email').fill(v.email);
  if (v.phone) await f.getByLabel('Phone (optional)').fill(v.phone);
  await f.getByLabel(/Child.s grade \(K–6\)/).selectOption({ label: v.grade });
  await f.getByLabel('Message').fill(v.message);
}

test.describe.configure({ mode: 'serial' });

test('a signed-out visitor sends a request, and Vienne finds it in her alerts', async ({ page, db, browser }) => {
  await page.goto('/#request-invite');
  await fillForm(page, { name: 'Marisol Ortega', email: 'Marisol.Ortega@Example.com', phone: '305 555 0142', grade: 'Grade 2', message: 'My son needs help with fractions.' });
  await form(page).getByRole('button', { name: 'Send message' }).click();
  await expect(page.locator('#request-invite').getByText(THANKS)).toBeVisible();
  await expect(form(page)).toHaveCount(0);

  await expect.poll(() => db.inviteRequest.count()).toBe(1);
  const row = await db.inviteRequest.findFirstOrThrow();
  expect(row).toMatchObject({ parentName: 'Marisol Ortega', email: 'marisol.ortega@example.com', phone: '305 555 0142', grade: 2, message: 'My son needs help with fractions.' });
  expect(await db.notification.count({ where: { type: 'INVITE_REQUEST', inviteRequestId: row.id, user: { role: 'ADMIN' } } })).toBeGreaterThan(0);
  expect(await db.notification.count({ where: { type: 'INVITE_REQUEST', user: { role: 'PARENT' } } })).toBe(0);

  const vienne = await openAs(browser, 'vienne');
  try {
    await vienne.page.goto('/admin/today');
    const alerts = await openAlerts(vienne.page);
    const alert = alerts.getByText('Question from Marisol Ortega');
    await expect(alert).toBeVisible();
    await expect(alerts).toContainText('marisol.ortega@example.com');
    await expect(alerts).toContainText('My son needs help with fractions.');
    expect(vienne.errors).toEqual([]);
  } finally {
    await vienne.close();
  }
});

test('wrong input shows the plain message and sends nothing', async ({ page, db }) => {
  const before = await db.inviteRequest.count();
  await page.goto('/#request-invite');
  await form(page).getByRole('button', { name: 'Send message' }).click();
  await expect(form(page).getByRole('alert')).toHaveText('Add the parent’s name');

  await fillForm(page, { name: 'Dana Ruiz', email: 'not-an-email', grade: 'Kindergarten', message: '' });
  await form(page).getByRole('button', { name: 'Send message' }).click();
  await expect(form(page).getByRole('alert')).toHaveText('Check the email address');
  expect(await db.inviteRequest.count()).toBe(before);
});

test('when requests are paused for the hour, the form says so', async ({ page, db }) => {
  // Fill the hour (REQUESTS_PER_HOUR) with earlier requests from other visitors.
  const at = new Date(Date.now() - 60000);
  await db.inviteRequest.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ parentName: 'Earlier', email: `earlier.${i}@example.com`, grade: 1, message: '', ipHash: `e2e-${i}`, createdAt: at })) });
  try {
    await page.goto('/#request-invite');
    await fillForm(page, { name: 'Dana Ruiz', email: 'dana.ruiz@example.com', grade: 'Grade 4', message: 'Hello' });
    await form(page).getByRole('button', { name: 'Send message' }).click();
    await expect(form(page).getByRole('alert')).toHaveText(LIMITED);
    expect(await db.inviteRequest.count({ where: { email: 'dana.ruiz@example.com' } })).toBe(0);
  } finally {
    await db.inviteRequest.deleteMany({ where: { ipHash: { startsWith: 'e2e-' } } });
  }
});

test('@phone the form: 16px inputs on phones, and the honeypot is hidden from people and screen readers', async ({ page }) => {
  await page.goto('/#request-invite');
  const f = form(page);
  // docs/DESIGN.md → text-field: 16px on phones (iOS zooms below that), 14px from 768px.
  const want = (page.viewportSize()?.width ?? 0) < 768 ? '16px' : '14px';
  for (const label of ['Parent name', 'Email', 'Phone (optional)', /Child.s grade/, 'Message']) {
    expect(await f.getByLabel(label).evaluate((el) => getComputedStyle(el).fontSize), String(label)).toBe(want);
  }

  const honeypot = f.locator('input[name=website]');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot).toHaveAttribute('autocomplete', 'off');
  await expect(f.locator('[aria-hidden=true] input[name=website]')).toHaveCount(1);
  const box = await honeypot.boundingBox();
  expect(box === null || box.x + box.width <= 0).toBe(true);
  await expect(f.getByRole('textbox', { name: 'Website' })).toHaveCount(0);
  // Not reached with the keyboard: tabbing from Message goes to the button.
  await f.getByLabel('Message').focus();
  await page.keyboard.press('Tab');
  await expect(f.getByRole('button', { name: 'Send message' })).toBeFocused();
});
