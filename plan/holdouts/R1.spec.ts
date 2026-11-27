import type { Page } from '@playwright/test';
import { expect, openAs, requires, test, type Who } from '../../tests/e2e/support/fixtures';

/**
 * R1 holdout: what the restyle looks like in a real browser, and what each person's shell shows.
 * Parked: the phone test fails (the other two pass). In tests/holdout/, the import above is '../e2e/support/fixtures'.
 */
requires('families', 'messages');

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 } };

/** Computed sizes of every field a person can type or pick in, and of the page title. */
async function sizes(page: Page) {
  return page.evaluate(() => {
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const fields = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ field: el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.getAttribute('name') ?? el.tagName, px: px(el) }));
    const h1 = document.querySelector('h1');
    return { fields, title: h1 ? px(h1) : null, font: getComputedStyle(document.body).fontFamily };
  });
}

for (const [device, options, input, title] of [['phone', PHONE, 16, 22], ['desktop', DESKTOP, 14, 24]] as const) {
  test(`${device}: fields are ${input}px, page titles ${title}px, in Inter`, async ({ browser }) => {
    const wrong: string[] = [];
    // [who, page, the field that has to be there]
    const visits: [Who, string, string][] = [
      ['tom', '/parent/home', 'input[aria-label="Invite code"]'],
      ['ana', '/parent/messages', 'textarea'],
      ['vienne', '/admin/settings', 'input, select'],
    ];
    for (const [who, path, field] of visits) {
      const s = await openAs(browser, who, options);
      await s.page.goto(path);
      await expect(s.page.locator(field).first()).toBeVisible();
      await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
      await s.page.evaluate(() => document.fonts.ready);
      const got = await sizes(s.page);
      expect(got.fields.length, `${who} ${path} has fields`).toBeGreaterThan(0);
      for (const f of got.fields) if (f.px !== input) wrong.push(`${path} field "${f.field}" is ${f.px}px, want ${input}px`);
      if (got.title !== title) wrong.push(`${path} title is ${got.title}px, want ${title}px`);
      if (!/^"?Inter Variable/.test(got.font)) wrong.push(`${path} font is ${got.font}`);
      if (!(await s.page.evaluate(() => [...document.fonts].some((f) => /Inter/.test(f.family) && f.status === 'loaded')))) wrong.push(`${path} never loaded Inter`);
      expect(s.errors).toEqual([]);
      await s.close();
    }
    expect(wrong).toEqual([]);
  });
}

test('each parent\'s shell shows the wordmark and only their own family; signed out gets only sign-in', async ({ page, browser }) => {
  const families: [Who, RegExp][] = [
    ['ana', /Noah|Grace Kim|Sofia|Jordan/],
    ['grace', /Mateo|Lucia|Ana Mendoza|Sofia|Jordan/],
    ['tom', /Mateo|Lucia|Noah|Sofia|Jordan|Ana Mendoza|Grace Kim/],
  ];
  for (const [who, others] of families) {
    for (const [device, options] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
      const s = await openAs(browser, who, options);
      await s.page.goto('/parent/home');
      await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
      await s.page.waitForLoadState('networkidle');
      await expect(s.page.getByLabel('Main navigation', { exact: true }), `${who} ${device}`).toBeVisible();
      await expect(s.page.getByText('Mentoring Minds', { exact: true }).filter({ visible: true }).first(), `${who} ${device}`).toBeVisible();
      await expect(s.page.locator('img[src*="logo-"]'), `${who} ${device}: no logo in the app`).toHaveCount(0);
      const text = await s.page.locator('body').innerText();
      expect(text, `${who} ${device}`).not.toMatch(others);
      expect(s.errors).toEqual([]);
      await s.close();
    }
  }

  await page.goto('/parent/home');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByLabel('Main navigation', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/Mateo|Lucia|Noah|Sofia|Jordan|Ana Mendoza|Grace Kim/);
});
