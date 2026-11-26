/**
 * S24 holdouts: a shared phone that gets alerts (so signing out also removes them), a PREVIEW parent, and
 * screens one level down. Reads still on their way answer with a server error, or slowly after the tap.
 * The `test` fixture fails on any console error.
 */
import type { Page, Route } from '@playwright/test';
import { USERS, expect, freshData, test, type Who } from '../e2e/support/fixtures';
import { openAccount } from '../e2e/support/ui';

freshData();

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/s24-holdout';

/** This browser already has alerts turned on. */
const withAlerts = (page: Page) =>
  page.addInitScript((endpoint) => {
    const sub = { endpoint, unsubscribe: async () => (sessionStorage.setItem('s24.unsubscribed', 'yes'), true) };
    const reg = { pushManager: { getSubscription: async () => sub } };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), addEventListener() {}, removeEventListener() {} },
    });
  }, ENDPOINT);

const isAction = (route: Route) => route.request().method() === 'POST' && !!route.request().headers()['next-action'];

const CASES: { who: Who; path: string; phone?: boolean }[] = [
  { who: 'vienne', path: '/admin/families/u_ana' },
  { who: 'vienne', path: '/admin/messages/conv_ana' },
  { who: 'ana', path: '/parent/messages', phone: true },
  { who: 'tom', path: '/parent/home' },
];

for (const { who, path, phone } of CASES) {
  for (const answer of ['a server error', 'slow answers, one at a time'] as const) {
    test(`${who} signs out of ${path} with alerts on; the screen's reads answer with ${answer}`, async ({ page, as, db }) => {
      if (phone) await page.setViewportSize({ width: 390, height: 844 });
      await withAlerts(page);
      await as(who);
      const userId = (await db.user.findUniqueOrThrow({ where: { email: USERS[who] } })).id;
      await db.pushSubscription.deleteMany({ where: { endpoint: ENDPOINT } });
      await db.pushSubscription.create({ data: { userId, endpoint: ENDPOINT, p256dh: 'p', auth: 'a' } });

      const held: Route[] = [];
      let holding = true;
      await page.route('**/*', async (route) => {
        if (holding && isAction(route)) held.push(route);
        else await route.fallback();
      });
      await page.goto(path);
      await expect.poll(() => held.length, { message: 'reads are on their way' }).toBeGreaterThan(0);
      const panel = await openAccount(page);
      holding = false;
      const release = () =>
        Promise.all(
          held.splice(0).map((r) =>
            (answer === 'a server error' ? r.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' }) : r.continue()).catch(() => {}),
          ),
        );
      await panel.getByRole('button', { name: 'Sign out' }).click();
      if (answer === 'a server error') await release();
      else {
        for (const r of held.splice(0)) {
          await page.waitForTimeout(700);
          await r.continue().catch(() => {});
        }
      }
      await page.waitForURL('**/sign-in');
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
      await page.waitForTimeout(1000); // anything a late answer would show or log has had time to
      await expect(page.getByText(/This page couldn’t load|couldn’t reach the server|Please sign in\.|Something went wrong/)).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem('s24.unsubscribed'))).toBe('yes');
      expect(await db.pushSubscription.count({ where: { endpoint: ENDPOINT } }), 'this phone stops getting their alerts').toBe(0);
      await page.goto(path);
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  }
}
