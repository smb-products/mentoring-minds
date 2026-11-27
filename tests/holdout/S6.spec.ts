/**
 * S6 holdouts: with the demo switch gone, nothing left of it opens a screen or picks who you are. Signed out,
 * every route (deep links, made-up ids, data requests) answers with sign-in and no family data; signed in,
 * what an old demo browser saved changes nothing, and the account menu offers no other person.
 */
import { USERS, expect, freshData, test, type Who } from '../e2e/support/fixtures';
import { main, openAccount } from '../e2e/support/ui';

freshData();

const FAMILY = /Mateo|Lucia|Noah|Sofia|Jordan|ana\.mendoza|grace\.kim|Coral Terrace|Kendale Park|Gets anxious|soccer stats/;

test('signed out: every route, deep links and data requests included, goes to sign-in with nothing about a family', async ({ page, request, db }) => {
  const submission = await db.submission.findFirstOrThrow({ where: { student: { parentId: 'u_ana' } } });
  // '/' is the public landing page since L1 (tests/e2e/l1-landing.spec.ts). Lead edit, CHANGES.md 2026-11-27.
  const paths = [
    '/admin', '/parent', '/admin/does-not-exist', '/parent/does-not-exist',
    ...['today', 'families', 'families/u_ana', 'families/u_grace', 'schedule', 'settings', 'content', 'content/fa_fraction_strips',
      'content/book/made-up/1', 'assignments', 'assignments/new', 'assignments/made-up', 'messages', 'messages/conv_ana', 'reports/made-up'].map((p) => `/admin/${p}`),
    ...['home', 'sessions', 'learning', `learning/${submission.id}`, 'learning/made-up', 'messages', 'progress'].map((p) => `/parent/${p}`),
  ];
  const variants: Record<string, string>[] = [
    {},
    { RSC: '1' },
    { RSC: '1', 'Next-Router-Prefetch': '1' },
    { cookie: 'authjs.session-token=made-up; mm.demo.parent=u_ana' },
  ];
  for (const path of paths) {
    for (const headers of variants) {
      const label = `${path} ${JSON.stringify(headers)}`;
      const res = await request.get(path, { headers, maxRedirects: 0 });
      expect([302, 303, 307, 308], label).toContain(res.status());
      expect(new URL(res.headers()['location'], 'http://x').pathname, label).toBe('/sign-in');
      expect(await res.text(), label).not.toMatch(FAMILY);
    }
  }
  await page.goto('/parent/home');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(FAMILY);
});

test('an old demo browser that had picked Grace: Ana still gets only Ana, and keeps her saved dark theme', async ({ page, as }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mm.demo.parent', JSON.stringify('u_grace'));
    localStorage.setItem('mm.demo.theme', JSON.stringify('dark'));
  });
  await as('ana');
  await page.goto('/parent/home');
  await expect(main(page)).toContainText('Mateo');
  await expect(page.locator('body')).not.toContainText(/Noah|Grace/);
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const panel = await openAccount(page);
  await expect(panel).toContainText(USERS.ana);
  await panel.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
});

const OWN: Record<'vienne' | 'ana' | 'tom', { home: string; others: RegExp }> = {
  vienne: { home: '/admin/today', others: /Demo account|Switch (account|user)|View as/i },
  ana: { home: '/parent/home', others: /Demo account|Switch (account|user)|View as|Vienne|Grace|Monique/i },
  tom: { home: '/parent/home', others: /Demo account|Switch (account|user)|View as|Vienne|Grace|Monique|Ana\b/i },
};

for (const who of Object.keys(OWN) as (keyof typeof OWN & Who)[]) {
  test(`${who}: the account menu is theme, text size and sign out, with nobody to switch to; signing out locks the app`, async ({ page, as }) => {
    await as(who);
    await page.goto(OWN[who].home);
    const panel = await openAccount(page);
    await expect(panel).toContainText(USERS[who]);
    await expect(panel.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio')).toHaveCount(2);
    await expect(panel.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio')).toHaveCount(3);
    await expect(panel.getByRole('radiogroup')).toHaveCount(2);
    await expect(panel).not.toContainText(OWN[who].others);
    await panel.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/sign-in');
    // '/' is the public landing page since L1 (tests/e2e/l1-landing.spec.ts). Lead edit, CHANGES.md 2026-11-27.
    for (const path of [OWN[who].home]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/sign-in$/);
    }
    await expect(page.locator('body')).not.toContainText(FAMILY);
  });
}
