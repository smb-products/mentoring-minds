/** W3 holdouts (browser): a reply never goes to the wrong family; Sign out forgets this device's push. */
import { expect, requires, test } from '../e2e/support/fixtures';
import { main, openAccount, openAlerts } from '../e2e/support/ui';

requires('messages', 'notifications');

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a half-typed reply to one family doesn’t follow Vienne into another family’s thread', async ({ page, as, db }) => {
    await db.notification.create({ data: { userId: 'u_admin', audience: 'ADMIN', type: 'MESSAGE_RECEIVED', title: 'Grace Kim sent a message', body: 'Demo alert', href: '/admin/messages/conv_grace' } });
    await as('vienne');
    await page.goto('/admin/messages/conv_ana');
    await expect(main(page)).toContainText('could Lucia get an extra session');
    const draft = 'Yes, Lucia can come Friday at 4.';
    await page.getByRole('textbox', { name: 'Message' }).fill(draft);

    const alerts = await openAlerts(page);
    await alerts.getByText('Grace Kim sent a message').first().click();
    await page.waitForURL('**/admin/messages/conv_grace');
    await expect(main(page)).toContainText('thank you for noticing that');
    await expect(page.getByRole('textbox', { name: 'Message' })).toHaveValue('');
  });
});

test('Sign out removes this device’s push subscription and leaves the parent’s other devices', async ({ page, as, db }) => {
  const here = 'https://fcm.googleapis.com/fcm/send/holdout-this-phone';
  const other = 'https://fcm.googleapis.com/fcm/send/holdout-other-device';
  for (const endpoint of [here, other]) await db.pushSubscription.create({ data: { userId: 'u_ana', endpoint, p256dh: 'demo-p256dh', auth: 'demo-auth' } });
  // The browser says this device is subscribed (headless Chromium has no push service).
  await page.addInitScript((endpoint) => {
    const sub = { endpoint, unsubscribe: async () => true };
    ServiceWorkerContainer.prototype.getRegistration = async () => ({ pushManager: { getSubscription: async () => sub } }) as unknown as ServiceWorkerRegistration;
  }, here);

  await as('ana');
  await page.goto('/parent/home');
  const panel = await openAccount(page);
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/sign-in**');
  await expect.poll(() => db.pushSubscription.count({ where: { endpoint: here } })).toBe(0);
  expect(await db.pushSubscription.count({ where: { endpoint: other, userId: 'u_ana' } })).toBe(1);
});
