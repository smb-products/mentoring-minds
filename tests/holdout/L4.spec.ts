/**
 * L4 holdouts: Landing C is public. The sample progress card names no real child and shows nothing live, the
 * restyled form keeps its trap away from people and says what to fix, signed-in people never see the page,
 * and it fits the widths between the phone and the desktop.
 */
import { expect, freshData, openAs, test, type Who } from '../e2e/support/fixtures';

freshData();

const HERO = 'Math tutoring that builds real confidence';

test('the sample card is labelled, names nobody in the data, and stays the same whatever the data says', async ({ page, db }) => {
  await page.goto('/');
  const card = page.locator('figure').filter({ hasText: 'Sample screen with demo data' });
  await expect(card).toBeVisible();
  const before = await card.innerText();
  const name = before.match(/Progress · (\p{L}+), grade/u)?.[1];
  expect(name).toBeTruthy();
  const [students, users] = [await db.student.findMany(), await db.user.findMany()];
  const known = [...students.flatMap((s) => [s.firstName, s.lastName]), ...users.flatMap((u) => (u.name ?? '').split(' '))];
  expect(known.map((n) => n?.toLowerCase())).not.toContain(name!.toLowerCase());

  const first = await db.student.findFirstOrThrow();
  await db.student.update({ where: { id: first.id }, data: { firstName: 'Zzholdout', adminNotes: 'ZZPRIVATE-NOTE' } });
  await db.settings.updateMany({ data: { defaultMeetingUrl: 'https://meet.example.com/ZZ-ROOM' } });
  await page.goto('/');
  expect(await card.innerText()).toBe(before);
  expect(await page.content()).not.toMatch(/Zzholdout|ZZPRIVATE|ZZ-ROOM/);
});

test('the empty form says what to add, and the trap field is out of reach of keyboard and screen reader', async ({ page, db }) => {
  const before = await db.inviteRequest.count();
  await page.goto('/#request-invite');
  const form = page.getByRole('form', { name: 'Questions? Message Vienne' });
  await expect(form.getByRole('textbox')).toHaveCount(4); // name, email, phone, message
  await expect(form.getByRole('textbox', { name: /website/i })).toHaveCount(0);
  await expect(form.locator('input[name=website]')).not.toBeInViewport();

  await form.getByLabel('Parent name').focus();
  const visited: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    visited.push(await page.evaluate(() => document.activeElement?.getAttribute('name') || document.activeElement?.textContent || ''));
  }
  expect(visited).toEqual(['email', 'phone', 'grade', 'message', 'Send message']);

  await page.keyboard.press('Enter');
  await expect(form.getByRole('alert')).toHaveText('Add the parent’s name');
  await expect(form.getByRole('alert')).toBeVisible();
  expect(await db.inviteRequest.count()).toBe(before);
});

test('signed-in people go home from /, and the widths between phone and desktop have no sideways scroll', async ({ page, browser }) => {
  const homes: [Who, string][] = [['ana', '/parent/home'], ['grace', '/parent/home'], ['tom', '/parent/home'], ['vienne', '/admin/today']];
  for (const [who, home] of homes) {
    const s = await openAs(browser, who);
    try {
      await s.page.goto('/');
      await expect.poll(() => new URL(s.page.url()).pathname, { message: who }).toBe(home);
      await expect(s.page.getByRole('heading', { name: HERO }), who).toHaveCount(0);
      expect(s.errors, who).toEqual([]);
    } finally {
      await s.close();
    }
  }

  for (const width of [360, 480, 481, 540, 639, 640, 768, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${width}px`).toBeLessThanOrEqual(width);
    // The header's links stay on screen and don't sit on the name.
    const header = page.locator('header').first();
    const name = (await header.getByRole('link', { name: /Mentoring Minds/ }).boundingBox())!;
    for (const link of await header.getByRole('navigation').getByRole('link').all()) {
      if (!(await link.isVisible())) continue;
      const b = (await link.boundingBox())!;
      expect(b.x + b.width, `${width}px`).toBeLessThanOrEqual(width);
      expect(b.x >= name.x + name.width || b.y >= name.y + name.height, `${width}px: a link sits on the name`).toBe(true);
    }
  }
});
