import { expect, freshData, test } from './support/fixtures';

/**
 * J3: open sign-up on the landing page, signed out, on a production build. The three steps start with creating an
 * account, both Get started links go to /sign-in?mode=new (Create account mode once J2 is in), and the dark panel's
 * form is "Questions? Message Vienne": L2's form under a new name, still sending through requestInvite.
 */
freshData();

const SIGN_UP = '/sign-in?mode=new';
const THANKS = 'Thanks. Vienne will email you soon.';
const STEPS: [string, string][] = [
  ['Create your account', 'Sign up with your email or Google.'],
  ['Add your child', 'Their first name and grade.'],
  ['Book your first session', 'Pick a time, and Vienne confirms it.'],
];

test('Getting started takes three steps: create your account, add your child, book your first session', async ({ page }) => {
  await page.goto('/');
  const steps = page.getByRole('region', { name: 'Getting started takes three steps' }).getByRole('listitem');
  await expect(steps).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(steps.nth(i).locator('[data-step-number]')).toHaveText(String(i + 1));
    await expect(steps.nth(i).getByRole('heading', { level: 3 })).toHaveText(STEPS[i][0]);
    await expect(steps.nth(i).getByRole('paragraph')).toHaveText(STEPS[i][1]);
  }
});

test('the header’s and the hero’s Get started open sign-up, and See rates stays', async ({ page }) => {
  await page.goto('/');
  const headerLink = page.locator('header').first().getByRole('navigation').getByRole('link', { name: 'Get started' });
  const hero = page.locator('main section').first();
  const heroLink = hero.getByRole('link', { name: 'Get started' });
  await expect(headerLink).toHaveAttribute('href', SIGN_UP);
  await expect(heroLink).toHaveAttribute('href', SIGN_UP);
  await expect(hero.getByRole('link', { name: 'Request an invite' })).toHaveCount(0);
  await expect(hero.getByRole('link', { name: '$50 per hour · See rates' })).toHaveAttribute('href', '#rates');

  for (const link of [headerLink, heroLink]) {
    await page.goto('/');
    await link.click();
    await expect(page).toHaveURL(/\/sign-in\?mode=new$/);
    // Create account mode once J2 is in; until then the sign-in page itself.
    await expect(page.getByRole('button', { name: /^(Sign in|Create account)$/ }).first()).toBeVisible();
  }
});

test('the dark panel is “Questions? Message Vienne”: it sends, says thanks, and Ready to start opens sign-up', async ({ page, db }) => {
  await page.goto('/#request-invite');
  const panel = page.locator('section#request-invite');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Questions? Message Vienne');
  await expect(panel).toContainText('Ready to start? Create your account');
  await expect(panel).not.toContainText('Have a code?');
  await expect(panel.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', SIGN_UP);
  await expect(page.getByRole('form', { name: 'Request an invite' })).toHaveCount(0);

  const form = panel.getByRole('form', { name: 'Questions? Message Vienne' });
  await expect(form.locator('input[name=website]')).toHaveAttribute('tabindex', '-1');
  await form.getByLabel('Parent name').fill('Nadia Brooks');
  await form.getByLabel('Email').fill('nadia.brooks@example.com');
  await form.getByLabel('Phone (optional)').fill('305 555 0177');
  await form.getByLabel(/Child.s grade \(K–6\)/).selectOption({ label: 'Grade 4' });
  await form.getByLabel('Message').fill('Do you have Saturday times?');
  await form.getByRole('button', { name: 'Send message' }).click();
  await expect(panel.getByRole('status')).toHaveText(THANKS);
  await expect(form).toHaveCount(0);
  await expect.poll(() => db.inviteRequest.count({ where: { email: 'nadia.brooks@example.com' } })).toBe(1);

  await panel.getByRole('link', { name: 'Create your account' }).click();
  await expect(page).toHaveURL(/\/sign-in\?mode=new$/);
});

test('/privacy: signing up asks for names, emails, first names and grades, and the form is Questions? Message Vienne', async ({ page }) => {
  await page.goto('/privacy');
  const stores = page.getByRole('listitem');
  await expect(stores.filter({ hasText: /^Your account:/ })).toContainText(
    'signing up asks for your name and email, and your children’s first names and grades',
  );
  await expect(stores.filter({ hasText: 'Questions? Message Vienne' })).toContainText('deleted after 90 days');
  await expect(page.locator('main')).not.toContainText('when you ask for an invite');
});
