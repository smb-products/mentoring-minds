import { expect, openAs, requires, test } from './support/fixtures';
import { main, openAlerts } from './support/ui';

/** W3: Messages on both sides; Alerts. */
requires('messages', 'notifications');

test('Ana writes to Vienne; Vienne is alerted, opens the thread and replies; Ana sees the reply @phone', async ({ page, as, db, browser }) => {
  const text = `Can Mateo bring his book on Monday? (${test.info().project.name})`;
  await as('ana');
  await page.goto('/parent/messages');
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(main(page).getByText(text)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  const sent = await db.message.findFirstOrThrow({ where: { body: text }, include: { conversation: true } });
  expect(sent.conversation.parentId).toBe('u_ana');

  const vienne = await openAs(browser, 'vienne');
  await vienne.page.goto('/admin/today');
  const alerts = await openAlerts(vienne.page);
  await alerts.getByText('Ana Mendoza sent a message').first().click();
  await vienne.page.waitForURL(`**/admin/messages/${sent.conversationId}`);
  // The thread itself: on desktop the inbox row beside it previews the same message (CHANGES.md 2026-11-26).
  const thread = vienne.page.getByRole('log', { name: 'Messages' });
  await expect(thread.getByText(text)).toBeVisible();

  await vienne.page.getByRole('textbox', { name: 'Message' }).fill('Yes, please bring it.');
  await vienne.page.getByRole('button', { name: 'Send' }).click();
  await expect(thread.getByText('Yes, please bring it.')).toBeVisible();
  expect(vienne.errors).toEqual([]);
  await vienne.close();

  await page.goto('/parent/messages');
  await expect(main(page).getByText('Yes, please bring it.').last()).toBeVisible();
});

test('opening a family’s thread marks it read', async ({ page, as, db }) => {
  await as('vienne');
  const conversation = await db.conversation.findFirstOrThrow({ where: { parentId: 'u_daniel' } });
  const readUpTo = async () => (await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).adminLastReadAt;
  const before = await readUpTo();
  expect(before === null || before < conversation.lastMessageAt).toBe(true);
  await page.goto('/admin/messages');
  await main(page).getByText('Daniel Reyes').click();
  await page.waitForURL(`**/admin/messages/${conversation.id}`);
  await expect.poll(async () => ((await readUpTo()) ?? new Date(0)) >= conversation.lastMessageAt).toBe(true);
});

test('Mark all as read clears Vienne’s alerts', async ({ page, as, db }) => {
  await as('vienne');
  await page.goto('/admin/today');
  expect(await db.notification.count({ where: { userId: 'u_admin', readAt: null } })).toBeGreaterThan(0);
  const alerts = await openAlerts(page);
  await alerts.getByRole('button', { name: 'Mark all as read' }).click();
  await expect.poll(() => db.notification.count({ where: { userId: 'u_admin', readAt: null } })).toBe(0);
  await expect(alerts.getByLabel('Unread')).toHaveCount(0);
});

test('a parent only ever sees their own conversation', async ({ page, as }) => {
  await as('grace');
  await page.goto('/parent/messages');
  await expect(main(page)).not.toContainText('could Lucia get an extra session');
  // Asking for another family's thread directly is refused by the server.
  const other = await page.request.get('/admin/messages');
  expect(other.url()).toMatch(/\/parent\/home$/);
});
