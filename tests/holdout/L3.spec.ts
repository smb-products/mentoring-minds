/**
 * L3 holdouts: the polished landing page on the smallest phones and in a visitor's hands. Nothing runs off a
 * 320px screen, the header's Sign in doesn't sit on the name, every hero control works, and the page still
 * shows no family's details.
 */
import type { Locator } from '@playwright/test';
import { expect, freshData, test } from '../e2e/support/fixtures';

freshData();

// Landing C (L4) replaced L3's hero and subhead. Lead edit, CHANGES.md 2026-11-27.
const HERO = 'Math tutoring that builds real confidence';
const box = async (l: Locator) => (await l.boundingBox())!;

test('on a 320px phone: nothing sideways, hero, header and rates all fit, and Sign in clears the name', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(HERO);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  const header = page.locator('header').first();
  const signIn = header.getByRole('link', { name: 'Sign in', exact: true });
  const home = header.getByRole('link', { name: /Mentoring Minds/ });
  const [s, n] = [await box(signIn), await box(home)];
  expect(s.x).toBeGreaterThanOrEqual(n.x + n.width);
  expect(s.x + s.width).toBeLessThanOrEqual(320);

  const parts = [h1, page.getByText('One-on-one and small-group sessions with Vienne Elliott, with F.A.S.T. test prep for Florida students.', { exact: true }), page.locator('[data-rates-panel]')];
  for (const part of parts) {
    const b = await box(part);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
    expect(await part.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }

  // Landing C: the hero's call to action is 'Request an invite', and it lands on the form of that name (lead edit).
  await page.locator('main').getByRole('link', { name: 'Request an invite' }).first().click();
  await expect(page.getByRole('form', { name: 'Request an invite' })).toBeInViewport();
  await signIn.click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('with made-up query and cookie values the polished page carries no family or private detail', async ({ request }) => {
  const res = await request.get('/?parent=u_grace&studentId=s_noah', { headers: { cookie: 'authjs.session-token=made-up' } });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('Vienne Elliott');
  expect(body).not.toMatch(/Mateo|Lucia|Noah|Sofia|Mendoza|Grace Kim|@example\.com|adminNotes|meetingUrl|mailto:|tel:/);
});
