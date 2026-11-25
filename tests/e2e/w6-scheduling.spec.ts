import type { Page } from '@playwright/test';
import { expect, openAs, requires, test } from './support/fixtures';
import { endNextSession, openCompleteForm } from './support/sessions';
import { expectToast, main } from './support/ui';

/** W6: request, confirm, decline, cancel; the timing rules; Join call; complete with a note. */
requires('scheduling', 'dashboard', 'families');

/**
 * Opens "Request a session" and picks a video call on the second open day, at its first time.
 * Not the first day: its earliest slot sits right at the minimum-notice edge and can expire mid-test.
 */
async function pickVideoSlot(page: Page) {
  await page.goto('/parent/sessions');
  await page.getByRole('button', { name: 'Request a session' }).first().click();
  const drawer = page.getByRole('dialog', { name: /Request a session/ });
  await drawer.getByRole('radio', { name: '45 min' }).click();
  await drawer.getByRole('radiogroup', { name: 'How' }).getByRole('radio', { name: 'Video call' }).click();
  await drawer.getByRole('radiogroup', { name: 'Day' }).getByRole('radio').nth(1).click();
  await drawer.getByRole('radiogroup', { name: /times$/ }).first().getByRole('radio').first().click();
  return drawer;
}

/** A request card on Vienne's Today screen. */
const requestCard = (page: Page, parentName: string) =>
  main(page).locator('div').filter({ hasText: new RegExp(`by ${parentName}`) }).filter({ has: page.getByRole('button', { name: 'Confirm' }) }).last();

test('Grace requests a video call; Vienne confirms it from Today; Grace sees it confirmed @phone', async ({ page, as, db, browser }) => {
  const before = await db.session.count({ where: { requestedById: 'u_grace', status: 'REQUESTED' } });
  await as('grace');
  const drawer = await pickVideoSlot(page);
  await drawer.getByLabel('Anything Vienne should know? (optional)').fill('Noah has a quiz Friday.');
  await drawer.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => db.session.count({ where: { requestedById: 'u_grace', status: 'REQUESTED' } })).toBe(before + 1);
  const requested = await db.session.findFirstOrThrow({ where: { requestedById: 'u_grace', status: 'REQUESTED', parentNote: 'Noah has a quiz Friday.' } });
  expect(requested).toMatchObject({ mode: 'VIDEO', durationMin: 45, studentId: 's_noah' });

  const vienne = await openAs(browser, 'vienne');
  await vienne.page.goto('/admin/today');
  await requestCard(vienne.page, 'Grace Kim').getByRole('button', { name: 'Confirm' }).click();
  await expectToast(vienne.page, 'Session confirmed');
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: requested.id } })).status).toBe('CONFIRMED');
  expect(await db.notification.count({ where: { userId: 'u_grace', type: 'SESSION_CONFIRMED' } })).toBeGreaterThan(0);
  expect(vienne.errors).toEqual([]);
  await vienne.close();

  await page.goto('/parent/sessions');
  await expect(main(page)).toContainText('Confirmed');
});

test('two families asking for the same time: the second is told it was just booked', async ({ page, as, db, browser }) => {
  await as('grace');
  const graceDrawer = await pickVideoSlot(page);

  const anaBefore = await db.session.count({ where: { requestedById: 'u_ana', status: 'REQUESTED', mode: 'VIDEO' } });
  const ana = await openAs(browser, 'ana');
  const anaDrawer = await pickVideoSlot(ana.page);
  await anaDrawer.getByRole('button', { name: 'Send request' }).click();
  await expect.poll(() => db.session.count({ where: { requestedById: 'u_ana', status: 'REQUESTED', mode: 'VIDEO' } })).toBe(anaBefore + 1);
  await ana.close();

  await graceDrawer.getByRole('button', { name: 'Send request' }).click();
  await expectToast(page, 'That time was just booked.');
});

test('Vienne declines a request with a reason', async ({ page, as, db }) => {
  const keisha = await db.session.findFirstOrThrow({ where: { requestedById: 'u_keisha', status: 'REQUESTED' } });
  await as('vienne');
  await page.goto('/admin/today');
  await requestCard(page, 'Keisha Brooks').getByRole('button', { name: 'Decline' }).click();
  const drawer = page.getByRole('dialog', { name: /Decline request/ });
  await drawer.getByLabel('Reason (optional)').fill('I’m booked then. Could Thursday work?');
  await drawer.getByRole('button', { name: 'Decline request' }).click();
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: keisha.id } })).status).toBe('DECLINED');
  expect((await db.session.findUniqueOrThrow({ where: { id: keisha.id } })).declineReason).toBe('I’m booked then. Could Thursday work?');
});

test('Grace cancels a session a week away', async ({ page, as, db }) => {
  const weekAway = await db.session.findFirstOrThrow({
    where: { student: { parentId: 'u_grace' }, status: 'CONFIRMED', startsAt: { gt: new Date(Date.now() + 3 * 86_400_000) } },
    orderBy: { startsAt: 'asc' },
  });
  await as('grace');
  await page.goto('/parent/sessions');
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: 'numeric' }).format(weekAway.startsAt);
  await main(page).getByRole('button', { name: new RegExp(`^${day} `) }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel session' }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Cancel session/ }).last();
  await confirm.click();
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: weekAway.id } })).status).toBe('CANCELLED');
});

test('Join call opens Vienne’s video link shortly before the start, and marks the call started @phone', async ({ page, as, db, context }) => {
  const soon = await db.session.findFirstOrThrow({ where: { student: { parentId: 'u_grace' }, status: 'CONFIRMED', mode: 'VIDEO', startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
  // Move it to start in 3 minutes (inside the join window).
  const startsAt = new Date(Date.now() + 3 * 60_000);
  await db.session.update({ where: { id: soon.id }, data: { startsAt, endsAt: new Date(startsAt.getTime() + soon.durationMin * 60_000), callStartedAt: null } });
  expect(soon.meetingUrl).toBeTruthy();
  // Don't actually visit the meeting site.
  await context.route(`${new URL(soon.meetingUrl!).origin}/**`, (r) => r.fulfill({ body: 'meeting' }));
  await as('grace');
  await page.goto('/parent/home');
  const [call] = await Promise.all([page.waitForEvent('popup'), main(page).getByRole('button', { name: 'Join call' }).click()]);
  expect(call.url()).toBe(soon.meetingUrl);
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: soon.id } })).callStartedAt).not.toBeNull();
});

test('Vienne completes a finished session with a note the family can read', async ({ page, as, db, browser }) => {
  const s = await endNextSession(db, 's_sofia');
  await as('vienne');
  const form = await openCompleteForm(page, 'Sofia Reyes', s.label);
  await form.getByLabel('What you worked on').fill('Equivalent fractions with strips. Sofia explained her thinking out loud.');
  await form.getByRole('button', { name: 'Complete session' }).click();
  await expect.poll(async () => (await db.session.findUniqueOrThrow({ where: { id: s.id } })).status).toBe('COMPLETED');

  const daniel = await openAs(browser, 'daniel');
  await daniel.page.goto('/parent/home');
  await expect(main(daniel.page)).toContainText('Equivalent fractions with strips');
  await daniel.close();
});
