/**
 * S9 holdouts: a paused video-call family’s Messages sends nothing private to the browser, works when
 * reached from a locked page (with Vienne’s reply and an empty thread), and stays shut for others.
 */
import type { Page } from '@playwright/test';
import { expect, freshData, openAs, test } from '../e2e/support/fixtures';
import { main, openAlerts } from '../e2e/support/ui';

freshData();
test.describe.configure({ timeout: 90_000 });

const PAUSED = 'Your account is paused. Message Vienne to turn it back on.';
const LINK = 'https://meet.example.com/holdout-s9-room';
const NOTE = 'HOLDOUT-S9-ADMIN-NOTE';
const ANA_ONLY = 'HOLDOUT-S9-ANA-ONLY';

/** Every text response the page receives. */
function wire(page: Page) {
  const bodies: Promise<string>[] = [];
  page.on('response', (r) => {
    if (/json|html|text|x-component/.test(r.headers()['content-type'] ?? '')) bodies.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(bodies)).join('\n');
}

const nav = (page: Page, name: string) => page.getByRole('link', { name: new RegExp(`^(\\d+ ?)?${name}`) }).first();
const box = (page: Page) => page.getByRole('textbox', { name: 'Message' });

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a paused Grace: from a locked page to Messages and back, with nothing private and no other family', async ({ page, as, db }) => {
    await db.settings.update({ where: { id: 1 }, data: { defaultMeetingUrl: LINK } });
    await db.session.updateMany({ where: { mode: 'VIDEO' }, data: { meetingUrl: LINK } });
    await db.session.update({ where: { id: 'ses_live' }, data: { startsAt: new Date(Date.now() + 5 * 60_000), endsAt: new Date(Date.now() + 50 * 60_000), status: 'CONFIRMED' } });
    await db.student.updateMany({ data: { adminNotes: NOTE } });
    const ana = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_ana' } });
    await db.message.create({ data: { conversationId: ana.id, senderId: 'u_admin', body: ANA_ONLY } });
    await db.user.update({ where: { id: 'u_grace' }, data: { status: 'PAUSED' } });
    try {
      await as('grace');
      const received = wire(page);
      await page.goto('/parent/home');
      await expect(page.getByText(PAUSED)).toBeVisible();
      await expect(box(page)).toHaveCount(0);

      await nav(page, 'Messages').click();
      await expect(box(page)).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: PAUSED })).toBeVisible();

      // Spaces alone can't be sent; Enter sends a real message.
      await box(page).fill('    ');
      await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
      await box(page).fill('HOLDOUT-S9 Grace asks to come back');
      await box(page).press('Enter');
      await expect(page.getByRole('log', { name: 'Messages' }).getByText('HOLDOUT-S9 Grace asks to come back')).toBeVisible();
      await expect(box(page)).toHaveValue('');
      await expect(page.locator(`a[href="${LINK}"]`)).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Join call/ })).toHaveCount(0);
      await openAlerts(page);
      await page.keyboard.press('Escape');
      await page.waitForLoadState('networkidle');

      await page.goto('/parent/sessions');
      await expect(main(page).getByText('This opens again when Vienne turns your account back on.')).toBeVisible();
      await expect(box(page)).toHaveCount(0);
      await page.waitForLoadState('networkidle');

      const text = await received();
      expect(text).toContain('HOLDOUT-S9 Grace asks to come back');
      for (const secret of [LINK, NOTE, ANA_ONLY, 'Mateo']) expect(text, secret).not.toContain(secret);
    } finally {
      await db.user.update({ where: { id: 'u_grace' }, data: { status: 'ACTIVE' } });
    }
  });
});

test('a paused parent with an empty thread says hello, and reads Vienne’s reply', async ({ page, as, db, browser }) => {
  const thread = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_daniel' } });
  await db.message.deleteMany({ where: { conversationId: thread.id } });
  await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'PAUSED' } });
  try {
    await as('daniel');
    await page.goto('/parent/messages');
    await expect(main(page).getByText('No messages yet. Say hello.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: PAUSED })).toBeVisible();
    await box(page).fill('HOLDOUT-S9 hello from Daniel');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(main(page).getByText('HOLDOUT-S9 hello from Daniel')).toBeVisible();
    await expect(main(page).getByText('No messages yet. Say hello.')).toHaveCount(0);

    const vienne = await openAs(browser, 'vienne');
    await vienne.page.goto(`/admin/messages/${thread.id}`);
    await vienne.page.getByRole('textbox', { name: 'Message' }).fill('HOLDOUT-S9 reply from Vienne');
    await vienne.page.getByRole('button', { name: 'Send' }).click();
    await expect(vienne.page.getByRole('log', { name: 'Messages' }).getByText('HOLDOUT-S9 reply from Vienne')).toBeVisible();
    expect(vienne.errors).toEqual([]);
    await vienne.close();

    await page.reload();
    await expect(main(page).getByText('HOLDOUT-S9 reply from Vienne')).toBeVisible();
    // Opening the thread marks it read.
    await expect.poll(async () => {
      const [c, reply] = await Promise.all([
        db.conversation.findUniqueOrThrow({ where: { id: thread.id } }),
        db.message.findFirstOrThrow({ where: { body: 'HOLDOUT-S9 reply from Vienne' } }),
      ]);
      return Boolean(c.parentLastReadAt && c.parentLastReadAt >= reply.createdAt);
    }).toBe(true);
  } finally {
    await db.user.update({ where: { id: 'u_daniel' }, data: { status: 'ACTIVE' } });
  }
});

test('signed out and a preview parent get no thread: nothing of it reaches the browser', async ({ page, as, db }) => {
  const bodies = (await db.message.findMany()).map((m) => m.body);
  const received = wire(page);
  await page.goto('/parent/messages');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(box(page)).toHaveCount(0);

  await as('tom');
  await page.goto('/parent/home');
  await expect(page.getByText('Enter your invite code').first()).toBeVisible();
  await nav(page, 'Messages').click();
  await expect(main(page).getByText('This opens once you enter the invite code from Vienne.')).toBeVisible();
  await expect(box(page)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  const text = await received();
  // Tom's own welcome thread, if any, is locked too.
  expect(bodies.filter((b) => text.includes(b))).toEqual([]);
});
