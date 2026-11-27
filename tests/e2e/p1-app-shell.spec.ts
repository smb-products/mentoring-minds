import type { Locator, Page } from '@playwright/test';
import type { e2eDb } from './support/db';
import { expect, freshData, test, USERS, type Who } from './support/fixtures';
import { main, openAccount } from './support/ui';

/**
 * P1 (docs/DESIGN.md → App polish, docs/design/app-today.html): the app shell on the light page. A white
 * sidebar with a right border, the selected item soft blue with blue text, round counts after the label, the
 * Account control showing the person, no navy band behind the page title (28px, 700), white stat cards with a
 * tinted icon square, and the landing page's blue (#1F5EFF) on primary buttons. On a phone the bottom nav is
 * light too and nothing scrolls sideways. The fixture fails any test that logs a console error.
 */
freshData();

const WHITE = 'rgb(255, 255, 255)';
const BLUE = 'rgb(31, 94, 255)'; // #1F5EFF, --mm-brand-600
const SOFT_BLUE = 'rgb(238, 243, 255)'; // #EEF3FF, --mm-brand-50

/** Navy classes inside the shell's own parts: the sidebar, the phone nav and the page header. */
const SHELL_NAVY = ':is(aside, nav, header):is(.bg-ink, .text-ink-foreground, .band), :is(aside, nav, header) :is(.bg-ink, .text-ink-foreground, .band)';

const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

async function settle(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[aria-busy="true"]'), `${url} never finished loading`).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await expect(main(page).getByRole('heading', { level: 1 })).toBeVisible();
}

/** Every background from the h1 up to <html>: none of them is dark (no navy band behind the title). */
async function darkBehindTitle(page: Page) {
  return main(page).getByRole('heading', { level: 1 }).evaluate((h1) => {
    const dark: string[] = [];
    for (let el: Element | null = h1; el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      if (!m || (m[4] !== undefined && Number(m[4]) === 0)) continue;
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if (0.2126 * r + 0.7152 * g + 0.0722 * b < 128) dark.push(`${el.tagName.toLowerCase()}.${el.className}: ${bg}`);
    }
    return dark;
  });
}

/** An unread message from the other side, so the Messages link shows a count. */
async function unreadMessage(db: ReturnType<typeof e2eDb>, from: 'u_ana' | 'u_admin') {
  const conv = await db.conversation.findUniqueOrThrow({ where: { parentId: 'u_ana' } });
  await db.message.create({ data: { conversationId: conv.id, senderId: from, body: 'P1 shell check: see you Thursday.' } });
  await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } });
}

const people: { who: Who; from: 'u_ana' | 'u_admin'; url: string; selected: string; name: string; role: string; primary: string }[] = [
  { who: 'vienne', from: 'u_ana', url: '/admin/families', selected: 'Families', name: 'Vienne Elliott', role: 'Admin', primary: 'Invite family' },
  { who: 'ana', from: 'u_admin', url: '/parent/home', selected: 'Home', name: 'Ana Mendoza', role: 'Parent', primary: 'Request a session' },
];

for (const p of people) {
  test(`${p.who} at 1280×800: white sidebar, soft blue selection, counts after the label, the Account control, no navy band, white stat cards, the landing blue`, async ({ page, as, db }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await unreadMessage(db, p.from);
    // Normal text size, so computed sizes are the tokens' own (the demo has some people on Large).
    await db.user.updateMany({ where: { email: USERS[p.who] }, data: { textSize: 'NORMAL' } });
    await as(p.who);
    await settle(page, p.url);

    // The sidebar: white, a 1px right border, about 232px wide.
    const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
    await expect(sidebar).toBeVisible();
    expect(await css(sidebar, 'background-color')).toBe(WHITE);
    expect(await css(sidebar, 'border-right-width')).toBe('1px');
    expect(await css(sidebar, 'border-right-style')).toBe('solid');
    const width = (await sidebar.boundingBox())!.width;
    expect(width).toBeGreaterThanOrEqual(220);
    expect(width).toBeLessThanOrEqual(244);
    await expect(sidebar.getByRole('link', { name: 'Mentoring Minds home' })).toHaveText('Mentoring Minds');

    // The selected item: soft blue with blue text, icon and label in one row.
    const selected = sidebar.locator('a[aria-current="page"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(p.selected);
    expect(await css(selected, 'background-color')).toBe(SOFT_BLUE);
    expect(await css(selected, 'color')).toBe(BLUE);
    const icon = selected.locator('svg').first();
    expect(await icon.getAttribute('width')).toBe('18');
    expect(await icon.getAttribute('stroke-width')).toBe('1.75');
    const iconBox = (await icon.boundingBox())!;
    const labelBox = (await selected.getByText(p.selected, { exact: true }).boundingBox())!;
    expect(labelBox.x).toBeGreaterThan(iconBox.x + iconBox.width - 1);
    expect(Math.abs(labelBox.y + labelBox.height / 2 - (iconBox.y + iconBox.height / 2))).toBeLessThanOrEqual(3);

    // The count is a small round solid-blue badge after its label, and the link's name still starts with it.
    const messages = sidebar.getByRole('link', { name: /^Messages/ });
    const count = messages.getByText(/^(\d+|9\+)$/);
    await expect(count).toBeVisible();
    expect(await css(count, 'background-color')).toBe(BLUE);
    expect(parseFloat(await css(count, 'border-top-left-radius'))).toBeGreaterThanOrEqual(9);
    const label = (await messages.getByText('Messages', { exact: true }).boundingBox())!;
    expect((await count.boundingBox())!.x).toBeGreaterThan(label.x + label.width);

    // The Account control: its name starts with "Account", and it shows the initials, the name and the role.
    const account = sidebar.getByRole('button', { name: /^Account/ });
    await expect(account).toBeVisible();
    await expect(account).toContainText(p.name);
    await expect(account).toContainText(p.role);
    await expect(account).toContainText(p.name.split(' ').map((w) => w[0]).join(''));
    await expect(openAccount(page)).resolves.toBeTruthy();
    await page.keyboard.press('Escape');

    // No navy band: nothing dark behind the title, which is 28px and 700.
    expect(await darkBehindTitle(page)).toEqual([]);
    const h1 = main(page).getByRole('heading', { level: 1 });
    expect(await css(h1, 'font-size')).toBe('28px');
    expect(await css(h1, 'font-weight')).toBe('700');
    // Nothing in the shell (sidebar, page header) is navy. Screens' own avatars are P2's.
    await expect(page.locator(SHELL_NAVY)).toHaveCount(0);

    // The first stat card: white, a 1px border, 16px corners, with a 40px soft blue icon square.
    const card = main(page).getByRole('region', { name: 'Key numbers' }).locator(':scope > *').first();
    expect(await css(card, 'background-color')).toBe(WHITE);
    expect(await css(card, 'border-top-width')).toBe('1px');
    expect(await css(card, 'border-top-left-radius')).toBe('16px');
    const square = card.locator('[data-figure-icon]');
    const box = (await square.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([40, 40]);
    expect(await css(square, 'background-color')).toBe(SOFT_BLUE);

    // Primary buttons are the landing page's blue, with 10px corners.
    const primary = page.locator('header', { has: page.getByRole('heading', { level: 1 }) }).getByRole('button', { name: p.primary });
    expect(await css(primary, 'background-color')).toBe(BLUE);
    expect(await css(primary, 'border-top-left-radius')).toBe('10px');
  });
}

test('dark mode keeps working: the sidebar and page turn dark, and the title stays 700', async ({ page, as }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await as('vienne');
  await settle(page, '/admin/today');
  const panel = await openAccount(page);
  await panel.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.keyboard.press('Escape');
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
  expect(await css(sidebar, 'background-color')).not.toBe(WHITE);
  const h1 = main(page).getByRole('heading', { level: 1 });
  expect(await css(h1, 'font-weight')).toBe('700');
  // Light text on the dark page.
  const color = (await css(h1, 'color')).match(/\d+/g)!.map(Number);
  expect(0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]).toBeGreaterThan(200);
  // The selected item keeps a readable blue on its soft fill.
  const selected = sidebar.locator('a[aria-current="page"]');
  expect(await css(selected, 'background-color')).not.toBe(SOFT_BLUE);
  expect(await css(selected, 'color')).not.toBe(BLUE);
});

test('phone: the bottom nav is light, the selected tab soft blue, no navy anywhere, and nothing scrolls sideways @phone', async ({ page, as }) => {
  // The phone project's own size (Pixel 7), in both projects.
  await page.setViewportSize({ width: 412, height: 839 });
  await as('ana');
  for (const url of ['/parent/home', '/parent/messages']) {
    await settle(page, url);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav).toBeVisible();
    expect(await css(nav, 'background-color')).toBe(WHITE);
    expect(await css(nav, 'border-top-width')).toBe('1px');
    const tab = nav.locator('a[aria-current="page"]');
    await expect(tab).toHaveCount(1);
    expect(await css(tab.locator('span').first(), 'background-color')).toBe(SOFT_BLUE);
    expect(await css(tab.locator('span').first(), 'color')).toBe(BLUE);
    expect(await darkBehindTitle(page)).toEqual([]);
    await expect(page.locator(SHELL_NAVY)).toHaveCount(0);
    const widths = await page.evaluate(() => {
      const h1 = document.querySelector('main h1');
      let scroller = h1?.parentElement ?? null;
      while (scroller && getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement;
      return [document.documentElement, document.body, scroller].filter(Boolean).map((el) => ({ scroll: el!.scrollWidth, client: el!.clientWidth }));
    });
    for (const w of widths) expect(w.scroll, `${url} scrolls sideways`).toBeLessThanOrEqual(w.client);
  }
});
