/**
 * P1 holdouts: the new shell shows only the signed-in person's own name and counts, it holds with nothing to
 * count, a count past nine and a very long name, and what moved from the navy band onto the light page (and
 * into the white sidebar) is still readable in light and dark.
 */
import type { Locator, Page } from '@playwright/test';
import { DEMO_PASSWORD } from '../../prisma/data';
import type { e2eDb } from '../../tests/e2e/support/db';
import { expect, freshData, openAs, test, USERS } from '../../tests/e2e/support/fixtures';
import { main, openAccount } from '../../tests/e2e/support/ui';

freshData();

const sidebarOf = (page: Page) => page.getByRole('complementary', { name: 'Main navigation' });

async function settle(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

/** Nothing unread for anyone: every thread read, every alert read. */
async function allRead(db: ReturnType<typeof e2eDb>) {
  // Past any message a test here dates ahead.
  const later = new Date(Date.now() + 3_600_000);
  await db.conversation.updateMany({ data: { parentLastReadAt: later, adminLastReadAt: later } });
  await db.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
}

/** No homework waiting for this parent's children. */
const nothingToDo = (db: ReturnType<typeof e2eDb>, parentId: string) =>
  db.submission.updateMany({ where: { status: { in: ['ASSIGNED', 'RETURNED'] }, student: { parentId } }, data: { status: 'GRADED' } });

/** The sidebar's text that is only a count. */
const counts = (sidebar: Locator) => sidebar.getByText(/^(\d+|9\+)$/);

test('each parent’s shell has only their own name and counts; a preview parent has none, and signed out there is no shell', async ({ browser, page, db }) => {
  await db.student.updateMany({ data: { adminNotes: 'HOLDOUT-ADMIN-NOTE' } });
  await allRead(db);
  await nothingToDo(db, 'u_grace');
  const conv = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_ana' } });
  // Dated after "everything read", so it is Ana's one unread message.
  await db.message.create({ data: { conversationId: conv.id, senderId: 'u_admin', body: 'HOLDOUT-FOR-ANA', createdAt: new Date(Date.now() + 900_000) } });
  await db.notification.create({ data: { userId: 'u_ana', audience: 'PARENT', type: 'MESSAGE', title: 'HOLDOUT-ALERT-FOR-ANA' } });

  for (const [who, name, others] of [
    ['ana', 'Ana Mendoza', /Grace Kim|Noah|Sofia|Tom Hughes/],
    ['grace', 'Grace Kim', /Ana Mendoza|Mateo|Lucia|Sofia|Tom Hughes|HOLDOUT-FOR-ANA|HOLDOUT-ALERT-FOR-ANA/],
    ['tom', 'Tom Hughes', /Ana Mendoza|Mateo|Lucia|Noah|Sofia|Grace Kim|HOLDOUT-/],
  ] as const) {
    const s = await openAs(browser, who);
    await settle(s.page, '/parent/home');
    const sidebar = sidebarOf(s.page);
    const account = sidebar.getByRole('button', { name: /^Account/ });
    await expect(account, who).toContainText(name);
    await expect(account, who).toContainText('Parent');
    await expect(account, who).not.toContainText('Admin');
    expect(await sidebar.innerText(), who).not.toMatch(others);
    await expect(sidebar.getByRole('link', { name: /Families|Work/ }), who).toHaveCount(0);
    if (who === 'ana') {
      await expect(sidebar.getByRole('link', { name: /^Messages/ }).getByText('1', { exact: true })).toBeVisible();
      await expect(sidebar.getByRole('button', { name: /Alerts/ }).getByText('1', { exact: true })).toBeVisible();
    } else {
      await expect(counts(sidebar), `${who} has nothing to count`).toHaveCount(0);
    }
    const panel = await openAccount(s.page);
    expect(await panel.innerText(), who).not.toMatch(others);
    expect(await s.page.content(), who).not.toMatch(others);
    expect(await s.page.content(), who).not.toMatch(/HOLDOUT-ADMIN-NOTE/);
    expect(s.errors).toEqual([]);
    await s.close();
  }

  for (const url of ['/parent/home', '/admin/today']) {
    await page.goto(url);
    await expect(page, url).toHaveURL(/\/sign-in$/);
    await page.waitForLoadState('networkidle');
    await expect(sidebarOf(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
    expect(await page.content()).not.toMatch(/Ana Mendoza|Grace Kim|HOLDOUT-/);
  }
});

test('with nothing to count there are no badges; past nine reads 9+; a very long name stays inside the sidebar', async ({ page, db }) => {
  await allRead(db);
  await nothingToDo(db, 'u_ana');
  const signInAna = async () => {
    await page.context().clearCookies();
    await page.goto('/sign-in');
    await page.locator('input[name=email]').fill(USERS.ana);
    await page.locator('input[name=password]').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/parent/home');
    await settle(page, '/parent/home');
  };
  await signInAna();
  const sidebar = sidebarOf(page);
  await expect(sidebar.getByRole('link', { name: /^Messages/ })).toBeVisible();
  await expect(counts(sidebar)).toHaveCount(0);

  const original = await db.user.findUniqueOrThrow({ where: { id: 'u_ana' } });
  const name = `Maximiliana${'wolfeschlegelsteinhausen'.repeat(3)} Mendoza`;
  await db.user.update({ where: { id: 'u_ana' }, data: { name, textSize: 'XLARGE' } });
  await db.notification.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ userId: 'u_ana', audience: 'PARENT' as const, type: 'MESSAGE', title: `Alert ${i}` })) });
  try {
    // A short laptop or tablet screen, signed in afresh so the session carries the new name.
    await page.setViewportSize({ width: 1024, height: 600 });
    await signInAna();

    const outer = (await sidebar.boundingBox())!;
    // 232px, scaled by the Largest text size.
    expect(outer.width).toBeLessThanOrEqual(232 * 1.25 + 1);
    const account = sidebar.getByRole('button', { name: /^Account/ });
    await expect(account).toBeInViewport({ ratio: 1 });
    await expect(account).toContainText('Parent');
    const a = (await account.boundingBox())!;
    expect(a.x + a.width).toBeLessThanOrEqual(outer.x + outer.width);
    const alerts = sidebar.getByRole('button', { name: /Alerts/ });
    await expect(alerts.getByText('9+', { exact: true })).toBeVisible();
    await expect(alerts).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await sidebar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  } finally {
    await db.user.update({ where: { id: 'u_ana' }, data: { name: original.name, textSize: original.textSize } });
  }
});

/** Visible text under 4.5:1 against what is painted behind it (any CSS color format, alpha composited). */
const faint = (root: Locator) =>
  root.evaluate((el) => {
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })!;
    const paint = (layers: string[]) => {
      for (const c of ['#fff', ...layers]) {
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bad: string[] = [];
    let seen = 0;
    for (const node of [el, ...el.querySelectorAll('*')]) {
      const text = [...node.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      const r = node.getBoundingClientRect();
      if (!text || r.width <= 1 || r.height <= 1 || node.closest('.sr-only, :disabled, [role=dialog]')) continue;
      const layers: string[] = [];
      for (let at: Element | null = node; at; at = at.parentElement) layers.unshift(getComputedStyle(at).backgroundColor);
      const back = paint(layers);
      const front = paint([...layers, getComputedStyle(node).color]);
      const ratio = (Math.max(back, front) + 0.05) / (Math.min(back, front) + 0.05);
      seen++;
      if (ratio < 4.5) bad.push(`"${text}" ${ratio.toFixed(2)}`);
    }
    return { seen, bad };
  });

test('the page headers and the sidebar are readable in light and dark, on Vienne’s and a parent’s screens', async ({ browser, db }) => {
  test.setTimeout(420_000);
  const draft = await db.progressReport.findFirst({ where: { status: 'DRAFT' } });
  const book = await db.assignment.findFirstOrThrow({ where: { kind: 'BOOK' } });
  const screens = {
    vienne: ['/admin/today', '/admin/families', '/admin/families/u_grace', '/admin/assignments', `/admin/assignments/${book.id}`, '/admin/content', '/admin/schedule', '/admin/messages', '/admin/settings', ...(draft ? [`/admin/reports/${draft.id}`] : [])],
    ana: ['/parent/home', '/parent/learning', '/parent/sessions','/parent/progress', '/parent/messages'],
  };

  for (const who of ['vienne', 'ana'] as const) {
    const s = await openAs(browser, who);
    for (const theme of ['light', 'dark']) {
      await settle(s.page, screens[who][0]);
      const panel = await openAccount(s.page);
      await panel.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
      await s.page.keyboard.press('Escape');
      for (const url of screens[who]) {
        await settle(s.page, url);
        await expect.poll(() => s.page.locator('html').evaluate((el) => el.classList.contains('dark')), { message: url }).toBe(theme === 'dark');
        // Let color transitions finish before reading them.
        await s.page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => null))));
        const header = main(s.page).locator('header', { has: s.page.getByRole('heading', { level: 1 }) });
        for (const [part, root] of [['header', header], ['sidebar', sidebarOf(s.page)]] as const) {
          const result = await faint(root);
          expect(result.seen, `${theme} ${url} ${part}`).toBeGreaterThan(0);
          expect.soft(result.bad, `${who} ${theme} ${url} ${part}`).toEqual([]);
        }
      }
    }
    expect(s.errors).toEqual([]);
    await s.close();
  }
});
