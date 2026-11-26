import { expect, openAs, requires, test } from './support/fixtures';
import { main, openAlerts } from './support/ui';

/**
 * S9: the paused notice says "Message Vienne", so a paused parent's Messages opens: the notice above the
 * thread, and sending works. Every other parent route stays locked; a preview parent still needs the code.
 */
requires('messages', 'notifications');

const PAUSED = 'Your account is paused. Message Vienne to turn it back on.';

test.describe('a paused parent', () => {
  test.beforeEach(async ({ db }) => {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
  });
  test.afterEach(async ({ db }) => {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
  });

  test('sees the paused notice above the thread with Vienne, and sends her a message @phone', async ({ page, as, db, browser }) => {
    const text = `We are ready to start again, please turn us back on (${test.info().project.name})`;
    await as('daniel');
    await page.goto('/parent/messages');
    const notice = page.getByRole('status').filter({ hasText: PAUSED });
    await expect(notice).toBeVisible();
    await expect(main(page).getByText('Vienne Elliott').first()).toBeVisible();
    // Daniel's thread from the demo data.
    await expect(main(page).getByText('Sofia’s soccer practice moved to Wednesdays.', { exact: false })).toBeVisible();
    const box = page.getByRole('textbox', { name: 'Message' });
    const [n, b] = [await notice.boundingBox(), await box.boundingBox()];
    expect(n && b && n.y + n.height <= b.y, 'the notice is above the thread').toBe(true);
    await expect(main(page).getByText('This opens again when Vienne turns your account back on.')).toHaveCount(0);

    await box.fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(main(page).getByText(text)).toBeVisible();
    await expect(box).toHaveValue('');
    const sent = await db.message.findFirstOrThrow({ where: { body: text }, include: { conversation: true } });
    expect(sent.conversation.parentId).toBe('u_daniel');

    // Vienne gets it as from any family: the alert, and the message in the thread.
    const vienne = await openAs(browser, 'vienne');
    await vienne.page.goto('/admin/today');
    const alerts = await openAlerts(vienne.page);
    await alerts.getByText('Daniel Reyes sent a message').first().click();
    await vienne.page.waitForURL(`**/admin/messages/${sent.conversationId}`);
    await expect(vienne.page.getByRole('log', { name: 'Messages' }).getByText(text)).toBeVisible();
    expect(vienne.errors).toEqual([]);
    await vienne.close();
  });

  test('every other parent route still shows the locked page', async ({ page, as }) => {
    await as('daniel');
    for (const url of ['/parent/home', '/parent/sessions', '/parent/learning', '/parent/progress']) {
      await page.goto(url);
      await expect(page.getByText(PAUSED), url).toBeVisible();
      await expect(page.locator('[aria-busy="true"]'), url).toHaveCount(0, { timeout: 15_000 });
      await expect(main(page), url).not.toContainText('Sofia');
      await expect(page.getByText('This page couldn’t load'), url).toHaveCount(0);
    }
    await page.goto('/parent/sessions');
    await expect(main(page).getByText('This opens again when Vienne turns your account back on.')).toBeVisible();
  });
});

test('a preview parent’s Messages still asks for the invite code @phone', async ({ page, as }) => {
  await as('tom');
  await page.goto('/parent/messages');
  await expect(page.getByText('Enter your invite code').first()).toBeVisible();
  await expect(main(page).getByText('This opens once you enter the invite code from Vienne.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toHaveCount(0);
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0);
});
